// tools/lab `sit --round`: E sits him on every seat from all round it. From play: "sit on stone no longer works at
// some angles, here press Sit, nothing happens, he runs up to the stone but does not sit". `lab sit` tries E from one
// side of one seat a kind; this sets him off from every side of every seat of its kind, points at it until it's
// outlined, presses E and follows him: sat whole, or where he stopped and why (his sit given up, got no nearer the
// spot he walks to, never let close enough to it).
import { G } from '../../../src/state';
import { SIT } from '../../../src/entities/sitting';
import { seatSpot, seatSpotAt, type Seat, type SeatSpot } from '../../../src/world/seats';
import type { Fixture, Lab, Report } from './lab';
import { clearOfProps, satWhole, seatLit, seatMiddle, showPlace, standAt, within, type SeatCase } from './sit';

const RATE = 60;
/** the ways round a seat he's set off from, and how far off its middle (m) */
const WAYS = 12;
const OFFS = [1.8, 4, 8, 11];
/** how long he has to have sat by (s), and how often his way there is noted for a start he didn't sit from (frames) */
const SAT_BY = 15;
const PATH_EVERY = 30;
/** frames E may take to set him off */
const KEY_TAKES = 2;

/** What the sit's private state reads, for saying why he didn't sit. */
interface SitInside {
  phase: string | null;
  spot: SeatSpot | null;
  best: number;
  noNearer: number;
  heldFor: number;
  towards: { x: number; z: number };
}

/** One start round a seat, and how it went. */
interface Tried {
  seat: number;
  way: number;
  off: number;
  sat: boolean;
  said: string;
}

/** Every seat of each kind asked, from all round it. */
export async function sitRound(lab: Lab, cases: readonly SeatCase[], fixture: Fixture): Promise<Report> {
  const text: string[] = [`the ${lab.player.cls.id} sat by E from all round each seat`];
  const problems: string[] = [];
  for (const c of cases) {
    await showPlace(lab, c, fixture);
    const seats = G.arena.seats.filter((seat) => kindOf(seat) === kindOf(c.pick(G.arena.seats)!));
    const tried: Tried[] = [];
    for (const [i, seat] of seats.entries()) {
      for (let way = 0; way < WAYS; way++) {
        for (const off of OFFS) {
          const result = await tryFrom(lab, c, seat, way, off, fixture);
          if (result) tried.push({ seat: i, way, off, ...result });
        }
      }
    }
    const failed = tried.filter((t) => !t.sat);
    text.push(`  ${c.name}: ${seats.length} seats, sat from ${tried.length - failed.length} of ${tried.length} starts`);
    for (const t of failed) {
      const where = `${c.name} ${t.seat + 1}, from ${(t.way * 360 / WAYS).toFixed(0)}° ${t.off} m off`;
      text.push(`    ${where}: ${t.said}`);
      problems.push(`sit: E by the ${where} didn't sit him (${t.said})`);
    }
  }
  return { text: text.join('\n'), problems, moments: [] };
}

/** The kind of seat: along a line, round a point, or by a fire. */
function kindOf(seat: Seat | undefined): string {
  if (!seat) return 'none';
  if (seat.ground) return 'fire';
  return Math.hypot(seat.bx - seat.ax, seat.bz - seat.az) > 1e-3 ? 'length' : 'point';
}

/** Set off `off` from the seat's middle on its `way`'th side, facing it, and asked to sit by E: none where he can't
 *  stand there or the seat has no spot at all. Where his own side has none (another prop or the wall in the way), E
 *  sits him on its far side, and he has to go round it. */
async function tryFrom(lab: Lab, c: SeatCase, seat: Seat, way: number, off: number, fixture: Fixture)
  : Promise<{ sat: boolean; said: string } | null> {
  const mx = (seat.ax + seat.bx) / 2, mz = (seat.az + seat.bz) / 2;
  const angle = way / WAYS * Math.PI * 2;
  const x = mx + Math.sin(angle) * off, z = mz + Math.cos(angle) * off;
  if (!clearOfProps(x, z)) return null;
  await standAt(lab, c, fixture, [x, z], Math.atan2(mx - x, mz - z));
  const { player } = lab;
  const spot = seatSpotAt(seat, mx, mz, player.pos, player.radius);
  if (!spot) return null;
  const farSide = !seatSpot(seat, x, z, player.radius);
  player.sits = true;
  lab.aim = seatMiddle(seat);
  const lit = await within(lab, () => seatLit(seat), Math.round((SIT.look + 0.5) * RATE));
  if (!lit) return { sat: false, said: 'never outlined' };
  await lab.step(1, () => ({ keys: ['e'] }));
  // (as long as the game holds the press, `SIT.asked`: outlined at once, E came as he settled from the set-up, before he
  // was free to sit)
  const going = await within(lab, () => player.sitting.walking || player.sitting.placed, Math.round(SIT.asked * RATE));
  if (!going) return { sat: false, said: 'E set him off to nothing' };
  const result = await followed(lab);
  return farSide ? { ...result, said: `${result.said}, his own side taken` } : result;
}

/** Where he was walking to sit, last seen. */
interface LastSeen {
  phase: string | null;
  d: number;
  best: number;
  noNearer: number;
  heldFor: number;
  x: number;
  z: number;
}

/** Followed from E until he's sat whole, gives up or runs out of time. */
async function followed(lab: Lab): Promise<{ sat: boolean; said: string }> {
  const sitting = lab.player.sitting as unknown as SitInside;
  let last: LastSeen | null = null;
  const path: string[] = [];
  const asked = sitting.spot;
  for (let frame = 0; frame < SAT_BY * RATE; frame++) {
    if (satWhole(lab.player.sitting.pose)) return { sat: true, said: `sat in ${(frame / RATE).toFixed(1)} s` };
    if (sitting.phase === null) return { sat: false, said: `gave up ${stoppedAt(last)}; ${wayOf(path, asked)}` };
    last = seen(lab, sitting);
    if (frame % PATH_EVERY === 0) path.push(`${last.x.toFixed(2)},${last.z.toFixed(2)}${headed(sitting)}`);
    await lab.step(1);
  }
  return { sat: false, said: `not sat after ${SAT_BY} s, ${stoppedAt(last)}; ${wayOf(path, asked)}` };
}

/** Where he headed for then, said after where he was. */
function headed(sitting: SitInside): string {
  return ` (to ${sitting.towards.x.toFixed(2)},${sitting.towards.z.toFixed(2)})`;
}

/** His way there every half second, the spot he walked to and the seat's circles. */
function wayOf(path: readonly string[], spot: SeatSpot | null): string {
  const circles = spot?.seat.circles.map((o) => `${o.x.toFixed(2)},${o.z.toFixed(2)} r ${o.r.toFixed(2)}`) ?? [];
  const to = spot ? `${spot.fx.toFixed(2)},${spot.fz.toFixed(2)}` : 'none';
  return `went ${path.join(' ')}; to ${to}; the seat ${circles.join(', ')}`;
}

/** Where he is now on his way to sit. */
function seen(lab: Lab, sitting: SitInside): LastSeen {
  const spot = sitting.spot!;
  const { x, z } = lab.player.pos;
  const d = Math.hypot(spot.fx - x, spot.fz - z);
  return { phase: sitting.phase, d, best: sitting.best, noNearer: sitting.noNearer, heldFor: sitting.heldFor, x, z };
}

/** Where he was last seen walking, and what stood in his way: the props he touches there. */
function stoppedAt(last: LastSeen | null): string {
  if (!last) return 'at once';
  const touching = G.arena.obstacles
    .map((o) => ({ o, gap: Math.hypot(last.x - o.x, last.z - o.z) - o.r }))
    .filter(({ gap }) => gap < 0.7)
    .map(({ o, gap }) => `a circle r ${o.r.toFixed(2)} ${gap.toFixed(2)} m off`);
  const near = touching.length ? `, by ${touching.join(', ')}` : '';
  return `in ${last.phase}, ${last.d.toFixed(2)} m from where he stands to sit (nearest ${last.best.toFixed(2)}, `
    + `no nearer for ${last.noNearer.toFixed(2)} s, held ${last.heldFor.toFixed(2)} s)${near}`;
}
