// `lab coop --scenarios choir`'s side on each page (node/coopChoir.mjs): the Ossuary Cantor's choir's ring and rising
// graves on two games. Both stand in the crypt; the host raises the Cantor, dazed, then casts its ring and warns its
// stones at spots it rolls (`graveSpot`), as its fight does: every game shows them from the host's fx. Each frame
// each page keeps the rings it shows (`ringsShown`: middle, radius, age) and its stones' spots, for the judge.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { WAVES } from '../../../src/data/waves';
import { ENEMIES } from '../../../src/data/enemies';
import { FX, fx } from '../../../src/entities/enemyAI';
import { graveSpot, ringsShown, type RingShown } from '../../../src/entities/cantor';
import { spawnEnemy } from '../../../src/entities/spawner';
import { risenGraves } from '../../../src/world/risenGraves';

/** One frame on this page: the game's time, the rings shown and the stones standing. */
export interface ChoirSample {
  time: number;
  rings: RingShown[];
  stones: { x: number; z: number }[];
}

/** where the Cantor rises (m), how many stones the host warns, and for how long (s) */
const CANTOR_AT: [number, number] = [0, -9];
const STONES = 6;
const STONE_WARN = 1.2;

/** this page's frames kept, the hook keeping them, and the canary's planted handler with what it replaced */
const samples: ChoirSample[] = [];
let sampling: (() => void) | null = null;
let replaced: (typeof FX)['graveStone'] | null = null;

/** This frame's rings and stones, as this game shows them. */
function sampleNow(): ChoirSample {
  return {
    time: G.time,
    rings: ringsShown.map((ring) => ({ ...ring })),
    stones: risenGraves.filter((grave) => grave.down === 0).map((grave) => ({ x: grave.x, z: grave.z })),
  };
}

/** The run held on the host (no wave comes, its foes left to the scenario), each frame. */
function holdRun(): void {
  const run = G.run;
  if (!run) return;
  run.queue = [];
  run.phase = 'countdown';
  run.timer = Infinity;
}

/**
 * This page set up: in the crypt, its hero at `at`, its frames kept from now. On the host, the run held. `canary`
 * (the guest's alone): its game raises each stone a metre off the spot it's told.
 */
export function coopChoirSetup(lab: Lab, { at, host, canary }: { at: [number, number]; host: boolean; canary: boolean }): void {
  if (G.arena.biome !== 'crypt') G.arena.setBiome('crypt');
  G.player.place(new THREE.Vector3(at[0], 0, at[1]), Math.atan2(-at[0], -at[1]));
  samples.length = 0;
  sampling = () => {
    if (host) holdRun();
    samples.push(sampleNow());
  };
  lab.beforeFrame.push(sampling);
  if (canary) {
    replaced = FX.graveStone;
    const own = replaced;
    FX.graveStone = (id, x, z, yaw, lean, warn) => own(id, x + 1, z, yaw, lean, warn);
  }
}

/** The host: the run's foes cleared and the Cantor raised, dazed, at wave 10. Its id. */
export function coopChoirSpawn(): number {
  for (const foe of G.enemies.filter((each) => each.alive)) foe.takeDamage(foe.life + 1, {});
  const cantor = spawnEnemy('cantor', new THREE.Vector3(CANTOR_AT[0], 0, CANTOR_AT[1]), { wave: WAVES.bossEvery * 2 });
  cantor.life = 1e7;
  cantor.dazed = Infinity;
  return cantor.id;
}

/** The host: the Cantor's ring cast round it and its stones warned at spots rolled as its fight rolls them. How many. */
export function coopChoirCast(): number {
  const cantor = G.enemies.find((foe) => foe.type === 'cantor' && foe.alive);
  if (!cantor) throw new Error('lab: coop choir: no Cantor stands on the host');
  fx('choirRing', cantor.id, cantor.pos.x, cantor.pos.z, ENEMIES.cantor.bossKit!.attacks!.choir.warn);
  let warned = 0;
  for (let i = 0; i < STONES; i++) {
    const spot = graveSpot();
    if (!spot) break;
    fx('graveStone', cantor.id, spot.x, spot.z, Math.atan2(-spot.x, -spot.z), 0, STONE_WARN);
    warned++;
  }
  return warned;
}

/** This page's frames, the hook taken off and the canary's handler put back. */
export function coopChoirSamples(lab: Lab): ChoirSample[] {
  if (sampling) lab.beforeFrame.splice(lab.beforeFrame.indexOf(sampling), 1);
  sampling = null;
  if (replaced) FX.graveStone = replaced;
  replaced = null;
  return samples.slice();
}
