// The lab server's supervisor (tools/lab, `npm run lab:serve`): it runs the server in a child process, starts it again
// when the lab's Node code changes or the server asks (its code is older than a command's), and stops it when it is
// stopped itself, or when whatever started it is gone (a terminal's task killed on Windows left the server running,
// holding its ports and a browser).
import { fork } from 'node:child_process';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { LAB, codeStamp } from './codeStamp.mjs';
import { lowerPriority } from './priority.mjs';
import { whenStarterGone } from './running.mjs';

/** the server's own entry, run in the child */
const SERVER_ENTRY = join(LAB, 'node', 'serverProcess.mjs');
/** how long the code must be left alone after a change before the server starts again, ms */
const CODE_SETTLE_MS = 300;

/** Sends the server a message, if it can still hear one (it may be on its way out). */
function tell(child, message) {
  if (child.connected) child.send(message);
}

function log(message) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);
}

/** Runs the lab's server under supervision until it's stopped. */
export function supervise() {
  // (the server, its browsers and Vite inherit it: started at normal priority, the lab froze the desktop, #283)
  log(`the lab runs at ${lowerPriority()} priority`);
  let child = null;
  /** what to do when the child exits: start it again, stop, or wait for the code to change (it failed) */
  let next = 'wait';
  let settling = null;
  /** the hash of the code the server was started on */
  let started = null;

  const start = () => {
    next = 'wait';
    started = codeStamp();
    child = fork(SERVER_ENTRY, [], { stdio: 'inherit', windowsHide: true });
    child.on('message', (message) => {
      if (message?.restart) next = 'start';
      if (message?.stop) next = 'stop';
    });
    child.on('exit', (code) => {
      child = null;
      if (next === 'stop') process.exit(0);
      if (next === 'start') return start();
      log(`the lab server stopped (${code}); it starts again when the lab's code changes`);
    });
  };

  /**
   * The server started again, once the code has settled, if what it says changed: Windows reports a file read as a
   * change when it updates the file's last access time (about once an hour), and the server restarted under a command
   * that had just read the lab's code, closing its browser.
   */
  const codeChanged = () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (next === 'stop') return;
      if (codeStamp() === started) return;
      if (!child) return start();
      next = 'start';
      tell(child, { restart: 'the lab\'s code changed' });
    }, CODE_SETTLE_MS);
  };
  // (with the commands' folder: node/commands/)
  watch(join(LAB, 'node'), { recursive: true }, (_event, file) => {
    if (String(file).endsWith('.mjs')) codeChanged();
  });
  watch(join(LAB, 'lab.mjs'), codeChanged);

  const stop = () => {
    if (!child) process.exit(0);
    next = 'stop';
    tell(child, { stop: true });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // (every process above it: a task stopped on Windows kills its own process alone, and the shells between it and
  // the supervisor lived on)
  whenStarterGone(stop);

  start();
}
