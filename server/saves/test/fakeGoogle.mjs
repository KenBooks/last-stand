// A stand-in for Google (google.test.mjs): its token endpoint, as the sign-in trades a code and the backups trade the
// owner's refresh token, and the part of Drive's API the backups use, files kept in memory. A test says who consents
// (`consent(sub)`: a code Google would send back) and can make Drive's MD5 of an upload lie (`lieAboutMd5`).
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

export const CLIENT_ID = 'test-client.apps.googleusercontent.com';
export const CLIENT_SECRET = 'test-secret';
export const REFRESH_TOKEN = 'test-refresh-token';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';

/** The stand-in on a port of its own; resolves to its address and its controls. */
export async function fakeGoogle() {
  /** a code -> { sub, challenge } (the challenge the sign-in's address carried) */
  const codes = new Map();
  /** id -> { id, name, mimeType, parents, createdTime, bytes } */
  const files = new Map();
  const fake = { aud: CLIENT_ID, lie: false, files };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const body = await bodyOf(req);
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/token') return send(...token(new URLSearchParams(body.toString('utf8'))));
    if (req.headers.authorization !== 'Bearer drive-access') return send(401, { error: 'unauthenticated' });
    if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
      const all = listed(url);
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const end = start + Number(url.searchParams.get('pageSize') ?? 100);
      return send(200, { files: all.slice(start, end), ...(end < all.length ? { nextPageToken: String(end) } : {}) });
    }
    if (url.pathname === '/drive/v3/files' && req.method === 'POST') return send(200, { id: made(JSON.parse(body)) });
    if (url.pathname === '/upload/drive/v3/files' && req.method === 'POST') return send(200, uploaded(req, body));
    const id = /^\/drive\/v3\/files\/(.+)$/.exec(url.pathname)?.[1];
    if (id && req.method === 'DELETE') {
      files.delete(decodeURIComponent(id));
      res.writeHead(204).end();
      return;
    }
    send(404, { error: 'not here' });
  });

  /** The token endpoint: a code traded (its verifier checked against its challenge) or the refresh token. */
  function token(form) {
    if (form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) {
      return [401, { error: 'invalid_client' }];
    }
    if (form.get('grant_type') === 'refresh_token') {
      if (form.get('refresh_token') !== REFRESH_TOKEN) return [400, { error: 'invalid_grant' }];
      return [200, { access_token: 'drive-access', expires_in: 3600 }];
    }
    const entry = codes.get(form.get('code'));
    codes.delete(form.get('code'));
    const verifier = form.get('code_verifier') ?? '';
    if (!entry || createHash('sha256').update(verifier).digest('base64url') !== entry.challenge) {
      return [400, { error: 'invalid_grant' }];
    }
    const claims = { iss: 'https://accounts.google.com', aud: fake.aud, sub: entry.sub,
      exp: Date.now() / 1000 + 3600, ...entry.claims };
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return [200, { id_token: `${part({ alg: 'RS256' })}.${part(claims)}.signature`, access_token: 'ignored' }];
  }

  /** Files matching the backups' two queries: a folder by name, or a folder's children. */
  function listed(url) {
    const q = url.searchParams.get('q') ?? '';
    const named = /name = '([^']*)'/.exec(q)?.[1];
    const parent = /'([^']*)' in parents/.exec(q)?.[1];
    return [...files.values()]
      .filter((file) => (named === undefined || (file.name === named && file.mimeType === FOLDER_TYPE)))
      .filter((file) => (parent === undefined || file.parents.includes(parent)))
      .map(({ id, name, createdTime }) => ({ id, name, createdTime }));
  }

  function made({ name, mimeType, parents = [] }, bytes = null, createdTime = new Date().toISOString()) {
    const id = randomBytes(6).toString('hex');
    files.set(id, { id, name, mimeType, parents, createdTime, bytes });
    return id;
  }

  /** A multipart upload: its metadata and its bytes, split at the boundary as Drive does. */
  function uploaded(req, body) {
    const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] ?? '')?.[1];
    const parts = splitMultipart(body, boundary);
    const metadata = JSON.parse(parts[0].toString('utf8'));
    const id = made(metadata, parts[1]);
    const md5 = createHash('md5').update(fake.lie ? Buffer.from('another file') : parts[1]).digest('hex');
    return { id, md5Checksum: md5, size: String(parts[1].length) };
  }

  /** Adds a file to a folder, made `daysAgo` days ago (an old backup the run must delete, or a recent one). */
  fake.addFile = (parent, name, daysAgo) => made({ name, mimeType: 'application/gzip', parents: [parent] }, Buffer.alloc(0),
    new Date(Date.now() - daysAgo * 86_400_000).toISOString());
  /** A code Google would send back once `sub` consented to the sign-in whose address was `authUrl`. */
  fake.consent = (authUrl, sub, claims = { email: `${sub}@example.test`, email_verified: true }) => {
    const code = randomBytes(8).toString('hex');
    codes.set(code, { sub, claims, challenge: new URL(authUrl).searchParams.get('code_challenge') });
    return code;
  };
  fake.folderNamed = (name) => [...files.values()].find((f) => f.name === name && f.mimeType === FOLDER_TYPE);
  fake.childrenOf = (id) => [...files.values()].filter((f) => f.parents.includes(id));

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => server.close();
  return fake;
}

function bodyOf(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** A multipart body's parts' contents (after each part's blank line, before its closing CRLF). */
function splitMultipart(body, boundary) {
  const parts = [];
  const marker = Buffer.from(`--${boundary}`);
  let at = body.indexOf(marker);
  while (at !== -1) {
    const next = body.indexOf(marker, at + marker.length);
    if (next === -1) break;
    const chunk = body.subarray(at + marker.length, next);
    const start = chunk.indexOf('\r\n\r\n') + 4;
    parts.push(chunk.subarray(start, chunk.length - 2));
    at = next;
  }
  return parts;
}
