// `lab taken`: what a wave's foes deal a second to one hero who stands among them and doesn't fight back, the most a
// wave can put on him (a player moving and killing takes less), beside what the healing beam gives a second
// (Lifethread, src/combat/skills/lifethread.ts) at a hero's Health early and late, at no gear and at +150% damage.
// Each wave is set off in each biome from a seed of its own and played at the game's own pace; the hero is kept up
// past any blow (his Health held far over his most each frame) and every blow on him is read as it lands
// (`Player.takeDamage`): what the foe sent, what reached his Health after his block, ward and armour. Read from the
// first blow on, over `seconds` of the game's time.
// `--canary` makes the hero untouchable as the wave comes (`guardUntil`): no blow may be read, which must be found.
import type { Fixture, Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import mage from '../../../src/data/classes/mage';
import { threadHeal } from '../../../src/combat/skills/lifethread';
import { setOffWave } from './spawnWaves';

export interface TakenOptions {
  fixture: Fixture;
  biomes: BiomeId[];
  waves: number[];
  /** the game's seconds read from the first blow on */
  seconds: number;
  canary: boolean;
}

/** One blow on the hero: when (the game's time), what the foe sent, what reached his Health. */
interface Blow {
  time: number;
  sent: number;
  taken: number;
}

/** what the hero's Health is held at each frame, times his most: no wave's blows in a frame reach it */
const KEPT_UP = 1000;
/** the game's seconds a wave is waited for to land its first blow */
const FIRST_BLOW_SECONDS = 40;
/** where the hero stands unless the command says: the arena's middle */
const MIDDLE: [number, number] = [0, 0];
/** the seed of the first wave read, each next one the next */
const TAKEN_SEED = 0x2c1b3c6d;
/** the heroes' Health the beam's heal is set beside: an early hero's, and wave 40's (from play: "5-6k health") */
const HEALTH_ROWS = [1000, 6000];
/** the healer's All Damage the beam's heal is set beside: none, and well-geared */
const DAMAGE_ROWS = [0, 150];
/** the most the beam's ramp raises it by */
const RAMPED = 2;

/** Every blow that lands on the hero from here until `stop` is called. */
function blowsOnHero(hero: Player): { blows: Blow[]; stop: () => void } {
  const blows: Blow[] = [];
  const take = hero.takeDamage.bind(hero);
  hero.takeDamage = (amount, type, from) => {
    const result = take(amount, type, from);
    if (result) blows.push({ time: G.time, sent: amount, taken: result.taken });
    return result;
  };
  const stop = (): void => {
    delete (hero as { takeDamage?: unknown }).takeDamage;
  };
  return { blows, stop };
}

/** What one wave dealt him: blows and their sums a second, the worst second, and the foes about. */
interface WaveRead {
  biome: BiomeId;
  wave: number;
  blows: number;
  sentPerSecond: number;
  takenPerSecond: number;
  worstSecond: number;
  mostFoes: number;
  maxLife: number;
}

/** The most taken in any one second of the blows' (a window sliding blow to blow). */
function worstSecond(blows: Blow[]): number {
  let worst = 0;
  let start = 0;
  let sum = 0;
  for (const blow of blows) {
    sum += blow.taken;
    while (blow.time - blows[start].time >= 1) {
      sum -= blows[start].taken;
      start++;
    }
    worst = Math.max(worst, sum);
  }
  return worst;
}

/** A wave set off with the hero standing, read from its first blow on for `seconds`. */
async function readWave(lab: Lab, options: TakenOptions, biome: BiomeId, wave: number, index: number):
Promise<WaveRead> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const fixture = { ...options.fixture, at: options.fixture.at ?? MIDDLE };
  await setOffWave(lab, fixture, { index, seed: TAKEN_SEED + index, number: wave });
  lab.lifeShare = KEPT_UP;
  const hero = lab.player;
  if (options.canary) hero.guardUntil = Infinity;
  const { blows, stop } = blowsOnHero(hero);
  let mostFoes = 0;
  const countFoes = (): void => {
    mostFoes = Math.max(mostFoes, G.enemies.filter((foe) => foe.alive).length);
  };
  const stepUntil = async (done: () => boolean): Promise<void> => {
    while (!done()) {
      await lab.step(1);
      countFoes();
    }
  };
  try {
    const startedAt = G.time;
    await stepUntil(() => blows.length > 0 || G.time - startedAt > FIRST_BLOW_SECONDS);
    if (blows.length) {
      const from = blows[0].time;
      await stepUntil(() => G.time - from >= options.seconds);
    }
  } finally {
    stop();
    hero.guardUntil = 0;
    lab.lifeShare = 1;
  }
  const seconds = options.seconds;
  const sum = (pick: (blow: Blow) => number): number => blows.reduce((total, blow) => total + pick(blow), 0);
  return {
    biome,
    wave,
    blows: blows.length,
    sentPerSecond: sum((blow) => blow.sent) / seconds,
    takenPerSecond: sum((blow) => blow.taken) / seconds,
    worstSecond: worstSecond(blows),
    mostFoes,
    maxLife: hero.stats.maxLife,
  };
}

const whole = (value: number): string => String(Math.round(value));

/** A wave's line: what it sent, what reached him, the worst second, in seconds of his own Health. */
function waveLine(read: WaveRead): string {
  return `${read.biome} wave ${read.wave}: ${read.blows} blows, ${whole(read.sentPerSecond)} a second sent, `
    + `${whole(read.takenPerSecond)} taken (the worst second ${whole(read.worstSecond)}), up to ${read.mostFoes} `
    + `foes standing; his own most Health ${whole(read.maxLife)}`;
}

/** The beam's heal a second beside the waves: at each hero's Health and healer's All Damage, unramped and at its most. */
function beamLines(): string[] {
  const def = mage.skills.find((skill) => skill.impl === 'lifethread');
  if (!def) return ['no Lifethread in the mage\'s skills'];
  const lines = ['Lifethread a second (a flat ' + def.heal + ' by the healer\'s All Damage, '
    + `${((def.healPct ?? 0) * 100).toFixed(1)}% of the healed one's most Health, ×1 to ×${RAMPED} held):`];
  for (const life of HEALTH_ROWS) {
    for (const damagePct of DAMAGE_ROWS) {
      const heal = threadHeal(def, damagePct, life);
      lines.push(`  a hero of ${life} Health, the healer at +${damagePct}% all damage: ${whole(heal)} unramped, `
        + `${whole(heal * RAMPED)} at ×${RAMPED}`);
    }
  }
  return lines;
}

/** `lab taken`: each wave in each biome, what it deals a second to a hero standing among its foes. */
export async function taken(lab: Lab, options: TakenOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  let index = 0;
  for (const biome of options.biomes) {
    for (const wave of options.waves) {
      const read = await readWave(lab, options, biome, wave, index++);
      lines.push(waveLine(read));
      if (read.blows === 0) problems.push(`${biome} wave ${wave}: no blow landed on him in ${FIRST_BLOW_SECONDS} s`);
    }
  }
  lines.push(...beamLines());
  return { text: lines.join('\n'), problems };
}
