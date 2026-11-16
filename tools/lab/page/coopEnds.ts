// `lab coop --scenarios ends`: the ways a co-op run ends that leave a player apart from the party, as players meet
// them (tools/lab/node/coopEnds.mjs drives it; from play: "once the run ends and no one is playing any wave it should
// automatically spawn you back with the others"). A host out of the run who leaves it again while a guest plays on
// (his game is the one that runs the fight: it went to the lobby, and the guest's fight stopped where it stood, no
// wave to come and no end to send him back), and the whole party falling.
import { G } from '../../../src/state';
import { hurtPlayer } from '../../../src/combat/damage';
import { abandonRun } from '../../../src/game/run';
import { session } from '../../../src/net/session';
import { ABANDON_HOLD_MS, showPause } from '../../../src/ui/menus';
import { realWait, type Lab } from './lab';

/** how much longer than its hold Leave the run is held (ms): its timer runs on the browser's clock */
const HOLD_SLACK_MS = 300;
/** a blow no hero outlives, on a hero down to this much life */
const DEADLY = 1e9;
const LAST_LIFE = 1;

/** Where this game's heroes stand, for the lab to judge the party together (`CoopState`'s part of it). */
export interface Together {
  /** its own hero down (to be raised), and how many of its partners it shows down */
  down: boolean;
  partnersDown: number;
  /** how far its own hero stands from the furthest partner as it shows them (m; 0 with none) */
  apart: number;
  /** the partners it doesn't show: in the other place (the lobby while it's in a run, or the other way round) */
  hidden: number;
}

/** Where this game's heroes stand now. */
export function togetherNow(): Together {
  const partners = G.players.filter((player) => !player.local);
  const own = G.player.pos;
  return {
    down: G.player.downed,
    partnersDown: partners.filter((player) => player.downed).length,
    apart: Math.max(0, ...partners.map((player) => Math.hypot(player.pos.x - own.x, player.pos.z - own.z))),
    hidden: partners.filter((player) => player.away).length,
  };
}

/**
 * This game's player, out of the run already, opens the pause menu to leave it again as a player would. Returns
 * whether the menu offered it (Leave the run shown, then held through).
 */
export async function coopLeaveAgain(lab: Lab): Promise<boolean> {
  if (!G.player.out) throw new Error('lab: coop: leaving the run again, the player was never out of it');
  showPause(true);
  const button = document.getElementById('btn-abandon')!;
  if (button.classList.contains('hidden')) {
    showPause(false);
    return false;
  }
  const box = button.getBoundingClientRect();
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  await lab.mouseDown(at);
  await realWait(ABANDON_HOLD_MS + HOLD_SLACK_MS);
  await lab.mouseUp(at);
  showPause(false);
  return true;
}

/** This game's hero struck dead, as a foe's blow kills him (judged on his own game, as every blow at him is). */
export function coopFall(): void {
  G.player.life = LAST_LIFE;
  hurtPlayer(G.player, DEADLY);
  if (G.player.alive) throw new Error('lab: coop: a deadly blow, and the hero still stands');
}

/** The code of the room this game is in, for a player who joins it later. */
export function coopCode(): string {
  return session.code;
}

/** The canary: this game drops the run and stands in the lobby, as the host's did leaving a run it was out of. */
export function coopQuitCanary(): void {
  abandonRun();
  G.mode = 'menu';
}
