// `npm run lab -- headshots`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab headshots`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the bow\'s and the fists\' headshots (#750: every kind of foe, bosses and the dummy too, stood before the '
    + 'ranger and shot with each aimed shot at the middle of its head and at its chest, his own crit chance put to '
    + 'nothing: over the shoulder every head shot must strike and crit, every chest shot strike and not; top-down none '
    + 'crits; `--class warrior` punches them with Savage Fists: through the eyes the head punches crit, from outside '
    + 'none) (in full: [`commands/headshots.md`](commands/headshots.md))',
  help: 'the ranger\'s headshots: every kind of foe (the bosses and the training dummy among them) stood alone before '
    + 'him in its idle pose, thinking nothing, and each of his aimed shots (Nockshot, Briarflight, Lancewood Shot) '
    + 'drawn to '
    + 'full at the middle of its head as drawn (the vertices its head joint moves) and at its chest; his own chance '
    + 'of a critical hit is put to nothing, so a crit is the game judging a headshot. A head shot that misses or '
    + 'doesn\'t crit, and a chest shot that misses or crits, are problems; so is a canary missed. Top-down none '
    + 'headshots (the cursor over a foe meets its head from above): there a head shot that crits is the problem '
    + '(--class ranger). With --class warrior, both hands empty, each foe is punched with Savage Fists, the crosshair '
    + 'on its head and on its chest: through the eyes the head punch must strike and crit, the chest punch strike and '
    + 'not; from outside the fist\'s line is at the chest and none may crit',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      help: 'the views: over the shoulder\'s and through the eyes\' head shots must be headshots, top-down\'s none '
        + '(third,top by default); a punch\'s through the eyes alone (first,third by default)',
    },
    foes: {
      kind: 'list',
      usage: 'a,b',
      help: 'the kinds of foe, by id (every kind by default)',
    },
    skills: {
      kind: 'list',
      usage: 'a,b',
      help: 'the shots, by key, behaviour or name (nockShot, fanShot and piercingShot by default)',
    },
    canary: {
      kind: 'switch',
      help: 'the first foe\'s head taken to be the joint its trunk hangs from: its chest shot must be found a '
        + 'headshot',
    },
    trace: {
      kind: 'switch',
      help: 'say how high each shot was aimed and where it struck, as shares of its height',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      views: options.views ?? [],
      foes: options.foes ?? [],
      skills: options.skills ?? [],
      canary: Boolean(options.canary),
      trace: Boolean(options.trace),
    };
    return side.command('headshots', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
