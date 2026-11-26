// Developer-only biome switching: keep the run and replace foes and upcoming spawns with counterparts.
import { G } from '../state';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { clearEnemies } from '../entities/enemy';
import { spawnEnemy } from '../entities/spawner';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { remapWaveSpawns } from '../game/run';
import { biomeReady, readyBiome } from '../game/biomeReady';
import { sendBiomeSwap } from '../net/sync';
import { renderMenu } from '../ui/menus';

/** The rosters use corresponding roles in corresponding positions; a boss maps to the other biome's boss on the same
 *  rung of its ladder (round again past its end). */
export function biomeCounterpart(type: EnemyId, to: BiomeId): EnemyId {
  if (ENEMIES[type].dummy || ENEMIES[type].broughtBy) return type;
  if (ENEMIES[type].boss) {
    const rung = Math.max(0, BIOME_IDS.map((id) => BIOMES[id].bosses.findIndex((b) => b.id === type)).find((i) => i >= 0) ?? 0);
    const ladder = BIOMES[to].bosses;
    return ladder[rung % ladder.length].id;
  }
  const target = BIOMES[to].pool(Infinity).map(([id]) => id);
  if (target.includes(type)) return type;
  const source = BIOME_IDS.map((id) => BIOMES[id].pool(Infinity).map(([foe]) => foe)).find((pool) => pool.includes(type));
  return target[source?.indexOf(type) ?? -1]
    ?? target.find((id) => ENEMIES[id].ai === ENEMIES[type].ai) ?? target[0];
}

export function changeDevBiome(to: BiomeId): void {
  if (to === G.arena.biome) return;
  // (one not built yet: built and warmed first, game/biomeReady.ts)
  if (!biomeReady(to)) { void readyBiome(to).then(() => changeDevBiome(to)); return; }
  const standing = G.enemies.filter((foe) => foe.alive).map((foe) => ({
    type: biomeCounterpart(foe.type, to), id: foe.id, pos: foe.pos.clone(), world: foe.obj.position.clone(), hero: foe.hero, training: foe.training,
    lifeMult: foe.lifeMult, health: foe.life / foe.maxLife, facing: foe.facing, spawning: foe.spawning,
  }));
  for (const player of G.players) player.stopChannel();
  clearProjectiles(); clearEffects(); clearEnemies();
  G.arena.setBiome(to);
  remapWaveSpawns((type) => biomeCounterpart(type, to));
  sendBiomeSwap(to);
  for (const old of standing) {
    const foe = spawnEnemy(old.type, old.pos, { wave: G.run?.wave ?? 1, hero: old.hero, training: old.training, lifeMult: old.lifeMult, id: old.id });
    foe.life = foe.maxLife * old.health;
    foe.facing = foe.targetFacing = old.facing;
    foe.spawning = old.spawning;
    foe.invulnerable = old.spawning > 0;
    foe.obj.position.copy(old.world);
    foe.animate(0, G.time, 0);
  }
  if (G.mode === 'menu') renderMenu();
}
