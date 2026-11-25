// The Ossuary Cantor's encounter in `lab boss` (boss.ts runs these parts): the Crypt's wave 10, the Cantor and its two
// Bell-Warden guards (entities/cantor.ts, entities/bellWarden.ts). The Bell-Warden is the Cantor's guard alone: no
// part stands one up as a boss of its own.
//
// - `toll`: a guard left to toll at the hero near it (stunned, for its time, its warning first), further off (reached
//   but faded: not stunned), and with a warrior's shield raised towards it (not stunned: `--class warrior --gear
//   shield`), its ghost held off him.
// - `swing`: a guard's bell through a toll, as a pendulum about its crown, no jolt, no turn (bossSwing.ts).
// - `encounter`: the encounter as it comes, the Cantor and its two guards fighting the hero: warded (a quarter of the
//   damage) while a guard stands and not after; each of its casts ringed on the floor before its hands burst; no two
//   bosses' warned hits closer than its beat; its heart bared after a cast once the guards are down; the guards a
//   lesser bell's size, rising at their two spots (bossGuardSpots.ts), hovering and standing where they rose, raising
//   their dead in turn; then `bars`, `dive`, `choir` and `graves` (bossChoir.ts).
// - `compiles`: every effect the encounter draws, drawn: no program compiled meanwhile.
// - `encounterTtk` (from boss.ts's `ttk`): the time the encounter takes the hero at wave 10.
// - For the eye, asked for alone: `encounterPictures`, `cantorLook` (bossCantor.ts), `film` (a guard's toll and the
//   guards as wave 10 sends them, bossFilm.ts and bossGuardFilm.ts), `choirPictures`; and `frames`, the frame's time
//   through each of the Crypt's boss waves (bossFrames.ts).
//
// `--canary` plants a fault each part must catch: a toll that stuns no one near it, a shield that stops nothing, a ward
// that wards nothing, guards that drift or rise at the gates, a swing four times as wide, a program compiled.
import * as THREE from 'three';
import { filmedFrom, bellFilm } from './bossFilm';
import { bossFrames } from './bossFrames';
import { guardFilm } from './bossGuardFilm';
import { bellSwing } from './bossSwing';
import { cantorLook } from './bossCantor';
import { bars, choir, choirPictures, dive, graves, type ChoirMeasure } from './bossChoir';
import { guardSpots } from './bossGuardSpots';
import { pressing } from './cast';
import { SPOT, clearSpot, fixed, standIn, type BossOptions } from './boss';
import type { Lab, Pictured, ViewName } from './lab';
import { putAway } from '../../../src/perf/consent';
import type { Enemy } from '../../../src/entities/enemy';
import type { GhostsSeen } from '../../../src/entities/models/bellGhosts';
import type { SkillKey } from '../../../src/types';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { ENEMIES, SCALING } from '../../../src/data/enemies';
import { BELL_WARDEN } from '../../../src/data/foes/bellwarden';
import { CANTOR } from '../../../src/data/foes/cantor';
import { WAVES } from '../../../src/data/waves';
import { damageTaken } from '../../../src/entities/bossKit';
import { fx, setFxSink, type FxName } from '../../../src/entities/enemyAI';
import { PIPELINES } from '../../../src/engine/pipelinesAside';

/** The encounter's parts: those run by default, those for the eye alone, and `frames`, asked for alone. */
export type EncounterPart = 'toll' | 'swing' | 'encounter' | 'bars' | 'dive' | 'choir' | 'graves' | 'compiles'
  | 'encounterPictures' | 'cantorLook' | 'film' | 'choirPictures' | 'frames';
export const ENCOUNTER_PARTS: EncounterPart[] = [
  'toll', 'swing', 'encounter', 'bars', 'dive', 'choir', 'graves', 'compiles',
];
export const ENCOUNTER_PICTURES: EncounterPart[] = ['encounterPictures', 'cantorLook', 'film', 'choirPictures'];

/** the hero's distance from a guard for a toll near (within its stun) and further off (reached, past its stun) (m) */
const NEAR = 4;
const FAR = 8;
/** the Cantor's distance from the hero where it's stood aside (m) */
const ASIDE = 19;
/** where the hero stands for `film` (m): 8 m from the arena's middle, where the guard is stood */
const FILM_HERO: [number, number] = [0, 8];
/** how high over a guard its ghost is held while its toll is measured (m): off the hero, so it dives at no one */
const GHOST_HELD_Y = 6;
/** the most frames a boss takes to rise, and a toll to come */
const RISE_FRAMES = 200;
const TOLL_FRAMES = 420;
/** how far off its stun's time a stun may be (s): the frame it lands and the frame it ends */
const STUN_SLACK = 0.1;
/** frames a second on the lab's clock */
const FPS = 60;

const secondsOf = (frames: number): number => frames / FPS;

// --- the toll ----------------------------------------------------------------------------------------------

/** What became of a toll at the hero: when the bell began its warning and when its ring reached him, how long he was
 *  stunned, and whether he was. */
interface TollCase { warnedAt: number; stunnedAt: number; stunnedFor: number }

/** A Bell-Warden guard left to toll at the hero `away` m off, `held` the frame's input (a shield raised), its ghost
 *  held off him (its dive is `dive`'s, bossChoir.ts): what came of it. */
async function tollAt(lab: Lab, options: BossOptions, away: number, held: SkillKey | null): Promise<TollCase> {
  await standIn(lab, options.fixture, 'crypt');
  const hero = G.player;
  const boss = await guardAt(lab, away);
  boss.cd = 0;
  const ghosts = boss.model.root.userData.ghosts as GhostsSeen;
  const overIt = boss.pos.clone().setY(GHOST_HELD_Y);
  const aim = boss.pos.clone().setY(1.5);
  const result: TollCase = { warnedAt: -1, stunnedAt: -1, stunnedFor: 0 };
  await lab.step(TOLL_FRAMES, () => {
    // (the hero turned to the boss and held where he stands: the toll is what's measured, not his walk)
    hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
    ghosts.hold(0, overIt);
    return held ? pressing(held, aim, true) : { aim };
  }, (frame) => {
    if (result.warnedAt < 0 && boss.action?.name === 'toll') result.warnedAt = frame;
    // (the first stun alone: its cooldown over, the bell tolls again within the frames followed)
    const first = result.stunnedAt < 0 || result.stunnedAt + result.stunnedFor === frame;
    if (hero.stunned && first) {
      if (result.stunnedAt < 0) result.stunnedAt = frame;
      result.stunnedFor++;
    }
  });
  return result;
}

/** The block skill's key on the hero's bar (a shield's raise), or null. */
function blockKey(): SkillKey | null {
  for (const key of ['mouse2', 'mouse0', '1', '2', '3', '4', 'q', 'e', 'r', 'f'] as SkillKey[]) {
    if (G.player.skillAt(key)?.def.block) return key;
  }
  return null;
}

/** A Bell-Warden risen as a guard `away` m from the hero towards the arena's middle (at its guard's size), thinking. */
async function guardAt(lab: Lab, away: number): Promise<Enemy> {
  const radius = ENEMIES.bellwarden.radius * (ENEMIES.bellwarden.asGuard?.size ?? 1);
  const guard = lab.spawnFoe('bellwarden', clearSpot(away, radius), { wave: WAVES.bossEvery * 2, guard: true });
  await lab.until(() => guard.spawning <= 0, RISE_FRAMES, 'the guard never rose');
  return guard;
}

/** A guard's toll's cases: near (stunned after its warning, for its time), far (reached, but faded), and a shield
 *  raised. */
async function toll(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const t = BELL_WARDEN.toll;
  const stunsTo = t.stunsTo;
  if (options.canary) t.stunsTo = 0;
  try {
    const near = await tollAt(lab, options, NEAR, null);
    const warn = ENEMIES.bellwarden.bossKit!.attacks!.toll.warn;
    const warned = near.stunnedAt >= 0 ? secondsOf(near.stunnedAt - near.warnedAt) : -1;
    lines.push(`toll: near (${NEAR} m): ${near.stunnedAt < 0 ? 'not stunned' : `stunned ${fixed(secondsOf(near.stunnedFor))} s, `
      + `${fixed(warned)} s after the bell began its swing`}`);
    if (near.warnedAt < 0) problems.push('toll: the bell never tolled');
    if (near.stunnedAt < 0) problems.push(`toll: the hero ${NEAR} m off was never stunned`);
    else {
      if (Math.abs(secondsOf(near.stunnedFor) - t.stun) > STUN_SLACK) problems.push(`toll: stunned ${fixed(secondsOf(near.stunnedFor))} s, not ${t.stun}`);
      if (warned < warn) problems.push(`toll: its ring reached him ${fixed(warned)} s into its warning of ${warn} s`);
    }
  } finally {
    t.stunsTo = stunsTo;
  }
  const far = await tollAt(lab, options, FAR, null);
  lines.push(`toll: far (${FAR} m, reached but faded past ${stunsTo} m): ${far.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
  if (far.warnedAt < 0) problems.push('toll: the bell never tolled at the far hero');
  if (far.stunnedAt >= 0) problems.push(`toll: the hero ${FAR} m off was stunned, past where its ring fades`);
  await blocked(lab, options, lines, problems);
}

/** A toll at the hero with his shield raised towards it: not stunned. A warrior with a shield alone. */
async function blocked(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const key = blockKey();
  if (!G.player.gear.shield || !key) {
    lines.push('toll: shield raised: not run (--class warrior --gear shield)');
    return;
  }
  // (the canary's shield that stops nothing, planted on every hero: the toll's set-up may build him anew)
  const players = Object.getPrototypeOf(G.player) as object;
  const shipped = Object.getOwnPropertyDescriptor(players, 'shieldRaised')!;
  if (options.canary) Object.defineProperty(players, 'shieldRaised', { get: () => false, configurable: true });
  try {
    const shield = await tollAt(lab, options, NEAR, key);
    lines.push(`toll: shield raised (${NEAR} m): ${shield.stunnedAt < 0 ? 'not stunned' : 'stunned'}`);
    if (shield.warnedAt < 0) problems.push('toll: the bell never tolled at the shielded hero');
    if (shield.stunnedAt >= 0) problems.push('toll: the hero was stunned with his shield raised towards it');
  } finally {
    Object.defineProperty(players, 'shieldRaised', shipped);
  }
}

// --- the Cantor's encounter --------------------------------------------------------------------------------

/** how long the encounter is fought with its guards up, and after (s) */
const GUARDED_FOR = 28;
const UNGUARDED_FOR = 24;
/** how far apart two warned hits may land under the beat (s): a frame each way */
const BEAT_SLACK = 2 / FPS;

/** A warned hit as it landed: which boss's, what, and when (s, the game's clock). */
interface Landed { id: number; what: string; at: number }

/** The fx that are a boss's warned hits landing, as the encounter keeps them apart (`claimBeat`). */
const WARNED_HITS: FxName[] = ['toll', 'graveHands', 'dirge'];

/** The Ossuary Cantor and its two guards risen round the hero, all thinking, as the wave sends them. */
async function encounterAt(lab: Lab): Promise<{ cantor: Enemy; guards: Enemy[] }> {
  const wave = WAVES.bossEvery * 2;
  const cantor = lab.spawnFoe('cantor', clearSpot(12, ENEMIES.cantor.radius), { wave });
  // (at their rung's spots, as the run sends them: bossGuardSpots.ts holds the run to them)
  const spots = BIOMES.crypt.bosses.find((boss) => boss.id === 'cantor')?.guards?.at ?? [];
  const guards = spots.map(([x, z]) => lab.spawnFoe('bellwarden', new THREE.Vector3(x, 0, z), { wave, guard: true }));
  const all = [cantor, ...guards];
  await lab.until(() => all.every((boss) => boss.spawning <= 0), RISE_FRAMES, 'the encounter never rose');
  return { cantor, guards };
}

/** Frames of the fight with the hero kept whole, every warned hit and ring that lands kept. */
async function fight(lab: Lab, seconds: number, landed: Landed[], rings: Landed[], each?: () => void): Promise<void> {
  setFxSink((name, args) => {
    if (WARNED_HITS.includes(name)) landed.push({ id: args[0], what: name, at: G.time });
    if (name === 'graveRing') rings.push({ id: args[0], what: 'ring', at: G.time });
  });
  try {
    await lab.step(Math.round(seconds * FPS), () => {
      const hero = G.player;
      hero.life = hero.stats.maxLife;
      each?.();
      return {};
    });
  } finally {
    setFxSink(null);
  }
}

/** The closest two different bosses' warned hits landed (s), and which. */
function closestHits(landed: Landed[]): { gap: number; pair: string } {
  let gap = Infinity, pair = 'none';
  for (let i = 0; i < landed.length; i++) {
    for (let j = i + 1; j < landed.length; j++) {
      const a = landed[i], b = landed[j];
      if (a.id === b.id) continue;
      const apart = Math.abs(a.at - b.at);
      if (apart < gap) {
        gap = apart;
        pair = `${a.what} and ${b.what}`;
      }
    }
  }
  return { gap, pair };
}

/**
 * The Cantor and its guards fought: warded while a guard stands, not after; its casts ringed before they land; no
 * two bosses' warned hits within its beat; its heart bared after a cast once the guards are down.
 */
async function encounter(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const stand = (): Promise<void> => standIn(lab, options.fixture, 'crypt');
  await guardSpots({ lab, stand, canary: options.canary, lines, problems });
  await stand();
  const ward = ENEMIES.cantor.bossKit!.ward!;
  const asGuard = ENEMIES.bellwarden.asGuard!;
  const lesser = { ...BELL_WARDEN.toll };
  const planted = { taken: ward.taken, size: asGuard.size, stands: asGuard.stands, every: BELL_WARDEN.raise.every };
  // (the canary: a ward that wards nothing, and guards at a whole bell's size that walk, their tolls rung as far as a
  // whole bell's would be)
  if (options.canary) {
    ward.taken = 1;
    asGuard.size = 1;
    asGuard.stands = false;
    BELL_WARDEN.raise.every = CANARY_RAISE_EVERY;
    Object.assign(BELL_WARDEN.toll, CANARY_TOLL);
  }
  const taken = planted.taken;
  try {
    const { cantor, guards } = await encounterAt(lab);
    lesserGuards(cantor, guards, lines, problems);
    const rose = guards.map((guard) => guard.pos.clone());
    const faced = guards.map((guard) => guard.facing);
    let moved = 0, turned = 0;
    const ghostsMost = guards.map(() => 0);
    const lowestLip = guards.map(() => Infinity);
    const dead = new DeadRaised(guards);
    lab.keepRisen();
    const landed: Landed[] = [], rings: Landed[] = [];
    let wardedFrames = 0, frames = 0, wardTaken = 1, seizedFrames = 0, wasStunned = false;
    const stunsFrom: number[] = [];
    await fight(lab, GUARDED_FOR, landed, rings, () => {
      frames++;
      if (cantor.warded) wardedFrames++;
      wardTaken = Math.min(wardTaken, damageTaken(cantor));
      const hero = G.player;
      if (hero.seized) seizedFrames++;
      // (each stun begun, and how far the nearest guard stood: only a guard tolls in this span)
      if (hero.stunned && !wasStunned) stunsFrom.push(Math.min(...guards.map((g) => Math.hypot(g.pos.x - hero.pos.x, g.pos.z - hero.pos.z))));
      wasStunned = hero.stunned;
      moved = Math.max(moved, ...guards.map((guard, i) => guard.pos.distanceTo(rose[i])));
      turned = Math.max(turned, ...guards.map((guard, i) => Math.abs(Math.atan2(Math.sin(guard.facing - faced[i]), Math.cos(guard.facing - faced[i])))));
      guards.forEach((guard, i) => {
        ghostsMost[i] = Math.max(ghostsMost[i], ghostsFree(guard.model.root));
        lowestLip[i] = Math.min(lowestLip[i], lipOver(guard));
      });
      dead.look();
    });
    dead.judgeStanding(GUARDED_FOR, lines, problems);
    guardsHover(guards, ghostsMost, lowestLip, lines, problems);
    guardTolls(stunsFrom, seizedFrames, lesser.stunsTo, lines, problems);
    guardsStood(moved, turned, lines, problems);
    guards[0].takeDamage(guards[0].life - 0.15 * guards[0].maxLife, {});
    await lab.step(3);
    lines.push(`encounter: a guard at 15% of its life in phase ${guards[0].bossPhase}`);
    if (guards[0].bossPhase !== 0) problems.push(`encounter: a guard entered phase ${guards[0].bossPhase}: a guard keeps its first`);
    lines.push(`encounter: guards up ${GUARDED_FOR} s: warded ${fixed(wardedFrames / frames, 2)} of the frames, `
      + `taking ${fixed(wardTaken, 2)} of the damage`);
    if (wardedFrames < frames - 2) problems.push(`encounter: the Cantor warded ${wardedFrames} of ${frames} frames with its guards up`);
    if (Math.abs(wardTaken - taken) > 1e-6) problems.push(`encounter: warded, the Cantor took ${fixed(wardTaken, 2)} of the damage, not ${taken}`);
    for (const guard of guards) guard.takeDamage(guard.life + 1, {});
    let unwarded = 0, bared = 0;
    const afterAt = landed.length;
    dead.fallen();
    await fight(lab, UNGUARDED_FOR, landed, rings, () => {
      dead.look();
      if (!cantor.warded) unwarded++;
      if (cantor.weak > 0) bared++;
    });
    dead.judgeFallen(lines, problems);
    const casts = landed.slice(afterAt).filter((hit) => hit.id === cantor.id).length;
    lines.push(`encounter: guards down ${UNGUARDED_FOR} s: unwarded ${unwarded} frames, ${casts} casts landed, `
      + `its heart bared ${fixed(bared / FPS, 1)} s`);
    if (unwarded < UNGUARDED_FOR * FPS - 2) problems.push('encounter: the Cantor stayed warded with its guards fallen');
    if (casts === 0) problems.push('encounter: the Cantor cast nothing in its fight');
    else if (bared === 0) problems.push('encounter: its heart was never bared after a cast');
    // (each cast's hit lands after a ring of its own laid at least its warning before)
    const cantorHits = landed.filter((hit) => hit.id === cantor.id);
    const unwarned = cantorHits.filter((hit) => !rings.some((ring) => ring.id === cantor.id && hit.at - ring.at >= 0.9 && hit.at - ring.at < 3));
    lines.push(`encounter: ${cantorHits.length} of the Cantor's hits, ${unwarned.length} without a ring before them`);
    if (unwarned.length) problems.push(`encounter: ${unwarned.length} of the Cantor's hits landed with no ring first`);
    const tolls = landed.filter((hit) => hit.what === 'toll').length;
    const closest = closestHits(landed.slice(0, afterAt));
    lines.push(`encounter: ${tolls} tolls with the guards up; two bosses' warned hits ${fixed(closest.gap, 2)} s apart at the closest (${closest.pair})`);
    if (tolls === 0) problems.push('encounter: the guards never tolled');
    if (closest.gap < CANTOR.beat - BEAT_SLACK) problems.push(`encounter: two bosses' warned hits ${fixed(closest.gap, 2)} s apart, under the beat ${CANTOR.beat} s`);
  } finally {
    ward.taken = planted.taken;
    asGuard.size = planted.size;
    asGuard.stands = planted.stands;
    BELL_WARDEN.raise.every = planted.every;
    Object.assign(BELL_WARDEN.toll, lesser);
  }
}

/** The most a guard may stand against its Cantor's height: a lesser bell, the Cantor towering over it. */
const GUARD_HEIGHT_MOST = 0.5;

/** Each guard's size against the Cantor's: a lesser bell (from play, whole ones were "almost like main boss"). */
function lesserGuards(cantor: Enemy, guards: Enemy[], lines: string[], problems: string[]): void {
  const tallest = Math.max(...guards.map((guard) => guard.height));
  const share = tallest / cantor.height;
  lines.push(`encounter: the guards ${fixed(tallest, 2)} m tall against the Cantor's ${fixed(cantor.height, 2)} m (${fixed(share, 2)}), `
    + `${fixed(guards[0].radius, 2)} m round`);
  if (share > GUARD_HEIGHT_MOST) problems.push(`encounter: a guard stands ${fixed(share, 2)} of the Cantor's height, over ${GUARD_HEIGHT_MOST}`);
}

/** The canary's guards' tolls: rung and stunning as far as a whole bell's would. */
const CANARY_TOLL = { reach: 24, stunsTo: 15 };
/** The canary's guards raise the dead this often (s): far more often than their interval. */
const CANARY_RAISE_EVERY: [number, number] = [3, 3];
/** How near a guard a risen foe counts as its (m), and how far apart in time two risings are one group (s). */
const RAISED_NEAR = 9, GROUP_GAP = 1;
/** The slack on a guard's interval between groups (s): the frames a group takes to be seen. */
const RAISE_SLACK = 0.5;

/** The dead each standing guard raises (from play: "make sure they spawn mobs once in a while"), seen as they rise:
 *  the foes new to the fight near a guard, grouped by when they came; and the most foes up at once. */
class DeadRaised {
  private readonly seen = new Set<Enemy>();
  /** each guard's groups: when each rose */
  private readonly groups: number[][];
  private mostAlive = 0;
  private afterFall = 0;
  private fell = false;
  private readonly start = G.time;

  constructor(private readonly guards: Enemy[]) {
    for (const foe of G.enemies) this.seen.add(foe);
    this.groups = guards.map(() => []);
  }

  /** This frame: every foe new to the fight near a guard, and how many are up. */
  look(): void {
    this.mostAlive = Math.max(this.mostAlive, G.enemies.filter((foe) => foe.alive).length);
    for (const foe of G.enemies) {
      if (this.seen.has(foe)) continue;
      this.seen.add(foe);
      const near = this.guards.findIndex((guard) => guard.pos.distanceTo(foe.pos) < RAISED_NEAR + guard.radius);
      if (near < 0) continue;
      if (this.fell) {
        this.afterFall++;
        continue;
      }
      const times = this.groups[near];
      if (!times.length || G.time - times[times.length - 1] > GROUP_GAP) times.push(G.time);
    }
  }

  /** The guards have fallen: what rises near them from now on is a fault. */
  fallen(): void { this.fell = true; }

  /** With the guards standing `seconds`: each raised its first group by `first` and the next ones `every` apart. */
  judgeStanding(seconds: number, lines: string[], problems: string[]): void {
    const raise = BELL_WARDEN.raise;
    const most = WAVES.maxAlive(G.run?.wave ?? 1, G.run?.party ?? 0);
    this.groups.forEach((times, i) => {
      const at = times.map((t) => (t - this.start).toFixed(1)).join(', ') || 'never';
      lines.push(`encounter: guard ${i + 1} raised the dead at ${at} s of ${seconds}`);
      if (!times.length) problems.push(`encounter: guard ${i + 1} raised no dead in ${seconds} s standing`);
      times.slice(1).forEach((t, k) => {
        const gap = t - times[k];
        if (gap < raise.every[0] - RAISE_SLACK || gap > raise.every[1] + RAISE_SLACK) {
          problems.push(`encounter: guard ${i + 1} raised the dead ${gap.toFixed(1)} s after the last, not ${raise.every[0]} to ${raise.every[1]}`);
        }
      });
    });
    lines.push(`encounter: at most ${this.mostAlive} foes up at once, the wave's limit ${most}`);
    if (this.mostAlive > most) problems.push(`encounter: ${this.mostAlive} foes up at once, past the wave's limit of ${most}`);
  }

  /** After the guards fell: nothing more rose near them. */
  judgeFallen(lines: string[], problems: string[]): void {
    lines.push(`encounter: ${this.afterFall} risen near the guards after they fell`);
    if (this.afterFall) problems.push(`encounter: ${this.afterFall} foes rose near the guards after they fell`);
  }
}

/** the least a guard's bell's lip may come over the floor through the fight (m): it hovers, never set down */
const HOVER_LEAST = 0.15;

/** Each guard hovering through the fight, a floating bell (from Victor: "can you make bells float?"): its bell's lip
 *  over the floor at every frame (`lowestLip`, the lowest seen); and its one ghost about it through the fight
 *  (`ghostsMost`, the most seen free at once: "ghosts should still be there"). */
function guardsHover(guards: Enemy[], ghostsMost: number[], lowestLip: number[], lines: string[], problems: string[]): void {
  lines.push(`encounter: the guards' bells' lips at least ${lowestLip.map((lip) => fixed(lip)).join(', ')} m over the floor; `
    + `ghosts about each at most: ${ghostsMost.join(', ')}`);
  lowestLip.forEach((lip, i) => {
    if (lip < HOVER_LEAST) problems.push(`encounter: guard ${i + 1}'s bell came ${fixed(lip)} m over the floor: it hovers`);
  });
  ghostsMost.forEach((count, i) => {
    if (count !== 1) problems.push(`encounter: guard ${i + 1} had ${count} ghosts about it at most, not its one`);
  });
}

/** How high a Bell-Warden's bell's lip is over the floor now (m): its crown's joint, less the bell's height as drawn. */
function lipOver(guard: Enemy): number {
  const root = guard.model.root;
  root.updateMatrixWorld(true);
  const crown = (root.userData.bell as THREE.Object3D).getWorldPosition(new THREE.Vector3());
  const size = guard.height / guard.model.height;
  return crown.y - BELL_HEIGHT * size;
}
/** the bell's height (m, at its model's own size: models/bellWarden.ts) */
const BELL_HEIGHT = 4.6;

/** How many of a Bell-Warden's ghosts are about it now, shown and free (models/bellGhosts.ts's `seen`). */
function ghostsFree(root: THREE.Object3D): number {
  const seen = root.userData.ghosts as GhostsSeen | undefined;
  if (!seen) return 0;
  const at = new THREE.Vector3();
  return Array.from({ length: seen.most }, (_, i) => seen.freeAt(i, at)).filter((place) => place !== null).length;
}

/** The furthest a guard may move from where it rose (m): none, but a float's rounding. */
const GUARD_MOVED_MOST = 0.001;
/** The most a guard may turn from its facing as it rose (rad): none, but a float's rounding. */
const GUARD_TURNED_MOST = 0.001;

/** The guards stood where they rose through the fight (from play: "They stay stationary"). */
function guardsStood(moved: number, turned: number, lines: string[], problems: string[]): void {
  lines.push(`encounter: the guards moved ${fixed(moved, 3)} m at most from where they rose, turned ${fixed(turned, 3)} rad`);
  // (a planted bell never turns to follow a hero: turned, it spun on its axis, from Victor "rotates its axis")
  if (turned > GUARD_TURNED_MOST) problems.push(`encounter: a guard turned ${fixed(turned, 2)} rad from where it rose: it stands`);
  if (moved > GUARD_MOVED_MOST) problems.push(`encounter: a guard moved ${fixed(moved, 2)} m from where it rose: they stand`);
}

/** The guards' tolls as a lesser bell's: no stun from further than its `stunsTo` (and the hero's body), no seizing. */
function guardTolls(stunsFrom: number[], seizedFrames: number, stunsTo: number, lines: string[], problems: string[]): void {
  const most = stunsTo + G.player.radius + 0.5;
  const far = stunsFrom.filter((d) => d > most);
  lines.push(`encounter: ${stunsFrom.length} stuns by the guards' tolls, from ${stunsFrom.map((d) => fixed(d, 1)).join(', ') || 'none'} m; `
    + `${seizedFrames} frames seized by a ghost`);
  if (far.length) problems.push(`encounter: a guard's toll stunned the hero from ${fixed(Math.max(...far), 1)} m, past its ${stunsTo} m`);
  if (seizedFrames) problems.push(`encounter: a guard's ghost seized the hero (${seizedFrames} frames)`);
}

/** The Cantor risen `ASIDE` m off, held still: its casts drawn for the programs. */
async function cantorAside(lab: Lab): Promise<Enemy> {
  const cantor = lab.spawnFoe('cantor', clearSpot(ASIDE, ENEMIES.cantor.radius), { wave: WAVES.bossEvery * 2 });
  await lab.until(() => cantor.spawning <= 0, RISE_FRAMES, 'the Cantor never rose');
  cantor.dazed = 1e4;
  return cantor;
}

// --- the programs ------------------------------------------------------------------------------------------

/** Every effect of the Cantor's encounter drawn (a guard's toll, the Cantor's casts, its ward, its choir's ring, a
 *  gravestone): no program compiled. */
async function compiles(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await guardAt(lab, NEAR);
  boss.dazed = 1e4;
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    // (the engine's pipelines: three's programs are none under it, and the canary went uncaught counted by them)
    const before = PIPELINES.made;
    const x = boss.pos.x, z = boss.pos.z;
    fx('bellSwing', boss.id, 0.5);
    fx('toll', boss.id, x, z, 0);
    await lab.step(20);
    // (the Cantor's: its grave hands, a dirge, a ring, its ward and its heart bared)
    const cantor = await cantorAside(lab);
    fx('graveRing', cantor.id, x + 2, z, CANTOR.hands.radius, 0.5);
    fx('graveHands', cantor.id, x - 2, z, 0);
    fx('dirge', cantor.id, cantor.pos.x, cantor.pos.z, 0.3, 0);
    fx('bossWard', cantor.id, 1);
    await lab.step(20);
    fx('bossWard', cantor.id, 0);
    fx('bossWeak', cantor.id, 2);
    // (its choir's ring and its singers, and a gravestone warned and risen: the crypt's own headstones' draw)
    fx('choirRing', cantor.id, cantor.pos.x, cantor.pos.z, 0.5);
    fx('graveStone', cantor.id, x + 4, z + 4, 0, 0, 0.3);
    await lab.step(60);
    if (options.canary) {
      // (a blending, side and depth no other material has together: the engine's pipelines are set apart by those)
      const material = new THREE.MeshBasicMaterial({
        color: 0x123456,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: true,
      });
      const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), material);
      odd.position.copy(boss.pos).setY(2);
      G.scene.add(odd);
      await lab.step(4);
      G.scene.remove(odd);
      odd.geometry.dispose();
      material.dispose();
    }
    await lab.step(60);
    const compiled = PIPELINES.made - before;
    lines.push(`compiles: ${compiled} pipelines made drawing a guard's toll and the Cantor's casts, `
      + 'its choir\'s ring and a gravestone');
    if (compiled > 0) problems.push(`compiles: ${compiled} programs compiled in the Crypt's bosses' fights`);
  } finally {
    lab.drawing = drawing;
  }
}

// --- time to kill ------------------------------------------------------------------------------------------

/** The encounter at wave 10 from the hero's damage a second `dps` (boss.ts's `ttk`), against `first`, the Colossus's
 *  time at wave 5: its guards first (each its share of a Bell-Warden's life), then the Cantor with its heart bared for
 *  `bared` s of each cast's `every`. */
export function encounterTtk(dps: number, first: number, lines: string[]): void {
  const guard = ENEMIES.bellwarden.life * SCALING.life(10) * ENEMIES.bellwarden.asGuard!.life;
  const guards = 2 * guard / dps;
  const cantor = ENEMIES.cantor.life * SCALING.life(10);
  const heart = ENEMIES.cantor.bossKit!.weak!.taken;
  const cantorTime = cantor / (dps * (1 + (heart - 1) * CANTOR.bared / CANTOR.every));
  const whole = guards + cantorTime;
  lines.push(`ttk: the Cantor's encounter at wave 10 (two guards of ${fixed(guard, 0)} life, the Cantor ${fixed(cantor, 0)}): `
    + `${fixed(guards, 0)} s for the guards, ${fixed(cantorTime, 0)} s for the Cantor, ${fixed(whole, 0)} s in all `
    + `(${fixed(whole / first, 2)}x the Colossus's)`);
}

/** `frames`: the frame's time through each of the Crypt's boss waves, in turns (bossFrames.ts). */
async function frames(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const stand = (): Promise<void> => standIn(lab, options.fixture, 'crypt');
  await bossFrames({ lab, stand, canary: options.canary, lines, problems });
}

/** `film`: a guard's toll filmed from its side at eye height (bossFilm.ts), a guard risen in the arena's middle
 *  facing the hero and thinking, then the Cantor's guards as wave 10 sends them (bossGuardFilm.ts). */
async function film(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  // (in the arena's middle, where a run begins: the open paving round the dais, which the lab's spot by the
  // gravestones isn't)
  if (G.arena.biome !== 'crypt') G.arena.setBiome('crypt');
  await lab.setup({ at: FILM_HERO, facing: Math.PI, ...options.fixture });
  const boss = lab.spawnFoe('bellwarden', new THREE.Vector3(0, 0, 0), { wave: WAVES.bossEvery * 2, guard: true });
  await lab.until(() => boss.spawning <= 0, RISE_FRAMES, 'the guard never rose');
  boss.facing = boss.targetFacing = Math.atan2(G.player.pos.x - boss.pos.x, G.player.pos.z - boss.pos.z);
  const moments = await bellFilm({ lab, boss, lines, problems });
  const stand = (): Promise<void> => standIn(lab, options.fixture, 'crypt');
  moments.push(...await guardFilm({ lab, stand, lines, problems }));
  return moments;
}

/** `swing`: the bell through a toll (bossSwing.ts), a guard risen near the hero and thinking. */
async function swing(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const boss = await guardAt(lab, NEAR);
  return bellSwing({ lab, boss, canary: options.canary, lines, problems });
}

/**
 * The Cantor's encounter at every stage, for the eye (no verdicts): coming on with its guards, warded, its grave hands'
 * rings and their burst, its guards down, its heart bared, its dirge, its last phase and its fall.
 */
async function encounterPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const spot = clearSpot(12, ENEMIES.cantor.radius);
  await lab.setup({ ...options.fixture, at: SPOT, facing: Math.atan2(spot.x - SPOT[0], spot.z - SPOT[1]) });
  const { cantor, guards } = await encounterAt(lab);
  lab.keepRisen();
  const hero = G.player;
  const moments: Pictured[] = [];
  const keepWhole = (): Record<string, never> => {
    hero.life = hero.stats.maxLife;
    return {};
  };
  const close = (label: string, note: string, views: ViewName[] = ['back', 'left']): void => {
    const at = cantor.pos.clone().setY(3.6);
    moments.push(lab.picture(label, views, [note], { at, distance: 13 }));
  };
  const seen = async (label: string, note: string): Promise<void> => { moments.push(await screenClear(lab, label, note)); };
  const actUntil = async (foe: Enemy, name: string, share: number): Promise<void> => {
    foe.cd = 0;
    const reached = (): boolean => foe.action?.name === name && foe.action.t / foe.action.dur >= share;
    await lab.until(reached, TOLL_FRAMES, `the ${foe.def.name} never reached ${share} of its ${name}`, keepWhole);
  };
  const castUntil = (name: string, share: number): Promise<void> => actUntil(cantor, name, share);
  // 1. it comes, its guards with it, warded
  for (const guard of guards) guard.cd = 99;
  cantor.cd = 99;
  await lab.step(90, keepWhole);
  await seen('1 the choir comes', 'the Ossuary Cantor and its two Bell-Wardens, as the player sees it');
  // (the arena from straight above: both guards on the ring walk, across from each other)
  const middle = new THREE.Vector3(0, 0, 0);
  moments.push(lab.picture('0 from above', ['plan'], ['the crypt from above: the two guards on the ring walk, across the arena from each other'], { at: middle, distance: ABOVE }));
  close('1 the Cantor (close)', 'floating in rotted vestments: a crown of candles, a halo of skulls, a bell for a heart, its crozier and lantern; warded by its guards (the pale shell)', ['front', 'left', 'right', 'back']);
  // 1a. a guard beside the hero, for its size against his
  await pictureBeside(lab, moments, guards[1], hero, cantor);
  // (a guard close, hovering where it rose, its ghost about it: from straight above and from its side)
  const hovering = guards[1].pos.clone().setY(1.6);
  moments.push(lab.picture('1c a guard from above', ['plan'], ['a guard close from straight above: a lesser bell hovering where it rose, its ghost about it'], { at: hovering, distance: GUARD_SEEN_FROM }));
  moments.push(lab.picture('1d a guard from its side', ['left', 'front'], ['a guard close from its side: a bell hanging in the air, the glow under it, its one ghost'], { at: hovering, distance: GUARD_SEEN_FROM }));
  // (its dead rising round it: its next raising called now, pictured as they climb out of the floor)
  guards[1].brain.raiseAt = G.time;
  await lab.step(DEAD_SEEN_AFTER, keepWhole);
  moments.push(lab.picture('1e the dead rise round a guard', ['plan'], ['a guard raising the dead round it, as it does every 15 to 20 s while it stands'], { at: hovering, distance: DEAD_SEEN_FROM }));
  // 1b. a guard's toll: its ring rolling out
  await actUntil(guards[0], 'toll', 0.98);
  // (its ring out past the guard's own glow on the floor, short of where it fades; pictured at the guard, which
  // stands across the arena from the hero, out of his view)
  await lab.step(TOLL_SEEN_AFTER, keepWhole);
  // (from the player's camera as it stands off the hero, put over the guard: a close-up from above came out black
  // under main's engine)
  const tolling = guards[0].pos.clone();
  const lens = G.camera.position.clone().sub(hero.pos).add(tolling);
  moments.push(await filmedFrom(lab, lens, tolling, '1b a guard tolls', "a guard Bell-Warden's toll, its ring rolling out, as the player sees it"));
  guards[0].cd = 99;
  await lab.step(60, keepWhole);
  // 2-3. grave hands: the rings under the hero, then the hands
  await castUntil('graveHands', 0.35);
  await seen('2 grave hands warning', 'arms raised, chanting: a ring of grave light under the hero, about 1.3 s to step out');
  close('2 arms raised (close)', 'its arms raised over the warning, its jaw open in the chant');
  await castUntil('graveHands', 0.6);
  await lab.step(4, keepWhole);
  await seen('3 grave hands', 'bone hands tearing up through the floor where the ring was');
  // 4. the guards fallen: the ward gone
  for (const guard of guards) guard.takeDamage(guard.life + 1, {});
  await lab.step(80, keepWhole);
  await seen('4 its guards fallen', 'both Bell-Wardens down: the ward is gone, the Cantor takes full damage');
  // 5. its heart bared after a cast
  await castUntil('graveHands', 0.62);
  await lab.step(30, keepWhole);
  close('5 heart bared (close)', 'after each cast its ribs swing open and its bell-heart is bared for 4.5 s, taking double damage', ['front', 'left']);
  // 6. phase 2: the dirge
  cantor.takeDamage(cantor.life - 0.5 * cantor.maxLife, {});
  await lab.step(30, keepWhole);
  await seen('6 phase 2', 'under 55%: the Cantor sings the dirge');
  cantor.brain.casts = 1;
  await castUntil('dirge', 0.4);
  await seen('7 dirge warning', 'a line of rings marching out from it to the hero, each bursting in turn');
  await castUntil('dirge', 0.6);
  await lab.step(5, keepWhole);
  await seen('8 the dirge', 'the dirge bursting along its line');
  // 9. its last phase, and its fall
  cantor.takeDamage(cantor.life - 0.2 * cantor.maxLife, {});
  await lab.step(40, keepWhole);
  await seen('9 phase 3', 'under 25%: the ossuary answers, a dirge at every hero, casting faster');
  cantor.takeDamage(cantor.life + 1, {});
  await lab.step(45, keepWhole);
  close('10 its fall', 'killed: it sinks and tips forward into the dark');
  lines.push(`encounterPictures: ${moments.length} moments`);
  return moments;
}

/** How high over the arena's middle its picture from straight above is taken (m): the whole ring in it. */
const ABOVE = 95;

/** How far from a guard the hero is stood for their picture together (m). */
const BESIDE = 2.4;

/** The hero stood `BESIDE` off a guard where it rose (it stands: it's never moved), on its side away from the Cantor
 *  (which floats over him otherwise), the two as the player sees them: the lesser bell's size against a man's
 *  (pictured from round them, the props of the arena stood between the camera and them); then back where he stood. */
async function pictureBeside(lab: Lab, moments: Pictured[], guard: Enemy, hero: typeof G.player, cantor: Enemy): Promise<void> {
  const toHero = guard.pos.clone().sub(cantor.pos).setY(0).normalize();
  const stood = hero.pos.clone();
  hero.pos.copy(guard.pos).addScaledVector(toHero, BESIDE);
  guard.cd = 99;
  // (a few frames for the camera to follow him there)
  await lab.step(FOLLOW_FRAMES);
  const note = `a guard Bell-Warden beside the hero, ${BESIDE} m apart: a lesser bell, ${fixed(guard.height, 2)} m to its crown`;
  moments.push(await screenClear(lab, '1a a guard beside the hero', note));
  // (back where he stood, the Cantor in view for the moments after)
  hero.pos.copy(stood);
  await lab.step(FOLLOW_FRAMES);
}

/** Frames after a guard raises its dead that they're pictured, and from how far (m): risen out of the floor. */
const DEAD_SEEN_AFTER = 70, DEAD_SEEN_FROM = 30;

/** How far a guard is pictured close from (m). */
const GUARD_SEEN_FROM = 12;

/** Frames after a guard's toll rings that it's pictured: its ring out past its glow. */
const TOLL_SEEN_AFTER = 36;

/** Frames for the camera to follow the hero stood somewhere else. */
const FOLLOW_FRAMES = 30;

/** The screen as the player sees it, the slow game's prompt put away first: the lab's boot is slow, and the prompt
 *  lay over the boss's bar. */
async function screenClear(lab: Lab, label: string, note: string): Promise<Pictured> {
  putAway();
  return lab.screen(label, [note]);
}

/** `cantorLook`: the Cantor risen alone at 12 m (bossCantor.ts). */
async function cantorAlone(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const cantor = lab.spawnFoe('cantor', clearSpot(12, ENEMIES.cantor.radius), { wave: WAVES.bossEvery * 2 });
  await lab.until(() => cantor.spawning <= 0, RISE_FRAMES, 'the Cantor never rose');
  return cantorLook(lab, cantor, lines, problems);
}

/** The encounter's part `part`, run: its lines and problems added, its pictures returned. */
export async function encounterPart(
  part: EncounterPart, lab: Lab, options: BossOptions, lines: string[], problems: string[],
): Promise<Pictured[]> {
  const measure = (): ChoirMeasure => ({
    lab, stand: () => standIn(lab, options.fixture, 'crypt'), canary: options.canary, lines, problems,
  });
  switch (part) {
    case 'toll': await toll(lab, options, lines, problems); return [];
    case 'swing': return swing(lab, options, lines, problems);
    case 'encounter': await encounter(lab, options, lines, problems); return [];
    case 'bars': await bars(measure()); return [];
    case 'dive': await dive(measure()); return [];
    case 'choir': await choir(measure()); return [];
    case 'graves': await graves(measure()); return [];
    case 'compiles': await compiles(lab, options, lines, problems); return [];
    case 'encounterPictures': return encounterPictures(lab, options, lines);
    case 'cantorLook': return cantorAlone(lab, options, lines, problems);
    case 'film': return film(lab, options, lines, problems);
    case 'choirPictures': return choirPictures(measure());
    case 'frames': await frames(lab, options, lines, problems); return [];
  }
}
