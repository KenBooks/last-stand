// Entry point: boots every system, owns the main loop and the menu <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { pipelinesAtOnceFromNow, WEBGPU } from './core/webgpu';
import { initRenderer, updateCamera, render, zoomBy, orbitBy, lookBy, setZoom, sceneTarget, setViewShift, setView, viewMode, viewSettled, VIEWS, type ViewMode } from './core/renderer';
import { CAMERA, LOBBY } from './data/balance';
import { initInput, updateInputRay, endInputFrame, input, isDown, wasPressed, wantPointerLock, pointerLocked, onPointerLockLost, lockLostAt, releaseInput } from './core/input';
import { initAudio } from './core/audio';
import { updateMusic, type MusicWanted } from './core/music';
import { FADES } from './data/music';
import { schedule, updateTimers } from './core/timers';
import { updateSpectate } from './game/spectate';
import { particles } from './fx/particles';
import { initLights, updateLights, clearLights } from './fx/lights';
import { initEffects, updateEffects, clearEffects } from './fx/effects';
import { buildArena, compileEnvMaps } from './world/arena';
import { separateEnemies } from './world/collision';
import { Player } from './entities/player';
import { viewArms } from './entities/viewModel';
import { updateSwingTrails } from './fx/swingTrail';
import { updateEnemies, clearEnemies } from './entities/enemy';
import { spawnEnemy } from './entities/spawner';
import { updateProjectiles, clearProjectiles } from './combat/projectiles';
import { loadProfile, savedClass, saveClass, addToStash, hasSavedClass, peekProfile, saveProfile } from './loot/profile';
import { initGround, updateGround, clearGround } from './game/groundItems';
import { saveSlot, setSaveSlot } from './loot/saveSlots';
import { initRun, startRun, updateRun, continueRun, bankRun, abandonRun, playerOut, hostLeft, endRun } from './game/run';
import { updateFloaters } from './ui/floaters';
import { initHud, showHud, layOutHudAhead, buildHotbar, banner, showDecision, hideDecision, resetDecision, updateHud, renderSpoils } from './ui/hud';
import { cancelProfile, profiling } from './ui/profileTab';
import { initMenus, layOutMenuAhead, showMenu, showSummary, hideSummary, showPause, toggleMenuStowed, menuStowed, lobbyPractice, selectedWave, trainingSelected, lobbyViewShift, renderMenu, markNew, clearOverlays, pauseTab } from './ui/menus';
import { initSaves, savesOpen, savesBack, openSaves, refreshSaves } from './ui/saves';
import { askConflicts, renderCloudBar } from './ui/cloudSaves';
import { initCloud } from './loot/cloud';
import { initHeroSelect, openHeroSelect, heroSelectOpen, heroSelectKeys, heroSelectShift, heroSelectSlotSwitched, placeChoice } from './ui/heroSelect';
import { hallOpen, prepareHeroSelection, queueHallBehind, takeSpareHero, updateHall } from './game/hall';
import { buildBehind } from './game/behind';
import { builtInSlices } from './entities/models/steps';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { releaseClickedFocus } from './ui/focus';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { initTouch, updateTouch } from './ui/touch';
import { initAutoFullScreen } from './ui/autoFullScreen';
import { initPwa } from './ui/pwa';
import { initItemIcons } from './ui/itemIcons';
import { initTraceConsent } from './perf/consent';
import { recorder } from './perf/recorder';
import { traceNow } from './perf/upload';
import { initPerfHud, perfBeginFrame, perfEndFrame, perfSplit, perfLap, perfClock } from './ui/perfHud';
import { initNetHud } from './ui/netHud';
import { drawBattleLog, initBattleLog } from './ui/battleLog';
import { initAltCursor, updateAltCursor } from './ui/altCursor';
import { compileTheBiome, compileTheLobby, queueHeroesBehind, warmLobby, warmTheRest } from './game/warmup';
import { hurry, isAllWarm, isWarming, want, whenWarm } from './game/warm';
import { initReadying, layOutReadyingAhead, READYING, settleReadying } from './ui/readying';
import { hdrAllowedAtBoot, heroDetailAtBoot, holdQuality, initQuality, sampleQuality } from './core/quality';
/** the heroes' detail at or under which their hands are sculpted coarse (Very low's 0.2) */
const COARSE_HANDS_UNDER = 0.2;
import { runFrames } from './core/frameLoop';
import { updateLowLife } from './core/lowLife';
import { checkPrograms, markLoaded, pinPrograms, steadyShadowPrograms, watchPrograms } from './core/shaders';
import { initBiome, rollBiome } from './game/biome';
import { BIOMES, BIOME_IDS } from './data/biomes';
import { CLASSES } from './data/classes/index';
import { loadingStep, loadingDone, loadingFailed, loadingLeft, lobbyLaidOut } from './ui/loading';
import { prepareWind } from './ui/logoWind';
import { preloadTextures } from './core/textures';
import { tickItemGlow } from './core/materials';
import { preloadHands } from './entities/models/hands';
import { preloadHeads } from './entities/models/head';
import { heroDetail } from './entities/models/armor';
import { preloadStump } from './world/stump';
import { preloadFlames } from './world/fire';
import { initSync } from './net/sync';
import { initSession, invitedRoom, sendLook, sendLobby, sendStart, sendControl, syncAway, updateSession, playSession, partnerInRun } from './net/session';
import { isCoop, isGuest, isHost, simulates } from './net/role';
import { updateChat } from './ui/chat';
import { initCoop, renderCoop, updateCoopHud, updateNameTags, touchReviving, joinInvited, hideRunBits } from './ui/coop';
import { updatePingInput } from './ui/ping';
import { updateScoreboard } from './ui/scoreboard';
import type { BiomeId } from './data/biomes';
import type { DevApi } from './dev/index';
/** the developer mode built in (a PR preview's build: vite.config.ts); a dev build has it too, by `import.meta.env.DEV` */
declare const __DEV_TOOLS__: boolean;
import type { Profile } from './types';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;
const timer = new THREE.Timer();
let revealed = false;   // loading screen gone: the game may advance
/** how long the loading screen waits for the fight's warm-up on WebGPU (ms) */
const FIGHT_UNDER_LOADING = 6000;

async function boot() {
  // (full screen at the first gesture, the loading screen's too: armed after the hero, a click as it loaded did nothing)
  initAutoFullScreen();
  // the ground, wall and bark maps are made in workers meanwhile (they'd block the page for a second), the lobby's
  // first, and the heroes' hands and the forest's stump sculpted: started before anything waits, as nothing they make
  // waits on the page
  const textures = preloadTextures(CLASSES[savedClass()].model);
  // (coarse at Very low's detail: a hand is 12,500 triangles otherwise, whatever the level)
  const hands = preloadHands(heroDetailAtBoot() <= COARSE_HANDS_UNDER);
  preloadStump();
  preloadFlames();
  prepareWind();
  await loadingStep('Forging the arena', 0.08);
  initUIScale();
  releaseClickedFocus();
  initItemIcons();
  const { scene, renderer } = await initRenderer($('#game'), hdrAllowedAtBoot());
  // (WebGL's programs: WebGPU's pipelines are none of them, core/webgpu.ts)
  if (!WEBGPU) {
    steadyShadowPrograms(renderer);
    watchPrograms(renderer);
    // (the environments' programs linked as the arena is built, each made as its biome is first shown)
    compileEnvMaps(renderer);
  }
  let keyboardTarget = '';
  initInput(renderer.domElement, (target) => {
    if (target === keyboardTarget) return;
    keyboardTarget = target;
    recorder.mark(`keyboard: ${target}`);
  });
  window.addEventListener('focus', () => recorder.mark('keyboard: page focused'));
  window.addEventListener('blur', () => { keyboardTarget = ''; recorder.mark('keyboard: page unfocused'); });
  initAltCursor(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  initAudio();   // resumed by the first user gesture
  // (built on the maps' canvases as the workers paint them: nothing is drawn till all have come)
  G.arena = await buildArena(scene, renderer);
  initQuality();
  // (every hero's head made in workers meanwhile, at the detail the heroes are built at, and kept across visits: made
  // here, a return's other heroes made theirs behind the lobby, 200 to 270 ms a piece, and on a phone the first
  // hero's froze the loading screen)
  const heads = preloadHeads(heroDetail());
  // the lobby's biome shown, and its programs compiled while the hero is built (game/warmup.ts)
  initBiome();
  compileTheBiome();
  // (the lobby's panels rastered under the loading screen while the hero is built: ui/menus.ts)
  layOutMenuAhead();

  await loadingStep('Summoning the hero', 0.35);
  await hands;
  // (the heroes' engraving is painted over the steel's map as they're built)
  await textures.ready('steel');
  await heads;
  G.profile = loadProfile(savedClass());
  G.player = await builtInSlices(Player.inSteps(G.profile.classId, G.profile.equipped),
    () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve))));
  G.players = [G.player];
  // (what the lobby can do compiled with him, before its page is laid out: game/warmup.ts)
  compileTheLobby();

  initHud();
  initTouch();
  initPerfHud(renderer);
  initTraceConsent();
  initNetHud();
  initBattleLog();
  buildHotbar(G.player);
  // (the run's HUD rastered under the loading screen, as the lobby's panels are: ui/hud.ts)
  layOutHudAhead();
  initRun({ banner, showDecision, hideDecision, resetDecision, showSummary });
  // (the lobby shows before the fight's programs are warm: pressed early, what needs them goes ahead once they are)
  initMenus({ start: whenWarm(['fight'], start, READYING.fight), toMenu, resume, abandon, profileChanged, changeHero, summaryDone, lobbyChanged: sendLobbyChoice });
  initHeroSelect({ choose: chooseHero, closed: heroSelectClosed });
  const useSlot = whenWarm(['fight', 'heroes'], switchSaveSlot, READYING.slot);
  initSaves({ use: useSlot });
  // cloud saves (loot/cloud.ts): slot 1 kept for every device; a download rebuilds slot 1's hero in the lobby
  initCloud({
    reloaded: () => { if (G.mode === 'menu' && saveSlot() === 1) useSlot(1); refreshSaves(); },
    canApply: () => G.mode === 'menu',
    conflicted: () => { if (G.mode === 'menu') { if (savesOpen()) askConflicts(); else openSaves(true); } },
    // (the bar alone: the panes drawn again would lose their scroll)
    changed: () => { if (savesOpen()) renderCloudBar(); },
  });
  initReadying();
  // (the fight's loading bar rastered under the loading screen too, hidden as the lobby is entered: ui/readying.ts)
  layOutReadyingAhead();
  // an item picked up off the lobby floor goes back in the stash, marked new
  initGround((it) => { if (!addToStash(G.profile, it)) return false; markNew([it]); renderMenu(); return true; });
  initSync();
  initSession({ startRun: whenWarm(['fight'], guestStart, READYING.fight), hostGone, changed: () => { renderCoop(); sendLobbyChoice(); } });
  initCoop();
  // losing the pointer mid-wave (Esc, switching windows) pauses, as mouse look can't carry on
  // (in the lobby the Esc that lets go of the mouse look brings the panels back instead)
  onPointerLockLost(() => {
    if (G.mode === 'run' && !G.menuOpen) openPause(true);
    else if (G.mode === 'menu') toggleMenuStowed(false);
  });
  initLoadoutEditor(() => buildHotbar(G.player));
  initPwa();
  $('#decision .bank').onclick = () => chooseBank();
  $('#decision .cont').onclick = () => chooseContinue();

  const unlockAudio = () => initAudio();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // dev-only handle for debugging and automated screenshots (stripped from production builds)
  // (every build: the recorder's trace of now, for a harness to keep; it sends nothing, src/perf/AGENTS.md)
  Object.assign(window, { __traceNow: traceNow });
  if (import.meta.env.DEV) Object.assign(window, { __G: G, __dev: { spawnEnemy, THREE, allWarm: isAllWarm, hurry } });
  // the developer mode (src/dev): a dev build's, or a PR preview's, never production's (`__DEV_TOOLS__`: vite.config.ts)
  if (import.meta.env.DEV || __DEV_TOOLS__) void loadDevMode();

  await loadingStep('Conjuring spells', 0.55);
  enterMenu();
  // a first visit opens on the hero selection screen, no hero chosen yet: the logo's exit gathers into its logo
  const firstVisit = !hasSavedClass();
  if (!firstVisit) lobbyLaidOut();
  // the lobby's shaders compiled before it shows with its own hero's alone, the fight's and the other heroes' behind it
  // (game/warmup.ts): a first visit opens on the hall of heroes, its room warmed with the lobby's and its other heroes
  // once the loading screen has left, a hero at a time, each shown on his plinth as he's warm (from play, "we can only
  // load currently selected/default hero... and then load the two others": warmed under the loading screen, a low-end
  // laptop's froze; asked for before it left, they held its wait for smooth frames 4.1 s, a task of 2.5 s in it)
  if (firstVisit) await loadingStep('Readying the hall', 0.6);
  await warmLobby(firstVisit);
  const { fight: fightWarmed, all: rest } = warmTheRest(loadingLeft);
  if (firstVisit) {
    void loadingLeft.then(() => want('heroes'));
    // (the biome's still shadows drawn now, under the loading screen: else the frame after the hero is chosen)
    G.arena.drawStill();
    openHeroSelect(G.player.cls.id, true);
    showMenu(false);
    lobbyLaidOut();
  }
  // (on WebGPU the lobby held 66 to 108 frames a second for the 8 s the fight warmed behind it, where under the loading
  // screen, in long slices, it takes a moment on a return; what a first visit hasn't done by then goes on behind)
  if (WEBGPU) {
    await loadingStep('Readying the fight', 0.7);
    await Promise.race([fightWarmed, new Promise((done) => setTimeout(done, FIGHT_UNDER_LOADING))]);
  }
  await loadingStep('Lighting the lobby', 0.85);
  render();   // one full frame compiles the post-processing passes (bloom, grade...)
  pinPrograms(renderer);
  // (from here a program not made by a warm-up is a hitch: marked once the fight's were warm, a new build's lobby, its
  // fight cold till Start, had the perf report count every program late, `lab programs --cold`)
  markLoaded();
  // the lobby renders behind the loading screen (to settle) but only starts moving at the
  // reveal, so its opening camera zoom is seen
  updateCamera(0, G.player.pos, G.player.model.height);
  loadingDone(() => {
    revealed = true;
    recorder.revealed(!navigator.serviceWorker?.controller);
    if (WEBGPU) pipelinesAtOnceFromNow();
    setTimeout(() => checkPrograms(renderer));
    void rest.then(() => checkPrograms(renderer));
    // the overlays down the left (performance, network, the battle log) once the loading screen is gone (_perf.scss)
    void loadingLeft.then(() => $('#diag').classList.remove('booting'));
    // an invite link: straight into the friend's room (asked for a name tag first if none is kept)
    const room = invitedRoom();
    if (room) joinInvited(room);
  });
  runFrames(frame);
}

// --- the developer mode ----------------------------------------------------------------
/** the developer mode once loaded (src/dev): null in production, where none of it is built */
let dev: DevApi | null = null;

/**
 * The developer mode loaded, behind two locks: the build (`__DEV_TOOLS__`, set by the PR preview's Docker build alone,
 * or a dev build), and the host, a preview's (`pr-N.` or a commit build's `c-...` under ls.wellscoped.dev) or this
 * machine's (the preview's image tried locally). Its module is its own chunk, which a production build never makes.
 */
async function loadDevMode(): Promise<void> {
  const host = location.hostname;
  const preview = /^(pr|c)-[a-z0-9-]+\.ls\.wellscoped\.dev$/.test(host) || host === 'localhost' || host === '127.0.0.1';
  if (!import.meta.env.DEV && !preview) return;
  const { initDev } = await import('./dev/index');
  const fightWarm = whenWarm(['fight'], (fn: () => void) => fn(), READYING.fight);
  dev = initDev({
    startWave: (wave, biome, training) => fightWarm(() => {
      const heldAlt = ['altleft', 'altright'].filter((key) => input.down.has(key));
      if (G.mode === 'run') toMenu();
      if (G.mode !== 'menu' || heroSelectOpen()) return;
      G.arena.setBiome(biome);
      const seed = nextSeed;
      nextSeed = Math.floor(Math.random() * 2 ** 31);
      beginRun(wave, seed, training);
      for (const key of heldAlt) input.down.add(key);
    }),
    toLobby: () => { if (G.mode === 'run') toMenu(); },
    reset: () => {
      const loaded = { mode: G.mode, biome: G.arena.biome, wave: G.run?.wave ?? 1, training: G.run?.training ?? false };
      toMenu();
      G.arena.setBiome(loaded.biome);
      if (loaded.mode === 'run') fightWarm(() => beginRun(loaded.wave, nextSeed, loaded.training));
    },
    switchClass: (id) => {
      if (G.mode !== 'menu' || heroSelectOpen() || id === G.player.cls.id) return;
      saveClass(id);
      swapHero(id);
      renderMenu();
    },
    gearChanged: () => { profileChanged(); if (G.mode === 'menu') renderMenu(); },
    topView: () => { view = 'top'; },
    openPerformance: () => { if (!G.menuOpen) openPause(true); pauseTab('performance'); },
    whenFightWarm: (fn) => fightWarm(fn),
  });
}

// --- flow -------------------------------------------------------------------------
/** The lobby. `keepSummary`: a co-op run's summary shown as it ended stays over it until closed (`checkRunOver`). */
function enterMenu(keepSummary = false) {
  G.mode = 'menu';
  G.paused = G.menuOpen = G.player.idle = false;
  releaseInput();
  runOver = false;
  showHud(false);
  settleReadying();
  hideRunBits();
  showPause(false);
  if (!keepSummary) hideSummary();
  showMenu(true);
  G.arena.setCalm(1);
  syncAway();
  for (const p of G.players) p.reset();
  G.player.sandbox = true;   // lobby: walk around and try skills freely
  practising = false;
  setZoom(CAMERA.lobbyZoom);
  spawnDummies();
  renderCoop();
  buildNextRunAhead();
}

function spawnDummies() {
  clearEnemies();
  for (const [x, z] of LOBBY.dummies) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
}

/** the next run's seed, its props built ahead in the lobby (`buildNextRunAhead`) */
let nextSeed = Math.floor(Math.random() * 2 ** 31);
/** how many lobby visits have built the next run's props ahead: a visit's builder stops once another starts */
let aheadVisit = 0;

/**
 * The next run's props (its columns: `Biome.rollAhead`) built ahead while the lobby stands, a piece a task, so the
 * run's start only puts them in: built as it began, they were a task of 43 to 56 ms (`npm run stalls -- --scenario
 * boot`, the frames held up from Start). A guest takes its host's seed at the start, and builds them then.
 */
function buildNextRunAhead(): void {
  const visit = ++aheadVisit;
  const step = (): void => {
    if (visit !== aheadVisit || G.mode !== 'menu') return;
    if (!G.arena.rollAhead(nextSeed)) setTimeout(step, AHEAD_PAUSE_MS);
  };
  setTimeout(step, AHEAD_PAUSE_MS);
}
/** the pause between two pieces of the next run's props built ahead (ms): one a frame or so */
const AHEAD_PAUSE_MS = 16;

/** The lobby's start: solo, or the host (whose guests come along). A guest waits for the host. */
function start() {
  if (isGuest() || (isHost() && partnerInRun())) return;
  rollBiome();
  // (the props a run shapes anew: its columns, its stumps; the guests' built from the same)
  const seed = nextSeed;
  nextSeed = Math.floor(Math.random() * 2 ** 31);
  sendStart(G.arena.biome, selectedWave(), seed, trainingSelected());
  beginRun(selectedWave(), seed, trainingSelected());
}

/** A guest: the host started a run. */
function guestStart(biome: BiomeId, wave: number, seed: number, training: boolean) {
  G.arena.setBiome(biome);
  beginRun(wave, seed, training);
}

function beginRun(wave: number, seed: number, training = false) {
  clearGround();   // what's left on the lobby floor is lost
  G.arena.rollProps(seed);
  G.arena.restoreProps();
  showMenu(false);
  hideTooltip();
  showHud(true);
  buildHotbar(G.player);   // the loadout may have changed in the lobby
  G.mode = 'run';
  G.player.sandbox = false;
  practising = false;
  syncAway();
  setZoom(1);
  G.arena.restoreProps();
  startRun(wave, training);
  renderSpoils();
}

/** Whether the lobby is practice this frame (`lobbyPractice`): its panels out of the way, the run's skill bar at the
 *  bottom and real cooldowns and costs; with them shown, free casting (the lobby's note says so). */
let practising = false;
function syncPractice() {
  // (the lobby's alone: a run begun in practice, a co-op guest's as its host starts, kept free casting through it)
  if (G.mode !== 'menu') return;
  const now = lobbyPractice();
  if (now === practising) return;
  practising = now;
  const p = G.player;
  p.sandbox = !now;
  if (now) buildHotbar(p);
  // (back to free casting: nothing left cooling down, the energy full again)
  if (!now) {
    p.cooldowns.clear();
    p.energy = p.stats.maxEnergy;
  }
  showHud(now, true);
}

function toMenu(keepSummary = false) {
  abandonRun();
  enterMenu(keepSummary);
}

/** The host's battleground and starting wave, shown in the guests' lobbies. */
function sendLobbyChoice() {
  if (!isGuest()) sendLobby(G.arena.biome, selectedWave(), trainingSelected());
}

/** The summary closed: back to the lobby, or (in co-op, with the run still on) watch the others; over the lobby, a
 *  co-op run's last summary (`checkRunOver`) just closes. */
function summaryDone() {
  if (G.mode === 'menu') { hideSummary(); return; }
  if (G.run && G.run.phase !== 'over' && G.players.some((p) => !p.local && p.inRun)) { hideSummary(); return; }
  toMenu();
}

/** The host left mid-run: the guest keeps its spoils. */
function hostGone() {
  if (G.mode === 'run') hostLeft();
}

// --- choices -------------------------------------------------------------------------
function chooseBank() {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active) return;
  if (isGuest()) sendControl({ t: 'bank' });
  bankRun();
}

function chooseContinue() {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active || r.votes.has(G.player.slot)) return;
  if (isGuest()) sendControl({ t: 'vote' });
  continueRun();
}

/** The pause menu. Solo it stops the game; in co-op the game goes on and the character stands idle. */
function openPause(open: boolean) {
  // (kept open while the profiler runs, the game's frames held till it's done: closing it, Esc, cancels it,
  // ui/profileTab.ts)
  if (!open && profiling()) {
    cancelProfile();
    return;
  }
  G.menuOpen = open;
  G.paused = open && !isCoop();
  G.player.idle = hallOpen() || (open && isCoop());
  showPause(open);
}

function resume() { openPause(false); }

/** Abandon from the pause menu: solo back to the lobby; in co-op out of the run (spoils lost), watching the rest. */
function abandon() {
  openPause(false);
  if (!isCoop() || G.mode !== 'run' || !G.run || G.run.phase === 'over' || !G.player.inRun) { toMenu(); return; }
  if (isGuest()) sendControl({ t: 'abandon' });
  if (G.player.alive) G.player.die();
  playerOut(G.player, 'dead');
}

/** The lobby's "Change hero": the hero selection screen over the hall of heroes, the lobby's panels out of the way. */
let preparingHeroes = false;
async function changeHero() {
  if (G.mode !== 'menu' || heroSelectOpen() || preparingHeroes) return;
  preparingHeroes = true;
  try {
    await prepareHeroSelection(() => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve))));
    if (G.mode !== 'menu' || G.paused || heroSelectOpen()) return;
    showMenu(false);
    openHeroSelect(G.player.cls.id);
  } finally { preparingHeroes = false; }
}

/** A hero chosen on the selection screen: the new class brings its own profile (gear, stash, records) and loadout; a
 *  class never played in this slot keeps the starter gear the screen showed him in. A first visit's choice is kept,
 *  so the next visit opens on the lobby. */
function chooseHero(id: string, profile: Profile) {
  if (G.mode !== 'menu') return;
  saveClass(id);
  if (id === G.player.cls.id) return;
  if (!peekProfile(id, saveSlot())) saveProfile(profile);
  swapHero(id);
  sendLobbyChoice();   // its records set the starting wave
}

/** The selection screen closed (a hero chosen, or Back): the lobby again, its dummies back up. */
function heroSelectClosed() {
  if (G.mode !== 'menu') return;
  spawnDummies();
  showMenu(true);
}

/** Lobby save slot pick (or the slot in play erased): the slot's last hero, or in an empty slot a
 *  fresh one of the class on show. */
function switchSaveSlot(n: number) {
  if (G.mode !== 'menu') return;
  setSaveSlot(n);
  const id = savedClass(G.player.cls.id);
  saveClass(id);
  swapHero(id);
  heroSelectSlotSwitched(id);   // switched from over the hero selection screen: its hall on the slot's heroes
  renderMenu();
  sendLobbyChoice();   // its records set the starting wave
}

/** The hero of `id` from the save slot in play takes the old one's place: a swap in place, not a respawn. */
function swapHero(id: string) {
  const at = G.player.pos.clone(), facing = G.player.facing;
  G.player.dispose();
  // the old hero's skill visuals go with it
  clearProjectiles(); clearEffects(); clearLights(); particles.clear();
  G.profile = loadProfile(id);
  const old = G.player;
  G.player = takeSpareHero(id, G.profile) ?? new Player(id, G.profile.equipped);
  G.player.slot = old.slot;
  G.player.spawn.copy(old.spawn);
  G.players[G.players.indexOf(old)] = G.player;
  G.player.place(at, facing);
  G.player.sandbox = !practising;
  buildHotbar(G.player);
  sendLook();
}

// gear can change what a key fires (a shield skill falls back without one), so the hotbar is rebuilt.
// The hero stays where it stands (the lobby can be practised in)
function profileChanged() {
  const p = G.player, at = p.pos.clone(), facing = p.facing;
  p.recomputeStats(G.profile.equipped);
  p.reset();
  p.place(at, facing);
  buildHotbar(p);
  sendLook();
}

const compileContext = () => `(${G.mode}${G.run ? ` wave ${G.run.wave}` : ''}, t=${G.time.toFixed(1)}s, ${G.enemies.length} foes)`;

// --- views ------------------------------------------------------------------------
/** the view, cycled with V in a run and in the lobby alike (touch play stays top-down) */
let view: ViewMode = 'top';
const crosshair = document.getElementById('crosshair')!, lookHint = document.getElementById('look-hint')!;

function syncView(): void {
  const v = input.touchMode ? 'top' : view;
  setView(v);
  input.centerAim = v !== 'top';
  // mouse look holds the pointer through the run, the bank-or-continue choice included (B / C
  // pick there), and lets go for the pause menu and the run's end; in the lobby, while its panels
  // are stowed (the pointer is free for them otherwise)
  const phase = G.run?.phase;
  const inRun = G.mode === 'run' && G.player.active && (phase === 'countdown' || phase === 'fighting' || phase === 'cleared');
  const inLobby = G.mode === 'menu' && menuStowed() && !savesOpen();
  const look = v !== 'top' && !G.menuOpen && (inRun || inLobby) && !dev?.wantsCursor();
  wantPointerLock(look);
  crosshair.classList.toggle('hidden', v === 'top');
  lookHint.classList.toggle('hidden', !look || pointerLocked());
  updateAltCursor();
}

// --- loop ---------------------------------------------------------------------------
function handleGlobalKeys() {
  // the save slots screen takes the keys: Esc goes back (out of its delete popup first); over the hero selection
  // screen too, which opens it
  if (savesOpen()) { if (wasPressed('escape')) savesBack(); return; }
  // Escape reaches Settings before a first hero is chosen too; pause keeps the hall and its selection underneath.
  if (heroSelectOpen()) {
    if (wasPressed('escape')) openPause(!G.menuOpen);
    else if (!G.menuOpen) heroSelectKeys();
    return;
  }
  if (G.mode === 'menu' && !G.menuOpen && wasPressed('space')) toggleMenuStowed();
  // the Esc that released the mouse-look pointer already paused the game
  if (wasPressed('escape') && performance.now() - lockLostAt < 300) return;
  if (wasPressed('escape')) {
    // out of the run, the summary (or the watching) has no pause
    if (G.mode === 'run' && G.run && !G.player.inRun) return;
    openPause(!G.menuOpen);
  }
  if (!G.menuOpen && wasPressed('v')) nextView();
  if (G.mode !== 'run') return;
  if (!G.menuOpen && G.run?.phase === 'cleared') {
    if (wasPressed('b')) chooseBank();
    if (wasPressed('c')) chooseContinue();
  }
}

/** The next view (V). In the lobby a close view stows the panels, so the mouse looks at once (the key press lets the
 *  pointer be taken), and the top view brings them back. */
function nextView() {
  view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  if (G.mode === 'menu' && !input.touchMode) toggleMenuStowed(view !== 'top');
}

/** Where the camera looks: the local player, or once out of a co-op run, the partner watched or the free camera
 *  (`game/spectate.ts`; its keys while nothing is over the game). */
function cameraFocus(dt: number): { player: Player | null; pos: THREE.Vector3; height: number } {
  const keys = !G.menuOpen && $('#summary').classList.contains('hidden');
  const watch = updateSpectate(dt, keys);
  return watch ?? { player: G.player, pos: G.player.pos, height: G.player.model.height };
}

/** how long the run's end is said before every game goes back to the lobby (s) */
const BACK_AFTER = 2.5;
/**
 * The run is over for everyone: solo, once the summary is closed, back to the lobby; in co-op every game goes back
 * together once its summary has been shown (from play: "once the run ends and no one is playing any wave it should
 * automatically spawn you back with the others"). A summary shown before the run ended, its player watching the
 * rest, goes with the run ("You Have Fallen" stayed up after it); the one its own end brought (the last out) stays
 * over the lobby until closed, its spoils still to read.
 */
let runOver = false;
function checkRunOver() {
  const r = G.run;
  if (!r || G.mode !== 'run') return;
  // the host (or solo) ends the run once nobody is left in it
  if (!isGuest() && r.phase !== 'over' && !G.players.some((p) => p.inRun)) endRun();
  if (r.phase !== 'over' || runOver || !r.summarized) return;
  const shown = !$('#summary').classList.contains('hidden');
  if (!isCoop() && shown) return;
  runOver = true;
  if (r.watched) hideSummary();
  const keep = shown && !r.watched;
  if (!keep) banner('The run is over', 'Back to the sanctuary');
  schedule(BACK_AFTER, () => { if (G.mode === 'run' && runOver && G.run === r) toMenu(keep); });
}

// perfLap() marks the end of each stage for the performance report's breakdown
function update(dt: number): void {
  perfLap();
  updateInputRay();
  if (input.wheel && !input.mouse.overUI) zoomBy(input.wheel);
  if (input.orbit) orbitBy(input.orbit);
  if (input.look.x || input.look.y) lookBy(input.look.x, input.look.y);

  // co-op: the partners' reports (and on a guest the host's fight) played out to the moment shown
  playSession(dt);
  // the player can move and cast in both the arena and the lobby (sandbox); co-op partners as reported
  G.player.reviving = G.mode === 'run' && !G.menuOpen && (isDown('e') || touchReviving());
  for (const p of G.players) p.update(dt);
  updateHall(dt);
  // (the other heroes, the hall's and a spare of each class built behind the lobby, a piece a frame: game/behind.ts;
  // once the lobby's warm-ups behind it are done, not on top of them)
  if (G.mode === 'menu' && !hallOpen() && !isWarming()) {
    queueHeroesBehind();
    queueHallBehind();
    buildBehind();
  }
  // (the hero selection screen's choice kept on its hero as the camera moves)
  placeChoice();
  updateGround(dt);
  perfLap('player');
  updateProjectiles(dt); perfLap('projectiles');
  // enemies in the arena, training dummies in the lobby
  if (G.mode === 'run') { updateRun(dt); checkRunOver(); }
  updateEnemies(dt);
  separateEnemies(!simulates());
  G.player.showAim(dt);
  // co-op pings: Left Shift held and let go, a long press on the minimap (in a run, or the lobby's practice)
  updatePingInput(dt, G.mode === 'run' ? !G.menuOpen : menuStowed() && !savesOpen() && !hallOpen() && !G.menuOpen);
  perfLap('enemies');
  updateSession(dt, G.player.reviving);
  syncPractice();
  updateNameTags();
  if (G.mode === 'run') {
    updateHud();
    updateCoopHud();
    perfLap('hud');
  } else if (practising) {
    updateHud();
  }
  updateScoreboard(dt);
  // co-op chat: in a run or the lobby, with no menu, hall or saves over it
  updateChat(!G.menuOpen && !heroSelectOpen() && !hallOpen() && !savesOpen());
  // (top-down only: a close view shifted off its middle would leave the crosshair off the aim)
  const vs = heroSelectOpen() ? heroSelectShift() : view === 'top' || input.touchMode ? lobbyViewShift() : { x: 0, y: 0 };
  setViewShift(vs.x, vs.y);
  const focus = cameraFocus(dt);
  updateCamera(dt, focus.pos, focus.height);
  updateLowLife(dt);
  // through the eyes the body would fill the view (it still casts, animates and blocks): only the
  // arms and what they hold show
  const eyes = focus.player === G.player && viewMode() === 'first' && viewSettled();
  viewArms(G.player.model, eyes, G.camera);
  // (the weapons' trails in each hero's own space, the arms placed in the view first)
  updateSwingTrails();



  G.arena.update(dt, G.time); perfLap('arena');
  updateEffects(dt); perfLap('effects');
  updateLights(dt); perfLap('lights');
  particles.update(dt); perfLap('particles');
  updateTimers(dt); perfLap('timers');
  updateFloaters(dt); perfLap('floaters');
  // the crosshair bold while a drawn shot is held at full draw, swelling into it once (its arrowhead glints then too)
  crosshair.classList.toggle('full', G.player.drawnFull);
}

/**
 * A co-op host's game runs the fight for everyone, so it can't stop when its tab goes to the
 * background (the browser stops drawing it): a timer steps it meanwhile. Browsers slow such
 * timers down to about once a second, so each tick catches up in short steps.
 */
let lastStep = 0;
function backgroundStep(): void {
  const now = performance.now();
  if (!document.hidden || !isHost() || !revealed || G.paused) { lastStep = now; return; }
  let left = Math.min(1.5, (now - lastStep) / 1000);
  lastStep = now;
  while (left > 1e-3) {
    const dt = Math.min(left, 1 / 20);
    G.dt = dt;
    G.time += dt;
    update(dt);
    left -= dt;
  }
}
setInterval(backgroundStep, 100);

/** The music now: the biome's battle track through each wave's fight, its lobby track everywhere else (the lobby,
 *  a run's countdowns and the choice after a wave, its summary), both kept decoded through a run; none behind the
 *  loading screen. */
function musicWanted(): MusicWanted {
  const music = BIOMES[G.arena.biome].music;
  if (!revealed) return { track: null, fade: FADES.lobby, ready: [] };
  if (G.mode === 'menu') return { track: music.lobby, fade: FADES.lobby, ready: [music.lobby] };
  const ready = [music.lobby, music.battle];
  if (G.run?.phase === 'fighting') return { track: music.battle, fade: FADES.battle, ready };
  return { track: music.lobby, fade: FADES.lobby, ready };
}

function frame(timestamp: number): void {
  lastStep = performance.now();

  perfBeginFrame(timestamp);
  timer.update(timestamp);
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 1 / 20);
  if (revealed) { updateTouch(dt); handleGlobalKeys(); syncView(); }
  updateMusic(dt, musicWanted());
  const t0 = perfClock.now();
  // (the developer mode's time: frozen, slowed, a step)
  const simDt = dev ? dev.simDt(dt) : dt;
  if (!G.paused && revealed && simDt > 0) {
    // The hall's three staged heroes aren't a play workload; keep its prepared detail stable for selection.
    if (isWarming() || hallOpen()) holdQuality();
    else {
      // (each of Auto's steps marked in the performance trace: a slow start is Auto walking down from High)
      const stepped = sampleQuality(rawDt);
      if (stepped) recorder.mark(`quality auto: ${stepped}`);
    }
    G.dt = simDt;
    G.time += simDt;
    update(simDt);
  }
  // (the developer mode's free camera, flown by the browser's clock with the game frozen or not)
  if (dev && revealed) dev.frame(Math.min(rawDt, 0.1));
  // (worn items' glow: its wisps' drift and breath, wherever a hero is drawn)
  tickItemGlow(G.time);
  drawBattleLog();
  clearOverlays();
  const t1 = perfClock.now();
  render();
  perfSplit(t1 - t0, perfClock.now() - t1);
  pinPrograms(G.renderer, compileContext);
  endInputFrame();
  perfEndFrame();
}

boot().catch((e) => { console.error(e); loadingFailed(e); });
