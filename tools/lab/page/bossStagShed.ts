// The Stag of Ash's antler shed at half its life (tools/lab `boss --parts stagShed`; entities/stag.ts `shedAntlers`,
// `shedAt`; models/stag.ts `STAKES`; from Kenneth's notes: "its antlers break off as burning stakes stuck in the floor.
// They block paths and burn on touch; they last a set time or can be broken. After the shed, no antler toss or gore; a
// faster hoof attack instead").
//
// Its life is taken under its second phase's share with the hero well before it, and what came of it read as the
// game has it:
// - the shed: a warned smash (its `shed` action), its model's antlers shed (`userData.shed`), its stakes standing in
//   the floor (`STAKES_STANDING`), each among the arena's obstacles inside the wall and clear of the others, a line
//   across one blocked (`lineClear`: what paths read), and no pipeline made (`PIPELINES.made`: its stakes are its
//   model's own);
// - a hero stood beside a stake burnt about once a tick;
// - a stake struck `shed.hits` times broken and out of the obstacles, the others gone after `shed.life` s;
// - up close after it: no gore or toss, its hoof strike in their place.
//
// `--canary` keeps the stakes whole and standing for good: none breaks, none goes, and the part says so.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { STAG } from '../../../src/data/foes/stag';
import { STAKES } from '../../../src/entities/models/stag';
import { STAKES_STANDING, type Stake } from '../../../src/entities/stag';
import { hurtProp } from '../../../src/world/destructible';
import { lineClear } from '../../../src/world/navigation';
import { pastWall } from '../../../src/world/edge';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { strikesBody } from '../../../src/combat/strikes';
import { fixed, standIn, type BossOptions } from './boss';
import { noting, onLane, openLane, type Hurt } from './bossStag';

/** frames a second on the lab's clock */
const FPS = 60;
/** its life's share taken to (its second phase), the most frames its shed takes to begin and its stakes to stand */
const LATE = 0.45;
const SHED_FRAMES = 4 * FPS;
/** how long the hero stands beside a stake (s), and how long he's kept up close after the shed (s) */
const BESIDE_FOR = 2;
const CLOSE_FOR = 8;
/** how far past the stag's body the hero stands up close after it (m) */
const CLOSE = 1.4;

const _n = new THREE.Vector3();

/** The stag risen before the hero, its life taken under its second phase's share, and let shed its antlers: its stakes
 *  standing, and the pipelines made meanwhile. */
async function shedding(
  lab: Lab, options: BossOptions, lines: string[], problems: string[],
): Promise<{ boss: Enemy; began: boolean; made: number }> {
  await standIn(lab, options.fixture, 'forest');
  const boss = await onLane(lab, options, openLane());
  checkParts(boss, 'before', false, lines, problems);
  boss.dazed = 0;
  boss.cd = 0;
  const drawing = lab.drawing;
  lab.drawing = true;
  const before = PIPELINES.made;
  let began = false;
  try {
    boss.takeDamage(boss.life - LATE * boss.maxLife, {});
    await lab.until(() => {
      began ||= boss.action?.name === 'shed';
      return STAKES_STANDING.length >= STAKES;
    }, SHED_FRAMES, 'its stakes never stood', () => {
      boss.brain.chargeT = 99;
      boss.brain.breathT = 99;
      return {};
    });
  } finally {
    lab.drawing = drawing;
  }
  return { boss, began, made: PIPELINES.made - before };
}

/** Strike the posed skull and torso from the side through the same mesh test a projectile uses. */
function checkParts(boss: Enemy, phase: 'before' | 'after', canary: boolean, lines: string[], problems: string[]): void {
  // The muzzle's parent locates the skull independently of the head registration being tested.
  const root = boss.model.root;
  const skull = (root.userData.mouth as THREE.Object3D | undefined)?.parent;
  const trunk = root.getObjectByName('stag-trunk');
  if (!skull || !trunk) throw new Error('lab: stagShed: missing skull or torso anchor');
  const hit = (joint: THREE.Object3D, y: number, z: number): string => {
    const from = joint.localToWorld(new THREE.Vector3(-3, y, z));
    const to = joint.localToWorld(new THREE.Vector3(3, y, z));
    const struck = { head: false };
    if (strikesBody(boss, from, to, 0, struck) < 0) return 'miss';
    return struck.head ? 'headshot' : 'body';
  };
  const head = hit(skull, 0.08, 0.15);
  const torso = hit(trunk, 0.1, 0);
  lines.push(`stagShed: ${phase} the shed, skull ${head}, torso ${torso}`);
  if (head !== 'headshot' || torso !== 'body') {
    problems.push(`stagShed: ${phase} the shed, expected a skull headshot and torso body hit`);
  }
  if (!canary) return;
  const registered = boss.model.head;
  try {
    boss.model.head = undefined;
    const unregistered = hit(skull, 0.08, 0.15);
    const caught = head === 'headshot' && unregistered === 'body';
    lines.push(`stagShed: missing head registration canary ${caught ? 'caught' : 'went unseen'}`);
    // This failure must escape the boss command's usual reporting of expected canary faults.
    if (!caught) throw new Error('lab: stagShed: removing head registration did not change the same skull hit to body');
  } finally {
    boss.model.head = registered;
  }
}

/** The shed's lines and problems: its smash warned, its antlers shed, its stakes standing where they should. */
function judgeShed(boss: Enemy, began: boolean, made: number, lines: string[], problems: string[]): void {
  const shed = (boss.model.root.userData.shed as { done: boolean } | undefined)?.done ?? false;
  const stakes = [...STAKES_STANDING];
  const where = stakes.map((s) => `${fixed(s.x, 1)},${fixed(s.z, 1)}`).join(' ');
  lines.push(`stagShed: ${began ? 'warned (its shed)' : 'never warned'}, its antlers ${shed ? 'shed' : 'whole'}, `
    + `${stakes.length} stakes standing (${where}), ${made} pipelines made`);
  if (!began) problems.push('stagShed: its shed was never a warned smash');
  if (!shed) problems.push('stagShed: its model kept its antlers');
  if (stakes.length !== STAKES) problems.push(`stagShed: ${stakes.length} stakes standing, not ${STAKES}`);
  if (made > 0) problems.push(`stagShed: ${made} pipelines made as it shed`);
  for (const s of stakes) problems.push(...stakeFaults(s, stakes));
}

/** What's wrong with stake `s` standing among `all`: not among the obstacles, past the wall, in another prop or
 *  another stake, or not blocking a line across it. */
function stakeFaults(s: Stake, all: Stake[]): string[] {
  const faults: string[] = [], at = `stagShed: the stake at ${fixed(s.x, 1)},${fixed(s.z, 1)}`;
  const mine = s.prop.parts;
  if (!mine.every((o) => G.arena.obstacles.includes(o))) faults.push(`${at} is not among the obstacles`);
  if (pastWall(G.arena.biome, s.x, s.z, _n).by > -1) faults.push(`${at} stands past the wall`);
  const others = G.arena.obstacles.filter((o) => !mine.includes(o));
  const inProp = others.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < o.r + STAG.shed.stake);
  if (inProp) faults.push(`${at} stands in a prop`);
  if (all.some((t) => t !== s && Math.hypot(t.x - s.x, t.z - s.z) < 1.5)) faults.push(`${at} stands on another`);
  if (lineClear(s.x - 1.5, s.z, s.x + 1.5, s.z, 0.1)) faults.push(`${at} blocks no line across it`);
  return faults;
}

/** The hero stood beside stake `s` `BESIDE_FOR` s: his hurts. */
async function besideStake(lab: Lab, s: Stake): Promise<Hurt[]> {
  const hero = G.player, hurts: Hurt[] = [];
  const at = new THREE.Vector3(s.x + STAG.shed.stake + STAG.shed.touch * 0.5 + hero.radius, 0, s.z);
  let frame = 0;
  await noting(hurts, () => frame, () => lab.step(BESIDE_FOR * FPS, () => {
    frame++;
    hero.place(at, hero.facing);
    return {};
  }));
  return hurts;
}

/** Up close after the shed: the hero kept `CLOSE` m before it `CLOSE_FOR` s, the close attacks it made. */
async function closeAfter(lab: Lab, boss: Enemy): Promise<Record<string, number>> {
  const hero = G.player, made: Record<string, number> = {};
  let last = '';
  await lab.step(CLOSE_FOR * FPS, () => {
    const d = boss.radius + hero.radius + CLOSE;
    hero.place(new THREE.Vector3(boss.pos.x + Math.sin(boss.facing) * d, 0, boss.pos.z + Math.cos(boss.facing) * d),
      boss.facing + Math.PI);
    boss.brain.chargeT = 99;
    boss.brain.breathT = 99;
    return {};
  }, () => {
    const name = boss.action?.name ?? '';
    if (name && name !== last) made[name] = (made[name] ?? 0) + 1;
    last = name;
  });
  return made;
}

/** `stagShed`: its antler shed at half its life, its stakes, and its close attacks after it. */
export async function stagShed(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const w = STAG.shed, hits = w.hits, life = w.life;
  if (options.canary) {
    w.hits = 1e9;
    w.life = 1e9;
  }
  try {
    const { boss, began, made } = await shedding(lab, options, lines, problems);
    judgeShed(boss, began, made, lines, problems);
    checkParts(boss, 'after', options.canary, lines, problems);
    const stakes = [...STAKES_STANDING];
    if (!stakes.length) return;
    const hurts = await besideStake(lab, stakes[0]);
    const ticks = Math.floor(BESIDE_FOR / w.tick);
    lines.push(`stagShed: the hero beside a stake ${BESIDE_FOR} s burnt ${hurts.length} time(s) `
      + `(a burn every ${w.tick} s)`);
    if (Math.abs(hurts.length - ticks) > 1) {
      problems.push(`stagShed: burnt ${hurts.length} times beside a stake, not ${ticks}`);
    }
    // (one struck its hits: broken, out of the obstacles)
    const struck = stakes[0];
    for (let i = 0; i < hits && !struck.prop.broken; i++) hurtProp(struck.prop.parts[0], 1);
    await lab.step(2);
    const out = !struck.prop.parts.some((o) => G.arena.obstacles.includes(o));
    lines.push(`stagShed: a stake struck ${hits} times ${struck.prop.broken ? 'broken' : 'standing'}, `
      + `${out ? 'out of' : 'still among'} the obstacles`);
    if (!struck.prop.broken || !out) problems.push(`stagShed: a stake struck ${hits} times still stands`);
    const after = await closeAfter(lab, boss);
    const said = Object.entries(after).map(([name, n]) => `${n} ${name}`).join(', ');
    lines.push(`stagShed: ${CLOSE_FOR} s up close after it: ${said || 'nothing'}`);
    if (after.gore || after.toss) problems.push('stagShed: it gored or tossed with its antlers shed');
    if (!after.strike) problems.push('stagShed: it never struck with its hooves after the shed');
    await lab.step(Math.round(life * FPS));
    lines.push(`stagShed: ${STAKES_STANDING.length} stakes standing ${life} s on`);
    const left = STAKES_STANDING.length;
    if (left) problems.push(`stagShed: ${left} stakes still stand past their ${life} s`);
  } finally {
    w.hits = hits;
    w.life = life;
    for (const s of [...STAKES_STANDING]) s.out();
  }
}
