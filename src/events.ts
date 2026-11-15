// Minimal typed event bus so systems can react to each other without hard imports.
import type { Enemy } from './entities/enemy';
import type { Player } from './entities/player';
import type { Item } from './types';
import type { BiomeId } from './data/biomes';

export interface GameEvents {
  enemyKilled: [enemy: Enemy];
  /** a boss entered phase `phase` of its fight (entities/bossKit.ts), on every game */
  bossPhase: [enemy: Enemy, phase: number];
  playerDied: [player: Player];
  playerHurt: [amount: number];
  lootGained: [item: Item];
  waveCleared: [wave: number];
  waveStarted: [wave: number];
  /** the arena shows another biome (`world/arena.ts` `setBiome`) */
  biomeChanged: [biome: BiomeId];
  /** the hall of heroes' room shown in the place's stead */
  hallShown: [];
  /** a house's room shown in the village's stead, or the village back (null: `Arena.showRoom`) */
  roomShown: [room: import('./data/houses').RoomId | null];
  /** a training dummy struck (its meter heard the hit) */
  dummyHit: [];
  /** the first visit's training moved on: a step done, finished or skipped (`game/training.ts`) */
  trainingChanged: [];
  /** the village's tutorial moved on: a station begun or left, a step done (`game/tutorial.ts`) */
  tutorialChanged: [];
  /** the local player threw an item on the lobby's floor, took one off it, put one on from the stash */
  itemThrown: [item: Item];
  itemTaken: [item: Item];
  itemEquipped: [item: Item];
  /** the local hero began a skill (a cast, a draw or a channel), by its behaviour (`SkillDef.impl`) */
  skillUsed: [impl: string];
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
