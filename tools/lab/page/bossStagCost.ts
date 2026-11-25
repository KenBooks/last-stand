// What the Stag of Ash's fight costs the frame at its busiest (tools/lab `boss --parts stagCost`, by name; no verdict:
// this PC's GPU is not a player's, `lab perf --device`). Three separate runs of `stagPictures`' timing read 1.89x,
// 1.28x and 1.15x: the shared PC's load between runs, not the Stag. So it's timed as `rootCost` times the Rootmother,
// in turns within one page: its second phase (its four stakes standing), breathing and charging at the hero, three
// pieces of wood alight and embers falling, then hidden and thinking nothing, by turns, each frame by the browser's
// clock. Its effects outlive a short turn (its ground's fire burns 7 s in its second phase), so a turn is long and
// only its end is timed, once what the turn before left has gone. Each turn's median is said too: a spread between
// turns of one kind is the PC's load.
import type { Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { STAG } from '../../../src/data/foes/stag';
import { STAKES } from '../../../src/entities/models/stag';
import { BURNING, STAKES_STANDING } from '../../../src/entities/stag';
import { fx } from '../../../src/entities/enemyAI';
import { fixed, standIn, type BossOptions } from './boss';
import { onLane, openLane } from './bossStag';

/** frames a second on the lab's clock */
const FPS = 60;
/** a turn's frames, the frames at the start of one without it left out (the fire its fight laid gone) and at the
 *  start of one with it (its breath drawn, its fire laid), and the turns each way */
const TURN = 10 * FPS;
const SETTLE = Math.round(7.5 * FPS);
const BUSY_FROM = Math.round(1.5 * FPS);
const TURNS = 4;
/** its life's share in its second phase, and how far past its body the hero stands (in its breath's and its
 *  charge's reach) */
const LATE = 0.45;
const PAST = 8;
/** the most frames its stakes take to stand */
const SHED_FRAMES = 4 * FPS;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
const realNow = (): number => (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();

/** A list's median. */
function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** The stag risen before the hero `PAST` m past its body, in its second phase with its stakes standing. */
async function busyStag(lab: Lab, options: BossOptions): Promise<Enemy> {
  await standIn(lab, options.fixture, 'forest');
  const lane = openLane();
  const boss = await onLane(lab, options, lane);
  const hero = G.player;
  const at = boss.pos.clone().addScaledVector(lane.way, boss.radius + PAST).setY(0);
  hero.place(at, Math.atan2(-lane.way.x, -lane.way.z));
  boss.dazed = 0;
  boss.cd = 0;
  boss.takeDamage(boss.life - LATE * boss.maxLife, {});
  await lab.until(() => STAKES_STANDING.length >= STAKES, SHED_FRAMES, 'its stakes never stood');
  return boss;
}

/** A fighting turn's start: three pieces of wood alight, its breath and its charge let go at once. */
function busier(boss: Enemy): void {
  const stake = (o: { x: number; z: number }): boolean => STAKES_STANDING.some((s) => s.x === o.x && s.z === o.z);
  const woods = G.arena.obstacles.filter((o) => o.prop?.kind === 'wood' && !o.prop.broken && !stake(o));
  for (const wood of woods.slice(0, STAG.forestFire.most)) fx('woodFire', boss.id, wood.x, wood.z, 0);
  boss.brain.breathT = 0;
  boss.brain.chargeT = 0;
}

/** One turn: `TURN` frames, the Stag fighting (timed from `BUSY_FROM`) or hidden and thinking nothing (timed from
 *  `SETTLE`). */
async function oneTurn(lab: Lab, boss: Enemy, fights: boolean): Promise<number[]> {
  const hero = G.player, times: number[] = [];
  boss.obj.visible = fights;
  boss.dazed = fights ? 0 : 1e9;
  if (fights) busier(boss);
  else for (const burning of [...BURNING]) burning.out();
  for (let frame = 0; frame < TURN; frame++) {
    const start = realNow();
    await lab.step(1, () => {
      hero.facing = Math.atan2(boss.pos.x - hero.pos.x, boss.pos.z - hero.pos.z);
      return { aim: boss.pos.clone().setY(2) };
    });
    if (frame >= (fights ? BUSY_FROM : SETTLE)) times.push(realNow() - start);
  }
  return times;
}

/** `stagCost` (asked for by name): the frame with the Stag at its busiest against without it, in turns in one page. */
export async function stagCost(lab: Lab, options: BossOptions, lines: string[]): Promise<void> {
  const life = STAG.shed.life;
  // (its stakes kept standing through the turns: they're its busiest)
  STAG.shed.life = 1e9;
  const drawing = lab.drawing;
  lab.drawing = true;
  const fighting: number[] = [], empty: number[] = [], turns: { fights: boolean; median: number }[] = [];
  let boss: Enemy | null = null;
  try {
    boss = await busyStag(lab, options);
    for (let turn = 0; turn < TURNS * 2; turn++) {
      const fights = turn % 2 === 0;
      const times = await oneTurn(lab, boss, fights);
      (fights ? fighting : empty).push(...times);
      turns.push({ fights, median: median(times) });
    }
  } finally {
    lab.drawing = drawing;
    if (boss) boss.obj.visible = true;
    STAG.shed.life = life;
    for (const s of [...STAKES_STANDING]) s.out();
    for (const burning of [...BURNING]) burning.out();
  }
  const a = median(fighting), b = median(empty);
  const each = turns.map((t) => `${t.fights ? 'with' : 'without'} ${fixed(t.median)}`).join(', ');
  lines.push(`stagCost: in turns of ${TURN / FPS} s (with it timed from ${BUSY_FROM / FPS} s in, without it its last `
    + `${(TURN - SETTLE) / FPS} s), drawn: the frame `
    + `${fixed(a)} ms median at its busiest (its second phase, ${STAKES} stakes, its breath and charge, `
    + `${STAG.forestFire.most} pieces of wood alight, embers), ${fixed(b)} ms without it: `
    + `${fixed(a / Math.max(0.01, b))}x`);
  lines.push(`stagCost: each turn's median (ms): ${each}`);
}
