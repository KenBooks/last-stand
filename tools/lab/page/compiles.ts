// `lab compiles`: whether the boot's warm-up compiled what a fight draws (tools/lab). The game compiles every program
// at boot (`game/warmup.ts`, `core/shaders.ts`), and one compiled mid-fight is a hitch of 10 to 30 ms, longer on a
// phone. In each biome the hero stands in the view asked for, and a prop of every kind the biome has (stone, wood,
// glowcap, embers) is broken in turn, its rubble, debris and smoke drawn as they fly and settle. Every program compiled
// meanwhile is a problem, said as the game's performance report says it (`lateCompiles`: what drew it and how its
// program differs from the nearest one compiled before). (#243's phone compiled a rubble program mid-fight: the empty
// pools were hidden after the first of the boot's warm-ups, so the lobby's warm-up in each biome, whose light makes
// programs of its own, drew none of them.) Each round counts the point lights each pass lights its materials with (the
// scene's, and through the eyes the arms', drawn by a camera of their own) against the boot's: a program is compiled
// for a count, and a pass drawn with another compiles all it draws again (#268: a hero built afresh, as a class switch
// builds him, had his light missing from the arms' pass). The first biome's wave is fought again by such a hero.
// In each biome a Cinder Brute and a Barkhide Hulk throw at him from afar, every piece of their throws drawn (the
// chunk, its ring, its burst and pool, the vine and its coils: entities/throws.ts), which no first wave brings.
// `--canary` draws a material of a kind nothing else is before the hero, which must come out as compiled, and puts a
// light in the scene that the count must find.
import { changeHeroLink } from './uiHeroes';
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { ViewMode } from '../../../src/core/renderer';
import type { WeaponStyle } from '../../../src/types';
import type { Prop } from '../../../src/world/destructible';
import { G } from '../../../src/state';
import { armsCamera } from '../../../src/core/renderer';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { breakProp, hurtProp } from '../../../src/world/destructible';
import type { Enemy } from '../../../src/entities/enemy';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { holdFor, pressing, type BoundSkill } from './cast';
import { standIn } from './light';
import { setOffWave } from './spawnWaves';
import { lookOf, placeOf } from './draws';

export interface CompilesOptions {
  biomes: BiomeId[];
  view: ViewMode;
  /** the hero holding his weapons this way, `weapon` the base in hand (as rolled by default) */
  gear?: WeaponStyle;
  weapon?: string;
  canary: boolean;
  /** the class the hero is switched to in the lobby first, as a player picks it there */
  switchTo?: string;
}

/** the most real time a class switch is waited for, ms: the heroes' warm-up behind the lobby, on a cold GPU cache */
const SWITCH_MOST_MS = 60_000;

/** the frames drawn after a prop is worn down (its gauge over it), and after it breaks (the rubble flying, landing
 *  and lying) */
const HURT_FRAMES = 20;
const BREAK_FRAMES = 40;
/** the frames the canary's material is drawn for */
const CANARY_FRAMES = 2;
/** the throwers, how far off the hero each stands (m), and the most frames they're given to throw and their throws
 *  to play out */
const THROWERS = ['brute', 'barkhulk'] as const;
const THROWN_FROM = 12;
const THROWS_MOST = 420;
/** what the throws draw, by their meshes' names (an older tree has none) */
const THROWN_PIECES = ['lava chunk', 'vine', 'vine coils'];
/** the first wave's random numbers, and the most of it fought (s) */
const WAVE_SEED = 1;
const WAVE_MOST = 40;

/** A pass's point lights, counted as three counts them for its programs. */
interface PassLights {
  pass: string;
  count: number;
}

/**
 * The point lights a pass drawn through `camera` lights its materials with, as three counts them: each in a part of
 * the scene that's shown, on a layer the camera sees (whatever the layers of what holds it).
 */
function pointLightsSeen(camera: THREE.Camera): number {
  let count = 0;
  const visit = (object: THREE.Object3D) => {
    if (!object.visible) return;
    if ((object as THREE.PointLight).isPointLight && object.layers.test(camera.layers)) count++;
    for (const child of object.children) visit(child);
  };
  visit(G.scene);
  return count;
}

/** The point lights each pass sees now: the scene's, and through the eyes the arms', where their own camera draws
 *  them. */
function passLights(): PassLights[] {
  const passes = [{ pass: 'the scene', count: pointLightsSeen(G.camera) }];
  const arms = armsCamera();
  if (arms !== G.camera) passes.push({ pass: 'the arms', count: pointLightsSeen(arms) });
  return passes;
}

/** The passes' lights as a line says them. */
function lightsText(passes: PassLights[]): string {
  return passes.map(({ pass, count }) => `${pass} ${count}`).join(', ');
}

/** A problem for each pass of `passes` lit by another count of point lights than the boot's `booted`. */
function lightProblems(where: string, passes: PassLights[], booted: number): string[] {
  return passes.filter(({ count }) => count !== booted).map(({ pass, count }) => `${where}: ${pass}' pass saw `
    + `${count} point lights, the boot ${booted}: every material it draws compiles again for that count`);
}

/** Each draw's pass, as the lines say it. */
function passOf(scene: THREE.Object3D | null): string {
  if (scene === null) return 'the shadow map';
  return scene === G.scene ? 'the scene' : 'a pass after it';
}

/**
 * Watches the renderer's draws from now on for the first draw of each program not compiled before (the game's
 * report can't say what drew a shadow's program: three keeps its shadow materials to itself); returns what stops it,
 * which gives the draws found: what drew each, with its own material, and in which pass.
 */
function watchFirstDraws(): () => string[] {
  const gl = G.renderer;
  const own = gl.renderBufferDirect.bind(gl);
  const known = new Set<unknown>(gl.info.programs ?? []);
  const firsts: string[] = [];
  gl.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    own(camera, scene, geometry, material, object, group);
    const program = (gl.properties.get(material) as { currentProgram?: unknown }).currentProgram;
    if (!program || known.has(program)) return;
    known.add(program);
    const drawn = (object as THREE.Mesh).material;
    const its = Array.isArray(drawn) ? drawn[0] : drawn;
    const ownLook = its && its !== material ? `, its own ${lookOf(its)}` : '';
    firsts.push(`first drawn by ${object.type} in ${placeOf(object)} (${lookOf(material)}${ownLook}) in `
      + `${passOf(scene)}`);
  };
  return () => {
    gl.renderBufferDirect = own;
    return firsts;
  };
}

/** The programs compiled from now on: how many, each as the game's report says it, and the draws that first used
 *  them. */
function compilesFromNow(): () => { count: number; lines: string[] } {
  const compiled = programsCompiledInGame();
  const described = lateCompiles.length;
  const stopWatching = watchFirstDraws();
  return () => {
    const firsts = stopWatching();
    return { count: programsCompiledInGame() - compiled, lines: [...lateCompiles.slice(described), ...firsts] };
  };
}

/** The biome's props of each kind it has, the nearest to the hero first. */
function nearestOfEachKind(): Prop[] {
  const at = G.player.pos;
  const away = (prop: Prop) => Math.min(...prop.parts.map((part) => Math.hypot(part.x - at.x, part.z - at.z)));
  const byKind = new Map<string, Prop>();
  for (const prop of [...G.arena.props].sort((a, b) => away(a) - away(b))) {
    if (!prop.broken && !byKind.has(prop.kind)) byKind.set(prop.kind, prop);
  }
  return [...byKind.values()];
}

/** In `biome`, a prop of every kind broken in turn, each one's frames drawn; its lines and problems. */
async function breakEachKind(lab: Lab, biome: BiomeId, { view, gear, weapon }: Fight): Promise<Report> {
  G.arena.restoreProps();
  // (from before the set-up: its frames are the game's, the view entered and the hero rebuilt among them)
  const since = compilesFromNow();
  await standIn(lab, { biome, view, gear, weapon, facing: 0 });
  const props = nearestOfEachKind();
  for (const prop of props) {
    // (worn down first, as a fight wears it: its gauge shown over it and chips knocked off, then broken)
    hurtProp(prop.parts[0], prop.life / 2);
    await lab.step(HURT_FRAMES);
    breakProp(prop);
    await lab.step(BREAK_FRAMES);
  }
  const { count, lines } = since();
  G.arena.restoreProps();
  const kinds = props.map((prop) => prop.kind).join(', ');
  const text = [`${biome}, the ${view} view: a prop of each kind broken (${kinds}), ${count} programs compiled`,
    ...lines.map((line) => `  ${line}`)];
  const problems = count > 0 ? [`${biome}: ${count} programs compiled as its props broke`] : [];
  if (!props.length) problems.push(`${biome}: no prop to break`);
  return { text: text.join('\n'), problems };
}

/** The live foe nearest the hero, if any. */
function nearestFoe(): Enemy | undefined {
  const at = G.player.pos;
  const live = G.enemies.filter((foe) => foe.alive && foe.spawning <= 0);
  return live.sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at))[0];
}

/** The hero's skills on his bar, in its order. */
function barSkills(): BoundSkill[] {
  return SKILL_KEYS.flatMap((key) => {
    const def = G.player.skillAt(key)?.def;
    return def ? [{ key, def }] : [];
  });
}

/** How a round is played: in the view asked for, the hero's weapons held as asked, and built afresh first or not. */
interface Fight {
  view: ViewMode;
  gear?: WeaponStyle;
  weapon?: string;
  fresh: boolean;
  /** the point lights the boot's passes saw */
  booted: number;
}

/**
 * In `biome`, the run's first wave set off and fought as the game plays it: its foes coming by the gates, the hero
 * (kept whole; built afresh first with `fresh`, as the lobby's class switch builds him) casting each skill on his bar
 * in turn at the nearest one, his energy kept full, until the wave is cleared or `WAVE_MOST` s are up. Its foes die
 * as a fight kills them, which no other check lets happen.
 */
async function fightFirstWave(lab: Lab, biome: BiomeId, fight: Fight): Promise<Report> {
  const { view, gear, weapon, fresh, booted } = fight;
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  G.arena.restoreProps();
  const since = compilesFromNow();
  await setOffWave(lab, { view, gear, weapon, fresh }, { index: 0, seed: WAVE_SEED, number: 1 });
  const hero = G.player;
  const skills = barSkills();
  const frameTime = window.__labClock.frame / 1000;
  const spawned = new Set<Enemy>();
  let turn = 0;
  let held = 0;
  let frames = 0;
  for (; frames < WAVE_MOST / frameTime && G.run?.phase !== 'cleared'; frames++) {
    for (const foe of G.enemies) spawned.add(foe);
    const foe = nearestFoe();
    hero.energy = hero.stats.maxEnergy;
    const skill = skills[turn % skills.length];
    if (!foe || !skill) {
      await lab.step(1);
      continue;
    }
    if (held === 0 && hero.cooldowns.has(skill.def.impl)) {
      turn++;
      await lab.step(1, () => ({ aim: foe.pos }));
      continue;
    }
    const hold = Math.max(1, Math.round(holdFor(skill.def) / frameTime));
    await lab.step(1, () => pressing(skill.key, foe.pos, held < hold));
    held++;
    if (held > hold) {
      held = 0;
      turn++;
    }
  }
  const { count, lines } = since();
  const passes = passLights();
  const killed = [...spawned].filter((foe) => !foe.alive).length;
  const end = G.run?.phase === 'cleared' ? 'cleared' : `not cleared, ${WAVE_MOST} s up`;
  const by = fresh ? ' by a hero built afresh (a class switch\'s)' : '';
  const text = [`${biome}, the ${view} view: the first wave fought${by} for ${(frames * frameTime).toFixed(1)} s `
    + `(${end}), ${spawned.size} foes came, ${killed} killed, ${count} programs compiled; point lights: `
    + `${lightsText(passes)}`, ...lines.map((line) => `  ${line}`)];
  const where = `${biome}${by}`;
  const problems = count > 0 ? [`${where}: ${count} programs compiled as its first wave was fought`] : [];
  problems.push(...lightProblems(where, passes, booted));
  if (!killed) problems.push(`${biome}: the first wave's foes were never killed`);
  return { text: text.join('\n'), problems };
}

/** In `biome`, a Cinder Brute and a Barkhide Hulk throwing at the hero from afar, until each piece of their throws has
 *  been drawn and its effects played out; its lines and problems. */
async function throwsDrawn(lab: Lab, biome: BiomeId, { view, gear, weapon }: Fight): Promise<Report> {
  const since = compilesFromNow();
  await standIn(lab, { biome, view, gear, weapon, facing: 0 });
  const hero = G.player.pos;
  // (towards the arena's middle, side by side: out the other way they stood beyond the wall, and rose inside it 6 m
  // from him, too near to throw)
  const inward = new THREE.Vector3(-hero.x, 0, -hero.z).normalize();
  const aside = new THREE.Vector3(-inward.z, 0, inward.x);
  const throwers = THROWERS.map((kind, i) => {
    const at = hero.clone().addScaledVector(inward, THROWN_FROM).addScaledVector(aside, i ? 2 : -2);
    return { kind, foe: lab.spawnFoe(kind, at), acts: new Set<string>() };
  });
  const drawn = new Set<string>();
  let frames = 0;
  for (; frames < THROWS_MOST; frames++) {
    await lab.step(1);
    for (const object of G.scene.children) if (THROWN_PIECES.includes(object.name)) drawn.add(object.name);
    for (const thrower of throwers) if (thrower.foe.action) thrower.acts.add(thrower.foe.action.name);
  }
  const acted = throwers.map(({ kind, foe, acts }) => `${kind} ${foe.alive ? 'alive' : 'dead'} `
    + `${foe.pos.distanceTo(G.player.pos).toFixed(1)} m off: ${[...acts].join(', ') || 'no action'}`);
  const { count, lines } = since();
  const missing = THROWN_PIECES.filter((piece) => !drawn.has(piece));
  const text = [`${biome}, the ${view} view: a Brute and a Hulk threw at the hero for ${frames} frames (drew `
    + `${[...drawn].join(', ') || 'nothing of their throws'}), ${count} programs compiled`,
  `  ${acted.join('; ')}`, ...lines.map((line) => `  ${line}`)];
  const problems = count > 0 ? [`${biome}: ${count} programs compiled as the foes threw`] : [];
  if (missing.length) problems.push(`${biome}: the throws never drew ${missing.join(', ')}`);
  return { text: text.join('\n'), problems };
}

/** The lights' canary: a point light put in the scene (dark) and taken out again before a frame is drawn, a problem
 *  unless the count finds the scene's pass lit by one more than the boot's. */
function lightsCanary(booted: number): Report {
  const light = new THREE.PointLight(0xffffff, 0);
  G.scene.add(light);
  const passes = passLights();
  G.scene.remove(light);
  light.dispose();
  const caught = lightProblems('the canary', passes, booted).length > 0;
  const text = `the canary: a point light put in the scene, ${lightsText(passes)} (${caught ? 'caught' : 'missed'})`;
  return { text, problems: caught ? [] : ['the canary\'s point light went uncounted'] };
}

/** The canary: a box of a material nothing else draws (sheen and iridescence) before the hero, a problem unless its
 *  program comes out as compiled. */
async function canaryRound(lab: Lab): Promise<Report> {
  const material = new THREE.MeshPhysicalMaterial({ sheen: 1, iridescence: 1, color: 0xff00ff });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  box.position.copy(G.player.pos).addScaledVector(way, 2).setY(0.5);
  G.scene.add(box);
  const since = compilesFromNow();
  try {
    await lab.step(CANARY_FRAMES);
  } finally {
    G.scene.remove(box);
    box.geometry.dispose();
    material.dispose();
  }
  const { count } = since();
  const text = `the canary: a material of its own drawn, ${count} programs compiled`;
  return { text, problems: count > 0 ? [] : ['the canary\'s material of its own came out as compiling nothing'] };
}

/** Frames until `done`, drawn as the game draws them; an error saying `what` never came if it took longer than
 *  `SWITCH_MOST_MS` by the browser's clock. */
async function stepUntil(lab: Lab, done: () => boolean, what: string): Promise<void> {
  const start = window.__labClock.realNow();
  while (!done()) {
    if (window.__labClock.realNow() - start > SWITCH_MOST_MS) {
      throw new Error(`lab: compiles: ${what} never came in ${SWITCH_MOST_MS / 1000} s`);
    }
    await lab.step(1);
  }
}

/** frames the hero selection screen is shown on each hero before the next (each one's showcase cast meanwhile) */
const HALL_FRAMES = 150;

/**
 * The hero switched to `id` as a player picks a class: the lobby's Change hero clicked with the mouse (waited for as
 * the lobby waits for the heroes' warm-up, `changeHero` in src/ui/menus.ts), every hero shown on the hero selection
 * screen in turn, each casting his showcase, and `id`'s chosen there; every frame drawn meanwhile. Its line, or an
 * error where it never came. A tree from before the screen picks the class by its button in the lobby.
 */
async function switchClass(lab: Lab, id: string): Promise<Report> {
  if (G.player.cls.id === id) throw new Error(`lab: compiles: the hero is a ${id} already (--class picks the boot's)`);
  const from = G.player.cls.id;
  const start = window.__labClock.realNow();
  const change = await changeHeroLink(lab);
  let hall: { count: number; lines: string[] } | null = null;
  if (change) {
    await lab.clickOn(change);
    const screen = document.getElementById('heroes')!;
    await stepUntil(lab, () => !screen.classList.contains('hidden'), 'the hero selection screen');
    // (its heroes warm by then: anything compiled from here is the screen's own, late)
    const since = compilesFromNow();
    for (const name of screen.querySelectorAll<HTMLElement>('.hs-tabs button')) {
      await lab.clickOn(name);
      await lab.step(HALL_FRAMES);
    }
    // (his name clicked brings him into focus, and clicked again with him there chooses him, as a player does: the
    // label on him is placed by the frames, and clicked with none run it still stood where the last hero had)
    const chosen = screen.querySelector<HTMLElement>(`.hs-tabs button[data-c="${id}"]`)!;
    await lab.clickOn(chosen);
    await lab.step(HALL_FRAMES);
    await lab.clickOn(chosen);
    hall = since();
  } else {
    const button = document.querySelector<HTMLElement>(`#opt-class button[data-c="${id}"]`);
    if (!button) throw new Error(`lab: compiles: the class card has no button for ${id}`);
    await lab.clickOn(button);
  }
  await stepUntil(lab, () => G.player.cls.id === id, `the switch to ${id}`);
  const waited = (window.__labClock.realNow() - start) / 1000;
  const how = change ? 'on the hero selection screen, every hero shown' : 'in the lobby';
  const text = [`switched from the ${from} to the ${id} ${how} (${waited.toFixed(1)} s)`];
  if (hall) {
    text.push(`  the hero selection screen: ${hall.count} programs compiled`);
    text.push(...hall.lines.map((line) => `    ${line}`));
  }
  const problems = hall?.count ? [`the hero selection screen compiled ${hall.count} programs`] : [];
  return { text: text.join('\n'), problems };
}

export async function compiles(lab: Lab, options: CompilesOptions): Promise<Report> {
  const drawing = lab.drawing;
  // (drawn: a program compiles as it's first drawn)
  lab.drawing = true;
  const reports: Report[] = [];
  if (options.switchTo) reports.push(await switchClass(lab, options.switchTo));
  // (the lights the boot's warm-ups were drawn with, its programs compiled for: the lobby's, as the page booted)
  const booted = pointLightsSeen(G.camera);
  const { view, gear, weapon } = options;
  const round = { view, gear, weapon, fresh: false, booted };
  try {
    for (const biome of options.biomes) {
      reports.push(await breakEachKind(lab, biome, round));
      reports.push(await fightFirstWave(lab, biome, round));
      reports.push(await throwsDrawn(lab, biome, round));
    }
    reports.push(await fightFirstWave(lab, options.biomes[0], { ...round, fresh: true }));
    if (options.canary) {
      reports.push(await canaryRound(lab));
      reports.push(lightsCanary(booted));
    }
  } finally {
    lab.drawing = drawing;
  }
  return {
    text: reports.map((report) => report.text).join('\n'),
    problems: reports.flatMap((report) => report.problems),
  };
}
