// The owner's Drive refresh token for the nightly backups (server/saves/AGENTS.md, Setting up Google), made once on
// the owner's PC: `npm run saves:drive-token`, with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set (the service's
// OAuth client, whose redirect URIs list `http://localhost:8791/`). It prints Google's consent address for the
// `drive.file` scope, waits on that port for Google to come back, trades the code and prints the refresh token, to be
// pasted into Dokci's DRIVE_REFRESH_TOKEN. Nothing is written to disk.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.DRIVE_TOKEN_PORT ?? 8791);
const REDIRECT = `http://localhost:${PORT}/`;
const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
if (!clientId || !clientSecret) {
  console.error('set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (the service\'s OAuth client) first');
  process.exit(2);
}

const state = randomBytes(16).toString('base64url');
const consent = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: REDIRECT,
  scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline',
  prompt: 'consent',
  state,
});
console.log(`Open this address, signed in as the Google account the backups go to:\n\n`
  + `https://accounts.google.com/o/oauth2/v2/auth?${consent}\n`);

/** The refresh token Google gives for `code`. */
async function refreshTokenOf(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const answer = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const tokens = await answer.json();
  if (!answer.ok || !tokens.refresh_token) throw new Error(`Google gave no refresh token: ${JSON.stringify(tokens)}`);
  return tokens.refresh_token;
}

const server = createServer(async (req, res) => {
  const query = new URL(req.url ?? '/', REDIRECT).searchParams;
  if (!query.has('code') && !query.has('error')) {
    res.writeHead(404).end();
    return;
  }
  const done = (text) => {
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`${text}\nYou can close this tab.`);
    server.close();
  };
  if (query.get('state') !== state) return done('That answer was for another run: start again.');
  if (query.has('error')) return done(`Google said: ${query.get('error')}`);
  try {
    const token = await refreshTokenOf(query.get('code'));
    console.log(`DRIVE_REFRESH_TOKEN (Dokci, the relay's environment; never in the repo):\n\n${token}\n`);
    done('Done: the refresh token is in the terminal.');
  } catch (e) {
    console.error(String(e?.message ?? e));
    done('Google refused: see the terminal.');
  }
});
server.listen(PORT, 'localhost', () => console.log(`Waiting on ${REDIRECT} ...`));
