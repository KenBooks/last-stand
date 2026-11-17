// Contract for skill behaviors. Class data (SkillDef) references an impl by name.
import type * as THREE from 'three';
import type { Player } from '../../entities/player';
import type { ActionState, CastAnim, DamageType, DerivedStats, SkillDef } from '../../types';

/** A kind of hit a skill deals, as its tooltip tells it (`ui/skillDamage.ts`): one hit's damage before the hero's
 *  modifiers, kept beside the code that deals it so the two can't drift apart. */
export interface SkillHit {
  /** what one hit is: 'foe' (each foe struck once), 'cut', 'arrow', 'tick'... */
  per: string;
  /** one hit's damage before the hero's modifiers */
  base: number;
  /** the type it lands as */
  type: DamageType;
  /** the tags its damage scales by, where they aren't the skill's own */
  tags?: readonly string[];
  /** how many it deals a second, for one dealt over time (a channel's ticks, a zone's): its damage a second shown too */
  rate?: number;
  /** the least share of `base` a hit of it can deal (an edge's, a falloff's, a draw's cut short): 1 if not given */
  least?: number;
  /** how `base` comes about, in a few words (a split's share, a full draw's bonus) */
  note?: string;
}

interface SkillBase {
  anim: CastAnim;
  /** the hits it deals a hero of these stats, for its tooltip: none for a skill that deals no damage */
  hits?(def: SkillDef, stats: DerivedStats): SkillHit[];
  /** its dash is what it does (a charge, a blink: `Player.startDash`): never cast as another dash runs, even one that
   *  lets skills be cast. Any other skill's dash cast in one that does rides on it (Twin Fangs' lunge in a charge) */
  dashes?: boolean;
  /** Meshes using the skill's own materials, compiled at load so the first cast doesn't hitch. */
  warm?(): THREE.Object3D[];
}

/** Fires once when the cast completes. */
export interface InstantSkill extends SkillBase {
  channel?: false;
  /** `power`: how far a drawn shot (`SkillDef.draw`) was drawn when it was loosed (0..1, 1 for any other cast) */
  cast(player: Player, def: SkillDef, target: THREE.Vector3, power: number): void;
  /** every frame of the cast before it lands; k: 0..1 of the cast time (a drawn shot: how far it is drawn) */
  charging?(player: Player, def: SkillDef, k: number, dt: number): void;
  /** a shot's angle above level (rad) at `power` for `target`, which the pose aims the arrow along */
  pitch?(player: Player, def: SkillDef, power: number, target: THREE.Vector3): number;
  /** whether there is anything to cast it at (a mark needs a foe): if not, the press does nothing and costs nothing */
  canCast?(player: Player, def: SkillDef, target: THREE.Vector3): boolean;
  /** `SkillDef.aimed`: every frame its key is held, where it would land for `target`, shown on its own player's screen
   *  alone (`null`: let go or given up, shown no more) */
  aim?(player: Player, def: SkillDef, target: THREE.Vector3 | null, dt: number): void;
  /** `SkillDef.aimed`: where it's cast for `target` as its key is let go, the point every game is given (Quarry
   *  Mark's: the middle of the foe its preview outlined, so each game marks that one); the aim itself if not given */
  settle?(player: Player, def: SkillDef, target: THREE.Vector3): THREE.Vector3;
  /** fills in the pose's action each frame of its cast (which form of the move it is: Savage Fists' hammer, Wrath's
   *  hook, slam or quake, `ActionState.form`) */
  pose?(player: Player, def: SkillDef, action: ActionState): void;
}

/** Runs every frame while its key is held. `start` returns per-channel state. */
export interface ChannelSkill<S = unknown> extends SkillBase {
  channel: true;
  start(player: Player, def: SkillDef): S;
  tick(player: Player, def: SkillDef, dt: number, state: S): void;
  stop(player: Player, def: SkillDef, state: S): void;
  /** fills in the pose's action each frame (a bow's channel: its draw, its loose and where it aims, as a shot's) */
  pose?(player: Player, def: SkillDef, state: S, action: ActionState): void;
}

export type SkillImpl = InstantSkill | ChannelSkill<any>;

/** A SkillDef whose listed tuning fields are required (skills narrow their def with this). */
export type Needs<K extends keyof SkillDef> = SkillDef & Required<Pick<SkillDef, K>>;
