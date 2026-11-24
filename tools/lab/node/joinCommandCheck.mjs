// `lab invite`'s last part: the command a coding session really runs, `npm run lab -- join`, against the game the
// check has invited it into. `join <code>` is started as a process of its own, as a session starts it in the
// background, and each step after it is the command line run again (joinSession.mjs: they reach the game through
// the first), its printed text read as the session reads it.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, REPO } from './paths.mjs';

const LAB = join(REPO, 'tools', 'lab', 'lab.mjs');
/** the thing `join make` is checked with */
const EXAMPLE = join(REPO, 'tools', 'lab', 'examples', 'beacon.ts');
/** how long one run of the command line is given (ms) */
const RUN_MS = 30_000;

/** `lab join` run with `words`; resolves to its exit code and what it printed. */
function runJoin(words) {
  return new Promise((resolve) => {
    execFile(process.execPath, [LAB, 'join', ...words], { timeout: RUN_MS, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, text: `${stdout}${stderr}`.trim() });
    });
  });
}

/** `lab join` with `words` started as a process of its own; its printed text as it comes, and its end. */
function startJoin(words) {
  const child = spawn(process.execPath, [LAB, 'join', ...words], { windowsHide: true });
  const holder = { text: '', exited: null };
  child.stdout.on('data', (chunk) => {
    holder.text += chunk;
  });
  child.stderr.on('data', (chunk) => {
    holder.text += chunk;
  });
  holder.ended = new Promise((resolve) => {
    child.on('exit', (exit) => {
      holder.exited = exit;
      resolve(exit);
    });
  });
  holder.kill = () => child.kill();
  return holder;
}

/** `join make --resend` on a copy of the example: made, then made again in the game as the copy is saved changed. */
async function resentOnSave(game, found) {
  const dir = join(OUT, 'invite');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'resent.ts');
  const source = readFileSync(EXAMPLE, 'utf8');
  writeFileSync(file, source);
  const sender = startJoin(['make', 'resent', '--file', file, '--resend']);
  try {
    await game.until(() => /^made: resent/m.test(sender.text) || sender.exited !== null, 'join make --resend never made its thing');
    writeFileSync(file, source.replace('const STONE = 0.35;', 'const STONE = 0.6;'));
    await game.until(() => /^made again: resent/m.test(sender.text) || sender.exited !== null,
      'join make --resend never sent its saved file again');
    const again = /^made again: resent.*$/m.exec(sender.text)?.[0] ?? `stopped: ${sender.text}`;
    found.say(`lab join make --resend: made, and the file saved changed: "${again}"`);
    found.expect(sender.exited === null && /^made again/.test(again), `join make --resend stopped: ${sender.text}`);
  } finally {
    if (sender.exited === null) sender.kill();
    await game.whileStepping(runJoin(['unmake']));
  }
}

/**
 * The command line joined into `game` (inviteCheck.mjs's, already showing `code`) and its steps run: status, look,
 * set, eval, picture, make, makes, unmake, leave. Findings go to `found`.
 */
export async function joinCommandChecked(game, found, server, code) {
  const holder = startJoin([code, '--server', server]);
  try {
    await game.until((s) => s.asked || holder.exited !== null, 'the game never asked for the command line\'s agent');
    if (holder.exited !== null) {
      found.expect(false, `lab join <code> stopped before the game asked: ${holder.text}`);
      return;
    }
    const waiting = await runJoin(['status']);
    await game.press('accept');
    await game.until(() => /let in/.test(holder.text), 'lab join never said it was let in');
    const status = await game.whileStepping(runJoin(['status']));
    found.say(`lab join <code>: held; status "${waiting.text}" at the question, "${status.text}" once let in`);
    found.expect(/waiting/.test(waiting.text) && status.text === 'joined', 'lab join status doesn\'t tell waiting from joined');

    const seen = await game.whileStepping(runJoin(['look']));
    let hero = null;
    try {
      hero = JSON.parse(seen.text).hero?.class;
    } catch { /* said below */ }
    const page = await game.state();
    found.expect(seen.code === 0 && hero === page.heroClass, `lab join look printed no game of a ${page.heroClass}: ${seen.text.slice(0, 200)}`);

    const set = await game.whileStepping(runJoin(['set', 'god=true', 'wave=9']));
    const after = await game.state();
    found.say(`lab join set god=true wave=9: printed "${set.text.replace(/\n/g, '; ')}"`);
    found.expect(after.god && after.wave === '9', 'lab join set didn\'t reach the panel');
    found.expect(/god = true/.test(set.text) && /wave = 9/.test(set.text), 'lab join set didn\'t print what it set');
    await game.whileStepping(runJoin(['set', 'god=false']));

    const value = await game.whileStepping(runJoin(['eval', 'G.player.cls.id']));
    const failed = await game.whileStepping(runJoin(['eval', 'nope.nope']));
    found.say(`lab join eval: printed ${value.text}; an error exits ${failed.code}`);
    // (a text prints bare, anything else as JSON)
    found.expect(value.text === page.heroClass,`lab join eval printed ${value.text}`);
    found.expect(failed.code !== 0 && /ReferenceError/.test(failed.text), 'lab join eval\'s error didn\'t fail the command');

    const shot = await game.whileStepping(runJoin(['picture', '--side', '320']), true);
    const file = /^(.*\.jpg) \((\d+)x(\d+)/m.exec(shot.text);
    const kept = file && existsSync(file[1]) ? statSync(file[1]).size : 0;
    found.say(`lab join picture: ${file ? `${file[2]}x${file[3]}, ${kept} bytes kept` : `printed "${shot.text}"`}`);
    found.expect(kept > 1000 && file[2] === '320', 'lab join picture kept no picture of the side asked for');

    const made = await game.whileStepping(runJoin(['make', 'beacon', '--file', EXAMPLE, '--turn', '0.5']));
    const listed = await game.whileStepping(runJoin(['makes']));
    const unmade = await game.whileStepping(runJoin(['unmake']));
    const groups = (await game.state()).groups;
    found.say(`lab join make: printed "${made.text}"; makes "${listed.text}"; unmake "${unmade.text}"`);
    found.expect(made.code === 0 && /^made: beacon: in \w+ at .*2 meshes, 48 triangles, 1 updater/.test(made.text),
      `lab join make printed "${made.text}"`);
    found.expect(/^beacon: /.test(listed.text), `lab join makes printed "${listed.text}"`);
    found.expect(unmade.text === 'nothing is made' && groups.length === 0, 'lab join unmake left the thing in the scene');

    await resentOnSave(game, found);

    const left = await game.whileStepping(runJoin(['leave']));
    const exit = await game.whileStepping(holder.ended);
    const gone = await game.until((s) => !s.badge, 'the badge stayed up after lab join leave');
    const none = await runJoin(['status']);
    found.say(`lab join leave: "${left.text}", the holder exited ${exit}, "${gone.note}"; a step after it: "${none.text}"`);
    found.expect(exit === 0, `the holder exited ${exit} after leave: ${holder.text}`);
    found.expect(none.code !== 0 && /no game is joined/.test(none.text), 'a step with no game joined didn\'t say so');
  } finally {
    if (holder.exited === null) holder.kill();
  }
}
