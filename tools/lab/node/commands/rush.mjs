// `npm run lab -- rush`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rush`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the foes Bull Rush sweeps up (stood dazed on its line and at its sides, killed, an elite and the boss, in '
    + 'a lane clear of props: when each was met, how long it rode before the hero and how near his body, how it was '
    + 'let go and where it ended against his stop), and skills cast with it (a Power Strike charged and the charge '
    + 'cast over it, a cleave and Twin Fangs as it runs, a strike at its stop, the charge cast over a held Steel '
    + 'Tempest: when each was cast and landed, what the charge\'s own blows struck, what was shown, his strides), and '
    + 'packs rammed (#397, #560: the load each bears against its most, how far it goes, a boss struck and never '
    + 'moved, and the stagger at the stop against the weight met, no move or cast in it; none for a small or a killed '
    + 'pack)',
  help: 'Bull Rush\'s foes as it sweeps them up:foes stood dazed on its line and at its sides (living, a hair from '
    + 'death, an elite and the boss), a set at a time, each followed until it is still (when it was met, how long it '
    + 'rode before the hero and how near his body, how it was let go, where it ended against where he stopped); a '
    + 'foe never met, left standing, carried inside him or ending behind or beside him, a living foe left unthrown '
    + 'and an elite or a boss thrown are problems; then skills cast with it (a Power Strike charged and the charge '
    + 'cast over it, a cleave and Twin Fangs as it runs, a strike at its stop, the charge cast as Steel Tempest '
    + 'spins and with the shield raised): one not cast as pressed, landed out of the run, striking nothing, shown '
    + 'as the charge, off its strides or let go as it runs, and the charge striking less than every foe on its '
    + 'line or falling short, are problems: tools/lab/out/rush (--class warrior)',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: ['sets', 'casts', 'bonus', 'stun'],
      help: 'the parts (all by default): sets (the sets of foes the charge is cast through), casts (the skills '
        + 'cast with it, those the weapons held allow), bonus (its blows with a shield and a lone one-hander, '
        + 'each within the damage its data gives it held that way, #398) and stun (packs rammed, #397 and #560: a '
        + 'big one, an elite one, a huge one and a boss, the load carried and how far it went, the stun at the '
        + 'stop for the time its weight gives, no move or cast meanwhile; a small one and a killed one stun nothing)',
    },
    dummies: {
      kind: 'switch',
      help: 'cast the skills with the charge at the lobby\'s training dummies (planted, never carried) in place of '
        + 'the biome\'s foes',
    },
    pictures: {
      kind: 'switch',
      help: 'picture each set as the charge stops and once every foe is still, and each skill cast with it as it '
        + 'lands (=false: the numbers alone)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: the first foe thrown put behind the hero as it lands, the '
        + 'charge shown in the strike\'s place as both run, its legs dropped from under the cleave, its blows '
        + 'made harmless, Steel Tempest let go as it is cast, the charge cut short as Twin Fangs lands, and the big '
        + 'pack\'s stun cut short',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  keepsPage: true,
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      pictures: options.pictures !== false,
      canary: Boolean(options.canary),
      scenarios: options.scenarios,
      dummies: Boolean(options.dummies),
    };
    return side.command('rush', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('rush'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
