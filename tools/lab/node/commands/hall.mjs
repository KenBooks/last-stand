// `npm run lab -- hall`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab hall`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the hero in focus in the hall of heroes showing off his skill and standing after it (each hand, elbow and '
    + 'the weapon\'s tip frame by frame in his own frame: a move a frame changing by over 12 cm a jerk, 40 as the '
    + 'weapon flies, the tip\'s by its speed; `--gear`/`--weapon` the weapon in his hand there), then the hall left '
    + 'mid-showcase and any sound it leaves playing; `--glow` the light round the weapon\'s tip frame by frame (the '
    + 'staff\'s crystal: near white, its median and brightest frames, its flashes, pictured at its brightest)',
  help: 'the hero in focus in the hall of heroes (the hero selection screen) showing off his skill and standing '
    + 'after it, frame by frame: each hand, elbow and the weapon\'s tip in his own frame, and each jerk (its move '
    + 'a frame changing by over 12 cm, a jump, a stop or a start; a blow already flying past 25 cm a frame is its '
    + 'own); --gear and --weapon put the weapon in his hand there',
  options: {
    frames: { kind: 'switch', help: 'list every frame a point jerked, with its action and its moves' },
    trace: {
      kind: 'numbers',
      count: 2,
      usage: 'from,to',
      help: 'list every point on each of these frames (as --frames numbers them): where it is in his own frame '
        + '(cm: right, up, forward), its move and its jerk, to see a jerk\'s frames and those round it',
    },
    glow: {
      kind: 'switch',
      help: 'the light round the weapon\'s tip instead (the mage\'s staff\'s crystal) frame by frame: its near '
        + 'white share, its peak against its mean and its flashes, pictured at its brightest and dimmest',
    },
    pictures: { kind: 'switch', help: 'with --glow, picture the tip (on by default; --pictures=false for none)' },
    lobby: {
      kind: 'switch',
      help: 'with --glow, the hero as he stands in the lobby, the run\'s camera on him, not in the hall '
        + '(its canary: the gem\'s glow three times over for a second)',
    },
    canary: {
      kind: 'switch',
      help: 'plant a fault the measure must catch: the right shoulder turned for a frame after the showcase '
        + '(with --glow, the tip\'s glow lit up three times over for a second)',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      gear: options.gear,
      weapon: options.weapon,
      frames: Boolean(options.frames),
      trace: options.trace,
      canary: Boolean(options.canary),
      glow: Boolean(options.glow),
      lobby: Boolean(options.lobby),
      pictures: options.pictures !== false,
    };
    return side.command('hall', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('hall'));
  },
  textOf: asText,
  problemsOf: problemsIn,
};
