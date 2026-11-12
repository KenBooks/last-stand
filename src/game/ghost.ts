// The ghost by the training yard's gate (data/village.ts `GHOST`): a foe of a first wave, shown as the training
// grounds show their foes (a projection: the screen-door dissolve, a faint cyan edge, frosted, casting no shadow). By
// day it's a Thornwood foe, by night a crypt foe (`biomeOfHour`, the hours the village's music follows too): one of
// each is picked at random as the boot builds the village, and the one of the hour shown. Both are drawn until the
// lobby's warm-up has compiled them (`ghostsWarmed`: a hidden mesh compiles nothing, and the other would compile as
// the hour turned). Talked to (main.ts `useObject`), it opens the training grounds' card on its battleground. It's no
// foe: not in `G.enemies`, so nothing aims at it, strikes it or counts it.
import * as THREE from 'three';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { GHOST, biomeOfHour } from '../data/village';
import { buildModel } from '../entities/models/index';
import { groundHeight } from '../world/ground';
import { hourNow } from './clock';
import type { Model } from '../types';

/** the training grounds' look on a foe (entities/enemy.ts `applyProjection`): its dissolve, edge and frost */
const PROJECTION = { dissolve: 0.28, edge: 0x67edff, edgeShare: 0.18, frost: 0.35 };
/** how far it hovers up and down (m) and how long a rise and fall takes (s) */
const HOVER = { high: 0.06, period: 3.2 };

/** A ghost: its battleground, its kind, its model and the group it stands in. */
export interface Ghost { biome: BiomeId; kind: EnemyId; model: Model; root: THREE.Group }

const ghosts = new Map<BiomeId, Ghost>();
/** whether the lobby's warm-up has compiled both (till then both are drawn) */
let warmed = false;

/** The foes a first wave brings in `biome` (its `pool(1)`). */
export const firstWaveFoes = (biome: BiomeId): EnemyId[] => BIOMES[biome].pool(1).map(([id]) => id);

/** A ghost of a first wave's foe of `biome`, at random, in the projection's look, stood by the yard's gate. */
function makeGhost(biome: BiomeId): Ghost {
  const foes = firstWaveFoes(biome);
  const kind = foes[Math.floor(Math.random() * foes.length)];
  const model = buildModel(ENEMIES[kind].model);
  const u = model.kit.u;
  u.uDissolve.value = PROJECTION.dissolve;
  u.uEdge.value.set(PROJECTION.edge).multiplyScalar(PROJECTION.edgeShare);
  u.uFrozen.value = PROJECTION.frost;
  model.root.traverse((o) => { o.castShadow = false; });
  const root = new THREE.Group();
  root.name = `ghost: ${kind}`;
  root.add(model.root);
  root.position.set(GHOST.x, groundHeight(GHOST.x, GHOST.z), GHOST.z);
  model.root.rotation.y = GHOST.facing;
  return { biome, kind, model, root };
}

/** The ghosts built and stood by the yard's gate in `village` (once: the lobby's warm-up compiles them with it). */
export function standGhost(village: THREE.Object3D): void {
  if (ghosts.size) return;
  for (const biome of BIOME_IDS) {
    const ghost = makeGhost(biome);
    ghosts.set(biome, ghost);
    village.add(ghost.root);
  }
  updateGhost(0, 0);
}

/** The lobby's warm-up has compiled both: from now on only the hour's is drawn. */
export function ghostsWarmed(): void {
  warmed = true;
  updateGhost(0, 0);
}

/** The battleground of the ghost shown now (the hour's). */
export const ghostBiome = (): BiomeId => biomeOfHour(hourNow());

/** The hour's ghost shown (both till they're warm), its idle and its hover, a frame (the village's update). */
export function updateGhost(t: number, dt: number): void {
  const biome = ghostBiome();
  for (const ghost of ghosts.values()) {
    ghost.root.visible = !warmed || ghost.biome === biome;
    if (!ghost.root.visible || !ghost.root.parent?.visible) continue;
    ghost.model.animate({ t, dt, phase: 0, move: 0, action: null, hit: 0, dead: -1 });
    ghost.model.root.position.y = HOVER.high * (1 + Math.sin((t / HOVER.period) * Math.PI * 2));
  }
}

/** For a harness (tools/lab): the hour's ghost, or the one of `biome`. */
export const ghostShown = (biome: BiomeId = ghostBiome()): Ghost | null => ghosts.get(biome) ?? null;
