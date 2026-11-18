// The lab's commands, a module each (node/commands/, read by options.mjs `commandsIn`), and their page functions
// (page/commands/): every one found, in order, and every function a command calls on the page there to call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMANDS as PAGE_COMMANDS } from '../node/commands.mjs';
import { LAB } from '../node/codeStamp.mjs';
import { pageCallsIn } from '../node/labCode.mjs';
import { COMMANDS, COMMANDS_DIR, commandsIn } from '../node/options.mjs';
import { OUT } from '../node/paths.mjs';

const PAGE_DIR = join(LAB, 'page', 'commands');

/** A folder of its own under the lab's out/, for modules a test writes, emptied first. */
function scratchFolder(name) {
  const folder = join(OUT, 'test', `${name}-${process.pid}`);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  return folder;
}

test('the commands are the modules in node/commands, by name in order', () => {
  const files = readdirSync(COMMANDS_DIR).filter((file) => file.endsWith('.mjs'));
  const names = files.map((file) => file.slice(0, -'.mjs'.length)).sort();
  assert.deepEqual(Object.keys(COMMANDS), names);
  for (const [name, command] of Object.entries(COMMANDS)) {
    assert.equal(typeof command.help, 'string', `${name}'s help`);
    assert.equal(typeof command.options, 'object', `${name}'s options`);
  }
});

test('a folder\'s modules read as commands in their names\' order, one with no command refused', async () => {
  const folder = scratchFolder('commandsIn');
  try {
    writeFileSync(join(folder, 'zeta.mjs'), "export default { help: 'last', options: {} };\n");
    writeFileSync(join(folder, 'alpha.mjs'), "export default { help: 'first', options: {}, each() {} };\n");
    const read = await commandsIn(folder);
    assert.deepEqual(Object.keys(read), ['alpha', 'zeta']);
    assert.equal(read.alpha.help, 'first');
    writeFileSync(join(folder, 'broken.mjs'), "export default { options: {} };\n");
    await assert.rejects(commandsIn(folder), /broken\.mjs: a command's module exports no command/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the commands that run on a page are those with work on a side', () => {
  const working = Object.keys(COMMANDS).filter((name) => typeof COMMANDS[name].each === 'function');
  assert.deepEqual(Object.keys(PAGE_COMMANDS), working);
  for (const name of ['sheet', 'gait', 'ui', 'eval']) assert.ok(PAGE_COMMANDS[name], name);
  for (const name of ['help', 'serve', 'stop', 'trace', 'check', 'docs']) assert.ok(!PAGE_COMMANDS[name], name);
});

test('every page function a command calls has its module, which exports it, and every module is called', () => {
  const nodeTexts = readdirSync(join(LAB, 'node'), { recursive: true })
    .filter((file) => String(file).endsWith('.mjs'))
    .map((file) => readFileSync(join(LAB, 'node', String(file)), 'utf8'));
  const calls = pageCallsIn(nodeTexts);
  for (const call of calls) {
    const module = join(PAGE_DIR, `${call}.ts`);
    assert.ok(existsSync(module), `page/commands/${call}.ts`);
    const exportsIt = new RegExp(`^export (?:async )?function ${call}\\b`, 'm');
    assert.match(readFileSync(module, 'utf8'), exportsIt, `page/commands/${call}.ts exports ${call}`);
  }
  // (setup: what side.mjs runs before a probe)
  const modules = readdirSync(PAGE_DIR).filter((file) => file.endsWith('.ts')).map((file) => file.slice(0, -3));
  const uncalled = modules.filter((module) => module !== 'setup' && !calls.includes(module));
  assert.deepEqual(uncalled, [], 'page functions no command calls');
});
