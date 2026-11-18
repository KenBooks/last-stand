// `npm run lab -- range`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, writeMoments } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * Each side's text under its name, and a sheet of each side's moments, written in `dir`: `sheet.png` for this tree's,
 * `main-sheet.png` for the other side's (a turn's `filePrefix` first). The ranger's range, two sides of 1329 x 8446 px
 * side by side in one sheet, was a page too big for the browser, which closed, and its A/B never ran to the end.
 */
async function textWithSheetPerSide(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const image = await writeMoments([[side, result]], dir, browser, `${side.filePrefix}sheet.png`);
    if (image) images.push(relative(REPO, image));
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/** `lab range`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every joint against a body\'s ranges frame by frame, standing, walking, attacking and turning: each angle '
    + 'past its range and where, the frame\'s time, the weapon through his body, the arms at their stops (in full in '
    + '`commands/range.md`)',
  help: 'every joint of the hero against a body\'s ranges, frame by frame: standing, walking each way, attacking, '
    + 'and walks that change direction while he attacks or runs',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['stand', 'walk', 'shoot', 'reverse', 'taps', 'run', 'stagger', 'cast'],
      help: 'the scenarios (all by default): stand, walk, shoot, reverse, taps, run, stagger (stunned 0.7 s as a '
        + 'charge into a crowd leaves him, his keys held), cast (with --skill)',
    },
    skill: { kind: 'text', usage: 'name', help: 'the cast scenario\'s skill: its key, its behaviour or its name' },
    foe: { kind: 'text', usage: 'kind', help: 'a foe of this kind stood ahead of him for the cast scenario (dummy)' },
    ahead: { kind: 'number', usage: 'm', help: 'with --foe, how far ahead it stands (1.8 by default)' },
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome he stands in (the lobby\'s by default): with --at, by its wall',
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    gear: SETUP_OPTIONS.gear,
    weapon: SETUP_OPTIONS.weapon,
    tune: SETUP_OPTIONS.tune,
    canary: {
      kind: 'switch',
      help: 'plant faults the measure must catch: the head turned past the neck\'s range, the fist bent on its '
        + 'forearm',
    },
    frames: { kind: 'switch', help: 'list every frame with a joint past its range' },
    trace: {
      kind: 'switch',
      help: 'list every frame of the leg IK, as gait --trace does, with the joints past their ranges',
    },
    span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    return side.command('range', {
      scenarios: options.scenarios,
      canary: Boolean(options.canary),
      frames: Boolean(options.frames),
      trace: Boolean(options.trace),
      span: options.span,
      skill: options.skill,
      foe: options.foe,
      foeAt: options.ahead,
      biome: options.biome,
      at: options.at,
      facing: options.facing,
      gear: options.gear,
      weapon: options.weapon,
      tune: fixtureFrom(options).tune,
    });
  },
  finish(results, options, session) {
    return textWithSheetPerSide(results, session.outFor('range'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
