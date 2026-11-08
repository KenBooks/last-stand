// tools/lab's co-op (`npm run lab -- coop`): two games playing together, the host's in the side's page and the
// guest's in a partner page, their messages carried by the lab with the delay a link of the given ping and jitter
// gives them (tools/lab/node/coop.mjs). Each page's BroadcastChannel, which the game's `?net=local` link talks over, is
// replaced by one the lab carries, so the two games talk as they would through the relay server, every frame on the
// lab's clock. What each game shows is recorded frame by frame and judged against what the other one has: how late
// and how roughly a hero or a foe follows where its own game has it, whether an arrow that struck a foe on the guest's
// screen counted on the host, and whether a blow the guest dodged on its screen hurt it.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { cameraYaw } from '../../../src/core/renderer';
import { hostRoom, joinRoom, session } from '../../../src/net/session';
import * as netlog from '../../../src/net/netlog';
import { spawnEnemy } from '../../../src/entities/spawner';
import { clearEnemies, RISE_TIME, type Enemy } from '../../../src/entities/enemy';
import * as crowd from '../../../src/entities/models/crowd';
import { Projectile } from '../../../src/combat/projectiles';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { menuStowed, toggleMenuStowed } from '../../../src/ui/menus';
import type { EnemyId } from '../../../src/data/enemies';
import type { Player } from '../../../src/entities/player';
import type { ActionState, SkillKey } from '../../../src/types';
import type { Frame, Lab } from './lab';
import { watchHeroCost } from './coopCost';
export { coopHeroCost } from './coopCost';

import { lobbyCastInput, watchHall, watchTags } from './coopLobby';
import { endInput, watchOut } from './coopEnd';
export {
  coopCastInLobby, coopCloseHall, coopHallSeen, coopLeaveRun, coopLobbyBar, coopOpenHall, coopPractiseAgain,
  coopSummaryDone, coopTagsSeen,
} from './coopLobby';
export {
  coopBarBack, coopBarFit, coopBarScreens, coopCanvasCover, coopClick, coopDrag, coopDragEnd, coopFloor, coopHold,
  coopOutCanary, coopOutSeen, coopOutWatch, coopSummaryCanary, coopTapBar, coopThrowItem, coopTwist, coopWatching,
  coopWorldAngle,
} from './coopEnd';

/** Which game a page plays. */
export type Role = 'host' | 'guest';

/** A message a game sent: when (ms since the co-op began, on the lab's clock), on which channel, what. */
export interface Sent {
  at: number;
  name: string;
  data: unknown;
}

/** A message on its way to a game: when it arrives (ms since the co-op began), on which channel, what. */
export interface Arriving {
  due: number;
  name: string;
  data: unknown;
}

/** A point on the ground, x and z. */
export type XZ = [number, number];

/** A hero standing, down (to be raised) or dead. */
export type HeroState = 'up' | 'down' | 'dead';

/** A hero's action as one game shows it in one frame: the one it is posed in (none: standing or moving) and whether
 *  a charge runs under it, whether it dashes, the skill it is casting (its `impl`) and whether that has yet to land,
 *  and the skills it landed this frame. */
export interface Act {
  shown: string | null;
  under: boolean;
  dashing: boolean;
  casting: string | null;
  charging: boolean;
  landed: string[];
}

/** A foe as one game shows it in one frame. */
export interface FoeSample {
  id: number;
  x: number;
  z: number;
  life: number;
  /** its attack, as shown, reached the moment its blow lands this frame */
  blow: boolean;
  /** this game's own hero is where that blow would land (in its reach and before it, the game's own rule) */
  inReach: boolean;
  /** dazed, as this game shows it (stars over it) */
  dazed: boolean;
  /** carried before a hero's charge as this game shows it, and how high it flies off it (m: 0 on its feet) */
  carried: boolean;
  up: number;
  /** ducked out of a shot's way as this game shows it, and (a guest's copy) gone in a blink, waiting for the host's
   *  reports to have it where it went (entities/evade.ts) */
  ducked: boolean;
  gone: boolean;
  /** risen out of the floor (its rise over), and drawn as this game would draw it this frame; if not, why not */
  risen: boolean;
  drawn: boolean;
  hidden: string;
}

/** What one game shows in one frame of a scenario. */
export interface Sample {
  /** its own hero */
  self: XZ;
  /** its own hero's life */
  life: number;
  /** its own hero and its partner's as it shows them: standing (`up`), down waiting to be raised, or dead */
  standing: { self: HeroState; partner: HeroState | null };
  /** its partner's hero as it shows it (none before it has arrived) */
  partner: XZ | null;
  /** whether its own hero's body and its partner's are drawn (a blink hides one as it crosses) */
  shown: { self: boolean; partner: boolean | null };
  /** how it plays its partner's reports out (net/timeline, where this tree has one): how far behind the freshest it
   *  plays (ms), its clock's rate this frame, whether a stall held it at the newest report */
  playout: { behind: number; rate: number; held: boolean } | null;
  foes: FoeSample[];
  /** the foes its own hero's arrows struck this frame, by id, one entry an arrow */
  struck: number[];
  /** its own hero's arrows loosed this frame */
  loosed: number;
  /** its own hero's action and its partner's, as it shows them */
  acts: { self: Act; partner: Act | null };
  /** what the foes threw as this game shows it (entities/throws.ts; none in an older tree): where each chunk of lava
   *  that came down this frame landed, the vines sent this frame, its own hero held by one and its partner's copy
   *  shown in a vine's coils */
  thrown: { landed: XZ[]; vines: number; held: boolean; coiled: boolean };
}

/** Where a page's co-op stands, for the lab to wait on. */
export interface CoopState {
  mode: string;
  status: string;
  /** the partners' heroes it has */
  partners: number;
  /** its lobby stowed, as a player practises in it */
  stowed: boolean;
  /** its own hero casting freely, as the lobby has him (no costs or cooldowns) */
  free: boolean;
  /** its own party slot and name tag, and its partners' as it knows them, by slot (none in an older tree) */
  slot: number;
  tag: string;
  partnerTags: string[];
  partnerSlots: number[];
  /** joining was refused for its name tag, and it is asked for another */
  renameAsked: boolean;
  /** its own hero's colour and its partners', by slot (net/heroColour.ts; undefined in an older tree), and the
   *  colour each one's cloth is drawn in (`Dye.shown`, hex) */
  colour?: string | null;
  partnerColours?: (string | null)[];
  worn?: number | null;
  partnerWorn?: (number | null)[];
  /** its own player out of the run (banked or fallen), the run over here, and its summary shown */
  out: boolean;
  /** the run's phase here ('' out of one) */
  phase: string;
  runOver: boolean;
  summary: boolean;
}

/** A turn of frames the lab asks a page for: the messages arrived meanwhile, and what to play. */
export interface CoopTurn {
  arriving: Arriving[];
  frames: number;
  /** the scenario playing (none: standing still, nothing recorded) */
  scenario?: string;
}

/** What a turn of frames gave: the messages sent, where the co-op stands. */
export interface CoopTurnResult {
  sent: Sent[];
  state: CoopState;
}

/** A scenario the two heroes play, each one's input frame by frame. */
interface Scenario {
  about: string;
  /** frames recorded, once both heroes and the foes have settled */
  frames: number;
  host: XZ;
  guest: XZ;
  /** the foes the host spawns as it starts, each standing dazed where it says (thinking of nothing) */
  foes: { type: EnemyId; at: XZ; dazed?: boolean }[];
  /** the guest's life as it starts (unhurt by default) */
  guestLife?: number;
  /** a wave the host lets come for real (its foes thinking and fighting) as the scenario starts, instead of the
   *  foes standing where it puts them */
  wave?: number;
  /** the frames from the scenario's start in which the guest never hears of a foe's spawn, as a guest whose run
   *  started late (its fight warming as the host's began) heard of none */
  spawnsLost?: number;
  /** the skill (its `impl`) the guest's hero must know to play it, or one of them: a class's own */
  skill?: string | string[];
  /** the frames (after it settled) each game's screen is pictured at, with `--pictures` */
  pictures?: number[];
  hostInput(frame: number): Frame;
  guestInput(frame: number): Frame;
}

/** where the party's other heroes stand through every scenario, off its action (`--party`: the third and fourth) */
const EXTRA_SPOTS: XZ[] = [[-22, 2], [-22, 6]];

/** the frames a scenario plays before it is recorded: the heroes on their spots, their copies arrived */
export const SETTLE_FRAMES = 90;
/** the life every hero is given, so that no blow in a scenario brings one down */
const UNHURT = 1e6;
/** the life a foe is given, so that no arrow kills it */
const UNKILLED = 1e5;
/** the most an arrow ends from a foe's edge and still counts as having struck it */
const STRUCK_REACH = 0.8;
/** the eight ways round, as the keys held for each */
const ROUND = [['w'], ['w', 'd'], ['d'], ['d', 's'], ['s'], ['s', 'a'], ['a'], ['a', 'w']];

/** The keys of running round in a circle, each way for `frames` frames. */
function roundAt(frame: number, frames: number): string[] {
  return ROUND[Math.floor(frame / frames) % ROUND.length];
}

/** Zigzags up the screen, a stop now and then. */
function zigzagAt(frame: number): string[] {
  const beat = frame % 80;
  if (beat < 30) return ['w', 'a'];
  if (beat < 60) return ['w', 'd'];
  return [];
}

/** The partner page's hero walks the touch stick towards (dx, dz) in the world, or stands with none. */
function stickToward(dx: number, dz: number): void {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    input.stick.x = 0;
    input.stick.y = 0;
    return;
  }
  const yaw = cameraYaw();
  const x = dx / length;
  const z = dz / length;
  input.stick.x = x * Math.cos(yaw) - z * Math.sin(yaw);
  input.stick.y = x * Math.sin(yaw) + z * Math.cos(yaw);
}

/** The foe nearest the local hero, as this game shows it. */
function nearestFoe(): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const foe of G.enemies) {
    if (!foe.alive) continue;
    const distance = foe.pos.distanceTo(G.player.pos);
    if (distance < bestDistance) {
      best = foe;
      bestDistance = distance;
    }
  }
  return best;
}

/** the frame of `shoot` from which the host holds Tab (the scores), for its picture */
const SCORES_FROM = 570;

/** the guest's reaction to a blow it sees coming, s into the foe's attack */
const REACTION = 0.15;
/** how long the guest runs from a blow it dodges, frames */
const FLEE_FRAMES = 40;

/**
 * The guest in `dodge`: it stands by the foe, and as it sees an attack begin it runs from every other one (a dodge)
 * and takes the rest standing; once away it walks back.
 */
class Dodger {
  private fleeing = 0;
  private dodgeNext = true;
  private seen: unknown = null;

  input(): Frame {
    const foe = nearestFoe();
    if (!foe) return {};
    const away = { x: G.player.pos.x - foe.pos.x, z: G.player.pos.z - foe.pos.z };
    const action = foe.action;
    if (action && action.name === 'attack' && action !== this.seen && action.t >= REACTION) {
      this.seen = action;
      if (this.dodgeNext) this.fleeing = FLEE_FRAMES;
      this.dodgeNext = !this.dodgeNext;
    }
    if (this.fleeing > 0) {
      this.fleeing--;
      stickToward(away.x, away.z);
    } else if (Math.hypot(away.x, away.z) > 1.6) stickToward(-away.x, -away.z);
    else stickToward(0, 0);
    return {};
  }
}

let dodger = new Dodger();

/** how near the host comes to raise the guest, m (inside the revive's reach) */
const RAISE_FROM = 1.4;

/** The host in `down`: it stands until it sees the guest down, then goes to it and holds the revive key. */
function raiseInput(): Frame {
  const partner = G.players.find((player) => !player.local);
  if (!partner?.downed) {
    stickToward(0, 0);
    return {};
  }
  const dx = partner.pos.x - G.player.pos.x;
  const dz = partner.pos.z - G.player.pos.z;
  if (Math.hypot(dx, dz) > RAISE_FROM) {
    stickToward(dx, dz);
    return {};
  }
  stickToward(0, 0);
  return { keys: ['e'] };
}

function stateOf(player: Player): HeroState {
  if (player.alive) return 'up';
  return player.downed ? 'down' : 'dead';
}

/** The guest in `shoot`: a tap at the foe every so often, aimed where its screen shows it. */
function shootInput(frame: number): Frame {
  const foe = nearestFoe();
  if (!foe) return {};
  const aim = foe.pos.clone();
  aim.y = foe.height * 0.6;
  return { aim, m0: frame % 36 < 2 };
}

/** the frames between the guest's shots in `evade`, each at the other foe */
const EVADE_EVERY = 40;

/** The guest in `evade`: a tap at one foe and then the other, aimed where its screen shows it, its bow ready. */
function evadeInput(frame: number): Frame {
  const foes = G.enemies.filter((foe) => foe.alive).sort((a, b) => a.id - b.id);
  const foe = foes[Math.floor(frame / EVADE_EVERY) % Math.max(1, foes.length)];
  if (!foe) return {};
  const aim = foe.pos.clone();
  aim.y = foe.height * 0.5;
  return { aim, m0: frame % EVADE_EVERY < 2 };
}

/** the guest's two spots in `blink`, 7 m apart in the open (the lab's `blink` lands there), and the frames between its
 *  blinks from one to the other */
const BLINK_SPOTS: XZ[] = [[12, 22], [8.65, 15.85]];
const BLINK_EVERY = 200;
/** the frames the guest holds the blink's key, aimed at the other spot, before it lets go, and the frames it keeps
 *  aiming there after, as a player's cursor stays where it was (the lab's own aim is a step ahead of the hero) */
const BLINK_HOLD = 12;
const BLINK_AIMED = 40;

/** The key the local hero's skill `impl` is on (none: it hasn't got it). */
function keyOf(impl: string): SkillKey | null {
  return SKILL_KEYS.find((key) => G.player.skillAt(key)?.def.impl === impl) ?? null;
}

/** The guest in `blink`: every so often it holds the blink aimed at its other spot and lets go, its cooldown and
 *  energy made ready first (a blink every few seconds, where its own cooldown would allow one in seven). */
function blinkInput(frame: number): Frame {
  const key = keyOf('blink');
  const beat = frame % BLINK_EVERY;
  if (!key || beat >= BLINK_AIMED) return {};
  if (beat === 0) {
    G.player.cooldowns.clear();
    G.player.energy = G.player.stats.maxEnergy;
  }
  const [x, z] = BLINK_SPOTS[(Math.floor(frame / BLINK_EVERY) + 1) % BLINK_SPOTS.length];
  const aim = new THREE.Vector3(x, 0, z);
  return { keys: beat < BLINK_HOLD - 1 ? [key] : [], aim };
}

/** the guest's spot in `rush` and the way it charges (rad: a lane clear of props in the forest, as the lab's `rush`
 *  finds one), the frame it charges at and how far ahead it aims (its whole range) */
const RUSH_FROM: XZ = [-10, -12];
const RUSH_WAY = (120 * Math.PI) / 180;
const RUSH_AT = 20;
const RUSH_AHEAD = 9;

/** A point `ahead` m along the guest's charge in `rush`, from its spot. */
function rushAhead(ahead: number): XZ {
  return [RUSH_FROM[0] + Math.sin(RUSH_WAY) * ahead, RUSH_FROM[1] + Math.cos(RUSH_WAY) * ahead];
}

/** how far Power Strike's charge-up is from its blow as the guest in `strike` casts Bull Rush over it (s): about
 *  the charge's brace and half its run, so the blow lands in the run (as the lab's `rush` casts them) */
const STRIKE_LEAD = 0.35;

/** The guest in `strike`: it charges a Power Strike on its spot, and as the strike is `STRIKE_LEAD` from its blow
 *  casts Bull Rush over it along its way, its cooldowns and energy made ready first. */
function strikeInput(frame: number): Frame {
  const strike = keyOf('powerStrike');
  const rush = keyOf('bullRush');
  const [x, z] = rushAhead(RUSH_AHEAD);
  const aim = new THREE.Vector3(x, 0, z);
  if (!strike || !rush) return { aim };
  const hero = G.player;
  if (frame === RUSH_AT) {
    hero.cooldowns.clear();
    hero.energy = hero.stats.maxEnergy;
    return { keys: [strike], aim };
  }
  const cast = hero.casting;
  const due = cast?.skill.def.impl === 'powerStrike' && cast.fireAt - cast.t <= STRIKE_LEAD;
  return due && hero.cooldownLeft('bullRush') <= 0 ? { keys: [rush], aim } : { aim };
}

/** The guest in `rush`: it charges along its way once, its cooldown and energy made ready first. */
function rushInput(frame: number): Frame {
  const key = keyOf('bullRush');
  const [x, z] = rushAhead(RUSH_AHEAD);
  const aim = new THREE.Vector3(x, 0, z);
  if (!key || frame !== RUSH_AT) return { aim };
  G.player.cooldowns.clear();
  G.player.energy = G.player.stats.maxEnergy;
  return { keys: [key], aim };
}

const SCENARIOS: Record<string, Scenario> = {
  walk: {
    about: 'the host runs round in circles and the guest zigzags, stopping now and then',
    frames: 480,
    host: [9, 19],
    guest: [15, 23],
    foes: [],
    hostInput: (frame) => ({ keys: roundAt(frame, 12) }),
    guestInput: (frame) => ({ keys: zigzagAt(frame) }),
  },
  foes: {
    about: 'five foes chase the heroes, the host running back and forth',
    frames: 480,
    host: [9, 19],
    guest: [15, 23],
    foes: [
      { type: 'thornling', at: [4, 14] },
      { type: 'thornling', at: [3, 19] },
      { type: 'thornling', at: [7, 25] },
      { type: 'mossback', at: [17, 14] },
      { type: 'mossback', at: [19, 19] },
    ],
    hostInput: (frame) => ({ keys: Math.floor(frame / 50) % 2 ? ['a'] : ['d'] }),
    guestInput: () => ({}),
  },
  shoot: {
    about: 'a foe chases the host round in circles while the guest shoots at it, the host holding Tab at the end',
    frames: 600,
    host: [6, 16],
    guest: [16, 25],
    foes: [{ type: 'mossback', at: [10, 12] }],
    pictures: [590],
    hostInput: (frame) => ({ keys: frame >= SCORES_FROM ? [...roundAt(frame, 22), 'tab'] : roundAt(frame, 22) }),
    guestInput: shootInput,
  },
  dodge: {
    about: 'a foe attacks the guest, who runs from every other blow as it sees it coming',
    frames: 900,
    host: [-4, 22],
    guest: [12, 22],
    foes: [{ type: 'mossback', at: [12, 20.4] }],
    hostInput: () => ({}),
    guestInput: () => dodger.input(),
  },
  down: {
    about: 'a foe brings the guest down across the arena, and the host comes and raises it',
    frames: 900,
    host: [-10, -12],
    guest: [12, 22],
    foes: [{ type: 'mossback', at: [12, 20.4] }],
    guestLife: 1,
    pictures: [140, 330, 460, 540],
    hostInput: raiseInput,
    guestInput: () => ({}),
  },
  evade: {
    about: 'the guest shoots at a Rift Witch and a Sporecaller in turn, each of which may blink or duck out of the way',
    frames: 900,
    host: [-4, 22],
    guest: [16, 25],
    foes: [
      { type: 'witch', at: [8, 17] },
      { type: 'sporecaller', at: [12, 15] },
    ],
    skill: ['nockShot', 'splinterBolt'],
    hostInput: () => ({}),
    guestInput: evadeInput,
  },
  throws: {
    about: 'a Cinder Brute throws lava and a Barkhide Hulk sends vines at the guest from afar, the guest standing and '
      + 'walking only while a vine holds it, the host standing off',
    frames: 900,
    host: [-14, -10],
    guest: [16, 25],
    // (the Brute far enough off that it throws again once its first lands, in the settling, before it walks into
    // slamming range)
    foes: [
      { type: 'brute', at: [16, 9.5] },
      { type: 'barkhulk', at: [5, 25] },
    ],
    hostInput: () => ({}),
    guestInput: () => ({ keys: (G.player as { rooted?: boolean }).rooted ? ['d'] : [] }),
  },
  blink: {
    about: 'the guest, a mage, blinks between two spots as foes close on it, the host standing off',
    frames: 800,
    host: [-4, 22],
    guest: BLINK_SPOTS[0],
    foes: [
      { type: 'thornling', at: [10, 19] },
      { type: 'thornling', at: [14, 19] },
      { type: 'thornling', at: [9, 24] },
      { type: 'mossback', at: [20, 16] },
    ],
    skill: 'blink',
    pictures: [40, 240],
    hostInput: () => ({}),
    guestInput: blinkInput,
  },
  wave: {
    about: 'the host lets wave 4 come, its foes rising at the gates and fighting, both heroes standing by the dais; '
      + 'the guest hears of no spawn for its first 6 s, as a guest whose run started late',
    frames: 900,
    host: [-1.5, 3],
    guest: [1.5, 3],
    foes: [],
    wave: 4,
    spawnsLost: 360,
    hostInput: () => ({}),
    guestInput: () => ({}),
  },
  rush: {
    about: 'the guest, a warrior, charges through three dazed foes, the host standing off',
    frames: 240,
    host: [-4, 22],
    guest: RUSH_FROM,
    foes: [
      { type: 'mossback', at: rushAhead(2.5), dazed: true },
      { type: 'thornling', at: rushAhead(4.5), dazed: true },
      { type: 'mossback', at: rushAhead(6.5), dazed: true },
    ],
    skill: 'bullRush',
    pictures: [RUSH_AT + 20, RUSH_AT + 40, RUSH_AT + 120],
    hostInput: () => ({}),
    guestInput: rushInput,
  },
  strike: {
    about: 'the guest, a warrior, charges a Power Strike and casts Bull Rush over it through three dazed foes, the '
      + 'strike landing in the charge, the host standing off',
    frames: 300,
    host: [-4, 22],
    guest: RUSH_FROM,
    foes: [
      { type: 'mossback', at: rushAhead(2.5), dazed: true },
      { type: 'thornling', at: rushAhead(4.5), dazed: true },
      { type: 'mossback', at: rushAhead(6.5), dazed: true },
    ],
    skill: 'powerStrike',
    pictures: [RUSH_AT + 85, RUSH_AT + 100],
    hostInput: () => ({}),
    guestInput: strikeInput,
  },
};

/** The scenarios, by name, and what each plays. */
export const COOP_SCENARIOS = Object.fromEntries(Object.entries(SCENARIOS).map(([name, s]) => [name, s.about]));

/** The channels of this page's game and the messages in and out, as the lab carries them. */
const wire = {
  /** the lab's clock as the co-op began, ms */
  start: 0,
  outbox: [] as Sent[],
  inbox: [] as Arriving[],
  channels: new Set<LabChannel>(),
};

function wireTime(): number {
  return window.__labClock.t - wire.start;
}

/** Stands in for the browser's BroadcastChannel, which the game's `?net=local` link talks over. */
class LabChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly name: string) {
    wire.channels.add(this);
  }

  postMessage(data: unknown): void {
    wire.outbox.push({ at: wireTime(), name: this.name, data: structuredClone(data) });
  }

  close(): void {
    wire.channels.delete(this);
  }
}

/** A packet of the game's local link (`localLink` in src/net/transport.ts) as the lab carries it. */
interface Packet {
  ch?: string;
  data?: { x?: { k: string }[] };
}

/** The host's report with its spawns taken out, while the scenario has the guest lose them (`spawnsLost`). */
function loseSpawns(message: Arriving): void {
  const lost = SCENARIOS[play.scenario]?.spawnsLost ?? 0;
  if (play.role !== 'guest' || play.frame >= lost) return;
  const packet = message.data as Packet;
  if (packet.ch !== 'w' || !packet.data?.x) return;
  packet.data.x = packet.data.x.filter((event) => event.k !== 'spawn');
}

/** Hands the game the messages that have arrived by the frame about to run, in the order they arrive. */
function deliver(): void {
  const by = wireTime() + window.__labClock.frame;
  while (wire.inbox.length && wire.inbox[0].due <= by) {
    const message = wire.inbox.shift()!;
    loseSpawns(message);
    for (const channel of wire.channels) {
      if (channel.name === message.name) channel.onmessage?.({ data: message.data });
    }
  }
}

/**
 * The round trip to the co-op server the game shows (the scoreboard's ping), as the relay's pings would measure it:
 * a ping a second, half the link's least round trip (the server between the two games) and up to the jitter more.
 */
const link = { ping: 0, jitter: 0, sinceRtt: 0, random: 0x2f6b1d9 };

function linkRandom(): number {
  link.random = (Math.imul(link.random, 1664525) + 1013904223) >>> 0;
  return link.random / 4294967296;
}

function reportRtt(): void {
  link.sinceRtt += window.__labClock.frame;
  if (link.sinceRtt < 1000) return;
  link.sinceRtt -= 1000;
  netlog.serverRtt(link.ping / 2 + link.jitter * linkRandom());
}

/** This page's role, the scenario it plays and what it recorded. */
const play = {
  role: 'host' as Role,
  /** which of the party's other heroes this page plays (`EXTRA_SPOTS`), or null: the host or the guest */
  extra: null as number | null,
  scenario: '',
  frame: 0,
  samples: [] as Sample[],
  /** arrows seen in flight, so a new one is counted as loosed once */
  seen: new WeakSet<Projectile>(),
  /** where this frame's friendly arrows ended */
  ended: [] as XZ[],
  /** each foe's shown attack and how far through it was last frame */
  attacks: new Map<number, { action: unknown; share: number }>(),
  /** the chunks of lava and the vines in the scene last frame, a chunk with where it was */
  chunks: new Map<THREE.Object3D, XZ>(),
  vines: new WeakSet<THREE.Object3D>(),
};

/** Notes where each friendly arrow ends, to tell an arrow that struck a foe on this game's screen. */
function watchArrows(): void {
  const proto = Projectile.prototype as Projectile & { labWatched?: boolean };
  if (proto.labWatched) return;
  proto.labWatched = true;
  const kill = proto.kill;
  proto.kill = function (this: Projectile) {
    if (!this.hostile) play.ended.push([this.pos.x, this.pos.z]);
    return kill.call(this);
  };
}

/** What a page is told as it opens or joins the room. */
interface CoopOpening {
  role: Role;
  code?: string;
  /** its player's name tag (the host's 'Host' and a guest's 'Guest' by default) */
  tag?: string;
  /** one of the party's other heroes (`EXTRA_SPOTS`), joining as a guest */
  extra?: number;
  /** the hero's colour its player picked (data/heroColours.ts; null: none, the room gives one) */
  colour?: string | null;
  ping: number;
  jitter: number;
}

/** The room opened (the host) or joined (the guest) over the lab's channels. Returns the room's code. */
export async function coopOpen(lab: Lab, open: CoopOpening): Promise<string> {
  const { role, code } = open;
  play.extra = open.extra ?? null;
  history.replaceState(null, '', `${location.pathname}?net=local`);
  (window as unknown as { BroadcastChannel: unknown }).BroadcastChannel = LabChannel;
  wire.start = window.__labClock.t;
  play.role = role;
  lab.beforeFrame.push(deliver);
  link.ping = open.ping;
  link.jitter = open.jitter;
  // (an older tree's network log has no round trips to keep)
  if (typeof netlog.serverPings === 'function') {
    netlog.watchServer('the lab\'s link');
    lab.beforeFrame.push(reportRtt);
  }
  watchArrows();
  drawApart();
  pickColour(open.colour ?? null);
  if (role === 'host') await hostRoom(open.tag ?? 'Host');
  else await joinRoom(code!, open.tag ?? 'Guest');
  return session.code;
}

/** where the game keeps the colour picked (net/heroColour.ts; an older tree reads nothing there) */
const COLOUR_KEY = 'last-stand.colour.v1';

/** The colour this page's player picked, kept as the picker keeps it (null: none). */
function pickColour(colour: string | null): void {
  if (colour) localStorage.setItem(COLOUR_KEY, colour);
  else localStorage.removeItem(COLOUR_KEY);
}

/** A hero's colour and the colour his cloth is drawn in (none in an older tree). */
type Dyed = { colour?: string | null; model: { dye?: { shown: number } } };
const colourOf = (player: Player): string | null | undefined => (player as unknown as Dyed).colour;
const wornOf = (player: Player): number | null => (player as unknown as Dyed).model.dye?.shown ?? null;

/** draws each of the party's other heroes' pages makes before it joins, a share for each */
const DRAWS_APART = 16;

/**
 * Sets this page's random numbers apart from the other pages' before it joins: every page's are seeded alike and
 * seeded again each frame from the frames run, so two joining on the same frame drew the same link id
 * (`localLink`'s `self`), and the room took them for one player.
 */
function drawApart(): void {
  if (play.extra === null) return;
  for (let draw = 0; draw < DRAWS_APART * (play.extra + 1); draw++) Math.random();
}

/** The canary: this page's hero dressed in `colour` behind the room's back (its partners never told). */
export function coopWearColour(_lab: Lab, { colour }: { colour: string }): void {
  (G.player as unknown as { setColour(colour: string): void }).setColour(colour);
}

/** Joins the room again as `tag`: asked for another name tag, the player types one. */
export async function coopRejoin(_lab: Lab, { code, tag }: { code: string; tag: string }): Promise<void> {
  drawApart();
  await joinRoom(code, tag);
}

/** The guest practising on the lobby's dummies while it waits for its host, as a player does: its lobby stowed, as
 *  Space and a phone's Practice stow it. */
export function coopPractise(): void {
  toggleMenuStowed(true);
}

/** The host starts the run (its guest comes along). */
export function coopStart(): void {
  document.getElementById('btn-start')?.click();
}

function stateNow(): CoopState {
  const partners = G.players.filter((player) => !player.local).sort((a, b) => a.slot - b.slot);
  const known = session as { tag?: string; renameAsked?: boolean };
  return {
    mode: G.mode,
    status: session.status,
    partners: partners.length,
    stowed: menuStowed(),
    free: G.player.sandbox,
    slot: G.player.slot,
    tag: known.tag ?? '',
    partnerTags: partners.map((player) => (player as { tag?: string }).tag ?? ''),
    partnerSlots: partners.map((player) => player.slot),
    renameAsked: Boolean(known.renameAsked),
    colour: colourOf(G.player),
    partnerColours: partners.map((player) => colourOf(player) ?? null),
    worn: wornOf(G.player),
    partnerWorn: partners.map(wornOf),
    out: Boolean(G.player.out),
    phase: G.run?.phase ?? '',
    runOver: !G.run || G.run.phase === 'over',
    summary: !document.getElementById('summary')?.classList.contains('hidden'),
  };
}

/** The host's wave cleared, as its foes all fall: the run no longer held in its countdown, so the choice after the
 *  wave comes (`coopEnd`'s bank). On the guests, nothing to do: they follow the host. */
export function coopClearWave(lab: Lab): void {
  const at = lab.beforeFrame.indexOf(holdTheRun);
  if (at >= 0) lab.beforeFrame.splice(at, 1);
  const run = G.run;
  if (play.role !== 'host' || !run) return;
  clearEnemies();
  run.queue = [];
  run.boss = null;
  run.pending = 0;
  run.phase = 'fighting';
}

/** The run held in its countdown again (a run started after the scenarios: no wave comes). */
export function coopHoldRun(lab: Lab): void {
  play.scenario = '';
  if (!lab.beforeFrame.includes(holdTheRun)) lab.beforeFrame.push(holdTheRun);
}

/** The run's countdown held (no wave comes) and every hero kept from falling. */
function holdTheRun(): void {
  const run = G.run;
  // (a wave let come runs as the game runs it)
  if (SCENARIOS[play.scenario]?.wave) return;
  if (run && play.role === 'host') {
    run.queue = [];
    run.phase = 'countdown';
    run.timer = Infinity;
  }
}

function makeUnhurt(player: Player): void {
  player.stats.maxLife = UNHURT;
  player.life = UNHURT;
}

/** Sets scenario `name` up on this page: its hero on its spot, the foes spawned on the host, nothing recorded yet. */
export function coopScenario(lab: Lab, { name }: { name: string }): void {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`lab: coop: no scenario ${name}`);
  play.scenario = name;
  play.frame = 0;
  play.samples = [];
  play.attacks.clear();
  dodger = new Dodger();
  stickToward(0, 0);
  if (!lab.beforeFrame.includes(holdTheRun)) lab.beforeFrame.push(holdTheRun);
  const extraSpot = play.extra === null ? null : EXTRA_SPOTS[play.extra];
  const [x, z] = extraSpot ?? (play.role === 'host' ? scenario.host : scenario.guest);
  G.player.place(new lab.THREE.Vector3(x, 0, z), Math.PI);
  G.player.vel.set(0, 0, 0);
  for (const player of G.players) makeUnhurt(player);
  if (play.role === 'guest' && play.extra === null && scenario.guestLife !== undefined) {
    G.player.life = scenario.guestLife;
  }
  // (on both: the host clears its foes without a word to the guest, whose copies of them would stay where they were)
  clearEnemies();
  if (play.role !== 'host') return;
  if (scenario.wave && G.run) {
    G.run.wave = scenario.wave;
    G.run.phase = 'countdown';
    G.run.timer = 0;
  }
  for (const foe of scenario.foes) {
    const enemy = spawnEnemy(foe.type, new lab.THREE.Vector3(foe.at[0], 0, foe.at[1]), { wave: 1 });
    enemy.life = UNKILLED;
    if (foe.dazed) enemy.dazed = Infinity;
  }
}

/** Runs a turn of frames: the messages arrived meanwhile handed over as they arrive, the scenario's input. */
export async function coopFrames(lab: Lab, turn: CoopTurn): Promise<CoopTurnResult> {
  wire.inbox.push(...turn.arriving);
  // (in a party of more, each sender's come in its order, the senders' between each other by when they arrive)
  wire.inbox.sort((a, b) => a.due - b.due);
  const scenario = turn.scenario ? SCENARIOS[turn.scenario] : null;
  const inputOf = (frame: number): Frame => {
    const end = endInput();
    if (end) return end;
    const lobby = lobbyCastInput(play.frame + frame);
    if (lobby) return lobby;
    // (the party's other heroes stand where they were put)
    if (!scenario || play.extra !== null) return {};
    const at = play.frame + frame - SETTLE_FRAMES;
    if (at < 0) return {};
    return play.role === 'host' ? scenario.hostInput(at) : scenario.guestInput(at);
  };
  const record = (frame: number): void => {
    watchHall();
    watchTags();
    watchHeroCost();
    watchOut();
    if (!scenario) return;
    const sample = sampleNow();
    if (play.frame + frame >= SETTLE_FRAMES) play.samples.push(sample);
  };
  await lab.step(turn.frames, inputOf, record);
  play.frame += turn.frames;
  return { sent: wire.outbox.splice(0), state: stateNow() };
}

/** Why this game's hero can't play scenario `name` (null: it can). */
export function coopUnplayable(_lab: Lab, { name }: { name: string }): string | null {
  const skill = SCENARIOS[name].skill;
  const skills = skill === undefined ? [] : [skill].flat();
  if (!skills.length || skills.some(keyOf)) return null;
  return `the ${G.player.cls.id} has no ${skills.join(' or ')} skill`;
}

/** How many frames scenario `name` records, and the frames its screens are pictured at. */
export function coopScenarioFrames(_lab: Lab, { name }: { name: string }): { frames: number; pictures: number[] } {
  return { frames: SCENARIOS[name].frames, pictures: SCENARIOS[name].pictures ?? [] };
}

/** Draws the game's frames as it does (on: for a picture) or skips the drawing (off). */
export function coopDrawing(lab: Lab, { on }: { on: boolean }): void {
  lab.drawing = on;
}

/** What this game recorded of the scenario. */
export function coopSamples(): Sample[] {
  return play.samples;
}

/** What this game shows this frame (called once a frame: it notes each foe's attack as it goes). */
function sampleNow(): Sample {
  const self = G.player;
  const partner = G.players.find((player) => !player.local);
  const sample: Sample = {
    self: [self.pos.x, self.pos.z],
    life: self.life,
    standing: { self: stateOf(self), partner: partner ? stateOf(partner) : null },
    partner: partner ? [partner.pos.x, partner.pos.z] : null,
    shown: { self: self.obj.visible, partner: partner ? partner.obj.visible : null },
    playout: playoutNow(),
    foes: G.enemies.filter((foe) => foe.alive).map((foe) => foeSample(foe, self)),
    struck: struckFoes(),
    loosed: loosedArrows(),
    acts: { self: actOf(self), partner: partner ? actOf(partner) : null },
    thrown: thrownNow(self, partner),
  };
  play.ended = [];
  return sample;
}

/** Whether `a` is within `reach` of `b` on the floor. */
const near = (a: THREE.Vector3, b: THREE.Vector3, reach: number): boolean => Math.hypot(a.x - b.x, a.z - b.z) < reach;

/** how near a hero's feet a vine's coils are to be his (m) */
const COILED_NEAR = 0.3;

/** What the foes threw this frame as this game shows it, read from the scene by its meshes' names (`lava chunk`,
 *  `vine`, `vine coils`: an older tree has none): a chunk gone from it since last frame landed where it last was. */
function thrownNow(self: Player, partner: Player | undefined): Sample['thrown'] {
  const chunks = new Map<THREE.Object3D, XZ>();
  let vines = 0, coiled = false;
  for (const object of G.scene.children) {
    if (object.name === 'lava chunk') chunks.set(object, [object.position.x, object.position.z]);
    if (object.name === 'vine' && !play.vines.has(object)) {
      play.vines.add(object);
      vines++;
    }
    if (object.name === 'vine coils' && partner && near(object.position, partner.pos, COILED_NEAR)) coiled = true;
  }
  const landed = [...play.chunks].filter(([chunk]) => !chunks.has(chunk)).map(([, at]) => at);
  play.chunks = chunks;
  const held = Boolean((self as { rooted?: boolean }).rooted);
  return { landed, vines, held, coiled };
}

function foeSample(foe: Enemy, hero: Player): FoeSample {
  const action = foe.action;
  const def = foe.def;
  const hitAt = def.windup / (def.windup + def.recover);
  const share = action && action.name === 'attack' ? action.t / action.dur : -1;
  const last = play.attacks.get(foe.id);
  const fresh = !last || last.action !== action;
  const blow = share >= hitAt && (fresh || last.share < hitAt);
  play.attacks.set(foe.id, { action, share });
  const distance = Math.hypot(hero.pos.x - foe.pos.x, hero.pos.z - foe.pos.z);
  const inReach = distance < def.range + hero.radius + 0.3 && foe.inFront(hero.pos.x, hero.pos.z, 1.3);
  // (an older tree's foes are never dazed, carried nor thrown)
  const dazed = ((foe as { dazed?: number }).dazed ?? 0) > 0;
  const carried = Boolean(foe.carried);
  const up = foe.tossed?.y ?? 0;
  // (an older tree's foes never evade)
  const ducked = ((foe as { ducked?: number }).ducked ?? 0) > 0;
  const gone = ((foe as { gone?: number }).gone ?? 0) > 0;
  const risen = !foe.spawning;
  const hidden = hiddenWhy(foe);
  return {
    id: foe.id, x: foe.pos.x, z: foe.pos.z, life: foe.life, blow, inReach, dazed, carried, up, ducked, gone,
    risen, drawn: !hidden, hidden,
  };
}

/** a foe dissolved this far is not to be seen */
const DISSOLVED = 0.99;
/** a body scaled smaller than this is not to be seen */
const SHRUNK = 0.01;

/**
 * Why this game would not draw `foe` this frame ('' if it would): out of the scene, hidden, dissolved, shrunk to
 * nothing, or (drawn in a crowd, as every creature is) left out of its crowd.
 */
function hiddenWhy(foe: Enemy): string {
  if (foe.obj.parent !== G.scene) return 'out of the scene';
  if (!foe.obj.visible || !foe.model.root.visible) return 'hidden';
  const dissolve = foe.model.kit?.u?.uDissolve?.value ?? 0;
  if (dissolve >= DISSOLVED) return `dissolved (${dissolve.toFixed(2)})`;
  foe.obj.updateMatrixWorld(true);
  const scale = foe.model.root.matrixWorld.getMaxScaleOnAxis();
  if (scale < SHRUNK) return `shrunk (${scale.toFixed(3)})`;
  // (an older tree draws no crowds)
  const seated = (crowd as { inCrowd?: (body: Enemy) => boolean }).inCrowd;
  const crowdKind = foe.model.root.userData.crowdKind as string | undefined;
  if (seated && crowdKind && crowd.crowdSlots(foe.model).length && !seated(foe)) return 'out of its crowd';
  return '';
}

/** how long a foe's rise is, for the judge (s) */
export const FOE_RISE = RISE_TIME;

/** How this game plays its partner's reports out, where this tree's session has a timeline for it. */
function playoutNow(): Sample['playout'] {
  type Peer = { clock?: { behind: number; rate: number; held: boolean } };
  const peer = [...session.peers.values()][0] as Peer | undefined;
  const clock = peer?.clock;
  return clock ? { behind: clock.behind, rate: clock.rate, held: clock.held } : null;
}

/** The foes this frame's arrows ended on, as this game shows them. */
function struckFoes(): number[] {
  const struck: number[] = [];
  for (const [x, z] of play.ended) {
    const foe = G.enemies.find((enemy) => Math.hypot(enemy.pos.x - x, enemy.pos.z - z) < enemy.radius + STRUCK_REACH);
    if (foe) struck.push(foe.id);
  }
  return struck;
}

/** What a hero's hooks saw of the frame: the action it was posed in, and the skills it landed. */
interface Watched {
  shown: ActionState | null;
  landed: string[];
}

const watched = new WeakMap<Player, Watched>();

/** A hero's action this frame as this game shows it (its pose and its landings watched from its first sample). */
function actOf(hero: Player): Act {
  let seen = watched.get(hero);
  if (!seen) {
    seen = { shown: null, landed: [] };
    watched.set(hero, seen);
    watch(hero, seen);
  }
  const cast = hero.casting;
  const act: Act = {
    shown: seen.shown?.name ?? null,
    // (an older tree poses no charge under another action)
    under: Boolean((seen.shown as { under?: unknown } | null)?.under),
    dashing: hero.dash !== null,
    casting: cast?.skill.def.impl ?? null,
    charging: Boolean(cast && !cast.fired),
    landed: seen.landed,
  };
  seen.landed = [];
  return act;
}

/** `hero`'s pose and landings watched into `seen`: the action each pose is given, and each skill's `fire`. */
function watch(hero: Player, seen: Watched): void {
  const pose = hero.pose.bind(hero);
  hero.pose = (dt, t, move, dir, lean, action) => {
    seen.shown = action;
    pose(dt, t, move, dir, lean, action);
  };
  const fire = hero.fire.bind(hero);
  hero.fire = (skill, target, power) => {
    seen.landed.push(skill.def.impl);
    fire(skill, target, power);
  };
}

/** The local hero's arrows that went up this frame (on the host, its partner's replayed ones too). */
function loosedArrows(): number {
  let loosed = 0;
  for (const projectile of G.projectiles) {
    if (projectile.hostile || play.seen.has(projectile)) continue;
    play.seen.add(projectile);
    loosed++;
  }
  return loosed;
}
