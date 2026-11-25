// A boss readied at its wave (src/game/bossReady.ts; from the owner: "if its not boss wave, why load the boss info"):
// booted cold, no boss's code is loaded and none is warm. A run in the Crypt (its portal used in the village, Enter
// clicked on its card) cleared at wave 4,
// Continue shows the fight's bar readying the Colossus, then the wave begins with him loaded and warm, and he rises
// with no program compiled from the wave's start until after he rises; the same from wave 14 into the Ossuary Twins
// at 15 (two bosses in one chunk). Every other need is warmed first (the lab's own boot would ready the bosses too), so
// no warm-up behind the run compiles meanwhile.
// A canary: the Twins loaded and one spawned in wave 14 without their warm-up, which must be found loaded before
// their wave, and a material of its own drawn as wave 15 begins, which must be found compiled.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import type { EnemyId } from '../../../src/data/enemies';
import { updateRun } from '../../../src/game/run';
import { foeWarm } from '../../../src/game/warmup';
import { hurry, isAllWarm, isReadying, readyingLabel, readyingShare } from '../../../src/game/warm';
import { goUse, villageObject } from '../../../src/game/village';
import { groundHeight } from '../../../src/world/ground';
import { clearEnemies } from '../../../src/entities/enemy';
import { spawnEnemy } from '../../../src/entities/spawner';
import { foeLoaded, loadFoe } from '../../../src/entities/bosses';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';

/** `--canary`: the Twins loaded and spawned unwarmed in wave 14, which must be found. */
export interface BossWaveOptions {
  canary: boolean;
}

/** Each boss wave met: the wave before it, the wave, its bosses and what the bar says. */
const WAVES: { before: number; wave: number; bosses: EnemyId[]; label: string }[] = [
  { before: 4, wave: 5, bosses: ['colossus'], label: 'Readying Colossus' },
  // (an encounter: the Cantor and its two guards, both of its kind risen)
  { before: 9, wave: 10, bosses: ['cantor', 'bellwarden', 'bellwarden'], label: 'Readying Ossuary Cantor' },
  { before: 14, wave: 15, bosses: ['twinslab', 'twinreliquary'], label: 'Readying Ossuary Twins' },
];

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

/** The bosses of `bosses` standing in the arena. */
const risen = (bosses: EnemyId[]): number => G.enemies.filter((foe) => bosses.includes(foe.type) && foe.alive).length;

/** frames the canary's plants are drawn for */
const CANARY_FRAMES = 30;

/** The canary's first plant: the Twins loaded and one spawned now, never warmed, found loaded before its wave. */
async function spawnUnwarmed(lab: Lab): Promise<void> {
  await loadFoe('twinslab');
  spawnEnemy('twinslab', new lab.THREE.Vector3(0, 0, -20), { wave: G.run!.wave });
  await lab.step(CANARY_FRAMES);
}

/**
 * The canary's second: a box of a material nothing else draws (a program key of its own) before the hero, as an unwarmed
 * boss's own would be, found compiled (a crowd's body may share every program with the foes warmed already, so the box
 * stands for a boss's own material: the Twins spawned unwarmed compiled nothing new).
 */
async function drawUnwarmed(lab: Lab): Promise<void> {
  const material = new lab.THREE.MeshBasicMaterial({ color: 0xff00ff });
  // (a program of its own, whatever the game compiled before: a sheen and iridescence of the hero's gear shared one)
  material.customProgramCacheKey = () => 'bosswave-canary';
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

/** The Crypt's portal used where the hero stands for it: its card shown, the Crypt the run's battleground. */
async function useCryptPortal(lab: Lab): Promise<void> {
  const portal = villageObject('crypt');
  if (!portal) throw new Error('lab: bosswave: the village has no portal to the Crypt');
  const [x, z] = portal.stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(CARD_FRAMES);
  goUse(portal);
  await stepUntil(lab, () => G.arena.biome === 'crypt', 'the Crypt as the portal\'s battleground');
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
  const everyBoss = WAVES.flatMap((w) => w.bosses);
  const loadedAtBoot = everyBoss.filter(foeLoaded);
  if (loadedAtBoot.length) problems.push(`at boot ${loadedAtBoot.join(', ')} already loaded`);
  lines.push(`at boot: ${loadedAtBoot.length ? loadedAtBoot.join(', ') : 'no boss'} loaded`);

  // (every need warmed but the bosses, so no warm-up compiles behind the run: `__dev.hurry` readies the bosses too)
  hurry();
  await stepUntil(lab, isAllWarm, 'every need warm');
  await useCryptPortal(lab);
  await lab.clickOn(element('#btn-start'));
  await stepUntil(lab, () => G.mode === 'run' && G.run !== null, 'the run');

  /** what the canary was found by: loaded before its wave, compiled late */
  const caughtBy = new Set<string>();
  for (const { before, wave, bosses, label } of WAVES) {
    const canaryHere = options.canary && wave === 15;
    if (canaryHere) await spawnUnwarmed(lab);
    const early = bosses.filter(foeLoaded);
    if (early.length) {
      if (canaryHere) caughtBy.add('loaded early');
      else problems.push(`at wave ${before} ${early.join(', ')} already loaded, before ${wave}`);
    }
    await clearAt(lab, before);
    await lab.clickOn(element('#decision .cont'));
    let said = '';
    await stepUntil(lab, () => {
      said ||= barSays();
      return G.run!.wave === wave;
    }, `wave ${wave} after Continue`);
    if (!said.includes(label)) problems.push(`Continue into wave ${wave}: the bar said "${said}", not "${label}"`);
    const cold = bosses.filter((id) => !foeLoaded(id) || !foeWarm(id));
    if (cold.length) problems.push(`wave ${wave} began with ${cold.join(', ')} not loaded and warm`);
    // (every program from here counts: the boss's warm-up is done, and no other runs)
    const compiledBefore = programsCompiledInGame();
    const describedBefore = lateCompiles.length;
    if (canaryHere) await drawUnwarmed(lab);
    await stepUntilInGame(lab, () => risen(bosses) === bosses.length, `wave ${wave}'s ${bosses.join(' and ')}`);
    await lab.step(60);
    const compiled = programsCompiledInGame() - compiledBefore;
    if (compiled) {
      const described = lateCompiles.slice(describedBefore, describedBefore + 3).join('; ');
      if (canaryHere) caughtBy.add('compiled late');
      else problems.push(`wave ${wave}: ${compiled} programs compiled as it began${described ? `: ${described}` : ''}`);
    }
    lines.push(`wave ${before} -> ${wave}: the bar said "${said}", ${bosses.join(' and ')} rose, `
      + `${compiled} programs compiled meanwhile`);
  }
  if (options.canary) {
    const missed = ['loaded early', 'compiled late'].filter((check) => !caughtBy.has(check));
    if (missed.length) problems.push(`canary: its plants were not found ${missed.join(' or ')}`);
    lines.push(`canary (the Twins spawned unwarmed in wave 14, a material of its own in 15): found `
      + `${[...caughtBy].join(' and ') || 'by nothing'}`);
  }
  return { text: lines.join('\n'), problems };
}
