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
import { updateTimers } from './core/timers';
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
import { initHud, showHud, buildHotbar, banner, showDecision, hideDecision, resetDecision, updateHud, renderSpoils } from './ui/hud';
import { initMenus, layOutMenuAhead, showMenu, showSummary, hideSummary, showPause, toggleMenuStowed, menuStowed, lobbyPractice, selectedWave, lobbyViewShift, renderMenu, markNew, clearOverlays } from './ui/menus';
import { initSaves, savesOpen, savesBack } from './ui/saves';
import { initHeroSelect, openHeroSelect, heroSelectOpen, heroSelectKeys, heroSelectShift, heroSelectSlotSwitched } from './ui/heroSelect';
import { updateHall } from './game/hall';
import { hideTooltip } from './ui/tooltip';
import { initUIScale } from './ui/scale';
import { releaseClickedFocus } from './ui/focus';
import { initLoadoutEditor } from './ui/loadoutEditor';
import { initTouch, updateTouch } from './ui/touch';
import { initPwa } from './ui/pwa';
import { initItemIcons } from './ui/itemIcons';
import { initPerfHud, perfBeginFrame, perfEndFrame, perfSplit, perfLap, perfClock } from './ui/perfHud';
import { initNetHud } from './ui/netHud';
import { drawBattleLog, initBattleLog } from './ui/battleLog';
import { initAltCursor, updateAltCursor } from './ui/altCursor';
import { compileTheBiome, compileTheLobby, warmLobby, warmTheRest } from './game/warmup';
import { hurry, isAllWarm, isWarming, whenWarm } from './game/warm';
import { initReadying, READYING } from './ui/readying';
import { holdQuality, initQuality, sampleQuality } from './core/quality';
import { updateLowLife } from './core/lowLife';
import { checkPrograms, markLoaded, pinPrograms, steadyShadowPrograms, watchPrograms } from './core/shaders';
import { initBiome, rollBiome } from './game/biome';
import { BIOMES, BIOME_IDS } from './data/biomes';
import { CLASSES } from './data/classes/index';
import { loadingStep, loadingDone, loadingFailed, loadingLeft, lobbyLaidOut } from './ui/loading';
import { prepareWind } from './ui/logoWind';
import { preloadTextures } from './core/textures';
import { preloadHands } from './entities/models/hands';
import { preloadStump } from './world/stump';
import { initSync } from './net/sync';
import { initSession, joinRoom, invitedRoom, sendLook, sendLobby, sendStart, sendControl, syncAway, updateSession, playSession, partnerInRun } from './net/session';
import { isCoop, isGuest, isHost, simulates } from './net/role';
import { initCoop, renderCoop, updateCoopHud, touchReviving } from './ui/coop';
import { updateScoreboard } from './ui/scoreboard';
import type { BiomeId } from './data/biomes';
import type { Profile } from './types';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;
const timer = new THREE.Timer();
let revealed = false;   // loading screen gone: the game may advance
/** how long the loading screen waits for the fight's warm-up on WebGPU (ms) */
const FIGHT_UNDER_LOADING = 6000;

async function boot() {
  // the ground, wall and bark maps are made in workers meanwhile (they'd block the page for a second), the lobby's
  // first, and the heroes' hands and the forest's stump sculpted: started before anything waits, as nothing they make
  // waits on the page
  const textures = preloadTextures(CLASSES[savedClass()].model);
  const hands = preloadHands();
  preloadStump();
  prepareWind();
  await loadingStep('Forging the arena', 0.08);
  initUIScale();
  releaseClickedFocus();
  initItemIcons();
  const { scene, renderer } = await initRenderer($('#game'));
  // (WebGL's programs: WebGPU's pipelines are none of them, core/webgpu.ts)
  if (!WEBGPU) {
    steadyShadowPrograms(renderer);
    watchPrograms(renderer);
    // (the environments' programs linked as the arena is built, each made as its biome is first shown)
    compileEnvMaps(renderer);
  }
  initInput(renderer.domElement);
  initAltCursor(renderer.domElement);
  particles.init(scene);
  initLights(scene);
  initEffects();
  initAudio();   // resumed by the first user gesture
  // (built on the maps' canvases as the workers paint them: nothing is drawn till all have come)
  G.arena = await buildArena(scene, renderer);
  initQuality();
  // the lobby's biome shown, and its programs compiled while the hero is built (game/warmup.ts)
  initBiome();
  compileTheBiome();
  // (the lobby's panels rastered under the loading screen while the hero is built: ui/menus.ts)
  layOutMenuAhead();

  await loadingStep('Summoning the hero', 0.35);
  await hands;
  // (the heroes' engraving is painted over the steel's map as they're built)
  await textures.ready('steel');
  G.profile = loadProfile(savedClass());
  G.player = new Player(G.profile.classId, G.profile.equipped);
  G.players = [G.player];
  // (what the lobby can do compiled with him, before its page is laid out: game/warmup.ts)
  compileTheLobby();

  initHud();
  initTouch();
  initPerfHud(renderer);
  initNetHud();
  initBattleLog();
  buildHotbar(G.player);
  initRun({ banner, showDecision, hideDecision, resetDecision, showSummary });
  // (the lobby shows before the fight's programs are warm: pressed early, what needs them goes ahead once they are)
  initMenus({ start: whenWarm(['fight'], start, READYING.fight), toMenu, resume, abandon, profileChanged, changeHero, summaryDone, lobbyChanged: sendLobbyChoice });
  initHeroSelect({ choose: chooseHero, closed: heroSelectClosed });
  initSaves({ use: whenWarm(['fight', 'heroes'], switchSaveSlot, READYING.slot) });
  initReadying();
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
  if (import.meta.env.DEV) Object.assign(window, { __G: G, __dev: { spawnEnemy, THREE, allWarm: isAllWarm, hurry } });

  await loadingStep('Conjuring spells', 0.55);
  enterMenu();
  // a first visit opens on the hero selection screen, no hero chosen yet: the logo's exit gathers into its logo
  const firstVisit = !hasSavedClass();
  if (!firstVisit) lobbyLaidOut();
  // the lobby's shaders compiled before it shows, the fight's and the other heroes' behind it (game/warmup.ts); on a
  // first visit every hero is shown on the screen it opens on: theirs warmed with the lobby's, under the loading screen
  if (firstVisit) await loadingStep('Gathering the heroes', 0.6);
  await warmLobby(firstVisit);
  const { fight: fightWarmed, all: rest } = warmTheRest(loadingLeft);
  if (firstVisit) {
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
    if (WEBGPU) pipelinesAtOnceFromNow();
    setTimeout(() => checkPrograms(renderer));
    void rest.then(() => checkPrograms(renderer));
    // the overlays down the left (performance, network, the battle log) once the loading screen is gone (_perf.scss)
    void loadingLeft.then(() => $('#diag').classList.remove('booting'));
    // an invite link: straight into the friend's room
    const room = invitedRoom();
    if (room) whenWarm(['fight', 'heroes'], (code: string) => void joinRoom(code), READYING.coop)(room);
  });
  requestAnimationFrame(frame);
}

// --- flow -------------------------------------------------------------------------
function enterMenu() {
  G.mode = 'menu';
  G.paused = G.menuOpen = G.player.idle = false;
  releaseInput();
  runOver = false;
  showHud(false);
  showPause(false);
  hideSummary();
  showMenu(true);
  G.arena.setCalm(1);
  syncAway();
  for (const p of G.players) p.reset();
  G.player.sandbox = true;   // lobby: walk around and try skills freely
  practising = false;
  setZoom(CAMERA.lobbyZoom);
  spawnDummies();
  renderCoop();
}

function spawnDummies() {
  clearEnemies();
  for (const [x, z] of LOBBY.dummies) spawnEnemy('dummy', new THREE.Vector3(x, 0, z));
}

/** The lobby's start: solo, or the host (whose guests come along). A guest waits for the host. */
function start() {
  if (isGuest() || (isHost() && partnerInRun())) return;
  rollBiome();
  // (the props a run shapes anew: its columns, its stumps; the guests' built from the same)
  const seed = Math.floor(Math.random() * 2 ** 31);
  sendStart(G.arena.biome, selectedWave(), seed);
  beginRun(selectedWave(), seed);
}

/** A guest: the host started a run. */
function guestStart(biome: BiomeId, wave: number, seed: number) {
  G.arena.setBiome(biome);
  beginRun(wave, seed);
}

function beginRun(wave: number, seed: number) {
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
  startRun(wave);
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

function toMenu() {
  abandonRun();
  enterMenu();
}

/** The host's battleground and starting wave, shown in the guests' lobbies. */
function sendLobbyChoice() {
  if (!isGuest()) sendLobby(G.arena.biome, selectedWave());
}

/** The summary closed: back to the lobby, or (in co-op, with the run still on) watch the others. */
function summaryDone() {
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
  G.menuOpen = open;
  G.paused = open && !isCoop();
  G.player.idle = open && isCoop();
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
function changeHero() {
  if (G.mode !== 'menu' || heroSelectOpen()) return;
  showMenu(false);
  openHeroSelect(G.player.cls.id);
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
  G.player = new Player(id, G.profile.equipped);
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
  const look = v !== 'top' && !G.menuOpen && (inRun || inLobby);
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
  // the hero selection screen takes the keys (ui/heroSelect.ts)
  if (heroSelectOpen()) { heroSelectKeys(); return; }
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

/** Who the camera follows: the local player, or once out of a co-op run, a partner still in it. */
function focusPlayer() {
  if (G.mode !== 'run' || G.player.inRun) return G.player;
  return G.players.find((p) => !p.local && p.inRun) ?? G.player;
}

/** The run is over for everyone: once the summary is closed, back to the lobby. */
let runOver = false;
function checkRunOver() {
  const r = G.run;
  if (!r || G.mode !== 'run') return;
  // the host (or solo) ends the run once nobody is left in it
  if (!isGuest() && r.phase !== 'over' && !G.players.some((p) => p.inRun)) endRun();
  if (r.phase !== 'over' || runOver || !r.summarized || !$('#summary').classList.contains('hidden')) return;
  runOver = true;
  banner('The run is over', 'Back to the sanctuary');
  setTimeout(() => { if (G.mode === 'run' && runOver) toMenu(); }, 2500);
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
  updateGround(dt);
  perfLap('player');
  updateProjectiles(dt); perfLap('projectiles');
  // enemies in the arena, training dummies in the lobby
  if (G.mode === 'run') { updateRun(dt); checkRunOver(); }
  updateEnemies(dt);
  separateEnemies(!simulates());
  G.player.showAim(dt);
  perfLap('enemies');
  updateSession(dt, G.player.reviving);
  syncPractice();
  if (G.mode === 'run') {
    updateHud();
    updateCoopHud();
    perfLap('hud');
  } else if (practising) {
    updateHud();
  }
  updateScoreboard(dt);
  // (top-down only: a close view shifted off its middle would leave the crosshair off the aim)
  const vs = heroSelectOpen() ? heroSelectShift() : view === 'top' || input.touchMode ? lobbyViewShift() : { x: 0, y: 0 };
  setViewShift(vs.x, vs.y);
  const focus = focusPlayer();
  updateCamera(dt, focus.pos, focus.model.height);
  updateLowLife(dt);
  // through the eyes the body would fill the view (it still casts, animates and blocks): only the
  // arms and what they hold show
  const eyes = focus === G.player && viewMode() === 'first' && viewSettled();
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
  requestAnimationFrame(frame);
  lastStep = performance.now();

  perfBeginFrame(timestamp);
  timer.update(timestamp);
  const rawDt = timer.getDelta();
  const dt = Math.min(rawDt, 1 / 20);
  if (revealed) { updateTouch(dt); handleGlobalKeys(); syncView(); }
  updateMusic(dt, musicWanted());
  const t0 = perfClock.now();
  if (!G.paused && revealed) {
    if (isWarming()) holdQuality();
    else sampleQuality(rawDt);
    G.dt = dt;
    G.time += dt;
    update(dt);
  }
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
