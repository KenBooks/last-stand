// The Stag of Ash in co-op (tools/lab `coop --scenarios stag`): what each game shows of its new attacks, read for the
// judge (node/coopStag.mjs): its stakes standing and each one's life, the wood alight, its own hero's height and its
// partner's (a toss), its own hero thrown. Loaded as the scenario starts (page/coop.ts), so a tree without the Stag
// still loads coop's module.
import { G } from '../../../src/state';
import { FX, fx } from '../../../src/entities/enemyAI';
import { BURNING, STAKES_STANDING } from '../../../src/entities/stag';
import type { Enemy } from '../../../src/entities/enemy';
import { hurtProp } from '../../../src/world/destructible';

/** What a game shows of the Stag in a frame. */
export interface StagSample {
  /** its stakes standing: where each stands and its life */
  stakes: [number, number, number][];
  /** the wood alight: where each piece's first circle stands */
  burning: [number, number][];
  /** its own hero's height over the ground and whether he's thrown (`Player.flying`), and its partner's height */
  lift: number;
  flying: boolean;
  partnerLift: number;
  /** what the Stag is doing (its action's name; none: '') */
  doing: string;
}

/** The Stag's sample on this game. */
export function stagNow(): StagSample {
  const partner = G.players.find((p) => !p.local);
  const round = (v: number): number => Math.round(v * 100) / 100;
  return {
    stakes: STAKES_STANDING.map((s) => [round(s.x), round(s.z), round(s.prop.life)]),
    burning: BURNING.map((b) => [round(b.parts[0].x), round(b.parts[0].z)]),
    lift: round(G.player.lift),
    flying: G.player.flying,
    partnerLift: round(partner?.lift ?? 0),
    doing: G.enemies.find((e) => e.type === 'stag' && e.alive)?.action?.name ?? '',
  };
}

/** The scenario's moments, frames after it settled: its breath over the log, its life taken under its second phase's
 *  share on the host (its shed, as soon as it's free), and a stake struck three times by the host's game `strike`
 *  frames after its stakes stand (the shed waits out what it's doing: struck at a fixed frame, once the stakes stood
 *  too late for it), `apart` frames between hits as a hero's come (a prop's wear is told at most every 140 ms,
 *  `hurtProp`: three in a frame told the first alone) */
export const STAG_AT = { breath: 30, shed: 600, strike: 60, apart: 15 };
/** the frame the stakes stood on the host's game (-1: not yet) */
let stoodAt = -1;

/** The host's turn of the scenario's frame `frame`: its breath over the log at `STAG_AT.breath`, its life taken at
 *  `STAG_AT.shed`, a stake struck `STAG_AT.strike` frames after they stand (as a hero's hits wear a prop, on the game
 *  that simulates them). */
export function stagHostFrame(frame: number): void {
  const stag = G.enemies.find((e: Enemy) => e.type === 'stag' && e.alive);
  if (frame === 0) stoodAt = -1;
  // (its breath over the nearest log as the scenario begins, before its walk after the guest tramples it: the host's
  // game decides what wood its breath touches, as its own breath's would, and tells the guest)
  if (frame === STAG_AT.breath && stag) breatheAtWood(stag);
  if (frame === STAG_AT.shed && stag) stag.takeDamage(stag.life - 0.45 * stag.maxLife, {});
  if (stoodAt < 0 && STAKES_STANDING.length) stoodAt = frame;
  const hit = (frame - stoodAt - STAG_AT.strike) / STAG_AT.apart;
  const struck = STAKES_STANDING[0]?.prop.parts[0];
  if (stoodAt >= 0 && hit >= 0 && hit < 3 && Number.isInteger(hit) && struck) hurtProp(struck, 1);
}

/** The stag's breath, as its own `breath` fx, swept over the nearest wood standing. */
function breatheAtWood(stag: Enemy): void {
  const wood = G.arena.obstacles
    .filter((o) => o.prop?.kind === 'wood' && !o.prop.broken)
    .sort((a, b) => Math.hypot(a.x - stag.pos.x, a.z - stag.pos.z) - Math.hypot(b.x - stag.pos.x, b.z - stag.pos.z))[0];
  if (!wood) return;
  const at = Math.atan2(wood.x - stag.pos.x, wood.z - stag.pos.z);
  fx('breath', stag.id, stag.pos.x, stag.pos.z, at - 0.3, at + 0.3, 0);
}

/** The canary: this game deaf to its stakes' life as the host tells it (`stakeLife` dropped), so its copies of them
 *  stand whole where the host's are worn. Returns a function that takes it off again. */
export function deafToStakes(): () => void {
  const was = FX.stakeLife;
  FX.stakeLife = () => undefined;
  return () => { FX.stakeLife = was; };
}
