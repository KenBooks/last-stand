// Signing in with Google, by redirect (server/saves/AGENTS.md, #503): the game asks for a sign-in, the service sends
// the page to Google with the OAuth code flow (the `openid` scope alone, PKCE, a `state` remembered here with the
// page's origin), Google sends it back to the service's callback, and the service sends it back to the page with a
// one-time code the page trades for a session. No Google script runs in the game, and only Google's id for the
// account (`sub`) is kept: no name, email or picture. Off while GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is unset.
import { createHash, randomBytes } from 'node:crypto';

/** how long a sign-in sent to Google may take to come back, and a landing code to be traded, ms */
export const PENDING_MS = 10 * 60_000;
export const LANDING_MS = 2 * 60_000;
/** what the issuer of a Google id token is called */
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
/** a path the page may ask to come back to: its own, never another host's (`//host`) */
const RETURN_PATH = /^\/(?!\/)[^\s#\\]{0,511}$/;

/** a `state` -> { origin, returnPath, purpose, accountId, nonce, verifier, until } */
const pending = new Map();
/** a landing code -> { accountId, origin, nonce, until } */
const landings = new Map();

/** Google's settings: on when the client's id and secret are both set. */
export function googleSettingsFrom(vars) {
  const clientId = vars.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = vars.GOOGLE_CLIENT_SECRET ?? '';
  return {
    on: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    /** where Google sends the player back: this service's callback, as the OAuth client lists it */
    redirectUri: vars.GOOGLE_REDIRECT_URI ?? 'https://ls.wellscoped.dev/saves/auth/google/callback',
    authUrl: vars.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: vars.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
  };
}

/** Whether `path` is one a page may ask to come back to (its own path and query). */
export const isReturnPath = (path) => typeof path === 'string' && RETURN_PATH.test(path);
/** Whether `nonce` is one a page may bind its sign-in with (random, kept in that tab's session storage). */
export const isNonce = (nonce) => typeof nonce === 'string' && /^[\w-]{16,128}$/.test(nonce);

const random = () => randomBytes(32).toString('base64url');
const challengeOf = (verifier) => createHash('sha256').update(verifier).digest('base64url');

/**
 * A sign-in sent to Google: the address to send the page to, its `state` remembered with what it's for
 * (`purpose`: 'signin', or 'link' to the signed-in `accountId`) and where the page comes back to.
 */
export function begin(google, { origin, returnPath, purpose, nonce, accountId = null }, now = Date.now()) {
  const state = random();
  const verifier = random();
  pending.set(state, { origin, returnPath, purpose, accountId, nonce, verifier, until: now + PENDING_MS });
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    scope: 'openid',
    state,
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${google.authUrl}?${query}`;
}

/** The sign-in a `state` Google sent back names, taken (good once), or null if it's unknown or expired. */
export function takePending(state, now = Date.now()) {
  const entry = pending.get(String(state ?? ''));
  if (!entry) return null;
  pending.delete(state);
  return entry.until > now ? entry : null;
}

/**
 * Google's id for the account behind `code`, traded at Google's token endpoint with the PKCE verifier and the client's
 * secret; null if Google refuses it or its id token isn't one for this client. The token comes straight from Google
 * over TLS, so its claims are checked and its signature needn't be (OpenID Connect Core 3.1.3.7).
 */
export async function subOf(google, code, verifier, now = Date.now()) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code ?? ''),
    redirect_uri: google.redirectUri,
    client_id: google.clientId,
    client_secret: google.clientSecret,
    code_verifier: verifier,
  });
  let tokens;
  try {
    const answer = await fetch(google.tokenUrl, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    if (!answer.ok) return null;
    tokens = await answer.json();
  } catch {
    return null;
  }
  const claims = claimsOf(tokens?.id_token);
  if (!claims || !ISSUERS.has(claims.iss) || claims.aud !== google.clientId) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
  return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
}

/** A JWT's claims, unchecked, or null if it isn't one. */
function claimsOf(token) {
  const payload = String(token ?? '').split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** A one-time code the page comes back with, traded at `/saves/auth/google/finish` from that page's origin alone,
 *  with the nonce the tab that began the sign-in kept: a code sent to someone else's browser (a link to a sign-in
 *  of the sender's, to sign that browser in to the sender's account) is refused there. */
export function landingCode(accountId, origin, nonce, now = Date.now()) {
  const code = random();
  landings.set(code, { accountId, origin, nonce, until: now + LANDING_MS });
  return code;
}

/** The landing a code names, taken (good once), if it's still good and traded from the page and tab it was made
 *  for. */
export function takeLanding(code, origin, nonce, now = Date.now()) {
  const entry = landings.get(String(code ?? ''));
  if (!entry || entry.origin !== origin || entry.nonce !== nonce) return null;
  landings.delete(code);
  return entry.until > now ? entry : null;
}

/** Drops what expired, and everything at a start. */
export function pruneGoogle(now = Date.now(), all = false) {
  for (const [key, { until }] of pending) if (all || until <= now) pending.delete(key);
  for (const [key, { until }] of landings) if (all || until <= now) landings.delete(key);
}
