// `npm run lab -- cloud`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab cloud`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'cloud saves end to end, two devices each with a passkey against a saves service of the lab\'s own (an '
    + 'account made and slot 2 chosen as the cloud save, a second device signed in by a code with every slot full, a '
    + 'hero changed on both while one was offline, different heroes changed on each, the second device opened again '
    + 'cold with a change waiting in the cloud and its play saved before its warm-up ends (#556): each device\'s '
    + 'slots and the service\'s save read back; the bar and dialogs pictured within the window at desktops\', a '
    + 'tablet\'s and a phone\'s sizes, `out/cloud`; `--canary` drops an item from a download, and the cloud\'s change '
    + 'from the hero played after the reboot)',
  variants: {
    '--google': 'real sign-in controls/window and lightweight callback, with local OAuth replies: no game reload, one '
      + 'nonce-bound finish, link, cancel and blocked-popup redirect; `--canary` supplies an invalid code.',
  },
  help: 'cloud saves end to end: two devices, each with a passkey of its own, on the save slots screen\'s cloud bar '
    + 'and dialogs against a saves service of the lab\'s own (server/saves): an account made and slot 2 chosen as the '
    + 'cloud save, a second device signed in by a code with every slot full (the slot lost named before anything '
    + 'changes), a hero changed on both while one was offline (asked, the cloud\'s kept, the other copy lost or '
    + 'moved to a free slot as the dialog said), different heroes changed on each (no question, both kept), the '
    + 'second device opened again cold with a change waiting in the cloud and its play saved before its warm-up '
    + 'ends (the change kept in play, in its slot and in the service, #556); each '
    + 'device\'s slots and the service\'s save read back, and the bar and dialogs pictured within the window at '
    + 'desktops\', a tablet\'s and a phone\'s sizes (out/cloud)',
  options: {
    google: { kind: 'switch', help: 'Google window sign-in/link, cancel and redirect fallback alone (local replies)' },
    pictures: { kind: 'switch', help: 'picture the screen at each moment (=false: the checks alone)' },
    canary: {
      kind: 'switch',
      help: 'the mage\'s stash item dropped from the second device\'s download, and the cloud\'s change from the '
        + 'hero it plays after its reboot: each caught',
    },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    if (options.google) {
      const { runGoogleWindow } = await import('../googleWindow.mjs');
      return runGoogleWindow(side, { canary: Boolean(options.canary), pictures: options.pictures !== false });
    }
    const { runCloud } = await import('../cloud.mjs');
    return runCloud(side, { canary: Boolean(options.canary), pictures: options.pictures !== false });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
