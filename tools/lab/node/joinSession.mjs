// `lab join`: a coding session's place in the game its owner is playing (#529). `join <code>` joins the game that
// showed the code and holds the link, in a process of its own, for as long as the game keeps it; every other `join`
// (`look`, `picture`, `set`, `eval`, `status`, `leave`) is a step sent through that process to the live game, as the
// lab's steps go to a headless one. The holder listens on this machine alone, on a port and a token it notes in
// `out/join/session.json`: the code is good for one join, so the link can't be opened again for each step.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { AGENT_SERVER, endedText, joinGame, STEP_MS } from './agentLink.mjs';
import { labError } from './errors.mjs';
import { madeLine, makeArgs } from './makeCode.mjs';
import { OUT } from './paths.mjs';
import { isAlive, stopWhenAsked } from './running.mjs';

const DIR = join(OUT, 'join');
const NOTE = join(DIR, 'session.json');
/** the steps a held game takes; anything else after `join` is a code */
export const STEPS = ['look', 'picture', 'set', 'eval', 'make', 'makes', 'unmake', 'status', 'leave'];

/** The held session's note, if its process is alive. */
function heldSession() {
  if (!existsSync(NOTE)) return null;
  try {
    const note = JSON.parse(readFileSync(NOTE, 'utf8'));
    return isAlive(note.pid) ? note : null;
  } catch {
    return null;
  }
}

// --- the holder ----------------------------------------------------------------------------------------------------

/** A request's body as JSON. */
function bodyOf(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

/** The holder's server on this machine alone: each request with its token is a step for `link`, or its leave. */
function serveSteps(link, token) {
  const server = createServer(async (request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST' || request.headers['x-join-token'] !== token) {
      reply(403, { error: 'not this session\'s' });
      return;
    }
    try {
      const { step, args, ms } = await bodyOf(request);
      if (step === 'leave') {
        reply(200, { result: 'left' });
        link.close();
        return;
      }
      if (step === 'status') {
        reply(200, { result: link.isAccepted ? 'joined' : 'waiting for the game\'s player to let it in' });
        return;
      }
      reply(200, { result: await link.step(step, args, ms) });
    } catch (error) {
      reply(200, { error: error.message });
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Joins the game that showed `code` and holds the link until it ends. Returns the exit code. */
async function hold(code, server) {
  const held = heldSession();
  if (held) throw labError(`a game is joined already (process ${held.pid}): npm run lab -- join leave`);
  const link = await joinGame({ server, code });
  console.log(`join: the relay took the code; the game is asking its player to let the agent in (${server})`);
  const token = randomBytes(18).toString('base64url');
  const steps = await serveSteps(link, token);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(NOTE, JSON.stringify({ pid: process.pid, port: steps.address().port, token, server }));
  stopWhenAsked('join', () => link.close());
  link.accepted.then(
    () => console.log('join: let in. Steps: npm run lab -- join look | picture | set name=value | eval <code> | leave'),
    () => {},
  );
  const why = await link.ended;
  rmSync(NOTE, { force: true });
  await new Promise((resolve) => steps.close(resolve));
  console.log(`join: ended: ${endedText(why)}`);
  return why === 'agent' ? 0 : 1;
}

// --- a step sent to the holder -------------------------------------------------------------------------------------

/** A value typed on the command line as the game takes it: true, false, a number, else its text. */
export function valueOf(text) {
  if (text === 'true' || text === 'on') return true;
  if (text === 'false' || text === 'off') return false;
  return text !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
}

/** `name=value` words as the values `set` takes, in their order. */
export function valuesOf(words) {
  const values = {};
  for (const word of words) {
    const [name, text] = word.split(/=(.*)/s);
    if (!name || text === undefined) throw labError(`set takes name=value, not ${JSON.stringify(word)}`);
    values[name] = valueOf(text);
  }
  return values;
}

/** Three numbers from a list option, or throws naming it. */
function threeOf(list, name) {
  const numbers = (list ?? []).map(Number);
  if (numbers.length !== 3 || numbers.some((n) => !Number.isFinite(n))) {
    throw labError(`--${name} is three numbers, x,y,z (m)`);
  }
  return numbers;
}

/** What `picture` is asked for, from the command's options: its size and format, and the camera placed if `--at`. */
export function pictureArgs(options) {
  const args = { format: options.png ? 'png' : 'jpeg' };
  if (options.side !== undefined) args.side = options.side;
  if (options.plain) args.plain = true;
  if (options.at) {
    args.camera = { at: threeOf(options.at, 'at') };
    if (options.to) args.camera.to = threeOf(options.to, 'to');
    else Object.assign(args.camera, { yaw: options.yaw ?? 0, pitch: options.pitch ?? 0 });
    if (options.keep) args.keep = true;
  } else if (options.to || options.keep || options.yaw !== undefined || options.pitch !== undefined) {
    throw labError('--to, --yaw, --pitch and --keep place a camera: give its --at too');
  }
  return args;
}

/** A step's arguments from the command line's words and options. */
async function argsOf(step, words, options) {
  if (step === 'picture') return pictureArgs(options);
  if (step === 'make') return makeArgs(words[0], options.file, options);
  if (step === 'unmake') return words[0] ? { name: words[0] } : {};
  if (step === 'set') return { values: valuesOf(words) };
  if (step === 'eval') {
    // (code of several lines comes from a file: through `npm run` on Windows an argument ends at its first newline,
    // and the game ran the first line alone, answering null)
    if (options.file) return { code: readFileSync(options.file, 'utf8') };
    if (!words.length) throw labError('eval needs its code: npm run lab -- join eval "G.player.pos" (or --file path)');
    return { code: words.join(' ') };
  }
  return {};
}

/** The panel's controls as lines: each one's name, what it holds, and what it takes. */
function controlLines(controls) {
  return controls.map((control) => {
    const takes = control.options ? `  (${control.options.join(', ')})` : '';
    const held = control.kind === 'press' ? 'press' : JSON.stringify(control.value);
    return `${control.name} = ${held}${takes}${control.disabled ? '  [disabled]' : ''}`;
  });
}

/** A picture's bytes written under `out/join`; the line saying where. */
function savePicture(result) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(DIR, `${stamp}.${result.type === 'image/png' ? 'png' : 'jpg'}`);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(file, Buffer.from(result.data, 'base64'));
  const drawn = result.drawn ? `, with what he drew on it: ${result.drawn} stroke${result.drawn === 1 ? '' : 's'}` : '';
  return `${file} (${result.width}x${result.height}, the ${result.view} view${drawn})`;
}

/** A step's result as the command prints it. */
function textOf(step, args, result) {
  if (step === 'picture') return savePicture(result);
  if (step === 'make') return `${result.replaced ? 'made again' : 'made'}: ${madeLine(result)}`;
  if (step === 'makes' || step === 'unmake') return result.length ? result.map(madeLine).join('\n') : 'nothing is made';
  if (step === 'set') {
    // (with nothing set, every control; else those named)
    const named = Object.keys(args.values);
    const told = named.length ? result.filter((control) => named.includes(control.name)) : result;
    return controlLines(told).join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

/** Sends `step` to the held session and prints its result. Returns the exit code. */
async function send(step, words, options) {
  const held = heldSession();
  if (!held) throw labError('no game is joined: npm run lab -- join <code> (the code from F8, Invite agent)');
  const args = await argsOf(step, words, options);
  const ms = options.timeout ? options.timeout * 1000 : STEP_MS;
  const answer = await fetch(`http://127.0.0.1:${held.port}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-join-token': held.token },
    body: JSON.stringify({ step, args, ms }),
  });
  const { result, error } = await answer.json();
  if (error) throw labError(error);
  console.log(textOf(step, args, result));
  return 0;
}

/** how often a file sent on each save is looked at (ms) */
const SAVED_MS = 300;

/**
 * `make` sent now and again each time its file is saved, until the game's link ends or the command is stopped: the
 * thing changes in the game as its file does. A file that doesn't parse, or a build that throws in the game, is said
 * and waited out (the thing as last built stands). Returns the exit code once the link is gone.
 */
async function sendOnSave(words, options) {
  /** the file's text as last sent: a save is a text that differs (one that lands while a send is out, too) */
  let sent = null;
  const sendIfSaved = async () => {
    let text;
    try {
      text = readFileSync(options.file, 'utf8');
    } catch {
      // (an editor's save may take the file away for a moment)
      return;
    }
    if (text === sent) return;
    sent = text;
    try {
      await send('make', words, options);
    } catch (error) {
      console.log(error.message);
    }
  };
  await sendIfSaved();
  console.log(`join make: sending ${options.file} again on each save (npm run lab -- stop ends it)`);
  return new Promise((resolve) => {
    let busy = false;
    const end = (code) => {
      clearInterval(looking);
      resolve(code);
    };
    stopWhenAsked('join-make', () => end(0));
    const looking = setInterval(async () => {
      if (busy) return;
      if (!heldSession()) {
        console.log('join make: the link to the game is gone');
        end(1);
        return;
      }
      busy = true;
      await sendIfSaved();
      busy = false;
    }, SAVED_MS);
  });
}

/** Runs `lab join`: a step for the held game, or a code to join one with. Returns the exit code. */
export function runJoin(options) {
  const [first, ...words] = options._;
  if (first === 'make' && options.resend) return sendOnSave(words, options);
  if (STEPS.includes(first)) return send(first, words, options);
  if (words.length) throw labError(`join takes a code, or one of ${STEPS.join(', ')}`);
  return hold(first, options.server ?? AGENT_SERVER);
}
