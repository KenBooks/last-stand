// `lab ui`'s `logLobby` state (`../uiKit.ts` `Steps`): the battle log over the lobby, clear of its panels
// (`../uiLog.ts`).
import { G } from '../../../../src/state';
import type { Lab } from '../lab';
import { closeLog, LOG_FRAMES, logListed, logShown, logStrikes } from '../uiLog';
import type { Steps } from '../uiKit';

/** the frames a lobby's training dummy has to rise in */
const DUMMY_FRAMES = 120;

/** The battle log shown over the lobby (its panels open, where it must keep clear of them), each skill struck at a
 *  training dummy once it has risen, the panel drawn after. */
async function openLogLobby(lab: Lab): Promise<void> {
  const dummy = G.enemies.find((enemy) => enemy.def.dummy && enemy.alive);
  if (dummy) await lab.until(() => !dummy.invulnerable, DUMMY_FRAMES, 'the training dummy never rose');
  const game = await logStrikes(dummy);
  if (!game) return;
  logListed.lines = game.battleLogLines().length;
  await lab.step(LOG_FRAMES);
}

const STATE: Steps = {
  order: 130,
  open: openLogLobby,
  close: closeLog,
  check: logShown,
};
export default STATE;
