// What a foe's own file in entities/foes/ adds to the game as it loads (entities/allFoes.ts loads every one): its
// models' builders, the attack effects it plays through `fx` (enemyAI.ts), its own way of fighting. Each new foe was
// an entry in four shared tables (models/index.ts, enemyAI.ts's FX and AI, the unions in types.ts and damage.ts), and
// every PR adding one conflicted with every other there. A module of its own that imports nothing at run time: the
// foes' modules and enemyAI import each other, and a table in enemyAI wasn't made yet when a foe's module registered.
import type { Model } from '../types';
import type { Enemy } from './enemy';

/** every model's builder by id: the heroes' (models/index.ts) and each foe's (its file in entities/foes/) */
export const MODEL_BUILDERS: Record<string, () => Model> = {};

/**
 * A foe's own attack effects, by name, each with plain numeric arguments (as enemyAI.ts's `FX`), added by its file
 * in entities/foes/ (`declare module '../foeKit' { interface FoeFx { ... } }`) so `fx('name', ...)` is typed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FoeFx {}

/** the effects every game plays by name: enemyAI.ts's own and each foe's (the same table: `FX` there) */
export const FX_TABLE: Record<string, (...args: number[]) => void> = {};

/** each way of fighting by its `ai` kind: enemyAI.ts's own and each foe's (the same table: `AI` there) */
export const AI_TABLE: Record<string, (e: Enemy, dt: number) => void> = {};

/** Model builders added. */
export function foeModels(builders: Record<string, () => Model>): void { Object.assign(MODEL_BUILDERS, builders); }

/** A foe's attack effects added (their names declared in `FoeFx`). */
export function foeFx(effects: { [K in keyof FoeFx]?: FoeFx[K] }): void { Object.assign(FX_TABLE, effects); }

/** A foe's own way of fighting added, under its `ai` kind (declared in types.ts's `EnemyAIKinds`). */
export function foeAI(kinds: Record<string, (e: Enemy, dt: number) => void>): void { Object.assign(AI_TABLE, kinds); }
