// What each boss does of its own as its fight goes (entities/bossKit.ts), registered by its behaviour module as it
// loads (the Ossuary Twins', entities/twins.ts). A module of its own that imports nothing: the bosses' modules and the
// toolkit import each other through enemyAI, and a table in the toolkit wasn't made yet when a boss's module
// registered itself.
import type { Enemy } from './enemy';
import type { EnemyId } from '../data/enemies';

/** What a boss does of its own as its phases come and go and its parts break (each optional). */
export interface BossHooks {
  /** phase `phase` begun, where the fight is simulated (its gameplay: the Twins' survivor faster) */
  enter?(e: Enemy, phase: number): void;
  /** phase `phase` over as the next begins, where the fight is simulated */
  exit?(e: Enemy, phase: number): void;
  /** phase `phase` begun, on every game (its own sound or effect beside the banner) */
  cue?(e: Enemy, phase: number): void;
  /** a hero's hit of `amount` taken (and not its last), where the fight is simulated */
  hurt?(e: Enemy, amount: number): void;
  /** each frame it lives, on every game: what its look does each frame (the Twins' chain laid between them, its snap
   *  past its reach where the fight is simulated) */
  frame?(e: Enemy, dt: number): void;
}

const HOOKS: Partial<Record<EnemyId, BossHooks>> = {};

/** `kind`'s hooks (its behaviour module registers them as it loads). */
export function bossHooks(kind: EnemyId, hooks: BossHooks): void { HOOKS[kind] = hooks; }

/** `kind`'s hooks, if it has any. */
export const hooksOf = (kind: EnemyId): BossHooks | undefined => HOOKS[kind];
