// Global tuning knobs. Class/enemy/item specifics live in their own data files.
import type { DamageType } from '../types';

export const CAMERA = {
  fov: 38,
  distance: 30,        // units from focus point
  pitch: 1.08,         // radians above the horizon at default zoom (steep, top-down ARPG view)
  closePitch: 0.62,    // pitch when fully zoomed in (more cinematic)
  follow: 7,           // follow stiffness
  minZoom: 0.22,
  lobbyZoom: 0.45,     // closer view while in the lobby
  maxZoom: 1.7,
  zoomStep: 1.12,      // multiplicative zoom per mouse-wheel notch
  orbitSpeed: 0.006,   // radians of camera yaw per pixel of middle-drag
  // the close views (V cycles top-down, third person, first person): mouse look, aim at the crosshair
  lookSpeed: 0.0025,   // radians per pixel of mouse movement
  third: { fov: 55, boom: 4.6, minBoom: 2.4, maxBoom: 8, side: 0.55, pitch: 0.28, minPitch: -0.45, maxPitch: 1.2 },
  first: { fov: 66, pitch: 0.1, minPitch: -1.2, maxPitch: 1.3 },
  switchTime: 0.45,    // seconds to glide from one view to the next
  aimRange: 24,        // how far ahead the crosshair aims when it points above the floor
};

export const ARENA = {
  radius: 26.6,        // walkable radius (wall inner face is at ~28.3)
  daisHalf: 5.2,       // half-size of the raised central dais
  daisHeight: 0.35,
};

export const LOBBY = {
  /** training dummy positions (x, z), in front of the spawn point */
  dummies: [[-2.8, -4], [0, -4.6], [2.8, -4]] as const,
};

// Damage type colors used by VFX and floating numbers.
export const DAMAGE_COLORS: Record<DamageType, number> = {
  arcane: 0x5dffa8,
  cold: 0x8fd8ff,
  fire: 0xff8a3c,
  lightning: 0x9fb2ff,
  physical: 0xffffff,
  vitality: 0xd060ff,
};
/** A hit's number by its type: arcane is the mage's plain damage, white as the others' physical is (green, his
 *  numbers read as something other than a hit); the elements keep their colours. */
export const NUMBER_COLORS: Record<DamageType, number> = { ...DAMAGE_COLORS, arcane: 0xffffff };

export const RUN = {
  countdown: 3.5,             // seconds before each wave starts
  healOnContinue: 0.25,       // fraction of max health restored when continuing
  energyOnContinue: 1.0,      // fraction of max energy restored when continuing
  bagLimit: 60,               // stash capacity
  scorePerKill: 10,
  multiplierMax: 5,
  multiplierDecay: 4.5,       // seconds without a kill before the multiplier drops a step
  killsPerMultiplier: 12,
};

/** Shield block: after a block the shield needs `recovery` seconds before it can block again.
 *  Raised, it blocks every hit within `arc` radians of the facing with no recovery, until a hit
 *  bigger than it can hold breaks the guard: the character staggers for `guardBreak` seconds, able
 *  to move but not to block, attack or cast. */
/** a drawn shot counts as drawn to full from this share of its draw's time: its arrowhead glints, the crosshair is
 *  bold, and Lancewood Shot strikes harder */
export const FULL_DRAW = 0.98;

export const BLOCK = { recovery: 0.7, arc: 1.4, guardBreak: 1.5 };

/** Co-op: party size, reviving a downed teammate, and how much more the arena throws at a party. */
export const COOP = {
  maxPlayers: 4,
  /** seconds a downed player lasts before bleeding out (the clock stops while a teammate raises them), and a
   *  teammate's hold (E) to raise them */
  bleedOut: 25,
  reviveTime: 2.3,
  /** how close the teammate must stand (m), the health they get back, and a moment untouchable */
  reviveRange: 2.4,
  reviveLife: 0.35,
  reviveGuard: 1.5,
  /** state updates sent per second */
  sendRate: 20,
};

/** Co-op pings (game/ping.ts): what a player shows the party, and for how long. */
export const PING = {
  /** how long a ping shows (s), fading in and out over its ends */
  life: 6,
  fadeIn: 0.15,
  fadeOut: 1,
  /** the least time between a player's pings (s): a new one replaces the last */
  gap: 0.4,
  /** the aim dragged this far with Left Shift held marks an area (m), at most this wide a radius */
  areaFrom: 2,
  areaMost: 12,
  /** a spot's ring and a foe's ring past its body (m) */
  spotRadius: 0.9,
  foeRing: 0.4,
  /** a foe pinged when the aim is this near its body (m), on the minimap this near its middle */
  foeNear: 1.2,
  mapFoeNear: 1.6,
  /** a touch held this long on the minimap pings there (s), unless it moved this far (css px) */
  longPress: 0.5,
  pressSlop: 12,
  /** the ripple running out over a ping's ring, once this often (s: slower than 1.5 a second, never a flash) */
  ripple: 1.2,
};

/**
 * What a party of 1 to `COOP.maxPlayers` meets, against one hero alone: the foes in a wave (`foes`), the life on each
 * (`life`, a boss's summons too) and on a boss (`boss`), and the foes that may stand at once (`alive`, added to the
 * wave's own most, `WAVES.maxAlive`, never past its cap). A wave's whole life is `foes * life`, a share more for each
 * hero than one alone meets (1.08 for two, as it was; 1.12 for three, 1.13 for four), as the others are there to
 * raise one who falls; the count grows slower than the heroes and the life faster, so four meet 2.5 times the foes
 * and the frame stays within the crowd's budget (`WAVES.maxAlive`'s cap). A boss is one foe each hero strikes, so its
 * life follows the heroes closer: 0.68 to 0.75 of each one's share. Four by the old rule per player (0.6 more foes,
 * 0.35 more life) met 5.7 times one hero's wave, 1.4 times each one's share.
 */
export const PARTY = {
  foes: [1, 1.6, 2.1, 2.5],
  life: [1, 1.35, 1.6, 1.8],
  boss: [1, 1.5, 2.1, 2.7],
  alive: [0, 4, 7, 10],
};

/** What a party of `n` heroes meets (`PARTY`'s row for it, one hero's below one, four's above four). */
export function partyScale(n: number): { foes: number; life: number; boss: number; alive: number } {
  const i = Math.max(0, Math.min(PARTY.foes.length - 1, Math.round(n) - 1));
  return { foes: PARTY.foes[i], life: PARTY.life[i], boss: PARTY.boss[i], alive: PARTY.alive[i] };
}

/** How a kill throws its body (combat/fling.ts): the speed any kill gives it (m/s, enough to topple it) and the most
 *  the overkill adds, at an overkill of `full` times its life, rising by its share to the power `curve` (the first
 *  share of a life adds the most); a foe's `knockbackResist` takes `stand` of it away and a boss keeps `boss` of it;
 *  how much of the drive goes up, and where on the body a blow lands (0 the feet, 1 the top), when a skill doesn't say. */
export const FLING = { base: 1.6, most: 10, full: 1.5, curve: 0.6, stand: 0.6, boss: 0.35, lift: 0.3, at: 0.6 };

/** What a charge does with the foes it meets (entities/carry.ts): how far clear of the hero's body it carries each
 *  (m); how fast it throws one on ahead as it stops, along the ground and up (m/s); how far across the charge it
 *  fans them out (a share of the way on) and how far back each tips in the air (rad); its skid on landing (a share
 *  of its throw) and its daze then (s); and how fast an elite or a boss is shoved on instead (m/s), dazed as long.
 *  The fallen in its way (a body it killed among them) are driven on before it: each part of one as far as `reach`
 *  ahead of the hero's body and `wide` either side of it (m: as wide as what it meets, past the foe's own size), and
 *  as high as `high`, gripped `grip` hard (/s) to go
 *  `ahead` faster than he does (m/s), slowed with him as he skids, and thrown on as the living are as he stops.
 *  A foe rides until the charge stops as its game plays it, or its clock says so, `late` s past that at most. */
export const CARRY = {
  gap: 0.1, throw: 6, lift: 5, fan: 0.35, tilt: 1.1, skid: 0.5, daze: 0.7, shove: 4,
  reach: 1.1, wide: 1.6, high: 2.4, grip: 30, ahead: 1.5, late: 0.5,
};

/** Twin Fangs' timing (s), the skill's (combat/skills/twinFangs: its lunge and its two strikes) and the warrior's cuts
 *  keyed to it (entities/models/warrior): the lunge, the follow-through standing after it (with none, the two cuts
 *  were over before the eye caught them), the right blade's strike from the press and the left's after it. A dual
 *  wielder's basic attack cuts every 0.3 s; the fangs 0.36 s apart, at 0.27 and 0.63 s of 0.9, were the owner's "too
 *  slow": "both hits in a rapid succession", "faster than regular LMB" (`lab hits twinFangs --than cleave`). */
export const FANGS = { lunge: 0.25, hold: 0.35, first: 0.2, apart: 0.15 };
