// Burning foes (#402): a foe set alight takes fire damage at a pace until the burn runs out, flames licking up off
// it meanwhile. Judged as hits are: the game of the hero whose skill lit it keeps the burn and deals its ticks
// (`hitEnemy`), each going to the host as any hit of his does; every other game is told the foe burns and shows the
// flames alone (`Enemy.burning`: net/sync's hit report from a guest, the snapshot's flag from the host).
import { G } from '../state';
import { hitEnemy, tellHost, damageNumber } from './damage';
import { dealsDamage } from '../net/role';
import { particles, col } from '../fx/particles';
import { rand } from '../util';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { SkillDef } from '../types';

/** how often a burn bites (s): often enough that the foe's Health falls smoothly (from play: "damage is applied
 *  smoothly like healing staff"), not every frame, as each bite of a co-op guest's is a hit told to the host */
export const BURN_TICK = 0.1;
/** how often what a burn has dealt is shown as a number over the foe (s; "show damage numbers every 1 sec") */
export const BURN_SHOWN = 1;

interface Burn {
  enemy: Enemy; by: Player; skill: SkillDef; perSecond: number; left: number; due: number;
  /** what it has dealt since its last number, and when the next number is due (s) */
  dealt: number; shown: number;
}
const burns: Burn[] = [];

/** Set a foe alight with `by`'s skill: `perSecond` fire damage a second (before his modifiers) for `seconds`. A foe
 *  already burning burns on at the fiercer pace, for the longer of the two. */
export function igniteEnemy(enemy: Enemy, perSecond: number, seconds: number, by: Player, skill: SkillDef): void {
  if (!enemy.alive || enemy.invulnerable || !dealsDamage(by)) return;
  enemy.burning = Math.max(enemy.burning, seconds);
  tellHost(enemy, { amount: 0, crit: false, type: 'fire', burn: seconds });
  const lit = burns.find((b) => b.enemy === enemy && b.by === by);
  if (lit) {
    lit.perSecond = Math.max(lit.perSecond, perSecond);
    lit.left = Math.max(lit.left, seconds);
    lit.skill = skill;
  } else burns.push({ enemy, by, skill, perSecond, left: seconds, due: BURN_TICK, dealt: 0, shown: BURN_SHOWN });
}

/** Each frame: the burns the local hero lit bite as they come due. */
export function updateBurns(dt: number): void {
  for (let i = burns.length - 1; i >= 0; i--) {
    const b = burns[i];
    // (a foe taken out of the arena unkilled, a wave cleared away: its burn goes with it; kept, it bit a foe no
    // longer there, and the battle log listed the bites, `lab log`)
    if (!G.enemies.includes(b.enemy)) { burns.splice(i, 1); continue; }
    b.left -= dt;
    b.due -= dt;
    b.shown -= dt;
    if (b.due <= 0 && b.enemy.alive) {
      b.due += BURN_TICK;
      b.dealt += hitEnemy(b.enemy, b.perSecond * BURN_TICK, { by: b.by, skill: b.skill, tags: ['fire'], type: 'fire', unnumbered: true, blow: { dir: { x: 0, z: 0 }, lift: 0.2, style: 'burn' } });
    }
    const over = b.left <= 0 || !b.enemy.alive;
    // (its number once a second, and what's left of it as it ends)
    if ((b.shown <= 0 || over) && b.dealt >= 1) {
      damageNumber(b.enemy, b.dealt, false, 'fire');
      b.dealt = 0; b.shown = BURN_SHOWN;
    }
    if (over) burns.splice(i, 1);
  }
}

export function clearBurns(): void { burns.length = 0; }

const FLAME = col(0xffb040, 3), FLAME_END = col(0xff3a10, 0.5);

/** A burning foe's flames this frame: licks rising off its body (`Enemy.updateLooks`, on every game). */
export function burnFlames(enemy: Enemy, dt: number): void {
  // (about 24 a second on a foe of a common size, more on a big one: a count a frame, its fraction by chance)
  const want = 24 * dt * Math.min(3, Math.max(1, enemy.radius / 0.5));
  const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = enemy.radius * rand(0.2, 0.9);
    particles.glow.spawn({
      x: enemy.pos.x + Math.cos(a) * r, y: enemy.height * rand(0.15, 0.8), z: enemy.pos.z + Math.sin(a) * r,
      vx: rand(-0.3, 0.3), vy: rand(1.2, 2.6), vz: rand(-0.3, 0.3),
      life: rand(0.3, 0.6), size: rand(0.16, 0.3), sizeEnd: 0.02, color: FLAME, colorEnd: FLAME_END, drag: 1, gravity: -1.5,
    });
  }
}
