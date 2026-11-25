// The Rootmother's volleys led along a hero's path (tools/lab `boss --parts combos,comboPictures`; entities/
// rootVolleys.ts): from Kenneth, "It should throw more sticks at the ground, like combos, and they should even try to
// predict your path", and Victor's bar, that each be dodgeable and warned. Each case lets her throw one volley at the
// hero 14 m off running round her (the touch stick, as a player steers him), and reads what the game did: each
// branch's aim as she let it go (`AIMS`: where he stood, his pace as she read it, the share led and where it was
// aimed), where it came down (`BRANCHES`) and what landed on him (his own `takeDamage`, his Health kept whole).
//
// - each led aim: led along his way (a lead aimed where he stands is "not leading"), and with him running on and led
//   whole, aimed within its burst of where he really was as it landed (his track, frame by frame);
// - a branch at him running on: it strikes him; running and stopping as it leaves her hand: it misses;
// - a pair at him running on: its second strikes him; turning back as it leaves her hand: both miss;
// - her rain (phase 2) at him running on, and zigzagging: what lands, its branches `rain.every` apart (no flash
//   faster than 1.5 a second);
// - each hero's dodge window: a branch's flight against the time his run takes him out of its ring.
//
// `--canary` takes her lead away (`lead.most` 0): every led aim must read "not leading", and the runner go unstruck.
import type { Frame, Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { forgetBeats } from '../../../src/entities/bossKit';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { CLASSES } from '../../../src/data/classes';
import { BRANCHES, type Attack } from '../../../src/entities/rootmother';
import { AIMS, branchFlight, type Aim } from '../../../src/entities/rootVolleys';
import { CAMERA } from '../../../src/data/balance';
import { setZoom } from '../../../src/core/renderer';
import { fixed, type BossOptions } from './boss';
import { holdHerAfter, nextIs, rootmother, standClear } from './bossRootmother';
import { Steer, type Move } from './bossRootThreat';

const B = ROOTMOTHER.branch;
/** frames a second, and the most frames a case is followed for */
const FPS = 60;
const CASE_FRAMES = 6 * FPS;
/** how far the hero keeps from her middle (m: the set-up's spot) */
const AROUND = 14;
/** how far along his way a lead must point (the cosine of its angle off his pace: a lead round his turn is off it by
 *  half the turn over its flight, at `lead.turnMost` 1.5 rad/s and a second's flight 0.75 rad) */
const ALONG = 0.6;
/** the closest two of her rain's branches may land (s): about 1.5 a second */
const FLASH_APART = 0.65;
/** the least pace a lead is judged at (m/s): below it his way is no way */
const LEAD_PACE = 2;

/** What the hero does as the volley's first branch leaves her hand: runs on, stops, or turns back the way he came. */
type Answer = 'on' | 'stop' | 'back';

/** One case's reading: the aims she took, the branches thrown, the hits landed on him (game time). */
interface Case { aims: Aim[]; hits: number[]; landed: number[]; track: { t: number; x: number; z: number }[] }

/** Her volley `attack` at the hero running round her (`move`), her life at `life`, the hero answering as asked. */
async function volleyCase(lab: Lab, options: BossOptions, attack: Attack, life: number, move: Move,
  answer: Answer): Promise<Case> {
  await standClear(lab, options);
  const hero = G.player;
  const boss: Enemy = await rootmother(lab);
  // (the set-up turns the clock back: the cases before's claimed beats would refuse her throw)
  forgetBeats();
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  const steer = new Steer(move, boss, AROUND - boss.radius);
  const aimsFrom = AIMS.length ? AIMS[AIMS.length - 1] : null;
  const thrownFrom = BRANCHES.length ? BRANCHES[BRANCHES.length - 1] : null;
  const hits: number[] = [];
  const own = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, at) => {
    const r = own(amount, type, at);
    if (r && r.taken > 0) hits.push(G.time);
    hero.life = hero.stats.maxLife;
    return r;
  };
  // (running from the first frame, so her read of his pace has settled before she throws)
  let released = false;
  let back: [number, number] | null = null;
  const frame = (): Frame => {
    holdHerAfter(boss, attack);
    const last = AIMS.length ? AIMS[AIMS.length - 1] : null;
    if (!released && last && last !== aimsFrom) released = true;
    const going = steer.frame();
    if (!released || answer === 'on') return going;
    if (answer === 'stop') return { stick: [0, 0] };
    back ??= [-(going.stick?.[0] ?? 0), -(going.stick?.[1] ?? 0)];
    return { stick: back };
  };
  // (her first throw a second in: his pace read over his run)
  await lab.step(FPS, frame);
  nextIs(boss, attack);
  const track: Case['track'] = [];
  try {
    await lab.step(CASE_FRAMES, frame, () => track.push({ t: G.time, x: hero.pos.x, z: hero.pos.z }));
  } finally {
    hero.takeDamage = own;
    await lab.step(1, () => ({ stick: [0, 0] }));
  }
  const aims = AIMS.slice(aimsFrom ? AIMS.indexOf(aimsFrom) + 1 : 0).filter((aim) => aim.name === attack);
  const thrown = BRANCHES.slice(thrownFrom ? BRANCHES.indexOf(thrownFrom) + 1 : 0);
  return { aims, hits, landed: thrown.flatMap((b) => (b.landed ? [b.landed.t] : [])), track };
}

/** How far an aim was led from where he stood (m), and whether it went his way (the cosine off his pace). */
function leadOf(aim: Aim): { led: number; along: number } {
  const lx = aim.led.x - aim.hero.x, lz = aim.led.z - aim.hero.z;
  const led = Math.hypot(lx, lz), pace = Math.hypot(aim.pace.x, aim.pace.z);
  const along = led > 0.01 && pace > 0 ? (lx * aim.pace.x + lz * aim.pace.z) / (led * pace) : 0;
  return { led, along };
}

/** How far from where he really was as the branch aimed `aim` landed its led point was (m), or null past his track. */
function missedBy(aim: Aim, track: Case['track']): number | null {
  const at = track.find((step) => step.t >= aim.at + aim.flight);
  return at ? Math.hypot(at.x - aim.led.x, at.z - aim.led.z) : null;
}

/** A case's line and its problems: each led aim against his pace, and what struck him against what must. */
function judge(name: string, c: Case, struck: 'some' | 'none' | 'any', lines: string[], problems: string[],
  runsOn = false): void {
  const what = `combos: ${name}`;
  const leads: string[] = [];
  for (const aim of c.aims) {
    const { led, along } = leadOf(aim);
    const pace = Math.hypot(aim.pace.x, aim.pace.z);
    const off = missedBy(aim, c.track);
    const landedOff = runsOn && off !== null ? `, ${fixed(off, 1)} m off him as it landed` : '';
    leads.push(aim.share > 0 ? `${fixed(led, 1)} m by ${fixed(aim.share, 1)} of his way${landedOff}`
      : `${fixed(led, 1)} m (where he stood)`);
    if (aim.share <= 0 || pace < LEAD_PACE) continue;
    if (led < 0.3 || along < ALONG) {
      problems.push(`${what}: not leading: a branch led ${fixed(led, 2)} m (${fixed(along, 2)} along his way), his `
        + `pace ${fixed(pace, 1)} m/s`);
    } else if (runsOn && aim.share === 1 && off !== null && off > B.splash + G.player.radius) {
      problems.push(`${what}: a branch led whole came down ${fixed(off, 1)} m off where he ran`);
    }
  }
  const pace = c.aims.length ? Math.hypot(c.aims[0].pace.x, c.aims[0].pace.z) : 0;
  const landed = [...c.landed].sort((a, b) => a - b);
  let closest = Infinity;
  for (let i = 1; i < landed.length; i++) closest = Math.min(closest, landed[i] - landed[i - 1]);
  lines.push(`${what}: ${c.aims.length} thrown at him going ${fixed(pace, 1)} m/s, each led ${leads.join(', ')}; `
    + `struck him ${c.hits.length} time(s)${landed.length > 1 ? `; landing ${fixed(closest, 2)} s apart at the closest` : ''}`);
  if (!c.aims.length) problems.push(`${what}: she threw nothing`);
  if (struck === 'some' && !c.hits.length) problems.push(`${what}: it never struck him`);
  if (struck === 'none' && c.hits.length) problems.push(`${what}: it struck him ${c.hits.length} time(s)`);
}

/** Her rain's branches' landings apart: no closer than `FLASH_APART` s (no flash faster than about 1.5 a second; its
 *  branches' flights differ by their distances, so they land a little off `rain.every`). */
function rainApart(name: string, c: Case, problems: string[]): void {
  const landed = [...c.landed].sort((a, b) => a - b);
  for (let i = 1; i < landed.length; i++) {
    if (landed[i] - landed[i - 1] < FLASH_APART) {
      problems.push(`combos: ${name}: two of its branches landed ${fixed(landed[i] - landed[i - 1], 2)} s apart`);
    }
  }
}

/** Each hero's dodge window: a branch's flight at 8 and 20 m (its ring shown so long) against the time his run takes
 *  him out of its ring (its burst and his body), and the same for the small branches of a fan, a line or a rain. */
function dodgeWindows(lines: string[]): void {
  const flights = `${fixed(branchFlight(8), 2)} to ${fixed(branchFlight(20), 2)} s`;
  const outs = Object.values(CLASSES).map((cls) => {
    const run = cls.base.moveSpeed;
    const out = (B.splash + G.player.radius) / run, small = (B.smallSplash + G.player.radius) / run;
    return `${cls.id} ${fixed(out, 2)} s (${fixed(small, 2)} s out of a small one) at ${fixed(run, 1)} m/s`;
  });
  lines.push(`combos: dodge window: each branch's ring shown its flight, ${flights} from 8 to 20 m, after her arm's `
    + `${fixed(0.9, 1)} s wind-up; out of a branch's ring standing in its middle: ${outs.join(', ')}`);
}

/** `combos`: her volleys led along a running hero's path, each dodgeable by a stop or a turn. */
export async function combos(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const most = B.lead.most;
  if (options.canary) B.lead.most = 0;
  try {
    const one = await volleyCase(lab, options, 'branch', 1, 'strafe', 'on');
    judge('a branch, him running on', one, 'some', lines, problems, true);
    const stop = await volleyCase(lab, options, 'branch', 1, 'strafe', 'stop');
    judge('a branch, him stopping as it leaves her hand', stop, 'none', lines, problems);
    const pair = await volleyCase(lab, options, 'pair', 1, 'strafe', 'on');
    judge('a pair, him running on', pair, 'some', lines, problems, true);
    const turn = await volleyCase(lab, options, 'pair', 1, 'strafe', 'back');
    judge('a pair, him turning back as it leaves her hand', turn, 'none', lines, problems);
    const rain = await volleyCase(lab, options, 'rain', 0.45, 'strafe', 'on');
    judge('her rain, him running on', rain, 'some', lines, problems, true);
    rainApart('her rain', rain, problems);
    const zig = await volleyCase(lab, options, 'rain', 0.45, 'zigzag', 'on');
    judge('her rain, him zigzagging', zig, 'any', lines, problems);
    const fan = await volleyCase(lab, options, 'fan', 0.45, 'strafe', 'on');
    judge('her fan, him running on', fan, 'any', lines, problems, true);
  } finally {
    B.lead.most = most;
  }
  dodgeWindows(lines);
}

/** the picture strip's frames: how many, and the frames between (the whole screen, as the player sees it) */
const STRIP_SHOTS = 14;
const STRIP_EVERY = 18;

/** `comboPictures` (by name): her rain at a hero running round her, and a pair at him, as the player sees it, the
 *  camera zoomed out as far as the game lets it. */
export async function comboPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const strip = async (name: string, attack: Attack, life: number): Promise<void> => {
    await standClear(lab, options);
    const boss = await rootmother(lab);
    forgetBeats();
    if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
    const steer = new Steer('strafe', boss, AROUND - boss.radius);
    const hero = G.player, own = hero.takeDamage.bind(hero);
    hero.takeDamage = (amount, type, at) => {
      const r = own(amount, type, at);
      hero.life = hero.stats.maxLife;
      return r;
    };
    setZoom(CAMERA.maxZoom);
    try {
      await lab.step(FPS, () => steer.frame());
      nextIs(boss, attack);
      let from = -1, shot = 0;
      for (let frame = 0; frame < CASE_FRAMES && shot < STRIP_SHOTS; frame++) {
        await lab.step(1, () => {
          holdHerAfter(boss, attack);
          return steer.frame();
        });
        if (from < 0 && boss.action?.name === attack) from = frame;
        if (from >= 0 && (frame - from) % STRIP_EVERY === 0) {
          const note = `${name} at him running round her, ${fixed((frame - from) / FPS, 2)} s in`;
          moments.push(await lab.screen(`${name} ${shot + 1}`, [note]));
          shot++;
        }
      }
    } finally {
      hero.takeDamage = own;
      setZoom(1);
      await lab.step(1, () => ({ stick: [0, 0] }));
    }
  };
  await strip('rain', 'rain', 0.45);
  await strip('pair', 'pair', 1);
  lines.push(`comboPictures: ${moments.length} moments`);
  return moments;
}
