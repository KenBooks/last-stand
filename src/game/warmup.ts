// Load-time shader warm-up. The lobby's, before it shows: its biome compiled as it's built (`compileTheBiome`),
// every effect, loot and skill visual (the lobby lets the hero try his skills on its dummies) compiled with the hero
// as he's built (`compileTheLobby`), then all drawn with the hero wearing all he can (`warmLobby`); the fight's
// foes are built meanwhile, as it waits on the GPU (`buildAhead`). The rest after it (`warmTheRest`), as two needs
// (game/warm.ts): the fight's (every foe, the other biomes), a part at a time behind the lobby, a step a frame, once
// the loading screen has left and where this build warmed them on this machine before (they come from the GPU's
// cache), else at once when something needs them; and the other classes' heroes, at once when something needs them
// (built behind the lobby, a hero's first build held it up 250 ms: his head's hair). Each briefly creates one of
// everything that brings its own materials, compiles their shaders and clears it all again: with core/shaders.ts
// pinning programs, nothing compiles mid-fight. Compiling a program took ANGLE a third of a second on a first visit,
// and a third of the boot's are the fight's alone (`lab programs`).
import * as THREE from 'three';
import { G } from '../state';
import { behindTheLobby, compileAhead, warmUp, type Swap, type WarmedUp } from '../core/shaders';
import { compilePasses, sceneTarget } from '../core/renderer';
import { COMPILE_SLICE, compileSlice, WEBGPU } from '../core/webgpu';
import { mapsArrived, mapsMadeAfresh } from '../core/textures';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { BIOME_IDS } from '../data/biomes';
import { SKILL_IMPLS } from '../combat/skills/index';
import { CLASSES } from '../data/classes/index';
import { buildModel } from '../entities/models/index';
import { makeHeadAhead } from '../entities/models/head';
import { drawnAsOneSamples } from '../entities/models/drawAsOne';
import { Enemy } from '../entities/enemy';
import { heroLights } from '../entities/player';
import { crowdSlots, joinCrowd, leaveCrowd } from '../entities/models/crowd';
import { clearEffects, shockwave, groundFlash, decal, telegraph, lightning, iceSpikes, glyphMarker, lightPillar, crackDecal, crystalBurst } from '../fx/effects';
import { rubble } from '../fx/rubble';
import { clearLights } from '../fx/lights';
import { particles } from '../fx/particles';
import { coreSamples } from '../combat/projectiles';
import { sporeOrbSample } from '../fx/sporeOrb';
import { riftBoltSamples } from '../fx/riftBolts';
import { vineSamples } from '../fx/vine';
import { swingTrailSamples } from '../fx/swingTrail';
import { groundSamples } from './groundItems';
import { compileOutline, warmOutline } from '../ui/overlay/outline';
import { labelsScene } from '../ui/overlay/layer';
import { buildHallAhead } from './hall';
import { heroWarming, isReadying, isWarm, markWarm, onReadying, want, wanted, warming, warmingRuns, type Need } from './warm';
import type { Model } from '../types';

/** far outside the arena, past what the lobby's camera sees: where the fight's warm-up stands what it builds */
const AWAY = new THREE.Vector3(4000, 0, 4000);
/** of the fight's warm-up at once (its progress), the share done once its foes and heroes are built */
const BUILT = 0.3;
/**
 * Not from a cache: a program of a part of the fight's not linked this long after its commands were done (ms; a
 * return's within a frame or two, a cold one's hundreds). Compiled cold behind the live lobby, ANGLE's work on the
 * GPU's process held its frames up for seconds (a return whose fight was never compiled drew 0 to 6 frames a second
 * for 3 s): what's cold waits for what needs it, under the fight's loading bar.
 */
const COLD_LINK_MS = 150;
/**
 * The builds that warmed the fight's programs on this machine (the latest few, in local storage): the fight is
 * warmed behind the lobby only on a visit of one of them, whose programs are in the GPU's cache. A build is its code's
 * chunk, whose name carries a hash of the game's code, so a deploy that changed a shader is one of its own (kept
 * maps said nothing of it: a return after a visit that never fought compiled the fight cold behind the lobby).
 */
const WARMED_KEY = 'last-stand.fight-warmed', WARMED_KEPT = 4;
const BUILD = import.meta.url;
/** the most a step behind the lobby waits for its frame (ms): a hidden page draws none */
const FRAME_MOST_MS = 100;

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r));
/** Resolved just after the page's next frame (`FRAME_MOST_MS` at most): a step behind the lobby has a frame's time
 *  to itself, its GL work queued after that frame's. */
const nextFrame = (): Promise<void> => new Promise((resolve) => {
  let gone = false;
  const go = (): void => { if (!gone) { gone = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(go));
  setTimeout(go, FRAME_MOST_MS);
});

/** The builds that warmed the fight here (`WARMED_KEY`), the latest first (none where storage is blocked). */
function warmedBuilds(): string[] {
  try {
    const builds: unknown = JSON.parse(localStorage.getItem(WARMED_KEY) ?? '[]');
    return Array.isArray(builds) ? builds.filter((b): b is string => typeof b === 'string') : [];
  } catch {
    return [];
  }
}

/** This build kept as one that warmed the fight here. */
function rememberWarmed(): void {
  try {
    const builds = [BUILD, ...warmedBuilds().filter((b) => b !== BUILD)].slice(0, WARMED_KEPT);
    localStorage.setItem(WARMED_KEY, JSON.stringify(builds));
  } catch {
    // (storage blocked: the next visit warms the fight when something needs it)
  }
}

/** `model`'s hero with all it can wear shown at once (a model hides what isn't worn, and a hidden mesh draws
 *  nothing), at `at`. */
function heroAllWorn(model: string, at?: THREE.Vector3): Model {
  const m = buildModel(model);
  m.root.traverse((o) => { o.visible = true; });
  m.root.name = `warm-up: ${model}, all worn`;   // names show up in the perf report
  if (at) m.root.position.copy(at);
  // (and on WebGPU his parts as a hero draws them, merged: each material drawn from the joints)
  drawnAsOneSamples(m);
  return m;
}

/** the biomes the lobby doesn't show */
const otherBiomes = () => BIOME_IDS.filter((id) => id !== G.arena.biome);

/**
 * The lobby's biome compiled as soon as it's built, the hero's lights in (built next, he takes them on: a program is
 * made for the scene's lights, `heroLights`), so the GPU's threads link its programs while the hero is built; the
 * lobby's warm-up waited for them after (a first visit's: 3.5 s of the 14 s of compiles it waited 2.3 s on). The
 * post chain's and the overlay's too, which the lobby's first full frame linked one after another.
 */
export function compileTheBiome(): void {
  const { staff, hand } = heroLights();
  G.scene.add(staff, hand);
  compileAhead(G.renderer, G.scene, G.camera, sceneTarget(), otherBiomes().map((id) => G.arena.groupOf(id)));
  compilePasses([labelsScene()]);
}

/** `objects` named `name` where they have none of their own: what uses a program, as `lab programs` lists them. */
function named<T extends THREE.Object3D>(name: string, objects: T[]): T[] {
  for (const o of objects) o.name ||= name;
  return objects;
}

/** What `spawn` adds to the scene, named `name` where it has no name of its own. */
function spawned(name: string, spawn: () => unknown): void {
  const before = new Set(G.scene.children);
  spawn();
  named(name, G.scene.children.filter((o) => !before.has(o)));
}

/** The samples of the skills `model`'s classes cast (each skill once), named for what uses them. */
function skillSamples(model: string): THREE.Object3D[] {
  const classes = Object.values(CLASSES).filter((c) => c.model === model);
  const impls = new Set(classes.flatMap((c) => c.skills.map((s) => s.impl)));
  return [...impls].flatMap((impl) => named(`skill: ${impl}`, SKILL_IMPLS[impl]?.warm?.() ?? []));
}

/** what the lobby's warm-up draws besides its hero with all he can wear: made and compiled with the hero
 *  (`compileTheLobby`) */
let lobbyExtras: THREE.Object3D[] = [];

/**
 * What the lobby can do made (every effect, loot and its hero's skills: another class's are warmed with its hero, as
 * a class switch or a partner's needs them, `heroParts`; the lobby's warm-up compiled every class's, 14 programs,
 * before it showed) and compiled with the hero as soon as he's built, before the lobby's page is laid out: its first
 * paint builds Skia's programs on the GPU process's main thread one after another (a first visit's 88, 1.1 s), and
 * the lobby's warm-up, compiled after it, had its links begin 0.6 s after it asked.
 */
export function compileTheLobby(): void {
  const at = new THREE.Vector3(), p = { x: 0, z: 0 };
  const effects: [string, () => unknown][] = [
    ['shockwave', () => shockwave(p)], ['ground flash', () => groundFlash(p)], ['scorch', () => decal(p)],
    ['frost', () => decal(p, { type: 'frost' })], ['telegraph', () => telegraph(p, 2, 1)],
    ['lightning', () => lightning(at, new THREE.Vector3(1, 1, 1))], ['ice spikes', () => iceSpikes(p, 2)],
    ['glyph', () => glyphMarker(p)], ['light pillar', () => lightPillar(p)], ['crack', () => crackDecal(p)],
    ['crystals', () => crystalBurst(p)],
  ];
  for (const [name, spawn] of effects) spawned(`effect: ${name}`, spawn);
  for (const kind of ['stone', 'wood', 'shroom', 'ember'] as const) rubble(0, 0, { count: 24, color: 0x808080, kind, radius: 0.1, height: 0.1, size: 0.2, speed: 1 });
  // (the other heroes' skills are theirs to warm, the foes' shots the fight's)
  const extra: THREE.Object3D[] = [
    ...named('cores', coreSamples()), ...named('drops', groundSamples()), ...named('swing trail', swingTrailSamples()),
    ...skillSamples(G.player.cls.model),
  ];
  lobbyExtras = extra;
  compileAhead(G.renderer, G.scene, G.camera, sceneTarget(), otherBiomes().map((id) => G.arena.groupOf(id)), extra);
  // (the outline's edge: the dummies' masks are the lobby's warm-up's, as they spawn when the lobby is entered)
  compileOutline([]);
}

/** the lobby's dummies' bodies, which its warm-up outlines */
const dummies = (): THREE.Object3D[] => G.enemies.map((e) => e.obj);

/** What the lobby shows and can do, warmed before it shows (the lobby's dummies already stand in it, its effects,
 *  loot and skills made with its hero: `compileTheLobby`); the fight's foes built meanwhile (`buildAhead`). With
 *  `hall` (a first visit, which opens on the hero selection screen), the hall of heroes' room too, drawn in the
 *  biome's place; its other heroes are warmed after the reveal, a hero at a time (`warmTheRest`). */
export async function warmLobby(hall = false): Promise<void> {
  // (the hero's class with all it can wear: equipping anything in the lobby compiles nothing)
  await nextTask();
  const hero = heroAllWorn(G.player.cls.model);
  const extra = [...lobbyExtras, hero.root];
  lobbyExtras = [];
  const leaveOut = otherBiomes().map((id) => G.arena.groupOf(id));
  const start = performance.now();
  // (the dummies' crowd, shown from the first frame: hidden till then, its programs were made at the lobby's draws)
  for (const dummy of G.enemies) for (const slot of crowdSlots(dummy.model)) slot.visible = true;
  const warming = warmUp(G.renderer, G.scene, G.camera, sceneTarget(), {
    objects: extra, leaveOut, before: mapsArrived, also: () => compileOutline(dummies()),
  });
  // (its compile is made as it's called, the scene walked before the foes are built; a first visit's other heroes
  // after them, for the hall of heroes it opens on)
  const ahead = buildAhead(theFight()).then(() => (hall ? buildHeroesAhead() : undefined));
  const took = await warming;
  performance.measure('warm the lobby', { start, duration: performance.now() - start, detail: took });
  hero.dispose();
  // (a first visit opens on the hall of heroes: its room warmed with the lobby, its other heroes after the reveal, a
  // hero at a time, each shown as he's warm: warmed with the lobby, the two held a low-end laptop's loading screen)
  if (hall) {
    await warmBuilt([hallPart().build()]);
    hallWarm = true;
  }
  // (the outline a held skill draws round a foe: the dummies' meshes drawn into its mask)
  warmOutline(dummies());
  clearEffects(); clearLights(); particles.clear();
  await ahead;
}

/** A part of the fight, built for its warm-up (one task: before the lobby shows, `buildAhead`), kept built till
 *  it's warmed (`warmPart`). */
interface Part {
  name: string;
  build(): Built;
  built?: Built;
  /** what of its build is made in a task of its own before it (a hero's head: `makeHeadAhead`) */
  ahead?: () => void;
}
/** A part built: what's compiled, what's added to the scene for the draw, what's drawn alone, what's shown in place
 *  of the lobby's biome for the draw, what's outlined, what's brought in just before the draw (`show`) and taken
 *  out again (`hide`), and its pieces let go (`done`). */
interface Built {
  compile: THREE.Object3D[];
  objects: THREE.Object3D[];
  drawn: THREE.Object3D[];
  swap?: Swap;
  outlined: THREE.Object3D[];
  show?(): void;
  hide?(): void;
  done(): void;
}

/**
 * The fight's parts: each foe (a plain one and a hero one of its kind, built away from the arena, where the lobby's
 * camera never looks, never let act, and kept out of the scene and their crowd till drawn: a crowd draws its kind
 * whatever the camera sees, and the lobby's frames linked its programs as they drew it, each waiting for its link),
 * the foes' shots, each other biome. The training dummy is the lobby's own.
 */
function fightParts(): Part[] {
  const ids = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => !ENEMIES[id].dummy);
  const foes = ids.map((id): Part => ({
    name: id,
    build() {
      const pair = [new Enemy(id, { pos: AWAY }), new Enemy(id, { pos: AWAY, hero: true })];
      for (const e of pair) { G.scene.remove(e.obj); leaveCrowd(e); }
      const roots = pair.map((e) => e.obj);
      const slots = crowdSlots(pair[0].model);
      const show = (): void => { for (const e of pair) joinCrowd(e); };
      const hide = (): void => { for (const e of pair) leaveCrowd(e); };
      const done = (): void => { for (const e of pair) e.dispose(); };
      return { compile: [...roots, ...slots], objects: roots, drawn: slots, outlined: roots, show, hide, done };
    },
  }));
  const shots: Part = {
    name: 'shots',
    build() {
      const samples = [...named('spore orb', [sporeOrbSample()]), ...named('rift bolts', riftBoltSamples()),
        ...named('vine', vineSamples())];
      return { compile: samples, objects: samples, drawn: [], outlined: [], done: () => undefined };
    },
  };
  const biomes = otherBiomes().map((id): Part => ({
    name: id,
    build() {
      const swap = { show: G.arena.groupOf(id), hide: G.arena.groupOf(G.arena.biome) };
      return { compile: [swap.show], objects: [], drawn: [], swap, outlined: [], done: () => undefined };
    },
  }));
  return [...foes, shots, ...biomes];
}

/** the fight's parts, made once: built ahead before the lobby shows, warmed after */
let fight: Part[] | undefined;
const theFight = (): Part[] => (fight ??= fightParts());

/**
 * `parts` built, a task each, while the lobby's warm-up waits for its maps and its programs' links (before the lobby
 * shows): a foe kind's first build is one task of 30 to 90 ms (its geometry sculpted, its crowd's merged:
 * models/shapes.ts, crowd.ts), and built behind the live lobby each held its frames up as long.
 */
async function buildAhead(parts: Part[]): Promise<void> {
  for (const part of parts) {
    await nextTask();
    part.built ??= part.build();
  }
}

/** the other classes' heroes with all they can wear, built before the lobby shows (`buildHeroesAhead`), each taken
 *  by his part's build */
const heroesAhead = new Map<string, Model>();

/** the models of the classes other than the lobby's hero's */
const otherHeroModels = (): string[] =>
  [...new Set(Object.values(CLASSES).map((c) => c.model))].filter((m) => m !== G.player.cls.model);

/**
 * The other heroes built as the lobby's warm-up waits on the GPU, a task each, for a first visit's hall of heroes,
 * whose warm-up takes them once the loading screen has left: built there, each hero's build was a task of 78 to
 * 83 ms that held the lobby's frame up (`npm run stalls -- --scenario boot`, the lobby's frames held up). Their
 * skills' samples are made with the part, as the lobby's warm-up clears the effects it ends with.
 */
async function buildHeroesAhead(): Promise<void> {
  for (const model of otherHeroModels()) {
    await nextTask();
    if (!heroesAhead.has(model)) heroesAhead.set(model, heroAllWorn(model, AWAY));
  }
}

/** The heroes' parts: the hall of heroes' room they're chosen in (`hallPart`), and each other class's hero
 *  (`heroModelParts`). */
const heroParts = (): Part[] => [...(hallWarm ? [] : [hallPart()]), ...heroModelParts()];
/** whether the hall of heroes' room was warmed with the lobby (a first visit's) */
let hallWarm = false;

/** The hall of heroes' look put on the scene, and its undoing: the look it's shown in, which WebGPU keys its
 *  pipelines by (`Swap.look`). */
function hallLook(): () => void {
  const shown = G.arena.hallShown;
  G.arena.showHall(true);
  return () => G.arena.showHall(shown);
}

/** The hall of heroes' room, shown in the lobby's biome's place (world/heroHall.ts). */
function hallPart(): Part {
  return {
    name: 'hall',
    build() {
      const swap = { show: G.arena.hallGroup, hide: G.arena.groupOf(G.arena.biome), look: hallLook };
      return { compile: [swap.show], objects: [], drawn: [], swap, outlined: [], done: () => undefined };
    },
  };
}

/** Each other class's hero, with all he can wear, away from the arena, and his skills' samples. */
function heroModelParts(): Part[] {
  return otherHeroModels().map((model): Part => ({
    name: model,
    build() {
      const hero = heroesAhead.get(model) ?? heroAllWorn(model, AWAY);
      heroesAhead.delete(model);
      const parts = [hero.root, ...skillSamples(model)];
      return { compile: parts, objects: parts, drawn: [], outlined: [], done: () => hero.dispose() };
    },
    ahead: heroesAhead.has(model) ? undefined : () => makeHeadAhead(model),
  }));
}

/** the warm-ups after the lobby shows, one after another: each sets the render target, and the needs' run apart */
let turn: Promise<unknown> = Promise.resolve();
/** `fn` in its turn, the ledger's programs made in it the boot's (`behindTheLobby`), the frames of its time left out
 *  of Auto quality's (`warmingRuns`). */
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = turn.then(async () => {
    behindTheLobby(true);
    warmingRuns(true);
    try {
      return await fn();
    } finally {
      warmingRuns(false);
      behindTheLobby(false);
    }
  });
  turn = run.catch(() => undefined);
  return run;
}

/** How `warmBuilt` goes: behind the lobby a step a frame (`step`), else at once, told how far along (`progress`);
 *  `patient`, stepped but never given up on as cold (a first visit's hall, whose programs no cache holds). */
interface Warming { step?: () => Promise<void>; progress?: (share: number) => void; patient?: boolean }

/**
 * `built` warmed: compiled as the scene lights it, its programs' links waited for, drawn alone, outlined, let go.
 * Behind the lobby (`step`), a step a frame, and given up on, nothing drawn or let go, where a program is cold
 * (`COLD_LINK_MS`).
 */
async function warmBuilt(built: Built[], { step, progress, patient }: Warming = {}): Promise<WarmedUp> {
  const swaps = built.filter((b) => b.swap);
  const took = await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), {
    compile: built.flatMap((b) => b.compile),
    objects: built.flatMap((b) => b.objects),
    drawn: built.flatMap((b) => b.drawn),
    swap: swaps[0]?.swap,
    show: () => { for (const b of built) b.show?.(); },
    hide: () => { for (const b of built) b.hide?.(); },
    before: mapsArrived,
    also: () => compileOutline(built.flatMap((b) => b.outlined), { edge: !step }),
    progress,
    step,
    giveUpMs: step && !patient ? COLD_LINK_MS : undefined,
  });
  if (took.cold) return took;
  // (the other biomes each drawn in place of the lobby's, for their shadows' programs: compiled with the first)
  for (const b of swaps.slice(1)) await warmUp(G.renderer, G.scene, G.camera, sceneTarget(), { compile: [], drawn: [], swap: b.swap, step });
  await step?.();
  // (the outline a held skill draws round a foe: every foe's meshes drawn into its mask; its edge's program is the
  // lobby's, and behind it, a pass over the whole canvas)
  warmOutline(built.flatMap((b) => b.outlined), { edge: !step });
  for (const b of built) b.done();
  return took;
}

/** What of `part`'s build is made ahead (`Part.ahead`), after `next`, where it isn't built yet: a task (or frame) of
 *  its own, its build left the rest. */
async function aheadOf(part: Part, next: () => Promise<void>): Promise<void> {
  if (part.built || !part.ahead) return;
  await next();
  part.ahead();
  part.ahead = undefined;
}

/** `part` warmed on its own behind the lobby, a step a frame (`step`): whether it was cold (kept built for the
 *  warm-up at once). Timed as a user timing measure, `warm <part>`, its detail what its steps took (the stalls' boot
 *  lists them; its build only where it wasn't built ahead). */
async function warmPart(part: Part, step: () => Promise<void>): Promise<boolean> {
  await aheadOf(part, step);
  await step();
  const start = performance.now();
  const ahead = part.built !== undefined;
  const built = part.built ??= part.build();
  const builds = ahead ? {} : { buildMs: performance.now() - start };
  const took = await warmBuilt([built], { step });
  if (!took.cold) part.built = undefined;
  performance.measure(`warm ${part.name}`, { start, duration: performance.now() - start, detail: { ...builds, ...took } });
  return took.cold;
}

/** `parts` built (where they weren't ahead) and warmed at once, `progress` told how far along: timed as `warm the
 *  <need> at once`. A part built a frame while nothing waits for them (WebGPU's fight, warmed as the loading screen
 *  leaves): built in tasks one after another, a foe's 50 to 110 ms each, they held the lobby's frames up. */
async function warmAtOnce(need: Need, parts: Part[], progress: (share: number) => void): Promise<void> {
  const start = performance.now();
  const built: Built[] = [];
  for (const [i, part] of parts.entries()) {
    const next = (): Promise<void> => (isReadying() ? nextTask() : nextFrame());
    await aheadOf(part, next);
    if (!part.built) await next();
    built.push(part.built ?? part.build());
    part.built = undefined;
    progress(BUILT * (i + 1) / parts.length);
  }
  const took = await warmBuilt(built, { progress: (s) => progress(BUILT + (1 - BUILT) * s) });
  performance.measure(`warm the ${need} at once`, { start, duration: performance.now() - start, detail: took });
}

/** when `inSlices` last let the page go */
let sliceFrom = 0;
/** how long a task under a loading bar goes on before the page is let go (ms) */
const BAR_SLICE_MS = 12;

/**
 * Under a loading bar: the page let go once `BAR_SLICE_MS` have passed since it last was. Let go at every step, its
 * uniforms read a program a task and its uploads 2 ms a task, a return's fight held its bar up 1.4 to 1.6 s where in
 * one task it took 0.3 to 0.6 (`npm run stalls -- --scenario boot`, when the loading bar came down); let go through a
 * message (no timeout's 4 ms clamp), its tasks ran back to back and the bar's frames waited behind them, 50 to 160 ms.
 */
async function inSlices(): Promise<void> {
  if (performance.now() - sliceFrom < BAR_SLICE_MS) return;
  await nextTask();
  sliceFrom = performance.now();
}

/** The next frame, or under a loading bar a slice's end (nothing of it is seen: `inSlices`). */
const stepBehind = (): Promise<void> => (isReadying() ? inSlices() : nextFrame());

/** how many parts `warmInTasks` gives the GPU at a time */
const PARTS_AT_ONCE = 4;

/**
 * `parts` warmed as something waits for them, `PARTS_AT_ONCE` at a time, each lot's programs linked before the next
 * lot's are compiled (the link wait letting the page go between programs, `core/shaders.ts` `linked`), `progress` told
 * how far along: timed as `warm the <need> at once`. All compiled in one go, a GPU with little to spare (a laptop's
 * integrated one) had them all to link at once, the page's own frames waiting behind them, and where the browser
 * links a program only as it's first read (no KHR_parallel_shader_compile) every one was linked in one task: from
 * play, a low-end laptop joining a room froze its tab, "Chrome offers to kill the tab, I wait, and it offers second
 * time" (`npm run stalls -- --scenario boot --variants base,noParallelCompile`). A part at a time, each a step a
 * task, the cold Start's bar took 17.4 s where at once it took 4.4.
 */
async function warmInTasks(need: Need, parts: Part[], progress: (share: number) => void, size: number): Promise<void> {
  const start = performance.now();
  for (let from = 0; from < parts.length; from += size) {
    const lot = parts.slice(from, from + size);
    const built: Built[] = [];
    for (const part of lot) {
      await aheadOf(part, nextTask);
      if (!part.built) await nextTask();
      built.push(part.built ?? part.build());
      part.built = undefined;
    }
    const share = (s: number): void => {
      progress((from + s * lot.length) / parts.length);
      if (need === 'heroes') for (const part of lot) heroWarming(part.name, s);
    };
    // (a step a frame where no loading bar covers the page, a first visit's hall of heroes, and a step a task under
    // one: a lot's compile in one task was 30 to 64 ms, a hero chosen in it held the hall's frame up 104 ms, and under
    // the fight's bar each held its frame up as long, a frozen bar)
    await warmBuilt(built, { progress: share, step: stepBehind, patient: true });
    if (need === 'heroes') for (const part of lot) heroWarming(part.name, 1);
  }
  performance.measure(`warm the ${need} at once`, { start, duration: performance.now() - start });
}

/** The longest a frame of the lobby may be held while a part warms behind it (ms): held longer, the rest waits for
 *  what needs it, under its loading bar, as a first visit's does. A phone's return held its lobby 170 to 970 ms a
 *  part, its programs from the cache all the same (each linked in time: the part's own JS and the GPU's process took
 *  it), from play on an S25 Edge "still lagging hard" (15 s at 21 frames a second, its worst 5). */
const HELD_MOST_MS = 120;

/** The longest gap between the page's frames from now until it's stopped (ms), a hidden page's time left out. */
function framesHeld(): { worst: () => number; stop: () => void } {
  let last = 0;
  let worst = 0;
  let on = true;
  const shownAgain = (): void => { last = 0; };
  document.addEventListener('visibilitychange', shownAgain);
  const tick = (now: number): void => {
    if (!on) return;
    if (last && document.visibilityState === 'visible') worst = Math.max(worst, now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const stop = (): void => {
    on = false;
    document.removeEventListener('visibilitychange', shownAgain);
  };
  return { worst: () => worst, stop };
}

/**
 * `need`'s `parts` warmed: a part at a time behind the lobby, a step a frame, where `behind` says so once it's time
 * and while they come from a cache and hold no frame of the lobby long (a part found cold, or a frame held past
 * `HELD_MOST_MS`, leaves the rest for later), the rest at once when something needs them
 * (game/warm.ts `wanted`; what's left of a part then goes on without waiting for frames); then what waited for them
 * goes ahead.
 */
async function warmNeed(need: Need, parts: Part[], behind: () => Promise<boolean>): Promise<void> {
  if (isWarm(need)) return;
  let hurried = false;
  void wanted(need).then(() => { hurried = true; });
  const step = (): Promise<void> => (hurried ? nextTask() : nextFrame());
  let cold = !(await behind());
  let next = 0;
  const held = framesHeld();
  while (next < parts.length && !cold && !hurried) {
    const partCold = await inTurn(() => warmPart(parts[next], step));
    if (!partCold && need === 'heroes') heroWarming(parts[next].name, 1);
    if (!partCold) warming(need, ++next / parts.length);
    cold = partCold || held.worst() > HELD_MOST_MS;
  }
  held.stop();
  if (next < parts.length) {
    await wanted(need);
    const done = next / parts.length;
    const left = parts.slice(next);
    const told = (s: number): void => warming(need, done + (1 - done) * s);
    // (the heroes a hero at a time, each shown in the hall as he's warm)
    const lot = need === 'heroes' ? 1 : PARTS_AT_ONCE;
    await inTurn(() => (WEBGPU ? warmAtOnce(need, left, told) : warmInTasks(need, left, told, lot)));
  }
  // (the hall's heroes built while the bar is still up, a task each: built as it opened, the three held its first
  // frame 290 to 400 ms, trace FD2V-NB48)
  if (need === 'heroes') await buildHallAhead(nextTask);
  warming(need, 1);
  markWarm(need);
}

/**
 * The programs the lobby doesn't use warmed (game/warm.ts): the fight's behind it once the loading screen has `left`
 * (its logo's exit draws over the lobby till then), where this build warmed them here before and the maps were kept
 * (`rememberWarmed`: else, a first visit or a new build's, its programs are new to the GPU's cache), and the other
 * heroes' once something needs them. On WebGPU the fight's are all compiled at once,
 * every visit (under the loading screen, which waits for them up to `FIGHT_UNDER_LOADING` in main.ts: compiled as it
 * left, the lobby held 66 to 108 frames a second for 8 s, where WebGL's starts at the screen's rate): three's async compile makes its pipelines on the GPU's threads and builds its nodes a slice a frame,
 * so the lobby never waits for one, and Chrome's cache never served them on a return (the bar was 2.4 s on every
 * visit). A part at a time there compiled a few at once, and was slower still. Their programs are the boot's (`inTurn`): from the lobby on, one compiled but
 * by a warm-up is counted as compiled late (main.ts `markLoaded`).
 */
export function warmTheRest(left: Promise<void>): { fight: Promise<void>; all: Promise<void> } {
  const behind = async (): Promise<boolean> => {
    await Promise.race([left, wanted('fight')]);
    return !WEBGPU && !mapsMadeAfresh() && warmedBuilds().includes(BUILD);
  };
  const fightWarm = warmNeed('fight', theFight(), behind).then(() => {
    rememberWarmed();
    performance.mark('fight warm');
  });
  // (begun under the loading screen, in its long slices: main.ts waits for it there, as long as `FIGHT_UNDER_LOADING`)
  if (WEBGPU) want('fight');
  if (WEBGPU) void left.then(() => {
    fitSlices(fightWarm);
    // (once it's warm, a compile's slices long while the fight's loading bar is up, nothing played under it)
    onReadying(() => compileSlice(isReadying() ? COMPILE_SLICE.loading : COMPILE_SLICE.playing));
  });
  const heroes = warmNeed('heroes', heroParts(), async () => false);
  return { fight: fightWarm, all: Promise.all([fightWarm, heroes]).then(() => {}) };
}

/** how much shorter the compile's slice gets after a frame that missed the screen's refresh, and how much longer
 *  (ms) after one that didn't */
const SLICE_CUT = 0.7;
const SLICE_GROWTH = 0.25;
/** how late a frame may come before it counts as missed, as a share of the screen's refresh */
const MISSED = 1.25;

/**
 * three's async compile, behind the lobby on WebGPU, worked a slice of the frame's time fitted to what the frames
 * leave until `until`: shorter after a frame that missed the screen's refresh, a little longer after each that
 * didn't, from `COMPILE_SLICE.least` to `playing` (a 144 Hz screen's frame has 6.9 ms, the lobby's own JS about 5 of
 * them; a 60 Hz screen's 16.7), and the loading screen's long slices while the fight's loading bar is up (nothing is
 * played under it). The screen's refresh is the shortest time between frames, let drift up slowly (a window moved
 * to a slower screen).
 */
function fitSlices(until: Promise<void>): void {
  let done = false;
  void until.then(() => { done = true; });
  let last = 0;
  let refresh = Infinity;
  let slice: number = COMPILE_SLICE.playing;
  const fit = (now: number): void => {
    if (done) {
      compileSlice(isReadying() ? COMPILE_SLICE.loading : COMPILE_SLICE.playing);
      return;
    }
    if (last) {
      const gap = now - last;
      refresh = Math.min(refresh * 1.002, gap);
      const missed = gap > refresh * MISSED;
      slice = missed ? Math.max(COMPILE_SLICE.least, slice * SLICE_CUT) : Math.min(COMPILE_SLICE.playing, slice + SLICE_GROWTH);
    }
    last = now;
    compileSlice(isReadying() ? COMPILE_SLICE.loading : slice);
    requestAnimationFrame(fit);
  };
  requestAnimationFrame(fit);
}
