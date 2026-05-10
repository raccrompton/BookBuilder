# Add Lichess OAuth Authentication

## Context
The Lichess opening explorer API (`explorer.lichess.org/lichess`) now requires authentication. Previously it was a free, unauthenticated API. BookBuilder makes unauthenticated requests and now gets HTTP 401 after exhausting 3 retries, making repertoire generation completely broken (GitHub issue #29).

The fix is to add a "Login with Lichess" OAuth 2.0 PKCE flow (no client secret needed — Lichess supports PKCE for SPAs with no app registration), store the token with expiry, and attach it as a `Bearer` header on all opening explorer requests. No OAuth scope is required — the explorer endpoint only needs a valid authenticated token.

## Files to Modify

| File | Change |
|------|--------|
| `/client/src/api/LichessClient.js` | Accept `accessToken` config param; add `Authorization` header; handle 401 by signalling re-auth |
| `/client/src/ui/FormController.js` lines 504, 552 | Create one authenticated `LichessClient` and pass it into `BookBuilder` via config |
| `/client/src/BookBuilder.js` line 144 | Accept `config.lichessClient` if provided, else create own |
| `/client/app.html` | Add login button UI; update CSP; call `LichessAuth.handleCallback()` before `FormController` init |
| **New** `/client/src/auth/LichessAuth.js` | Full PKCE + state OAuth module |
| `/client/tests/e2e/form-orchestration.e2e.test.js` | Update all `explorer.lichess.ovh` route mocks → `explorer.lichess.org` |
| `/client/tests/e2e/real-engine-smoke.e2e.test.js` | Same route mock update |

## Implementation Plan

### 1. New file: `/client/src/auth/LichessAuth.js`

Handles the complete PKCE + state flow:

```js
// PKCE
generateCodeVerifier()           // 64-char random string
generateCodeChallenge(verifier)  // BASE64URL(SHA256(verifier)) via Web Crypto API

// CSRF
generateState()                  // 32-char random string

buildAuthUrl()
// https://lichess.org/oauth?client_id=<hostname>&redirect_uri=<current origin>&
//   response_type=code&code_challenge_method=S256&code_challenge=<challenge>&state=<state>
// Stores verifier + state in sessionStorage before redirect
// client_id = window.location.hostname (e.g. "openingbuilder.com" or "localhost")

handleCallback()
// On page load: reads ?code= and ?state= from URL
// 1. Verify state matches sessionStorage value — throw on mismatch
// 2. Handle ?error=access_denied (user declined) gracefully
// 3. Exchange code → POST https://lichess.org/api/token (application/x-www-form-urlencoded)
//    Body: grant_type=authorization_code, code, code_verifier, redirect_uri, client_id
// 4. Store { token, expiresAt: Date.now() + expires_in * 1000 } in localStorage
// 5. Clear ?code&state from URL (replaceState)

getStoredToken()
// Returns token string if exists and not expired; null otherwise
// Clears localStorage entry if expired (forces re-login)

clearToken()   // Removes from localStorage

isLoggedIn()   // Returns boolean
```

Storage keys: `'lichess-auth'` (JSON object with `token` + `expiresAt`).

### 2. Update `/client/src/api/LichessClient.js`
- **Constructor**: add `this.accessToken = config.accessToken || null`
- **Fetch headers** (line ~302): add `...(this.accessToken && { 'Authorization': \`Bearer ${this.accessToken}\` })`
- **baseUrl default** (line 82): change `.ovh` → `.org`
- **401 handling** (after 429 block): on HTTP 401, call `LichessAuth.clearToken()` and throw a recognizable error so `FormController` can prompt re-login

### 3. Update `/client/src/ui/FormController.js`

**`initializeComponents()`** (line ~504) — create one authenticated client:
```js
import LichessAuth from '../auth/LichessAuth.js';

const accessToken = LichessAuth.getStoredToken();
this.lichessClient = new LichessClient({
  maxRetries: 3, retryDelay: 1000, timeout: 10000, accessToken
});
config.lichessClient = this.lichessClient;  // pass to BookBuilder
```

**`validateConnections()`** (line ~552) — already uses `this.lichessClient`, no extra change needed once the above is done.

### 4. Update `/client/src/BookBuilder.js` (line 144)
```js
this.lichessClient = config.lichessClient || new LichessClient({
  accessToken: config.lichessAccessToken
});
```

### 5. Update `/client/app.html`

**CSP** (lines 6-14):
- `connect-src`: add `https://lichess.org https://explorer.lichess.org`; replace `.ovh` with `.org`

**On `DOMContentLoaded`** (before `FormController` init):
```js
import LichessAuth from './src/auth/LichessAuth.js';
await LichessAuth.handleCallback(); // handles OAuth return silently; no-op if no ?code=
```

**Login button** (above the generate form):
- `type="button"` (must not submit form)
- Onclick: `window.location.href = LichessAuth.buildAuthUrl()`
- Show/hide based on `LichessAuth.isLoggedIn()`
- Show "Logged in ✓" state with a "Log out" link once authenticated

### 6. Update tests — replace `.ovh` with `.org`
Files: `form-orchestration.e2e.test.js`, `real-engine-smoke.e2e.test.js`
Pattern: `**/explorer.lichess.ovh/**` → `**/explorer.lichess.org/**`

### 7. TDD: Write failing tests first, then implement

**Step A — Add to `/client/tests/api-engine.test.js`** (will fail immediately, `LichessClient` doesn't support `accessToken` yet):

```js
describe('LichessClient Authorization', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ white:1,draws:0,black:0,moves:[{san:'e4',uci:'e2e4',white:1,draws:0,black:0}] })
    });
  });
  afterEach(() => fetchMock.mockRestore());

  test('includes Authorization header when accessToken provided', async () => {
    const client = new LichessClient({ accessToken: 'test-token-123', retryDelay: 0 });
    await client.getPositionStats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer test-token-123');
  });

  test('omits Authorization header when no token', async () => {
    const client = new LichessClient({ retryDelay: 0 });
    await client.getPositionStats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });

  test('throws recognizable error on 401', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const client = new LichessClient({ accessToken: 'bad-token', maxRetries: 1, retryDelay: 0 });
    await expect(
      client.getPositionStats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    ).rejects.toThrow(/401/);
  });
});
```

**Step B — New file `/client/tests/auth.test.js`** (will fail because `LichessAuth` doesn't exist yet):

```js
import LichessAuth from '../src/auth/LichessAuth.js';

describe('LichessAuth', () => {
  beforeEach(() => localStorage.clear());

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
    // Simulate URL with wrong state
    delete window.location;
    window.location = { search: '?code=abc&state=wrong-state', href: '' };
    await expect(LichessAuth.handleCallback()).rejects.toThrow(/state mismatch/i);
  });

  test('isLoggedIn returns false when no valid token', () => {
    expect(LichessAuth.isLoggedIn()).toBe(false);
  });
});
```

Run `npm test` — these will fail red. Implement. Run again — they should be green.

## OAuth Flow Summary
1. User clicks "Login with Lichess" → `buildAuthUrl()` stores verifier+state, redirects to lichess.org
2. User authorizes → Lichess redirects back with `?code=xxx&state=yyy`
3. `handleCallback()` verifies state, exchanges code for token, stores `{ token, expiresAt }` in `localStorage`
4. All `LichessClient` requests include `Authorization: Bearer {token}`
5. On 401: token cleared, user prompted to log in again

## Verification
- Open app — "Login with Lichess" button visible
- Click, authorize on Lichess, redirected back — button shows logged-in state
- Generate a repertoire — network tab shows requests to `explorer.lichess.org` with `Authorization` header, no 401 errors
- Expire/clear the token — app prompts re-login rather than silently failing
- Run E2E tests — no `.ovh` failures
