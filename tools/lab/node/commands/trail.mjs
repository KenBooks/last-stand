// `npm run lab -- trail`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { WEAPON_STYLES, SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** the strikes `trail` casts unless `--strikes` says: every one of the warrior's, Rending Cleave each way he holds his
 *  weapons, each other by a way it's swung (Thunder Crescent's two-hander, Twin Fangs' two blades); Bull Rush strikes
 *  with the body, its weapons unswung */
const TRAIL_STRIKES = [
  'cleave@oneHanded', 'cleave@shield', 'cleave@twoHanded', 'cleave@dual', 'powerStrike@twoHanded',
  'crescent@twoHanded', 'tempest@shield', 'twinFangs@dual',
];

/** A strike as `trail --strikes` writes it (`cleave@twoHanded`): its skill, and the way the weapons are held for it. */
function strikeFrom(written) {
  const [skill, style] = written.split('@');
  return style === undefined ? { skill } : { skill, style };
}

/** `lab trail`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the trail a swung weapon leaves (each strike in each view, every frame drawn with it and without: its '
    + 'light where the weapons swept over the last 0.15 s, lit through every blow, its newest end on the blade, '
    + 'nothing while the weapons are still)',
  help: 'the trail a swung weapon leaves, as the player sees it: each strike cast in each view, every frame from '
    + 'the press until the weapons are still drawn with the trail and without, and the pixels it lit told apart; '
    + 'pixels outside where the weapons swept over the last 0.15 s (each weapon placed from its grip to its far '
    + 'end by its own meshes, in the hero\'s frame, as the camera drawing his arms sees it), a blow in the frame '
    + 'with no trail, its newest end off the blade and a trail while the weapons are still are problems; the frame '
    + 'each strike lit most pictured: tools/lab/out/trail (--class warrior)',
  // (`check --every`'s command line: the warrior's strikes)
  audit: ['--class', 'warrior'],
  options: {
    strikes: {
      kind: 'list',
      usage: 'skill[@style],...',
      help: 'the strikes: a skill by its key, its behaviour or its name, and the way the weapons are held for it '
        + `(${WEAPON_STYLES.join(', ')}; as the boot rolled them when not given); the warrior's every strike, and `
        + 'Rending Cleave with each way, by default',
    },
    biome: { kind: 'choice', choices: ['crypt', 'forest'], usage: 'crypt|forest', help: 'the biome (crypt)' },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      default: 'top,third,first',
      help: 'the views: top, third, first',
    },
    pictures: { kind: 'switch', help: 'picture each strike\'s frame its trail lit most (=false: the numbers alone)' },
    frames: {
      kind: 'switch',
      help: 'list every frame: the weapons\' speed, the trail\'s pixels and those outside, its newest column against '
        + 'the weapon and its pixels against the blade',
    },
    canary: {
      kind: 'switch',
      help: 'plant faults the checks must catch, in the first strike: the trail lasting a second, never lit, and '
        + 'through the eyes drawn by the world\'s camera instead of the arms\' own',
    },
    wear: SETUP_OPTIONS.wear,
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  check(options) {
    for (const strike of options.strikes ?? TRAIL_STRIKES) {
      const style = strike.split('@')[1];
      if (style !== undefined && !WEAPON_STYLES.includes(style)) {
        throw labError(`trail --strikes: ${strike}: the styles are ${WEAPON_STYLES.join(', ')}`);
      }
    }
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      strikes: (options.strikes ?? TRAIL_STRIKES).map(strikeFrom),
      biome: options.biome ?? 'crypt',
      views: options.views,
      pictures: options.pictures !== false,
      frames: Boolean(options.frames),
      canary: Boolean(options.canary),
    };
    return side.command('trail', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('trail'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
