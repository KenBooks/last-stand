// `npm run lab -- heard`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab heard`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the sounds each skill plays as its key is held as a player holds it, at foes stood where it strikes '
    + '(every sound the game asks for, when from the press, a held sound\'s start and stop; a skill playing nothing, '
    + 'a held sound never stopped, a sound it\'s known to play missing; `--hold`, `--biome`, `--awake` for the blows '
    + 'foes strike at a lure, `--canary`)',
  help: 'the sounds each skill plays as its key is held as a player holds it (a drawn shot to full, a channel for '
    + 'seconds, or --hold), at foes stood where it strikes: every sound the game asks for caught, its name, what it '
    + 'was given and when from the press, a held sound\'s start and stop; a skill that plays nothing, a held sound '
    + 'never stopped and a sound the skill is known to play missing are problems (heard nockShot,arrowRain --class '
    + 'ranger); what each sounds like is sound\'s',
  argument: 'skills',
  options: {
    hold: { kind: 'number', usage: 's', help: 'how long each skill\'s key is held (else as a player holds it)' },
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome he stands in (the lobby\'s by default): an arrow glances off the crypt\'s stone floor and '
        + 'sticks in the forest\'s earth',
    },
    awake: {
      kind: 'switch',
      help: 'the foes left awake once risen (dazed otherwise): they come at the hero, or at his lure and strike it '
        + '(heard strawman --awake: its blows)',
    },
    canary: { kind: 'switch', help: 'plant the fault the checks must catch: a held sound started and never stopped' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  keepsPage: 'own',
  check(options) {
    if (options.hold !== undefined && !(options.hold > 0)) throw labError('heard --hold: more than 0 s');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skills: options._[0].split(','),
      hold: options.hold,
      biome: options.biome,
      awake: Boolean(options.awake),
      canary: Boolean(options.canary),
    };
    return side.command('heard', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
