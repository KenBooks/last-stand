// The Rootmother's root cage in co-op (tools/lab `coop --scenarios rootcage`; entities/rootCage.ts): the guest stands
// still till she cages it, the host comes up beside the cage and strikes the root nearest it, and the guest walks out
// through its gap. What each game shows of the cage is read for the judge (`describeRootCage` in node/coopJudge.mjs).
// Loaded as the scenario starts (page/coop.ts), so a tree without the cage still loads coop's module.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { CAGE, CAGE_LOG, caged } from '../../../src/entities/rootCage';
import { cameraYaw } from '../../../src/core/renderer';
import { FX } from '../../../src/entities/enemyAI';
import type { Frame } from './lab';

const C = ROOTMOTHER.cage;
/** how far outside a root the host stands to strike it (m), and how far out past the ring the guest walks (m) */
const BESIDE = 2.5;
/** how far off its spot the host may be pushed and still strike from where it is (m): walked back each time it was
 *  pushed 0.3 m, it let its draws go early and missed */
const NEAR_ENOUGH = 1;
const PAST = 3;
/** the host's pacing while it waits, so she cages the guest and never it (frames each way, along its line to him) */
const PACE = 50;
/** how high up a root the host aims (m): its foot, where it's thickest */
const AIM_HIGH = 0.6;

/** A root of the cage as a game shows it: its foot, its life (as a prop's) and whether it's broken. */
export interface RootSample { x: number; z: number; life: number; broken: boolean }

/** What a game shows of the cage in a frame: its middle and whether it's shut (none: no cage), its roots, whether
 *  this game's own hero is caged, and whether its blow landed this frame. */
export interface CageSample {
  at: [number, number] | null;
  shut: boolean;
  roots: RootSample[];
  caged: boolean;
  blow: boolean;
}

/** the blows already sampled as landed */
const blown = new Set<object>();

/** this game's own `cageRoot` fx while the canary has it deaf (the roots never told their life by the host) */
let heard: typeof FX.cageRoot | null = null;

/** The canary set or cleared for this game: its roots deaf to the host's word of their life. */
export function deafOnThisGame(on: boolean): void {
  if (on && !heard) {
    heard = FX.cageRoot;
    FX.cageRoot = () => {};
  } else if (!on && heard) {
    FX.cageRoot = heard;
    heard = null;
  }
}

/** The cage as this game shows it now. */
export function cageNow(): CageSample {
  const log = CAGE_LOG[CAGE_LOG.length - 1];
  const blow = !!log && log.blowAt >= 0 && !blown.has(log);
  if (blow) blown.add(log);
  if (!CAGE) return { at: null, shut: false, roots: [], caged: false, blow };
  const roots = CAGE.roots.map((root) => ({
    x: root.x,
    z: root.z,
    life: root.prop?.life ?? 0,
    broken: root.prop ? root.prop.broken : root.broken >= 0,
  }));
  return { at: [CAGE.x, CAGE.z], shut: CAGE.shut, roots, caged: caged(G.player), blow };
}

/** The touch stick pushed to walk this game's hero along world way (x, z), as the screen turns it. */
function stickToward(x: number, z: number): [number, number] {
  const yaw = cameraYaw();
  const cos = Math.cos(yaw), sin = Math.sin(yaw), length = Math.hypot(x, z) || 1;
  return [(x * cos - z * sin) / length, (x * sin + z * cos) / length];
}

/** The standing root of the shut cage nearest (x, z), or null. */
function rootNearest(x: number, z: number) {
  if (!CAGE?.shut) return null;
  const standing = CAGE.roots.filter((root) => root.prop && !root.prop.broken);
  return standing.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] ?? null;
}

/** A frame of this game's hero's basic attack at `at`, as fast as it goes: held down (queued while busy), a drawn shot
 *  let go as it reaches its least draw. */
function strikeAt(at: THREE.Vector3): Frame {
  const hero = G.player;
  hero.facing = Math.atan2(at.x - hero.pos.x, at.z - hero.pos.z);
  const cast = hero.casting;
  const drawn = cast?.drawT && !cast.fired ? (cast.t - (cast.nockT ?? 0)) / cast.drawT : 0;
  return { m0: drawn < (cast?.skill.def.minDraw ?? 1), aim: at };
}

/** the root the host goes for, chosen once a cage round the guest (the nearest the host then) */
let goneFor: NonNullable<ReturnType<typeof rootNearest>> | null = null;

/** The host: pacing off till the guest is caged, then up beside the root nearest it, striking it till it breaks. */
export function hostInput(frame: number): Frame {
  const hero = G.player;
  const guest = G.players.find((player) => !player.local);
  const round = CAGE && guest && Math.hypot(guest.pos.x - CAGE.x, guest.pos.z - CAGE.z) < C.radius;
  if (!round || !CAGE?.roots.includes(goneFor!) || goneFor?.prop?.broken) goneFor = null;
  if (round) goneFor ??= rootNearest(hero.pos.x, hero.pos.z);
  const root = goneFor;
  if (!root || !CAGE) {
    // (to and fro along his line to the guest: off it, a prop at the far end of a pace held him still, and caged)
    const to = guest
      ? new THREE.Vector2(guest.pos.x - hero.pos.x, guest.pos.z - hero.pos.z).normalize()
      : new THREE.Vector2(1, 0);
    const back = Math.floor(frame / PACE) % 2 ? -1 : 1;
    return { stick: stickToward(to.x * back, to.y * back) };
  }
  const out = new THREE.Vector2(root.x - CAGE.x, root.z - CAGE.z).normalize();
  const spot = { x: root.x + out.x * BESIDE, z: root.z + out.y * BESIDE };
  // (aimed at its foot's thick part all the while, walking up too: aimed at nothing, the aim fell back on her)
  const at = new THREE.Vector3(root.x, AIM_HIGH, root.z);
  const off = Math.hypot(spot.x - hero.pos.x, spot.z - hero.pos.z);
  if (off > NEAR_ENOUGH) return { stick: stickToward(spot.x - hero.pos.x, spot.z - hero.pos.z), aim: at };
  return strikeAt(at);
}

/** The guest: standing still (so she cages it), then, once a root is broken on its own game, out through its gap. */
export function guestInput(): Frame {
  if (!CAGE?.shut) return {};
  const gap = CAGE.roots.find((root) => root.prop?.broken);
  if (!gap) return {};
  const way = new THREE.Vector2(gap.x - CAGE.x, gap.z - CAGE.z).normalize();
  const to = { x: CAGE.x + way.x * (C.radius + PAST), z: CAGE.z + way.y * (C.radius + PAST) };
  const hero = G.player;
  if (Math.hypot(to.x - hero.pos.x, to.z - hero.pos.z) < 0.3) return {};
  return { stick: stickToward(to.x - hero.pos.x, to.z - hero.pos.z) };
}
