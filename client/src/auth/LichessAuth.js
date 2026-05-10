/**
 * LichessAuth.js - OAuth 2.0 PKCE flow for Lichess API authentication.
 *
 * Lichess's opening explorer now requires an authenticated bearer token.
 * Lichess supports PKCE for SPAs with no client registration/secret. The
 * explorer endpoint requires no scope, so we request an empty scope.
 *
 * Storage:
 *   - sessionStorage: pre-redirect verifier + state (cleared after callback)
 *   - localStorage 'lichess-auth': { token, expiresAt } (persists across reloads)
 */

const STORAGE_KEY = 'lichess-auth';
const STATE_KEY = 'lichess-oauth-state';
const VERIFIER_KEY = 'lichess-oauth-verifier';

const LICHESS_AUTH_URL = 'https://lichess.org/oauth';
const LICHESS_TOKEN_URL = 'https://lichess.org/api/token';

function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const out = new Array(length);
    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (cryptoObj && cryptoObj.getRandomValues) {
        const bytes = new Uint8Array(length);
        cryptoObj.getRandomValues(bytes);
        for (let i = 0; i < length; i++) out[i] = chars[bytes[i] % chars.length];
    } else {
        for (let i = 0; i < length; i++) out[i] = chars[Math.floor(Math.random() * chars.length)];
    }
    return out.join('');
}

function base64UrlEncode(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
    const data = new TextEncoder().encode(text);
    return await window.crypto.subtle.digest('SHA-256', data);
}

function getRedirectUri() {
    return window.location.origin + window.location.pathname;
}

const LichessAuth = {
    generateCodeVerifier() {
        return randomString(64);
    },

    async generateCodeChallenge(verifier) {
        const hash = await sha256(verifier);
        return base64UrlEncode(hash);
    },

    generateState() {
        return randomString(32);
    },

    async buildAuthUrl() {
        const verifier = this.generateCodeVerifier();
        const challenge = await this.generateCodeChallenge(verifier);
        const state = this.generateState();

        sessionStorage.setItem(VERIFIER_KEY, verifier);
        sessionStorage.setItem(STATE_KEY, state);

        const params = new URLSearchParams({
            client_id: window.location.hostname || 'openingbuilder',
            redirect_uri: getRedirectUri(),
            response_type: 'code',
            code_challenge_method: 'S256',
            code_challenge: challenge,
            state: state
        });
        return `${LICHESS_AUTH_URL}?${params}`;
    },

    async handleCallback() {
        const search = window.location.search || '';
        if (!search) return null;
        const params = new URLSearchParams(search);
        const error = params.get('error');
        const code = params.get('code');
        const state = params.get('state');

        if (error) {
            sessionStorage.removeItem(VERIFIER_KEY);
            sessionStorage.removeItem(STATE_KEY);
            this._cleanUrl();
            if (error === 'access_denied') return null;
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code || !state) return null;

        const expectedState = sessionStorage.getItem(STATE_KEY);
        if (!expectedState || state !== expectedState) {
            sessionStorage.removeItem(VERIFIER_KEY);
            sessionStorage.removeItem(STATE_KEY);
            throw new Error('OAuth state mismatch');
        }

        const verifier = sessionStorage.getItem(VERIFIER_KEY);
        if (!verifier) throw new Error('Missing PKCE verifier');

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            redirect_uri: getRedirectUri(),
            client_id: window.location.hostname || 'openingbuilder'
        });

        const response = await fetch(LICHESS_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: body.toString()
        });

        if (!response.ok) {
            sessionStorage.removeItem(VERIFIER_KEY);
            sessionStorage.removeItem(STATE_KEY);
            throw new Error(`Token exchange failed: HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.access_token) throw new Error('Token response missing access_token');

        const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 60 * 60 * 24 * 365;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            token: data.access_token,
            expiresAt: Date.now() + expiresIn * 1000
        }));

        sessionStorage.removeItem(VERIFIER_KEY);
        sessionStorage.removeItem(STATE_KEY);
        this._cleanUrl();
        return data.access_token;
    },

    getStoredToken() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed.token || !parsed.expiresAt || Date.now() >= parsed.expiresAt) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return parsed.token;
        } catch {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
    },

    clearToken() {
        localStorage.removeItem(STORAGE_KEY);
    },

    isLoggedIn() {
        return this.getStoredToken() !== null;
    },

    _cleanUrl() {
        if (typeof window.history === 'undefined' || !window.history.replaceState) return;
        const url = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, url);
    }
};

export default LichessAuth;
