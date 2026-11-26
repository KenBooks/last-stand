// A boss readied at its wave (src/game/bossReady.ts; from the owner: "if its not boss wave, why load the boss info"):
// booted cold, no boss's code is loaded and none is warm. A run in the Crypt (its portal used in the village, Enter
// clicked on its card) cleared at wave 4,
// Continue shows the readying bar, then the boss rises warm. The Thornwood checks the same path for its own ladder.
// The canary loads the last selected boss early and draws a new pipeline after the wave begins.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import type { EnemyId } from '../../../src/data/enemies';
import type { BiomeId } from '../../../src/data/biomes';
import { updateRun } from '../../../src/game/run';
import { foeWarm } from '../../../src/game/warmup';
import { hurry, isAllWarm, isReadying, readyingLabel, readyingShare } from '../../../src/game/warm';
import { goUse, villageObject } from '../../../src/game/village';
import { groundHeight } from '../../../src/world/ground';
import { clearEnemies } from '../../../src/entities/enemy';
import { foeLoaded, loadFoe } from '../../../src/entities/bosses';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { stageCamera } from '../../../src/core/renderer';

/** The battleground, an optional single wave, and the early-load and late-pipeline canaries. */
export interface BossWaveOptions {
  biome: BiomeId;
  wave?: number;
  canary: boolean;
}

interface Encounter {
  wave: number;
  bosses: EnemyId[];
  label: string;
  /** Other models that must be ready at entry but do not rise with the encounter. */
  brought?: EnemyId[];
}

/** Expected encounters and their readying text, independent of the game's boss selection. */
const WAVES: Record<BiomeId, Encounter[]> = {
  crypt: [
    { wave: 5, bosses: ['colossus'], label: 'Readying Colossus' },
    { wave: 10, bosses: ['cantor', 'bellwarden', 'bellwarden'], label: 'Readying Ossuary Cantor' },
    { wave: 15, bosses: ['twinslab', 'twinreliquary'], label: 'Readying Ossuary Twins' },
  ],
  forest: [
    { wave: 5, bosses: ['thornheart'], label: 'Readying Thornheart' },
    { wave: 10, bosses: ['rootmother'], label: 'Readying Rootmother', brought: ['seedpod', 'bigpod'] },
    { wave: 15, bosses: ['stag'], label: 'Readying Stag of Ash' },
  ],
};

/** how long a warm-up, a readying or a wave's countdown may take, each, by the browser's clock (ms): a warm-up's
 *  links are waited for in real time, which the lab's frames, run as fast as the page can, don't pass */
const PATIENCE_MS = 60_000;
/** how long the game's own clock may run before a boss rises (s): he comes as the wave's first group would reach the
 *  hero, give or take `bossJitter` (`bossAt` in src/game/run.ts). Waited for by the browser's clock, a PC run slow by
 *  other work ran out of real time first: "wave 15's twinslab and twinreliquary never came in 60 s" with nothing
 *  readying, on a shared PC and a lent one with 8 sessions at once, and passed run alone */
const RISE_PATIENCE_S = 120;
/** the most the browser's clock may run while the game's waits for a boss (ms), so a page that stalls still ends */
const RISE_MOST_MS = 600_000;
/** frames for the hero to settle at the portal, and for its card to show once it's used */
const CARD_FRAMES = 30;

const element = (selector: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`lab: bosswave: the page has no ${selector}`);
  return found;
};

/** The run put at wave `wave` and fought to its end at once: the choice to bank or go on shown. */
async function clearAt(lab: Lab, wave: number): Promise<void> {
  const run = G.run!;
  clearEnemies();
  run.wave = wave;
  run.phase = 'fighting';
  run.queue = [];
  run.boss = null;
  run.pending = 0;
  updateRun(0.1);
  if (String(run.phase) !== 'cleared') throw new Error(`lab: bosswave: wave ${wave} never cleared`);
  await lab.step(40);
}

/** Frames until `done`, drawn as the game draws them, the browser let go to a frame of its own after each (a warm-up
 *  waits for tasks and links in its time, and `lab.step` alone never yields to them); an error saying `what` never
 *  came past `PATIENCE_MS`. */
async function stepUntil(lab: Lab, done: () => boolean, what: string): Promise<void> {
  const start = window.__labClock.realNow();
  while (!done()) {
    if (window.__labClock.realNow() - start > PATIENCE_MS) {
      throw new Error(`lab: bosswave: ${what} never came in ${PATIENCE_MS / 1000} s (${readyingNow()})`);
    }
    await lab.step(1);
    await window.__labClock.realFrame();
  }
}

/** Frames until `done`, as `stepUntil`, for what the game's own clock brings: an error saying `what` never came past
 *  `RISE_PATIENCE_S` of the game's time (or `RISE_MOST_MS` of the browser's), with the run as it stands. */
async function stepUntilInGame(lab: Lab, done: () => boolean, what: string): Promise<void> {
  const start = G.time;
  const realStart = window.__labClock.realNow();
  while (!done()) {
    const ran = G.time - start;
    if (ran > RISE_PATIENCE_S || window.__labClock.realNow() - realStart > RISE_MOST_MS) {
      throw new Error(`lab: bosswave: ${what} never came in ${Math.round(ran)} s of the game's time (${runNow()})`);
    }
    await lab.step(1);
    await window.__labClock.realFrame();
  }
}

/** The run as it stands, for an error: its phase, the boss's time to come, whether the hero stands. */
function runNow(): string {
  const run = G.run;
  if (!run) return `no run; ${readyingNow()}`;
  const boss = run.boss ? `the boss in ${run.bossT.toFixed(1)} s` : 'no boss to come';
  const hero = G.player.alive ? 'the hero standing' : 'the hero down';
  return `wave ${run.wave} ${run.phase}, ${boss}, ${run.dealt} foes come, ${hero}; ${readyingNow()}`;
}

/** the page's errors and rejections heard since the measure began, for a wait's error: a warm-up that threw
 *  waits for ever */
const heard: string[] = [];

/** The page's errors and unhandled rejections kept in `heard` from now on. */
function hearErrors(): void {
  window.addEventListener('error', (event) => heard.push(String(event.error ?? event.message)));
  window.addEventListener('unhandledrejection', (event) => heard.push(String(event.reason)));
}

/** What's being readied, for an error: the bar's label and share, or nothing. */
const readyingNow = (): string => {
  const errors = heard.length ? `; the page's errors: ${heard.slice(0, 3).join('; ')}` : '';
  if (!isReadying()) return `nothing readying${errors}`;
  return `readying "${readyingLabel()}" at ${Math.round(readyingShare() * 100)}%${errors}`;
};

/** What the bar says now, or nothing when it's down. */
function barSays(): string {
  const bar = document.getElementById('readying');
  if (!bar || bar.classList.contains('hidden') || getComputedStyle(bar).display === 'none') return '';
  return bar.textContent?.trim() ?? '';
}

/** The bosses and their guards that have finished rising in the arena. */
const standing = () => G.enemies.filter((foe) => foe.boss && foe.alive && foe.spawning <= 0);

/** Draw each risen boss in frame so a boss outside the player's initial view cannot pass untested. */
async function drawEncounter(lab: Lab, bosses: ReturnType<typeof standing>): Promise<void> {
  try {
    for (const foe of bosses) {
      const look = foe.obj.position.clone().add(new THREE.Vector3(0, foe.height * 0.45, 0));
      const pos = look.clone().add(new THREE.Vector3(foe.height, foe.height, foe.height));
      stageCamera({ pos, look, fov: 45 }, true);
      await lab.step(2);
    }
  } finally {
    stageCamera(null, true);
  }
}

/** frames the canary's plants are drawn for */
const CANARY_FRAMES = 30;

/**
 * The canary's second: a box of a material nothing else draws (a program key of its own) before the hero, as an unwarmed
 * boss's own would be, found compiled (a crowd's body may share every program with the foes warmed already, so the box
 * stands for a boss's own material: the Twins spawned unwarmed compiled nothing new).
 */
async function drawUnwarmed(lab: Lab): Promise<void> {
  const material = new lab.THREE.MeshBasicMaterial({
    color: 0xff00ff, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: true,
  });
  const box = new lab.THREE.Mesh(new lab.THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  const way = new lab.THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  box.position.copy(G.player.pos).addScaledVector(way, 2).setY(0.5);
  G.scene.add(box);
  try {
    await lab.step(CANARY_FRAMES);
  } finally {
    G.scene.remove(box);
    box.geometry.dispose();
    material.dispose();
  }
}

/** The chosen portal used where the hero stands for it, its run card shown. */
async function usePortal(lab: Lab, biome: BiomeId): Promise<void> {
  const portal = villageObject(biome);
  if (!portal) throw new Error(`lab: bosswave: the village has no portal to ${biome}`);
  const [x, z] = portal.stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(CARD_FRAMES);
  goUse(portal);
  await stepUntil(lab, () => G.arena.biome === biome, `${biome} as the portal's battleground`);
  await lab.step(CARD_FRAMES);
}

/** Bosses readied at their wave: the bar at Continue, and no program compiled late as they rise; every frame drawn
 *  (the lab skips its draws by default, and a program is compiled only as it's drawn). */
export async function bossWave(lab: Lab, options: BossWaveOptions): Promise<Report> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    return await readiedAtTheirWave(lab, options);
  } finally {
    lab.drawing = drawing;
  }
}

/** `bossWave`'s measure, its frames drawn. */
async function readiedAtTheirWave(lab: Lab, options: BossWaveOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [];
  if (G.mode !== 'menu') throw new Error('lab: bosswave: the fresh page must begin in the lobby');

  hearErrors();
  const encounters = WAVES[options.biome];
  const everyBoss = [...new Set(encounters.flatMap(({ bosses, brought = [] }) => [...bosses, ...brought]))];
  const loadedAtBoot = everyBoss.filter(foeLoaded);
  if (loadedAtBoot.length) problems.push(`at boot ${loadedAtBoot.join(', ')} already loaded`);
  lines.push(`at boot: ${loadedAtBoot.length ? loadedAtBoot.join(', ') : 'no boss'} loaded`);

  // (every need warmed but the bosses, so no warm-up compiles behind the run: `__dev.hurry` readies the bosses too)
  hurry();
  await stepUntil(lab, isAllWarm, 'every need warm');
  await usePortal(lab, options.biome);
  const start = element('#btn-start');
  if (!start.checkVisibility()) throw new Error(`lab: bosswave: the ${options.biome} portal never offered entry`);
  await lab.clickOn(start);
  await stepUntil(lab, () => G.mode === 'run' && G.run !== null, 'the run');

  /** what the canary was found by: loaded before its wave, compiled late */
  const caughtBy = new Set<string>();
  const selected = encounters.filter(({ wave }) => options.wave === undefined || options.wave === wave);
  const last = selected.at(-1);
  for (const encounter of selected) {
    const { wave, bosses, brought = [], label } = encounter;
    const before = wave - 1;
    const needed = [...new Set([...bosses, ...brought])];
    const canaryHere = options.canary && encounter === last;
    await clearAt(lab, before);
    if (canaryHere) await loadFoe(bosses[0]);
    const early = needed.filter(foeLoaded);
    if (early.length) {
      if (canaryHere) caughtBy.add('loaded early');
      else problems.push(`at wave ${before} ${early.join(', ')} already loaded, before ${wave}`);
    }
    await lab.clickOn(element('#decision .cont'));
    let said = '';
    await stepUntil(lab, () => {
      said ||= barSays();
      return G.run!.wave === wave;
    }, `wave ${wave} after Continue`);
    if (!said.includes(label)) problems.push(`Continue into wave ${wave}: the bar said "${said}", not "${label}"`);
    const cold = needed.filter((id) => !foeLoaded(id) || !foeWarm(id));
    if (cold.length) problems.push(`wave ${wave} began with ${cold.join(', ')} not loaded and warm`);
    // (every program from here counts: the boss's warm-up is done, and no other runs)
    let compiledBefore = programsCompiledInGame();
    if (canaryHere) {
      await drawUnwarmed(lab);
      const afterPlant = programsCompiledInGame();
      if (afterPlant > compiledBefore) caughtBy.add('compiled late');
      compiledBefore = afterPlant;
    }
    const describedBefore = lateCompiles.length;
    await stepUntilInGame(lab, () => standing().length >= bosses.length, `wave ${wave}'s boss encounter`);
    await lab.step(60);
    const risen = standing();
    const actual = risen.map((foe) => foe.type).sort();
    if (actual.join() !== [...bosses].sort().join()) {
      problems.push(`wave ${wave}: expected ${bosses.join(', ')} but saw ${actual.join(', ')}`);
    }
    await drawEncounter(lab, risen);
    const compiled = programsCompiledInGame() - compiledBefore;
    if (compiled) {
      const described = lateCompiles.slice(describedBefore, describedBefore + 3).join('; ');
      problems.push(`wave ${wave}: ${compiled} programs compiled as it began${described ? `: ${described}` : ''}`);
    }
    lines.push(`wave ${before} -> ${wave}: the bar said "${said}", ${actual.join(' and ')} rose, `
      + `${compiled} programs compiled meanwhile`);
  }
  if (options.canary && last) {
    const missed = ['loaded early', 'compiled late'].filter((check) => !caughtBy.has(check));
    if (missed.length) problems.push(`canary: its plants were not found ${missed.join(' or ')}`);
    lines.push(`canary (${last.bosses[0]} loaded early, a new pipeline after Continue): found `
      + `${[...caughtBy].join(' and ') || 'by nothing'}`);
  }
  return { text: lines.join('\n'), problems };
}
