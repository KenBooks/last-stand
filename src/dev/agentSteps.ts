// What an invited agent may ask of the game (agent.ts, #529), each a step answered with plain data:
//   look     the hero, the camera, what's under the crosshair, the settings (the panel's controls, the quality) and
//            the frame's parts
//   picture  the frame as drawn, through the player's view or from a camera the agent places (the free camera)
//   set      what the developer panel sets, by its controls' names (agentControls.ts)
//   eval     code run in this page, with `G` (the game's state), `THREE` and `dev` (this mode's own pieces) in scope
// Nothing here runs until the owner has accepted the agent (agent.ts holds every message till then).
import * as THREE from 'three';
import { G } from '../state';
import { frameRect, frameShot, viewMode } from '../core/renderer';
import { qualityLevel, qualitySetting, resolutionSetting } from '../core/quality';
import { perfHudStats } from '../ui/perfHud';
import { frameParts } from '../perf/sceneParts';
import { freeCamOn, placeFreeCam, setFreeCam } from './freeCam';
import { panelControls, setControl } from './agentControls';
import { cheats, time } from './index';

/** A step as the agent sends it. */
export interface AgentStep { step?: unknown; [key: string]: unknown }

/** what the steps ask of the mode around them: the free camera flown as F9 flies it (the game frozen, its overlay) */
export interface StepHooks { fly(on: boolean): void }
let hooks: StepHooks = { fly: () => {} };
export function initSteps(h: StepHooks): void { hooks = h; }

// --- frames --------------------------------------------------------------------------------------------------------
const waiting: { left: number; done: () => void }[] = [];
/** Called once a frame (index.ts): those waiting for frames are counted down. */
export function stepsFrame(): void {
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (--waiting[i].left > 0) continue;
    waiting[i].done();
    waiting.splice(i, 1);
  }
}
/** Resolves once `count` more frames have been drawn. */
export const frames = (count: number): Promise<void> => new Promise((done) => { waiting.push({ left: Math.max(1, count), done }); });

// --- plain data ----------------------------------------------------------------------------------------------------
const round = (n: number): number => Math.round(n * 1000) / 1000;
const xyz = (v: THREE.Vector3): number[] => [round(v.x), round(v.y), round(v.z)];
/** how deep, how long and how wide a value is told before it's cut short */
const PLAIN = { depth: 5, text: 20_000, items: 200 };

/** `value` as data that goes over the link: numbers, texts, lists and plain objects, cut short where it's deep, long
 *  or loops back on itself; a vector as its numbers, anything else by its kind. */
export function plain(value: unknown, depth = PLAIN.depth, seen = new Set<object>()): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.length > PLAIN.text ? `${value.slice(0, PLAIN.text)}… (${value.length} characters)` : value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return { error: value.message, stack: value.stack?.split('\n').slice(0, 6).join('\n') };
  const object = value as object;
  if (seen.has(object)) return '[seen above]';
  const named = object.constructor?.name ?? 'Object';
  if (depth <= 0) return `[${named}]`;
  seen.add(object);
  try {
    if (object instanceof THREE.Vector3 || object instanceof THREE.Vector2 || object instanceof THREE.Vector4
      || object instanceof THREE.Quaternion || object instanceof THREE.Euler) return (object.toArray() as unknown[]).map((n) => plain(n));
    if (object instanceof THREE.Color) return `#${object.getHexString()}`;
    if (ArrayBuffer.isView(object) || Array.isArray(object)) {
      const list = Array.from(object as ArrayLike<unknown>);
      const told = list.slice(0, PLAIN.items).map((each) => plain(each, depth - 1, seen));
      if (list.length > PLAIN.items) told.push(`… (${list.length} in all)`);
      return told;
    }
    if (object instanceof Map) return plain(Object.fromEntries([...object].slice(0, PLAIN.items).map(([k, v]) => [String(k), v])), depth, seen);
    if (object instanceof Set) return plain([...object], depth, seen);
    if (object instanceof Node) return `[${named}${object instanceof Element && object.id ? ` #${object.id}` : ''}]`;
    const told: Record<string, unknown> = {};
    if (named !== 'Object') told['(a)'] = named;
    let count = 0;
    for (const key of Object.keys(object)) {
      if (++count > PLAIN.items) { told['…'] = `${Object.keys(object).length} keys in all`; break; }
      let each: unknown;
      try { each = (object as Record<string, unknown>)[key]; } catch (error) { each = `[threw: ${(error as Error).message}]`; }
      told[key] = plain(each, depth - 1, seen);
    }
    return told;
  } finally {
    seen.delete(object);
  }
}

// --- look ----------------------------------------------------------------------------------------------------------
const _ray = new THREE.Raycaster(), _centre = new THREE.Vector2(0, 0), _dir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Whether `object` and all above it are drawn. */
function shown(object: THREE.Object3D): boolean {
  for (let each: THREE.Object3D | null = object; each; each = each.parent) if (!each.visible) return false;
  return true;
}

/** The names above `object`, the scene's side first. */
function pathOf(object: THREE.Object3D): string {
  const names: string[] = [];
  for (let each: THREE.Object3D | null = object; each && each !== G.scene; each = each.parent) {
    names.unshift(each.name || each.type);
  }
  return names.join(' > ');
}

/** What the middle of the view looks at (where the crosshair is in the close views): the nearest drawn mesh along
 *  it, the foe it belongs to if it's one's, and the place hit. */
function underCrosshair(): unknown {
  _ray.setFromCamera(_centre, G.camera);
  _ray.layers.mask = G.camera.layers.mask;
  const hit = _ray.intersectObjects(G.scene.children, true)
    .find((each) => (each.object as THREE.Mesh).isMesh && shown(each.object));
  if (!hit) return null;
  const foe = G.enemies.find((enemy) => {
    for (let each: THREE.Object3D | null = hit.object; each; each = each.parent) if (each === enemy.obj) return true;
    return false;
  });
  const material = (hit.object as THREE.Mesh).material;
  const materials = (Array.isArray(material) ? material : [material]).map((each) => each?.name || each?.type);
  return {
    object: pathOf(hit.object), distance: round(hit.distance), at: xyz(hit.point), materials,
    instance: hit.instanceId ?? undefined,
    foe: foe ? { type: foe.type, name: foe.name, life: round(foe.life), maxLife: foe.maxLife, at: xyz(foe.obj.position) } : undefined,
  };
}

/** The game as it stands: the hero, the camera, what's under the crosshair, the settings, the frame's parts. */
export function look(): unknown {
  const hero = G.player, camera = G.camera, info = G.renderer.info, stats = perfHudStats();
  camera.getWorldDirection(_dir);
  _euler.setFromQuaternion(camera.quaternion, 'YXZ');
  const controls = panelControls();
  const taken = new Set(controls.filter((c) => c.name.startsWith('part:') && c.value === false).map((c) => c.name.slice(5)));
  return {
    mode: G.mode, biome: G.arena.biome,
    run: G.run ? { wave: G.run.wave, phase: G.run.phase, training: G.run.training } : null,
    foes: G.enemies.filter((enemy) => enemy.alive).length,
    hero: {
      class: hero.cls.id, at: xyz(hero.pos), facing: round(hero.facing), life: round(hero.life),
      maxLife: hero.stats.maxLife, energy: round(hero.energy), maxEnergy: hero.stats.maxEnergy,
    },
    camera: {
      view: freeCamOn() ? 'free' : viewMode(), at: xyz(camera.position), looks: xyz(_dir),
      yaw: round(_euler.y), pitch: round(_euler.x), fov: camera.fov,
    },
    crosshair: underCrosshair(),
    time: { frozen: time.frozen, speed: time.scale },
    settings: {
      quality: { setting: qualitySetting(), level: qualityLevel(), resolution: resolutionSetting() },
      screen: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
      panel: controls,
    },
    frame: {
      draws: info.render.calls, triangles: info.render.triangles,
      fps: stats ? round(stats.fps) : null, ms: stats ? round(stats.p50) : null,
      cpu: stats ? round(stats.cpu) : null, gpu: stats ? round(stats.gpu) : null,
      parts: frameParts().map((part) => {
        const name = part.name.replace(/ \(\d+\)$/, '');
        return { name: part.name, in: !taken.has(name), untimed: part.untimed };
      }),
    },
  };
}

// --- picture -------------------------------------------------------------------------------------------------------
/** how long a picture waits for a frame (ms): none is drawn while the game's tab is out of view */
const SHOT_WAIT = 10_000;
/** frames a placed camera is given before its picture: what the game draws by its camera's place comes in */
const SETTLE_FRAMES = 3;
/** a picture's longest side by default (px), and the most its text may be to fit one message of the relay's */
const SIDE = 1280, DATA_MOST = 3_600_000;

/** The next frame as drawn, copied (shrunk to `side` px at its longest) before anything is drawn over it. */
function shot(side: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const take = (canvas: HTMLCanvasElement): void => {
      clearTimeout(timer);
      try {
        const { left, top, width, height } = frameRect();
        const k = Math.min(1, side / Math.max(width, height));
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(width * k));
        out.height = Math.max(1, Math.round(height * k));
        out.getContext('2d')!.drawImage(canvas, left, top, width, height, 0, 0, out.width, out.height);
        resolve(out);
      } catch (error) { reject(error as Error); }
    };
    const timer = setTimeout(() => {
      if (frameShot.take === take) frameShot.take = null;
      reject(new Error('no frame was drawn in 10 s: is the game\'s tab in view?'));
    }, SHOT_WAIT);
    frameShot.take = take;
  });
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const numbers = (value: unknown, count: number, what: string): number[] => {
  if (!Array.isArray(value) || value.length !== count || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error(`picture: ${what} is ${count} numbers`);
  }
  return value as number[];
};

/** A camera the agent asked for: where it stands and how it looks (a place looked at, or a yaw and a pitch). */
function placeOf(camera: Record<string, unknown>): { at: THREE.Vector3; yaw: number; pitch: number } {
  const at = new THREE.Vector3(...numbers(camera.at, 3, 'camera.at'));
  if (camera.to === undefined) return { at, yaw: Number(camera.yaw ?? 0), pitch: Number(camera.pitch ?? 0) };
  const way = new THREE.Vector3(...numbers(camera.to, 3, 'camera.to')).sub(at);
  if (way.lengthSq() < 1e-9) throw new Error('picture: camera.to is where the camera stands');
  way.normalize();
  return { at, yaw: Math.atan2(-way.x, -way.z), pitch: Math.asin(THREE.MathUtils.clamp(way.y, -1, 1)) };
}

/**
 * The frame as drawn (the game's view without the page's UI), as a JPEG or a PNG in base64. With `camera` it's taken
 * from there by the free camera, which is then put back as it was; `keep` leaves the owner looking from it, flying
 * and frozen as F9 leaves him.
 */
export async function picture(args: AgentStep): Promise<unknown> {
  const side = THREE.MathUtils.clamp(Number(args.side ?? SIDE) || SIDE, 64, 4096);
  const type = args.format === 'png' ? 'image/png' : 'image/jpeg';
  let putBack: (() => void) | null = null;
  if (args.camera && typeof args.camera === 'object') {
    const place = placeOf(args.camera as Record<string, unknown>);
    const flying = freeCamOn();
    _euler.setFromQuaternion(G.camera.quaternion, 'YXZ');
    const was = { at: G.camera.position.clone(), yaw: _euler.y, pitch: _euler.x };
    if (args.keep) hooks.fly(true);
    else if (!flying) setFreeCam(true);
    placeFreeCam(place.at, place.yaw, place.pitch);
    if (!args.keep) putBack = flying ? () => placeFreeCam(was.at, was.yaw, was.pitch) : () => setFreeCam(false);
    await frames(SETTLE_FRAMES);
  }
  let canvas: HTMLCanvasElement;
  try { canvas = await shot(side); } finally { putBack?.(); }
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.9));
  if (!blob) throw new Error('picture: the frame gave no picture');
  const data = await base64Of(blob);
  if (data.length > DATA_MOST) throw new Error(`picture: ${canvas.width}x${canvas.height} is too large to send as ${type}: ask for a smaller side, or a JPEG`);
  _euler.setFromQuaternion(G.camera.quaternion, 'YXZ');
  return { type, width: canvas.width, height: canvas.height, view: args.camera ? 'placed' : freeCamOn() ? 'free' : viewMode(), data };
}

// --- set -----------------------------------------------------------------------------------------------------------
/** The panel's controls named in `values` each set, in the order given; the controls as they then stand. */
export function set(args: AgentStep): unknown {
  const values = args.values;
  if (!values || typeof values !== 'object') throw new Error('set: give values, an object of the panel\'s controls by name');
  for (const [name, value] of Object.entries(values)) setControl(name, value);
  return panelControls();
}

// --- eval ----------------------------------------------------------------------------------------------------------
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...names: string[]) => (...args: unknown[]) => Promise<unknown>;
/** what `dev` is in an agent's code: this mode's own pieces */
// (made as it's asked for: index.ts, which loads this module, isn't run through yet as this one is)
const devScope = (): object => ({ time, cheats, look, frames, placeFreeCam, setFreeCam, freeCamOn, panelControls, setControl, plain });

/** `code` run in this page, an expression or statements with a `return`, awaited; its value as plain data. */
export async function evaluate(args: AgentStep): Promise<unknown> {
  if (typeof args.code !== 'string' || !args.code.trim()) throw new Error('eval: give code, a text');
  let run: (...scope: unknown[]) => Promise<unknown>;
  try {
    run = new AsyncFunction('G', 'THREE', 'dev', `return (${args.code}\n);`);
  } catch {
    // (not one expression: statements, which say what they return)
    run = new AsyncFunction('G', 'THREE', 'dev', args.code);
  }
  return plain(await run(G, THREE, devScope()));
}

/** A step run; its result as plain data. Throws at one it doesn't know. */
export async function runStep(message: AgentStep): Promise<unknown> {
  switch (message.step) {
    case 'look': return look();
    case 'picture': return picture(message);
    case 'set': return set(message);
    case 'eval': return evaluate(message);
    default: throw new Error(`no step ${JSON.stringify(message.step)}: look, picture, set, eval`);
  }
}
