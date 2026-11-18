// `npm run lab -- sheet`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { writeSheet } from '../sheetImage.mjs';
import { fixtureFrom, sheetNotes, picturePairs } from '../commandKit.mjs';
import { LOOK_OPTION, SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab sheet`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'pictures the hero in the player\'s views with each arm\'s load beside them',
  help: 'the hero pictured in the states the player sees, from the game\'s views and close up, with each arm\'s '
    + 'load and posture beside them: tools/lab/out/sheets/<tag>/sheet.png',
  options: {
    states: { kind: 'list', usage: 'a,b', default: 'stand,walk', help: 'the states: stand, walk, full, cast' },
    views: {
      kind: 'list',
      usage: 'a,b',
      default: 'lobby,top,third,front,left,back',
      help: 'the views: lobby, top, third, front, left, right, back, above; eyes with --view first',
    },
    tag: { kind: 'text', usage: 'name', default: 'latest', help: 'the sheet\'s folder' },
    focus: { kind: 'text', usage: 'joint', help: 'close-ups framed on a joint (head, handL...), not the body' },
    look: LOOK_OPTION,
    skill: { kind: 'text', usage: 'name', help: 'the cast state\'s skill: its key, its behaviour or its name' },
    shares: {
      kind: 'list',
      usage: 'a,b',
      default: '0.3,0.55,0.8',
      help: 'the cast state\'s moments, as shares of its cast',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('sheet', {
      states: options.states,
      views: options.views,
      fixture: fixtureFrom(options),
      focus: options.focus,
      look: options.look,
      skill: options.skill,
      shares: options.shares?.map(Number),
    });
  },
  async finish(results, options, session) {
    const runs = results.map(([side, sheet]) => [side.name, sheet]);
    const dir = session.outFor(join('sheets', options.tag));
    mkdirSync(dir, { recursive: true });
    const image = join(dir, 'sheet.png');
    await writeSheet(session.browser, runs, options.views.length, image);
    const notes = runs.map(([name, sheet]) => `${name}, ${sheetNotes(sheet)}`);
    writeFileSync(join(dir, 'notes.txt'), notes.join('\n\n'));
    return `${notes.join('\n\n')}\n\nsheet: ${relative(REPO, image)}`;
  },
  textOf: sheetNotes,
  pictures: picturePairs,
};
