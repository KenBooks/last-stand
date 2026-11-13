// The player character: input -> movement/skills, resources, damage, animation.
import * as THREE from 'three';
import { VILLAGE } from '../core/beta';
import { gaitRate, legLength, LookAt, type LegIK } from './models/ik';
import { stepVelocity } from './movement';
import { watchBody } from './models/anatomy';
import { G } from '../state';
import { CLASSES } from '../data/classes/index';
import { buildModel, modelSteps } from './models/index';
import { SKILL_IMPLS } from '../combat/skills/index';
import type { ChannelSkill, SkillImpl } from '../combat/skills/types';
import { computeStats, gearOf } from '../loot/items';
import { BLOCK, COOP, FULL_DRAW } from '../data/balance';
import { recorder } from '../perf/recorder';
import { SCHOOLS } from '../data/schools';
import { SKILL_KEYS, loadLoadout, saveLoadout, defaultLoadout, usableWith, resolveFor, weaponStyle, forStyle, type Loadout } from '../loot/loadout';
import { groundHeight } from '../world/arena';
import { resolveProps } from '../world/collision';
import { input, isDown, wasPressed } from '../core/input';
import { flashHurt, addShake, cameraYaw, lookFacing, viewMode, viewSettled, seenFromArms } from '../core/renderer';
import { floatText } from '../ui/floaters';
import { particles, col } from '../fx/particles';
import { sfx } from '../core/audio';
import { SHINE } from '../core/materials';
import { emit } from '../events';
import { angleDamp, damp, hitFlash, rand } from '../util';
import { applyShadowDetail, qualityLevel } from '../core/quality';
import { QUALITY } from '../data/quality';
import { castAsOne, type OneShadow } from './models/castAsOne';
import { farDetail, type FarDetail } from './models/farDetail';
import { drawAsOne, type OneDraw } from './models/drawAsOne';
import { countDown, countHealed, countTaken } from '../game/stats';
import { ownColour } from '../net/heroColour';
import type { HeroColourId } from '../data/heroColours';
import type { ActionState, CastAnim, CastHands, ClassDef, DamageType, DerivedStats, Gear, HeldStyle, Model, Profile, SkillDef, SkillKey, Struck } from '../types';
import type { Enemy } from './enemy';
import { walkPath } from '../world/walkPath';

/** How many times his speed he walks of himself to a spot (`?walkPace=3`: the stalls' `walks` crosses the village
 *  faster, its freezes the same in fewer seconds; 1 otherwise). */
const WALK_PACE = typeof location === 'undefined' ? 1
  : Math.min(8, Math.max(1, Number(/[?&]walkPace=([\d.]+)/.exec(location.search)?.[1] ?? 1)));

const _lookFrom = new THREE.Vector3(), _lookAt = new THREE.Vector3();
/** an overhead blow comes down on a foe whose near side is within this ahead (m: a two-hander's reach past the hands
 *  held before him), on the share of its height its top is taken at (the shoulders and the head) */
const STRUCK_REACH = 2.2, STRUCK_TOP = 0.85;
const _struck: Struck = { x: 0, z: 0, r: 0, top: 0 };

/** A skill the class knows: its tuning data + behavior. Keyed by `def.impl`. */
export interface KnownSkill { def: SkillDef; impl: SkillImpl }

/** Damage absorption shield (see the Iron Bellow skill). */
export interface Ward { amount: number; t: number; onHit?(absorbed: number): void; onEnd?(): void }

/** Absolute difference between two headings. */
/** after an attack or cast, the body stays on its aim this long (s) before turning to face the way it goes */
const AIM_HOLD = 0.45;
/** s: how long the hero must have been free of any action before the hotbar shows a consumable usable again */
const BUSY_HOLD = 0.15;
/** how near a point on his way to a spot the hero comes before heading for the next (m: about a stride) */
const ROUTE_PASSED = 0.6;
/** how far round his middle a hero's body keeps off what's round it (m) */
export const HERO_RADIUS = 0.45;
/** how fast the body turns at most onto the way it goes (rad/s): eased alone, it swung half round in four frames at a
 *  reversal, 38 degrees in the first, and the pelvis and legs snapped round with it */
const TURN_MOST = 9;
/** a shot from the weapon's tip heads for its target, but never further off the body's line to it than a point this far
 *  along that line (m) */
const SHOT_NEAR = 5;
/** where the glowing palm's light is held (m): under it, and out from the body beside it, so it pools on the ground
 *  and washes the coat, the hand itself a light's breadth away (at the palm the hand blew out white; under it alone,
 *  against the coat, it lit a hard spot on the skirt, a torch) */
const HAND_LIGHT = { below: 0.25, out: 0.2 };
/** how hard the wall holds a body pressed into it from sliding along it, a share of his speed into it: walked into it
 *  within 10° of square on, he stops (with none, he slid along a face he walked into square on without end; within
 *  31°, along the thicket he stopped at every rock and bush that turned its face 19° toward him) */
const WALL_GRIP = 0.18;
/** how hard he slows walking up to the wall (m/s²: a comfortable stop, not `BRAKE`'s hardest) */
const WALL_BRAKE = 10;
const angleOff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** a shot from a bow (posed as one, not channelled): it looses the arrow on the string */
const isBowShot = (s: KnownSkill): boolean => s.impl.anim === 'bow' && !s.impl.channel;

/** `replay`: a remote player's cast, shown for its pose and charge; its owner says when it fires. A drawn shot
 *  (`SkillDef.draw`) has `drawT`, the time to full draw, and no end or firing time until it's loosed (`key` the key
 *  holding it, `power` how far it was drawn) */
interface CastState { skill: KnownSkill; t: number; dur: number; fireAt: number; fired: boolean; target: THREE.Vector3; replay?: boolean; key?: SkillKey; drawT?: number; power?: number;
  /** a bow's shot with no arrow on the string: the seconds taking one from the quiver first (`ClassDef.quiver`), before the draw */
  nockT?: number }
interface ChannelState { skill: KnownSkill; key: SkillKey; state: unknown; t: number }
/** The hands `held` of a skill's `keys` cast it from: a key a hand, the first the left's, the next the right's and
 *  so on in turn; both once a key of each is held. */
function handsOf(keys: SkillKey[], held: SkillKey[]): CastHands {
  const sides = new Set(held.map((key) => (keys.indexOf(key) % 2 === 0 ? 'left' : 'right')));
  return sides.size > 1 ? 'both' : sides.has('right') ? 'right' : 'left';
}
/** How far a drawn shot is drawn (0 to 1): its time since its arrow was on the string, of its time to full draw. */
const drawShare = (c: CastState): number => Math.min(1, Math.max(0, c.t - (c.nockT ?? 0)) / (c.drawT ?? 1));
/** A movement skill's dash: a fixed velocity that input can't steer, with a per-frame hook; `lift`
 *  makes it a jump of that peak height, and `anim` is the pose it plays, over the rush and `hold`
 *  seconds more standing where it ended (a lunge's strikes follow through). */
/** A dash cast as an open one runs, riding on it (`Player.startDash`): its action, and its time so far and in all (s). */
interface Ride { anim: CastAnim; t: number; dur: number }
interface DashState { vx: number; vz: number; t: number; dur: number; hold: number; lift: number; anim: CastAnim; through: boolean; open: boolean; ride?: Ride; step?(): void; pace?(u: number): number }
/** `pace` (optional) is the share of the way covered by `u` (0..1 of `dur`), rising from 0 to 1: a dash that braces before it goes, or skids at its end, covering the same distance;
 *  `through`: it passes through the props on its way (a blink), where it ends clear of them; `open`: the hero casts
 *  his other skills as it runs and holds, all but another charge or blink (`SkillBase.dashes`; Bull Rush's charge: a
 *  strike landed as it runs, the skill posed over its legs, and a lunge riding on it) */
export interface DashOpts { lift?: number; anim?: CastAnim; hold?: number; through?: boolean; open?: boolean; step?(): void; pace?(u: number): number }

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** What the local player does that the other players' games replay (see net/session). */
export type PlayerAction =
  | { t: 'cast'; s: string; dur: number; x: number; z: number; /** a drawn shot: `dur` is its time to full draw */ h?: 1; /** a bow's arrow taken from the quiver first: its seconds (`CastState.nockT`) */ n?: number }
  | { t: 'fire'; s: string; x: number; z: number; px: number; pz: number; f: number; /** how far a drawn shot was drawn */ k?: number; /** how high the aim was on a prop */ y?: number }
  | { t: 'chs'; s: string; k: SkillKey; h?: CastHands }
  /** the hands a held channel is cast from changed (`Player.hands`) */
  | { t: 'chh'; h: CastHands }
  | { t: 'che' }
  /** a hit it took, as its own game judged it (shown on the others) */
  | { t: 'hurt'; r: HitResult }
  /** it fell (the host's run rules take it from there) */
  | { t: 'died' };
let actionSink: ((a: PlayerAction) => void) | null = null;
/** Co-op: where the local player's casts are reported. */
export function setActionSink(fn: ((a: PlayerAction) => void) | null): void { actionSink = fn; }

/** How a hit on a player turned out. It's worked out by the player's own game and shown from this on
 *  every screen. */
export interface HitResult { taken: number; blocked: number; broke: boolean; absorbed: number }

/** A remote player as its owner's reports have it at the moment shown (position, velocity, facing, aim: net/timeline). */
export interface RemoteState { x: number; z: number; vx: number; vz: number; f: number; ax: number; az: number }

/** Out of a co-op run for the rest of it: banked, or dead for good. */
export type PlayerOut = 'banked' | 'dead' | null;

/** how fast a light lit only at full draw eases in, as its glint comes, and out (`damp`'s rates: in over a quarter
 *  second, the glint at full draw's first moments was lit less than main's) */
const AURA_EASE = { in: 60, out: 12 };

/** the local hero's lights (`heroLights`) */
let lightsKept: { staff: THREE.PointLight; hand: THREE.PointLight } | null = null;

/**
 * The local hero's lights, the cast point's and the free hand's, made once and kept from hero to hero (each takes
 * them on and sets their colours): WebGPU keys every lit pipeline by the lights it's lit by, each by its id, so lights
 * made with each hero had every lit pipeline made again at a class switch, and the warm-up's compiles before the hero
 * was built (with a light standing in for his) went unused. The warm-up compiles the biome with them in.
 */
export function heroLights(): { staff: THREE.PointLight; hand: THREE.PointLight } {
  lightsKept ??= {
    staff: new THREE.PointLight(0xffffff, 0, 6, 2 + HELD_SOFT),
    hand: new THREE.PointLight(0xffffff, 0, 3.5, 2 + HELD_SOFT),
  };
  return lightsKept;
}

/** how soft the hero's own lights are close to (m squared, added to the square of the distance, as `LAMP_SOFT` is a
 *  lamp's; carried in their decay past 2, so nothing compiles): by the square alone, the mage's staff a hand's breadth
 *  from a cottage's plaster burned a white disc on it, "too bright, right?" */
const HELD_SOFT = VILLAGE ? 0.15 : 0;

export class Player {
  readonly cls: ClassDef;
  readonly model: Model;
  /** the head turning to the nearest foe (models/ik.ts) */
  private look: LookAt | null = null;
  /** a bow's hero (`ClassDef.quiver`): how many arrows are on the string (one between shots, a fan's for it); put back in
   *  the quiver after a while without a shot, and what a shot lacks taken out before it (a fan begun with one on the
   *  string takes out the other four: taking none, the four appeared on the string) */
  nocked = 0;
  private sinceShot = Infinity;
  readonly obj = new THREE.Group();
  /** follows the cast point; every class has one, so switching class keeps the light count. A
   *  remote player has none: another light would change the count and recompile every shader */
  readonly staffLight: THREE.PointLight | null;
  /** at the off-hand, lit where it glows (`ClassDef.aura.hand`); every class has one too, unlit without it */
  readonly handLight: THREE.PointLight | null;
  /** his pieces' shadow, cast in one draw (`models/castAsOne.ts`) */
  readonly shadow: OneShadow;
  /** his meshes drawn from fewer triangles seen from afar (`models/farDetail.ts`) */
  readonly farDetail: FarDetail;
  /** his parts drawn as one mesh a material, on WebGPU (`models/drawAsOne.ts`) */
  readonly drawn: OneDraw;
  /** how lit a light lit only at full draw is (`ClassDef.aura.drawn`), eased in and out */
  private auraLit = 0;
  /** played here (a co-op partner is remote: driven by what its own game reports) */
  readonly local: boolean;
  /** co-op: the player's place in the party (0 = the host), and its spawn point */
  slot = 0;
  /** co-op: a partner's name tag, as its player chose it (net/nameTag; the local player's is `session.tag`) */
  tag = '';
  /** the colour the hero wears (data/heroColours.ts; null: his own): the player's pick, in co-op the one the host gave
   *  (net/heroColour.ts) */
  colour: HeroColourId | null = null;
  readonly spawn = new THREE.Vector3(0, 0, 3);
  /** a remote player: its latest reported state */
  /** the time since he was last posed, and the frames counted to his next (a partner's at Very low: `poseEvery`) */
  private poseOwed = 0;
  private poseTurn = 0;
  readonly remote: RemoteState ={ x: 0, z: 3, vx: 0, vz: 0, f: Math.PI, ax: 0, az: 0 };

  readonly pos = new THREE.Vector3(0, 0, 3);
  readonly vel = new THREE.Vector3();
  /** the velocity the input steers the body towards (`stepVelocity`), told to the legs (`LegIK.intend`), and whether
   *  it has been set yet */
  private readonly goal = new THREE.Vector3();
  private steered = false;
  readonly aim = new THREE.Vector3();
  /** the foe whose body the aim is on (the local hero's: the eye's ray met it, `input.foe`) */
  aimFoe: Enemy | null = null;
  readonly radius = HERO_RADIUS;
  facing = Math.PI;
  /** how much longer the body stays on its aim after an attack or cast (s), see AIM_HOLD */
  private aimHold = 0;
  /** the facing follows the way the body goes (nothing aimed, cast or looked through the eyes): moving against it is
   *  only ever the moment before it has turned round */
  private facesWay = false;
  /** a drawn shot pressed for while busy (a tap during the last one's reload): it's drawn as soon as the hero is free, and
   *  forgotten when any other skill is pressed or cast; an aimed skill let go meanwhile, cast `at` where it was let go */
  private queued: { skill: KnownSkill; key: SkillKey; at?: THREE.Vector3 } | null = null;
  /** an aimed skill (`SkillDef.aimed`) whose key is held: where it would land is shown, and it's cast as the key is
   *  let go */
  aiming: { skill: KnownSkill; key: SkillKey } | null = null;
  phase = 0;
  /** which way the walk cycle runs: 1, or -1 backpedalling (see `cycleOn`) */
  private phaseDir = 1;
  /** true in the lobby: free casting, no costs, no cooldowns */
  sandbox = false;
  /** whether the hero may cast (in the village, in its training yard alone: game/village.ts) */
  armed = true;
  /** where he walks of himself, with no key or stick held (the village: an object clicked, walked to and used), or
   *  null; a key or the stick takes him back */
  walkTo: THREE.Vector3 | null = null;
  /** the way to `walkTo` (`world/walkPath.ts`): the points he heads for in turn, and the spot it was found for */
  private route: [number, number][] = [];
  private routeFor: THREE.Vector3 | null = null;

  /** all skills of the class, by id */
  readonly known = new Map<string, KnownSkill>();
  /** key -> skill id; any skill may be bound to any (or several) keys */
  loadout!: Loadout;
  /** the weapon style the loadout belongs to */
  private style: HeldStyle | null = null;
  /** the hands the channel held is cast from, for one cast with none full (`bare`): by its keys held here, as its
   *  own game reports them for a partner's copy */
  hands: CastHands = 'left';
  /** remaining cooldown per skill id (shared by every key bound to it) */
  readonly cooldowns = new Map<string, number>();

  stats!: DerivedStats;
  /** what the character holds (from the equipped items) */
  gear: Gear = { weapon: null, twoHanded: false, shield: false, offWeapon: null, helm: false, chest: false, hands: false, rarity: {} };
  /** seconds until the shield can block again, and when it last did */
  blockCd = 0;
  /** game time until which a broken guard keeps the shield down and the character staggered:
   *  it can move but not attack, cast or raise the shield */
  guardBroken = -1;
  get staggered(): boolean { return this.guardBroken > G.time; }
  /** game time until which a vine holds his feet to the ground (`root`): he can't walk, but a dash tears him free */
  rootedUntil = -1;
  get rooted(): boolean { return this.rootedUntil > G.time; }
  /** game time the hero was last busy with an action: casting, channelling, dashing or staggered */
  private busyAt = -Infinity;
  lastBlock = -99;
  life = 0;
  energy = 0;
  alive = true;
  deadT = -1;
  casting: CastState | null = null;
  channel: ChannelState | null = null;
  dash: DashState | null = null;
  ward: Ward | null = null;
  hitT = 0;
  flashAt = -1;
  lastLowEnergy = 0;
  private lastNoTarget = -99;

  // co-op
  /** at 0 health (alive false) but waiting for a teammate: seconds left before bleeding out */
  downed = false;
  bleed = 0;
  /** 0..1: how far a teammate is with raising this downed player */
  revive = 0;
  /** out of the run for good (banked, or dead): watching the rest of it */
  out: PlayerOut = null;
  /** not in the arena with us (a partner in the lobby while we fight, or the other way round) */
  away = false;
  /** game time until which a raised player can't be hurt */
  guardUntil = -1;
  /** getting back up after a revive: seconds left of the rise */
  rising = 0;
  /** the pause menu is open in co-op (the game can't stop for one player): the character stands idle */
  idle = false;
  /** whether he may glance round as he stands idle (models/glance.ts): the hall of heroes holds a hero's glances until
   *  his showcase is done */
  glances = true;
  /** a hero whose held spells make no sound (the hall of heroes' showcases: Void Lance's hum played on the opening
   *  screen, unasked); his own player's and a partner's sound as they're held */
  quiet = false;
  /** the most light a highlight on him reflects outside the eyes (`kit.u.uShine`; 0: as it is): the hall of heroes'
   *  key light a metre off put a glare on a shield's boss */
  shine = 0;
  /** a remote player holds its revive key (reported with its state) */
  reviving = false;

  /** the heroes built so far (a build is 100 to 200 ms: `lab behind` counts those a hero's choice makes) */
  static built = 0;

  /** Class `classId`'s hero built a piece at a time (`models/steps.ts`): his model's pieces, then the rest. */
  static *inSteps(classId: string, equipped: Profile['equipped'], local = true): Generator<void, Player, undefined> {
    const model = yield* modelSteps(CLASSES[classId].model);
    yield;
    return new Player(classId, equipped, local, model);
  }

  /** `model`: his model built already (`inSteps`). */
  constructor(classId: string, equipped: Profile['equipped'], local = true, model?: Model) {
    Player.built++;
    this.cls = CLASSES[classId];
    this.local = local;
    this.sandbox = !local;   // a remote player's casts replay as its owner fires them: no costs here
    const lights = local ? heroLights() : null;
    this.staffLight = lights?.staff ?? null;
    this.handLight = lights?.hand ?? null;
    if (lights) {
      lights.staff.color.set(this.cls.aura.light);
      lights.staff.intensity = this.cls.aura.intensity;
      lights.hand.color.set(this.cls.aura.hand?.light ?? 0xffffff);
      lights.hand.intensity = 0;
    }
    this.model = model ?? buildModel(this.cls.model);
    this.obj.add(this.model.root);
    this.obj.name = `hero ${classId}`;   // names show up in the perf report
    applyShadowDetail(this.obj);
    this.drawn = drawAsOne(this.model);
    if (local) this.setColour(ownColour());
    this.shadow = castAsOne(this.model.root, this.obj);
    this.farDetail = farDetail(this.model.root);
    G.scene.add(this.obj, ...(this.staffLight ? [this.staffLight] : []), ...(this.handLight ? [this.handLight] : []));

    for (const def of this.cls.skills) {
      const impl = SKILL_IMPLS[def.impl];
      if (!impl) throw new Error(`Missing skill impl "${def.impl}"`);
      this.known.set(def.impl, { def, impl });
    }
    this.recomputeStats(equipped);   // loads the loadout for the gear held
    this.reset();
  }

  /** Out of the scene, to be brought back whole (`unstowed`): a hero built ahead (`game/hall.ts`). His lights stay: they're
   *  every hero's (`heroLights`), and the scene's count of them every program's. */
  stowed(): void {
    G.scene.remove(this.obj);
  }

  /** Back in the scene from `stowed`, as if just built in `equipped`. */
  unstowed(equipped: Profile['equipped']): void {
    G.scene.add(this.obj);
    this.recomputeStats(equipped);
    this.reset();
    if (this.local) this.setColour(ownColour());
  }

  /** Dyes the hero's cloth in `colour` (null: his own). A material's colour alone: nothing compiles. */
  setColour(colour: HeroColourId | null): void {
    this.colour = colour;
    this.model.dye?.apply(this.model.root, colour);
  }

  /** Take the character out of the scene (switching class in the lobby). */
  dispose(): void {
    this.stopChannel();
    this.ward?.onEnd?.();
    // The two local lights belong to the scene, shared with cached heroes. Removing them changes every shader's key.
    G.scene.remove(this.obj);
    this.shadow.dispose();
    this.farDetail.dispose();
    this.drawn.dispose();
    this.obj.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) { m.skeleton.dispose(); (m.material as THREE.Material).dispose(); } });   // (skinned meshes own a copy of their material)
    this.model.dispose();
    // (its lights stay in the scene, the next hero's: `heroLights`. Taken out with a spare hero let go, the frame's 20
    // were 18 and a wave compiled 14 programs late)
  }

  /** Bind a skill (or nothing) to a key and persist the loadout (of the weapon style held). */
  bind(key: SkillKey, skillId: string | null): void {
    const s = skillId !== null ? this.known.get(skillId) : null;
    if (skillId !== null && (!s || !this.usable(s.def))) return;   // not with the gear held
    if (this.channel?.key === key) this.stopChannel();
    this.loadout[key] = skillId;
    saveLoadout(this.cls, this.gear, this.loadout);
  }

  /** Back to the class's default bindings for the weapon style held. */
  resetLoadout(): void {
    if (this.channel) this.stopChannel();
    this.loadout = defaultLoadout(this.cls, this.gear);
    saveLoadout(this.cls, this.gear, this.loadout);
  }

  /** The weapon style the loadout belongs to (null: the class has one loadout). */
  get weaponStyle(): HeldStyle | null { return this.style; }

  /** Whether the gear held allows a skill (some need a shield, some a two-handed weapon). */
  usable(def: SkillDef): boolean { return usableWith(def, this.gear); }

  /** The skill a key fires. A skill the gear doesn't allow gives way to its fallback for the gear held. */
  skillAt(key: SkillKey): KnownSkill | null {
    const id = this.loadout[key];
    const s = id ? this.known.get(id) ?? null : null;
    if (!s || this.usable(s.def)) return s;
    const alt = resolveFor(s.def, this.gear, this.cls);
    return alt ? this.known.get(alt) ?? null : null;
  }

  recomputeStats(equipped: Profile['equipped']): void {
    const prevLifePct = this.stats ? this.life / this.stats.maxLife : 1;
    this.stats = computeStats(this.cls.base, equipped);
    this.gear = gearOf(this.cls, equipped);
    this.fitToGear();
    this.model.setGear?.(this.gear);
    this.life = this.stats.maxLife * prevLifePct;
  }

  /**
   * The loadout and the skills as the gear held calls for: each weapon style has its own loadout (switching style
   * brings back the one left there), and each skill is as it is with the weapons held that way (a two-hander's blows
   * slower and heavier).
   */
  fitToGear(): void {
    const style = weaponStyle(this.cls, this.gear);
    if (this.loadout && style === this.style) return;
    if (this.channel) this.stopChannel();
    this.style = style;
    this.loadout = loadLoadout(this.cls, this.gear);
    for (const def of this.cls.skills) {
      const known = this.known.get(def.impl);
      if (known) known.def = forStyle(def, style);
    }
  }

  /** Stand at a spot facing a direction, as if always there. */
  place(pos: THREE.Vector3, facing: number): void {
    this.pos.set(pos.x, 0, pos.z);
    // (standing: a hero placed while walking glided on from the spot, a third of a metre)
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.obj.position.set(pos.x, groundHeight(pos.x, pos.z), pos.z);
    this.model.root.rotation.y = facing;
    this.model.reset?.();
  }

  reset(): void {
    this.endAim();
    if (this.channel) this.stopChannel();
    this.ward?.onEnd?.();
    this.life = this.stats.maxLife;
    this.energy = this.stats.maxEnergy;
    this.alive = true;
    this.deadT = -1;
    this.casting = null;
    this.channel = null;
    this.dash = null;
    this.ward = null;
    this.hitT = 0;
    this.blockCd = 0;
    this.guardBroken = -1;
    this.lastLowEnergy = 0;
    this.cooldowns.clear();
    this.downed = false;
    this.bleed = this.revive = this.rising = 0;
    this.out = null;
    this.guardUntil = -1;
    this.pos.copy(this.spawn);
    this.remote.x = this.spawn.x; this.remote.z = this.spawn.z;
    this.vel.set(0, 0, 0);
    this.model.kit.u.uDissolve.value = 0;
    this.show(!this.away);
    this.model.reset?.();
  }

  /** Show or hide the character. */
  show(v: boolean): void {
    this.obj.visible = v;
  }

  /** In the fight: standing, in the arena and still in the run (what enemies go for). */

  get active(): boolean { return this.alive && !this.away && !this.out; }
  /** Still in the run, standing or downed (not banked or dead for good). */
  get inRun(): boolean { return !this.away && !this.out; }

  // through the eyes, the weapon and hand in view: the model stays placed there until the next pose (and where arms
  // drawn by a camera of their own show it, renderer.ts `seenFromArms`)
  get castPoint(): THREE.Vector3 {
    const at = (this.model.tip ?? this.model.root).getWorldPosition(new THREE.Vector3());
    return this.eyes ? seenFromArms(at, at) : at;
  }

  /** seen through its own eyes (the local player in first person): effects that start at the body show
   *  from the camera, so some place themselves where they're seen instead */
  get eyes(): boolean { return this.local && viewMode() === 'first' && viewSettled(); }

  /** a drawn skill being held and not yet let go (ui/chargeMark.ts shows it at the aim): how far it's drawn (0..1,
   *  1 from `FULL_DRAW` of its time on) and how long it has been held (s); null with none */
  get charge(): { share: number; held: number } | null {
    const c = this.casting;
    if (!c?.drawT || c.fired || c.skill.impl.channel) return null;
    return { share: Math.min(1, drawShare(c) / FULL_DRAW), held: Math.max(0, c.t - (c.nockT ?? 0)) };
  }

  /** a drawn shot held at full draw and not yet loosed (the crosshair shows it bold: main.ts) */
  get drawnFull(): boolean {
    const c = this.casting;
    return !!c?.drawT && !c.fired && !c.skill.impl.channel && drawShare(c) >= FULL_DRAW;
  }

  /** Where a light for an effect round the body goes when seen through the eyes: ahead in the view, a
   *  little above it. At the body it's at the camera and burns the weapons in view white; straight above,
   *  their steel still mirrors it back into the view. */
  lightAhead(out: THREE.Vector3, ahead = 3, up = 0.6): THREE.Vector3 {
    const cam = G.camera.position, yaw = cameraYaw();
    return out.set(cam.x - Math.sin(yaw) * ahead, cam.y + up, cam.z - Math.cos(yaw) * ahead);
  }

  get palmPoint(): THREE.Vector3 {
    return (this.model.palm ?? this.model.root).getWorldPosition(new THREE.Vector3());
  }

  /** The heading (like `facing`) of a shot leaving `from` (the weapon's tip) for `target`: the way the body aims, closing
   *  on the target from `SHOT_NEAR` on. Aimed from the tip, out beside and ahead of the body, a target near the feet sent
   *  the shot sideways or back while the body faced it. */
  shotHeading(from: THREE.Vector3, target: THREE.Vector3): number {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return this.facing;
    const k = Math.max(d, SHOT_NEAR) / d;
    return Math.atan2(this.pos.x + dx * k - from.x, this.pos.z + dz * k - from.z);
  }

  cooldownOf(def: SkillDef): number { return def.cooldown * (1 - this.stats.cdr / 100); }
  cooldownLeft(id: string): number { return this.cooldowns.get(id) ?? 0; }

  // --- input & skills -------------------------------------------------------------
  handleInput(dt: number): void {
    if (this.idle || this.out) {
      // the co-op pause menu, or out of the run (banked, he's still standing, unseen): stand still and let go of
      // any channel
      this.goal.set(0, 0, 0);
      stepVelocity(this.vel, this.goal, dt);
      this.steered = true;
      if (this.channel) this.stopChannel();
      return;
    }
    // movement is screen-relative: W is away from the camera, whatever its yaw
    let mx = 0, mz = 0;
    if (isDown('w') || isDown('arrowup')) mz -= 1;
    if (isDown('s') || isDown('arrowdown')) mz += 1;
    if (isDown('a') || isDown('arrowleft')) mx -= 1;
    if (isDown('d') || isDown('arrowright')) mx += 1;
    // the touch stick is analog: a small push walks
    if (!mx && !mz) { mx = input.stick.x; mz = input.stick.y; }
    if (mx || mz) this.walkTo = null;
    const len = Math.hypot(mx, mz);
    let speed = this.stats.moveSpeed;
    if (this.casting && !this.casting.skill.def.freeMove) speed *= 0.45;
    if (this.channel) speed *= this.channel.skill.def.moveMult ?? 0.4;
    if (this.rooted) speed = 0;
    const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const k = len ? speed * Math.min(1, len) / len : 0;
    let tx = (mx * cy + mz * sy) * k, tz = (mz * cy - mx * sy) * k;
    // (walking of himself to a spot: along its way round what's in it, slowing over its last metre)
    if (this.walkTo && !len) {
      const [wx, wz] = this.routeStep(this.walkTo);
      const last = this.route.length <= 1;
      const dx = wx - this.pos.x, dz = wz - this.pos.z, d = Math.hypot(dx, dz);
      const v = d > 1e-3 ? (speed * WALK_PACE * (last ? Math.min(1, d) : 1)) / d : 0;
      tx = dx * v;
      tz = dz * v;
    }
    // (as a body moves itself, pushing and braking against the ground: turning round from a run takes a braking step
    // and a push the other way, `entities/movement.ts`)
    this.goal.set(tx, 0, tz);
    this.slowForWall(this.goal);
    stepVelocity(this.vel, this.goal, dt);
    this.steered = true;

    this.aim.copy(input.ground);
    this.aimFoe = input.foe;

    // a channel ends when every key that casts it is released (the same skill on two keys is held by either)
    if (this.channel) {
      const keys = this.keysOf(this.channel.skill), held = keys.filter((key) => isDown(key));
      if (!held.length) this.stopChannel();
      else this.holdWith(keys, held);
    }
    // (out of the village's yard nothing is cast: what was held is let go, what was aimed given up)
    if (!this.armed) {
      if (this.channel) this.stopChannel();
      this.endAim();
      this.queued = null;
      return;
    }
    this.holdAim();
    if ((input.mouse.overUI && !input.touchMode) || this.dashShut() || this.staggered) return;
    // the shot remembered from a press while busy: drawn now, and loosed at once if its key is up again (a tap)
    if (this.queued && !this.casting && !this.channel) { const q = this.queued; this.queued = null; this.tryCast(q.skill, q.key, q.at); }
    const busy = !!(this.casting || this.channel);
    for (const key of SKILL_KEYS) {
      const pressed = wasPressed(key);
      if (!isDown(key) && !pressed) continue;
      const skill = this.skillAt(key);
      if (!skill) continue;
      if (pressed && busy) this.queued = skill.def.draw && !skill.impl.channel ? { skill, key } : null;
      // (a tap up again within the frame still casts: read only while held, a 60 ms tap was lost at 10 fps)
      if (!isDown(key) && busy) continue;
      if (skill.impl.channel) { if ((!this.channel || this.channel.skill.def.block) && !this.casting) this.startChannel(skill, key); }
      else if (skill.def.aimed) { if (this.aiming?.key !== key) this.startAim(skill, key); }
      else this.tryCast(skill, key);
    }
  }

  /** An aimed skill's key held: aimed from now on (another being aimed is given up). */
  private startAim(skill: KnownSkill, key: SkillKey): void {
    this.endAim();
    this.aiming = { skill, key };
  }

  /**
   * The aimed skill let go: cast at the aim (once the hero is free, if an action is under way: as a shot pressed for
   * meanwhile, it waits for it).
   */
  private holdAim(): void {
    const a = this.aiming;
    if (!a) return;
    const held = isDown(a.key);
    if (held && this.skillAt(a.key) === a.skill) return;
    this.endAim();
    // (its key's skill changed under it, a style's loadout: given up)
    if (held) return;
    // (where its preview was as it was let go, however the aim moves while it waits: the outline round one foe, the
    // mark went on another)
    const impl = a.skill.impl, at = (!impl.channel && impl.settle?.(this, a.skill.def, this.aim)) || this.aim.clone();
    if (this.casting || (this.channel && !this.channel.skill.def.block) || this.dashShut() || this.staggered) this.queued = { skill: a.skill, key: a.key, at };
    else this.tryCast(a.skill, a.key, at);
  }

  /**
   * Where the aimed skill would land, shown for this frame: once the foes have moved (`main`'s update), as the cast
   * would find them. Shown during the hero's own update, a mark's preview trailed its foe by the frame's move.
   */
  showAim(dt: number): void {
    const a = this.aiming;
    if (a && !a.skill.impl.channel) a.skill.impl.aim?.(this, a.skill.def, this.aim, dt);
  }

  /** No skill aimed any more: its preview gone, and not cast (a touch press cancelled: `ui/touch.ts`). */
  endAim(): void {
    const a = this.aiming;
    if (!a) return;
    this.aiming = null;
    if (!a.skill.impl.channel) a.skill.impl.aim?.(this, a.skill.def, null, 0);
  }

  /** `key`: the key casting it, which holds a drawn shot (`SkillDef.draw`) until it's let go; `at`: where it's cast (the
   *  aim by default) */
  tryCast(s: KnownSkill, key?: SkillKey, at: THREE.Vector3 = this.aim): boolean {
    if (this.staggered || this.cooldownLeft(s.def.impl) > 0 || !this.alive) return false;
    // (over a cast or a channel only a skill cast over one, which leaves it going: Bull Rush as Steel Tempest spins; in
    // a dash only as an open one lets, and no charge or blink)
    if ((this.casting || (this.channel && !this.channel.skill.def.block)) && !s.def.overCast) return false;
    if (this.dash && (this.dashShut() || s.impl.dashes)) return false;
    if (!this.sandbox && this.energy < s.def.cost) { this.lowEnergy(); return false; }
    const target = at.clone();
    if (!s.impl.channel && s.impl.canCast && !s.impl.canCast(this, s.def, target)) { this.noTarget(); return false; }
    // Only a cast that can actually start lowers the shield; failed cooldown/energy/target checks keep it up.
    if (this.channel?.skill.def.block) this.stopChannel();
    const dur = s.def.castTime / (1 + this.stats.castSpeed / 100);
    const nockT = this.nockTime(s), n = nockT ? { n: nockT } : {};
    // (casting anything else forgets a queued shot)
    if (this.queued?.skill !== s) this.queued = null;
    if (s.def.draw && key) {
      // drawn while the key is held, loosed when it's let go (update)
      const drawT = s.def.draw / (1 + this.stats.castSpeed / 100);
      this.casting = { skill: s, t: 0, dur: Infinity, fireAt: Infinity, fired: false, target, key, drawT, nockT };
      if (!s.def.freeMove) this.faceTowards(target);
      actionSink?.({ t: 'cast', s: s.def.impl, dur: drawT, x: target.x, z: target.z, h: 1, ...n });
      return true;
    }
    if (dur <= 0) { this.fire(s, target); return true; }
    this.casting = { skill: s, t: 0, dur: nockT + dur, fireAt: nockT + dur * (s.def.fireAt ?? 0.55), fired: false, target, nockT };
    // the hero turns after the live aim, never snapping to each cast's: with fire held while the mouse
    // moves, a snap per cast (and holding that aim through the cast) turns it in steps
    if (!s.def.freeMove) this.faceTowards(target);
    actionSink?.({ t: 'cast', s: s.def.impl, dur: nockT + dur, x: target.x, z: target.z, ...n });
    return true;
  }

  /**
   * A skill the hotbar shows held up by another action (it can't be cast now): every other skill while a free-move
   * cast (the draught) is under way, and a consumable while any other action is, until the hero has been free for
   * `BUSY_HOLD`. A held attack is free for a frame between its blows, and its key, tried first, takes that frame; shown
   * free then, the draught's slot flashed with every blow. Not every skill while anything is cast: an attack held down
   * would dim the whole bar.
   */
  heldUp(s: KnownSkill): boolean {
    const under = this.casting?.skill;
    if (under === s || this.channel?.skill === s) return false;
    if (under?.def.freeMove) return true;
    return s.def.tags.includes('consumable') && G.time - this.busyAt < BUSY_HOLD;
  }

  /** A bow's hero's arrow on the string: on it once taken from the quiver, gone with the shot (the reload puts the next on as
   *  the cast ends: cut short, it's taken out again next time), and put back after a while without a shot. */
  private tickQuiver(dt: number): void {
    const q = this.cls.quiver, c = this.casting;
    if (!q) return;
    // (a bow's channel shoots arrow after arrow: it takes them from the quiver and lays them on the string itself)
    if (this.channel?.skill.impl.anim === 'bow') this.sinceShot = 0;
    else if (c && isBowShot(c.skill)) {
      this.sinceShot = 0;
      if (!c.fired && c.t >= (c.nockT ?? 0)) this.nocked = Math.max(this.nocked, c.skill.def.missiles ?? 1);
    } else if ((this.sinceShot += dt) > q.idle) this.nocked = 0;
  }

  /** `power`: how far a drawn shot was drawn (1 for any other cast) */
  fire(s: KnownSkill, target: THREE.Vector3, power = 1): void {
    if (s.impl.channel) return;
    if (isBowShot(s)) this.nocked = 0;
    // sandbox (lobby practice): no costs or cooldowns
    if (!this.sandbox) {
      this.energy -= s.def.cost;
      this.cooldowns.set(s.def.impl, this.cooldownOf(s.def));
    }
    if (this.local) actionSink?.({ t: 'fire', s: s.def.impl, x: target.x, z: target.z, px: this.pos.x, pz: this.pos.z, f: this.facing, ...(s.def.draw ? { k: power } : {}), ...(target.y > 0 ? { y: Math.round(target.y * 100) / 100 } : {}) });
    if (this.local) recorder.mark(`cast ${s.def.impl}`);
    s.impl.cast(this, s.def, target, power);
  }

  /** A drawn shot is loosed: what follows the release (the follow-through, the next arrow) is the cast's time. */
  private loose(c: CastState, power: number): void {
    c.fired = true; c.power = power; c.fireAt = c.t;
    c.dur = c.t + c.skill.def.castTime / (1 + this.stats.castSpeed / 100);
  }

  /** A remote player's action, replayed as its owner reported it. */
  /** How long `s` cast now takes its arrows from the quiver first (s): a bow's shot with fewer arrows on the string
   *  than it looses; 0 for any other. */
  nockTime(s: KnownSkill): number {
    const q = this.cls.quiver;
    return q && isBowShot(s) && this.nocked < (s.def.missiles ?? 1) ? q.fetch / (1 + this.stats.castSpeed / 100) : 0;
  }

  replay(a: PlayerAction): void {
    if (a.t === 'che') { this.stopChannel(); return; }
    if (a.t === 'chh') { this.hands = a.h; return; }
    if (a.t === 'hurt') { this.applyHit(a.r); return; }
    if (a.t === 'died') { if (this.alive) this.die(); return; }
    const s = this.known.get(a.s);
    // (a hidden partner's casts let go: away, banked or out of the hall of heroes, its spells were drawn all the same)
    if (!s || !this.alive || !this.obj.visible) return;
    if (a.t === 'cast') {
      const target = new THREE.Vector3(a.x, 0, a.z);
      const nockT = a.n ?? 0;
      this.casting = a.h
        ? { skill: s, t: 0, dur: Infinity, fireAt: Infinity, fired: false, target, replay: true, drawT: a.dur, nockT }
        : { skill: s, t: 0, dur: a.dur, fireAt: nockT + (a.dur - nockT) * (s.def.fireAt ?? 0.55), fired: false, target, replay: true, nockT };
    } else if (a.t === 'fire') {
      // (the way it faced as it fired; where it stood is where its reports have it now, played in step with them)
      // (its own cast's: a skill cast over another, Bull Rush over a Power Strike, leaves that one to land as it will)
      this.facing = a.f;
      const own = this.casting?.skill === s ? this.casting : null;
      if (own?.drawT && !own.fired) this.loose(own, a.k ?? 1);
      else if (own) own.fired = true;
      this.fire(s, new THREE.Vector3(a.x, a.y ?? 0, a.z), a.k ?? 1);
    } else if (!this.channel) {
      if (a.h) this.hands = a.h;
      this.channel = { skill: s, key: a.k, state: (s.impl as ChannelSkill).start(this, s.def), t: 0 };
    }
  }

  /** Rush along `dir` (normalized, on the ground) at `speed` for `dur` seconds; `step` runs every frame of it. Cast as
   *  an open dash runs, it rides on that one instead, its own way given up: posed over its legs for its time (Twin
   *  Fangs' lunge in Bull Rush's charge, its cuts landing as it runs; put in the charge's place, it cut it short). */
  startDash(dir: THREE.Vector3, speed: number, dur: number, { lift = 0, anim = 'charge', hold = 0, through = false, open = false, step, pace }: DashOpts = {}): void {
    if (this.dash?.open && this.dashRunning()) { this.dash.ride = { anim, t: 0, dur: dur + hold }; return; }
    this.rootedUntil = -1;
    this.dash = { vx: dir.x * speed, vz: dir.z * speed, t: 0, dur, hold, lift, anim, through, open, step, pace };
    this.facing = Math.atan2(dir.x, dir.z);
  }

  /** Whether a dash keeps the hero from casting (any but an open one, `DashOpts.open`, and one with a lunge riding
   *  on it, as its own would). */
  private dashShut(): boolean {
    return !!this.dash && (!this.dash.open || !!this.dash.ride);
  }

  /** The point the hero heads for on his way to `to`: the way found again when `to` changed, each point passed once
   *  he's within a stride of it (`ROUTE_PASSED`). */
  private routeStep(to: THREE.Vector3): [number, number] {
    if (this.routeFor !== to) {
      this.routeFor = to;
      this.route = walkPath(this.pos.x, this.pos.z, to.x, to.z, this.radius);
    }
    while (this.route.length > 1) {
      const [x, z] = this.route[0];
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > ROUTE_PASSED) break;
      this.route.shift();
    }
    return this.route[0] ?? [to.x, to.z];
  }

  /**
   * The speed `goal` asks of him out toward the wall no more than he can brake from in the room left before it (as
   * one slows walking up to a wall): stopped by it in a frame from a run, the legs were thrown past their ranges.
   */
  private slowForWall(goal: THREE.Vector3): void {
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r < 1e-3) return;
    const ux = this.pos.x / r, uz = this.pos.z / r;
    const out = goal.x * ux + goal.z * uz;
    if (out <= 0) return;
    const room = G.arena.wall.roomOut(this.pos.x, this.pos.z, this.radius);
    const most = Math.sqrt(2 * WALL_BRAKE * Math.max(0, room));
    if (out <= most) return;
    goal.x -= ux * (out - most);
    goal.z -= uz * (out - most);
  }

  /** Kept off the props, then the wall, his speed into what pushed him back let go: pressed against the wall at a
   *  run, he kept running into it, his legs striding in place past their ranges. */
  private resolveWorld(dt: number): void {
    let x = this.pos.x, z = this.pos.z;
    resolveProps(this.pos, this.radius);
    this.pushedBack(this.pos.x - x, this.pos.z - z, 0, dt);
    x = this.pos.x;
    z = this.pos.z;
    G.arena.wall.keepIn(this.pos, this.radius);
    this.pushedBack(this.pos.x - x, this.pos.z - z, WALL_GRIP, dt);
  }

  /**
   * His speed into a push of (`px`, `pz`) let go, and of his speed along it as much as `grip` times that, and the way
   * it took him this frame (`dt`): walked into the wall at a slant, he slid along its faces in a corner, his speed
   * about where he turns to his way, and turned to and fro over his planted feet (a hip turned 103° past its range).
   */
  private pushedBack(px: number, pz: number, grip: number, dt: number): void {
    const push = Math.hypot(px, pz);
    if (push < 1e-6) return;
    const nx = px / push, nz = pz / push;
    const into = this.vel.x * nx + this.vel.z * nz;
    if (into >= 0) return;
    this.vel.x -= nx * into;
    this.vel.z -= nz * into;
    const along = Math.hypot(this.vel.x, this.vel.z), held = -into * grip;
    const kept = along > held ? (along - held) / along : 0;
    this.pos.x -= this.vel.x * (1 - kept) * dt;
    this.pos.z -= this.vel.z * (1 - kept) * dt;
    this.vel.multiplyScalar(kept);
  }

  /** A dash's time on, and the time of what rides on it, let go once over. */
  private dashOn(d: DashState, dt: number): void {
    d.t += dt;
    if (d.ride && (d.ride.t += dt) >= d.ride.dur) d.ride = undefined;
  }

  /** The dash over: what rides on it held on standing for the rest of its time, as its own dash would have held it
   *  (Twin Fangs cast late in a charge's run, its cuts posed to their end). */
  private dashOver(d: DashState): void {
    const r = d.ride;
    this.dash = r ? { vx: 0, vz: 0, t: r.t, dur: r.t, hold: r.dur - r.t, lift: 0, anim: r.anim, through: false, open: false } : null;
  }

  /** Whether a dash is running (not yet into its hold): the body kept on its way, not turned to the aim. */
  private dashRunning(): boolean {
    return !!this.dash && this.dash.t < this.dash.dur;
  }

  startChannel(s: KnownSkill, key: SkillKey): void {
    if (!s.impl.channel || this.casting || this.channel?.skill === s || (s.def.block && this.dash)) return;
    if (this.channel && !this.channel.skill.def.block) return;
    // a broken guard can't be raised again until the shield recovers
    if (this.staggered) return;
    if (!this.sandbox && this.energy < s.def.cost * 0.2) { this.lowEnergy(); return; }
    if (this.channel) this.stopChannel();
    if (this.local) recorder.mark(`channel ${s.def.impl}`);
    // (the hand its key casts it from, before it starts: its look is made for it)
    const keys = this.keysOf(s);
    this.hands = handsOf(keys, [key]);
    this.channel = { skill: s, key, state: s.impl.start(this, s.def), t: 0 };
    this.queued = null;
    actionSink?.({ t: 'chs', s: s.def.impl, k: key, ...(this.bare ? { h: this.hands } : {}) });
  }

  /** A held block comes back in the same update that a swing finishes, never during it or a dash. */
  private resumeHeldBlock(): void {
    if (this.idle || !this.active || this.casting || this.channel || this.dash || this.staggered) return;
    if (input.mouse.overUI && !input.touchMode) return;
    for (const key of SKILL_KEYS) {
      if (!isDown(key)) continue;
      const skill = this.skillAt(key);
      if (skill?.def.block) { this.startChannel(skill, key); return; }
    }
  }

  /** The keys that cast `s` now, in the bar's order. */
  private keysOf(s: KnownSkill): SkillKey[] {
    return SKILL_KEYS.filter((key) => this.skillAt(key) === s);
  }

  /** The channel held by `held` of its `keys`: the hands they cast it from, told to the partners as it changes. */
  private holdWith(keys: SkillKey[], held: SkillKey[]): void {
    const hands = handsOf(keys, held);
    if (hands === this.hands) return;
    this.hands = hands;
    if (this.bare) actionSink?.({ t: 'chh', h: hands });
  }

  /** No weapon held by a hero whose weapons have schools: both his hands are free to cast (the mage's lance). */
  get bare(): boolean { return !!this.cls.schools && !this.gear.weapon; }

  /** A channel that can be cast from both hands is, now: none held, and two of its keys held together. */
  get bothHands(): boolean { return this.bare && this.hands === 'both'; }

  stopChannel(): void {
    const ch = this.channel;
    if (!ch) return;
    this.channel = null;
    (ch.skill.impl as ChannelSkill).stop(this, ch.skill.def, ch.state);
    if (this.local) actionSink?.({ t: 'che' });
  }

  lowEnergy(): void {
    if (G.time - this.lastLowEnergy < 1.2) return;
    this.lastLowEnergy = G.time;
    floatText(this.pos.x, 2.6, this.pos.z, 'Not enough energy', 'info', '#62d0ff');
  }

  /** a skill that needs something to cast at (a mark, a foe) found nothing */
  private noTarget(): void {
    if (G.time - this.lastNoTarget < 1.2) return;
    this.lastNoTarget = G.time;
    floatText(this.pos.x, 2.6, this.pos.z, 'No target', 'info', '#e8d9b0');
  }

  faceTowards(p: THREE.Vector3, instant = false): void {
    const a = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.facing = instant ? a : angleDamp(this.facing, a, 18, G.dt);
  }

  // --- update -----------------------------------------------------------------------
  update(dt: number): void {
    const t = G.time;
    if (!this.local) this.follow();
    if (!this.alive) { this.updateDeath(dt); return; }
    if (!this.local) { this.updateRemote(dt, t); return; }

    this.handleInput(dt);

    // cast progress
    if (this.casting) {
      const c = this.casting;
      c.t += dt;
      // (cast as a dash runs, it lands the way the dash goes: turned to the aim, the charge ran on with the body
      // wheeled off its way)
      if (!c.skill.def.freeMove && !this.dashRunning()) this.faceTowards(this.aim);
      const impl = c.skill.impl;
      if (c.drawT) {
        // a drawn shot: loosed when its key is let go, once it's drawn at least as far as its least draw (and the arrow is on the string)
        const k = drawShare(c);
        if (!c.fired && !impl.channel) impl.charging?.(this, c.skill.def, k, dt);
        if (!c.fired && c.t >= (c.nockT ?? 0) && !(c.key && isDown(c.key)) && k >= (c.skill.def.minDraw ?? 0)) { this.loose(c, k); this.fire(c.skill, this.aim.clone(), k); }
      } else {
        if (!c.fired && !impl.channel) impl.charging?.(this, c.skill.def, c.t / c.fireAt, dt);
        // (an aimed skill goes where its preview was as it was let go; anything else after the live aim)
        if (!c.fired && c.t >= c.fireAt) { c.fired = true; this.fire(c.skill, c.skill.def.aimed ? c.target.clone() : this.aim.clone()); }
      }
      if (c.t >= c.dur) {
        if (isBowShot(c.skill)) this.nocked = Math.max(this.nocked, 1);
        this.casting = null;
        // (a shot queued behind it is drawn at once: started next frame, the pose had a frame with no shot between the
        // two, and the archer's bow and draw hand stepped out to rest for it and back)
        if (this.queued && !this.channel) { const q = this.queued; this.queued = null; this.tryCast(q.skill, q.key, q.at); }
      }
    }
    if (this.casting || this.channel || this.dash || this.staggered) this.busyAt = t;
    this.tickQuiver(dt);
    if (this.channel) {
      const ch = this.channel;
      // (from both hands it drains as its `both` has it)
      const perSecond = this.bothHands ? ch.skill.def.both?.cost ?? ch.skill.def.cost : ch.skill.def.cost;
      const cost = this.sandbox ? 0 : perSecond * dt;
      if (this.energy < cost) { this.lowEnergy(); this.stopChannel(); }
      else {
        this.energy -= cost;
        if (!this.dashRunning()) this.faceTowards(this.aim);
        (ch.skill.impl as ChannelSkill).tick(this, ch.skill.def, dt, ch.state);
      }
    }

    // movement
    const d = this.dash;
    if (d) {
      if (d.t >= d.dur) this.vel.set(0, 0, 0);
      else if (d.pace && dt > 0) { const k = (d.pace(Math.min(1, (d.t + dt) / d.dur)) - d.pace(d.t / d.dur)) * d.dur / dt; this.vel.set(d.vx * k, 0, d.vz * k); }
      else this.vel.set(d.vx, 0, d.vz);
      this.dashOn(d, dt);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (!d?.through || d.t >= d.dur) this.resolveWorld(dt);
    if (d) {
      d.step?.();
      if (d.t >= d.dur + d.hold) { this.dashOver(d); this.vel.multiplyScalar(this.stats.moveSpeed / Math.max(1e-3, Math.hypot(d.vx, d.vz))); }
    }
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const look = lookFacing();
    // (between one attack or cast and the next, the body stays on its aim a moment rather than wheeling round to the way it
    // goes and back: held attacks while backing off or moving sideways would swing the body half round at every blow)
    const fighting = (this.casting && !this.casting.skill.def.freeMove) || this.channel;
    this.aimHold = fighting ? AIM_HOLD : Math.max(0, this.aimHold - dt);
    this.facesWay = false;
    if (look !== null && !d) this.facing = look;
    else if (!fighting && this.aimHold > 0) this.faceTowards(this.aim);
    else if ((!this.casting || this.casting.skill.def.freeMove) && !this.channel && speed > 0.5) {
      const eased = angleDamp(this.facing, Math.atan2(this.vel.x, this.vel.z), 14, dt);
      this.facing += Math.max(-TURN_MOST * dt, Math.min(TURN_MOST * dt, eased - this.facing));
      this.facesWay = true;
    }

    this.resumeHeldBlock();

    // resources & cooldowns
    if (!this.channel) this.energy = Math.min(this.stats.maxEnergy, this.energy + this.stats.energyRegen * dt);
    for (const [id, cd] of this.cooldowns) this.cooldowns.set(id, Math.max(0, cd - dt));
    this.tickVitals(dt);
    this.animateBody(dt, t, speed);
  }

  /** Health regeneration, hit flash, block recovery and the ward's timer. */
  private tickVitals(dt: number): void {
    this.life = Math.min(this.stats.maxLife, this.life + this.stats.lifeRegen * dt);
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.blockCd = Math.max(0, this.blockCd - dt);
    this.rising = Math.max(0, this.rising - dt);
    if (this.ward) {
      this.ward.t -= dt;
      if (this.ward.t <= 0 || this.ward.amount <= 0) { this.ward.onEnd?.(); this.ward = null; }
    }
  }

  /**
   * A co-op partner: it glides to where its game last put it (carried on along its velocity for
   * the time since, to make up for the lag), and its casts and channels play out as reported.
   */
  private updateRemote(dt: number, t: number): void {
    const r = this.remote;
    if (this.casting) {
      const c = this.casting;
      c.t += dt;
      if (!c.fired && !c.skill.impl.channel) c.skill.impl.charging?.(this, c.skill.def, c.drawT ? drawShare(c) : Math.min(1, c.t / c.fireAt), dt);
      // (a drawn shot whose release never came: its owner left or fell mid-draw)
      if (c.t >= c.dur && isBowShot(c.skill)) this.nocked = Math.max(this.nocked, 1);
      if (c.t >= c.dur || (!c.fired && c.t > 20)) this.casting = null;
    }
    this.tickQuiver(dt);
    if (this.channel) (this.channel.skill.impl as ChannelSkill).tick(this, this.channel.skill.def, dt, this.channel.state);
    const d = this.dash;
    if (d) {
      this.dashOn(d, dt);
      d.step?.();
      if (d.t >= d.dur + d.hold) this.dashOver(d);
    }
    this.tickVitals(dt);
    this.animateBody(dt, t, Math.hypot(r.vx, r.vz));
  }

  /** A remote player moves (and lies, when down) where its game's reports have it at the moment shown (net/timeline:
   *  read between them, so it moves as smoothly as they do however irregularly they came). */
  private follow(): void {
    const r = this.remote;
    this.pos.x = r.x;
    this.pos.z = r.z;
    if (!this.alive) return;
    this.vel.set(r.vx, 0, r.vz);
    this.facing = r.f;
    this.aim.set(r.ax, 0, r.az);
  }

  /** The walk cycle's phase moved on by `step` (rad), the way it runs, turning round to `want` only as it crosses a
   *  foot's mid-swing, a whole number of half cycles (the leg IK's windows are centred there): the swinging foot's
   *  window then goes back the way it came as far as it had gone, and the other's is half a cycle off either way, so
   *  the rhythm holds. Turned round anywhere else, a foot just down was due again at once: going round in circles with
   *  a shot drawn, the cycle turned round twice a lap as the body went sideways to its aim, and the feet left out of
   *  turn, both in the air a quarter of the time. */
  private cycleOn(step: number, want: number): number {
    const next = this.phase + step * this.phaseDir;
    if (want === this.phaseDir) return next;
    const halves = Math.floor(next / Math.PI);
    const halvesWere = Math.floor(this.phase / Math.PI);
    if (halves === halvesWere) return next;
    // (back from the half cycle it crossed by as far as it went past it)
    const crossed = Math.max(halves, halvesWere) * Math.PI;
    this.phaseDir = want;
    return 2 * crossed - next;
  }

  private animateBody(dt: number, t: number, speed: number): void {
    // (fewer triangles of him from afar: from above, across the hall)
    this.farDetail.update(G.camera.position.distanceTo(this.obj.position));

    const fwd = Math.sin(this.facing) * this.vel.x + Math.cos(this.facing) * this.vel.z;
    const side = Math.cos(this.facing) * this.vel.x - Math.sin(this.facing) * this.vel.z;
    // (a dash's legs step at a sprint's cadence, not at the dash's speed)
    const gs = this.dash ? Math.min(speed, this.stats.moveSpeed) : speed;
    // (setting off from standing, the cycle starts with the first stride)
    const legs = this.model.joints?.root.userData.legs as LegIK | undefined;
    if (legs) this.phase = legs.setOff(this.phase);
    // (quicker as he goes off the legs' line, his steps shorter across it: `LegIK.cadence`)
    const pace = legs?.cadence ?? 1;
    // (backwards only going back against a facing it keeps: turning round to face the way it goes, the body moved
    // against its facing for a few frames, and the cycle turned round and back again, a foot just down due again at once)
    const backwards = fwd < -0.5 && !this.facesWay;
    // (and speeding up, at the cadence of the speed it is going for, as a person accelerating takes quick, short steps
    // from the first: by the speed it had so far, coming out of a turn round from a run the first swing took a walk's
    // 23 frames, and the foot behind stayed planted as the body sped away from it, 75 cm behind the hips)
    const leg = legLength(this.model);
    const goalSpeed = this.dash ? 0 : Math.hypot(this.goal.x, this.goal.z);
    const cadence = Math.max(gs * gaitRate(gs, leg), goalSpeed * gaitRate(goalSpeed, leg));
    this.phase = this.cycleOn(dt * cadence * pace, backwards ? -1 : 1);
    let action: ActionState | null = null;
    const d = this.dash, dashed = d ? { name: d.anim ?? 'charge', t: Math.min(1, d.t / (d.dur + d.hold)) } : null;
    if (this.staggered) action = { name: 'stagger', t: 1 - (this.guardBroken - G.time) / BLOCK.guardBreak };
    // (an open dash shows a skill cast as it runs, its own legs under it, and the action of a dash riding on it)
    else if (dashed && !(d?.open && (this.casting || this.channel || d.ride))) action = dashed;
    else if (d?.ride) action = { name: d.ride.anim ?? 'charge', t: Math.min(1, d.ride.t / d.ride.dur) };
    else if (this.casting) {
      const c = this.casting, impl = c.skill.impl;
      action = { name: impl.anim || 'cast', t: c.t / c.dur };
      if (impl.anim === 'bow' && !impl.channel) {
        // how far the bow is drawn (a drawn shot by its time to full draw, any other by its firing time), and since when it's loosed
        const nk = c.nockT ?? 0, draw = c.fired ? (c.power ?? 1) : Math.min(1, Math.max(0, c.t - nk) / Math.max(1e-3, c.drawT ?? c.fireAt - nk));
        action.draw = draw;
        if (nk) action.fetch = Math.min(1, c.t / nk);
        if (c.fired) action.loosed = c.t - c.fireAt;
        action.t = c.fired ? 0.55 + 0.45 * Math.min(1, (c.t - c.fireAt) / Math.max(1e-3, c.dur - c.fireAt)) : 0.55 * draw;
        // (aimed for the arrow as it would leave: a drawn shot looses no weaker than its least draw, any other at full draw)
        action.pitch = impl.pitch?.(this, c.skill.def, c.drawT ? Math.max(draw, c.skill.def.minDraw ?? 0) : 1, this.aim) ?? 0;
        action.yaw = this.shotHeading(this.castPoint, this.aim);
        action.arrows = c.skill.def.missiles ?? 1; action.fan = c.skill.def.spread ?? 0;
      }
    }
    // a channel's t ramps 0 -> 1 over its first 0.2 s (the pose settling in), then holds
    else if (this.channel) {
      const ch = this.channel, opens = ch.skill.def.opening ?? 0;
      ch.t += dt;
      action = { name: ch.skill.impl.anim || 'channel', t: Math.min(1, ch.t / 0.2), time: ch.t, open: opens > 0 ? Math.min(1, ch.t / opens) : 1 };
      if (this.bare) action.hands = this.hands;
      (ch.skill.impl as ChannelSkill).pose?.(this, ch.skill.def, ch.state, action);
    }
    if (dashed && action && action !== dashed && !this.staggered) action.under = dashed;
    // (a hero not shown isn't posed: the lobby's hidden under the hall of heroes, a partner away in a run or banked;
    // each was posed all the same, his cloth draped, 1.2 to 1.6 ms a frame a hero: `lab coop`'s heroes' update)
    if (this.obj.visible) this.pose(dt, t, Math.min(1, speed / this.stats.moveSpeed), 1, side / this.stats.moveSpeed, action);

    // ambient motes around the offhand (the mage's arcana; none while hidden: as the hero selection screen hides the
    // lobby's mage, his rose among the hall's heroes where he stood)
    const motes = this.cls.aura.motes;
    if (motes && this.obj.visible && Math.random() < dt * 20) {
      const p = this.palmPoint;
      particles.glow.spawn({
        x: p.x + rand(-0.08, 0.08), y: p.y + rand(-0.05, 0.08), z: p.z + rand(-0.08, 0.08), vy: rand(0.2, 0.6),
        life: rand(0.4, 0.8), size: rand(0.06, 0.14), sizeEnd: 0, color: col(motes[0], 2.5), colorEnd: col(motes[1], 0.5),
      });
    }
  }

  /** the head glances at the nearest foe within a dozen metres (not through the eyes: the camera rides the head), and
   *  with none about looks round now and then while he stands `idle` (models/glance.ts); a training dummy only while
   *  he isn't idle (stared at, the lobby's hero never looked round) */
  private lookAtFoe(dt: number, dead: number, idle: boolean, weight = 1): void {
    const j = this.model.joints;
    if (!j) return;
    const look = this.look ??= new LookAt(j, this.cls.id);
    if (dead >= 0 || this.eyes) { look.reset(); return; }
    let best: Enemy | null = null, bd = 144;
    for (const e of G.enemies) {
      if (!e.alive || e.spawning || (idle && e.def.dummy)) continue;
      const d = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    _lookFrom.set(this.pos.x, this.obj.position.y, this.pos.z);
    look.update(dt, _lookFrom, this.facing, best ? _lookAt.set(best.pos.x, best.obj.position.y + best.height * 0.6, best.pos.z) : null, weight, idle);
  }

  /** standing still with nothing cast, aimed or held on an aim: free to glance round (`move` the pose's share of his
   *  speed) */
  private standsIdle(move: number, action: ActionState | null): boolean {
    return this.glances && move < 0.05 && !action && !this.dash && !this.aiming && this.aimHold <= 0;
  }

  /** The foe an overhead blow comes down on: the nearest alive on the line straight ahead within `STRUCK_REACH`, its
   *  body across the line, as this game shows it (a co-op partner's copy reads its own foes), or none. */
  private struckAhead(): Struck | null {
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    let best: Enemy | null = null, bestAlong = Infinity;
    for (const e of G.enemies) {
      if (!e.alive || e.spawning) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      if (along <= 0 || along - e.radius > STRUCK_REACH || across > e.radius || along >= bestAlong) continue;
      best = e; bestAlong = along;
    }
    if (!best) return null;
    _struck.x = best.pos.x; _struck.z = best.pos.z; _struck.r = best.radius;
    _struck.top = best.obj.position.y + best.height * STRUCK_TOP;
    return _struck;
  }

  pose(dt: number, t: number, move: number, dir: number, lean: number, action: ActionState | null): void {
    this.obj.position.set(this.pos.x, damp(this.obj.position.y, groundHeight(this.pos.x, this.pos.z), 14, dt), this.pos.z);
    // (all of it: through the eyes the last frame placed the model in view, entities/viewModel.ts)
    this.model.root.rotation.set(0, this.facing, 0);
    // a jumping dash lifts the model along a parabola
    const d = this.dash, k = d ? Math.min(1, d.t / d.dur) : 0;
    this.model.root.position.set(0, d ? d.lift * 4 * k * (1 - k) : 0, 0);
    // a raised player gets up the way it went down, in reverse
    const dead = this.deadT >= 0 ? Math.min(1, this.deadT / 1.0) : this.rising > 0 ? this.rising / RISE : -1;
    // (the legs told where the body is going, as the game eases it there: a stop's last stride lands where it rests)
    const legs = this.model.joints?.root.userData.legs as LegIK | undefined;
    if (this.local && !this.dash && this.steered) legs?.intend(this.goal, this.facesWay);
    // (Very low: a co-op partner posed one frame in `poseEvery`, the time between given to that one; where he stands
    // and faces above every frame. The local hero and the hall's are posed every frame)
    const every = this.local ? 1 : QUALITY[qualityLevel()].poseEvery;
    this.poseOwed += dt;
    if (!(every > 1 && G.players.includes(this) && ++this.poseTurn % every)) {
      const owed = this.poseOwed;
      this.poseOwed = 0;
      this.model.animate({
        t, dt: owed, phase: this.phase, move, moveDir: dir, lean, action,
        hit: this.hitT, blockHit: Math.max(0, 1 - (G.time - this.lastBlock) / 0.25), dead,
        charge: this.channel ? 1 : this.casting ? this.casting.t / this.casting.dur : 0,
        nocked: this.nocked,
        strike: action?.name === 'chop' ? this.struckAhead() : null,
        look: (weight) => this.lookAtFoe(owed, dead, this.standsIdle(move, action), weight),
      });
    }
    // (dev builds: a joint taken past a body's range is reported; through the eyes the arms keep hand-placed poses)
    if (import.meta.env.DEV && this.local && dead < 0 && !this.eyes && this.model.joints) watchBody(this.model.joints, action?.name ?? (move > 0.05 ? 'moving' : 'standing'));
    this.model.kit.u.uHit.value = this.hitT * 0.5;
    this.model.kit.u.uShine.value = this.eyes ? SHINE.eyes : this.shine;
    if (this.staffLight) {
      // a little above the cast point: right at it, the metal round a staff's crystal (a few cm off,
      // with the light's inverse-square falloff) burns out white-green
      // Through the eyes the crystal is in view a little ahead of the camera: a light there floods the
      // sleeve filling the corner of the view, and the eye's adaptation darkens the rest. It shines on
      // ahead and above instead, as the staff would light the ground in front
      if (this.eyes) {
        const cam = G.camera.position, yaw = cameraYaw();
        this.staffLight.position.set(cam.x - Math.sin(yaw) * 1.5, cam.y + 0.8, cam.z - Math.cos(yaw) * 1.5);
      } else {
        this.staffLight.position.copy(this.castPoint);
        this.staffLight.position.y += 0.35;
      }
      const glow = this.cls.aura.intensity;
      // (in the colour of the staff's school, as its crystal: a value set, nothing compiled)
      if (this.gear.school) this.staffLight.color.set(SCHOOLS[this.gear.school].color);
      // (its intensity alone goes to none: the light stays in the scene, as the light count must)
      const full = this.drawnFull;
      this.auraLit = this.cls.aura.drawn ? damp(this.auraLit, full ? 1 : 0, full ? AURA_EASE.in : AURA_EASE.out, dt) : 1;
      // (hidden, as the hero selection screen hides him: it lights nothing)
      const shown = this.obj.visible ? 1 : 0;
      this.staffLight.intensity = shown * (this.cls.schools && !this.gear.weapon ? 0 : 1) * glow * this.auraLit * (1 + (this.channel ? 0.5 : 0) + Math.sin(t * 6) * 0.13);
    }
    // (the glowing hand lights what's round it, breathing as its glow does; off through the eyes, where a light by the
    // camera floods the view; held off the palm, `HAND_LIGHT`)
    const hand = this.cls.aura.hand;
    if (this.handLight && hand) {
      const palm = this.palmPoint, dx = palm.x - this.pos.x, dz = palm.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      this.handLight.position.set(palm.x + dx / d * HAND_LIGHT.out, palm.y - HAND_LIGHT.below, palm.z + dz / d * HAND_LIGHT.out);
      const shown = this.obj.visible && !this.eyes ? 1 : 0;
      this.handLight.intensity = shown * hand.intensity * (1 + 0.3 * Math.sin(t * 2.2));
    }
  }

  heal(amount: number, silent = false): void {
    if (!this.alive) return;
    const before = this.life;
    this.life = Math.min(this.stats.maxLife, this.life + amount);
    if (this.local) countHealed(this.life - before);
    if (!silent && this.life - before >= 1) floatText(this.pos.x, 2.4, this.pos.z, `+${Math.round(this.life - before)}`, 'heal', '#6dff7a');
  }

  /** Held to the ground by a vine for `seconds` (the Barkhide Hulk's, `throws.ts`): stopped where he stands, and
   *  walking nowhere until it lets go or a dash tears him free (`startDash`). A dash under way is never caught.
   *  Returns whether it held him. */
  root(seconds: number): boolean {
    if (!this.active || !this.local || this.dash) return false;
    this.rootedUntil = Math.max(this.rootedUntil, G.time + seconds);
    this.vel.set(0, 0, 0);
    return true;
  }

  /** Out of the run for good: what he was drawing, casting, channelling or aiming let go, and nothing more taken from
   *  the keys (`handleInput`). A banked ranger drew and aimed on, his bow's sight drawn, as another played on. */
  standDown(): void {
    this.stopChannel();
    this.endAim();
    this.casting = null;
    this.queued = null;
  }

  /** Let go by a vine (an arrow cut it, `throws.ts`). */
  letGo(): void { this.rootedUntil = -1; }

  /** Apply already-mitigated damage (see combat/damage hurtPlayer). Returns how it turned out (null: it didn't land,
   *  the hero down or guarded). */
  takeDamage(amount: number, _type: DamageType, from: THREE.Vector3 | null): HitResult | null {
    if (!this.alive || G.time < this.guardUntil) return null;
    const r = this.resolveHit(amount, from);
    this.showHit(r);
    if (this.local) {
      actionSink?.({ t: 'hurt', r: { taken: round2(r.taken), blocked: round2(r.blocked), broke: r.broke, absorbed: round2(r.absorbed) } });
      countTaken(r.taken, r.blocked + r.absorbed);
    }
    if (this.life <= 0) this.die();
    return r;
  }

  /** Work out a hit: the shield's block, then the ward, then health. */
  private resolveHit(amount: number, from: THREE.Vector3 | null): HitResult {
    const r: HitResult = { taken: 0, blocked: 0, broke: false, absorbed: 0 };
    const s = this.stats;
    // shield block: a chance per hit (then a short recovery), or every frontal hit while the shield is raised
    if (this.gear.shield && s.blockAmount > 0) {
      const raised = this.channel?.skill.def.block ?? 0;
      const front = !from || angleOff(Math.atan2(from.x - this.pos.x, from.z - this.pos.z), this.facing) < BLOCK.arc;
      let absorb = 0;
      if (raised && front) absorb = s.blockAmount * raised;
      else if (this.blockCd <= 0 && Math.random() * 100 < s.block) { absorb = s.blockAmount; this.blockCd = BLOCK.recovery; }
      if (absorb > 0) {
        r.blocked = Math.min(amount, absorb);
        // more than a raised shield can hold: the guard breaks, the rest gets through
        r.broke = raised > 0 && amount > absorb;
        amount -= r.blocked;
      }
    }
    if (amount > 0 && this.ward) {
      r.absorbed = Math.min(this.ward.amount, amount);
      this.ward.amount -= r.absorbed;
      amount -= r.absorbed;
    }
    r.taken = amount;
    this.life -= amount;
    return r;
  }

  /** A co-op partner's hit, as the host worked it out: its effects here, and its feedback. */
  applyHit(r: HitResult): void {
    if (this.ward && r.absorbed) this.ward.amount -= r.absorbed;
    this.life = Math.max(0, this.life - r.taken);
    this.showHit(r);
  }

  /** The feedback of a hit: sparks off a block, the ward flaring, the number, the screen's flinch. */
  private showHit(r: HitResult): void {
    if (r.blocked > 0) {
      this.lastBlock = G.time;
      const p = this.palmPoint;
      if (r.broke) {
        this.guardBroken = G.time + BLOCK.guardBreak;
        this.blockCd = BLOCK.guardBreak;
        this.stopChannel();
        this.casting = null;
        floatText(this.pos.x, 2.7, this.pos.z, 'Guard broken', 'info', '#ff8a50');
        if (this.local) addShake(0.25);
      } else floatText(this.pos.x, 2.5, this.pos.z, `Block ${Math.round(r.blocked)}`, 'info', '#ffd9a0');
      for (let i = 0; i < 8; i++) {
        particles.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-4, 4), vy: rand(0, 4), vz: rand(-4, 4), life: rand(0.2, 0.35), size: rand(0.04, 0.09), sizeEnd: 0,
          color: col(0xffe0a0, 2), colorEnd: col(0xff5010, 0.4), gravity: 12 });
      }
      if (r.broke) sfx.guardBreak(); else sfx.shieldBlock();
    }
    if (r.absorbed > 0) this.ward?.onHit?.(r.absorbed);
    if (r.taken <= 0) return;
    hitFlash(this, G.time);
    floatText(this.pos.x, 2.3, this.pos.z, Math.round(r.taken), 'player', this.local ? '#ff4a3a' : '#ff9a80');
    if (!this.local) return;
    flashHurt(Math.min(0.7, (r.taken / this.stats.maxLife) * 4));
    addShake(Math.min(0.35, (r.taken / this.stats.maxLife) * 2));
    sfx.hurt();
    emit('playerHurt', r.taken);
  }

  die(): void {
    this.endAim();
    this.life = 0;
    this.alive = false;
    this.deadT = 0;
    this.stopChannel();
    this.casting = null;
    this.dash = null;
    this.ward?.onEnd?.();
    this.ward = null;
    sfx.death();
    if (this.local) {
      actionSink?.({ t: 'died' });
      countDown();
    }
    emit('playerDied', this);
  }

  /** Co-op: fallen but not gone, until a teammate raises it or it bleeds out. */
  goDown(): void {
    this.downed = true;
    this.bleed = COOP.bleedOut;
    this.revive = 0;
  }

  /** Dead for good: a downed player that bled out starts to fade from here. */
  bleedOut(): void {
    this.downed = false;
    this.deadT = Math.min(this.deadT, 1.2);
  }

  /** Raised by a teammate: back on its feet with some health, untouchable for a moment. */
  raise(lifeK = COOP.reviveLife): void {
    this.downed = false;
    this.alive = true;
    this.deadT = -1;
    this.revive = 0;
    this.rising = RISE;
    this.life = this.stats.maxLife * lifeK;
    this.guardUntil = G.time + COOP.reviveGuard;
    this.model.kit.u.uDissolve.value = 0;
    const p = this.pos;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.2, 0.9);
      particles.glow.spawn({
        x: p.x + Math.cos(a) * r, y: rand(0, 0.4), z: p.z + Math.sin(a) * r, vy: rand(2, 4.5),
        life: rand(0.5, 0.9), size: rand(0.08, 0.2), sizeEnd: 0, color: col(0xfff0c0, 2.5), colorEnd: col(0xffa040, 0.4), drag: 1.5,
      });
    }
    sfx.potion();
  }

  updateDeath(dt: number): void {
    this.deadT += dt;
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.pose(dt, G.time, 0, 1, 0, null);
    // a downed player lies there whole; the dead fade
    this.model.kit.u.uDissolve.value = this.downed ? 0 : Math.min(0.85, Math.max(0, (this.deadT - 1.2) / 3));
  }
}

/** seconds to get back up after a revive */
const RISE = 0.6;
