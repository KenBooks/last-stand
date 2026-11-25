// `boss`'s parts for the Ossuary Cantor's encounter after play (from Kenneth's play of wave 10: "Bells need a health
// bar", "name of boss you are fighting needs to be updated", "ghosts should be more likely to grabbing you when coming
// near the bell", and of the Cantor, "too simple attacks, too easy to just get away"):
//
// - `bars`: the Crypt's wave 10 set off as the game sets it off; the boss bar names the Cantor and says it's warded by
//   the guards still standing, whichever boss comes first in the fight's list, and each guard has its own named bar
//   over it in the world. Canary: the guards no longer told apart as guards.
// - `dive`: a guard's ghost and a hero near its bell: stood still he's seized; stepping aside as it swoops he isn't;
//   well off he's never dived at. Canary: a ghost that dives at no one.
// - `choir`: the choir's ring round the Cantor: a hero outside it hurt only once its warning is over, a tick at a time;
//   one inside never; one outside who walks in, hurt no more once in. And the Cantor casting it in its fight, then
//   floating to the ring's middle. Canary: a ring that hurts no one.
// - `graves`: the Cantor fought until its stones stand at their most: none past the most, none risen within a hero's
//   reach, every open spot of the arena still reachable from every other, an arrow at a stone meeting it, a stone
//   forced up under a hero pushing him clear, and every stone sunk once it falls. Canary: no stones, and a ring of
//   stones walling a spot in (which the reach must catch).
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { GhostsSeen } from '../../../src/entities/models/bellGhosts';
import { G } from '../../../src/state';
import { ARENA } from '../../../src/data/balance';
import { ENEMIES } from '../../../src/data/enemies';
import { BELL_WARDEN } from '../../../src/data/foes/bellwarden';
import { CANTOR } from '../../../src/data/foes/cantor';
import { WAVES } from '../../../src/data/waves';
import { fx, setFxSink } from '../../../src/entities/enemyAI';
import { propSurface } from '../../../src/fx/stuckArrows';
import { breakProp } from '../../../src/world/destructible';
import { raiseGrave, risenGraves } from '../../../src/world/risenGraves';
import { encounterRisen } from './bossGuardFilm';
import { EYE, filmedFrom } from './bossFilm';

const FPS = 60;
const fixed = (value: number, digits = 2): string => value.toFixed(digits);

/** What each part is handed: the lab, its set-up (stood in the crypt), the canary, and where to report. */
export interface ChoirMeasure {
  lab: Lab;
  stand: () => Promise<void>;
  canary: boolean;
  lines: string[];
  problems: string[];
}

/** The hero kept whole through a frame. */
function keepHero(): Record<string, never> {
  G.player.life = G.player.stats.maxLife;
  return {};
}

/** The Cantor of the fight, risen. */
function cantorUp(): Enemy {
  const cantor = G.enemies.find((foe) => foe.type === 'cantor' && foe.alive);
  if (!cantor) throw new Error('lab: boss: no Cantor stands');
  return cantor;
}

// --- bars -------------------------------------------------------------------------------------------------

/** The boss bar's words as the page shows them. */
function bossBar(): { name: string; sub: string; shown: boolean } {
  const box = document.querySelector('#target');
  return {
    name: box?.querySelector('.t-name')?.textContent ?? '',
    sub: box?.querySelector('.t-sub')?.textContent ?? '',
    shown: !!box && !box.classList.contains('hidden'),
  };
}

/** The Crypt's wave 10 as it comes: the boss bar's name and line, with the Cantor first and last in the fight's list,
 *  and each guard's bar over it. */
export async function bars({ lab, stand, canary, lines, problems }: ChoirMeasure): Promise<void> {
  await stand();
  const guards = await encounterRisen(lab);
  // (the canary: the guards no longer told apart as an encounter's guards, as the bar read them before)
  if (canary) for (const guard of guards) (guard as { guard: boolean }).guard = false;
  const cantor = cantorUp();
  await lab.step(2, keepHero);
  const first = bossBar();
  // (the Cantor moved to the end of the fight's list: a guard first, as a guest's spawns or a slow rise can leave it)
  G.enemies.splice(G.enemies.indexOf(cantor), 1);
  G.enemies.push(cantor);
  await lab.step(2, keepHero);
  const last = bossBar();
  lines.push(`bars: wave 10's boss bar reads "${first.name}" / "${first.sub}" with the Cantor first in the fight, `
    + `"${last.name}" / "${last.sub}" with a guard first`);
  for (const [read, when] of [[first, 'first'], [last, 'last']] as const) {
    if (!read.shown) problems.push(`bars: the boss bar hidden with the Cantor ${when}`);
    if (read.name !== ENEMIES.cantor.name) problems.push(`bars: with the Cantor ${when} the boss bar names "${read.name}"`);
    if (!/Warded while 2 guards stand/.test(read.sub)) problems.push(`bars: with the Cantor ${when} its line reads "${read.sub}"`);
  }
  const named = guards.map((guard) => ({ name: guard.name, bar: guard.bar, shown: guard.bar?.shown ?? false }));
  lines.push(`bars: the guards' own bars: ${named.map((each) => `"${each.name}" ${each.shown ? 'shown' : 'not shown'}`).join(', ')}`);
  for (const each of named) {
    if (!each.bar || !each.shown) problems.push(`bars: a guard ("${each.name}") has no bar shown over it`);
    if (each.name !== ENEMIES.bellwarden.asGuard!.name) problems.push(`bars: a guard is named "${each.name}"`);
  }
  guards[0].takeDamage(guards[0].life - 0.5 * guards[0].maxLife, {});
  guards[1].takeDamage(guards[1].life + 1, {});
  await lab.step(2, keepHero);
  const one = bossBar();
  lines.push(`bars: one guard fallen, the other at half its life: "${one.sub}"`);
  if (!/Warded while 1 guard stands/.test(one.sub)) problems.push(`bars: with one guard standing the line reads "${one.sub}"`);
}

// --- dive -------------------------------------------------------------------------------------------------

/** How far from a guard's middle the hero stands near it and well off (m), and how long each case is watched (s). */
const DIVE_NEAR = 3.5;
const DIVE_FAR = 9;
const DIVE_WATCH = 6;
/** How long the hero steps aside once the ghost has begun its dive (s): the warning, its swoop, and a little more. */
const DODGE_FOR = 0.75;

/** What came of a hero by a guard: when its ghost began its dive at him, when he was seized, how far he moved. */
interface DiveCase { diveAt: number; seizedAt: number; moved: number }

/** A guard stood dazed (tolling nothing) 12 m off, the hero `away` m from its middle along +z from it, watched;
 *  `dodges` steps him aside (+x) as the ghost begins its dive. */
async function diveCase(lab: Lab, stand: () => Promise<void>, away: number, dodges: boolean): Promise<DiveCase> {
  await stand();
  const hero = G.player;
  const guard = lab.spawnFoe('bellwarden', hero.pos.clone().add(new THREE.Vector3(0, 0, -12)), { wave: WAVES.bossEvery * 2, guard: true });
  await lab.until(() => guard.spawning <= 0, 300, 'dive: the guard never rose');
  guard.dazed = 1e4;
  hero.pos.set(guard.pos.x, 0, guard.pos.z + away);
  const from = hero.pos.clone();
  const ghosts = guard.model.root.userData.ghosts as GhostsSeen;
  const result: DiveCase = { diveAt: -1, seizedAt: -1, moved: 0 };
  const probe = new THREE.Vector3();
  let wasFree = false;
  await lab.step(DIVE_WATCH * FPS, (frame) => {
    keepHero();
    // (the ghost free to dive, then held while no hero is seized: its dive begun)
    const free = !!ghosts.freeAt(0, probe);
    if (result.diveAt < 0 && wasFree && !free && !hero.seized) result.diveAt = frame;
    wasFree ||= free;
    if (hero.seized && result.seizedAt < 0) result.seizedAt = frame;
    const stepping = dodges && result.diveAt >= 0 && frame - result.diveAt < DODGE_FOR * FPS;
    return stepping ? { keys: ['d'], yaw: 0 } : { yaw: 0 };
  });
  result.moved = Math.hypot(hero.pos.x - from.x, hero.pos.z - from.z);
  guard.takeDamage(guard.life + 1, {});
  return result;
}

/** A guard's ghost and a hero near its bell, stepping aside, and well off. */
export async function dive({ lab, stand, canary, lines, problems }: ChoirMeasure): Promise<void> {
  const g = BELL_WARDEN.dive;
  const near = g.near;
  if (canary) g.near = 0;
  try {
    const still = await diveCase(lab, stand, DIVE_NEAR, false);
    const dodged = await diveCase(lab, stand, DIVE_NEAR, true);
    const off = await diveCase(lab, stand, DIVE_FAR, false);
    const at = (frame: number): string => (frame < 0 ? 'never' : `${fixed(frame / FPS, 2)} s in`);
    lines.push(`dive: stood still ${DIVE_NEAR} m from a guard: dived at ${at(still.diveAt)}, seized ${at(still.seizedAt)}`);
    lines.push(`dive: stepping aside as it dives: dived at ${at(dodged.diveAt)}, moved ${fixed(dodged.moved)} m, seized ${at(dodged.seizedAt)}`);
    lines.push(`dive: ${DIVE_FAR} m off for ${DIVE_WATCH} s: dived at ${at(off.diveAt)}, seized ${at(off.seizedAt)}`);
    if (still.seizedAt < 0) problems.push(`dive: a hero stood ${DIVE_NEAR} m from a guard was never seized`);
    else if (still.seizedAt - still.diveAt < (g.warn + g.swoop) * FPS - 2) problems.push('dive: seized before its warning and swoop were over');
    if (dodged.diveAt < 0) problems.push('dive: the ghost never dived at the hero who was to step aside');
    if (dodged.seizedAt >= 0) problems.push(`dive: a hero who stepped ${fixed(dodged.moved)} m aside was seized`);
    if (off.diveAt >= 0 || off.seizedAt >= 0) problems.push(`dive: a hero ${DIVE_FAR} m off was dived at`);
  } finally {
    g.near = near;
  }
}

// --- choir ------------------------------------------------------------------------------------------------

/** What a hero met of the choir's ring: each hurt's time from the ring's start (s) and how much. */
interface RingCase { hurts: { at: number; amount: number }[] }

/** The Cantor dazed (casting nothing of its own) and its ring cast round it, the hero `from` m from the ring's middle
 *  along +z; `walksInAt` (s) moves him to `inside` m then. */
async function ringCase(lab: Lab, cantor: Enemy, from: number, walksInAt = Infinity, inside = 0): Promise<RingCase> {
  const c = CANTOR.choir, hero = G.player;
  const middle = cantor.pos.clone();
  hero.pos.set(middle.x, 0, middle.z + from);
  const warn = ENEMIES.cantor.bossKit!.attacks!.choir.warn;
  const result: RingCase = { hurts: [] };
  const takeDamage = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, source) => {
    if (amount > 0) result.hurts.push({ at: (frameAt + 1) / FPS, amount });
    return takeDamage(amount, type, source);
  };
  let frameAt = 0;
  try {
    fx('choirRing', cantor.id, middle.x, middle.z, warn);
    await lab.step(Math.round((warn + c.lasts + c.fade + 0.5) * FPS), (frame) => {
      frameAt = frame;
      if (frame === Math.round(walksInAt * FPS)) hero.pos.set(middle.x, 0, middle.z + inside);
      hero.life = hero.stats.maxLife;
      return {};
    });
  } finally {
    hero.takeDamage = takeDamage;
  }
  return result;
}

/** The choir's ring: hurt outside it only after its warning, never inside, no more once walked in; cast in its fight. */
export async function choir({ lab, stand, canary, lines, problems }: ChoirMeasure): Promise<void> {
  const c = CANTOR.choir;
  const hurt = c.hurt;
  if (canary) c.hurt = 0;
  try {
    await stand();
    const cantor = await cantorDazed(lab);
    const warn = ENEMIES.cantor.bossKit!.attacks!.choir.warn;
    const outside = await ringCase(lab, cantor, c.radius + 3);
    const inside = await ringCase(lab, cantor, c.least - 1.5);
    const walksIn = await ringCase(lab, cantor, c.radius + 3, warn + 2, c.least - 1.5);
    const first = outside.hurts[0]?.at ?? -1;
    const each = outside.hurts[0]?.amount ?? 0;
    lines.push(`choir: outside its ring (${c.radius + 3} m): hurt ${outside.hurts.length} times, the first at ${fixed(first)} s `
      + `(its warning ${warn} s), ${fixed(each, 0)} each`);
    lines.push(`choir: inside it (${c.least - 1.5} m): hurt ${inside.hurts.length} times`);
    const after = walksIn.hurts.filter((hit) => hit.at > warn + 2 + 1 / FPS).length;
    lines.push(`choir: outside, walked in ${fixed(warn + 2, 1)} s on: hurt ${walksIn.hurts.length} times, ${after} after walking in`);
    const ticks = Math.floor(c.lasts / c.tick);
    if (outside.hurts.length === 0) problems.push('choir: a hero outside the ring was never hurt');
    else {
      if (first < warn - 1 / FPS) problems.push(`choir: hurt at ${fixed(first)} s, inside its warning of ${warn} s`);
      if (Math.abs(outside.hurts.length - ticks) > 1) problems.push(`choir: hurt ${outside.hurts.length} times outside, not ${ticks}`);
      if (Math.abs(each - cantor.damage * hurt) > 1) problems.push(`choir: a tick hurt ${fixed(each, 0)}, not ${fixed(cantor.damage * hurt, 0)}`);
    }
    if (inside.hurts.length) problems.push(`choir: a hero inside the ring was hurt ${inside.hurts.length} times`);
    if (after) problems.push(`choir: hurt ${after} times after walking into the ring`);
    await castInFight(lab, cantor, lines, problems);
  } finally {
    c.hurt = hurt;
  }
}

/** The Cantor risen 12 m off the hero at wave 10, dazed. */
async function cantorDazed(lab: Lab): Promise<Enemy> {
  const hero = G.player;
  const cantor = lab.spawnFoe('cantor', hero.pos.clone().add(new THREE.Vector3(0, 0, -12)), { wave: WAVES.bossEvery * 2 });
  await lab.until(() => cantor.spawning <= 0, 300, 'choir: the Cantor never rose');
  cantor.dazed = 1e4;
  return cantor;
}

/** The Cantor let think at its second phase: it casts its ring and floats to its middle. */
async function castInFight(lab: Lab, cantor: Enemy, lines: string[], problems: string[]): Promise<void> {
  cantor.takeDamage(cantor.life - 0.5 * cantor.maxLife, {});
  cantor.dazed = 0;
  let cast: { at: number; x: number; z: number } | null = null;
  let posed = false;
  setFxSink((name, args) => {
    if (name === 'choirRing' && !cast) cast = { at: G.time, x: args[1], z: args[2] };
  });
  let nearest = Infinity;
  try {
    await lab.step(14 * FPS, () => {
      if (cantor.action?.name === 'choir') posed = true;
      if (cast && G.time - cast.at > 4) nearest = Math.min(nearest, Math.hypot(cantor.pos.x - cast.x, cantor.pos.z - cast.z));
      return keepHero();
    });
  } finally {
    setFxSink(null);
  }
  const ring = cast as { at: number } | null;
  lines.push(`choir: in its second phase it cast its ring ${ring ? 'and' : 'never;'} `
    + `${posed ? 'sang it with its arms spread' : 'took no pose for it'}, keeping within ${fixed(nearest)} m of the ring's middle`);
  if (!ring) problems.push('choir: the Cantor never cast its ring in its second phase');
  if (!posed) problems.push('choir: the Cantor cast its ring with no pose of its own');
  if (ring && !(nearest < 1.5)) problems.push(`choir: the Cantor kept ${fixed(nearest)} m from its ring's middle`);
  cantor.takeDamage(cantor.life + 1, {});
}

// --- graves -----------------------------------------------------------------------------------------------

/** How long the Cantor is fought for its stones (s), and the arrow's height (m). */
const GRAVES_FOUGHT = 70;
const ARROW_Y = 1.2;
/** The reach's grid (m a cell). */
const REACH_CELL = 0.3;

/** The cells of the arena a hero can stand in, and those reachable from the most of them: how many can't be. */
function cutOff(): number {
  const r = G.player.radius;
  const n = Math.ceil((ARENA.radius * 2) / REACH_CELL);
  const half = ARENA.radius;
  const solids = [...G.arena.obstacles.map((o) => ({ x: o.x, z: o.z, r: o.r })),
    ...G.enemies.filter((foe) => foe.alive && foe.guard).map((foe) => ({ x: foe.pos.x, z: foe.pos.z, r: foe.radius }))];
  const open = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -half + (i + 0.5) * REACH_CELL, z = -half + (j + 0.5) * REACH_CELL;
      if (Math.hypot(x, z) > ARENA.radius - r) continue;
      if (solids.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r)) continue;
      open[i * n + j] = 1;
    }
  }
  return openCells(open) - largestRegion(open, n);
}

/** How many cells are open. */
const openCells = (open: Uint8Array): number => open.reduce((sum, cell) => sum + cell, 0);

/** The most open cells joined to each other side by side. */
function largestRegion(open: Uint8Array, n: number): number {
  const seen = new Uint8Array(open.length);
  let most = 0;
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || seen[start]) continue;
    let size = 0;
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const cell = queue.pop()!;
      size++;
      const i = Math.floor(cell / n), j = cell % n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const next = a * n + b;
        if (open[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    most = Math.max(most, size);
  }
  return most;
}

/** Whether an arrow at chest height meets a stone: under its circle's top, and its drawn surface met. */
function arrowStopped(x: number, z: number): boolean {
  const o = G.arena.obstacles.find((each) => each.prop && Math.hypot(each.x - x, each.z - z) < 0.01);
  if (!o || o.h <= ARROW_Y) return false;
  // (from the arena's middle's side: where it meets the stone's circle, as a flight's step does, then its surface)
  const way = new THREE.Vector3(-x, 0, -z).normalize();
  const at = new THREE.Vector3(x, ARROW_Y, z).addScaledVector(way, o.r);
  return !!propSurface(o, at, way.clone().negate(), new THREE.Vector3());
}

/** The Cantor fought for its stones: their most, their spots, the reach, arrows, a stone under a hero, their sinking. */
export async function graves({ lab, stand, canary, lines, problems }: ChoirMeasure): Promise<void> {
  const g = CANTOR.graves;
  const perVerse = g.perVerse;
  if (canary) g.perVerse = 0;
  try {
    await stand();
    const before = cutOff();
    const cantor = await cantorDazed(lab);
    cantor.takeDamage(cantor.life - 0.5 * cantor.maxLife, {});
    cantor.dazed = 0;
    const rolled: { x: number; z: number; heroAt: number }[] = [];
    setFxSink((name, args) => {
      if (name !== 'graveStone') return;
      const nearest = Math.min(...G.players.map((p) => Math.hypot(p.pos.x - args[1], p.pos.z - args[2])));
      rolled.push({ x: args[1], z: args[2], heroAt: nearest });
    });
    let most = 0;
    try {
      await lab.step(GRAVES_FOUGHT * FPS, () => {
        most = Math.max(most, risenGraves.length);
        cantor.life = Math.max(cantor.life, 0.4 * cantor.maxLife);
        return keepHero();
      });
    } finally {
      setFxSink(null);
    }
    cantor.dazed = 1e4;
    const after = cutOff();
    const nearestHero = Math.min(...rolled.map((each) => each.heroAt));
    const stopped = risenGraves.filter((grave) => arrowStopped(grave.x, grave.z)).length;
    lines.push(`graves: ${GRAVES_FOUGHT} s of its fight: ${rolled.length} stones warned, at most ${most} standing `
      + `(its most ${g.most}), the nearest ${fixed(nearestHero)} m from a hero as it was rolled`);
    lines.push(`graves: ${after - before} open cells cut off by the stones (${before} before them, ${after} with them); `
      + `an arrow at chest height met ${stopped} of the ${risenGraves.length} standing`);
    if (most === 0) problems.push('graves: no stone rose in its fight');
    if (most > g.most) problems.push(`graves: ${most} stones stood, past its most ${g.most}`);
    if (rolled.length && nearestHero < g.fromHeroes - 0.01) problems.push(`graves: a stone rolled ${fixed(nearestHero)} m from a hero`);
    if (after > before) problems.push(`graves: the stones cut off ${after - before} open cells from the rest of the arena`);
    if (stopped < risenGraves.length) problems.push(`graves: arrows passed ${risenGraves.length - stopped} stones`);
    await underHero(lab, cantor, lines, problems);
    await walledIn(lab, canary, lines, problems);
    cantor.takeDamage(cantor.life + 1, {});
    await lab.step(Math.round((g.sink + 0.3) * FPS), keepHero);
    const left = G.arena.obstacles.filter((o) => o.prop && risenGraves.some((grave) => grave.prop === o.prop)).length;
    lines.push(`graves: it fell: ${risenGraves.length} stones left ${fixed(g.sink + 0.3, 1)} s on, ${left} of their circles`);
    if (risenGraves.length || left) problems.push('graves: its stones stood on after it fell');
  } finally {
    g.perVerse = perVerse;
  }
}

/** A stone forced up under the hero: he's pushed clear of it as it rises. */
async function underHero(lab: Lab, cantor: Enemy, lines: string[], problems: string[]): Promise<void> {
  const hero = G.player;
  const grave = risenGraves.length >= CANTOR.graves.most ? risenGraves[0] : null;
  // (a slot made for it where they stand at their most: the oldest broken, as a hero's blows break one)
  if (grave) breakProp(grave.prop);
  fx('graveStone', cantor.id, hero.pos.x, hero.pos.z, 0, 0, 0.3);
  const spot = hero.pos.clone();
  await lab.step(Math.round((0.3 + CANTOR.graves.rise + 0.3) * FPS), keepHero);
  const off = Math.hypot(hero.pos.x - spot.x, hero.pos.z - spot.z);
  const clear = CANTOR.graves.radius + hero.radius;
  lines.push(`graves: a stone forced up under the hero: he stands ${fixed(off)} m from its middle (clear at ${fixed(clear)})`);
  if (off < clear - 0.05) problems.push(`graves: the hero stood ${fixed(off)} m into a stone risen under him`);
}

/** The canary's ring of stones round a spot: the reach must find it walled in. */
async function walledIn(lab: Lab, canary: boolean, lines: string[], problems: string[]): Promise<void> {
  if (!canary) return;
  const before = cutOff();
  const round = 8, at = new THREE.Vector3(-16, 0, 16);
  for (let k = 0; k < round; k++) {
    const angle = (k / round) * Math.PI * 2;
    raiseGrave(at.x + Math.sin(angle) * 1.4, at.z + Math.cos(angle) * 1.4, angle, 0, () => undefined);
  }
  await lab.step(Math.round((CANTOR.graves.rise + 0.2) * FPS), keepHero);
  const cut = cutOff() - before;
  lines.push(`graves: canary: a ring of stones round (${at.x}, ${at.z}) cut off ${cut} open cells`);
  if (cut > 0) problems.push(`graves: canary: a ring of stones walled ${cut} cells in`);
}

// --- pictures ---------------------------------------------------------------------------------------------

/** How high over the ring's middle the view from above is taken (m). */
const ABOVE = 26;

/** The choir's ring rising, tightened and fading, from the player's own view and from above; a stone's warning and
 *  rise from the side; the arena with its stones at their most; the bars. */
export async function choirPictures({ lab, stand, lines }: ChoirMeasure): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  await stand();
  const guards = await encounterRisen(lab);
  const cantor = cantorUp();
  const hero = G.player;
  moments.push(...await nearGuard(lab, guards[0]));
  hero.seizedUntil = -1;
  const middle = cantor.pos.clone();
  hero.pos.set(middle.x, 0, middle.z + CANTOR.choir.least - 1);
  const warn = ENEMIES.cantor.bossKit!.attacks!.choir.warn;
  cantor.dazed = 1e4;
  fx('choirRing', cantor.id, middle.x, middle.z, warn);
  const shots: [number, string][] = [[warn * 0.6, 'rising'], [warn + CANTOR.choir.tighten + 1, 'tightened'],
    [warn + CANTOR.choir.lasts + CANTOR.choir.fade * 0.4, 'fading']];
  let t = 0;
  for (const [at, what] of shots) {
    await lab.step(Math.round((at - t) * FPS), keepHero);
    t = at;
    moments.push(await lab.screen(`ring ${what}`, [`the choir's ring ${what}, the player's own view`]));
    const above = middle.clone().add(new THREE.Vector3(0, ABOVE, 0.01));
    moments.push(await filmedFrom(lab, above, middle, `ring ${what} above`, `the choir's ring ${what}, from above`));
  }
  // (the wave's small foes cleared, so its stones are seen clear of them)
  for (const foe of G.enemies.filter((each) => each.alive && !each.def.boss)) foe.takeDamage(foe.life + 1, {});
  G.run!.queue.length = 0;
  const spot = middle.clone().add(new THREE.Vector3(4, 0, 4));
  const side = spot.clone().add(new THREE.Vector3(5, 0, 0)).setY(EYE);
  fx('graveStone', cantor.id, spot.x, spot.z, -Math.PI / 2, 0.04, 1.2);
  await lab.step(36, keepHero);
  moments.push(await filmedFrom(lab, side, spot.clone().setY(0.8), 'stone warned', 'a gravestone\'s warning, from the side'));
  // (its warning over at 72 frames, then a third of its rise)
  await lab.step(36 + Math.round(CANTOR.graves.rise * FPS / 3), keepHero);
  moments.push(await filmedFrom(lab, side, spot.clone().setY(0.8), 'stone rising', 'the gravestone pushing up, from the side'));
  await lab.step(40, keepHero);
  moments.push(await filmedFrom(lab, side, spot.clone().setY(0.8), 'stone risen', 'the gravestone risen'));
  await stonesAtMost(lab, cantor);
  moments.push(await filmedFrom(lab, new THREE.Vector3(0, 22, 26), new THREE.Vector3(0, 0, -2), 'stones high',
    `the arena late in the fight, its ${risenGraves.length} stones, from high over its edge`));
  // (the game's own camera back over the hero before the player's view is taken)
  await lab.step(3, keepHero);
  moments.push(await lab.screen('stones view', [`the arena late in the fight, ${risenGraves.length} stones, the player's own view`]));
  lines.push(`choirPictures: ${moments.length} moments`);
  return moments;
}

/** The hero walked up near a guard: the bars as he sees them, then its ghost's dive at him from the side, over him
 *  as it shrieks and carrying him off. */
async function nearGuard(lab: Lab, guard: Enemy): Promise<Pictured[]> {
  const hero = G.player;
  const out = new THREE.Vector3(-guard.pos.x, 0, -guard.pos.z).normalize();
  // (stood past the guard, on its far side from the middle, so the guard and its bar come into the frame's middle,
  // clear of the boss bar at the top)
  hero.pos.copy(guard.pos).addScaledVector(out, -6).setY(0);
  await lab.step(20, keepHero);
  const moments = [await lab.screen('bars', ['the boss bar and a guard\'s own bar over it, as the player sees them'])];
  hero.pos.copy(guard.pos).addScaledVector(out, 3.5).setY(0);
  const across = new THREE.Vector3(out.z, 0, -out.x);
  const side = guard.pos.clone().addScaledVector(out, 2).addScaledVector(across, 7).setY(EYE);
  const between = guard.pos.clone().addScaledVector(out, 2.5).setY(1.6);
  const warn = BELL_WARDEN.dive.warn;
  await lab.step(Math.round(warn * 0.8 * FPS), keepHero);
  moments.push(await filmedFrom(lab, side, between, 'dive warned', 'a guard\'s ghost risen over the hero, shrieking'));
  await lab.step(Math.round((warn * 0.2 + BELL_WARDEN.dive.swoop + 0.5) * FPS), keepHero);
  moments.push(await filmedFrom(lab, side, between, 'dive carried', `the hero ${hero.seized ? 'seized and' : 'not'} carried off by it`));
  await lab.step(90, keepHero);
  return moments;
}

/** Stones raised as its verses raise them until they stand at their most. */
async function stonesAtMost(lab: Lab, cantor: Enemy): Promise<void> {
  cantor.takeDamage(cantor.life - 0.5 * cantor.maxLife, {});
  cantor.dazed = 0;
  await lab.until(() => risenGraves.length >= CANTOR.graves.most, 120 * FPS, 'pictures: the stones never stood at their most', () => keepHero());
  cantor.dazed = 1e4;
  await lab.step(30, keepHero);
}
