// What a boss's fight costs a hero (tools/lab `boss --parts threat`): each boss at the same wave, risen and left to
// fight a hero who stands still, first near it and then far off, at its whole life and in its later phases. The damage
// that lands on him is counted (his own `takeDamage`, after armour, block and ward), his Health kept whole meanwhile,
// and said as a share of his most Health a minute, with the hits that landed. Standing still is the worst a player
// can do: it isn't a fight's damage, but it reads every boss alike, so the bosses compare. Asked for by name, as it
// takes a minute of play.
//
// The Rootmother is read twice, with her root cage and held from it (`uncaged`), so what the cage adds to her threat
// reads in one run.
//
// `--canary` takes the Rootmother's damage away: her rows must read nothing landing, and the part says so.
import type { Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { ENEMIES, type EnemyId } from '../../../src/data/enemies';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { bossAt, fixed, standIn, type BossOptions } from './boss';

/** the wave every boss is measured at (the Rootmother's rung), and the frames each case runs */
const WAVE = 10;
const FPS = 60;
const CASE_FRAMES = 20 * FPS;
/** how far off the boss the hero stands, past its body (m): within its close attacks, and well out of them */
const NEAR = 3;
const FAR = 11;
/** its life's shares in its later phases (the Rootmother's second, and her last: her rage) */
const LATER = [0.45, 0.2];

/** The bosses compared, where each fights, and whether held from her root cage (the Rootmother's other row). */
const BOSSES: { kind: EnemyId; biome: BiomeId; uncaged?: boolean }[] = [
  { kind: 'thornheart', biome: 'forest' },
  { kind: 'rootmother', biome: 'forest' },
  { kind: 'rootmother', biome: 'forest', uncaged: true },
  { kind: 'colossus', biome: 'crypt' },
];
/** her cage's wait while held from it (s): past any case */
const NEVER = 1e9;

/** One case's damage: what landed (his Health's share a minute) and how many hits. */
interface Landed { share: number; hits: number }

/** The damage landing on the local hero while `frames` frames run: summed from his own `takeDamage`. */
async function landedOver(lab: Lab, frames: number): Promise<Landed> {
  const hero = G.player;
  const own = hero.takeDamage.bind(hero);
  let taken = 0, hits = 0;
  hero.takeDamage = (amount, type, from) => {
    const r = own(amount, type, from);
    if (r && r.taken > 0) {
      taken += r.taken;
      hits++;
    }
    return r;
  };
  try {
    await lab.step(frames, () => ({}));
  } finally {
    hero.takeDamage = own;
  }
  const minutes = frames / FPS / 60;
  return { share: taken / hero.stats.maxLife / minutes, hits };
}

/** Boss `kind` at the wave, `away` m past its body from the hero, its life at `life` of its most: what lands on him. */
async function oneCase(lab: Lab, options: BossOptions, kind: EnemyId, biome: BiomeId, away: number, life: number,
  uncaged = false): Promise<Landed> {
  await standIn(lab, options.fixture, biome);
  const boss: Enemy = await bossAt(lab, kind, away, true, WAVE);
  if (uncaged) boss.brain.cageT = NEVER;
  // (the canary: her damage taken away, read-only to the game, set here alone)
  if (options.canary && kind === 'rootmother') (boss as { damage: number }).damage = 0;
  // (taken by a hit, as the fight takes it: set alone, its later phase never began)
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  return landedOver(lab, CASE_FRAMES);
}

/** `threat`: each boss at wave 10 fighting a hero standing still, near and far, whole and in its later phase. */
export async function threat(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const cls = G.player.cls.id;
  lines.push(`threat: the ${cls} standing still, each boss at wave ${WAVE}, ${CASE_FRAMES / FPS} s a case: the damage `
    + 'landing on him, a share of his most Health a minute (hits)');
  for (const { kind, biome, uncaged } of BOSSES) {
    const row: string[] = [];
    let landed = 0;
    for (const life of [1, ...LATER]) {
      for (const [where, away] of [['near', NEAR], ['far', FAR]] as const) {
        const got = await oneCase(lab, options, kind, biome, ENEMIES[kind].radius + away, life, uncaged);
        landed += got.share;
        row.push(`${life === 1 ? 'whole' : `at ${life * 100}%`} ${where} ${fixed(got.share * 100, 0)}% (${got.hits})`);
      }
    }
    lines.push(`threat: ${kind}${uncaged ? ' without her cage' : ''}: ${row.join(', ')}`);
    if (!(landed > 0)) problems.push(`threat: ${kind} landed nothing on a hero standing still`);
  }
}
