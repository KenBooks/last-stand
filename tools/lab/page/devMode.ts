// Developer controls through their real panel: opened by its DEV tab, flight, frozen starts, training, refills and reset.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { hurtPlayer } from '../../../src/combat/damage';
import { cameraYaw, overFrame, viewMode, viewSettled } from '../../../src/core/renderer';
import { HIDDEN_LAYER } from '../../../src/core/layers';
import { cheats, time } from '../../../src/dev/index';
import { panelProfile, refreshPanel, togglePanel } from '../../../src/dev/panel';
import { freeCamOn, freeCamSpeed } from '../../../src/dev/freeCam';
import { markedShown, type Mark } from '../../../src/dev/marked';
import { materialsOf } from '../../../src/perf/sceneParts';
import { touchMode } from './uiTouch';
import { showPause, pauseTab } from '../../../src/ui/menus';
import { perfHudStats, perfHudSize } from '../../../src/ui/perfHud';
import { input, pointerLocked } from '../../../src/core/input';
import { role } from '../../../src/net/role';
import { foesAsked, foesTold } from '../../../src/net/sync';
import { BIOMES, BIOME_IDS, bossesOf, type BiomeId } from '../../../src/data/biomes';
import { updateRun } from '../../../src/game/run';
import { middleOf, realWait, type Lab, type Pictured, type Report } from './lab';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { RUST } from '../../../src/engine';

const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`dev: missing ${selector}`);
  return found;
};

/** each marked checkbox's mark and its part's key */
const MARKED_PARTS: [Mark, string][] = [['tree', 'the trees'], ['leaves', 'the leaves'], ['grass', 'the grass']];

/** Everything in the scene bearing `mark`, as the switch finds it (`src/dev/marked.ts`). */
function bearing(mark: Mark): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverse((part) => {
    if (bears(part, mark)) found.push(part);
  });
  return found;
}

/** Whether `part` bears `mark`: leaves by their material, the rest by their own. */
function bears(part: THREE.Object3D, mark: Mark): boolean {
  if (mark !== 'leaves') return Boolean(part.userData[mark]);
  const mesh = part as THREE.Mesh;
  return Boolean(mesh.isMesh) && materialsOf(mesh).some((material) => material.userData.leaves);
}

/** the frames drawn between two readings of the scene's triangles, and the most readings before it's held steady:
 *  a cold boot's lobby still adds what its warm-ups bring, and the first click read more triangles without the
 *  trees than with them */
const SETTLE_FRAMES = 6;
const SETTLE_READINGS = 30;
/** the browser's own time let pass between two readings (ms) */
const SETTLE_WAIT_MS = 100;

/** Frames drawn until the scene's triangles read the same twice running, `SETTLE_FRAMES` and `SETTLE_WAIT_MS` of the
 *  browser's time apart (or it gives up, `SETTLE_READINGS`). */
async function steadyTriangles(lab: Lab): Promise<void> {
  let last = -1;
  for (let reading = 0; reading < SETTLE_READINGS; reading++) {
    const drawing = lab.drawing;
    lab.drawing = true;
    try {
      await lab.step(SETTLE_FRAMES);
    } finally {
      lab.drawing = drawing;
    }
    const now = frameTriangles();
    if (now === last) return;
    last = now;
    // (the browser's time let pass: `lab.step` never yields, and what a warm-up brings comes in it)
    await realWait(SETTLE_WAIT_MS);
  }
}

/** The engine's triangles of the frame it drew last, its scene's and its shadow maps' (the lobby's camera may see no
 *  tree, only their shadows), read once the frame holds steady (a click draws the still shadows again); its draws
 *  not counted (the trees are batched, and a batch with one tree left in it is still a draw: 238 with them and 238
 *  without). */
function frameTriangles(): number {
  const stats = RUST.bridge?.stats;
  if (!stats) throw new Error('lab: dev: the engine is not drawing');
  return stats.triangles + stats.shadowTriangles;
}

export async function devMode(lab: Lab, options: { canary: boolean }): Promise<Report> {
  const problems: string[] = [], lines: string[] = [], moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) problems.push(message); };
  const running = (): boolean => G.mode === 'run';
  if (G.mode !== 'menu') throw new Error('dev: must boot in the lobby');
  for (let i = 0; !document.getElementById('dev-panel') && i < 100; i++) await realWait(20);
  element('#dev-panel');
  const click = async (selector: string): Promise<void> => {
    const control = element(selector);
    control.scrollIntoView({ block: 'nearest' });
    await lab.clickOn(control);
    await lab.step(2);
    refreshPanel();
  };
  const action = (name: string): Promise<void> => click(`#dev-panel [data-act=${name}]`);
  const started = async (): Promise<void> => {
    for (let i = 0; G.mode !== 'run' && i < 1000; i++) { await lab.step(1); await realWait(10); }
    if (G.mode !== 'run') throw new Error('dev: wave never started after warming');
  };
  const chooseBiome = async (biome: BiomeId): Promise<void> => {
    const select = element<HTMLSelectElement>('[data-in=biome]');
    select.value = biome; select.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; G.arena.biome !== biome && i < 1000; i++) { await lab.step(1); await realWait(10); }
    check(G.arena.biome === biome, 'biome selection did not apply immediately');
  };
  // (opened by its DEV tab at the screen's edge: it floats over the village, as it does over a run)
  await click('#dev-tab');
  refreshPanel();
  check(!element('#dev-panel').classList.contains('hidden'), 'the DEV tab did not open the panel');
  check(element('#dev-panel').parentElement === document.body, 'the panel did not float over the page');

  await lab.showOn({ width: 1920, height: 1080, ratio: 1 });
  check(!document.querySelector('#dev-panel [data-act=close]'), 'redundant panel close button remained');

  const parts = [...document.querySelectorAll<HTMLInputElement>('#dev-panel [data-part]')];
  check(parts.length >= 7 && parts.every((part) => part.checked), 'frame parts did not start included');
  check(element('[data-act=parts]').textContent === 'Uncheck all', 'all-checked button did not offer Uncheck all');
  await action('parts');
  check(parts.every((part) => !part.checked), 'Uncheck all did not remove every part');
  await action('parts');
  check(parts.every((part) => part.checked), 'Check all did not restore every part');
  await click('#dev-panel [data-part="the hero"]');
  check(!G.player.obj.visible, 'unchecking Hero did not hide it');
  await action('parts');
  check(G.player.obj.visible && parts.every((part) => part.checked), 'Check all did not restore the frame');
  const draw = overFrame.draw;
  await action('labels');
  check(overFrame.draw !== draw, 'World labels did nothing outside flight');
  await action('labels');
  check(overFrame.draw === draw, 'World labels did not restore their draw');
  // Trees, Leaves and Grass: out of what's drawn everywhere at once, held through a biome change, no program made.
  const programs = (): number => PIPELINES.made;
  const markedCosts: string[] = [];
  // (the sun's shadow drawn every frame while it reads: kept between its turns, the frame after a click could read the
  // map from before it, and the lobby's leaves, seen in their shadow alone, read the same triangles both ways)
  const shadowTurns = RUST.tune.shadowTurns;
  RUST.tune.shadowTurns = 0;
  for (const [mark, key] of MARKED_PARTS) {
    const marked = bearing(mark);
    const box = `#dev-panel [data-part="${key}"]`;
    /** what bears the mark out of what's drawn, and the checkbox saying so */
    const allOut = (): boolean => marked.every((part) => part.layers.mask === 1 << HIDDEN_LAYER);
    /** the screen pictured as `label`, and the engine's triangles of its scene, settled a few frames after a click
     *  (three's draw hooks, which this counted draws by, never run under the engine: it read 0 draws both ways) */
    const drawsOf = async (label: string): Promise<number> => {
      await steadyTriangles(lab);
      moments.push(await lab.screen(label));
      return frameTriangles();
    };
    /** the checkbox clicked in the place shown: the frame's triangles with it and without, fewer without (where
     *  `seen`: the crypt has no leaves), the programs unchanged */
    const clickBox = async (label: string, seen: boolean): Promise<void> => {
      const on = markedShown(mark);
      const had = programs();
      const place = G.arena.biome;
      const before = await drawsOf(`dev-${mark}-${place}-${on ? 'on' : 'off'}`);
      await click(box);
      const after = await drawsOf(`dev-${mark}-${place}-${on ? 'off' : 'on'}`);
      const what = `${label}: ${key}`;
      check(markedShown(mark) === !on && allOut() === on, `${what}: the checkbox did not ${on ? 'take out' : 'put back'} all of it`);
      check(element<HTMLInputElement>(box).checked === !on, `${what}: the checkbox did not show its state`);
      const [drawn, hidden] = on ? [before, after] : [after, before];
      const went = `(${drawn} with it, ${hidden} without)`;
      check(drawn > hidden || !seen, `${what}: its triangles did not go with the checkbox ${went}`);
      check(programs() === had, `${what}: the checkbox made programs (${had} to ${programs()})`);
      markedCosts.push(`${key} in ${place}: the frame ${drawn} triangles with it, ${hidden} without`);
    };
    const startsDrawn = marked.length > 0 && markedShown(mark) && !marked.some((part) => part.layers.isEnabled(HIDDEN_LAYER));
    check(startsDrawn, `${key}: nothing marked, or it did not start drawn (${marked.length} marked)`);
    await clickBox('lobby', true);
    if (options.canary) {
      const kept = marked[0].layers.mask;
      marked[0].layers.set(0);
      check(!allOut(), `canary: ${key} left drawn was not detected`);
      marked[0].layers.mask = kept;
    }
    const lobbyBiome = G.arena.biome;
    await chooseBiome(BIOME_IDS.find((id) => id !== lobbyBiome)!);
    check(!markedShown(mark) && allOut(), `a biome change put ${key} back`);
    await clickBox('after a biome change', false);
    await chooseBiome(lobbyBiome);
  }
  RUST.tune.shadowTurns = shadowTurns;
  lines.push(`Trees, leaves, grass: ${markedCosts.join('; ')}; no program made`);

  // Profile this spot: each checkbox's part timed in the panel, the pause menu left closed.
  panelProfile.clock = window.__labClock.realNow;
  panelProfile.nextFrame = window.__labClock.realFrame;
  // (rounds enough for each part's ±, which says whether its time is told apart from nothing)
  panelProfile.turns = { rounds: 3, frames: 1, settle: 1 };
  await action('profile');
  // (its note is cleared as it starts and written as it ends: the button reads Profile this spot before its first
  // progress too, and read by it, the times were read before any was taken)
  const profiled = (): boolean => (element('.dv-prof-note').textContent ?? '') !== '';
  for (let i = 0; !profiled() && i < 600; i++) await realWait(20);
  check(profiled(), 'Profile this spot did not finish');
  const times = [...document.querySelectorAll<HTMLElement>('#dev-panel [data-ms]')];
  // (a time, or ≈0 where it isn't told apart from nothing, each with its ± in its title; none, untimed, where
  // nothing of it is in the scene: the lobby has no spent arrows down)
  const timed = times.filter((ms) => /( ms|≈0)$/.test(ms.textContent ?? '') && /±/.test(ms.title));
  const noneHere = times.filter((ms) => ms.textContent === 'none').map((ms) => ms.dataset.ms);
  const readings = times.length - noneHere.length;
  const allTimed = times.length >= 11 && timed.length === readings;
  check(allTimed, `Profile this spot timed ${timed.length} of ${readings} parts`);
  check(noneHere.join() === 'the spent arrows', `Profile this spot said none of ${noneHere.join() || 'nothing'}`);
  check(!G.menuOpen, 'Profile this spot opened the pause menu');
  check(parts.every((part) => part.checked && !part.disabled), 'Profile this spot left a part out or a checkbox disabled');
  moments.push(await lab.screen('dev-profiled', [], '#dev-panel .dv-parts'));
  const faint = times.filter((ms) => ms.textContent === '≈0').length;
  const said = `${timed.length} parts timed in the panel (${faint} ≈0), none of: ${noneHere.join()}`;
  lines.push(`Profile this spot: ${said}`);

  // The checkbox must apply to +1 and elite batches even with no run at all.
  const spawn = async (count: number) => {
    const before = new Set(G.enemies);
    await click(`[data-spawn="${count}"]`);
    for (let i = 0; G.enemies.filter((foe) => !before.has(foe)).length < count && i < 1000; i++) {
      await lab.step(1); await realWait(10);
    }
    const made = G.enemies.filter((foe) => !before.has(foe));
    if (made.length !== count) throw new Error(`dev: +${count} did not spawn its enemies`);
    return made;
  };
  await click('[data-in=training]');
  const one = await spawn(1);
  await click('[data-in=champion]');
  const batch = await spawn(5);
  const ghosts = [...one, ...batch];
  check(G.run === null && ghosts.every((foe) => foe.training && foe.damage === 0 && !foe.castsShadow
    && foe.model.kit.u.uDissolve.value >= 0.28), 'manual Training spawns were not harmless ghost projections in the lobby');
  check(batch.every((foe) => foe.hero), 'Training batch did not preserve Elite');
  await click('[data-in=champion]');
  await click('[data-in=training]');
  const [ordinary] = await spawn(1);
  const away = G.player.away, life = G.player.life;
  G.player.away = false; G.player.guardUntil = 0;
  check(hurtPlayer(G.player, 100, 'vitality', null, { foe: ordinary, attack: 'strike' }) > 0,
    'ordinary-spawn damage control did no damage');
  G.player.life = life; G.player.guardUntil = 0;
  for (const ghost of ghosts) hurtPlayer(G.player, 100, 'vitality', null, { foe: ghost, attack: 'strike' });
  check(G.player.life === life, 'manual Training spawns could damage the hero');
  G.player.away = away;
  await action('reset');
  lines.push('manual Training: +1, +5 Elite, projection, damage immunity and ordinary damage control checked');

  await click('details:has([data-in=rarity]) > summary');
  await lab.step(60); refreshPanel();
  check(perfHudSize() === 'off' && (perfHudStats()?.fps ?? 0) > 0,
    'compact performance timings did not update with the separate overlay off');
  check(element('.dv-perf-info').querySelectorAll('strong').length >= 8, 'compact performance numbers were not emphasized');

  const opacity = element<HTMLInputElement>('[data-in=opacity]');
  opacity.value = '0'; opacity.dispatchEvent(new Event('input', { bubbles: true }));
  await realWait(350);
  check(Number(opacity.value) === 50 && element('[data-out=opacity]').textContent === '50%', 'opacity could fall below its readable minimum');
  check(Math.abs(Number(getComputedStyle(element('[data-act=freeze]')).opacity) - 0.5) < 0.01, 'opacity did not fade individual controls');
  const profile = element('[data-act=profile]');
  profile.scrollIntoView({ block: 'nearest' });
  const box = profile.getBoundingClientRect(), checksBefore = parts.map((part) => part.getBoundingClientRect().top);
  const statsNode = element('.dv-perf-info');
  await lab.mouseTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  for (let i = 0; i < 4; i++) { await lab.step(30); refreshPanel(); }
  check(getComputedStyle(profile).opacity === '1', 'hovered control did not return to full brightness');
  const neighbour = element('#dev-panel [data-perf=off]');
  check(getComputedStyle(neighbour).opacity === '0.5', 'hover brightened neighbouring controls');
  check(element('.dv-perf-info') === statsNode && checksBefore.every((y, i) => Math.abs(y - parts[i].getBoundingClientRect().top) < 0.1)
    && Math.abs(box.top - profile.getBoundingClientRect().top) < 0.1, 'hover or live performance refresh shifted the layout');
  moments.push(await lab.screen('dev-hover-brightness', [], 'details:has(.dv-perf-info)'));
  await lab.mouseTo({ x: innerWidth * 0.7, y: innerHeight * 0.5 });
  moments.push(await lab.screen('dev-opacity-minimum'));
  opacity.value = '95'; opacity.dispatchEvent(new Event('input', { bubbles: true }));

  for (const [width, height] of [[1024, 700], [1920, 1080], [844, 390], [1180, 820], [820, 1180]]) {
    await lab.showOn({ width, height, ratio: 1 });
    if (width === 844 || width === 1180 || width === 820) await touchMode(lab);
    refreshPanel();
    const panel = element('#dev-panel'), rect = panel.getBoundingClientRect();
    panel.scrollTop = 0; refreshPanel();
    check(rect.width > 0 && rect.left >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1,
      `${width}x${height}: panel did not fit the viewport`);
    check(panel.scrollWidth <= panel.clientWidth + 1, `${width}x${height}: panel content overflowed`);
    for (const control of panel.querySelectorAll<HTMLElement>('.dv-speed-row button, .dv-camera-row button')) {
      check(control.scrollWidth <= control.clientWidth + 1, `${width}x${height}: inline control label overflowed`);
    }
    const button = element('#dev-panel [data-act=freeze]');
    check(button.offsetHeight === 28 && getComputedStyle(button).fontSize === '15px', 'larger font changed the button height');
    if (panel.scrollHeight > panel.clientHeight + 2) {
      const cue = element('.dv-scroll-cue');
      check(getComputedStyle(cue).visibility === 'visible' && cue.getBoundingClientRect().bottom <= rect.bottom + 1,
        `${width}x${height}: overflowing panel did not offer a visible scroll cue`);
    }
    const checks = parts.slice(0, 2).map((part) => part.parentElement!.getBoundingClientRect());
    check(Math.abs(checks[0].top - checks[1].top) < 1 && checks[1].left > checks[0].left,
      `${width}x${height}: performance checks did not use two columns`);
    moments.push(await lab.screen(`dev-${width}x${height}`));
    togglePanel(false);
    showPause(true); pauseTab('controls');
    const marker = element('.dv-mode-label');
    check(marker.textContent?.includes('Dev mode') === true && marker.getBoundingClientRect().width > 0,
      `${width}x${height}: pause did not clearly label developer mode`);
    const help = element('.dv-help');
    check(['F7', 'F8', 'F9', 'Wheel', 'WASD'].every((key) => help.textContent?.includes(key)), 'developer shortcuts missing from pause controls');
    check(help.scrollWidth <= help.clientWidth + 1, `${width}x${height}: developer help overflowed`);
    moments.push(await lab.screen(`dev-controls-${width}x${height}`));
    const pages = element('#pause .pb-pages');
    pages.scrollTop = pages.scrollHeight;
    const controlsBottom = element('#pause .controls-help').getBoundingClientRect().bottom;
    check(controlsBottom <= pages.getBoundingClientRect().bottom + 1,
      `${width}x${height}: controls could not scroll clear of the build footer`);
    if (width === 1920) moments.push(await lab.screen('dev-controls-scrolled'));
    pages.scrollTop = 0;
    showPause(false); togglePanel(true);
  }
  await lab.showOn({ width: 1920, height: 1080, ratio: 1 });
  await lab.step(60); refreshPanel();
  element('#dev-panel').scrollTop = element('#dev-panel').scrollHeight;
  refreshPanel();
  moments.push(await lab.screen('dev-performance-compact', [], 'details:has(.dv-perf-info)'));
  moments.push(await lab.screen('dev-gear-compact', [], 'details:has([data-in=rarity])'));
  await action('fly');
  refreshPanel();
  check(freeCamOn() && time.frozen, 'free camera did not freeze the game');
  check(getComputedStyle(element('#dev-panel')).scrollbarWidth === 'thin'
    && getComputedStyle(element('#dev-panel')).scrollbarColor !== 'auto', 'free-camera panel retained a native unthemed scrollbar');
  const speed = freeCamSpeed();
  await lab.wheel({ x: innerWidth * 0.7, y: innerHeight * 0.4 }, -100);
  check(freeCamSpeed() > speed && element('.df-speed').textContent?.includes(freeCamSpeed().toFixed(1)) === true,
    'wheel speed did not appear in the flight hint');
  moments.push(await lab.screen('dev-flight-speed'));

  // Start from the frozen camera: the real controller must resume time and spawn projections.
  togglePanel(true);
  refreshPanel();
  await click('[data-in=training]');
  await action('start');
  await started();
  check(!time.frozen && !freeCamOn() && !!G.run?.training, 'training remained frozen or started as an ordinary run');
  await lab.until(() => G.enemies.some((foe) => foe.alive && !foe.def.dummy && foe.spawning <= 0), 1000,
    'training did not spawn ghost enemies');
  // Swap with both standing and gate-scheduled enemies, without resetting progress or loot.
  const run = G.run!, beforeScore = run.score, beforeBag = run.bag;
  if (!run.queue.length) run.queue.push([{ type: BIOMES[G.arena.biome].pool(run.wave)[0][0], hero: false }]);
  run.nextGroupT = 0; updateRun(0);
  check(run.pending > 0, 'biome swap control did not schedule any enemies');
  const standing = G.enemies.filter((foe) => foe.alive).map((foe) => ({ id: foe.id, hero: foe.hero, health: foe.life / foe.maxLife }));
  time.frozen = true;
  const to = BIOME_IDS.find((id) => id !== G.arena.biome)!;
  await chooseBiome(to);
  const roster = new Set([...BIOMES[to].pool(Infinity).map(([id]) => id), ...bossesOf(to)]);
  check(G.run === run && run.score === beforeScore && run.bag === beforeBag && run.wave === 1, 'mid-run biome change reset progress');
  check(standing.every((old) => {
    const foe = G.enemies.find((each) => each.id === old.id);
    return !!foe && roster.has(foe.type) && foe.hero === old.hero && foe.training && Math.abs(foe.life / foe.maxLife - old.health) < 0.001;
  }), 'biome change did not preserve and replace standing enemies');
  check(run.queue.flat().every((unit) => roster.has(unit.type)), 'queued foes kept the old biome');
  time.frozen = false; await lab.step(90);
  check(G.enemies.every((foe) => roster.has(foe.type)), 'a pending gate spawn used the old biome');
  lines.push('immediate lobby/mid-run biome swap: standing, queued and pending enemies checked; progress preserved');
  const health = G.player.life;
  G.player.guardUntil = 0;
  hurtPlayer(G.player, 1e6);
  check(G.player.life === health, 'training enemies could hurt the hero');
  const source = G.enemies.find((foe) => foe.alive && !foe.def.dummy)!;
  const oldRole = role.current, training = G.run!.training;
  role.current = 'host';
  const report = foesAsked([source.id])[0];
  check(report?.tr === 1, 'host spawn report omitted the training property');
  role.current = 'guest';
  G.run!.training = false;
  foesTold([{ ...report, id: source.id + 1_000_000 }]);
  const copy = G.enemies.find((foe) => foe.id === source.id + 1_000_000)!;
  check(!!copy?.training && copy.damage === 0, 'guest did not preserve an individual Training spawn outside a training run');
  if (copy) { copy.dispose(); G.enemies.splice(G.enemies.indexOf(copy), 1); }
  G.run!.training = training; role.current = oldRole;
  moments.push(await lab.screen('dev-training'));

  await action('free');
  check(cheats.free, 'No costs did not switch on');
  const refilled = (): boolean => G.player.energy === G.player.stats.maxEnergy && G.player.cooldowns.size === 0;
  for (let i = 0; i < 3; i++) {
    G.player.energy = 0;
    G.player.cooldowns.set('test-dev-refill', 20);
    await lab.step(1);
    check(refilled(), 'No costs did not keep refilling');
  }
  if (options.canary) {
    G.player.energy = 0;
    check(!refilled(), 'canary: a drained resource was not detected');
    lines.push('canary: a drained resource detected');
  }
  await action('free');
  await action('reset');
  check(running() && G.run?.wave === 1 && G.run.training, 'reset did not restart the loaded training wave');
  check(G.player.alive && G.player.life === G.player.stats.maxLife && time.scale === 1, 'reset left the hero dead or time slowed');
  await action('lobby');
  await action('reset');
  check(G.mode === 'menu' && G.player.alive, 'reset did not restore the loaded lobby');
  lines.push('the panel floating, frame inclusion, labels, opacity, five viewport layouts, flight speed, frozen training start, no costs, reset checked');

  // Walk the camera into the head at 0.1x: the head must leave the drawn layers before entry.
  await action('start');
  await started();
  await lab.press('KeyV');
  await lab.until(() => viewSettled(), 120, 'third person did not settle');
  lab.pointerLock(true);
  await lab.click({ x: innerWidth * 0.7, y: innerHeight * 0.5 });
  await lab.step(2);
  check(pointerLocked(), 'Dev panel prevented third-person mouse look');
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await lab.keyDown('AltLeft'); await lab.step(2, () => ({ keys: ['altleft'] }));
  check(element('#alt-cursor').checkVisibility(), 'Alt did not show the cursor over the Dev panel');
  const slider = element<HTMLInputElement>('[data-in=opacity]');
  slider.scrollIntoView({ block: 'nearest' });
  const track = slider.getBoundingClientRect();
  const left = { x: track.left + 1, y: track.y + track.height / 2 };
  const right = { x: track.right - 1, y: left.y };
  await lab.click(left);
  await lab.step(2, () => ({ keys: ['altleft'] }));
  check(slider.value === '50' && element('[data-out=opacity]').textContent === '50%', 'Alt-click did not change the opacity slider');
  await lab.mouseDown(left);
  await lab.mouseTo(right);
  await lab.step(2, () => ({ keys: ['altleft'] }));
  check(slider.value === '100' && element('[data-out=opacity]').textContent === '100%', 'Alt-drag did not continuously update opacity');
  await lab.mouseUp(right);
  await lab.step(2, () => ({ keys: ['altleft'] }));
  check(pointerLocked(), 'opacity interaction released mouse look');
  for (const trainingMode of [false, true]) {
    const trainingBox = element<HTMLInputElement>('[data-in=training]');
    const label = trainingBox.closest('label')!;
    label.scrollIntoView({ block: 'nearest' });
    const labelBox = label.getBoundingClientRect();
    await lab.click({ x: labelBox.right - 3, y: labelBox.y + labelBox.height / 2 });
    await lab.step(2, () => ({ keys: ['altleft'] }));
    check(trainingBox.checked === trainingMode && G.run?.training === trainingMode,
      'Alt-clicking the Training label did not toggle its checkbox and run mode');
    const biomeSelect = element<HTMLSelectElement>('[data-in=biome]');
    biomeSelect.scrollIntoView({ block: 'nearest' });
    const point = middleOf(biomeSelect), oldBiome = G.arena.biome;
    await lab.mouseTo(point);
    const cursor = new DOMMatrix(getComputedStyle(element('#alt-cursor')).transform);
    check(Math.hypot(cursor.e - point.x, cursor.f - point.y) < 2, 'native-picker control: virtual cursor missed the biome select');
    await lab.click(point);
    const menu = element('#alt-select');
    check(pointerLocked() && menu.checkVisibility(), 'Alt dropdown did not open while keeping mouse look captured');
    check(Number(getComputedStyle(element('#alt-cursor')).zIndex) > Number(getComputedStyle(menu).zIndex), 'cursor was behind the dropdown');
    const option = menu.querySelector<HTMLElement>(`[data-option="${biomeSelect.selectedIndex === 0 ? 1 : 0}"]`)!;
    await lab.mouseTo(middleOf(option));
    moments.push(await lab.screen(`dev-alt-dropdown-${trainingMode ? 'training' : 'normal'}`, [], '#alt-select'));
    await lab.click(middleOf(option));
    await lab.step(2, () => ({ keys: ['altleft'] }));
    check(G.arena.biome !== oldBiome && biomeSelect.value === G.arena.biome,
      'choosing a biome from the Alt dropdown did not apply mid-run');
    check(!document.getElementById('alt-select'), 'Alt dropdown stayed open after choosing an option');
  }
  lines.push('Alt cursor: slider clicks/drags, Training label and mouse-selected biome list checked in normal and Training runs');
  check(!G.menuOpen && pointerLocked(), 'native controls paused or released gameplay mouse look');
  const select = element<HTMLSelectElement>('[data-in=biome]');
  await lab.click(middleOf(select));
  await window.__labKey!('keyDown', 'Escape'); await window.__labKey!('keyUp', 'Escape');
  check(!document.getElementById('alt-select') && !G.menuOpen && pointerLocked(), 'dismissing the dropdown paused or released play');
  await lab.keyUp('AltLeft');
  await lab.step(2);
  check(pointerLocked() && !element('#alt-cursor').checkVisibility(), 'releasing Alt did not return to captured mouse look');
  const lastMouse = middleOf(select), yaw = cameraYaw();
  // Move from the physical mouse's last click, rather than the virtual cursor (which may have recentered).
  await lab.mouseTo({ x: lastMouse.x + 20, y: lastMouse.y });
  // mouseTo acknowledges pointermove; the browser's compatibility mousemove follows it.
  await window.__labClock.realFrame();
  const queuedLook = input.look.x;
  await lab.step(2);
  check(Math.abs(cameraYaw() - yaw) > 0.001,
    `mouse movement did not turn the camera after releasing Alt (${viewMode()}, queued ${queuedLook}, paused ${G.paused}, frozen ${time.frozen})`);
  time.scale = 0.1;
  await lab.press('KeyV');
  const neck = G.player.model.joints!.neck;
  let nearFrames = 0, exposed = 0;
  await lab.step(400, () => ({}), () => {
    if (viewMode() !== 'first') return;
    const near = neck.getWorldPosition(new THREE.Vector3()).distanceTo(G.camera.position) < 0.8;
    if (!near) return;
    nearFrames++;
    neck.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && object.layers.test(G.camera.layers)
        && !object.layers.isEnabled(HIDDEN_LAYER)) exposed++;
    });
  });
  check(nearFrames > 0 && exposed === 0, `slow first-person entry exposed head meshes (${exposed}, ${nearFrames} nearby frames)`);
  check(pointerLocked(), 'Dev panel prevented first-person mouse look');
  lab.pointerLock(false);
  await document.exitPointerLock();
  lines.push(`0.1x first-person entry: ${nearFrames} nearby frames, ${exposed} exposed head meshes`);
  G.player.guardUntil = 0;
  G.player.takeDamage(1e9, 'physical', null);
  check(!G.player.alive, 'death recovery control did not kill the hero');
  await action('reset');
  check(running() && G.player.alive && G.run?.wave === 1, 'Reset did not restart the wave after death');
  await action('lobby');
  return { text: lines.join('\n'), problems, moments };
}
