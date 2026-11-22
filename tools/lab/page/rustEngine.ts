// `lab rust`: the Rust engine's frame (`src/engine`, Bulwark) where the hero stands, pictured and timed: the walk of
// the scene and the engine's own work by the browser's clock, the GPU's time by the engine's timestamps, its draw
// calls, objects and triangles, what it couldn't draw by its kind, and its boot. three's figures for the same stand
// come from a tree on main (`lab passes --renderer webgpu`, `lab draws`).
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { perfClock } from '../../../src/core/perfClock';
import { RUST } from '../../../src/engine';
import type { FrameStats } from '../../../src/engine/bridge';
import { standAt } from './draws';
import { skyLightLines, turnToSkyLight } from './skyLight';
import { foesAt } from './death';
import { crowdPlaces } from './crowd';
import * as THREE from 'three';
import { bindKnown, pressing, skillNamed } from './cast';
import type { Frame } from './lab';
import { enterRoom, leaveRoom, roomHere } from '../../../src/game/rooms';
import type { RoomId } from '../../../src/data/houses';

export interface RustCommand {
  biome: BiomeId;
  view: ViewMode;
  at?: [number, number];
  frames: number;
  /** foes stood before the hero (not in the village) */
  foes: number;
  village: boolean;
  /** a house's room he's stood in (the village's) */
  room?: string;
  /** a skill of his held through the frames timed and pictured */
  cast?: string;
  hour?: number;
  zoom?: number;
  /** the camera turned to the sky's key light, the picture what's round it */
  skylight: boolean;
  /** the scene's materials listed by their kind and what they ask of a renderer */
  census: boolean;
  /** the game's tunable values set before the stand, by their paths (`rust.shadows`: src/engine/bridge.ts `TUNE`) */
  tune: Record<string, number[]>;
  /** three's WebGPU renderer timed instead, on a page booted on it */
  three: boolean;
  /** the frame written down as a tape for the engine's own harness, its maps no larger than this a side (0: none) */
  capture: number;
}

/** what a material may carry that the engine doesn't read: three's nodes, a shader patched as it compiles */
const BEYOND = [
  'colorNode', 'opacityNode', 'positionNode', 'normalNode', 'emissiveNode', 'roughnessNode', 'fragmentNode',
  'outputNode', 'alphaTestNode', 'maskNode', 'vertexNode', 'alphaMap', 'aoMap', 'lightMap', 'envMap',
];

/** The shown meshes' materials by kind and by what they carry beyond the engine's reach, the most first. */
function census(scene: THREE.Object3D, camera: THREE.Camera): string[] {
  const kinds = new Map<string, { meshes: number; names: Set<string> }>();
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if ((mesh.isMesh || (object as THREE.Points).isPoints || (object as THREE.Sprite).isSprite) && object.layers.test(camera.layers)) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const carried = BEYOND.filter((name) => (material as unknown as Record<string, unknown>)[name]);
        const patched = Object.hasOwn(material, 'onBeforeCompile') ? ['onBeforeCompile'] : [];
        const blends = material.transparent ? [`transparent${material.blending === 2 ? ' additive' : ''}`] : [];
        const kind = `${object.type} ${material.type} [${[...blends, ...patched, ...carried].join(', ')}]`;
        const entry = kinds.get(kind) ?? { meshes: 0, names: new Set<string>() };
        entry.meshes++;
        if (entry.names.size < 4) entry.names.add(material.name || object.name || object.parent?.name || '?');
        kinds.set(kind, entry);
      }
    }
    object.children.forEach(visit);
  };
  visit(scene);
  const rows = [...kinds].sort((a, b) => b[1].meshes - a[1].meshes);
  const row = ([kind, entry]: (typeof rows)[number]): string =>
    `    ${entry.meshes} x ${kind} (${[...entry.names].join(', ')})`;
  return ['  the materials of the meshes shown:', ...rows.map(row)];
}

/** how many of the meshes in view the census lists by their triangles */
const HEAVIEST = 16;

/** What a mesh's material asks that a clustered mesh can't give yet: none, it could be drawn as clusters. */
function unclustered(mesh: THREE.Mesh): string {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const asks: string[] = [];
  if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh) asks.push('skinned');
  if (materials.some((material) => material.transparent)) asks.push('blended');
  if (materials.some((material) => material.alphaTest > 0 || (material as THREE.MeshStandardMaterial).alphaMap)) asks.push('cut out');
  if (materials.some((material) => (material as unknown as Record<string, unknown>).positionNode)) asks.push('moved by its look');
  return asks.join(', ');
}

/**
 * The meshes in the camera's view by their triangles (an instanced mesh's, all its instances'), the heaviest
 * first, each with what keeps it from being drawn as clusters; and how many triangles nothing keeps.
 */
function heaviest(scene: THREE.Object3D, camera: THREE.Camera): string[] {
  const view = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const found: { name: string; triangles: number; asks: string }[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && object.layers.test(camera.layers) && mesh.geometry?.attributes.position) {
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      const inView = instances > 1 || !mesh.frustumCulled || view.intersectsObject(mesh);
      const corners = mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
      const name = mesh.name || mesh.parent?.name || mesh.parent?.parent?.name || '?';
      if (inView) found.push({ name: instances > 1 ? `${name} x${instances}` : name, triangles: corners / 3 * instances, asks: unclustered(mesh) });
    }
    object.children.forEach(visit);
  };
  visit(scene);
  found.sort((a, b) => b.triangles - a.triangles);
  const sum = (some: typeof found): number => Math.round(some.reduce((total, one) => total + one.triangles, 0));
  const free = found.filter((one) => !one.asks);
  const rows = found.slice(0, HEAVIEST).map((one) => `    ${Math.round(one.triangles)} ${one.name}${one.asks ? ` (${one.asks})` : ''}`);
  return [
    `  the meshes in view by their triangles: ${found.length} meshes, ${sum(found)} triangles; ${free.length} meshes of ${sum(free)} `
      + 'triangles could be drawn as clusters (not skinned, blended, cut out or moved by their look)',
    ...rows,
  ];
}

/** what's read of each frame, and averaged */
const TIMED: (keyof FrameStats)[] = [
  'placeMs', 'walkMs', 'engineMs', 'gpuMs', 'records', 'draws', 'shadowDraws', 'shadowTriangles', 'shadowsKept', 'lowDraws', 'objects', 'culled', 'triangles',
];

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** The renderer as the baseline reads it: its frame's draws, and its timestamps (as `gpuPasses.ts` reads them). */
interface Timed {
  info: { render: { drawCalls: number; triangles: number } };
  backend: { timestampQueryPool: { render: TimestampPool | null } };
}

interface TimestampPool {
  timestamps: Map<string, number>;
  resolveQueriesAsync(): Promise<number | undefined>;
}

/** The hero stood where the command asks, its foes before him. */
async function stand(lab: Lab, command: RustCommand): Promise<string> {
  for (const [path, values] of Object.entries(command.tune)) window.__tune?.(path, values);
  await standAt(lab, command);
  if (command.foes > 0 && !command.village) {
    const spots: THREE.Vector3[] = crowdPlaces(command.foes, G.player.pos, G.player.facing);
    await foesAt(lab, spots, spots.map(() => 1));
  }
  if (command.room) return `the ${command.room}'s room (${await inAndOut(lab, command.room as RoomId)})`;
  return command.village ? 'the village' : `${G.arena.biome}${command.foes ? `, ${command.foes} foes` : ''}`;
}

/** how far ahead of the hero a held skill is aimed (m), and how long it's held before the frames are timed (frames) */
const CAST_AHEAD = 8;
const CAST_LEAD = 45;

/** The frame's input holding the command's skill over a point ahead of the hero, his Energy and its cooldown kept
 *  full; none with no skill asked. */
function castHeld(command: RustCommand): ((frame: number) => Frame) | undefined {
  if (!command.cast) return undefined;
  const hero = G.player;
  bindKnown(command.cast);
  const { key } = skillNamed(command.cast);
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing)).multiplyScalar(CAST_AHEAD);
  const aim = hero.pos.clone().add(ahead);
  return () => {
    hero.cooldowns.clear();
    hero.energy = hero.stats.maxEnergy;
    return pressing(key, aim, true);
  };
}

/** The longest of the next `frames` frames, by the browser's clock (ms). */
async function longestFrame(lab: Lab, frames: number): Promise<number> {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  let longest = 0;
  for (let frame = 0; frame < frames; frame++) {
    const began = clock.realNow();
    await lab.step(1);
    longest = Math.max(longest, clock.realNow() - began);
  }
  return longest;
}

/** Frames stepped until the hero is in `room` (the game's own wait for its rooms, at most a minute): how long it
 *  took by the browser's clock (ms; 0 if he was in already). */
async function untilInside(lab: Lab, room: RoomId): Promise<number> {
  const clock = (window as unknown as { __labClock: { realNow: () => number; realFrame: () => Promise<void> } }).__labClock;
  const began = clock.realNow();
  if (roomHere() === room) return 0;
  while (roomHere() !== room && clock.realNow() - began < 60000) {
    await lab.step(1);
    await clock.realFrame();
  }
  return clock.realNow() - began;
}

/** The hero gone into `room`, out again and in once more, drawn each time: the longest frame of each change of
 *  place (a first visit hands the room over; a way out or a second visit should hand over nothing). He's left
 *  inside. From play: each took 20 s. */
async function inAndOut(lab: Lab, room: RoomId): Promise<string> {
  const drawing = lab.drawing;
  lab.drawing = true;
  const times: string[] = [];
  try {
    enterRoom(room);
    times.push(`in ${(await longestFrame(lab, 5)).toFixed(0)} ms`);
    // (on a page booted --cold the rooms aren't ready: the game shows its bar and goes in when they are)
    const waited = await untilInside(lab, room);
    if (waited > 0) times.push(`after ${(waited / 1000).toFixed(1)} s under the game's Opening bar`);
    leaveRoom();
    times.push(`out ${(await longestFrame(lab, 5)).toFixed(0)} ms`);
    enterRoom(room);
    times.push(`in again ${(await longestFrame(lab, 5)).toFixed(0)} ms`);
  } finally {
    lab.drawing = drawing;
  }
  return `the longest frame going ${times.join(', ')}`;
}

/** How many of `kept` (each frame's count of frames in a row that kept the sun's shadow map) drew it. */
function shadowFrames(kept: number[]): string {
  return `${kept.filter((frames) => frames === 0).length} of ${kept.length}`;
}

/** The baseline: three's WebGPU frame of the same stand, timed the same way. */
async function threeFrames(lab: Lab, command: RustCommand): Promise<Report> {
  const where = await stand(lab, command);
  const sky = command.skylight ? await turnToSkyLight(lab) : undefined;
  const hold = castHeld(command);
  const renderer = G.renderer as unknown as Timed;
  const pool = renderer.backend.timestampQueryPool;
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  const pageClock = perfClock.now;
  perfClock.now = clock.realNow;
  const drawing = lab.drawing;
  lab.drawing = true;
  const renders: number[] = [];
  const gpu: number[] = [];
  const draws: number[] = [];
  const triangles: number[] = [];
  try {
    await lab.step(hold ? CAST_LEAD : 10, hold);
    await pool.render?.resolveQueriesAsync();
    for (let frame = 0; frame < command.frames; frame++) {
      await lab.step(1, hold);
      await window.__labClock.realFrame();
      renders.push(RUST.renderMs);
      draws.push(renderer.info.render.drawCalls);
      triangles.push(renderer.info.render.triangles);
      await pool.render?.resolveQueriesAsync();
      let frameMs = 0;
      for (const ms of pool.render?.timestamps.values() ?? []) frameMs += ms;
      gpu.push(frameMs);
    }
  } finally {
    perfClock.now = pageClock;
    lab.drawing = drawing;
  }
  const pictured = await lab.screen('the WebGPU frame of three.js', [], sky?.clip);
  const size = G.renderer.domElement;
  const lines = [
    `three.js WebGPU: ${where} ${command.view}, ${size.width}x${size.height} drawn, medians of ${command.frames} frames`,
    `  the render: ${median(renders).toFixed(2)} ms on the CPU; the GPU ${median(gpu).toFixed(2)} ms `
      + '(every pass: shadows, scene, post chain)',
    `  ${median(draws)} draw calls, ${median(triangles)} triangles (every pass)`,
    `  the hero at ${G.player.pos.x.toFixed(1)}, ${G.player.pos.z.toFixed(1)}`,
  ];
  const turned = sky === undefined ? undefined : skyLightLines(sky);
  if (turned) lines.push(turned.line);
  return { text: lines.join('\n'), problems: turned?.problems ?? [], moments: [pictured] };
}

export async function rustEngine(lab: Lab, command: RustCommand): Promise<Report> {
  const bridge = RUST.bridge;
  if (!bridge) {
    if (command.three) return threeFrames(lab, command);
    const why = RUST.failed || 'the page was not booted on it (--renderer rust)';
    return { text: `the Rust engine isn't running: ${why}`, problems: ['the Rust engine is not running'], moments: [] };
  }
  const where = await stand(lab, command);
  const sky = command.skylight ? await turnToSkyLight(lab) : undefined;
  const hold = castHeld(command);
  /** what a frame timed left undrawn, by its kind: the most of any frame */
  const undrawn = new Map<string, number>();
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  const pageClock = perfClock.now;
  perfClock.now = clock.realNow;
  const drawing = lab.drawing;
  lab.drawing = true;
  const read = new Map<keyof FrameStats, number[]>(TIMED.map((name) => [name, []]));
  const renders: number[] = [];
  // (a whole frame of the game by the browser's clock: its update and its render)
  const frames: number[] = [];
  const handedOver = { meshes: 0, textures: 0, materials: 0 };
  // (what the engine or the GPU says while it draws: a refused pipeline or pass draws nothing, and says so here)
  const said: string[] = [];
  let madeBefore = 0;
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => {
    said.push(parts.map(String).join(' '));
    consoleError(...parts);
  };
  try {
    // (what's first met here is handed over before the frames timed)
    await lab.step(hold ? CAST_LEAD : 10, hold);
    await pipelinesCompiled(lab);
    madeBefore = RUST.pipelines.made;
    for (let frame = 0; frame < command.frames; frame++) {
      const began = clock.realNow();
      await lab.step(1, hold);
      for (const [kind, count] of bridge.skipped) undrawn.set(kind, Math.max(undrawn.get(kind) ?? 0, count));
      frames.push(clock.realNow() - began);
      // (the browser let go: the engine's timestamps come back on its own time, and a step never yields)
      await window.__labClock.realFrame();
      for (const name of TIMED) read.get(name)!.push(bridge.stats[name]);
      renders.push(RUST.renderMs);
      handedOver.meshes += bridge.stats.newMeshes;
      handedOver.textures += bridge.stats.newTextures;
      handedOver.materials += bridge.stats.newMaterials;
    }
  } finally {
    perfClock.now = pageClock;
    lab.drawing = drawing;
    console.error = consoleError;
  }
  await pipelinesCompiled(lab);
  const pictured = await lab.screen('the Rust engine\'s frame', [], sky?.clip);
  const of = (name: keyof FrameStats): number => median(read.get(name)!);
  const skipped = [...undrawn].sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind} ${count}`);
  const canvas = document.getElementById('rust-canvas') as HTMLCanvasElement;
  const { boot, bridge: { held } } = { boot: RUST.boot, bridge };
  const lines = [
    `${where} ${command.view}, ${canvas.width}x${canvas.height} drawn, medians of ${command.frames} frames`,
    `  the render: ${median(renders).toFixed(2)} ms on the CPU (its matrices ${of('placeMs').toFixed(2)}, the scene walked ${of('walkMs').toFixed(2)}, `
      + `the engine ${of('engineMs').toFixed(2)}); the GPU ${of('gpuMs').toFixed(2)} ms, at the least ${Math.min(...read.get('gpuMs')!).toFixed(2)} (shadow and scene passes)`,
    `  a whole frame: ${median(frames).toFixed(2)} ms on the CPU, the game's update and the lab's step `
      + `${(median(frames) - median(renders)).toFixed(2)} of it`,
    `  ${of('records')} records from the page, ${of('culled')} things out of view, ${of('objects')} objects drawn `
      + `in ${of('draws')} draw calls (+${of('shadowDraws')} for the sun's shadow), ${of('triangles')} triangles (+${of('shadowTriangles')})`,
    `  ${of('lowDraws')} draws at a quarter of the scene's pixels, laid over it`,
    `  the sun's shadow drawn in ${shadowFrames(read.get('shadowsKept')!)} frames timed, kept as it was in the rest`,
    `  held: ${held.meshes} meshes, ${held.textures} maps, ${held.materials} materials, ${held.sets} instance sets; `
      + `handed over while timed: ${handedOver.meshes} meshes, ${handedOver.textures} maps, ${handedOver.materials} materials`,
    `  not drawn (a frame): ${skipped.join(', ') || 'nothing'}`,
    `  pipelines: ${RUST.pipelines.made} made, ${RUST.pipelines.made - madeBefore} of them while timed `
      + `(each compiled aside, its draws left out till it's ready)`,
    `  the engine's boot: the module ${boot.wasmMs.toFixed(0)} ms, the device and pipelines ${boot.deviceMs.toFixed(0)} ms, `
      + `its first frame ${boot.firstFrameMs.toFixed(0)} ms`,
  ];
  lines.push(`  lit by: ${bridge.lights()}`);
  const lamps = bridge.lampShadowsNow();
  lines.push(`  the lamps' shadows: ${lamps.drawn} lamps' drawn, ${lamps.waiting} waiting`);
  const cache = bridge.lightCacheNow();
  lines.push(`  the light cache: ${cache.lamps} lamps and ${cache.own} of the scene's own lights in ${cache.cells} cells of ${cache.cell.toFixed(2)} m, `
    + `${(cache.cells * 16 / 1e6).toFixed(1)} MB on the GPU; baked ${cache.bakes} times, the last ${cache.ms.toFixed(0)} ms on the page; read ${cache.open.toFixed(2)} bright in the open, `
    + `${cache.sheltered.toFixed(2)} under the shelter`);
  if (command.census) lines.push(...census(G.scene, G.camera), ...heaviest(G.scene, G.camera));
  if (command.census) lines.push('  the frame\'s point lights:', ...bridge.pointLines().map((line) => `    ${line}`));
  lines.push(`  the hero at ${G.player.pos.x.toFixed(1)}, ${G.player.pos.z.toFixed(1)}; the camera's layers ${G.camera.layers.mask}`);
  const problems: string[] = [];
  const turned = sky === undefined ? undefined : skyLightLines(sky);
  if (turned) lines.push(turned.line);
  if (turned) problems.push(...turned.problems);
  if (command.capture) {
    // (the frame written down for the engine's own harness: the node side fetches `__rustTape` and saves it)
    RUST.captureNext = command.capture;
    lab.drawing = true;
    await lab.step(1);
    lab.drawing = drawing;
    (window as unknown as { __rustTape: Blob | null }).__rustTape = RUST.tape;
    RUST.tape = null;
    if (!(window as unknown as { __rustTape: Blob | null }).__rustTape) problems.push('no tape was written');
  }
  if (!(of('draws') > 0)) problems.push('the engine drew nothing');
  // (a skill's own look left out: from play, "no mage visual effects on spells when casting them")
  if (command.cast && skipped.length) problems.push(`${command.cast} cast: not drawn by the engine: ${skipped.join(', ')}`);
  for (const line of new Set(said)) problems.push(`said while drawing: ${line.slice(0, 1500)}`);
  return { text: lines.join('\n'), problems, moments: [pictured] };
}

/** the most real frames the lab waits for the engine's pipelines to compile aside */
const COMPILE_FRAMES_MOST = 1200;

/**
 * Waits, on the browser's own time, until none of the engine's pipelines is compiling aside
 * (`src/engine/pipelinesAside.ts`), then draws a frame with them: a picture taken before would lack what they draw.
 */
export async function pipelinesCompiled(lab: Lab): Promise<void> {
  for (let frame = 0; frame < COMPILE_FRAMES_MOST && RUST.pipelines.compiling > 0; frame++) {
    await window.__labClock.realFrame();
  }
  await lab.step(1);
}
