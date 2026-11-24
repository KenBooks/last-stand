// What an invited agent makes in the scene as its owner watches (agent.ts, #529's second half: "letting AI create
// as you watch things appear in the scene"). A made thing is a module of the agent's, written as a place of the game
// is (`export function build(kit)`), sent whole and built into the scene already drawn: nothing of the game is
// rebuilt or reloaded. Sent again under its name it takes its earlier self's place where that stood, which is the
// hot reload: the session edits its file and the thing changes in front of the player.
//   make    a module built under a name: where it stands, what it holds
//   makes   what is made now
//   unmake  one thing taken out, or all
// A thing belongs to the place it was made in (the village, a biome, a room, the hall) and is shown there alone. It
// stays when the agent leaves, until the page is left or the panel's Remove is pressed: it's the player's to look at.
import * as THREE from 'three';
import { G } from '../state';
import type { AgentStep } from './agentSteps';

/** What a made thing's `build` is handed. */
export interface MakeKit {
  THREE: typeof THREE;
  /** the game's state (src/state.ts) */
  G: typeof G;
  /** the thing's own group, at its place on the ground: what `build` adds to it, or returns, is the thing */
  group: THREE.Group;
  /** the ground's height at a place of the world (m) */
  ground(x: number, z: number): number;
  /** `fn` run each frame while the thing stands: the game's step (s, 0 while it's frozen) and its time since the
   *  thing was made (s) */
  each(fn: MakeUpdater): void;
}
export type MakeUpdater = (dt: number, t: number) => void;
/** A made thing's module: its `build` (or its default export). */
export type MakeBuild = (kit: MakeKit) => THREE.Object3D | void | Promise<THREE.Object3D | void>;

interface Made {
  name: string;
  group: THREE.Group;
  /** the place it was made in, where alone it's shown */
  place: string;
  updaters: MakeUpdater[];
  /** its own time (s) */
  t: number;
  /** what its updaters last threw, which stopped them */
  error: string;
}
const made = new Map<string, Made>();

/** how far in front of the hero a thing is made when no place is given (m) */
const AHEAD = 4;
/** the longest a name may be, and what it's made of */
const NAME = /^[\w-]{1,40}$/;

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The place shown now: the hall, a house's room, or the village or biome. */
function placeNow(): string {
  const arena = G.arena;
  return arena.hallShown ? 'hall' : arena.room ? `room:${arena.room}` : arena.place;
}

// --- a module's code run -------------------------------------------------------------------------------------------
/** What a made thing's module may import: three alone (a type's import is gone before it's sent). */
function required(id: string): unknown {
  if (id === 'three') return THREE;
  throw new Error(`make: a made thing imports three alone (types are free): not "${id}". The game's state is kit.G`);
}

/** `code`'s `build`: a CommonJS module, as `lab join make` sends a TypeScript file. */
function buildOf(code: string): MakeBuild {
  const module = { exports: {} as Record<string, unknown> };
  new Function('exports', 'require', 'module', code)(module.exports, required, module);
  const build = module.exports.build ?? module.exports.default;
  if (typeof build !== 'function') throw new Error('make: the module exports no build(kit) (nor a default function)');
  return build as MakeBuild;
}

// --- what a thing holds ---------------------------------------------------------------------------------------------
interface Held { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> }

function heldBy(root: THREE.Object3D, into: Held = { geometries: new Set(), materials: new Set() }): Held {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) into.geometries.add(mesh.geometry);
    const material = mesh.material;
    for (const each of Array.isArray(material) ? material : material ? [material] : []) into.materials.add(each);
  });
  return into;
}

/** A thing's meshes and triangles. */
function sizeOf(root: THREE.Object3D): { meshes: number; triangles: number } {
  let meshes = 0, triangles = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes++;
    const count = (mesh.geometry.index ?? mesh.geometry.getAttribute('position'))?.count ?? 0;
    triangles += Math.floor(count / 3) * ((mesh as unknown as THREE.InstancedMesh).count ?? 1);
  });
  return { meshes, triangles };
}

/** `thing` out of the scene, and what it alone held given back: a geometry or a material the scene still uses (one
 *  of the game's own the thing borrowed, or another thing's) is left. */
function remove(thing: Made): void {
  thing.group.removeFromParent();
  made.delete(thing.name);
  const own = heldBy(thing.group);
  const others = heldBy(G.scene);
  for (const geometry of own.geometries) if (!others.geometries.has(geometry)) geometry.dispose();
  for (const material of own.materials) {
    if (others.materials.has(material)) continue;
    for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
    material.dispose();
  }
}

function told(thing: Made): Record<string, unknown> {
  const { position, rotation } = thing.group;
  return {
    name: thing.name, place: thing.place, shown: thing.group.visible,
    at: [round(position.x), round(position.y), round(position.z)], turn: round(rotation.y),
    ...sizeOf(thing.group), updaters: thing.updaters.length, ...(thing.error ? { error: thing.error } : {}),
  };
}

// --- the steps -----------------------------------------------------------------------------------------------------
const three = (value: unknown, what: string): [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error(`make: ${what} is three numbers`);
  }
  return value as [number, number, number];
};

/** Where a thing is made: the place given, else where its earlier self stands, else on the ground before the hero. */
function standOf(args: AgentStep, earlier: Made | undefined): { at: THREE.Vector3; turn: number } {
  const turn = typeof args.turn === 'number' ? args.turn : earlier?.group.rotation.y ?? 0;
  if (args.at !== undefined) return { at: new THREE.Vector3(...three(args.at, 'at')), turn };
  if (earlier) return { at: earlier.group.position.clone(), turn };
  const hero = G.player;
  const x = hero.pos.x + Math.sin(hero.facing) * AHEAD, z = hero.pos.z + Math.cos(hero.facing) * AHEAD;
  return { at: new THREE.Vector3(x, G.arena.groundHeight(x, z), z), turn };
}

/**
 * A module built into the scene under `name`. With that name made already, the new one takes its place where it
 * stood (unless `at` says elsewhere) once it is built: a module that throws leaves the earlier one standing.
 */
export async function make(args: AgentStep): Promise<unknown> {
  const name = args.name;
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('make: give a name (letters, digits, - and _, 40 at most)');
  if (typeof args.code !== 'string' || !args.code.trim()) throw new Error('make: give code, a module\'s text');
  const earlier = made.get(name);
  const stand = standOf(args, earlier);
  const group = new THREE.Group();
  group.name = `agent:${name}`;
  group.position.copy(stand.at);
  group.rotation.y = stand.turn;
  const updaters: MakeUpdater[] = [];
  const kit: MakeKit = {
    THREE, G, group,
    ground: (x, z) => G.arena.groundHeight(x, z),
    each: (fn) => { updaters.push(fn); },
  };
  const built = await buildOf(args.code)(kit);
  if (built && built !== group) group.add(built);
  // (built whole: only now does the earlier one go)
  if (earlier) remove(earlier);
  const thing: Made = { name, group, place: placeNow(), updaters, t: 0, error: '' };
  made.set(name, thing);
  G.scene.add(group);
  return { ...told(thing), replaced: Boolean(earlier) };
}

/** What is made now. */
export const makes = (): unknown[] => [...made.values()].map(told);
export const madeCount = (): number => made.size;

/** `name` taken out of the scene, or every made thing with none given; what is left. */
export function unmake(args: AgentStep = {}): unknown {
  if (args.name === undefined) for (const thing of [...made.values()]) remove(thing);
  else {
    const thing = made.get(String(args.name));
    if (!thing) throw new Error(`unmake: nothing named ${JSON.stringify(args.name)} is made (${[...made.keys()].join(', ') || 'nothing is'})`);
    remove(thing);
  }
  return makes();
}

/** Once a frame (agent.ts): each thing shown in its own place alone, and its updaters run by the game's step. */
export function makesFrame(dt: number): void {
  if (!made.size) return;
  const place = placeNow();
  for (const thing of made.values()) {
    thing.group.visible = thing.place === place;
    if (!thing.group.visible || !thing.updaters.length) continue;
    thing.t += dt;
    try {
      for (const update of thing.updaters) update(dt, thing.t);
    } catch (error) {
      // (a thing that throws each frame would throw sixty times a second: its updaters stop, and `makes` says why)
      thing.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      thing.updaters.length = 0;
    }
  }
}
