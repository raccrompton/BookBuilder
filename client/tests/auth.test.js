import LichessAuth from '../src/auth/LichessAuth.js';

describe('LichessAuth', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    test('getStoredToken returns null when no token stored', () => {
        expect(LichessAuth.getStoredToken()).toBeNull();
    });

    test('getStoredToken returns null and clears storage for expired token', () => {
        localStorage.setItem('lichess-auth', JSON.stringify({
            token: 'old-token', expiresAt: Date.now() - 1000
        }));
        expect(LichessAuth.getStoredToken()).toBeNull();
        expect(localStorage.getItem('lichess-auth')).toBeNull();
    });

    test('getStoredToken returns token when valid', () => {
        localStorage.setItem('lichess-auth', JSON.stringify({
            token: 'valid-token', expiresAt: Date.now() + 1000000
        }));
        expect(LichessAuth.getStoredToken()).toBe('valid-token');
    });

    test('handleCallback throws on state mismatch', async () => {
        sessionStorage.setItem('lichess-oauth-state', 'expected-state');
        delete window.location;
        window.location = { search: '?code=abc&state=wrong-state', href: '', origin: 'http://localhost', pathname: '/', hash: '' };
        await expect(LichessAuth.handleCallback()).rejects.toThrow(/state mismatch/i);
    });

    test('isLoggedIn returns false when no valid token', () => {
        expect(LichessAuth.isLoggedIn()).toBe(false);
    });
});
