// What a boss's fight costs a hero (tools/lab `boss --parts threat`): each boss at the same wave, risen and left to
// fight a hero who stands still near it, stands still far off, or walks round it far off (a kiter, at his own speed),
// at its whole life and in its later phases. The damage that lands on him is counted (his own `takeDamage`, after
// armour, block and ward), his Health kept whole meanwhile, and said as a share of his most Health a minute, with the
// hits that landed. Standing still is the worst a player can do, and walking round it the cheapest way to keep away
// (from Kenneth, of the Stag of Ash: "it seems very easy to avoid this boss"): neither is a fight's damage, but each
// reads every boss alike, so the bosses compare. Asked for by name, as it takes two minutes of play.
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
import { cameraYaw } from '../../../src/core/renderer';
import { bossAt, fixed, standIn, type BossOptions } from './boss';

/** the wave every boss is measured at (the Rootmother's rung), and the frames each case runs */
const WAVE = 10;
const FPS = 60;
const CASE_FRAMES = 12 * FPS;
/** how far off the boss the hero stands, past its body (m): within its close attacks, and well out of them */
const NEAR = 3;
const FAR = 11;
/** its life's shares in its later phases (the Rootmother's second, and her last: her rage) */
const LATER = [0.45, 0.2];

/** The bosses compared, where each fights, and whether held from her root cage (the Rootmother's other row): the
 *  Thornwood's three (the Bell-Warden read 112 to 144% whole, 207 to
 *  221% at 45% and 310 to 330% at 20%, as a ranger standing still, before the Stag took its place here to keep a run
 *  near two minutes) */
const BOSSES: { kind: EnemyId; biome: BiomeId; uncaged?: boolean }[] = [
  { kind: 'thornheart', biome: 'forest' },
  { kind: 'rootmother', biome: 'forest' },
  { kind: 'rootmother', biome: 'forest', uncaged: true },
  { kind: 'stag', biome: 'forest' },
];
/** her cage's wait while held from it (s): past any case */
const NEVER = 1e9;

/** How the hero meets it: standing still near it, standing still far off, or walking round it far off. */
type How = 'near' | 'far' | 'circling';
const HOWS: How[] = ['near', 'far', 'circling'];

/** how hard he steers back onto his circle for each metre he's off it, against walking on round it */
const BACK_ONTO = 0.5;

/** One case's damage: what landed (his Health's share a minute) and how many hits. */
interface Landed { share: number; hits: number }

/** The touch stick pushed to walk the hero along world way (x, z), as the screen turns it (the inverse of
 *  `Player.handleInput`'s turn by the camera's yaw), at full push. */
function stickToward(x: number, z: number): [number, number] {
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw), length = Math.hypot(x, z) || 1;
  return [(x * cy - z * sy) / length, (x * sy + z * cy) / length];
}

/** The stick's push that walks the hero round a circle `round` m about (cx, cz), the way the angle grows, steering
 *  back onto it when he's off it (knocked, thrown). */
function roundCircle(cx: number, cz: number, round: number): [number, number] {
  const hero = G.player, rx = hero.pos.x - cx, rz = hero.pos.z - cz, d = Math.hypot(rx, rz) || 1;
  const off = round - d;
  return stickToward(rz / d + (rx / d) * off * BACK_ONTO, -rx / d + (rz / d) * off * BACK_ONTO);
}

/** The damage landing on the local hero while `frames` frames run, summed from his own `takeDamage`; walking round
 *  where `boss` stood as the case began at its radius and `FAR` where `circling`, by the touch stick as a player walks
 *  (placed by the lab round its live middle, he ran beside its charges, and his speed set by hand never reached what
 *  aims at a moving hero, which his own walk set again). */
async function landedOver(lab: Lab, boss: Enemy, circling: boolean): Promise<Landed> {
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
  const round = boss.radius + FAR, cx = boss.pos.x, cz = boss.pos.z;
  try {
    await lab.step(CASE_FRAMES, () => (circling ? { stick: roundCircle(cx, cz, round) } : {}));
  } finally {
    hero.takeDamage = own;
    await lab.step(1, () => ({ stick: [0, 0] }));
  }
  const minutes = CASE_FRAMES / FPS / 60;
  return { share: taken / hero.stats.maxLife / minutes, hits };
}

/** Boss `kind` at the wave, met as `how` asks, its life at `life` of its most: what lands on him. */
async function oneCase(lab: Lab, options: BossOptions, kind: EnemyId, biome: BiomeId, how: How, life: number,
  uncaged = false): Promise<Landed> {
  await standIn(lab, options.fixture, biome);
  const boss: Enemy = await bossAt(lab, kind, ENEMIES[kind].radius + (how === 'near' ? NEAR : FAR), true, WAVE);
  if (uncaged) boss.brain.cageT = NEVER;
  // (the canary: her damage taken away, read-only to the game, set here alone)
  if (options.canary && kind === 'rootmother') (boss as { damage: number }).damage = 0;
  // (taken by a hit, as the fight takes it: set alone, its later phase never began)
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  return landedOver(lab, boss, how === 'circling');
}

/** `threat`: each boss at wave 10 fighting a hero standing near, standing far and walking round it far off, whole and
 *  in its later phases. */
export async function threat(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const cls = G.player.cls.id;
  lines.push(`threat: the ${cls}, each boss at wave ${WAVE}, ${CASE_FRAMES / FPS} s a case, standing near (${NEAR} m `
    + `past its body), far (${FAR} m) or walking round it far off: the damage landing on him, a share of his most `
    + 'Health a minute (hits)');
  for (const { kind, biome, uncaged } of BOSSES) {
    let landed = 0;
    for (const life of [1, ...LATER]) {
      const row: string[] = [];
      for (const how of HOWS) {
        const got = await oneCase(lab, options, kind, biome, how, life, uncaged);
        landed += got.share;
        row.push(`${how} ${fixed(got.share * 100, 0)}% (${got.hits})`);
      }
      const who = uncaged ? `${kind} without her cage` : kind;
      lines.push(`threat: ${who} ${life === 1 ? 'whole' : `at ${life * 100}%`}: ${row.join(', ')}`);
    }
    if (!(landed > 0)) problems.push(`threat: ${kind} landed nothing on the hero`);
  }
}
