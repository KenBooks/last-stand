// Breakable scenery: low props (stumps, logs, boulders, drums, gravestones, sarcophagi) have hit points
// and give way to focused fire, an enemy's included, so nobody can sit behind one for the whole wave.
// A prop is one or more of the obstacle circles; when it breaks its circles leave the biome's list (the
// flow field is rebuilt from `state.rev`), its mesh goes, and rubble flies. Tall props (the trees round the ring, pillars,
// walls, the lights) stay. The fight's owner deals the damage (`simulates`); a co-op guest is told which
// prop's health (`setPropSink` / `setPropLife`). A damaged prop shows a bar for a few seconds. A new run brings everything back (`restoreProps`).
import * as THREE from 'three';
import type { Obstacle } from '../types';
import type { Updater } from './props';
import { simulates, hurtsProps } from '../net/role';
import type { Player } from '../entities/player';
import { burst, debris, smokePuff } from '../fx/particles';
import { rubble, type RubbleKind } from '../fx/rubble';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { G } from '../state';
import { anchorLabel, removeLabel } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { gaugeArt } from '../ui/overlay/bars';

export interface Prop {
  id: number;
  life: number;
  max: number;
  broken: boolean;
  color: number;
  /** what it's made of: the pieces it breaks into */
  kind: RubbleKind;
  /** its circles, and the biome's list they stand in */
  parts: Obstacle[];
  list: Obstacle[];
  hide(): void;
  show(): void;
  /** what it draws, met by a ray (an arrow finds where it goes in: the circles are only rough) */
  raycast(ray: THREE.Raycaster, hits: THREE.Intersection[]): void;
  /** each mesh it draws, its world matrix up to date (its top's shape, `propTopAt`) */
  surfaces(visit: (mesh: THREE.Mesh) => void): void;
  chipT: number;
  /** game time of the last damage, and its health bar while it shows */
  hurtT: number;
  bar: Label | null;
}

/** Bumped whenever the set of obstacles changes, so the navigation grid follows */
export const state = { rev: 0 };

/** How much one strike takes off a prop's `hp`: a player's bolt, an enemy's bolt, a melee swing, a second of the Void Lance */
export const PROP_DAMAGE = { bolt: 1, hostile: 0.5, swing: 1, beam: 3, /** a blast (a Starfall shard) */ blast: 2, /** a nova, a war cry */ burst: 4, /** per second, in a channelled area (Maelstrom, Tempest) */ zone: 3, /** a charge running one down */ trample: 3 };

let propSink: (id: number, life: number) => void = () => {};
/** the fight's owner reports each prop's health as it changes (0: broken) */
export function setPropSink(fn: typeof propSink): void { propSink = fn; }

/** a bar shows this long after the last damage, then fades */
const BAR_SHOWN = 5, BAR_FADE = 0.6;

/** A biome's breakable props, made as it's built */
export class PropSet {
  readonly list: Prop[] = [];
  constructor(private obstacles: Obstacle[]) {}
  /** The obstacle circles pushed since `from` (an index into the list) become one prop of `hp`. `hide` /
   *  `show` take its look away and bring it back. */
  add(from: number, hp: number, color: number, look: PropLook, kind: RubbleKind = 'stone'): void {
    const parts = this.obstacles.slice(from);
    const prop: Prop = { id: this.list.length, life: hp, max: hp, broken: false, color, kind, parts, list: this.obstacles, chipT: 0, hurtT: -1e9, bar: null, ...look };
    for (const o of parts) o.prop = prop;
    this.list.push(prop);
  }
}

const _p = new THREE.Vector3();
/** how a prop is hidden, shown and met by a ray */
export type PropLook = {
  hide(): void; show(): void; raycast(ray: THREE.Raycaster, hits: THREE.Intersection[]): void;
  surfaces(visit: (mesh: THREE.Mesh) => void): void;
};
/** the meshes' surfaces a ray meets (not a glow's points) */
const castAll = (objs: THREE.Object3D[]) => (ray: THREE.Raycaster, hits: THREE.Intersection[]): void => {
  for (const o of objs) o.traverse((c) => { if ((c as THREE.Mesh).isMesh && c.visible) (c as THREE.Mesh).raycast(ray, hits); });
};
/** each of the meshes shown (not a glow's points), its world matrix up to date */
const surfacesOf = (objs: THREE.Object3D[]) => (visit: (mesh: THREE.Mesh) => void): void => {
  for (const o of objs) {
    o.updateWorldMatrix(true, true);
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh && c.visible) visit(c as THREE.Mesh); });
  }
};
/** hide / show for one instance of an InstancedMesh (call once the instance is placed) */
export function instanceLook(mesh: THREE.InstancedMesh, i: number): PropLook {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  const gone = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(_p.setFromMatrixPosition(m));
  const set = (to: THREE.Matrix4): void => { mesh.setMatrixAt(i, to); mesh.instanceMatrix.needsUpdate = true; };
  // (a ray against this instance alone: its geometry where the instance stands)
  const one = new THREE.Mesh(mesh.geometry, mesh.material);
  one.matrixAutoUpdate = false;
  const placed = (): THREE.Mesh => {
    mesh.updateWorldMatrix(true, false);
    one.matrixWorld.multiplyMatrices(mesh.matrixWorld, m);
    return one;
  };
  const raycast = (ray: THREE.Raycaster, hits: THREE.Intersection[]): void => placed().raycast(ray, hits);
  return { hide: () => set(gone), show: () => set(m), raycast, surfaces: (visit) => visit(placed()) };
}
/** hide / show for plain meshes (they're kept out of the shadow bake, so they cast for themselves) */
export function meshLook(...meshes: THREE.Object3D[]): PropLook {
  for (const m of meshes) m.userData.noBake = true;
  return { hide: () => meshes.forEach((m) => { m.visible = false; }), show: () => meshes.forEach((m) => { m.visible = true; }), raycast: castAll(meshes), surfaces: surfacesOf(meshes) };
}

const centre = (p: Prop, out: THREE.Vector3): THREE.Vector3 => {
  out.set(0, 0, 0);
  for (const o of p.parts) out.x += o.x, out.z += o.z;
  return out.multiplyScalar(1 / Math.max(1, p.parts.length)).setY(Math.min(1, Math.max(...p.parts.map((o) => o.h)) * 0.5));
};

/** Wear a prop down by `amount` (only where the fight is simulated). Returns true if it broke. */
export function hurtProp(o: Obstacle, amount: number): boolean {
  const p = o.prop;
  if (!p || p.broken || !simulates()) return false;
  p.life -= amount;
  if (p.life <= 0) { breakProp(p); propSink(p.id, 0); return true; }
  showBar(p);
  const now = performance.now();
  if (now - p.chipT > 140) {
    p.chipT = now;
    propSink(p.id, Math.round(p.life * 10) / 10);
    debris(centre(p, _p), { count: 3, color: p.color, speed: 3, size: 0.12, life: 0.7 });
    rubble(_p.x, _p.z, { count: 1, color: p.color, kind: p.kind, radius: 0.4, height: 0.3, size: 0.1, speed: 2 });
    sfx.chip(p.kind);
  }
  return false;
}

/** An area attack of `by` (a circle at x, z): every prop it touches takes `amount`, once per call (a `seen`
 *  set makes it once for a moving one, like Crescent's) */
export function hurtPropsIn(by: Player, x: number, z: number, radius: number, amount: number, seen?: Set<Prop>): void {
  if (!hurtsProps(by)) return;
  const hit = seen ?? new Set<Prop>();
  for (const o of [...G.arena.obstacles]) {   // (a copy: breaking one takes its circles out)
    const p = o.prop;
    if (!p || hit.has(p) || Math.hypot(o.x - x, o.z - z) > radius + o.r) continue;
    hit.add(p);
    hurtProp(o, amount);
  }
}
/** A prop's health as the fight's owner reports it (a co-op guest) */
export function setPropLife(p: Prop, life: number): void {
  if (life <= 0) { breakProp(p); return; }
  p.life = life;
  showBar(p);
}

/** The bar over a damaged prop: unlike a foe's red one it's a stone-coloured, notched gauge with a diamond,
 *  and it goes a few seconds after the last blow */
function showBar(p: Prop): void {
  p.hurtT = G.time;
  if (!p.bar) {
    const bar = p.bar = anchorLabel(ORDER.bar, () => {
      const age = G.time - p.hurtT;
      if (p.broken || age > BAR_SHOWN + BAR_FADE) { hideBar(p); return null; }
      bar.alpha = age <= BAR_SHOWN ? 1 : 1 - (age - BAR_SHOWN) / BAR_FADE;
      // over its top, but no higher than a man: a pillar's own top is off the frame when close to it
      return centre(p, new THREE.Vector3()).setY(Math.min(2.2, Math.max(...p.parts.map((o) => o.h)) + 0.3));
    }, true);
  }
  p.bar.show(gaugeArt(p.life / p.max));
}
function hideBar(p: Prop): void { removeLabel(p.bar); p.bar = null; }

/** hide / show for everything a builder put in `group` (built into it instead of the scene): its meshes go
 *  (and stay out of the shadow bake), its animation stops (the `updaters` it added since `from`), and its
 *  lights go dark but stay in the scene, since a different light count would recompile every shader */
export function groupLook(group: THREE.Object3D, updaters: Updater[], from: number): PropLook {
  const lights: [THREE.PointLight, number][] = [], shown: THREE.Object3D[] = [];
  group.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) lights.push([o as THREE.PointLight, (o as THREE.PointLight).intensity]);
    else if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) { shown.push(o); o.userData.noBake = true; }
  });
  let gone = false;
  for (let i = from; i < updaters.length; i++) { const u = updaters[i]; updaters[i] = (dt, t) => { if (!gone) u(dt, t); }; }
  return {
    hide() { gone = true; for (const o of shown) o.visible = false; for (const [l] of lights) l.intensity = 0; },
    show() { gone = false; for (const o of shown) o.visible = true; for (const [l, v] of lights) l.intensity = v; },
    raycast: castAll(shown.filter((o) => (o as THREE.Mesh).isMesh)),
    surfaces: surfacesOf(shown.filter((o) => (o as THREE.Mesh).isMesh)),
  };
}

/** The prop goes: its circles, its mesh, and a burst of rubble */
export function breakProp(p: Prop): void {
  if (p.broken) return;
  p.broken = true; p.life = 0;
  p.hide();
  hideBar(p);
  for (const o of p.parts) { const i = p.list.indexOf(o); if (i >= 0) p.list.splice(i, 1); }
  state.rev++;
  const c = centre(p, _p), size = Math.max(...p.parts.map((o) => o.r)) + p.parts.length * 0.25;
  // the prop comes apart: chunks that fly, bounce and lie a few seconds before they crumble away
  const reach = Math.max(...p.parts.map((o) => Math.hypot(o.x - c.x, o.z - c.z) + o.r));
  rubble(c.x, c.z, { count: Math.min(36, Math.round(8 + size * 10) * (p.kind === 'wood' ? 1.4 : 1)), color: p.color, kind: p.kind, radius: reach * 0.8, height: Math.min(2, Math.max(...p.parts.map((o) => o.h))) * 0.7, size: 0.16 + size * 0.09, speed: 2.5 + size });
  debris(c, { count: 8, color: p.color, speed: 4 + size * 2, size: 0.14 });
  smokePuff(c, { count: 4 + Math.round(size * 3), color: p.color, alpha: 0.4, size: 0.8 + size * 0.4, sizeEnd: 2 + size, life: 1.2, speed: 1.6 });
  burst(c, { count: 6, color: 0xffd9a0, intensity: 1.5, speed: 4, life: 0.35, size: 0.1, gravity: 8 });
  addShake(0.06 + size * 0.05);
  sfx.crumble();
}

/** Bring every prop of the set back (a new run, the lobby) */
export function restoreProps(props: Prop[]): void {
  let changed = false;
  for (const p of props) {
    if (!p.broken && p.life === p.max) continue;
    p.life = p.max;
    hideBar(p);
    if (p.broken) { p.broken = false; p.list.push(...p.parts); p.show(); }
    changed = true;
  }
  if (changed) state.rev++;
}
