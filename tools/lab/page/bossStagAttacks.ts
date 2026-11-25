// The Stag of Ash's attacks pictured for the eye (tools/lab `boss --parts stagAttackPictures`, no verdict): each one
// at a hero where it makes it, from its side at a man's eye (`bossSideView.ts`: the free camera held still across its
// facing, one crop for the whole strip, so a hoof planted on the earth stays on its pixels while the body moves over
// it) and as the player sees it (the game's own view from above). Victor judges whether an animal could move so
// ("would not be possible irl"); Kenneth asked that its close attack bend down to reach the hero, not strike the air.
import * as THREE from 'three';
import type { Clip, Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { fx } from '../../../src/entities/enemyAI';
import { BURNING } from '../../../src/entities/stag';
import { fixed, standIn, type BossOptions } from './boss';
import { onLane, openLane } from './bossStag';
import { endSideView, holdSideView, sideClip, sideView } from './bossSideView';

/** the most frames a strip waits for its attack to begin */
const BEGIN_FRAMES = 300;
/** its life's share for its later attacks (its second phase) */
const LATE = 0.45;
/** the camera's distance off its facing line (m), its body's half length (m), and the crop's reach before and after
 *  it, its height (m) */
const SIDE = { distance: 10, body: 2, behind: 3.5, ahead: 4, high: 7.5 };
/** a strip's pictures, and the player's view's */
const SHOTS = 7;
const SEEN_SHOTS = 3;

/** One attack pictured: its action's name, the hero's distance past its body and his (m) and angle off its facing
 *  (rad), the frames between a strip's pictures (the player's view's twice that), and what it is. */
interface StagAttack { name: string; away: number; off: number; every: number; note: string; late?: boolean }

/** the attacks pictured, and where the hero stands for each */
const ATTACKS: StagAttack[] = [
  {
    name: 'gore', away: 1.6, off: 0, every: 8,
    note: 'its gore: its head drawn up and back, then its antlers raked down through the hero',
  },
  {
    name: 'stamp', away: 0.3, off: 0, every: 8,
    note: 'its stamp: it rears over the hero under it and drives both fore hooves down',
  },
  {
    name: 'kick', away: 0.8, off: Math.PI, every: 6,
    note: 'its kick: its weight forward, its haunches gathered, then both hind hooves driven back',
  },
  {
    name: 'breath', away: 7, off: 0, every: 22,
    note: 'its breath: drawn in, then swept across before it, the ground left burning',
  },
  {
    name: 'shed', away: 6, off: 0, every: 20, late: true,
    note: 'its shed at half its life: its antlers smashed into the earth, broken off and thrown out as burning stakes',
  },
  {
    name: 'strike', away: 1.6, off: 0, every: 6, late: true,
    note: 'its hoof strike, its antlers shed: a short rear, its fore hooves struck down on the hero',
  },
];

/** The Stag risen on an open lane facing the hero `away` m past its body and his, left to make its next close attack
 *  (`name` its gore or its stamp, as it chooses by where he stands), its charge held off. */
async function facing(lab: Lab, options: BossOptions, attack: StagAttack):
  Promise<{ boss: Enemy; way: THREE.Vector3 }> {
  await standIn(lab, options.fixture, 'forest');
  const lane = openLane();
  const boss = await onLane(lab, options, lane);
  const hero = G.player;
  const d = boss.radius + hero.radius + attack.away, a = Math.atan2(lane.way.x, lane.way.z) + attack.off;
  const at = new THREE.Vector3(boss.pos.x + Math.sin(a) * d, 0, boss.pos.z + Math.cos(a) * d);
  hero.place(at, a + Math.PI);
  boss.brain.closeN = 0;
  // (its later attacks: its life taken under its second phase's share, its antlers shed first)
  if (attack.late) boss.takeDamage(boss.life - LATE * boss.maxLife, {});
  // (its breath held off but for its own strip, where it's let breathe at once)
  boss.brain.breathT = attack.name === 'breath' ? 0 : 99;
  return { boss, way: lane.way.clone() };
}

/** Frames stepped, the hero held where he stands and the charge held off, until the Stag's action is `name`. */
async function until(lab: Lab, boss: Enemy, name: string): Promise<void> {
  const hero = G.player, at = hero.pos.clone();
  boss.dazed = 0;
  boss.cd = 0;
  await lab.until(() => boss.action?.name === name, BEGIN_FRAMES, `the Stag never made its ${name}`, () => {
    boss.brain.chargeT = 99;
    if (name !== 'breath') boss.brain.breathT = 99;
    hero.place(at, hero.facing);
    return {};
  });
}

/** `count` pictures `every` frames apart through its action, by `shoot` (the shot's number). */
async function through(lab: Lab, boss: Enemy, count: number, every: number,
  shoot: (shot: number) => Promise<void>): Promise<void> {
  for (let shot = 0; shot < count; shot++) {
    await shoot(shot);
    await lab.step(every, () => {
      boss.brain.chargeT = 99;
      boss.brain.breathT = 99;
      return {};
    });
  }
}

/** Attack `attack` from its side at a man's eye, the camera across its facing. */
async function fromSide(lab: Lab, options: BossOptions, attack: StagAttack): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const { boss, way } = await facing(lab, options, attack);
  const mid = boss.pos.clone().addScaledVector(way, 1);
  let clip: Clip | null = null;
  try {
    holdSideView(sideView(mid, way, SIDE.distance, SIDE.body), true);
    await until(lab, boss, attack.name);
    const from = boss.pos.clone().addScaledVector(way, -SIDE.behind);
    await through(lab, boss, SHOTS, attack.every, async (shot) => {
      clip ??= sideClip(from, way, SIDE.behind + SIDE.ahead, 0.5, SIDE.high);
      const at = fixed(shot * attack.every / 60, 2);
      const note = `${attack.note}, from its side, ${at} s in`;
      moments.push(await lab.screen(`${attack.name} side ${shot + 1}`, [note], clip));
    });
  } finally {
    endSideView();
  }
  return moments;
}

/** Attack `attack` as the player sees it, from the game's own view. */
async function asSeen(lab: Lab, options: BossOptions, attack: StagAttack): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const { boss } = await facing(lab, options, attack);
  await until(lab, boss, attack.name);
  const every = attack.every * 2;
  await through(lab, boss, SEEN_SHOTS, every, async (shot) => {
    const at = fixed(shot * every / 60, 2);
    const note = `${attack.note}, as the player sees it, ${at} s in`;
    moments.push(await lab.screen(`${attack.name} seen ${shot + 1}`, [note]));
  });
  return moments;
}

/** the frames a piece of wood burns before it's pictured, and between its pictures */
const WOOD_FRAMES = 40;

/** A piece of wood its breath set alight (a stump or a log), as the player standing by it sees it. */
async function burningWood(lab: Lab, options: BossOptions): Promise<Pictured[]> {
  const { boss } = await facing(lab, options, ATTACKS[0]);
  boss.dazed = 1e4;
  const hero = G.player;
  const wood = G.arena.obstacles
    .filter((o) => o.prop?.kind === 'wood' && !o.prop.broken)
    .sort((a, b) => Math.hypot(a.x - hero.pos.x, a.z - hero.pos.z) - Math.hypot(b.x - hero.pos.x, b.z - hero.pos.z))[0];
  if (!wood) return [];
  const toward = new THREE.Vector3(hero.pos.x - wood.x, 0, hero.pos.z - wood.z).normalize();
  const stand = new THREE.Vector3(wood.x, 0, wood.z).addScaledVector(toward, wood.r + 2.5);
  hero.place(stand, Math.atan2(-toward.x, -toward.z));
  fx('woodFire', boss.id, wood.x, wood.z, 0);
  const moments: Pictured[] = [];
  for (let shot = 0; shot < 2; shot++) {
    await lab.step(WOOD_FRAMES);
    const note = 'wood its breath set alight, burning a while, a pooled light on it';
    moments.push(await lab.screen(`wood ${shot + 1}`, [note]));
  }
  for (const burning of [...BURNING]) burning.out();
  return moments;
}

/** `stagAttackPictures`: each of the Stag's attacks from its side at a man's eye and as the player sees it, and the
 *  wood its breath sets alight. */
export async function stagAttackPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  for (const attack of ATTACKS) {
    moments.push(...await fromSide(lab, options, attack));
    moments.push(...await asSeen(lab, options, attack));
  }
  moments.push(...await burningWood(lab, options));
  lines.push(`stagAttackPictures: ${moments.length} moments of ${ATTACKS.map((a) => a.name).join(', ')}`);
  return moments;
}
