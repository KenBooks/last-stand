// `npm run lab -- lobbystart`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * The game opened again on `side`'s page as a returning player opens it: the lab's boot warmed everything, which marks
 * this build as one that warmed here (game/warmup.ts `rememberWarmed`) and keeps its maps; the page is reloaded with
 * its storage kept (`lab.keepStorage`, browser.mjs `freshStorage`) and its loading screen waited out cold, so the
 * game warms behind the lobby what a return warms there. A lab boot clears the page's storage, so a cold one is a
 * first visit's, whose warm-ups wait until something needs them. The page is left stale: the next command boots its
 * own.
 */
async function asReturn(side) {
  await side.page.evaluate(() => sessionStorage.setItem('lab.keepStorage', '1'));
  const reload = () => side.page.reload({ waitUntil: 'domcontentloaded', timeout: 0 });
  await side.bootBy(side.page, reload, '', true);
  await side.installLab(side.page);
  side.stale = true;
}

/** `lab lobbystart`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a return\'s lobby from its reveal, frame by frame, till nothing is left to do behind it: the page '
    + 'reloaded as a player opens the game again, each frame stepped and drawn and timed by the browser\'s clock (the '
    + 'game\'s frame, the queue\'s building, each warm-up\'s slices after it), over its first 2 s, to 10 s and after; '
    + 'the most work behind the lobby a frame at most 25 ms (`--canary`: each hero built whole behind it)',
  help: 'a return\'s lobby from its reveal, as the player meets it: the page booted, then reloaded with its storage '
    + 'kept, so the fight\'s, the heroes\' and the rooms\' warm-ups run behind the lobby and its queue still builds '
    + 'the heroes; each frame stepped and drawn, the browser let go for the warm-ups\' slice of it, and timed by the '
    + 'browser\'s clock (the game\'s frame, the queue\'s building, each warm-up\'s slices), over its first 2 s, to '
    + '10 s and after; the most work behind the lobby a frame at most 25 ms, the slowest slices named',
  options: {
    canary: { kind: 'switch', help: 'the lobby\'s budget for what\'s built behind it lifted, each hero built whole '
        + 'there as before: must be caught' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    await asReturn(side);
    return side.command('lobbyStart', { canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
