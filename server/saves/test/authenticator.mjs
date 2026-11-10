// A passkey authenticator for the saves service's tests: it answers the service's options as a browser's would
// (WebAuthn's create and get, "none" attestation, an ES256 key), so the tests go through the real checks of
// @simplewebauthn/server, not a stub of them.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();

/** CBOR (RFC 8949) of what a passkey's answer holds: integers, byte and text strings, maps. */
function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
    throw new Error('too long for this encoder');
  };
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

/** A device's passkey: made by `create` for the options a page was given, then signing in with `get`. */
export function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  let counter = 0;
  let userHandle = null;

  const clientData = (type, challenge, origin) => Buffer.from(JSON.stringify({ type, challenge, origin,
    crossOrigin: false }));

  /** The answer to registration options (`navigator.credentials.create`), from the page at `origin`. */
  function create(options, origin, { rpId = options.rp.id } = {}) {
    userHandle = options.user.id;
    const coseKey = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')]]);
    const length = Buffer.from([credentialId.length >> 8, credentialId.length & 255]);
    const authData = Buffer.concat([
      sha256(rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, credentialId, cbor(coseKey),
    ]);
    const attestationObject = cbor({ fmt: 'none', attStmt: {}, authData });
    return {
      id: b64url(credentialId), rawId: b64url(credentialId), type: 'public-key', clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientData('webauthn.create', options.challenge, origin)),
        attestationObject: b64url(attestationObject), transports: ['internal'],
      },
    };
  }

  /** The answer to sign-in options (`navigator.credentials.get`), from the page at `origin`, signed by this key. */
  function get(options, origin, { rpId = options.rpId } = {}) {
    counter++;
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([0x05]), count]);
    const client = clientData('webauthn.get', options.challenge, origin);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(client)]), privateKey);
    return {
      id: b64url(credentialId), rawId: b64url(credentialId), type: 'public-key', clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(client), authenticatorData: b64url(authenticatorData), signature: b64url(signature),
        userHandle,
      },
    };
  }

  return { id: b64url(credentialId), create, get };
}
