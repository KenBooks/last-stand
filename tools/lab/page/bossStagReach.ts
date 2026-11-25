// The Stag of Ash's close attacks reaching a hero at its feet (tools/lab `boss --parts stagReach`; entities/stag.ts
// `antlerGoreAt`, `stampAt`, `kickAt`; models/stag.ts `GORE`, `REAR`, `KICK`). From Kenneth, after playing it:
// "when he is attacking you
// when you are right in front of him, have him actually bend down to reach you, he is just attacking the air instead".
//
// Each case stands the hero at a distance and an angle before it, within its reach, lets it make one close attack
// (the gore, or the stamp for a hero under its chest, as it chooses; the kick for one behind it), and reads what the
// game judged: how near its drawn tines (the gore), its drawn fore hooves (the stamp) or hind hooves (the kick) came
// to the hero's body (`BLOWS`: a capsule his radius
// round from his feet to his head, his own height), and whether they struck him. Run it as each hero (`--class`) for
// each one's height. Every case must be struck.
//
// `--canary` keeps its neck up through the gore, its fore hooves come down behind where they stood and its hind hooves
// kick forward under it: every case must miss, and the part says so.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { STAG } from '../../../src/data/foes/stag';
import { BLOWS, type CloseBlow } from '../../../src/entities/stag';
import { GORE, KICK, REAR } from '../../../src/entities/models/stag';
import { fixed, standIn, type BossOptions } from './boss';
import { onLane, openLane } from './bossStag';

/** frames a second, and the most frames a case waits for its blow */
const FPS = 60;
const CASE_FRAMES = 3 * FPS;
/** frames after its blow for the knock from it to be spent */
const SETTLE_FRAMES = Math.round(1.5 * FPS);
/** the hero's distances past its body and his own (m), and his angles off its facing (rad), each case one of each */
const AWAY = [0.3, 1, 1.8, 2.6, 3.3];
const OFF = [-0.6, 0, 0.6];
/** behind it, in its kick's reach: the hero's distances past its body and his (m), his angles off its facing (rad) */
const BEHIND_AWAY = [0.3, 1, 1.7];
const BEHIND_OFF = [Math.PI - 0.5, Math.PI, Math.PI + 0.5];
/** the canary's gore, stamp and kick: its neck kept up, its fore hooves come down behind, its hind hooves forward */
const CANARY = { neck: 0.1, head: 0, ahead: -2.5, back: -3 };

/** One case: the hero `away` m past its body and his, `off` rad off its facing, and what its blow did. */
interface Case { away: number; off: number; blow: CloseBlow | null }

/** The stag let make one close attack at the hero stood `away` past its body, `off` rad off its facing. */
async function oneCase(lab: Lab, options: BossOptions, away: number, off: number): Promise<Case> {
  // (in the Thornwood, whose props its lanes are found among)
  await standIn(lab, options.fixture, 'forest');
  const lane = openLane();
  const boss = await onLane(lab, options, lane);
  const hero = G.player;
  const d = boss.radius + hero.radius + away;
  const a = Math.atan2(lane.way.x, lane.way.z) + off;
  const at = new THREE.Vector3(boss.pos.x + Math.sin(a) * d, 0, boss.pos.z + Math.cos(a) * d);
  hero.place(at, a + Math.PI);
  const before = BLOWS.length ? BLOWS[BLOWS.length - 1] : null;
  boss.dazed = 0;
  boss.cd = 0;
  boss.brain.closeN = 0;
  boss.brain.chargeT = 99;
  let blow: CloseBlow | null = null;
  await lab.step(CASE_FRAMES, () => {
    boss.brain.chargeT = 99;
    // (held where he stands until its blow comes: what's read is its reach, not his walk)
    if (!blow) hero.place(at, hero.facing);
    return {};
  }, () => {
    const last = BLOWS.length ? BLOWS[BLOWS.length - 1] : null;
    if (!blow && last && last !== before) blow = last;
  });
  // (its blow let land and the knock from it spent: carried into the next case's set-up, it moved him)
  boss.dazed = 1e4;
  await lab.step(SETTLE_FRAMES);
  hero.knock.set(0, 0, 0);
  return { away, off, blow };
}

/** `stagReach`: its gore and its stamp at a hero at each distance and angle within its reach, each struck where its
 *  drawn tines or hooves pass through his body. */
export async function stagReach(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const gore = { ...GORE }, ahead = REAR.ahead, back = KICK.back;
  if (options.canary) {
    GORE.neck = CANARY.neck;
    GORE.head = CANARY.head;
    REAR.ahead = CANARY.ahead;
    KICK.back = CANARY.back;
  }
  const cases: Case[] = [];
  const where = [
    ...AWAY.flatMap((away) => OFF.map((off) => ({ away, off }))),
    ...BEHIND_AWAY.flatMap((away) => BEHIND_OFF.map((off) => ({ away, off }))),
  ];
  try {
    for (const { away, off } of where) {
      try {
        cases.push(await oneCase(lab, options, away, off));
      } catch (error) {
        const why = (error as Error).message;
        throw new Error(`stagReach: at ${away} m, ${off} rad (after ${cases.length} cases): ${why}`);
      }
    }
  } finally {
    Object.assign(GORE, gore);
    REAR.ahead = ahead;
    KICK.back = back;
  }
  const said = cases.map((c) => {
    const b = c.blow;
    const what = b ? `${b.what} ${fixed(b.nearest)} m${b.struck ? ' struck' : ' missed'}` : 'no blow';
    return `${fixed(c.away, 1)} m ${fixed(c.off, 1)} rad: ${what}`;
  });
  const tall = fixed(G.player.model.height);
  lines.push(`stagReach: the ${G.player.cls.id} (${tall} m tall) at each distance past its body `
    + `and angle off its facing, its blow's nearest drawn tine or hoof to his body: ${said.join('; ')}`);
  for (const c of cases) {
    const where = `${fixed(c.away, 1)} m past its body, ${fixed(c.off, 1)} rad off its facing`;
    if (!c.blow) problems.push(`stagReach: no close attack at the hero ${where}`);
    else if (!c.blow.struck) {
      problems.push(`stagReach: its ${c.blow.what} missed the hero ${where} (its nearest ${fixed(c.blow.nearest)} m)`);
    }
  }
  const reach = STAG.gore.reach;
  lines.push(`stagReach: its gore reaches ${reach} m past its body and his, its stamp ${STAG.stamp.reach} m, its kick `
    + `${STAG.kick.reach} m behind it`);
  for (const c of cases) {
    const behind = Math.abs(Math.atan2(Math.sin(c.off), Math.cos(c.off))) > Math.PI / 2;
    if (behind && c.blow && c.blow.what !== 'kick') {
      problems.push(`stagReach: the hero behind it at ${fixed(c.away, 1)} m met its ${c.blow.what}, not its kick`);
    }
  }
}
