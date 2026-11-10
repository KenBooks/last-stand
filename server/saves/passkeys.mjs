// Passkeys (WebAuthn) for the saves service, through @simplewebauthn/server: the options a page hands the browser,
// and the browser's answer checked against them. A passkey belongs to a relying party, a domain the page's host is
// (or ends in): last-stand.cc for production, ls.wellscoped.dev for every PR preview and commit build under it, so
// one passkey there works on all of them (server/saves/AGENTS.md). Each challenge is good once, for CHALLENGE_MS,
// and only from the page and the purpose it was made for.
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_MS = 5 * 60_000;
const RP_NAME = 'Last Stand';
/** challenge -> { purpose, origin, rpId, accountId, until } */
const challenges = new Map();

export const clearChallenges = () => challenges.clear();

/** The relying party for a page's origin: the longest of `rpIds` its host is or ends in, else null (no passkeys
 *  there: the github.io address the game moved from). */
export function rpIdFor(origin, rpIds) {
  let host;
  try { host = new URL(origin).hostname; } catch { return null; }
  const fits = rpIds.filter((rpId) => host === rpId || host.endsWith(`.${rpId}`));
  return fits.sort((a, b) => b.length - a.length)[0] ?? null;
}

function remember(challenge, entry, now) {
  for (const [old, { until }] of challenges) if (until <= now) challenges.delete(old);
  challenges.set(challenge, { ...entry, until: now + CHALLENGE_MS });
}

/** The options to make a passkey for the account `accountId` (a new one's id when nobody is signed in). */
export async function registrationOptions({ origin, rpId, accountId, existing }, now = Date.now()) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId,
    userID: Buffer.from(accountId, 'base64url'),
    // what a password manager lists it as: there's no name to give, and none is asked for
    userName: `Last Stand ${accountId.slice(0, 6)}`,
    userDisplayName: 'Last Stand',
    attestationType: 'none',
    excludeCredentials: existing.map((passkey) => ({ id: passkey.id, transports: passkey.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  remember(options.challenge, { purpose: 'register', origin, rpId, accountId }, now);
  return options;
}

/** The options to sign in with any passkey this relying party has on the device (a discoverable one). */
export async function loginOptions({ origin, rpId }, now = Date.now()) {
  const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: 'preferred' });
  remember(options.challenge, { purpose: 'login', origin, rpId, accountId: null }, now);
  return options;
}

/** The challenge a browser's answer signed, taken (each is good once), if it was made for this page and purpose. */
function takeChallenge(response, origin, purpose, now) {
  let challenge;
  try {
    const client = JSON.parse(Buffer.from(response?.response?.clientDataJSON ?? '', 'base64url').toString('utf8'));
    challenge = String(client.challenge ?? '');
  } catch {
    return null;
  }
  const entry = challenges.get(challenge);
  if (!entry) return null;
  challenges.delete(challenge);
  if (entry.until <= now || entry.origin !== origin || entry.purpose !== purpose) return null;
  return { challenge, ...entry };
}

/** A new passkey from the browser's answer to `registrationOptions`: { accountId, passkey } or null. */
export async function verifyRegistration(response, origin, now = Date.now()) {
  const entry = takeChallenge(response, origin, 'register', now);
  if (!entry) return null;
  let result;
  try {
    result = await verifyRegistrationResponse({
      response, expectedChallenge: entry.challenge, expectedOrigin: origin, expectedRPID: entry.rpId,
      requireUserVerification: false,
    });
  } catch {
    return null;
  }
  if (!result.verified) return null;
  const { credential } = result.registrationInfo;
  return {
    accountId: entry.accountId,
    passkey: {
      id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter,
      transports: credential.transports ?? [], rpId: entry.rpId, created: now, used: now,
    },
  };
}

/** Whether the browser's answer to `loginOptions` was signed by `passkey` (its counter moved on if so). */
export async function verifyLogin(response, origin, passkey, now = Date.now()) {
  const entry = takeChallenge(response, origin, 'login', now);
  if (!entry || entry.rpId !== passkey.rpId) return false;
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response, expectedChallenge: entry.challenge, expectedOrigin: origin, expectedRPID: entry.rpId,
      credential: {
        id: passkey.id, publicKey: Buffer.from(passkey.publicKey, 'base64url'), counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: false,
    });
  } catch {
    return false;
  }
  if (!result.verified) return false;
  passkey.counter = result.authenticationInfo.newCounter;
  passkey.used = now;
  return true;
}
