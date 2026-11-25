// Shared domain types. Data files (src/data) are typed against these, and the
// systems consume them, so adding a class / enemy / skill is type-checked.
import type * as THREE from 'three';
import type { createKit } from './core/materials';
import type { Joints } from './entities/models/rig';
import type { Dye } from './entities/models/dye';
import type { HeroLook } from './data/heroLooks';
import type { Hand } from './entities/models/hands';
import type { ArmBuild } from './entities/models/build';
import type { BiomeId } from './data/biomes';
import type { EnemyId } from './data/enemies';

// ---------------------------------------------------------------------------
// Damage & stats

export type DamageType = 'arcane' | 'cold' | 'fire' | 'lightning' | 'physical' | 'vitality';

/** Stats rolled on items (keys of data/items STATS). */
export type StatKey =
  | 'damagePct' | 'arcanePct' | 'elementalPct' | 'life' | 'energy' | 'lifeRegen' | 'energyRegen'
  | 'castSpeed' | 'cdr' | 'crit' | 'critDmg' | 'moveSpeed' | 'leech' | 'armor' | 'resist' | 'block' | 'blockAmount';

export type StatBlock = Partial<Record<StatKey, number>>;

/** Class base stats (before items). */
export interface BaseStats {
  life: number;
  energy: number;
  lifeRegen: number;
  energyRegen: number;
  moveSpeed: number;
  crit: number;
  critDmg: number;
  armor: number;
  resist: number;
}

/** Final derived character stats (base + items). */
export interface DerivedStats {
  maxLife: number;
  maxEnergy: number;
  lifeRegen: number;
  energyRegen: number;
  moveSpeed: number;
  crit: number;
  critDmg: number;
  armor: number;
  resist: number;
  damagePct: number;
  arcanePct: number;
  elementalPct: number;
  castSpeed: number;
  cdr: number;
  leech: number;
  /** % chance to block a hit (shields), and the damage a block absorbs */
  block: number;
  blockAmount: number;
}

// ---------------------------------------------------------------------------
// Classes & skills

export type SkillKey = 'mouse0' | 'mouse2' | '1' | '2' | '3' | '4' | 'q';
/** pose a model plays while the skill casts; a class's model interprets each name in its own way */
/** `point`: a shot from the staff or weapon, held level at the target while shots follow each other. `bow`: an
 *  arrow drawn to the face and loosed (`ActionState.draw`, `loosed`, `pitch`). */
export type CastAnim = 'cast' | 'summon' | 'drink' | 'point' | 'bow' | 'slam' | 'buff' | 'channel' | 'swing' | 'charge' | 'chop' | 'smite' | 'spin' | 'block' | 'stagger' | 'flurry' | 'punch' | 'pounce' | 'rampage' | 'bloodrush' | 'wrath' | null;

/** Skill tuning data. Behavior-specific numbers are optional fields. */
export interface SkillDef {
  key: SkillKey;
  impl: string;
  name: string;
  desc: string;
  tags: string[];
  cost: number;
  cooldown: number;
  /** the cast's length; for a drawn shot (`draw`) what follows the release: the follow-through and the next arrow */
  castTime: number;
  channel?: boolean;
  /** a bow drawn while its key is held: the seconds to full draw. Let go, it looses with what it drew (a share of
   *  the full draw's speed, `power`), never less than `minDraw` */
  draw?: number;
  minDraw?: number;
  /** aimed while its key is held, where it would land shown (`InstantSkill.aim`), and cast as the key is let go (touch
   *  casts its buttons' skills on release already) */
  aimed?: boolean;
  icon: { glyph: string; color: string };
  /** VFX colors */
  color?: number;
  trailEnd?: number;
  // behavior parameters (used by specific impls)
  damage?: number;
  missiles?: number;
  spread?: number;
  speed?: number;
  splitCount?: number;
  splitDamage?: number;
  range?: number;
  shards?: number;
  radius?: number;
  /** Steel Tempest: how fast the hero spins (rad/s), quickened by cast speed as a cast is; it strikes once each so far
   *  round, so a slower spin strikes less often and harder */
  spin?: number;
  scatter?: number;
  /** area damage at `radius`, as a share of a direct hit (eased in between) */
  edge?: number;
  chill?: number;
  length?: number;
  width?: number;
  moveMult?: number;
  /** a cast that leaves the hero free to move (drinking a draught): full speed, facing the way they go, not the aim; it still blocks every other skill */
  freeMove?: boolean;
  /** cast over another skill being cast or held, which goes on and lands as it would (Bull Rush: a Power Strike
   *  charged, then the charge, the strike landing as it runs; Steel Tempest held, the charge spinning) */
  overCast?: boolean;
  freeze?: number;
  duration?: number;
  pull?: number;
  absorbPct?: number;
  /** a healing beam (no `healPct`): the Health it restores a second, before the healer's All Damage.
   *  A draught: the Health it restores, a fixed amount and a share of the hero's most on top (the fixed part keeps a
   *  small Health pool's draught from shrinking with it) */
  heal?: number;
  healPct?: number;
  /** a strike that may set what it hits alight (combat/burn.ts): how likely, its fire damage a second, for how long */
  burn?: { chance: number; perSecond: number; seconds: number };
  /** a charged strike let go at once: its share of the full charge's damage and reach */
  least?: number;
  /** a mark: the extra share of damage its target takes from every player's hits */
  amp?: number;
  /** a wall raised across the aim (the ranger's Hedgeward, `world/wards.ts`): how wide and tall it stands (m) and its
   *  life as a breakable prop's (`hp`, in the props' own hits: `PROP_DAMAGE`). With a `duration` it comes apart after
   *  that long; without, it stands until broken or its wave is cleared */
  wall?: { width: number; height: number; life: number };
  /** a shot through foes: its damage on each foe it passes through in turn, as a share (the last for every one after) */
  falloff?: number[];
  /** a charge that rams a crowd is stunned at its stop (Bull Rush, #560): by the weight of the foes it met */
  ram?: RamDef;
  /** a charge that carries what it meets is slowed and stopped by its load (Bull Rush, #397) */
  push?: PushDef;
  /** a drawn shot's extra damage when loosed at full draw, as a share */
  fullBonus?: number;
  /** melee arc in radians */
  arc?: number;
  knock?: number;
  /** energy restored per enemy hit */
  gain?: number;
  /** the warrior's fists (#400, combat/frenzy.ts): the Frenzy a blow that lands builds (a punch, a pounce, a foe a
   *  dash meets), the most one cast builds, and whether holding it keeps the Frenzy from decaying (Rampage) */
  frenzy?: number;
  frenzyMost?: number;
  frenzyHolds?: boolean;
  /** blows a skill lands one after another on what it strikes (Pounce's on the foe pinned) */
  blows?: number;
  /** Wrath: the damage each stack of Frenzy spent adds to its `damage` */
  perStack?: number;
  /** a channel opens over this many seconds before it acts (its look and pose show the opening) */
  opening?: number;
  /** when the cast lands, as a fraction of the cast time (default 0.55) */
  fireAt?: number;
  /** Raise Shield: blocks absorb this many times the block amount */
  block?: number;
  /** only works with a shield, a two-handed weapon, a weapon in each hand, something in a hand (`armed`: a weapon or
   *  a shield), nothing in either (`bare`), a weapon in the main hand (`weapon`) or none there (`fist`: whatever the
   *  other holds); otherwise the key uses the fallback for the gear held */
  needs?: 'shield' | 'twoHanded' | 'dual' | 'armed' | 'bare' | 'weapon' | 'fist';
  fallback?: { shield?: string; twoHanded?: string; dual?: string; oneHanded?: string; bare?: string };
  /** its tuning with the weapons held one way, over its own (a two-hander's slower, heavier blows, two blades' quicker,
   *  lighter ones): `loot/loadout.ts` `forStyle` */
  styles?: Partial<Record<HeldStyle, StyleTuning>>;
  /** set by a style's tuning: what that way of holding the weapons does to its damage, in a few words, which its
   *  tooltip adds to what its figures are made of (Bull Rush's shield, #398) */
  styleNote?: string;
  /** a channel cast with no weapon held from either hand or both (the mage's lance, #402): its damage and its
   *  Energy a second from both hands at once; from one hand its own */
  both?: { damage: number; cost: number };
  /** only cast through a weapon of this school (a staff's own spell); held with another, or with none, its key casts
   *  that school's instead (`loot/loadout.ts` `resolveFor`) */
  school?: School;
}

/** A two-hander's lower grip as the other hand holds it: whether it does, whether it isn't on it on purpose (the
 *  weapon on the shoulder, the flask in that hand, or the hand coming onto it as the weapon comes off the shoulder),
 *  and how far it is from it (the grip short of the arm's reach,
 *  m; the arm's joints past their ranges holding it, degrees; the arm into the body, m). */
export interface LowerGrip { held: boolean; free: boolean; short: number; past: number; into: number }

/** How a hand holds a handle (`Model.fists`): how far the handle passes from where the fist closes round it (m), how
 *  far along it that is from where the fist holds it (m, up the handle positive), how far its fingers are curled
 *  (rad, their joints' mean bend: 0 straight), and how far the handle is off the way across its palm (rad) */
export interface Fist { hand: 'left' | 'right'; off: number; along?: number; curl: number; across?: number }

/** How the weapons are held: each has its own loadout (for a class with gear-driven skills). */
export type WeaponStyle = 'shield' | 'twoHanded' | 'dual' | 'oneHanded';

/** The school of magic a weapon is attuned to (the mage's staffs): it sets the spell the weapon itself casts. */
export type School = 'arcane' | 'fire' | 'lightning' | 'healing';

/** What a loadout is kept under: how the weapons are held, the school of the one held, or `bare`: none held by a
 *  class whose weapons have schools, or both hands empty (no weapon, no shield) for one whose skills go by the gear. */
export type HeldStyle = WeaponStyle | School | 'bare';

/** The hands a hero with none full casts a channel from (`SkillDef.both`): one of its keys held is a hand, the
 *  first key bound to it the left's and the second the right's, two held together both. */
export type CastHands = 'left' | 'right' | 'both';

/** A class on the hero selection screen: its role in a few words, how it plays (each trait 1 to 5), and the skill it
 *  shows off as the camera comes to it, cast at a spot `at` (m, in front of it and to its right, as it faces); a
 *  channel held for `hold` s. */
export interface HallDef {
  role: string;
  traits: { label: string; value: number }[];
  showcase: { skill: string; at: [ahead: number, right: number]; hold?: number };
  /** the velvet of his banner behind him in the hall (0-255 a channel: `bannerCloth`) */
  banner: [number, number, number];
}

/** What a weapon style may change of a skill. */
export type StyleTuning = Partial<Pick<SkillDef, 'castTime' | 'damage' | 'gain' | 'spin' | 'styleNote' | 'ram' | 'frenzy'>>;

export interface ClassDef {
  id: string;
  name: string;
  tagline: string;
  model: string;
  /** CSS colour of the class name in the lobby */
  accent: string;
  /** title of the lobby's skill loadout panel */
  book: string;
  /** how the hero selection screen presents the class (ui/heroSelect.ts, game/hall.ts) */
  hall: HallDef;
  /** the light that follows the cast point (`drawn`: lit only while a shot is held at full draw, as its glint is), the
   *  motes drifting off the off-hand (if any), and the light the off-hand gives (if it glows: the mage's) */
  aura: { light: number; intensity: number; drawn?: boolean; motes?: [color: number, end: number]; hand?: { light: number; intensity: number } };
  base: BaseStats;
  skills: SkillDef[];
  starterGear: { slot: Slot; rarity: RarityId; ilvl: number }[];
  /** items in his stash from the start, each of a named base: given once to his profile, a new one or one already
   *  played (`Profile.starterGiven`), so every weapon style can be tried without finding one */
  starterStash?: { slot: Slot; rarity: RarityId; ilvl: number; base: string }[];
  /** item base names per slot (default: data/items SLOT_INFO) */
  bases?: Partial<Record<Slot, string[]>>;
  /** stats that never roll on this class's items (no skill of the class uses them) */
  excludeStats?: StatKey[];
  /** slots omitted from random loot (e.g. an archer whose bows always occupy both hands) */
  excludeSlots?: Slot[];
  /** implicit stats per slot, replacing the defaults (data/items SLOT_INFO) */
  implicits?: Partial<Record<Slot, [StatKey, number][]>>;
  /** how much Health this class's items roll, against the default (1): each class's Health from gear in about the
   *  ratio of its own, so the tougher classes stay as far ahead as gear grows */
  gearLife?: number;
  /** weapon bases held in both hands: they leave no room for an off-hand */
  twoHanded?: string[];
  /** a one-handed weapon can go in the off-hand too */
  dualWield?: boolean;
  /** a bow's hero: the seconds to take an arrow from the quiver and nock it, before a shot with none on the string, and how
   *  long without a shot before the one on it goes back in the quiver */
  quiver?: { fetch: number; idle: number };
  /** its weapons are attuned to schools: those one rolls (the first is what a weapon saved before there were schools
   *  is, and the starter's), and the skill their spells' key casts with no weapon held */
  schools?: { roll: School[]; bare: string };
}

/** What the character holds, derived from the equipped items (drives model and skills). */
export interface Gear { weapon: string | null; twoHanded: boolean; shield: boolean; /** a weapon held in the off-hand */ offWeapon: string | null; /** a head item is worn (a model may show a helmet over the hair) */ helm: boolean; /** a chest item is worn (the body armour; without it the clothes under it) */ chest: boolean; /** a hands item is worn (gloves and bracers; without them bare hands) */ hands: boolean;
  /** each worn item's rarity, by the slot it's shown in: Rare and up glow in its colour (models/itemGlow.ts) */
  rarity: Partial<Record<GlowSlot, RarityId>>;
  /** the school of the weapon held (none: no weapon, or a class whose weapons have no schools) */
  school?: School | null }

/** the slots whose items a hero's model shows */
export type GlowSlot = 'weapon' | 'offhand' | 'head' | 'chest' | 'hands';

// ---------------------------------------------------------------------------
// Items

export type Slot = 'weapon' | 'offhand' | 'head' | 'chest' | 'hands' | 'amulet' | 'ring';
export type RarityId = 'common' | 'magic' | 'rare' | 'epic' | 'legendary' | 'ascendant' | 'ultimate';

export interface Item {
  id: string;
  slot: Slot;
  rarity: RarityId;
  ilvl: number;
  name: string;
  base: string;
  stats: StatBlock;
  /** a weapon's school, for a class whose weapons have them (none saved: the class's first) */
  school?: School;
}

/** The house of records' numbers for one hero (game/chronicle.ts), counted from the day it was built: runs that ended in
 *  death and in a bank, the most waves cleared in one run, the longest run (s), the most foes slain and damage dealt in one
 *  run, damage over all, partners raised, runs played in a party, each skill's casts in runs (by its `impl`), items banked
 *  by rarity (by its id), and each boss slain (by its enemy id). */
export interface ChronicleRecords {
  deaths: number; banks: number; mostWaves: number; longestRun: number; mostKills: number; mostDealt: number;
  dealt: number; revives: number; coopRuns: number;
  casts: Record<string, number>; bankedBy: Record<string, number>; bosses: Record<string, number>;
}

/** One class's saved progress: every class keeps its own gear, stash and records. */
export interface Profile {
  classId: string;
  equipped: Partial<Record<Slot, Item>>;
  stash: Item[];
  /** bestReached: highest attempted normal wave per biome (including deaths); bestWave: best wave cleared in any biome; bestBanked: per biome, the best wave whose spoils were banked
   *  (the lobby's starting-wave range); kills and time (seconds) over every run, counted since save slots came */
  records: { bestWave: number; bestBanked: Partial<Record<BiomeId, number>>; bestReached: Partial<Record<BiomeId, number>>; runs: number; banked: number; bestScore: number; kills?: number; time?: number;
    /** what the house of records shows besides (game/chronicle.ts), counted since it came */
    chronicle?: ChronicleRecords };
  /** when it was last saved (ms since the epoch): shown as "last played" on the save slots screen */
  saved?: number;
  /** the village's merchant's stock for this hero (loot/merchant.ts), and the runs begun when he last restocked */
  merchant?: { stock: Item[]; restockedAt: number };
  /** his look and hair colour (data/heroLooks.ts; none kept: his first look, his own hair) */
  look?: HeroLook;
  /** its class's starter stash has been given to it (`ClassDef.starterStash`) */
  starterGiven?: boolean;
  /** what the village's folk remember of this hero (ui/talk.ts), by who they are: how many times they've talked, and
   *  the nodes of their talk he's heard */
  talk?: Record<string, { visits: number; heard: string[] }>;
}

// ---------------------------------------------------------------------------
// Enemies

/** every way a foe fights (`EnemyDef.ai`): enemyAI.ts's own, and a foe's own added by its file in entities/foes/
 *  (`declare module`), so a new foe's way touches no shared list */
export interface EnemyAIKinds { melee: true; ranged: true; slam: true; boss: true; idle: true }
export type EnemyAIKind = keyof EnemyAIKinds;

/** What a hero's attack is, as a foe sees it coming (entities/evade.ts): a shot (an arrow, a bolt), a wave along the
 *  ground (a crescent), a charge, a beam, or an area coming down (a rain of arrows, falling stars). */
export type ThreatKind = 'shot' | 'wave' | 'rush' | 'beam' | 'area';

/**
 * A charge's stun at its stop, by the weight of the crowd it rammed (`SkillDef.ram`, combat/skills/bullRush.ts): each
 * foe it met weighs its kind's `heft` (`EnemyDef.heft`, 1 by default), an elite `elite` times that and one the charge
 * killed `killed` times it. Under `at` of weight nothing; from `at`, `least` s, rising evenly to `most` s at `full` and
 * held there.
 */
export interface RamDef { at: number; full: number; least: number; most: number; elite: number; killed: number }

/**
 * What a charge's load does to it (`SkillDef.push`, combat/ram.ts `loadOf`): each living foe it carries weighs its
 * kind's `heft`, an elite `RamDef.elite` times that, and the hero's All Damage % lightens the whole by `gear` of its
 * share (at +100% and `gear` 0.5, two thirds of it). Each weight carried takes `slow` of the charge's speed, and at
 * `most` it stops where it is. With nothing carried it goes as far as ever, whatever the gear. A boss is never
 * carried: it stops the charge.
 */
export interface PushDef { most: number; slow: number; gear: number }

/**
 * How a foe gets out of an attack it sees coming, at random, rolled once an attack (entities/evade.ts): it ducks into
 * the ground ('duck': a shot flies over what's left of it, struck only low, at its feet) or blinks to a spot nearby
 * clear of the attack ('blink'). It sees only what comes from a hero within `sees` (rad) either side of its facing.
 */
export interface EvadeDef {
  how: 'duck' | 'blink';
  /** the chance it gets out of each attack it sees */
  chance: number;
  /** the attacks it gets out of */
  from: readonly ThreatKind[];
  /** how far either side of its facing it sees an attack coming (rad) */
  sees: number;
  /** ducked: how long it stays down (s), and how high it still stands over the ground (m) */
  down?: number;
  top?: number;
  /** blinked: how far it goes (m, the nearest and the farthest) */
  reach?: readonly [number, number];
}

/**
 * What a slamming foe throws at a hero too far off to slam (entities/throws.ts): 'lava', a chunk lobbed on a high arc
 * at where he stood, its landing marked on the floor as it flies, bursting there and leaving a pool that burns;
 * 'vine', a tendril sent creeping along the floor in a line through anything in its way, holding a hero its tip
 * meets to the ground for `hold` s (a dash tears him free). It throws from `from` m out to `reach`, its own windup,
 * recover and cooldown.
 */
export interface ThrowDef {
  what: 'lava' | 'vine';
  from: number;
  reach: number;
  windup: number;
  recover: number;
  cooldown: number;
  /** lava: the chunk's time in the air at its nearest and per metre further (s) */
  flight?: readonly [number, number];
  /** lava: the burst's radius (m) and its share of `damage` */
  splash?: readonly [number, number];
  /** lava: the pool's radius (m), how long it burns (s) and its share of `damage` a second */
  pool?: readonly [number, number, number];
  /** vine: how fast it creeps (m/s), how near its tip a hero is caught (m) and how long he's held (s) */
  creep?: readonly [number, number, number];
}

export interface EnemyDef {
  name: string;
  model: string;
  ai: EnemyAIKind;
  life: number;
  damage: number;
  damageType: DamageType;
  speed: number;
  radius: number;
  range: number;
  windup: number;
  recover: number;
  cooldown: number;
  cost: number;
  score: number;
  keepAway?: number;
  slamRadius?: number;
  /** glow scales the bolt's brightness (default 1) and core its visible size as a fraction of radius (default
   *  0.7); pale colours bloom far more than deep ones, and a boss fires a dozen at once */
  /**
   * `look` instead of a glowing bolt (`trail` is then the colour of its smoke): 'spore', a swirling spore orb;
   * 'void', a dark orb with a burning rim and a comet tail; 'magma', a burning chunk of rock (fx/riftBolts.ts)
   */
  projectile?: { speed: number; radius: number; color: number; trail?: number; glow?: number; core?: number; look?: 'spore' | 'void' | 'magma' };
  /** boss colour: aura, slam telegraph and shockwaves, death flash */
  accent?: number;
  /** walk cycle speed per unit moved (default 2.3; small, skittering enemies use more) */
  gait?: number;
  summon?: string;
  knockbackResist?: number;
  freezeResist?: number;
  boss?: boolean;
  /** training dummy: never dies, meters the damage it takes instead */
  dummy?: boolean;
  /** the weight it puts up as a hero's charge rams it (`RamDef`): 1 by default, a slammer and a boss more */
  heft?: number;
  /** how it gets out of an attack it sees coming */
  evade?: EvadeDef;
  /** what it throws at a hero too far off for its slam */
  throws?: ThrowDef;
  /** a boss's fight in phases and its telegraphed attacks (entities/bossKit.ts) */
  bossKit?: BossKitDef;
  /** a boss that shares its life with another rising with it (data/biomes.ts `BossWave.twin`): a hit on either takes
   *  it from both (entities/twins.ts) */
  shares?: EnemyId;
  /** the pair's name, on the target frame while both stand */
  pair?: string;
}

/** A phase of a boss's fight: the share of its life it begins under (the first's is 1), and the line the banner says
 *  as it begins (none: no banner, its cue alone). */
export interface BossPhaseDef {
  below: number;
  banner?: string;
}

/** A telegraphed attack: its warning (s: the boss shows it coming, the hit landing as it ends) and its recovery after
 *  (s). The action's `hit` share is `warn / (warn + recover)`, for its model too (`ActionState.hit`). */
export interface TelegraphDef {
  warn: number;
  recover: number;
}

/** The boss toolkit's data (entities/bossKit.ts): the phases by life share, entered in order where the fight is
 *  simulated and told to every game (a banner, a cue, `BossHooks.enter`), and its telegraphed attacks by action name. */
export interface BossKitDef {
  phases: BossPhaseDef[];
  attacks?: Record<string, TelegraphDef>;
}

/** What a boss's model is told of its fight each frame (`AnimState.boss`): its phase. */
export interface BossLook {
  phase: number;
}

// ---------------------------------------------------------------------------
// Models & animation

/** `t`: the action's progress (0..1). `hit`: an enemy's attack or slam, the progress at which its blow lands
 *  (the data's windup): its model brings the blow down to connect then, which is when the damage comes.
 *  A channel's also has `time` (seconds since it began) and `open` (0..1 through its opening, 1 once open,
 *  or at once without one). */
export interface ActionState {
  name: string; t: number; hit?: number; time?: number; open?: number;
  /** a channel cast with no weapon held: the hands it's cast from (`Player.hands`) */
  hands?: CastHands;
  /** a spin: how far round the body has turned since it began (rad, to the left) */
  turn?: number;
  /** a bow: how far it is drawn (0..1, of the full draw's time) and, once loosed, the seconds since, and the arrow's
   *  angle above level for the target */
  draw?: number; loosed?: number; pitch?: number;
  /** a bow: the heading the arrows fly (rad, like a body's facing), how many are nocked and how far apart they fan (rad) */
  yaw?: number; arrows?: number; fan?: number;
  /** a bow's shot with no arrow on the string: how far the hand is through taking one from the quiver first (0..1) */
  fetch?: number;
  /** the warrior's fists (#400): which form of the move it is (Wrath's 0 a hook,
   *  1 a slam, 2 a quake), and a flurry's blows so far with the share of the next thrown (Rampage's: 2.4 the third
   *  blow two fifths out) */
  form?: number; beat?: number;
  /** a punch's hand where its skill chose it: +1 the lead hand's jab, -1 the rear hand's cross (else they take turns) */
  hand?: number;
  /** a dash run under it (a skill cast as Bull Rush's charge runs): its own name and share, for its legs and the
   *  lean of its body posed under the action's arms */
  under?: { name: string; t: number };
}

/** Per-frame input to a model's procedural animation. */
export interface AnimState {
  t: number;
  dt: number;
  phase: number;
  move: number;
  moveDir?: number;
  lean?: number;
  action: ActionState | null;
  hit: number;
  /** 1 at the moment a shield blocks a hit, fading out over a quarter second */
  blockHit?: number;
  /** the warrior with both hands empty: his fists held up in their guard (foes on him, hurt or striking a moment ago) */
  guard?: boolean;
  /** -1 = alive, otherwise 0..1 death progress */
  dead: number;
  /** a boss with a fight in phases (`EnemyDef.bossKit`): what its model shows of it */
  boss?: BossLook;
  charge?: number;
  /** a bow's hero: how many arrows are on the string (`Player.nocked`) */
  nocked?: number;
  /** what an overhead blow comes down on: the nearest foe on the line straight ahead (its middle, how wide it is and
   *  the height of its top, in the world), or none, the ground (`Player.struckAhead`) */
  strike?: Struck | null;
  /** turns the chest, neck and head onto what the character looks at: a model with cloth calls it before
   *  the leg IK and the cloth step, so the sleeves follow the arms the turn moves; `weight` 0 eases the look back
   *  ahead (a drawn bow's aim: left uncalled, a glance's eyes stayed turned and its head snapped back) */
  look?: (weight?: number) => void;
  /** sat on a log or a stone (`entities/sitting.ts`, posed by `models/sit.ts`), or none */
  sit?: SitState | null;
}

/** How far a hero is sat (`w`: 0 standing, 1 sat), his hips' pivot over the floor and his feet ahead of it (m), on the
 *  floor where he stood to sit if they reach it. */
/** How far an idle hero has sat (`entities/sitting.ts`): his hands' work before his body goes down (`before`: 0..1,
 *  `Model.sitHands`), his body's way down (`w`), his hands' work once he's sat (`after`), his hips' height and his
 *  feet's way ahead (m). Getting up, each runs back in turn. */
export interface SitHands {
  before: number; after: number; /** his hands only once he's up, not on his way */ last?: boolean; /** his way up, if not the sit's own (s) */ up?: number;
  /** getting up, his facing turned from the seat's by `angle` (radians, + to his left) as his hands' stage runs back:
   *  in from its end to `inTo`, back from `backFrom` to `backTo` (a two-hander picked up off the floor by a fire, turned
   *  to face it) */
  turn?: SitTurn;
}

export interface SitTurn {
  angle: number; inTo: number; backFrom: number; backTo: number;
  /** and a step as he turns in, kept once he's up (m, in the seat's frame: x to his left, z ahead), to stand by what he
   *  takes up */
  step?: [number, number];
  /** or turned to face `yaw` and stepped to `at`, both in the world (rad, m on the floor): to stand where what he takes
   *  up lies, wherever it lies */
  yaw?: number;
  at?: [number, number];
  /** or how far turned and stepped he is at each moment of his hands' stage (0 to 1), from a keyed move: in place of
   *  `inTo`, `backFrom` and `backTo` */
  by?: (before: number) => number;
}

export interface SitState { w: number; hip: number; foot: number; before: number; after: number }

/** A foe an overhead blow comes down on (`AnimState.strike`): its middle on the ground, its radius and its top (m). */
export interface Struck { x: number; z: number; r: number; top: number }

export type MaterialKit = ReturnType<typeof createKit>;

export interface Model {
  root: THREE.Group;
  kit: MaterialKit;
  animate(st: AnimState): void;
  height: number;
  /** cast origin (staff tip / orb) */
  tip?: THREE.Object3D;
  /** the weapon's own tip where `tip` isn't on it (a bow's upper limb's: its `tip` is the nocked arrow's middle, where
   *  the shot leaves, which stays where the last arrow left the string until the next is laid on it) */
  weaponTip?: THREE.Object3D;
  /** the other hand's weapon tip, while there's a weapon in each (a charge gathers into both) */
  readonly offTip?: THREE.Object3D | null;
  /** a two-hander's lower grip, where the other hand holds it (none for any other weapon) */
  readonly offGrip?: THREE.Object3D | null;
  /** offhand focus point */
  palm?: THREE.Object3D;
  /** a bow's nocked arrow's head, along the arrow as it lies on the string (a full draw glints there) */
  arrowHead?: THREE.Object3D;
  /** skeleton, for humanoid models */
  joints?: Joints;
  /** the joint its head and all on it ride, where it has no `joints` (the training dummy): a hit on what rides it is
   *  a headshot (combat/strikes.ts `onHead`; with `joints`, theirs) */
  head?: THREE.Object3D;
  /** a hero's hands (models/hands.ts: the lab's `hands` builds one alone from them) */
  readonly hands?: { L: Hand; R: Hand };
  /** its arms' build, where what dresses its forearms is sized on it (models/build.ts) */
  readonly arm?: ArmBuild;
  /** seen through its own eyes (only the arms show, entities/viewModel.ts): adjust what reads badly from
   *  there (a sleeve hiding the hand, an arm raised out of the frame) */
  firstPerson?(on: boolean): void;
  /** through its own eyes, the field of view (vertical, degrees) its arms and what they hold are drawn with, by a camera
   *  of their own over the world's (core/renderer.ts `drawArms`); none: by the world's. Null: by their own camera at the
   *  world's lens this frame (drawn over the world, as large as the world would draw them) */
  armsFov?(): number | null;
  /** cloth simulated on the model's own joints (a sleeve; models/sleeve.ts): stepped in `animate` */
  readonly cloths?: { update(dt: number): void; reset(): void }[];
  /** re-settle simulated parts after a teleport */
  reset?(): void;
  /** show the equipped weapon / shield */
  setGear?(gear: Gear): void;
  /** direction of the current melee swing: +1 sweeps right to left, -1 left to right */
  readonly swing?: number;
  /** the weapons a strike is swinging this frame (none between strikes): what the swing's trail follows
   *  (fx/swingTrail.ts) */
  readonly swung?: readonly Blade[];
  /** through the eyes, the arm a swing keyed this frame (camera space, m; null when none did): what the lab holds the
   *  drawn arm to */
  readonly swingKeyed?: KeyedArm | null;
  /** through the eyes, the bones a swing lays out the arm with (viewSwing.ts `ArmBones`, m): the right arm's, or the
   *  left's with the weapon it holds (a dual wielder's off hand) */
  swingBones?(left: boolean): { upper: number; fore: number; hand: number; strike: number };
  /** a two-hander's lower grip as the other hand held it this frame (null without one; the lab's measures read it) */
  readonly lowerGrip?: LowerGrip | null;
  /** each hand holding a handle, and how it holds it (for the lab) */
  readonly fists?: readonly Fist[];
  /** a hero's cloth dyed in a player's colour (models/dye.ts, data/heroColours.ts) */
  readonly dye?: Dye;
  /** a hero's hair, brows and beard in a hair colour (data/heroLooks.ts `HairColour.rgb`; null: his look's own), by
   *  uniforms alone (models/head.ts `Head.setHair`) */
  setHair?(rgb: readonly [number, number, number] | null): void;
  /** how long his hands take to make ready before he sits (s, standing: a two-hander lowered off his shoulder), and
   *  once he's sat (a blade stuck into the ground), on a seat or on the floor (`floor`); getting up, the same back in
   *  turn (none if absent) */
  sitHands?(floor: boolean): SitHands;
  /** the hands' stage his getting up will take, asked while he's sat (a two-hander taken up off the floor by a fire
   *  takes longer than it took to lay down), where it differs from `sitHands` */
  sitHandsUp?(floor: boolean): SitHands;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Misc

/** an arm as a swing through the eyes keys it (camera space, m): its shoulder, its elbow, its grip, the weapon's way
 *  and the way its flat faces, how much of the arm drawn is the swing's (1: all of it; less as it takes over from the
 *  place before or fades from it), and how much of the arm's shoulder and elbow is (`armShare`: none where the hands
 *  place the weapon and the arm reaches it from its own shoulder, fitted, viewSwing.ts `ViewSwing.holds`) */
export interface KeyedArm {
  hand: 'right' | 'left';
  shoulder: XYZ;
  elbow: XYZ;
  grip: XYZ;
  dir: XYZ;
  flat: XYZ;
  weight: number;
  armShare: number;
}

/** a held weapon's striking part, by two points on its grip: from near a blade's root to its point, or a head's lower
 *  end to its top */
export interface Blade { from: THREE.Object3D; to: THREE.Object3D }

export interface XZ { x: number; z: number }
export interface XYZ { x: number; y: number; z: number }

/** Transient effect: return false from update() to be removed. */
export interface Effect {
  update(dt: number): boolean;
  dispose?(): void;
  cancel?(): void;
  /** it stays with the game rather than with a cast, and draws only what it's given (a drawn arrow's motes, the aim's
   *  path, the spent arrows' meshes): a harness counts what it draws, not it */
  standing?: boolean;
}

/** A prop's footprint on the floor (a circle), and `h`: the height of its top. Everything walks round
 *  it; only a shot below its top hits it (projectiles fly level, so they pass over low cover). */
export interface Obstacle { x: number; z: number; r: number; h: number; /** what an arrow meets here where this isn't a breakable prop (the fountain's tiers and basin: `propSurface`) */ drawn?: readonly import('three').Object3D[]; /** how far round and how tall it stands to the eye where that isn't what stops a body and a shot (a fountain's tiers over its basin: `core/heroHidden.ts`) */ sight?: { r: number; h: number }; /** set on a breakable prop's circles: the prop they belong to (`world/destructible.ts`) */ prop?: import('./world/destructible').Prop }
