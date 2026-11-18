// COMMANDS.md's list of the commands, made from their modules (node/commandDocs.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsDoc, LIST_END, LIST_START, listOf, withList } from '../node/commandDocs.mjs';
import { COMMANDS } from '../node/options.mjs';

test('COMMANDS.md\'s list is the one the commands\' modules make', () => {
  const { text, made } = commandsDoc(COMMANDS);
  assert.ok(text === made, 'COMMANDS.md\'s list of the commands is stale: make it again with npm run lab -- docs');
});

test('a command\'s line: its head, its summary or else its help, then its variants', () => {
  const commands = {
    alpha: { help: 'the help', options: {} },
    beta: { summary: 'the summary', help: 'unused', argument: 'skill', options: {}, variants: { '--x': 'with x' } },
    gamma: { help: 'omitted', argument: 'code', mayOmit: true, options: {} },
    help: { help: 'this', options: {} },
  };
  const lines = [
    '- `alpha`: the help',
    '- `beta <skill>`: the summary',
    '- `beta --x`: with x',
    '- `gamma [code]`: omitted',
  ];
  assert.equal(listOf(commands), lines.join('\n'));
  const text = `head\n${LIST_START}\nold\n${LIST_END}\ntail`;
  assert.equal(withList(text, commands), `head\n${LIST_START}\n${lines.join('\n')}\n${LIST_END}\ntail`);
  assert.throws(() => withList('no marks', commands), /lost the marks/);
});
