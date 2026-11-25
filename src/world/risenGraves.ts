// The Ossuary Cantor's risen graves (entities/cantor.ts, `CANTOR.graves`): gravestones pushed up out of the crypt's
// floor in its fight, each an ordinary breakable prop raised there (destructible.ts `raiseProp`, as the ranger's
// Hedgeward is: bodies and the foes' paths keep off it, a shot meets it, every hit that wears a prop wears it). They're
// drawn as one instanced mesh of the crypt's own headstone in its own carved stone, made with the crypt
// (`buildRisenGraves`), so they're the crypt's headstones' draw and nothing compiles in the fight; a stone not standing
// is shrunk away under the floor.
import * as THREE from 'three';
import { CANTOR } from '../data/foes/cantor';
import { lowerProp, raiseProp, type Prop } from './destructible';

/** A gravestone risen in the fight: where it stands and turns, its slot in the pool, the prop it is, how far it has
 *  risen (0..1) and sunk (0..1) */
export interface RisenGrave {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly lean: number;
  readonly slot: number;
  readonly prop: Prop;
  up: number;
  down: number;
}

/** the pool's mesh, made with the crypt; none where the crypt isn't built (a dev panel's Cantor in the Thornwood) */
let pool: THREE.InstancedMesh | null = null;
/** every stone standing, risen or sinking */
export const risenGraves: RisenGrave[] = [];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _p = new THREE.Vector3();
/** a stone not standing: shrunk to nothing, deep under the floor */
const GONE = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -20, 0);

/** The pool of stones, made with the crypt from its headstone and its carved stone, every slot shrunk away. */
export function buildRisenGraves(scene: THREE.Object3D, headstone: THREE.BufferGeometry, stone: THREE.Material): void {
  const mesh = new THREE.InstancedMesh(headstone, stone, CANTOR.graves.most);
  mesh.name = 'risen graves';
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, GONE);
  mesh.castShadow = mesh.receiveShadow = true;
  // (its stones are anywhere in the arena and move as they rise: drawn whole, never culled)
  mesh.frustumCulled = false;
  mesh.userData.noBake = true;
  scene.add(mesh);
  pool = mesh;
}

/** Whether stones can rise here (the crypt is built), and how many more may. */
export const gravesLeft = (): number => (pool ? CANTOR.graves.most - risenGraves.length : 0);

/** Stone `grave`'s matrix as it has risen and sunk, into `out`. */
function placedAt(grave: RisenGrave, out: THREE.Matrix4): THREE.Matrix4 {
  const g = CANTOR.graves, k = grave.up, ease = 1 - (1 - k) ** 3;
  // (pushed up out of the floor, overshooting a little and settling; sinking straight back down)
  const y = -g.top * (1 - ease) + Math.sin(k * Math.PI) * 0.06 - g.top * grave.down;
  _q.setFromEuler(_e.set(grave.lean, grave.yaw, 0, 'YXZ'));
  return out.compose(_p.set(grave.x, y, grave.z), _q, _s.setScalar(g.size));
}

/** The pool's slot `slot` set to `grave`'s place now, or shrunk away. */
function show(slot: number, grave: RisenGrave | null): void {
  if (!pool) return;
  pool.setMatrixAt(slot, grave ? placedAt(grave, _m) : GONE);
  pool.instanceMatrix.needsUpdate = true;
}

/** A ray against stone `grave` alone, as it stands. */
function rayOn(grave: RisenGrave): THREE.Mesh {
  const one = new THREE.Mesh(pool!.geometry, pool!.material);
  one.matrixAutoUpdate = false;
  one.matrixWorld.copy(placedAt(grave, _m));
  return one;
}

/**
 * A stone pushed up at (x, z), turned `yaw`: its prop raised at once (so a body over the spot is pushed off it as it
 * comes up), its health told to every game by `tell`. Null where no slot is left or the crypt isn't built.
 */
export function raiseGrave(x: number, z: number, yaw: number, lean: number, tell: (life: number) => void): RisenGrave | null {
  if (!pool || gravesLeft() <= 0) return null;
  const taken = new Set(risenGraves.map((grave) => grave.slot));
  const slot = Array.from({ length: CANTOR.graves.most }, (_, i) => i).find((i) => !taken.has(i))!;
  const g = CANTOR.graves;
  let grave: RisenGrave;
  const prop = raiseProp([{ x, z, r: g.radius, h: g.top }], g.life, 0x8a8478, {
    // (broken: it goes from the pool at once, the prop's rubble flying)
    hide: () => forget(grave),
    show: () => undefined,
    raycast: (ray, hits) => { rayOn(grave).raycast(ray, hits); },
    surfaces: (visit) => visit(rayOn(grave)),
  }, 'stone', tell);
  grave = { x, z, yaw, lean, slot, prop, up: 0, down: 0 };
  risenGraves.push(grave);
  show(slot, grave);
  return grave;
}

/** A stone gone from the pool (broken, or sunk all the way). */
function forget(grave: RisenGrave): void {
  const i = risenGraves.indexOf(grave);
  if (i >= 0) risenGraves.splice(i, 1);
  show(grave.slot, null);
}

/** Every stone sinking back into the floor from now (the Cantor fallen, its wave ended): their props out at once. */
export function sinkGraves(): void {
  for (const grave of risenGraves) {
    if (grave.down > 0) continue;
    grave.down = 1e-3;
    if (!grave.prop.broken) lowerProp(grave.prop);
  }
}

/** Every stone taken away at once (a run left, the arena switched). */
export function clearGraves(): void {
  for (const grave of [...risenGraves]) {
    if (!grave.prop.broken) lowerProp(grave.prop);
    forget(grave);
  }
}

/** Each frame: the stones rising and sinking. */
export function updateGraves(dt: number): void {
  const g = CANTOR.graves;
  for (const grave of [...risenGraves]) {
    if (grave.down > 0) {
      grave.down = Math.min(1, grave.down + dt / g.sink);
      if (grave.down >= 1) { forget(grave); continue; }
    } else if (grave.up >= 1) continue;
    else grave.up = Math.min(1, grave.up + dt / g.rise);
    show(grave.slot, grave);
  }
}

/** The stone standing nearest (x, z) within `near` m (a co-op game told a stone's health finds it by where it stands). */
export function graveAt(x: number, z: number, near = 0.5): RisenGrave | undefined {
  let best: RisenGrave | undefined, bestD = near;
  for (const grave of risenGraves) {
    const d = Math.hypot(grave.x - x, grave.z - z);
    if (d < bestD) { bestD = d; best = grave; }
  }
  return best;
}

/** Whether the crypt's pool is shown in the arena now (the lab's check reads the stones off it). */
export const gravePool = (): THREE.InstancedMesh | null => pool;
