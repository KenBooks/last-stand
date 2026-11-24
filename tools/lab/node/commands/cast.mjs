// `npm run lab -- cast`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { join } from 'node:path';
import { labError } from '../errors.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** The skills `cast` is given: one, or several by commas (`starfall,voidLance`). */
export const skillsOf = (options) => options._[0].split(',').filter((skill) => skill.length > 0);

/** The casts `cast` measures (page/cast.ts `CastOptions`, its canary aside): each skill in each biome and view. */
function castScenarios(options) {
  const scenarios = [];
  for (const skill of skillsOf(options)) {
    for (const biome of options.biomes) {
      for (const view of options.views) {
        scenarios.push(castScenario(options, skill, biome, view));
      }
    }
  }
  return scenarios;
}

/** One cast's scenario: `skill` in `biome` and `view`, the rest as the options say. */
function castScenario(options, skill, biome, view) {
  return {
    skill,
    biome,
    view,
    facing: options.facing ?? 0,
    at: options.at,
    foes: options.foes ?? 4,
    times: options.times.map(Number),
    pictures: options.pictures !== false,
    what: options.what?.map(Number),
    gear: options.gear,
    weapon: options.weapon,
    tune: fixtureFrom(options).tune,
    frenzy: options.frenzy,
  };
}

/** `lab cast`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a skill cast as the player casts it, its effect seen frame by frame (each biome and view with the '
    + 'biome\'s foes coming at him, every frame drawn and read back: its light against the budget, the frame\'s mean '
    + 'every tenth of a second, the flashes in any second and the changes counted in the worst cell\'s, each shared '
    + 'out among what\'s in the scene by a replay with each thing taken out of the frame in turn, the shaders '
    + 'compiled late)',
  help: 'a skill of the hero\'s cast as the player casts it, its effect seen frame by frame: the hero standing in '
    + 'each biome and view with the biome\'s foes coming at him, the key pressed (held for a held skill or a '
    + 'channel, a drawn shot drawn to full) over an aim ahead, and every frame until the effect is over drawn and '
    + 'read back: its light against the budget (the frame\'s mean raised 50 at most, a sixteenth of it 150, 5% '
    + 'of it bright, as stored), the flashes in a second (WCAG\'s: three are a hazard) and the shaders compiled '
    + 'after loading; the skill named by its key, its behaviour or its name, several by commas, each held the way '
    + 'it needs (its school\'s staff, empty hands, a shield...) unless --gear says: tools/lab/out/cast/<skill> '
    + '(--class mage)',
  argument: 'skill[,skill...]',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    facing: { kind: 'number', usage: 'degrees', help: 'the way the hero faces and casts (0, +z, by default)' },
    at: SETUP_OPTIONS.at,
    foes: {
      kind: 'number',
      usage: 'n',
      help: 'how many of the biome\'s commonest foes come at him (4 by default; 0: none)',
    },
    times: {
      kind: 'list',
      usage: 'a,b',
      default: '0.4,1.5,3',
      help: 'the moments pictured, s after the press',
    },
    pictures: { kind: 'switch', help: 'picture the moments (=false: the numbers alone)' },
    what: {
      kind: 'list',
      usage: 's,x,y',
      help: 'what the eye meets at a moment (s after the press) and a point of the screen (% across and down)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch, in the first biome and view: a strobe of the exposure, then '
        + 'a white ball before the camera in a run of its own',
    },
    frenzy: {
      kind: 'number',
      usage: 'stacks',
      help: 'his Frenzy\'s stacks as the key is pressed (Wrath spends them, and casts nothing with none)',
    },
    gear: SETUP_OPTIONS.gear,
    weapon: SETUP_OPTIONS.weapon,
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  countsCompiles: true,
  keepsPage: 'own',
  check(options) {
    const wrong = options.times.find((time) => !(Number(time) >= 0));
    if (wrong !== undefined) throw labError(`cast --times: ${wrong} is not a number of seconds`);
    const what = options.what?.map(Number);
    if (what && (what.length !== 3 || what.some((value) => !(value >= 0)))) {
      throw labError(`cast --what: ${options.what.join(',')} is not a moment and a point (s,x,y)`);
    }
  },
  async each(side, options) {
    // (a biome and view at a time, each on its own: its pictures sent back with it)
    const reports = [];
    const scenarios = castScenarios(options);
    for (const scenario of scenarios) {
      const canary = options.canary && reports.length === 0 ? 'strobe' : null;
      reports.push(await side.command('cast', { ...scenario, canary }));
    }
    // (the white ball in a run of its own: under the strobe its light was given the strobe's change)
    if (options.canary) reports.push(await side.command('cast', { ...scenarios[0], canary: 'glare' }));
    return {
      text: reports.map((report) => report.text).join('\n'),
      problems: reports.flatMap((report) => report.problems),
      moments: reports.flatMap((report) => report.moments),
    };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor(join('cast', skillsOf(options).join('-'))));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
