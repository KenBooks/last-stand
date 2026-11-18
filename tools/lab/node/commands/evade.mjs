// `npm run lab -- evade`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab evade`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the shooters getting out of the hero\'s attacks (each foe that evades held before him and each attack of '
    + 'his it evades cast at it try after try: from in front about half evaded, none struck after evading, every '
    + 'other struck; from behind none evaded; a ducked foe struck at its feet; each blink within its reach, clear of '
    + 'the props, the wall and the hero)',
  help: 'the shooters getting out of the hero\'s attacks: each foe that evades (the Sporecaller ducks into the '
    + 'ground, the Rift Witch blinks away) stood before him, held to its spot and kept from shooting, and each '
    + 'attack of his it evades cast at it try after try, from in front of it, from behind it and (a drawn shot at '
    + 'a ducked foe) at its feet, every evade and hit caught; from in front, an evaded share off a half, a try '
    + 'struck after it evaded or missed without it, and a blink out of its reach, into a prop, by the wall or the '
    + 'hero or past a prop, from behind any evade, and at its feet a shot that missed, are problems (--class '
    + 'ranger, mage, warrior)',
  options: {
    skills: {
      kind: 'list',
      usage: 'a,b',
      help: 'the attacks, by key, behaviour or name (every one of the hero\'s that a foe evades by default)',
    },
    tries: {
      kind: 'number',
      usage: 'n',
      help: 'tries from in front, each attack and foe (30 by default; a third as many from behind and at its feet)',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: the foes seeing all round them, and ducking without going down',
    },
    trace: {
      kind: 'switch',
      help: 'list each try: its evade, its hits, and where each of the hero\'s shots ended against the foe\'s feet '
        + 'and top',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.tries !== undefined && !(options.tries >= 3)) throw labError('evade --tries: at least 3');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skills: options.skills ?? [],
      tries: Math.round(options.tries ?? 30),
      canary: Boolean(options.canary),
      trace: Boolean(options.trace),
    };
    return side.command('evade', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
