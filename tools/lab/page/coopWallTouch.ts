// `lab coop --scenarios wall-touch`' side on each page (node/coopWallTouch.mjs): a ranger's Hedgeward raised in the
// village's training yard breaks when a partner walks into it, on every game, and stands when its own caster does
// (from the owner: "its currently possible to troll other players in coop by denying them entry with ranger's vines
// skill that cannot be destroyed, because skills are disabled outside of training yard... lets make it possiible to
// destroy the vines for other players by touching them"). Its places are in the yard's own frame (`yardToWorld`), so
// they move with it. It imports only what main has too, as `--ab` plays this page on main's tree.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as village from '../../../src/data/village';
import * as hedgeward from '../../../src/combat/skills/hedgeward';
import { wards } from '../../../src/world/wards';
import { groundHeight } from '../../../src/world/ground';
import { cameraYaw, faceCamera, settleCamera } from '../../../src/core/renderer';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { practiseInTheYard } from './coopLobby';
import type { Frame, Lab } from './lab';

/** a spot in the yard's own frame: across it and along it (m) */
type YardSpot = [number, number];

/** how near the spot he walks to he stops (m) */
const THERE = 0.15;

/** where this game's hero walks to (the world's x, z), or none */
let walkingTo: [number, number] | null = null;
/** whether the stick is still to be let go (it stays where a frame left it until one says otherwise) */
let stopping = false;

/** A spot of the yard's own frame in the world. */
const world = ([across, along]: YardSpot): [number, number] => village.yardToWorld(across, along);

/** This game's hero stood at `at` in the yard (its own frame), facing along its across, his camera behind him. */
export function coopWallTouchStand(_lab: Lab, { at }: { at: YardSpot }): void {
  practiseInTheYard();
  const [x, z] = world(at), [ax, az] = world([at[0] + 1, at[1]]);
  const facing = Math.atan2(ax - x, az - z);
  walkingTo = null;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  settleCamera(G.player.pos);
}

/** The key the local hero's Hedgeward is on, and the world's spot of yard spot `at` to aim it at: the lab's resting
 *  aim put there too, as the frame the key is let go takes it (a cursor stays where it was). */
export function coopWallTouchKey(lab: Lab, { at }: { at: YardSpot }): { key: string | null; aim: [number, number] } {
  const key = SKILL_KEYS.find((each) => G.player.skillAt(each)?.def.impl === 'hedgeward') ?? null;
  G.player.cooldowns.clear();
  G.player.energy = G.player.stats.maxEnergy;
  const aim = world(at);
  lab.aim = new THREE.Vector3(aim[0], 0, aim[1]);
  return { key, aim };
}

/** This game's hero walks straight for yard spot `to` by the move stick (none: he stops). `canary`: a wall he breaks
 *  by touch is never told to the other games (where the game has the canary at all: main's hasn't). */
export function coopWallTouchWalk(_lab: Lab, { to, canary = false }: { to: YardSpot | null; canary?: boolean }): void {
  walkingTo = to ? world(to) : null;
  stopping = !to;
  const hold = (hedgeward as { holdTouchWord?: (hold: boolean) => void }).holdTouchWord;
  hold?.(canary);
}

/** The stick pushed to walk along world way (x, z), as the screen turns it. */
function stickToward(x: number, z: number): [number, number] {
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw), length = Math.hypot(x, z) || 1;
  return [(x * cy - z * sy) / length, (x * sy + z * cy) / length];
}

/** The input of a frame of the walk (`coopWallTouchWalk`), or null while this game's hero isn't walking. */
export function wallTouchInput(): Frame | null {
  if (stopping) {
    stopping = false;
    return { stick: [0, 0] };
  }
  if (!walkingTo) return null;
  const dx = walkingTo[0] - G.player.pos.x, dz = walkingTo[1] - G.player.pos.z;
  if (Math.hypot(dx, dz) < THERE) {
    walkingTo = null;
    return { stick: [0, 0] };
  }
  return { stick: stickToward(dx, dz) };
}

/** What this game shows: the walls standing (their middles in the yard's frame, their life) and where its hero is. */
export interface WallTouchSeen {
  walls: { across: number; along: number; life: number }[];
  hero: { across: number; along: number };
}

export function coopWallTouchSeen(): WallTouchSeen {
  const walls = wards.map((ward) => {
    const [across, along] = village.worldToYard((ward.ax + ward.bx) / 2, (ward.az + ward.bz) / 2);
    return { across, along, life: ward.prop.life };
  });
  const [across, along] = village.worldToYard(G.player.pos.x, G.player.pos.z);
  return { walls, hero: { across, along } };
}
