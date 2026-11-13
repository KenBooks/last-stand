// A command that runs its browsers in the lab's own process (`check`, `pwa`, one run without the server) stops when
// it's told to or when what started it is gone (tools/lab). On Windows a task stopped kills its own process and those
// Windows counts as its children, nothing else: an agent's check, stopped, ran on unseen for over an hour, eight
// browsers at full load, the machine's CPU and GPU pinned with every agent stopped. Under Git Bash, `npm run` leaves
// no line back to what started it (the shell that ran npm is gone as npm starts), so such a command notes itself in
// `out/running`, and `lab stop` asks it to stop; where the line is whole (a terminal, `node tools/lab/lab.mjs`, the
// server's supervisor), it stops too as soon as any process above it is gone.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './paths.mjs';

/** how often a running command checks whether it must stop, ms */
const CHECK_MS = 2000;
/** where each running command notes itself (`<pid>.json`), and is asked to stop (`<pid>.stop`) */
export const RUNNING_DIR = join(OUT, 'running');

/** Whether a process is alive: one this account may not signal is (a Loaner job's account may not signal the
 *  service above it, and every lab command run there stopped at once, "what started it is gone"). */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it's there, under another account (a lent PC's service starting its jobs as their own user).
    return error.code === 'EPERM';
  }
}

/** Every process on the machine, by id: its parent's id and when it started (Windows). */
function processesOnWindows() {
  const script = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) '
    + '$($_.CreationDate.ToFileTimeUtc())" }';
  const listed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const processes = new Map();
  for (const line of String(listed.stdout ?? '').split(/\r?\n/)) {
    const [pid, parent, started] = line.trim().split(' ').map(Number);
    if (pid) processes.set(pid, { parent, started });
  }
  return processes;
}

/**
 * The processes above `pid`, its parent first, from `processes` (by id: `{ parent, started }`): each one's parent in
 * turn, up to one that is gone or was started after its child (Windows names a parent by an id it may have given to
 * another process since).
 */
export function ancestorsIn(processes, pid) {
  const ancestors = [];
  let child = processes.get(pid);
  while (child) {
    const parent = processes.get(child.parent);
    if (!parent || parent.started > child.started || ancestors.includes(child.parent)) break;
    ancestors.push(child.parent);
    child = parent;
  }
  return ancestors;
}

/** The processes above this one, its parent first (elsewhere than Windows, its parent alone: a terminal's signal
 *  reaches the whole group). */
export function starters() {
  if (process.platform !== 'win32') return [process.ppid];
  const above = ancestorsIn(processesOnWindows(), process.pid);
  return above.length ? above : [process.ppid];
}

/** Calls `gone` once, as soon as any process that started this one is gone (checked every `CHECK_MS`). */
export function whenStarterGone(gone) {
  const watched = starters();
  const timer = setInterval(() => {
    if (watched.every(isAlive)) return;
    clearInterval(timer);
    gone();
  }, CHECK_MS);
  timer.unref();
}

/** whether this process is stopping (`stopWhenAsked`): what fails as its browsers close is no result */
let stopping = false;

/** Whether this process is stopping: a check writes no report or time from then on. */
export const isStopping = () => stopping;

const noteOf = (pid) => join(RUNNING_DIR, `${pid}.json`);
const stopOf = (pid) => join(RUNNING_DIR, `${pid}.stop`);

/**
 * Notes this process in `out/running` as running `command` (gone when it exits), and calls `stop` once, with why, when
 * `lab stop` asks it to or what started it is gone.
 */
export function stopWhenAsked(command, stop) {
  mkdirSync(RUNNING_DIR, { recursive: true });
  const pid = process.pid;
  rmSync(stopOf(pid), { force: true });
  writeFileSync(noteOf(pid), JSON.stringify({ pid, command, started: new Date().toISOString() }));
  process.on('exit', () => {
    rmSync(noteOf(pid), { force: true });
    rmSync(stopOf(pid), { force: true });
  });
  const once = (why) => {
    if (stopping) return;
    stopping = true;
    stop(why);
  };
  const asked = setInterval(() => {
    if (existsSync(stopOf(pid))) once('lab stop asked it to');
  }, CHECK_MS);
  asked.unref();
  whenStarterGone(() => once('what started it is gone'));
}

/**
 * Asks every command running from this tree (`stopWhenAsked`) to stop, and waits up to `ms` for each to go; notes
 * left by processes gone without a trace are cleared. Returns a line for each: what it ran, and whether it stopped.
 */
export async function stopRunning(ms = 15_000) {
  if (!existsSync(RUNNING_DIR)) return [];
  const pids = readdirSync(RUNNING_DIR).filter((name) => name.endsWith('.json')).map((name) => Number.parseInt(name));
  const live = pids.filter(isAlive);
  for (const pid of pids.filter((each) => !isAlive(each))) rmSync(noteOf(pid), { force: true });
  for (const pid of live) writeFileSync(stopOf(pid), '');
  const until = Date.now() + ms;
  while (live.some(isAlive) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 250));
  return live.map((pid) => `lab ${pid}: ${isAlive(pid) ? `still running after ${ms / 1000} s` : 'stopped'}`);
}
