// `npm run lab -- swing`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab swing`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a swing through the eyes keyed from a pose (the key that holds a grip and a weapon\'s way, and what of it '
    + 'the swing\'s plane can\'t hold; each key placed as the game places it at its share: the grip, the weapon and '
    + 'its share in the frame, the elbow, the wrist, a two-hander\'s lower grip against the other arm\'s reach, where '
    + 'it starts against the swing before\'s end; turned as the trunk turns the cut or its way back; the whole swing '
    + 'in 1% steps, an elbow turned over and a lower grip past reach between the keys; `all`: every swing of every '
    + 'weapon each way held, as `check` runs it)',
  help: 'a swing through the eyes keyed from a pose (src/entities/viewSwing.ts): the key of the swing that puts its '
    + 'grip at --grip and its weapon along --way (camera space: m, x right, y up, -z ahead), and what of the pose an '
    + 'arm swung in its plane can\'t hold (the grip or the way off the plane, the wrist past its range, the grip '
    + 'past the reach); a key given placed (--key), or else every key of the swing: the grip, the weapon, the elbow, '
    + 'the wrist and a two-hander\'s lower grip, with how far it is from the other shoulder (--class warrior)',
  argument: 'swing',
  options: {
    grip: {
      kind: 'numbers',
      each: 3,
      usage: 'x,y,z[,x,y,z...]',
      help: 'the grip\'s place in the view to key, or several, a pose each (with --way)',
    },
    way: {
      kind: 'numbers',
      each: 3,
      usage: 'x,y,z[,x,y,z...]',
      help: 'the weapon\'s way in the view to key, or one for each --grip',
    },
    key: {
      kind: 'numbers',
      each: 5,
      usage: 'way,reach,bend,drop,roll[,...]',
      help: 'a key to place, or several, its numbers after its share (models/warriorEyes.ts `warriorSwings`)',
    },
    left: {
      kind: 'switch',
      help: 'the left hand\'s swing: the right\'s mirrored across the view, as a dual wielder\'s off hand cuts '
        + '(--gear dual)',
    },
    turn: {
      kind: 'number',
      usage: 'rad',
      help: 'the trunk turned this far to the left, as a cut turns it (models/warriorEyes.ts `twoTurn`): the keys '
        + 'placed turned with it round the spine, and a pose (--grip, --way) taken as the eyes see it so turned',
    },
    trunk: {
      kind: 'choice',
      choices: ['rest', 'row', 'back', 'foreOut', 'backOut'],
      usage: 'rest|row|back|foreOut|backOut',
      help: 'each of the swing\'s keys turned as the trunk turns a cut of the hero\'s weapons at its share '
        + '(viewSwing.ts `cutTurnAt`): a forehand from rest, one in a row, or a backhand (in a row, the other way: '
        + 'a two-hander\'s backhand, a dual wielder\'s left hand\'s cut); or the way back to the guard after a '
        + 'forehand or a backhand, the turn its end left unwound (models/warrior.ts)',
    },
    canary: {
      kind: 'switch',
      help: 'the swing\'s blow keyed back from where its own key places it, and a grip moved 10 cm off its plane, '
        + 'must come back as that key and read 10 cm off',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  check(options) {
    if (options.grip?.length !== options.way?.length) throw labError('swing: --grip with a --way for each');
  },
  each(side, options) {
    const command = {
      fixture: { view: 'first', ...fixtureFrom(options) },
      swing: options._[0],
      at: options.grip ?? null,
      dir: options.way ?? null,
      key: options.key ?? null,
      left: Boolean(options.left),
      turn: options.turn ?? 0,
      trunk: options.trunk ?? null,
      canary: Boolean(options.canary),
    };
    return side.command('swing', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
