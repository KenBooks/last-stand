// The saves service's calls (server/saves, cloud saves #504): passkeys through the browser's own prompt, the sign-in
// code, the account, and this site's save in parts. Its host is baked into the build, not a co-op `?server=` override;
// the session is a bearer token kept on this device (`cloud.ts`). Every call fails as a `CloudError`, its
// HTTP status 0 when the network didn't answer (offline: the game plays on and syncs later).
import { cloudServerHttp } from './cloudServer';

const SAVES_SERVER: string = import.meta.env.VITE_COOP_SERVER ?? 'wss://ls.wellscoped.dev';
const savesHost = (): string => cloudServerHttp(SAVES_SERVER,
  import.meta.env.DEV ? new URLSearchParams(location.search).get('server') : null);

export class CloudError extends Error {
  constructor(readonly status: number, message: string, readonly body: unknown = null) { super(message); }
}

/** What the service shows of an account. */
export interface CloudAccount {
  id: string;
  created: number;
  passkeys: { id: string; rpId: string; created: number; used: number }[];
  google: boolean;
  /** This session's actual authentication, independent of the account's linked methods. */
  session?: { via: 'google' | 'passkey' | 'code'; email?: string };
  sites: { site: string; updated: number; bytes: number }[];
}

/** A part as kept: its version, the device that wrote it and when. */
export interface PartInfo { version: number; device: string; updated: number; bytes: number }

let token = '';
export const setToken = (t: string): void => { token = t; };

const TIMEOUT_MS = 15_000;

async function call(method: string, path: string, init: { json?: unknown; body?: BodyInit; headers?: Record<string, string>; public?: boolean; signal?: AbortSignal } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (token && !init.public) headers.authorization = `Bearer ${token}`;
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  let answer: Response;
  try {
    answer = await fetch(`${savesHost()}/saves${path}`, {
      method, headers, cache: 'no-store', signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch {
    throw new CloudError(0, 'The cloud saves server could not be reached.');
  }
  if (answer.ok) return answer;
  const type = answer.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await answer.json().catch(() => null) : await answer.text().catch(() => '');
  throw new CloudError(answer.status, typeof body === 'string' && body ? body : `HTTP ${answer.status}`, body);
}

const json = async <T>(r: Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

// --- passkeys: the options as JSON to the browser's ArrayBuffers and back ------------------------------------
const toBytes = (b64url: string): ArrayBuffer => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
};
const toB64url = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

type Json = Record<string, unknown>;
interface WithIds { id: string }

function creationOptions(o: Json): CredentialCreationOptions {
  const user = o.user as Json;
  return { publicKey: {
    ...(o as unknown as PublicKeyCredentialCreationOptions),
    challenge: toBytes(o.challenge as string),
    user: { ...(user as unknown as PublicKeyCredentialUserEntity), id: toBytes(user.id as string) },
    excludeCredentials: ((o.excludeCredentials ?? []) as WithIds[]).map((c) => ({ ...c, type: 'public-key' as const, id: toBytes(c.id) })),
  } };
}

function requestOptions(o: Json): CredentialRequestOptions {
  return { publicKey: {
    ...(o as unknown as PublicKeyCredentialRequestOptions),
    challenge: toBytes(o.challenge as string),
    allowCredentials: ((o.allowCredentials ?? []) as WithIds[]).map((c) => ({ ...c, type: 'public-key' as const, id: toBytes(c.id) })),
  } };
}

/** The browser's answer as the service reads it (WebAuthn's JSON form). */
function answerJson(credential: PublicKeyCredential): Json {
  const r = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Json = { clientDataJSON: toB64url(r.clientDataJSON) };
  if ('attestationObject' in r && r.attestationObject) {
    response.attestationObject = toB64url(r.attestationObject);
    response.transports = r.getTransports?.() ?? [];
  } else {
    response.authenticatorData = toB64url(r.authenticatorData);
    response.signature = toB64url(r.signature);
    if (r.userHandle) response.userHandle = toB64url(r.userHandle);
  }
  return { id: credential.id, rawId: toB64url(credential.rawId), type: credential.type, response,
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {} };
}

/** Whether this browser can make and use passkeys at all. */
export const passkeysHere = (): boolean => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;

export interface SignedIn { token: string; account: CloudAccount }

/** A passkey made on this device: a new account's first, or (signed in) another for this account. */
export async function makePasskey(): Promise<SignedIn> {
  const options = await json<Json>(call('POST', '/passkey/options', { json: { purpose: 'register' } }));
  const credential = await navigator.credentials.create(creationOptions(options)) as PublicKeyCredential | null;
  if (!credential) throw new CloudError(0, 'No passkey was made.');
  return json<SignedIn>(call('POST', '/passkey/verify', { json: { purpose: 'register', response: answerJson(credential) } }));
}

/** Signs in with a passkey this device (or a phone it asks) has. */
export async function usePasskey(): Promise<SignedIn> {
  const options = await json<Json>(call('POST', '/passkey/options', { json: { purpose: 'login' } }));
  const credential = await navigator.credentials.get(requestOptions(options)) as PublicKeyCredential | null;
  if (!credential) throw new CloudError(0, 'No passkey was chosen.');
  return json<SignedIn>(call('POST', '/passkey/verify', { json: { purpose: 'login', response: answerJson(credential) } }));
}

// --- the account ---------------------------------------------------------------------------------------------
export const linkCode = (): Promise<{ code: string; until: number; previewsOnly?: boolean }> => json(call('POST', '/link-code'));
export const signInWithCode = (code: string): Promise<SignedIn> => json(call('POST', '/link', { json: { code } }));
export const account = (): Promise<CloudAccount> => json(call('GET', '/account'));
export const signOut = async (): Promise<void> => { await call('POST', '/signout'); };
export const deleteAccount = async (): Promise<void> => { await call('DELETE', '/account'); };

// --- Google, by redirect (#503): the page goes to Google and comes home with a one-time code ----------------
/** What the service has on: Google's sign-in among them (asked once a visit). */
let health: Promise<{ google: boolean }> | null = null;
export function serviceHealth(): Promise<{ google: boolean }> {
  // Health is public. Sending a session would preflight this GET and could hide Google on CORS failure.
  health ??= json<{ google: boolean }>(call('GET', '/health', { public: true })).catch(() => { health = null; return { google: false }; });
  return health;
}
/** The address to send this page to for Google's sign-in (`signin`) or to link Google (`link`, production's alone);
 *  Google sends it home to this path and query. `nonce` binds it to this tab: the code it comes home with is traded
 *  with it alone. */
export const googleAddress = (purpose: 'signin' | 'link', nonce: string, returnPath = `${location.pathname}${location.search}`, signal?: AbortSignal): Promise<{ url: string }> =>
  json(call('POST', '/auth/google', { json: { purpose, nonce, returnPath }, signal }));
/** The code Google's answer brought home, finished: a session (a sign-in), or Google linked to the signed-in
 *  account (a link, sent with that account's production session). */
export interface GoogleMoveOffer { code: string; previewSaves: number; hasProductionSave: boolean; hasPasskey: boolean }
export const googleFinish = (code: string, nonce: string, signal?: AbortSignal): Promise<SignedIn | { linked: true; account: CloudAccount } | { move: GoogleMoveOffer }> =>
  json(call('POST', '/auth/google/finish', { json: { code, nonce }, signal }));
export const moveGoogle = (code: string): Promise<{ linked: true; account: CloudAccount }> =>
  json(call('POST', '/google/move', { json: { code } }));
export const unlinkGoogle = async (): Promise<void> => { await call('DELETE', '/google'); };

// --- this site's save ----------------------------------------------------------------------------------------
export const listParts = (): Promise<{ site: string; updated: number; parts: Record<string, PartInfo> }> => json(call('GET', '/save'));

/** A part's content and version. */
export async function readPart(name: string): Promise<{ value: unknown; version: number; device: string; updated: number }> {
  const answer = await call('GET', `/save/${name}`);
  const unpacked = new Response(answer.body!.pipeThrough(new DecompressionStream('gzip')));
  return {
    value: await unpacked.json(), version: Number(answer.headers.get('x-save-version')),
    device: decodeURIComponent(answer.headers.get('x-save-device') ?? ''), updated: Number(answer.headers.get('x-save-updated')),
  };
}

/** Writes a part over the version `base` (0: new). A stale base fails with 409, its body the version kept. */
export async function writePart(name: string, value: unknown, base: number, device: string): Promise<number> {
  const packed = await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const answer = await call('PUT', `/save/${name}`, { body: packed, headers: { 'x-save-base': String(base), 'x-save-device': device } });
  return (await answer.json() as { version: number }).version;
}

export const deleteSave = async (): Promise<void> => { await call('DELETE', '/save'); };
export const copyCode = (): Promise<{ code: string; until: number }> => json(call('POST', '/copy-code'));
export const copyProduction = async (code: string): Promise<void> => { await call('POST', '/copy-production', { json: { code } }); };
