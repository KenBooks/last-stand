// Minimal typed event bus so systems can react to each other without hard imports.
import type { Enemy } from './entities/enemy';
import type { Player } from './entities/player';
import type { Item } from './types';
import type { BiomeId } from './data/biomes';

export interface GameEvents {
  enemyKilled: [enemy: Enemy];
  playerDied: [player: Player];
  playerHurt: [amount: number];
  lootGained: [item: Item];
  waveCleared: [wave: number];
  waveStarted: [wave: number];
  /** the arena shows another biome (`world/arena.ts` `setBiome`) */
  biomeChanged: [biome: BiomeId];
  /** the hall of heroes' room shown in the place's stead */
  hallShown: [];
  /** a training dummy struck (its meter heard the hit) */
  dummyHit: [];
  /** the first visit's training moved on: a step done, finished or skipped (`game/training.ts`) */
  trainingChanged: [];
}

type Handler<K extends keyof GameEvents> = (...args: GameEvents[K]) => void;
type AnyHandler = (...args: never[]) => void;
const handlers = new Map<keyof GameEvents, Set<AnyHandler>>();

export function on<K extends keyof GameEvents>(name: K, fn: Handler<K>): () => void {
  let set = handlers.get(name);
  if (!set) { set = new Set(); handlers.set(name, set); }
  const s = set;
  s.add(fn as unknown as AnyHandler);
  return () => { s.delete(fn as unknown as AnyHandler); };
}

export function emit<K extends keyof GameEvents>(name: K, ...args: GameEvents[K]): void {
  const set = handlers.get(name);
  if (set) for (const fn of set) (fn as unknown as Handler<K>)(...args);
}
