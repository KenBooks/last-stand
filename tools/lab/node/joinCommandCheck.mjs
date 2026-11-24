// `lab invite`'s last part: the command a coding session really runs, `npm run lab -- join`, against the game the
// check has invited it into. `join <code>` is started as a process of its own, as a session starts it in the
// background, and each step after it is the command line run again (joinSession.mjs: they reach the game through
// the first), its printed text read as the session reads it.
import { execFile, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './paths.mjs';

const LAB = join(REPO, 'tools', 'lab', 'lab.mjs');
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

/** `join <code>` started as a process of its own; its printed text as it comes, and its end. */
function startHolder(code, server) {
  const child = spawn(process.execPath, [LAB, 'join', code, '--server', server], { windowsHide: true });
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

/**
 * The command line joined into `game` (inviteCheck.mjs's, already showing `code`) and its steps run: status, look,
 * set, eval, picture, leave. Findings go to `found`.
 */
export async function joinCommandChecked(game, found, server, code) {
  const holder = startHolder(code, server);
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
