// The lamps' shadows on the engine: for each lamp of the village, the depth of what stands still round it drawn into
// six maps, the faces of a cube round it (Bulwark's gpu/lamps.rs), which the lit shader reads as the game's own reads
// its atlas (core/lamps.ts `lampShadowAt`). Asked for where the game asks three for its atlas (world/lampAtlas.ts
// `bakeLampShadows`), and drawn a lamp a frame at the head of the frames after, so no frame waits on all of them.
// From play, of the lamps shining through every wall and post: "and lights have no shadows".
import * as THREE from 'three';
import { lampList, LAMPS_MOST } from '../core/lamps';
import type { Core } from './core';
import { GLOBALS, projectionOf, TUNE } from './globals';

/** what's nearer a lamp than this casts nothing (m): `NEAR` in world/lampAtlas.ts, `LAMP_NEAR` in the engine's lit.wgsl */
const LAMP_NEAR = 0.3;
/** the faces of the cube round a lamp, in the maps' order: the way each looks and its up (world/lampAtlas.ts `FACES`,
 *  the lit shader's `lamp_reaches`) */
const FACES: { axis: THREE.Vector3; up: THREE.Vector3 }[] = [
  { axis: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  { axis: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  { axis: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
];

/** the lamps whose shadows of what moves are drawn each frame (Bulwark's `LAMP_MOVERS`), their maps after the still
 *  lamps' */
const MOVER_LAMPS = 2;
/** a place's own lights that cast the shadow of what stands still round them (Bulwark's `LAMP_OWN`), their maps
 *  after the movers': a biome's two warmest (its braziers, its bonfires), a room's hearth and chandelier
 *  (world/props.ts `staticShadow`) */
const OWN_LIGHTS = 4;

const at = new THREE.Vector3(), ahead = new THREE.Vector3(), centre = new THREE.Vector3();
const projection = new THREE.Matrix4(), faceView = new THREE.Matrix4();
const sphere = new THREE.Sphere();

export class LampShadows {
  /** what casts into the lamps' shadows: the game's own choice (world/lampAtlas.ts `casts`) */
  private casters: THREE.Mesh[] = [];
  /** the lamps whose faces are still to draw, in turn */
  private waiting: number[] = [];
  /** the lamps whose faces are drawn: their lights read them */
  private drawn = new Set<number>();
  private camera = new THREE.PerspectiveCamera(90, 1, LAMP_NEAR, 1);
  /** how far a lamp reaches in the frame's own loop, which reads its faces that far (`lightCache.ts`; set by the
   *  bridge) */
  reachOf: (lamp: number, reach: number) => number = (_lamp, reach) => reach;
  /** how many lamps were last asked for */
  private asked = 0;
  /** the place's own casting lights, each whether its faces are drawn, what casts into them, and those still to
   *  draw */
  private own: { light: THREE.PointLight; drawn: boolean }[] = [];
  private ownCasters: THREE.Mesh[] = [];
  private ownWaiting: number[] = [];
  /** how far one of them reaches in the frame's loop, which reads its faces that far (set by the bridge) */
  ownReachOf: (light: THREE.PointLight) => number = (light) => light.distance;

  constructor(private core: Core) {}

  /** The first `lamps` lamps' shadows asked for, of `casters` as they stand (their world matrices made). A lamp
   *  drawn before keeps its maps in use until it's drawn again. */
  ask(casters: THREE.Mesh[], lamps: number): void {
    this.casters = casters;
    this.asked = Math.min(lamps, LAMPS_MOST);
    this.waiting = Array.from({ length: this.asked }, (_, lamp) => lamp);
  }

  /** The place's own casting `lights` (the first `OWN_LIGHTS` of them) asked for, of `casters` as they stand: asked
   *  again whenever what stands still changes (a prop broken, another place shown). One drawn before keeps its
   *  maps in use until it's drawn again. */
  askOwn(lights: THREE.PointLight[], casters: THREE.Mesh[]): void {
    const kept = this.own;
    this.own = lights.slice(0, OWN_LIGHTS).map((light, at) => ({ light, drawn: kept[at]?.light === light && kept[at].drawn }));
    this.ownCasters = casters;
    this.ownWaiting = this.own.map((_, at) => at);
  }

  /** what the place's own lights were last asked for: the place, its props' state, the lights by their ids */
  private ownAsked = '';

  /**
   * The shown `place`'s own casting lights kept drawn: of its `lights`, the lit ones that cast (`staticShadow`),
   * the `OWN_LIGHTS` nearest `eye`; asked again when the place, those lights or its props' state (`rev`) change.
   * (The game draws three's from a hook of three's render, which the engine never runs.)
   */
  keepOwn(place: THREE.Object3D | undefined, lights: readonly THREE.PointLight[], rev: number, eye: THREE.Vector3): void {
    const casting = place ? lights.filter((light) => light.castShadow && light.intensity > 0) : [];
    if (casting.length > OWN_LIGHTS) {
      const off = new Map(casting.map((light) => [light, light.getWorldPosition(centre).distanceToSquared(eye)]));
      casting.sort((a, b) => off.get(a)! - off.get(b)!);
      casting.length = OWN_LIGHTS;
      // (in one order however near each is, so a step among them asks for nothing)
      casting.sort((a, b) => a.id - b.id);
    }
    const asked = `${place?.id} ${rev} ${casting.map((light) => light.id).join(',')}`;
    if (asked === this.ownAsked) return;
    this.ownAsked = asked;
    this.askOwn(casting, place ? stillCasters(place) : []);
  }

  /** One of the place's own lights' place among the maps, or -1 while it has none drawn. */
  ownSlot(light: THREE.PointLight): number {
    const at = this.own.findIndex((own) => own.light === light && own.drawn);
    return at < 0 ? -1 : LAMPS_MOST + MOVER_LAMPS + at;
  }

  /** Every lamp's faces to draw again, none read meanwhile: the lamps reach another distance in the frame's loop
   *  now, and a face's depth is laid out by how far its lamp reaches. */
  again(): void {
    this.drawn.clear();
    this.waiting = Array.from({ length: this.asked }, (_, lamp) => lamp);
  }

  /** the movers' faces that hold something drawn: cleared before they're left */
  private movedInto = new Set<number>();
  /** the lamps the movers stand by this frame, each with its map of them: `lights.ts` adds a light for each that
   *  takes away what the lamp lit where a mover stands between */
  taking: Taking[] = [];

  /**
   * The shadows of what moves, at the head of a frame: for the `MOVER_LAMPS` lit lamps nearest a mover and reaching
   * it, the movers alone drawn into six faces of their own, as far as the lamp's light reaches whole. The still
   * maps hold what stands still and are drawn once: a hero by a lamp cast no shadow from it (from play: "no shadows
   * from lights.... only shadow from moon"). `record` writes a mesh's record as a frame's walk would.
   */
  moved(record: (mesh: THREE.Mesh) => void, movers: readonly THREE.Object3D[]): void {
    this.taking.length = 0;
    const by: { lamp: number; off: number }[] = [];
    for (let lamp = 0; lamp < this.asked && movers.length; lamp++) {
      const place = (1 + lamp * 2) * 4;
      if (lampList[place + 7] === 0 || !this.drawn.has(lamp)) continue;
      at.fromArray(lampList, place);
      const off = Math.min(...movers.map((mover) => mover.getWorldPosition(centre).distanceTo(at)));
      if (off < lampList[place + 3]) by.push({ lamp, off });
    }
    by.sort((a, b) => a.off - b.off);
    const core = this.core, camera = this.camera;
    for (const [k, { lamp }] of by.slice(0, MOVER_LAMPS).entries()) {
      const place = (1 + lamp * 2) * 4, reach = lampList[place + 3];
      at.fromArray(lampList, place);
      core.count = core.boneFloats = 0;
      // (a frame of its own to what's written once a frame: a skeleton's bones are written at its first mesh and
      // found again by the frame's number. Written here and taken as written by the frame's own walk, which writes
      // from the start again, a hero by a lamp was drawn by another skeleton's bones: his skin gone at some
      // angles, his gear in the air)
      core.frame++;
      for (const mover of movers) {
        // (what casts the sun's shadow, by the bridge's own rule: a piece the quality cuts from casting casts none here)
        mover.traverseVisible((part) => {
          const mesh = part as THREE.Mesh;
          if (mesh.isMesh && (mesh.castShadow || (TUNE.castAll > 0 && mesh.receiveShadow))) record(mesh);
        });
      }
      camera.far = reach;
      camera.updateProjectionMatrix();
      camera.position.copy(at);
      for (const [face, { axis, up }] of FACES.entries()) {
        // (a face no mover falls in isn't drawn: of a cube's six, a hero by a lamp is in one or two. One drawn
        // before is cleared once, by a draw of nothing)
        const layer = (LAMPS_MOST + k) * FACES.length + face;
        const inFace = movers.some((mover) => fallsIn(mover.getWorldPosition(centre).sub(at), axis));
        if (!inFace && !this.movedInto.has(layer)) continue;
        if (inFace) this.movedInto.add(layer);
        else this.movedInto.delete(layer);
        camera.up.copy(up);
        camera.lookAt(ahead.copy(at).add(axis));
        camera.updateMatrixWorld();
        core.freshViews();
        faceView.multiplyMatrices(projectionOf(camera, projection), camera.matrixWorldInverse)
          .toArray(core.globals, GLOBALS.shadowView);
        at.toArray(core.globals, GLOBALS.camPos);
        core.engine.bake_lamp_face(layer, inFace ? core.count : 0, inFace ? core.boneFloats : 0);
      }
      this.taking.push({ lamp, slot: LAMPS_MOST + k });
    }
    core.freshViews();
    core.count = core.boneFloats = 0;
    core.frame++;
  }

  /** A lamp's place among the maps (its own number), or -1 while its faces aren't drawn. */
  slot(lamp: number): number {
    return this.drawn.has(lamp) ? lamp : -1;
  }

  /** How many lamps' shadows are drawn, and how many wait. */
  now(): { drawn: number; waiting: number; own: number } {
    const own = this.own.filter((light) => light.drawn).length;
    return { drawn: this.drawn.size, waiting: this.waiting.length + this.ownWaiting.length, own };
  }

  /**
   * The next waiting lamp's six faces drawn, at the head of a frame: `record` writes a caster's record as a frame's
   * walk would (the frame's own records are written after, over these). The casters in the lamp's reach are written
   * once for its six faces; each face's view goes where the sun's does in the globals, which the frame writes again.
   */
  step(record: (mesh: THREE.Mesh) => void): void {
    const lamp = this.waiting.shift();
    if (lamp === undefined) {
      // (then one of the place's own lights, by the same six faces)
      const next = this.ownWaiting.shift();
      const own = next === undefined ? undefined : this.own[next];
      if (next === undefined || !own) return;
      own.light.getWorldPosition(at);
      const far = this.ownReachOf(own.light);
      if (!(far > LAMP_NEAR)) return;
      this.faces(record, this.ownCasters, far, LAMPS_MOST + MOVER_LAMPS + next);
      own.drawn = true;
      return;
    }
    const place = (1 + lamp * 2) * 4;
    at.fromArray(lampList, place);
    // (as far as its light is read: the lit shader takes the faces' far plane from the light's own reach)
    const reach = this.reachOf(lamp, lampList[place + 3]);
    if (!(reach > LAMP_NEAR)) return;
    this.faces(record, this.casters, reach, lamp);
    this.drawn.add(lamp);
  }

  /** The six faces round `at` drawn of `casters` within `reach` of it, into the maps' place `slot`. */
  private faces(record: (mesh: THREE.Mesh) => void, casters: THREE.Mesh[], reach: number, slot: number): void {
    const core = this.core;
    core.count = core.boneFloats = 0;
    for (const mesh of casters) {
      if (!inReach(mesh, reach)) continue;
      record(mesh);
    }
    const camera = this.camera;
    camera.far = reach;
    camera.updateProjectionMatrix();
    camera.position.copy(at);
    for (const [k, { axis, up }] of FACES.entries()) {
      camera.up.copy(up);
      camera.lookAt(ahead.copy(at).add(axis));
      camera.updateMatrixWorld();
      core.freshViews();
      faceView.multiplyMatrices(projectionOf(camera, projection), camera.matrixWorldInverse)
        .toArray(core.globals, GLOBALS.shadowView);
      at.toArray(core.globals, GLOBALS.camPos);
      core.engine.bake_lamp_face(slot * FACES.length + k, core.count, 0);
    }
    core.freshViews();
    core.count = core.boneFloats = 0;
  }
}

/** What stands still under `shown` and casts a shadow: its shown meshes that cast one, none moved by its bones. */
export function stillCasters(shown: THREE.Object3D): THREE.Mesh[] {
  const casters: THREE.Mesh[] = [];
  shown.updateMatrixWorld(true);
  shown.traverseVisible((part) => {
    const mesh = part as THREE.Mesh;
    if (mesh.isMesh && mesh.castShadow && !(mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) casters.push(mesh);
  });
  return casters;
}

/** A lamp a mover stands by, and its place among the movers' maps. */
export interface Taking { lamp: number; slot: number }

/** a mover's round, m: what of it may reach into a face beside the one its middle is in (`HERO_ROUND`,
 *  world/lampShadows.ts, its middle a metre up) */
const MOVER_ROUND = 2.5;

/** Whether a mover whose feet are `off` from a lamp may fall in the face of its cube that looks along `axis`: ahead
 *  of the lamp that way, and no further to a side than ahead, by its round. */
function fallsIn(off: THREE.Vector3, axis: THREE.Vector3): boolean {
  const along = off.dot(axis);
  if (along < -MOVER_ROUND) return false;
  const aside = Math.sqrt(Math.max(off.lengthSq() - along * along, 0));
  // (a face's corner is root two as far aside as ahead)
  return aside <= along * Math.SQRT2 + MOVER_ROUND * 1.5;
}

/** Whether `mesh` may stand within `reach` of the lamp at `at`: by its geometry's sphere where it stands; a mesh of
 *  instances (the posts, the trunks) is left to the engine, which culls each. */
function inReach(mesh: THREE.Mesh, reach: number): boolean {
  if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return true;
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  sphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
  return centre.copy(sphere.center).distanceTo(at) < reach + sphere.radius;
}
