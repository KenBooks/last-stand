// Entry point: boots every system, owns the main loop and the lobby (the village) <-> run flow.
import * as THREE from 'three';
import { G } from './state';
import { pipelinesAtOnceFromNow, WEBGPU } from './core/webgpu';
import { initRenderer, updateCamera, render, zoomBy, orbitBy, lookBy, setZoom, sceneTarget, setViewShift, setView, faceCamera, viewMode, viewSettled, VIEWS, type ViewMode } from './core/renderer';
import { CAMERA, LOBBY } from './data/balance';
import { HALL, START_SPOTS, TERRACE, YARD_DUMMIES, biomeOfHour, inHall, type VillageObject } from './data/village';
import { initInput, updateInputRay, endInputFrame, input, isDown, wasPressed, wantPointerLock, pointerLocked, onPointerLockLost, lockLostAt, releaseInput } from './core/input';
import { initAudio, sfx } from './core/audio';
import { VILLAGE } from './core/beta';
import { hideBetaNotice, showBetaNotice } from './ui/beta';
import { InputDelivery } from './core/inputDelivery';
import { keyDeliveryDelay } from './core/keyDelivery';
import { updateMusic, type MusicWanted } from './core/music';
import { FADES } from './data/music';
import { schedule, updateTimers } from './core/timers';
import { updateSpectate } from './game/spectate';
import { particles } from './fx/particles';
import { initLights, updateLights, clearLights } from './fx/lights';
import { initEffects, updateEffects, clearEffects } from './fx/effects';
import { buildArena, compileEnvMaps, painted } from './world/arena';
import { separateEnemies } from './world/collision';
import { prepareWalks } from './world/walkPath';
import { groundHeight } from './world/ground';
import { HERO_RADIUS, Player } from './entities/player';
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
import { initHud, showHud, layOutHudAhead, slotsAhead, buildHotbar, banner, showDecision, hideDecision, resetDecision, updateHud, updateVillageMinimap, readyMinimap, renderSpoils } from './ui/hud';
import { cancelProfile, profiling } from './ui/profileTab';
import { initMenus, layOutMenuAhead, slideMenuAhead, rehearseChest, showMenu, showSummary, hideSummary, showPause, toggleMenuStowed, menuStowed, lobbyPractice, selectedWave, trainingSelected, selectTraining, lobbyViewShift, renderMenu, markNew, clearOverlays, openPanels, panelsOpen, showHelp, helpOpen, hideHelp, layOutHelpAhead, changeHero as askForHeroes, type Panels, pauseTab } from './ui/menus';
import { initVillageCard, showVillageCard, villageCardOf } from './ui/villageCard';
import { standGhost, updateGhost, ghostsWarmed, ghostBiome } from './game/ghost';
import { initVillage, prepareLamps, updateVillage, closedFrom, inYard, villageObject, goUse, goTo, objectNear, heroLookedAt, villageReport } from './game/village';
import { seenShareAt } from './core/sight';
import { initVillageMap, layOutMapAhead, setVillageMap, villageMapOpen, updateVillageMap } from './ui/villageMap';
import { initTraining, completeStep, restartTraining } from './game/training';
import { initTrainingTracker, updateTrainingTracker } from './ui/training';
import { initCrestBlow, updateCrestBlow } from './ui/crestBlow';
import { hourNow, holdHour } from './game/clock';
import { initSaves, savesOpen, savesBack, openSaves, refreshSaves } from './ui/saves';
import { askConflicts, renderCloudBar, showGoogleLanding } from './ui/cloudSaves';
import { googleLanding, initCloud } from './loot/cloud';
import { initHeroSelect, openHeroSelect, heroSelectOpen, heroSelectKeys, heroSelectShift, heroSelectSlotSwitched, placeChoice } from './ui/heroSelect';
import { hallOpen, prepareHeroSelection, queueHallBehind, takeSpareHero, updateHall } from './game/hall';
import { buildBehind } from './game/behind';
import { builtInSlices } from './entities/models/steps';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { releaseClickedFocus } from './ui/focus';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { initTouch, updateTouch } from './ui/touch';
import { initAutoFullScreen, keyboardLockState } from './ui/autoFullScreen';
import { initPwa } from './ui/pwa';
import { initItemIcons } from './ui/itemIcons';
import { initTraceConsent, layOutAskAhead } from './perf/consent';
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
import { checkPrograms, commandsDone, markLoaded, pinPrograms, steadyShadowPrograms, watchPrograms } from './core/shaders';
import { initBiome, rollBiome } from './game/biome';
import { BIOMES, BIOME_IDS } from './data/biomes';
import { CLASSES, CLASS_IDS } from './data/classes/index';
import { loadingStep, loadingDone, loadingFailed, loadingLeft, lobbyLaidOut, seeThroughLoading, stillLoading } from './ui/loading';
import { prepareWind } from './ui/logoWind';
import { preloadTextures } from './core/textures';
import { tickItemGlow } from './core/materials';
import { preloadHands } from './entities/models/hands';
import { preloadHeads } from './entities/models/head';
import { heroDetail } from './entities/models/armor';
import { preloadEngraving } from './core/engraving';
import { preloadStump } from './world/stump';
import { preloadFlames } from './world/fire';
import { initSync } from './net/sync';
import { initSession, invitedRoom, sendInRun, sendLook, sendLobby, sendStart, sendControl, syncAway, updateSession, playSession, partnerInRun } from './net/session';
import { isCoop, isGuest, isHost, simulates } from './net/role';
import { updateChat } from './ui/chat';
import { initCoop, renderCoop, updateCoopHud, updateNameTags, touchReviving, joinInvited, hideRunBits, openCoop, coopOpen, layOutCoopAhead } from './ui/coop';
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
/** the frames painted either side of the GPU's process catching up, as `drawnBy` waits */
const DRAWN_FRAMES = 2;

/** The next task once the browser has painted `frames` frames. */
async function paintedFrames(frames: number): Promise<void> {
  for (let i = 0; i < frames; i++) await painted();
}

/**
 * What the boot rehearses for Chrome's programs waited on till Chrome has drawn it: its compositor draws on the GPU
 * process's main thread, behind the boot's own compiles there, so a look put back after a frame or two of the
 * page's was often never drawn (the chest's first opening still built its program in some walks and not others,
 * 0.12 to 0.5 s, and Play together's raster 0.2 s). A fence on the game's WebGL says when the GPU's process has
 * done what was sent before it, frames painted either side.
 */
const drawnBy = (renderer: THREE.WebGLRenderer) => async (): Promise<void> => {
  await paintedFrames(DRAWN_FRAMES);
  // (WebGPU's context has no fence of WebGL's: its frames alone)
  if (!WEBGPU) await commandsDone(renderer, painted);
  await paintedFrames(DRAWN_FRAMES);
};

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
  let lastDelayedKey = -Infinity;
  recorder.recordingBoundary = starting => {
    if (starting) inputDelivery.sample(performance.now(), false);
    else recordInputDelivery(true);
  };
  window.addEventListener('keydown', () => inputDelivery.capture(true), true);
  window.addEventListener('keyup', () => inputDelivery.capture(false), true);
  window.addEventListener('pointerdown', () => inputDelivery.pointer(), true);
  window.addEventListener('pointermove', event => inputDelivery.move(keyDeliveryDelay(event.timeStamp, performance.now())), true);
  initInput(renderer.domElement, (target, delay) => {
    inputDelivery.accept(target !== 'game', delay);
    const now = performance.now();
    if (delay >= 250 && now - lastDelayedKey >= 1000) {
      recorder.mark(`keyboard delivery delayed ${Math.round(delay)} ms (${target})`);
      lastDelayedKey = now;
    }
    if (target === keyboardTarget) return;
    keyboardTarget = target;
    recorder.mark(`keyboard: ${target}`);
  });
  window.addEventListener('focus', () => recorder.mark('keyboard: page focused'));
  window.addEventListener('blur', () => { keyboardTarget = ''; recorder.mark('keyboard: page unfocused'); });
  document.addEventListener('focusin', event => {
    if (event.target instanceof HTMLElement) recorder.mark(`keyboard focus: ${event.target.tagName.toLowerCase()}`);
  });
  document.addEventListener('focusout', () => recorder.mark('keyboard focus released'));
  initAltCursor(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  initAudio();   // resumed by the first user gesture
  // (built on the maps' canvases as the workers paint them: nothing is drawn till all have come)
  G.arena = await buildArena(scene, renderer);
  if (VILLAGE) {
    G.arena.setHour(hourNow());
    // (and its lamps' shadows of what stands still, drawn once)
    prepareLamps(renderer, scene.getObjectByName('village')!);
  }
  initQuality();
  // (every hero's head and the engraved steel made in workers meanwhile, at the detail the heroes are built at: on a
  // phone they froze the loading screen for 4.9 s in the hero's build, "phone has freezes during loading")
  const heads = preloadHeads(heroDetail());
  const engraving = textures.ready('steel').then(preloadEngraving);
  // the village shown (or, with no village, the lobby's biome), and its programs compiled while the hero is built
  // (game/warmup.ts)
  if (!VILLAGE) initBiome();
  compileTheBiome();
  // (the lobby's panels rastered under the loading screen while the hero is built: ui/menus.ts)
  // (the loading screen seen through by a thousandth while the lobby's UI is rehearsed under it: opaque, Chrome
  // rastered and drew none of what it covered, ui/loading.ts)
  if (VILLAGE) seeThroughLoading(true);
  layOutMenuAhead();
  // (and the village's map over it unseen, half folded, then flat once he's built: ui/villageMap.ts)
  if (VILLAGE) {
    initVillageMap({ go: goUse, walk: goTo, trees: () => G.arena.village.trees });
    layOutMapAhead('folding');
  }

  await loadingStep('Summoning the hero', 0.35);
  await hands;
  // (the heroes' engraving is painted over the steel's map as they're built)
  await textures.ready('steel');
  await Promise.all([heads, engraving]);
  G.profile = loadProfile(savedClass());
  G.player = await builtInSlices(Player.inSteps(G.profile.classId, G.profile.equipped),
    () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve))));
  G.players = [G.player];
  // (a frame painted between the boot's long pieces, so the loading screen moves on)
  if (VILLAGE) {
    await painted();
    layOutMapAhead('flat');
    slideMenuAhead(true);
  }
  // (what the lobby can do compiled with him, before its page is laid out: game/warmup.ts)
  compileTheLobby();
  if (VILLAGE) {
    await painted();
    slideMenuAhead(false);
  }

  initHud();
  initTouch({
    active: villageActive, near: objectNear, use: goUse, map: () => setVillageMap(!villageMapOpen()),
    inventory: () => openPanels(panelsOpen() ? null : 'inventory'),
  });
  initPerfHud(renderer);
  initTraceConsent();
  // (the slow game's prompt laid out under it too: perf/consent.ts)
  if (VILLAGE) layOutAskAhead(true);
  initNetHud();
  initBattleLog();
  buildHotbar(G.player);
  // (the run's HUD rastered under the loading screen, as the lobby's panels are: ui/hud.ts)
  layOutHudAhead();
  // (the practice's bar laid out under the loading screen too, so its first raster builds Chrome's Skia programs there:
  // shown first as the hero walked into the yard, a first visit's held Chrome's GPU process 0.25 to 0.4 s; the lobby
  // hides it as it's entered)
  if (VILLAGE) {
    showHud(true, true, true);
    await painted();
    slotsAhead(false);
    // (and its bars' numbers, empty till the lobby's first frame: their blurred shadows' glyphs were first rastered as
    // the hero walked into the yard, 1.2 s of a first visit's GPU process in some walks)
    updateHud();
  }
  initRun({ banner, showDecision, hideDecision, resetDecision, showSummary });
  // (the lobby shows before the fight's programs are warm: pressed early, what needs them goes ahead once they are)
  initMenus({ start: whenWarm(['fight'], start, READYING.fight), toMenu, resume, abandon, profileChanged, changeHero, summaryDone, lobbyChanged: sendLobbyChoice, panels: panelsChanged });
  // (the rehearsed panels given his gear while they lie over the loading screen: rendered first at the lobby's entry,
  // into panels stowed (unseen, drawn by nothing), his items were rastered at the chest's first opening, 0.4 to 1.9 s
  // of a first visit's GPU process)
  if (VILLAGE) {
    renderMenu();
    initVillage({ use: useObject, leave: leaveObject, active: villageActive, shows: objectShows });
    initVillageCard((o) => closedFrom(o), (id) => { G.arena.setBiome(id); sendLobbyChoice(); });
    // (how to play laid out under the loading screen: ui/menus.ts)
    layOutHelpAhead(true);
    initTrainingTracker();
    initCrestBlow();
  }
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
  // (each look held till it's drawn: replaced after a frame, checking's still held the campfire 0.2 s)
  const drawn = drawnBy(renderer);
  if (VILLAGE) {
    layOutCoopAhead('checking');
    await drawn();
    layOutCoopAhead('down');
    await drawn();
    layOutCoopAhead('up');
  }
  // losing the pointer mid-wave (Esc, switching windows) pauses, as mouse look can't carry on
  // (in the lobby the Esc that lets go of the mouse look brings the panels back instead)
  // (in the village too: the Esc that lets go of the mouse look is the pause menu's)
  onPointerLockLost(() => {
    if (VILLAGE) {
      if (!G.menuOpen && (G.mode === 'run' || (G.mode === 'menu' && !heroSelectOpen()))) openPause(true);
    } else if (G.mode === 'run' && !G.menuOpen) openPause(true);
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
  if (import.meta.env.DEV) Object.assign(window, { __G: G, __dev: { spawnEnemy, THREE, allWarm: isAllWarm, hurry, holdHour, restartTraining, faceCamera,
    village: villageReport, seen: seenShareAt } });
  // the developer mode (src/dev): a dev build's, or a PR preview's, never production's (`__DEV_TOOLS__`: vite.config.ts)
  if (import.meta.env.DEV || __DEV_TOOLS__) void loadDevMode();

  await loadingStep('Conjuring spells', 0.55);
  enterMenu();
  // a first visit opens on the hero selection screen, no hero chosen yet: the logo's exit gathers into its logo
  const firstVisit = !hasSavedClass();
  if (VILLAGE) initTraining(firstVisit);
  if (!firstVisit) lobbyLaidOut();
  // the lobby's shaders compiled before it shows with its own hero's alone, the fight's and the other heroes' behind it
  // (game/warmup.ts): a first visit opens on the hall of heroes, its room warmed with the lobby's and its other heroes
  // once the loading screen has left, a hero at a time, each shown on his plinth as he's warm (from play, "we can only
  // load currently selected/default hero... and then load the two others": warmed under the loading screen, a low-end
  // laptop's froze; asked for before it left, they held its wait for smooth frames 4.1 s, a task of 2.5 s in it)
  if (firstVisit) await loadingStep('Readying the hall', 0.6);
  await warmLobby(firstVisit);
  if (VILLAGE) ghostsWarmed();
  const { fight: fightWarmed, all: rest } = warmTheRest(loadingLeft);
  if (firstVisit) {
    void loadingLeft.then(() => want('heroes'));
    // (with no village, the biome's still shadows drawn now, under the loading screen: else the frame after the hero
    // is chosen; the village's are its update's)
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
  if (VILLAGE) {
    stillLoading(true);
    await rehearseChest(drawn);
    stillLoading(false);
    layOutMapAhead('done');
    layOutAskAhead(false);
    layOutHelpAhead(false);
    layOutCoopAhead(null);
    seeThroughLoading(false);
  }
  await loadingStep('Lighting the lobby', 0.85);
  render();   // one full frame compiles the post-processing passes (bloom, grade...)
  if (VILLAGE) readyMinimap();
  pinPrograms(renderer);
  // (from here a program not made by a warm-up is a hitch: marked once the fight's were warm, a new build's lobby, its
  // fight cold till Start, had the perf report count every program late, `lab programs --cold`)
  markLoaded();
  // the lobby renders behind the loading screen (to settle) but only starts moving at the
  // reveal, so its opening camera zoom is seen
  if (VILLAGE) openAtOneOfTheStarts();
  updateCamera(0, G.player.pos, G.player.model.height, floorUnder(G.player));
  loadingDone(() => {
    revealed = true;
    showBetaNotice();
    recorder.revealed(!navigator.serviceWorker?.controller);
    if (WEBGPU) pipelinesAtOnceFromNow();
    setTimeout(() => checkPrograms(renderer));
    void rest.then(() => checkPrograms(renderer));
    // the overlays down the left (performance, network, the battle log) once the loading screen is gone (_perf.scss)
    void loadingLeft.then(() => $('#diag').classList.remove('booting'));
    // an invite link: straight into the friend's room (asked for a name tag first if none is kept)
    const room = invitedRoom();
    if (room) joinInvited(room);
    // back from Google's sign-in (loot/cloud.ts): the save slots screen, on to choosing the cloud save
    void googleLanding().then((landing) => {
      if (!landing || G.mode !== 'menu') return;
      openSaves(true);
      showGoogleLanding(landing);
    });
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
/** the battleground of the portal the last run went through: the hero comes back out of it */
let cameThrough: (typeof BIOME_IDS)[number] | null = null;

/** The lobby. `keepSummary`: a co-op run's summary shown as it ended stays over it until closed (`checkRunOver`). */
function enterMenu(keepSummary = false) {
  G.mode = 'menu';
  G.paused = G.menuOpen = G.player.idle = false;
  releaseInput();
  runOver = false;
  // (the village keeps the run's bar for its yard's practice and its minimap; the panels' lobby has no HUD)
  showHud(VILLAGE, VILLAGE);
  settleReadying();
  hideRunBits();
  showPause(false);
  if (!keepSummary) hideSummary();
  G.arena.showVillage(true);
  showMenu(true);
  G.arena.setCalm(1);
  syncAway();
  for (const p of G.players) p.reset();
  // (back from a run, out of the portal it went through: its way into the village)
  if (VILLAGE && cameThrough) {
    const exit = G.arena.village.exits[cameThrough];
    G.player.place(exit.at, exit.facing);
    faceCamera(exit.facing);
  }
  G.player.sandbox = true;   // lobby: try skills freely in the yard while a panel is up
  practising = false;
  setZoom(CAMERA.lobbyZoom);
  spawnDummies();
  renderCoop();
  buildNextRunAhead();
}

/** The training yard's dummies (the lobby's only foes), and the ghost by its gate (built once, with the village). */
function spawnDummies() {
  clearEnemies();
  if (!VILLAGE) {
    for (const [x, z] of LOBBY.dummies) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
    return;
  }
  for (const [x, z] of YARD_DUMMIES) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
  standGhost(G.arena.groupOf('village'));
}

// --- the village ------------------------------------------------------------------
/** Whether the village takes the hero's input: the lobby up, with no screen or menu over it. */
const villageActive = (): boolean =>
  revealed && G.mode === 'menu' && !G.menuOpen && !heroSelectOpen() && !savesOpen() && !villageMapOpen()
  && G.arena.place === 'village';

/** A village object used (game/village.ts): what it opens. */
function useObject(o: VillageObject): void {
  sfx.click();
  switch (o.use) {
    case 'portal':
      // (the portal's battleground the run's, a co-op host's shown its guests; a guest's card waits for the host)
      if (o.biome && !isGuest()) { G.arena.setBiome(o.biome); selectTraining(false); sendLobbyChoice(); }
      openPanels(null);
      showVillageCard(o);
      return;
    case 'training':
      // (the training grounds: the battleground's choice on its card, the ghost's own first)
      if (!isGuest()) { G.arena.setBiome(ghostBiome()); sendLobbyChoice(); }
      selectTraining(true);
      openPanels(null);
      showVillageCard(o);
      return;
    case 'stash': showVillageCard(null); openPanels('chest'); completeStep('stash'); return;
    case 'heroes': showVillageCard(null); openPanels(null); askForHeroes(); return;
    case 'coop': openCoop(true); return;
    case 'chronicle': openPanels(null); showVillageCard(o); return;
    case 'help': showHelp(true); completeStep('notice'); return;
  }
}

/** The hero walked off from `o`, whose panel or card was open: put away. */
function leaveObject(o: VillageObject): void {
  if (villageCardOf() === o) showVillageCard(null);
  if (o.use === 'stash' && panelsOpen() === 'chest') openPanels(null);
  if (o.use === 'coop') openCoop(false);
  if (o.use === 'help') hideHelp();
}

/** Whether what `o` opened is still up. */
function objectShows(o: VillageObject): boolean {
  switch (o.use) {
    case 'portal': case 'chronicle': case 'training': return villageCardOf() === o;
    case 'stash': return panelsOpen() === 'chest';
    case 'coop': return coopOpen();
    case 'help': return helpOpen();
    case 'heroes': return heroSelectOpen();
  }
}

/** The inventory or the stash opened or put away: the chest's lid follows; put away, the village forgets it. */
function panelsChanged(open: Panels): void {
  G.arena.village.setChest(open === 'chest');
  if (open !== 'chest') closedFrom(villageObject('chest'));
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
  // (the panels' lobby's battleground, Random rolled now; the village's is the portal's)
  if (!VILLAGE) rollBiome();
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
  // (the host's countdown held till now: a slow device's readying outlasted it, and the wave came without it)
  sendInRun();
}

function beginRun(wave: number, seed: number, training = false) {
  hideBetaNotice();
  clearGround();   // what's left on the lobby floor is lost
  if (VILLAGE) {
    cameThrough = G.arena.biome;
    showVillageCard(null);
    closedFrom();
  }
  G.arena.showVillage(false);
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

/** Whether the lobby is practice this frame: in the village's yard (where alone skills are cast) with its panels out
 *  of the way, the run's skill bar at the bottom and real cooldowns and costs; with them shown, free casting (the
 *  lobby's note says so). */
let practising = false;
function syncPractice() {
  // (the lobby's alone: a run begun in practice, a co-op guest's as its host starts, kept free casting through it)
  if (G.mode !== 'menu') return;
  const now = lobbyPractice() && (!VILLAGE || (inYard(G.player.pos.x, G.player.pos.z) && !heroSelectOpen()));
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
  if (VILLAGE) showHud(true, true, now);
  else showHud(now, true);
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
    // (inside the village's hall, the hero he looks at in focus, whom the hint stands before)
    const p = G.player.pos;
    openHeroSelect(VILLAGE && inHall(p.x, p.z) ? CLASS_IDS[heroLookedAt()] : G.player.cls.id);
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

/** The floor the camera follows `p` on: in the village the one he stands on (its terrace, a stair). */
const floorUnder = (p: Player): number => (VILLAGE ? p.obj.position.y : 0);

/** The floor under what the camera follows: a hero's, or the ground under a free camera. */
function focusFloor(focus: { pos: THREE.Vector3; player?: Player | null }): number {
  if (focus.player) return floorUnder(focus.player);
  return VILLAGE ? groundHeight(focus.pos.x, focus.pos.z) : 0;
}

/** A game opens at one of the village's places, at random. */
function openAtOneOfTheStarts(): void {
  const start = START_SPOTS[Math.floor(Math.random() * START_SPOTS.length)];
  const [x, z] = start.at;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), start.facing);
  faceCamera(start.facing);
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
/** the view, cycled with V in a run and in the lobby alike (on touch, the camera button beside the pause) */
let view: ViewMode = 'top';
const crosshair = document.getElementById('crosshair')!, lookHint = document.getElementById('look-hint')!;

function syncView(): void {
  // (the panels' lobby's touch play stays top-down, as before the village)
  const v = !VILLAGE && input.touchMode ? 'top' : view;
  setView(v);
  input.centerAim = v !== 'top';
  // mouse look holds the pointer through the run, the bank-or-continue choice included (B / C
  // pick there), and lets go for the pause menu and the run's end; in the lobby, while its panels
  // are stowed and no screen of its own is up (the hall of heroes, walked to and used, kept the lock and hid the
  // pointer over its cards; the pointer is free for them otherwise)
  const phase = G.run?.phase;
  const inRun = G.mode === 'run' && G.player.active && (phase === 'countdown' || phase === 'fighting' || phase === 'cleared');
  const inLobby = G.mode === 'menu' && menuStowed() && !savesOpen()
    && (!VILLAGE || (!villageCardOf() && !villageMapOpen() && !heroSelectOpen() && !dialogOpen()));
  const look = v !== 'top' && !G.menuOpen && (inRun || inLobby) && !dev?.wantsCursor();
  // (a finger looks by dragging over the world: no pointer to lock, ui/touch.ts)
  wantPointerLock(look && !input.touchMode);
  crosshair.classList.toggle('hidden', v === 'top');
  lookHint.classList.toggle('hidden', !look || pointerLocked() || input.touchMode);
  updateAltCursor();
}

/** Whether Play together or how to play is up (the campfire's, the notice board's, the pause menu's links). */
const dialogOpen = (): boolean => coopOpen() || helpOpen();

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
  if (!VILLAGE && G.mode === 'menu' && !G.menuOpen && wasPressed('space')) toggleMenuStowed();
  // (the inventory, anywhere in the village: its equipment, attributes and skills; I again puts it away)
  if (VILLAGE && G.mode === 'menu' && !G.menuOpen && wasPressed('i')) openPanels(panelsOpen() ? null : 'inventory');
  // (the village's map, M again or Esc folding it away)
  if (G.mode === 'menu' && !G.menuOpen && G.arena.place === 'village' && wasPressed('m')) setVillageMap(!villageMapOpen());
  if (VILLAGE && villageMapOpen() && wasPressed('escape')) { setVillageMap(false); return; }
  // (and Play together or how to play, wherever they were opened from: from play, "esc on play together should close
  // play together, not open keys menu")
  if (VILLAGE && dialogOpen() && wasPressed('escape')) {
    openCoop(false);
    hideHelp();
    closedFrom();
    return;
  }
  // the Esc that released the mouse-look pointer already paused the game
  if (wasPressed('escape') && performance.now() - lockLostAt < 300) return;
  // (in the village, Esc puts away what an object opened before it pauses)
  if (VILLAGE && wasPressed('escape') && G.mode === 'menu' && !G.menuOpen && (panelsOpen() || villageCardOf())) {
    const card = villageCardOf();
    showVillageCard(null);
    openPanels(null);
    closedFrom(card ?? undefined);
    return;
  }
  if (wasPressed('escape')) {
    // out of the run, the summary (or the watching) has no pause
    if (G.mode === 'run' && G.run && !G.player.inRun) return;
    openPause(!G.menuOpen);
  }
  if (!G.menuOpen && wasPressed('v')) {
    nextView();
    completeStep('view');
  }
  if (G.mode !== 'run') return;
  if (!G.menuOpen && G.run?.phase === 'cleared') {
    if (wasPressed('b')) chooseBank();
    if (wasPressed('c')) chooseContinue();
  }
}

/** The next view (V). In the lobby a close view puts the panels away, so the mouse looks at once (the key press lets
 *  the pointer be taken). */
function nextView() {
  view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  if (!VILLAGE) {
    // (the panels' lobby: a close view stows the panels, and the top view brings them back)
    if (G.mode === 'menu' && !input.touchMode) toggleMenuStowed(view !== 'top');
    return;
  }
  if (G.mode === 'menu' && view !== 'top') openPanels(null);
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
  if (input.wheel && !input.mouse.overUI) {
    zoomBy(input.wheel);
    completeStep('zoom');
  }
  if (input.orbit) {
    orbitBy(input.orbit);
    completeStep('turn');
  }
  if (input.look.x || input.look.y) lookBy(input.look.x, input.look.y);

  // co-op: the partners' reports (and on a guest the host's fight) played out to the moment shown
  playSession(dt);
  if (VILLAGE) {
    // (the village: what the hero is near and walks to, and whether he may cast there)
    updateVillage(dt);
    updateGhost(G.time, dt);
    // (the village's ground a hero can stand on, for his walks to a spot, made behind it once it shows: game/village.ts
    // goTo; in the boot's task it was 120 to 176 ms of a return's loading)
    if (revealed && villageActive()) prepareWalks(HERO_RADIUS);
    updateVillageMap(dt);
    const villageOut = villageActive() && !panelsOpen() && !villageCardOf();
    updateTrainingTracker(dt, villageOut);
    updateVillageMinimap(dt, villageOut);
    updateCrestBlow(dt, revealed && G.mode === 'menu' && G.arena.place === 'village' && !heroSelectOpen(), villageMapOpen());
    // (its own stage: in the player's, a report from the hall of heroes couldn't tell the lamps and the dais's heroes
    // from the hero's own pose)
    perfLap('village');
  }
  // the player can move and cast in both the arena and the lobby (sandbox); co-op partners as reported
  G.player.reviving = G.mode === 'run' && !G.menuOpen && (isDown('e') || touchReviving());
  for (const p of G.players) p.update(dt);
  perfLap('player');
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
  perfLap('hall');
  updateGround(dt);
  perfLap('ground');
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
  const above = view === 'top' || (!VILLAGE && input.touchMode);
  const vs = heroSelectOpen() ? heroSelectShift() : above ? lobbyViewShift() : { x: 0, y: 0 };
  setViewShift(vs.x, vs.y);
  const focus = cameraFocus(dt);
  // (on the floor he stands on: the village's terrace, a stair; a free camera on the ground under it)
  updateCamera(dt, focus.pos, focus.height, focusFloor(focus));
  updateLowLife(dt);
  // through the eyes the body would fill the view (it still casts, animates and blocks): only the
  // arms and what they hold show
  const eyes = focus.player === G.player && viewMode() === 'first' && viewSettled();
  viewArms(G.player.model, eyes, G.camera);
  // (the weapons' trails in each hero's own space, the arms placed in the view first)
  updateSwingTrails();



  if (VILLAGE) G.arena.setHour(hourNow());
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

/** The music now: in the village, the day's or the dusk's by its hour; through a run the biome's battle track in each
 *  wave's fight, its lobby track everywhere else (a run's countdowns and the choice after a wave, its summary), both
 *  kept decoded through a run; none behind the loading screen. */
function musicWanted(): MusicWanted {
  const music = BIOMES[G.arena.biome].music;
  if (!revealed) return { track: null, fade: FADES.lobby, ready: [] };
  if (G.mode === 'menu') {
    // (the day's, the Thornwood's lobby track, or the dusk's, the crypt's: `biomeOfHour`; the panels' lobby's is its
    // battleground's)
    const track = VILLAGE ? BIOMES[biomeOfHour(hourNow())].music.lobby : music.lobby;
    return { track, fade: FADES.lobby, ready: [track] };
  }
  const ready = [music.lobby, music.battle];
  if (G.run?.phase === 'fighting') return { track: music.battle, fade: FADES.battle, ready };
  return { track: music.lobby, fade: FADES.lobby, ready };
}

const inputDelivery = new InputDelivery();

function recordInputDelivery(force = false): void {
  const delivery = inputDelivery.sample(performance.now(), recorder.recordingSince() !== null, force);
  if (delivery) {
    const focus = document.activeElement?.tagName.toLowerCase() ?? 'none';
    recorder.mark(`${delivery}; focus ${focus}, page ${document.hasFocus()}, fullscreen ${!!document.fullscreenElement}, keyboard lock ${keyboardLockState()}`);
  }
}

function frame(timestamp: number): void {
  lastStep = performance.now();
  recordInputDelivery();

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
