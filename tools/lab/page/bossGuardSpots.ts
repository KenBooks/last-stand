// `boss --parts encounter`'s first measure: where the Ossuary Cantor's guards rise, as the run sends them on the Crypt's
// wave 10 (data/biomes.ts `BossRung.guards.at`, game/run.ts `spawnGroup`). From play: "the bells should spawn in the
// same spots, across from each other on the map, symmetrically, on a path". The wave is set off twice, each time
// from its countdown as the game sets one off: both times the guards must rise at the same two spots, each the
// other's mirror through the arena's middle, each on the crypt's paving (its walks' mesh met by a ray straight down),
// clear of every prop by room for a hero to circle it, and well off the gates.
import * as THREE from 'three';
import type { Fixture, Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { WAVES } from '../../../src/data/waves';
import { startNextWave } from '../../../src/game/run';

/** How many times the wave is set off, each from a fresh set-up. */
const TRIES = 2;
/** The most two tries' spots may differ (m): none, but a float's rounding. */
const SAME_MOST = 0.01;
/** The most the two spots may stand off each other's mirror through the middle (m). */
const MIRROR_MOST = 0.05;
/** The least room between a guard's body and the nearest prop (m): a hero's body and a step, to circle it. */
const ROOM_LEAST = 1.2;
/** The least angle between a guard and the nearest gate, seen from the middle (radians: 30 degrees). */
const GATE_ANGLE_LEAST = Math.PI / 6;
/** The gates' angles from the middle (world/crypt.ts `GATES`: a quarter turn apart from +x). */
const GATE_ANGLES = [0, 1, 2, 3].map((k) => (k / 2) * Math.PI);
/** The crypt's walks' mesh, named where it's built (world/crypt.ts). */
const WALKS = 'crypt walks';
/** Frames for a wave to start from its countdown, and for its guards to rise after. */
const START_FRAMES = 30;
const RISE_FRAMES = 400;

/** What a measure of the boss command is handed: the lab, its set-up, and where to report. */
export interface SpotsMeasure {
  lab: Lab;
  /** the command's set-up, stood in the crypt for each try */
  stand: () => Promise<void>;
  canary: boolean;
  lines: string[];
  problems: string[];
}

/** The guards' spots each try, measured against their rules. */
export async function guardSpots({ lab, stand, canary, lines, problems }: SpotsMeasure): Promise<void> {
  const rung = BIOMES.crypt.bosses.find((boss) => boss.guards?.at);
  if (!rung?.guards?.at) {
    problems.push('encounter: no rung of the Crypt has its guards\' spots');
    return;
  }
  const shipped = rung.guards.at;
  // (the canary: guards with no spots of their own, rising at the gates as other bosses do)
  if (canary) delete rung.guards.at;
  try {
    const tries: THREE.Vector3[][] = [];
    for (let i = 0; i < TRIES; i++) {
      await stand();
      tries.push(await guardsRisen(lab));
    }
    judge(tries, lines, problems);
  } finally {
    rung.guards.at = shipped;
  }
}

/** The Crypt's wave 10 set off from its countdown: where each of its guards rose. */
async function guardsRisen(lab: Lab): Promise<THREE.Vector3[]> {
  lab.letWavesCome();
  const run = G.run!;
  run.wave = WAVES.bossEvery * 2;
  startNextWave();
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', START_FRAMES, 'the encounter\'s wave never started');
  const risen = (): Enemy[] => G.enemies.filter((foe) => foe.guard && foe.alive && foe.spawning <= 0);
  await lab.until(() => risen().length >= 2, RISE_FRAMES, 'the encounter\'s guards never rose');
  const spots = risen().map((guard) => guard.pos.clone().setY(0));
  // (the wave stopped: the next try sets up afresh)
  run.queue.length = 0;
  run.boss = null;
  for (const foe of G.enemies) foe.takeDamage(foe.life + 1, {});
  return spots;
}

/** Each try's spots against the first's, against each other's mirror, the paving, the props and the gates. */
function judge(tries: THREE.Vector3[][], lines: string[], problems: string[]): void {
  const [first] = tries;
  const said = first.map((spot) => `(${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`).join(' and ');
  lines.push(`encounter: the guards rose at ${said}, ${tries.length} tries`);
  const apart = Math.max(...tries.slice(1).map((spots) => furthestApart(first, spots)));
  if (apart > SAME_MOST) problems.push(`encounter: the guards rose ${apart.toFixed(2)} m from the first try's spots: the same each time`);
  const mirror = first[0].clone().add(first[1]).length();
  lines.push(`encounter: the spots ${mirror.toFixed(3)} m off each other's mirror through the middle`);
  if (mirror > MIRROR_MOST) problems.push(`encounter: the guards' spots stand ${mirror.toFixed(2)} m off each other's mirror`);
  first.forEach((spot, i) => judgeSpot(spot, i, lines, problems));
}

/** The furthest any guard of `spots` rose from the same guard of `first` (m). */
function furthestApart(first: THREE.Vector3[], spots: THREE.Vector3[]): number {
  if (spots.length !== first.length) return Infinity;
  return Math.max(...spots.map((spot, i) => spot.distanceTo(first[i])));
}

/** One guard's spot: on the paving, its room to the props, its angle off the gates. */
function judgeSpot(spot: THREE.Vector3, i: number, lines: string[], problems: string[]): void {
  const radius = G.enemies.find((foe) => foe.guard)?.radius ?? 1;
  const paved = onWalks(spot);
  const room = Math.min(...G.arena.obstacles.map((o) => Math.hypot(o.x - spot.x, o.z - spot.z) - o.r)) - radius;
  const angle = Math.atan2(spot.z, spot.x);
  const offGate = Math.min(...GATE_ANGLES.map((gate) => Math.abs(Math.atan2(Math.sin(angle - gate), Math.cos(angle - gate)))));
  lines.push(`encounter: guard ${i + 1} ${paved ? 'on the paving' : 'off the paving'}, ${room.toFixed(2)} m clear of the props, `
    + `${(offGate * 180 / Math.PI).toFixed(0)} degrees off the nearest gate`);
  if (!paved) problems.push(`encounter: guard ${i + 1} rose off the paving`);
  if (room < ROOM_LEAST) problems.push(`encounter: guard ${i + 1} rose ${room.toFixed(2)} m from a prop, under ${ROOM_LEAST} m`);
  if (offGate < GATE_ANGLE_LEAST) problems.push(`encounter: guard ${i + 1} rose ${(offGate * 180 / Math.PI).toFixed(0)} degrees off a gate`);
}

/** Whether a ray straight down at `spot` meets the crypt's walks. */
function onWalks(spot: THREE.Vector3): boolean {
  const walks = G.scene.getObjectByName(WALKS);
  if (!walks) return false;
  const ray = new THREE.Raycaster(new THREE.Vector3(spot.x, 2, spot.z), new THREE.Vector3(0, -1, 0), 0, 3);
  return ray.intersectObject(walks, false).length > 0;
}
