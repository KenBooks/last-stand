// `npm run lab -- throws`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab throws`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what the slammers throw at a hero too far off to slam (the Brute\'s lava at him stood still: landing '
    + 'where he stood as it was thrown, its ring there every frame it flies, its splash and pool hurting him; stepped '
    + 'off, nothing hurting him; up close, a slam and no throw; the Hulk\'s vine holding him for its hold, his '
    + 'walking going nowhere; stepped aside, never caught; stepped back onto it as it lies, held; a dash tearing him '
    + 'free; an arrow shot into it cutting it, `--class ranger`)',
  help: 'what the slamming foes throw at a hero too far off to slam, the thrower held to its spot and throwing as '
    + 'its AI has it, a throw a case: the Cinder Brute\'s lava at him stood still (it must land where he stood as '
    + 'it left the hand, its ring there every frame it flies, its splash and its pool hurting him), stepped off as '
    + 'it\'s thrown (nothing may hurt him) and up close (it slams, throwing nothing); the Barkhide Hulk\'s vine at him '
    + 'stood still (held for its hold, his walking going nowhere, walking after), stepped aside (never caught), '
    + 'stepped back onto it as it lies (held then, not before) and '
    + 'dashing once held (torn free: --class warrior, mage)',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: a splash far wider than its ring, a vine catching far off its '
        + 'line, and a dash leaving the hero held',
    },
    trace: {
      kind: 'switch',
      help: 'list each case\'s frames: the chunk\'s flight, the hero\'s place and hold',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      canary: Boolean(options.canary),
      trace: Boolean(options.trace),
    };
    return side.command('throws', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
