// Run controller: waves, scoring, loot rolls and the per-wave
// "bank your loot or push on" decision. Dying forfeits the unbanked bag.
// Co-op: the host's game runs all of this for the party and the guests follow its reports
// (net/sync). Each player keeps a bag of their own. After a wave everyone decides: Bank leaves
// the run at once, and the next wave starts once all who stay chose Continue. A player at 0
// health goes down until a teammate raises them (or they bleed out); with nobody left standing
// the run is lost for everyone still in it.
import * as THREE from 'three';
import { G } from '../state';
import { RUN, COOP, partyScale } from '../data/balance';
import { WAVES, LOOT } from '../data/waves';
import { ENEMIES, HERO, SCALING } from '../data/enemies';
import { BIOMES } from '../data/biomes';
import { spawnEnemy } from '../entities/spawner';
import { inObstacle, resolveWorld } from '../world/collision';
import { clearEnemies, forgetFrustum, RISE_TIME } from '../entities/enemy';
import { forgetFields } from '../world/navigation';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { clearLights } from '../fx/lights';
import { particles, col } from '../fx/particles';

import { rollDrop, rarityOf, rarityIndex } from '../loot/items';
import { pr499WaveReward } from '../loot/pr499Gear'; // PR 499's test gear: to remove, unbind these lines only
import { bankItems, saveProfile } from '../loot/profile';
import { clearFloaters, floatText } from '../ui/floaters';
import { sfx } from '../core/audio';
import { schedule, clearTimers } from '../core/timers';
import { on, emit } from '../events';
import { isCoop, isGuest, nearestPlayer } from '../net/role';
import { creditRaise, resetMine } from './stats';
import { rand, randInt, shuffle, weighted } from '../util';
import type { EnemyId } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { EnemyDef, Item } from '../types';
import type { Portal } from '../world/props';

interface SpawnUnit { type: EnemyId; hero: boolean }

/** The party's run: counting down to a wave, fighting it, deciding after it, or over for everyone. */
export type RunPhase = 'countdown' | 'fighting' | 'cleared' | 'over';

export interface RunState {
  /** Rehearsal only: harmless foes, no rewards or saved records. */
  training: boolean;
  wave: number;
  phase: RunPhase;
  /** countdown seconds left (phase 'countdown') */
  timer: number;
  waveTime: number;
  /** the local player's unbanked spoils */
  bag: Item[];
  score: number;
  multiplier: number;
  multKills: number;
  multTimer: number;
  kills: number;
  queue: SpawnUnit[][];
  nextGroupT: number;
  /** the packs of foes each gate has sent this wave (by the arena's portals), and how many foes have come */
  packs: number[];
  dealt: number;
  /** the wave's boss while it is still to come, and the seconds it comes in once the wave's first group has come */
  boss: SpawnUnit | null;
  bossT: number;
  pending: number;
  remaining: number;
  /** players in the run as the wave started (it sizes the wave), and who chose Continue after it */
  party: number;
  votes: Set<number>;
  /** the local player's summary has been shown (the lobby waits for it to be closed) */
  summarized: boolean;
  /** the local player's summary was shown with the run going on for others: it goes with the run's end
   *  (main.ts `checkRunOver`) */
  watched: boolean;
  /** game time at the start, and whether the run's time and kills went into the records yet */
  started: number;
  tallied: boolean;
}

export interface RunSummary {
  training?: boolean;
  outcome: 'dead' | 'banked'; wave: number; score: number; kills: number; bag: Item[]; lost?: Item[]; replaced?: Item[]; note?: string;
  /** shown with the run still going on for others (co-op): its button watches them */
  watch?: boolean;
}

/** UI callbacks the run controller drives. */
export interface RunUI {
  banner(title: string, sub?: string): void;
  showDecision(): void;
  hideDecision(): void;
  resetDecision(): void;
  showSummary(s: RunSummary): void;
}

/** What the host reports to co-op guests as the run goes (set by net/sync; no-ops solo). */
export const runHooks = {
  banner(_title: string, _sub: string): void {},
  cleared(): void {},
  nextWave(): void {},
  loot(_p: Player, _item: Item): void {},
  out(_p: Player, _kind: 'banked' | 'dead'): void {},
  down(_p: Player): void {},
  raised(_p: Player): void {},
  over(): void {},
};

let ui: RunUI;

export function initRun(uiHooks: RunUI): void {
  ui = uiHooks;
  on('enemyKilled', onEnemyKilled);
  on('playerDied', onPlayerDied);
}

function cleanupWorld(): void {
  ui.resetDecision();
  clearEnemies();
  clearProjectiles();
  clearEffects();
  clearLights();
  clearFloaters();
  particles.clear();
  clearTimers();
  forgetFields();
  forgetFrustum();
}

/** Start at `wave`: banked waves in the arena, reached waves in Training grounds.
 *  A co-op guest starts its side of the host's run the same way, and then follows it. */
export function startRun(wave = 1, training = false): void {
  cleanupWorld();
  resetMine();
  for (const p of G.players) {
    if (p.local) p.recomputeStats(G.profile.equipped);
    p.reset();
  }
  G.run = {
    training, wave, phase: 'countdown', timer: RUN.countdown, waveTime: 0,
    bag: [], score: 0, multiplier: 1, multKills: 0, multTimer: 0, kills: 0,
    queue: [], nextGroupT: 0, packs: [], dealt: 0, boss: null, bossT: 0,
    pending: 0, remaining: 0, party: 1, votes: new Set(), summarized: false, watched: false,
    started: G.time, tallied: false,
  };
  if (!training) {
    G.profile.records.runs++;
    rememberReached();
  }
  G.arena.setCalm(0);
  const biome = BIOMES[G.arena.biome];
  ui.banner(`${training ? 'Training · ' : ''}Wave ${wave}`, training
    ? 'Holographic enemies · No damage, loot or score'
    : wave % WAVES.bossEvery === 0 ? biome.bossBanner : `${biome.title} · Survive the onslaught`);
}

export function abandonRun(): void {
  const r = G.run;
  if (!r) return;
  // abandoned from the pause menu: its time and kills still count
  if (!r.training && !r.tallied) { tally(r); saveProfile(G.profile); }
  G.run = null;
  for (const p of G.players) p.stopChannel();
  cleanupWorld();
}

/** The run's time and kills go into the records, once, however it ends for the local player. */
function tally(r: RunState): void {
  r.tallied = true;
  if (r.training) return;
  const rec = G.profile.records;
  rec.kills = (rec.kills ?? 0) + r.kills;
  rec.time = Math.round((rec.time ?? 0) + G.time - r.started);
}

/** Save a wave as soon as it is attempted, including a wave the player dies on. Never in training. */
function rememberReached(): void {
  const r = G.run!;
  if (r.training || !G.player.active) return;
  const reached = G.profile.records.bestReached;
  reached[G.arena.biome] = Math.max(reached[G.arena.biome] ?? 0, r.wave);
  saveProfile(G.profile);
}

/** The players still in the run (standing or downed). */
const inRun = (): Player[] => G.players.filter((p) => p.inRun);

/** The wave's foes but its boss (`bossOf`), in groups. */
function buildWave(w: number): SpawnUnit[][] {
  const r = G.run!;
  const pool = BIOMES[G.arena.biome].pool(w);
  // a party meets more foes (and more life on each: `spawnGroup`)
  let budget = WAVES.budget(w) * partyScale(r.party).foes;
  const units: SpawnUnit[] = [];
  if (w % WAVES.bossEvery === 0) budget *= 0.55;
  while (budget > 0) {
    const type = weighted(pool);
    budget -= ENEMIES[type].cost;
    // heavies (slammers) become heroes more often
    units.push({ type, hero: Math.random() < WAVES.heroChance(w) * (ENEMIES[type].ai === 'slam' ? 0.5 : 0.25) });
  }
  // split into groups
  const groups = WAVES.groups(w);
  const out: SpawnUnit[][] = Array.from({ length: groups }, () => []);
  units.forEach((u, i) => out[i % groups].push(u));
  return out.filter((g) => g.length);
}

/** The wave's boss, on a boss wave. */
function bossOf(w: number): SpawnUnit | null {
  return w % WAVES.bossEvery === 0 ? { type: BIOMES[G.arena.biome].boss, hero: false } : null;
}

function startWave(): void {
  const r = G.run!;
  r.phase = 'fighting';
  r.waveTime = 0;
  r.party = Math.max(1, inRun().length);
  r.queue = buildWave(r.wave);
  r.nextGroupT = 0;
  r.boss = bossOf(r.wave);
  r.bossT = 0;
  r.packs = G.arena.portals.map(() => 0);
  r.dealt = 0;
  sfx.waveStart();
  emit('waveStarted', r.wave);
}

/** how many spots a foe's rise is drawn from before it takes the last, pushed out of what it's in */
const RISE_TRIES = 8;

/**
 * Where a foe of `radius` rises by `portal`: 0.5 to 3.5 m into the arena and up to 3 m to either side of the gate's
 * middle, a boss 2 m further in and in the middle (it's nearly as wide as the gate), drawn again while the spot is in
 * a prop: risen inside one, it was shoved out in a frame as it first moved (by the Thornwood's west gate, out of a
 * log, and pushed out of one of the log's circles a foe can land in the next).
 */
function riseSpot(portal: Portal, radius: number, boss: boolean): THREE.Vector3 {
  const side = new THREE.Vector3(-portal.dir.z, 0, portal.dir.x);
  const pos = new THREE.Vector3();
  for (let i = 0; i < RISE_TRIES; i++) {
    pos.copy(portal.pos)
      .addScaledVector(portal.dir, rand(0.5, 3.5) + (boss ? 2 : 0))
      .addScaledVector(side, boss ? 0 : rand(-3, 3));
    if (!inObstacle(pos, radius)) break;
  }
  resolveWorld(pos, radius);
  return pos;
}

/** the seconds between two foes of a group coming */
const SPAWN_GAP = 0.09;

/**
 * How long a foe of `def` rising at `pos` in wave `w` takes to come within its reach of the nearest player (s): its
 * rise, then a straight walk at its wave's pace (each foe's own is a few percent either way, and a prop in the way
 * makes a walk longer).
 */
function reachIn(def: EnemyDef, pos: THREE.Vector3, w: number): number {
  const p = nearestPlayer(pos.x, pos.z);
  if (!p) return RISE_TIME;
  const walk = Math.max(0, Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) - def.range - p.radius);
  return RISE_TIME + walk / (def.speed * SCALING.speed(w));
}

/**
 * When the boss comes after the wave's first group came (s): as that group's foes would reach the players on
 * average (`reaches`, each from the group's coming), give or take `bossJitter`, never before the last of them is up
 * (`risen`).
 */
function bossAt(reaches: number[], risen: number): number {
  const mean = reaches.reduce((sum, t) => sum + t, 0) / reaches.length;
  return Math.max(risen, mean + rand(-WAVES.bossJitter, WAVES.bossJitter));
}

/** `count` foes cut at random into `packs` packs of one foe at least: each pack's size. */
function packSizes(count: number, packs: number): number[] {
  const cuts = shuffle(Array.from({ length: count - 1 }, (_, i) => i + 1)).slice(0, packs - 1).sort((a, b) => a - b);
  return [...cuts, count].map((cut, i, all) => cut - (i ? all[i - 1] : 0));
}

/** `count` gates for a group: those the wave has sent fewest packs by first, at random among equals. */
function gatesFor(r: RunState, count: number): number[] {
  const order = shuffle(G.arena.portals.map((_, i) => i));
  return order.sort((a, b) => r.packs[a] - r.packs[b]).slice(0, count);
}

/**
 * A group comes by a gate whole, or split over two, three or four, at random, in packs of random sizes, each pack
 * rising at its gate as the others do; the gates the wave has used least first, so none stands idle for a wave
 * (picked at random, two a group, often one twice, two or three were; dealt round all four one foe a gate, every group
 * came alike). The boss alone comes by any gate.
 */
function spawnGroup(group: SpawnUnit[]): void {
  const portals = G.arena.portals;
  const r = G.run!;
  // (the wave's first group sets the boss's time)
  const first = r.dealt === 0 && r.boss !== null;
  const lone = group.length === 1 && !!ENEMIES[group[0].type].boss;
  const sizes = lone ? [1] : packSizes(group.length, randInt(1, Math.min(portals.length, group.length)));
  const gates = lone ? [randInt(0, portals.length - 1)] : gatesFor(r, sizes.length);
  const reaches: number[] = [];
  const party = partyScale(r.party);
  r.pending += group.length;
  let next = 0;
  sizes.forEach((size, pack) => {
    const portal = portals[gates[pack]];
    r.packs[gates[pack]]++;
    for (let j = 0; j < size; j++) {
      const u = group[next++];
      const def = ENEMIES[u.type];
      portal.pulse();
      const pos = riseSpot(portal, def.radius * (u.hero ? HERO.scale : 1), !!def.boss);
      if (first) reaches.push(j * SPAWN_GAP + reachIn(def, pos, r.wave));
      schedule(j * SPAWN_GAP, () => {
        r.pending--;
        if (G.run === r && r.phase === 'fighting') spawnEnemy(u.type, pos, { wave: r.wave, hero: u.hero, lifeMult: def.boss ? party.boss : party.life });
      });
    }
  });
  r.dealt += group.length;
  if (first) r.bossT = bossAt(reaches, (Math.max(...sizes) - 1) * SPAWN_GAP + RISE_TIME);
}

/** The host's (or solo) run: a guest's follows the host's reports instead. */
export function updateRun(dt: number): void {
  const r = G.run;
  if (!r || isGuest()) return;
  // multiplier decays without kills
  if (r.multiplier > 1) {
    r.multTimer += dt;
    if (r.multTimer > RUN.multiplierDecay) { r.multiplier--; r.multTimer = 0; r.multKills = 0; }
  }
  if (r.phase !== 'over') updateDowned(dt);

  if (r.phase === 'countdown') {
    r.timer -= dt;
    if (r.timer <= 0) startWave();
  } else if (r.phase === 'fighting') {
    r.waveTime += dt;
    const alive = G.enemies.filter((e) => e.alive).length;
    r.nextGroupT -= dt;
    if (r.queue.length && (r.nextGroupT <= 0 || alive === 0) && alive < WAVES.maxAlive(r.wave, partyScale(r.party).alive)) {
      spawnGroup(r.queue.shift()!);
      r.nextGroupT = WAVES.groupInterval;
    }
    // the boss once the wave's first group has come, at its time (`bossAt`), or at once when the rest of the wave has
    // all come and none of it stands
    if (r.boss && r.dealt > 0) {
      r.bossT -= dt;
      if (r.bossT <= 0 || (!r.queue.length && alive + r.pending === 0)) { spawnGroup([r.boss]); r.boss = null; }
    }
    r.remaining = alive + r.pending + r.queue.reduce((n, g) => n + g.length, 0) + (r.boss ? 1 : 0);
    if (r.remaining === 0) waveCleared();
  } else if (r.phase === 'cleared') {
    // on to the next wave once everyone still standing chose to (a partner leaving counts too)
    const staying = G.players.filter((q) => q.active);
    if (staying.length && staying.every((q) => r.votes.has(q.slot))) nextWave();
  }
}

/** Downed players bleed out, unless a teammate stands by them holding the revive key: while one does, their clock
 *  stops. (The guests are told each one's clock and revive in the snapshots.) */
function updateDowned(dt: number): void {
  for (const p of G.players) {
    if (!p.downed || !p.inRun) continue;
    if (p.bleed <= 0) { playerOut(p, 'dead'); continue; }
    const helper = G.players.some((q) => q.active && q.reviving && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < COOP.reviveRange);
    if (!helper) p.bleed = Math.max(0, p.bleed - dt);
    p.revive = helper ? p.revive + dt / COOP.reviveTime : Math.max(0, p.revive - dt / COOP.reviveTime);
    if (p.revive >= 1) {
      p.raise();
      creditRaise(p);
      floatText(p.pos.x, 2.6, p.pos.z, 'Revived', 'info', '#ffe6a0');
      runHooks.raised(p);
    }
  }
}

function waveCleared(): void {
  const r = G.run!;
  r.phase = 'cleared';
  r.votes.clear();
  // down as the wave ends: no one comes back for you
  for (const p of G.players) if (p.downed && p.inRun) playerOut(p, 'dead');
  // the wave's reward, counted in one by one, for everyone still standing
  const n = r.training ? 0 : LOOT.waveRewards(r.wave);
  for (const p of G.players) {
    if (!p.active) continue;
    for (let i = 0; i < n; i++) schedule(0.25 + i * 0.16, () => {
      if (!(G.run === r && p.active)) return;
      const pr499 = pr499WaveReward(i, p.cls, r.wave); // PR 499's test gear
      giveLoot(p, pr499 ?? rollDrop(p.cls, r.wave, LOOT.waveRewardBonus(r.wave)));
    });
  }
  G.arena.setCalm(1);
  runHooks.cleared();
  showCleared();
  emit('waveCleared', r.wave);
}

/** The wave's end here: the records, and the choice for a player still in. */
export function showCleared(): void {
  const r = G.run!;
  const rec = G.profile.records;
  if (!r.training) {
    if (G.player.active) rec.bestWave = Math.max(rec.bestWave, r.wave);
    saveProfile(G.profile);
  }
  sfx.waveClear();
  // a player still in gets the choice, which grows out of the wave badge and says it all
  if (G.player.active) ui.showDecision();
  else ui.banner(`Wave ${r.wave} Cleared`);
}

/** The local player chose Continue: the next wave starts once everyone still in has. */
export function continueRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active || r.votes.has(G.player.slot)) return;
  vote(G.player);
}

/** A player's Continue (the host counts them all). */
export function vote(p: Player): void {
  G.run!.votes.add(p.slot);
  if (G.player.active) ui.showDecision();   // shows who is still deciding
}

function nextWave(): void {
  const r = G.run!;
  for (const p of G.players) {
    if (!p.active) continue;
    p.heal(p.stats.maxLife * RUN.healOnContinue);
  }
  if (!r.training) r.wave++; // training repeats the selected wave; it cannot unlock later ones
  r.phase = 'countdown';
  r.timer = RUN.countdown;
  runHooks.nextWave();
  startNextWave();
}

/** The next wave's countdown here (a guest's on the host's word). */
export function startNextWave(): void {
  const r = G.run!;
  rememberReached();
  const p = G.player;
  if (p.active) p.energy = Math.min(p.stats.maxEnergy, p.energy + p.stats.maxEnergy * RUN.energyOnContinue);
  r.votes.clear();
  G.arena.setCalm(0);
  ui.hideDecision();
  const boss = r.wave % WAVES.bossEvery === 0;
  ui.banner(`${r.training ? 'Training · ' : ''}Wave ${r.wave}`, r.training
    ? 'Holographic enemies · No damage, loot or score'
    : boss ? BIOMES[G.arena.biome].bossBanner : 'Hold the line');
}

/** The local player banks: out of the run with the spoils (the others may carry on). */
export function bankRun(): void {
  const r = G.run;
  if (!r || r.phase !== 'cleared' || !G.player.active) return;
  playerOut(G.player, 'banked');
}

function onPlayerDied(p: Player): void {
  const r = G.run;
  if (!r || r.phase === 'over') return;
  // a guest's own fall, as the host will rule it (it says so a moment later, and what else follows)
  if (isGuest()) {
    if (p.local && G.players.some((q) => q !== p && q.active)) p.goDown();
    return;
  }
  // with a teammate still standing, a fall is a chance to be raised
  if (isCoop() && G.players.some((q) => q !== p && q.active)) {
    p.goDown();
    runHooks.down(p);
    return;
  }
  // nobody left standing: the run is lost for everyone still in it
  for (const q of G.players) if (q.inRun) playerOut(q, 'dead');
}

/**
 * A player leaves the run for good: banked with their spoils, or dead and without them. The run is
 * over once nobody is left in it; until then those out watch the rest.
 */
export function playerOut(p: Player, kind: 'banked' | 'dead'): void {
  const r = G.run;
  if (!r || p.out) return;
  if (p.downed) p.bleedOut();
  p.out = kind;
  p.standDown();
  if (kind === 'banked') bankedAway(p);
  if (p.local) finishLocal(kind);
  runHooks.out(p, kind);
  if (!isGuest() && !inRun().length) endRun();
}


/** A banked player steps out of the arena in a shimmer. */
export function bankedAway(p: Player): void {
  for (let i = 0; i < 30; i++) {
    particles.glow.spawn({
      x: p.pos.x + rand(-0.5, 0.5), y: rand(0, 1.8), z: p.pos.z + rand(-0.5, 0.5), vy: rand(1, 3),
      life: rand(0.5, 0.9), size: rand(0.08, 0.2), sizeEnd: 0, color: col(0xffe0a0, 2.5), colorEnd: col(0xff9a40, 0.4),
    });
  }
  p.show(false);
}

/** Nobody left in the run. */
export function endRun(): void {
  const r = G.run;
  if (!r || r.phase === 'over') return;
  r.phase = 'over';
  ui.hideDecision();
  runHooks.over();
}

/** The local player's run ends: the records, the bank (or the loss) and the summary. */
function finishLocal(kind: 'banked' | 'dead', note?: string): void {
  const r = G.run!;
  const rec = G.profile.records;
  ui.hideDecision();
  let extra: { lost?: Item[]; replaced?: Item[] } = {};
  if (!r.training && kind === 'banked') {
    // banking unlocks this wave as a start; dying does not
    const best = rec.bestBanked;
    best[G.arena.biome] = Math.max(best[G.arena.biome] ?? 0, r.wave);
    extra = bankItems(G.profile, r.bag);
  }
  if (!r.training) {
    rec.bestScore = Math.max(rec.bestScore, Math.round(r.score));
    if (!r.tallied) tally(r);
    saveProfile(G.profile);
  }
  const show = () => {
    r.summarized = true;
    r.watched = r.phase !== 'over' && G.players.some((p) => !p.local && p.inRun);
    ui.showSummary({ training: r.training, outcome: kind, wave: r.wave, score: Math.round(r.score), kills: r.kills, bag: r.bag.slice(), ...extra, note, watch: r.watched });
  };

  // the fall plays out before the summary
  if (kind === 'dead') schedule(2.6, () => { if (G.run === r) show(); });
  else show();
}

/** Co-op guest: the host left mid-run. What was found is kept, as if banked. */
export function hostLeft(): void {
  const r = G.run;
  if (!r) return;
  r.phase = 'over';
  if (!G.player.out) {
    G.player.out = 'banked';
    finishLocal('banked', r.training ? 'The host left: training ended.' : 'The host left the game: your spoils are safe.');
  }
}


/** Co-op guest: the host says the local player is out (bled out, or the party fell). */
export function localOut(kind: 'banked' | 'dead'): void {
  if (!G.run || G.player.out) return;
  if (G.player.downed) G.player.bleedOut();
  G.player.out = kind;
  G.player.standDown();
  finishLocal(kind);
}

function onEnemyKilled(e: Enemy): void {
  const r = G.run;
  if (!r || isGuest()) return;
  if (r.training) return;
  r.kills++;
  r.score += e.score * RUN.scorePerKill * r.multiplier;
  r.multTimer = 0;
  if (++r.multKills >= RUN.killsPerMultiplier && r.multiplier < RUN.multiplierMax) { r.multiplier++; r.multKills = 0; }
  // a boss pays everyone standing; any other kill pays whoever landed it
  if (e.boss) {
    for (const p of G.players) {
      if (!p.active) continue;
      for (let i = 0; i < LOOT.bossDrops; i++) schedule(i * 0.25, () => { if (G.run === r && p.active) giveLoot(p, rollDrop(p.cls, r.wave + 1, 0.8)); });
    }
    return;
  }
  const p = e.killer?.active ? e.killer : G.players.find((q) => q.active);
  if (!p) return;
  if (e.hero ? Math.random() < LOOT.heroDropChance : Math.random() < LOOT.killDropChance) giveLoot(p, rollDrop(p.cls, r.wave, e.hero ? 0.4 : 0));
}

/** Loot for a player: into our bag, or sent to a partner's game for theirs. */
function giveLoot(p: Player, item: Item): void {
  if (p.local) gainLoot(item);
  else runHooks.loot(p, item);
}

/**
 * Loot goes straight into the run's bag, with nothing on the floor. Only its rarity shows (a
 * "+1 Epic" over the player and the HUD's counts) until the run is banked.
 */
export function gainLoot(item: Item): void {
  const r = G.run;
  if (!r || r.training || G.player.out) return;
  r.bag.push(item);
  const info = rarityOf(item.rarity), p = G.player.pos;
  floatText(p.x, 2.7, p.z, `+1 ${info.name}`, 'info', info.color);
  sfx.loot(rarityIndex(item.rarity));
  emit('lootGained', item);
}
