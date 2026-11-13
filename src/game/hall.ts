// The hall of heroes: the hero selection screen's stage (ui/heroSelect.ts), in a room of its own shown in the biome's
// place (world/heroHall.ts). Every class's hero stands in a row on a plinth in his gear from the save slot in play, each a remote player's copy (its casts play for show, dealing nothing:
// net/role.ts `dealsDamage`), the lobby's own hero hidden meanwhile. The camera comes to the hero in focus, lit by a key
// light and a rim light from the pool (fx/lights.ts: the count never changes), and he shows off a skill of his as it
// arrives (`HallDef.showcase`). Every hero's programs are warm before it opens (game/warm.ts, the `heroes` need).
import * as THREE from 'three';
import { VILLAGE } from '../core/beta';
import { G } from '../state';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { Player } from '../entities/player';
import { loadProfile, peekProfile } from '../loot/profile';
import { saveSlot } from '../loot/saveSlots';
import { clearEnemies } from '../entities/enemy';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { flash, release, type LightSlot } from '../fx/lights';
import { particles } from '../fx/particles';
import { stageCamera, type Shot } from '../core/renderer';
import { TAU } from '../util';
import { groundHeight } from '../world/ground';
import { hallSpot } from '../world/heroHall';
import { heroDetail } from '../entities/models/armor';
import { applyShadowDetail, qualityLevel } from '../core/quality';
import type { Profile } from '../types';
import { buildLater, finishNow, finishInSlices, queued } from './behind';
import { heroShare, warmingRuns } from './warm';
import { preloadHeads } from '../entities/models/head';
import { builtInSlices } from '../entities/models/steps';
import { HALL, TERRACE } from '../data/village';

/** the way the heroes face (to the camera) */
const ROW = { facing: 0 };
/** The shot on the hero in focus: the camera `back` m in front of him at `high`, looking at him at `at` m up (over
 *  where he stands: his chest, "center on chest, not groin area"), on an upright screen at `middle` m, both `upright`
 *  m higher there (`frameHall`: at his chest, he stood behind the heroes' names and the panel); the field of view,
 *  and how far it drifts round him (rad, with reduced motion none) over `driftS` s */
const SHOT = { back: 6.4, high: 2.3, at: 1.35, middle: 0.8, fov: 30, drift: 0.07, driftS: 14, upright: 0.3 };
/** The key light (warm, ahead of him and up to one side) and the rim light (cold, behind him), from the pool */
const KEY = { color: 0xffd2a0, intensity: 12, distance: 3.4, ahead: 1.4, side: 0.3, up: 2.1 };
/** the most light a highlight on a hero reflects (`Player.shine`): near, the key's glint on steel bloomed */
const SHINE = 0.55;
/** A glowing weapon head (the mage's staff's crystal) in the hall, kept under the bloom's threshold (a luminance of
 *  0.9, all or nothing) even on its facet turned to the key light, and given a halo of its own instead (`HALO`).
 *  Raised, it comes within a metre of the key light, which lit its glossy facets white and bloomed them into a blob,
 *  flaring as each facet turned to the light ("the staff's light is too bright when its flickering"). Its colour at
 *  0.4 still took that facet over the threshold every 0.7 s, its glow doubling, and under it, between those, it was a
 *  flat pink stone ("most of the time its completely boring"); its own glow over the threshold bloomed it into a flat
 *  pink coin, its saturated pink clipped (its luminance a third of its red), its facets gone. So: some of its colour
 *  (`lit`), for its facets to shade from dark to bright as a gem's, and less of its own glow (`glow` times its own),
 *  for the light's side to stay under the threshold (at 0.25 and 2 its faces were one flat pastel pink, paler than
 *  its halo); its facets rough, its coat thin and rough (polished, once a turn a facet mirrored the light warm-white:
 *  the hall's cap on highlights, `SHINE`, doesn't reach a coat's) and its highlight weak. */
const HEAD = { lit: 0.3, rough: 0.7, coat: 0.1, specular: 0.3, glow: 1.2, rings: 0.5 };
/** The light at a glowing weapon head's heart: a small glow particle a frame at its middle, brought `toward` m
 *  towards the camera so its own front faces don't hide it, its colour `white` of the way to white as a hot light's
 *  heart is, otherwise as the halo's (`HALO`): without it the gem's faces were a lit solid, paler than its halo, with no
 *  light of its own. Well over the bloom's threshold, for it to stay over it (at 1.35 it bloomed and didn't by turns),
 *  and small and pink (0.13 m across, a third white, it was a pale blob over the facets). */
const CORE = { size: 0.09, strength: 2.2, toward: 0.11, white: 0.1 };
/** The halo round a glowing weapon head: a glow particle a frame at its middle (`size` m across), each of its glow's
 *  colour fading to none over `life` s, as strong as the frame is long (`strength` a 30th of a second's), so the
 *  overlapping particles add up to the same halo at any frame rate (one every 30th of a second rippled 15% between
 *  frames); breathing by `breath` of it `rate` times a second, slow (nothing large pulses faster than 1.5 a second).
 *  Additive, as the glow pool draws (fx/particles.ts: already compiled, and dimmed near the camera). At 0.35 and
 *  0.9 m it flooded the wall magenta round a gem paler than it. */
const HALO = { life: 0.2, size: 0.75, strength: 0.22, breath: 0.2, rate: 0.4 };

/** Each hall hero's glowing weapon head: the mesh, and its glow's colour (before `HEAD.glow`). */
const halos = new Map<Player, { gem: THREE.Object3D; colour: THREE.Color }>();
const RIM = { color: 0x8fb4ff, intensity: 5, distance: 6, behind: 1.3, side: -0.8, up: 1.95 };
/** how fast a hero turns to his showcase's spot and back: a critically damped spring's rate (1/s), so a turn speeds up
 *  from rest and settles (eased in a frame by the angle alone, he set off at full speed: turning back to the camera
 *  after Power Strike, the axe's tip went from still to 11 cm a frame) */
const TURN = 7;
/** how fast a hero is still turning back to the camera (rad/s), at which he's stood at rest as he's left */
const TURNING = 0.01;
/** a drag along the row (ui/heroSelect.ts): how far past either end it may pull the camera (heroes), and how fast the
 *  camera follows it (`stageCamera`'s glide: about a frame and a half behind the finger) */
const DRAG = { over: 0.35, glide: 24 };
/** how long after the camera starts towards a hero he shows off his skill (s), and how long before he can again */
const SHOWCASE = { after: 0.8, again: 6 };

/** A hero of the hall: his class, the profile he wears, his copy, and his showcase's clock. */
export interface HallHero {
  id: string;
  profile: Profile;
  player: Player;
  /** game time his showcase is next due (Infinity: not until he's in focus again) */
  due: number;
  /** game time he last showed off */
  shown: number;
  /** the way he turns to face (the camera, or his showcase's spot), and how fast he's turning (rad/s) */
  facing: number;
  spin: number;
  /** a showcase under way: the skill's spot and when it fires (game time), and when he faces the camera again; a
   *  channel's, when it's let go */
  cast: { target: THREE.Vector3; fireAt: number; doneAt: number; drawn: boolean; endAt?: number } | null;
}

let heroes: HallHero[] = [];
/** each class's hero as the hall last built him, kept out of the scene while it's down, and the gear he wears: built
 *  afresh at every opening, the three held the click that opened it up 190 to 236 ms, and disposed held Back up 30
 *  (`npm run stalls -- --scenario heroes`) */
const kept = new Map<string, { player: Player; gear: string; profile: Profile; slot: number; level: string }>();
let focus = 0;
let lights: LightSlot[] = [];
/**
 * A co-op room's partners kept out of the hall: hidden (they'd stand in its room, among its heroes) and their casts
 * let go (`Player.replay` plays none for a hidden hero). Every frame, as a partner joining or one whose state resets
 * is shown again (four in a room stood among the heroes, a warrior's ward glowing over the mage's plinth).
 */
function hidePartners(): void {
  for (const p of G.players) {
    if (p.local || !p.obj.visible) continue;
    p.show(false);
    p.casting = null;
    if (p.channel) p.stopChannel();
  }
}
let opened = 0;
/** how much further back than `SHOT.back` the camera stands, so the hero fits the room the screen leaves him
 *  (`frameHall`) */
let further = 1;
/** the camera's place along the row while the scene is dragged (heroes from the first; null: on the hero in focus) */
let dragged: number | null = null;
/** whether the shot is an upright screen's: looking at his middle, so he stands in the middle of the room above the
 *  panel, his head clear of the window's top (looking at his hips, as beside a panel, it was cut off) */
let upright = false;
const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** the other classes' heroes standing on the plinths in the village's hall (`standHeroes`), each on his class's,
 *  and the meshes of each that cast a shadow until he stood there (under its roof he casts none: the sun's shadow map
 *  drew his every part for nothing) */
let standing: Player[] = [];
const castersOf = new Map<Player, THREE.Object3D[]>();

/** `p`'s shadows off while he stands in the village's hall, or back as they were. */
function castShadows(p: Player, on: boolean): void {
  if (on) {
    for (const o of castersOf.get(p) ?? []) o.castShadow = true;
    castersOf.delete(p);
    return;
  }
  const casters: THREE.Object3D[] = [];
  p.obj.traverse((o) => { if (o.castShadow) { casters.push(o); o.castShadow = false; } });
  castersOf.set(p, casters);
}

/** Those standing in the village's hall taken down, their shadows back. */
function standDown(): void {
  for (const p of standing) {
    G.scene.remove(p.obj);
    castShadows(p, true);
  }
  standing = [];
  waited.clear();
}

export const hallOpen = (): boolean => heroes.length > 0;
export const hallHeroes = (): readonly HallHero[] => heroes;
export const hallFocus = (): number => focus;

/** Where hero `i` of the row stands: on his plinth. */
const spot = (i: number): THREE.Vector3 => {
  const at = hallSpot(i);
  return at.setY(groundHeight(at.x, at.z));
};

/**
 * The hall built, the hero of class `focusId` in focus: the lobby's dummies and skill visuals cleared, its hero and
 * a co-op room's partners hidden. Each hero wears his profile in the save slot in play (the local hero's own, a class never played there its
 * starter gear, kept for it if it's chosen). The camera is there at once (it flew in from the lobby's view: from play,
 * "remove the effect when entering hero hall, just show heroes immediately").
 */
export function openHall(focusId: string): void {
  atRest = new WeakSet();
  if (hallOpen()) return;
  // (those standing in the village's hall go to the room's plinths with the rest)
  standDown();
  clearEnemies(); clearProjectiles(); clearEffects(); particles.clear();
  G.player.idle = true;
  G.player.show(false);
  hidePartners();
  G.arena.showHall(true);
  heroes = CLASS_IDS.map((id, i) => {
    const profile = profileOf(id);
    const player = heroIn(id, profile);
    // (at rest since he last showed off, 11 poses saved: each opening took 70 ms of them, the first 50 more)
    if (stillSince.has(player)) movedAtRest(player, spot(i), ROW.facing);
    else {
      standAtRest(player, spot(i), ROW.facing);
      stillSince.add(player);
    }
    // (a cold hero hidden from the start, as `updateHall` keeps him: added shown, a first visit's hall drew the other
    // heroes in the frame after the loading screen's last step, compiling their programs there, a task of 2.7 s)
    player.obj.visible = heroShare(player.cls.model) >= 1;
    return { id, profile, player, due: Infinity, shown: -Infinity, facing: ROW.facing, spin: 0, cast: null };
  });
  opened = G.time;
  lights = [flash({ ...KEY, life: 1, hold: Infinity }), flash({ ...RIM, life: 1, hold: Infinity })];
  focusHall(Math.max(0, CLASS_IDS.indexOf(focusId)), true);
}

/** The other classes' heroes standing on the plinths in the village's hall, each on his class's (the lobby's own
 *  class's empty: he's walking it), idle and glancing round, while `on` (the hero near it, their programs warm); taken
 *  out of the scene otherwise. They're built behind the lobby (`queueHallBehind`, game/behind.ts); one not built yet is finished here, one a
 *  frame at most (a hero built whole is 100 to 250 ms). */
export function standHeroes(on: boolean, dt: number): void {
  if (hallOpen()) return;
  const want = on ? CLASS_IDS.filter((id) => id !== G.profile.classId) : [];
  // (those built so far kept while they're the ones wanted: the row is built a hero a frame)
  if (standing.length > want.length || standing.some((p, i) => p.cls.id !== want[i])) {
    standDown();
  }
  if (standing.length < want.length) {
    const id = want[standing.length], i = CLASS_IDS.indexOf(id);
    const player = heroIn(id, profileOf(id));
    const at = new THREE.Vector3(TERRACE.x + HALL.plinths[i], 0, HALL.plinthZ);
    at.y = groundHeight(at.x, at.z);
    // (facing the door, a little in toward the room's middle; at rest already unless the hall's screen has had him: the 11
    // poses, every time the doorway came on screen, took 47 ms of a frame as the view first turned to it)
    const facing = -HALL.plinths[i] * 0.06;
    if (atRest.has(player)) place(player, at, facing);
    else restOn(player, at, facing);
    castShadows(player, false);
    standing.push(player);
  }
  // (posed in turn, one a frame, each with the time since his last pose: posed every frame, the two heroes on the
  // dais took 3 to 6 ms of each frame's update in the hall, which dropped to 62 to 80 frames a second, from play "still
  // FPS drop when entering the hall"; at 144 a second each is still posed 72 times a second, and an idle stance hides it)
  for (const p of standing) waited.set(p, (waited.get(p) ?? 0) + dt);
  if (standing.length) {
    const p = standing[poseTurn++ % standing.length];
    p.glances = true;
    p.update(waited.get(p) ?? dt);
    waited.set(p, 0);
  }
  for (const p of standing) haloRound(p, dt);
}

/** the time each standing hero has waited since he was last posed, and whose turn it is (`standHeroes`) */
const waited = new Map<Player, number>();
let poseTurn = 0;

/** The heroes standing on the village's hall's dais. */
export const heroesStanding = (): readonly Player[] => standing;

/** The class of the hero standing nearest (x, z) in the village's hall, or null. */
export function standingNear(x: number, z: number): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const p of standing) {
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < bestD) { best = p.cls.id; bestD = d; }
  }
  return best;
}

/** The profile class `id`'s hero wears in the hall: the lobby's own, else his in the save slot in play; one never
 *  played there is his starter gear, rolled afresh at every load, so the one the hall last showed is kept (and played
 *  if he's chosen), or the one he's being built in behind the lobby: rolled at each opening, he was built again every
 *  time and wore other gear, and rolled while his build was queued, he was built twice (`lab village --only
 *  hallBuiltBehind`: 6 heroes built, not 5). */
function profileOf(id: string): Profile {
  if (id === G.profile.classId) return G.profile;
  const unplayed = (profile: Profile): boolean => !profile.saved && !peekProfile(id, saveSlot());
  const hero = kept.get(id);
  if (hero && hero.slot === saveSlot() && unplayed(hero.profile)) return hero.profile;
  const pending = building.get(id);
  if (pending && unplayed(pending)) return pending;
  return loadProfile(id);
}

/** what a hero kept for the hall is built for: the gear he wears and the detail he's built at */
const gearOf = (profile: Profile): string => `${heroDetail()} ${JSON.stringify(profile.equipped)}`;

/**
 * Each class's hero the hall would show built ahead of its opening, out of the scene, a hero after each `step`, where
 * none is kept in the gear he'd wear: built in the opening's task, the three held its first frame 290 to 400 ms on
 * the owner's PC (trace FD2V-NB48). Called under the heroes' loading bar (game/warmup.ts), so the opening finds them
 * kept; a hall already open (a first visit's) builds its own.
 */
export async function buildHallAhead(step: () => Promise<void>): Promise<void> {
  // Also called by shader warm-up, outside prepareHeroSelection: don't let the frame queue duplicate jobs
  // while a sliced build has temporarily taken its job out of the background queue.
  warmingRuns(true);
  try {
    await preloadHeads(heroDetail());
    for (const id of CLASS_IDS) {
      if (hallOpen()) return;
      const profile = profileOf(id);
      if (kept.get(id)?.gear === gearOf(profile)) continue;
      await step();
      if (hallOpen()) return;
      await finishInSlices(`hall ${id}`, step);
      if (kept.get(id)?.gear !== gearOf(profile)) {
        const old = kept.get(id);
        if (old) { halos.delete(old.player); old.player.dispose(); }
        keepHero(id, profile, await builtInSlices(Player.inSteps(id, profile.equipped, false), step));
      }
      G.scene.remove(kept.get(id)!.player.obj);
    }
  } finally { warmingRuns(false); }
}

/** Prepare the current detail before an opening; Auto stays put while the sliced builds run. */
export async function prepareHeroSelection(step: () => Promise<void>): Promise<void> {
  warmingRuns(true);
  try {
    await buildHallAhead(step);
    for (const id of CLASS_IDS) await prepareSpareHero(id, step);
  } finally { warmingRuns(false); }
}

/** A first visit's hall has no lobby frames to build its playable copy; readiness must include that copy. */
export async function prepareSpareHero(id: string, step: () => Promise<void>): Promise<void> {
  if (id === G.profile.classId) return;
  warmingRuns(true);
  try {
    await preloadHeads(heroDetail());
    // Finish a partial spare at its original detail, then replace it in slices if the preset changed.
    await finishInSlices(`spare ${id}`, step);
    const spare = spares.get(id);
    const profile = profileOf(id), gear = gearOf(profile);
    if (spare?.gear === gear) return;
    spare?.player.dispose();
    spares.delete(id);
    const player = await builtInSlices(Player.inSteps(id, profile.equipped), step);
    player.stowed();
    spares.set(id, { player, gear });
  } finally { warmingRuns(false); }
}

/**
 * Each class's hero the hall would show, and a spare of each other class as the lobby's hero (`takeSpareHero`), queued
 * to be built behind the lobby a piece a frame (game/behind.ts) where none is kept or queued: built under the heroes'
 * loading bar, a hero a frame, each held it 100 to 170 ms, and a hero chosen was built in the click. Each class's
 * two in one profile: a class never played rolls its starter gear afresh at each `profileOf`, and a spare in other
 * gear would be built again as he's chosen.
 */
export function queueHallBehind(): void {
  for (const id of CLASS_IDS) {
    if (kept.has(id) || queued(`hall ${id}`)) continue;
    const profile = profileOf(id);
    const gear = gearOf(profile);
    building.set(id, profile);
    buildLater(`hall ${id}`, hallHeroSteps(id, profile), (player) => {
      building.delete(id);
      if (kept.has(id)) {
        player.dispose();
        return;
      }
      keepHero(id, profile, player).gear = gear;
      G.scene.remove(player.obj);
    });
  }
  for (const id of CLASS_IDS) {
    if (id === G.profile.classId || spares.has(id) || queued(`spare ${id}`)) continue;
    // (the profile his class's hall hero is being built in, or was: `profileOf`)
    const profile = profileOf(id);
    const gear = gearOf(profile);
    buildLater(`spare ${id}`, Player.inSteps(id, profile.equipped), (player) => {
      player.stowed();
      spares.set(id, { player, gear });
    });
  }
}

/** Class `id`'s hall hero built a piece at a time, then stood at rest on his plinth in the village's hall a pose a
 *  piece (`restingSteps`), out of the scene: stood there as the doorway first came on screen, his 11 poses took 47 ms
 *  of that frame, and all in his build's last piece 40 to 60 ms (`lab behind`). */
function* hallHeroSteps(id: string, profile: Profile): Generator<void, Player, undefined> {
  const player = yield* Player.inSteps(id, profile.equipped, false);
  G.scene.remove(player.obj);
  // (with no village there are no plinths to stand at rest on: he's posed as the hall's room opens)
  if (!VILLAGE) return player;
  yield;
  const i = CLASS_IDS.indexOf(id);
  const at = new THREE.Vector3(TERRACE.x + HALL.plinths[i], 0, HALL.plinthZ);
  at.y = groundHeight(at.x, at.z);
  yield* restingSteps(player, at, -HALL.plinths[i] * 0.06);
  return player;
}

/** the profile each class's hall hero building behind the lobby is built in, for his spare */
const building = new Map<string, Profile>();

/** A hero of each other class as the lobby's own would be, built behind the lobby and kept out of the scene, for
 *  the first time he's chosen (`takeSpareHero`): built in the click, he held it 100 to 170 ms. */
const spares = new Map<string, { player: Player; gear: string }>();

/** Class `id`'s spare in the scene if he's built in `profile`'s gear at this detail (dropped if not), else null. */
export function takeSpareHero(id: string, profile: Profile): Player | null {
  finishNow(`spare ${id}`);
  const spare = spares.get(id);
  if (!spare) return null;
  spares.delete(id);
  if (spare.gear !== gearOf(profile)) {
    spare.player.dispose();
    return null;
  }
  spare.player.unstowed(profile.equipped);
  return spare.player;
}

/** Every spare let go, as if none had been built (`lab behind --canary`). */
export function dropSpareHeroes(): void {
  for (const spare of spares.values()) spare.player.dispose();
  spares.clear();
}

/** Every hero the hall keeps and every spare let go, as if none had been built: they're queued again (`lab behind`). */
export function dropHeroesBuilt(): void {
  standDown();
  for (const hero of kept.values()) {
    halos.delete(hero.player);
    hero.player.dispose();
  }
  kept.clear();
  dropSpareHeroes();
}

/** `player` kept as class `id`'s hall hero, in `profile`'s gear. */
function keepHero(id: string, profile: Profile, player: Player): NonNullable<ReturnType<typeof kept.get>> {
  const hero = { player, gear: gearOf(profile), profile, slot: saveSlot(), level: qualityLevel() };
  player.quiet = true;
  glowingHead(player);
  kept.set(id, hero);
  return hero;
}

/** Class `id`'s hero in the gear `profile` wears, in the scene: the one kept from the hall's last opening if he wore
 *  the same at the same detail (a save slot switched, gear changed or the quality's detail since builds him again),
 *  his shadows as the quality has them now. */
function heroIn(id: string, profile: Profile): Player {
  // (one building behind the lobby finished now: he's wanted)
  finishNow(`hall ${id}`);
  const gear = gearOf(profile);
  let hero = kept.get(id);
  if (hero?.gear !== gear) {
    if (hero) halos.delete(hero.player);
    hero?.player.dispose();
    hero = keepHero(id, profile, new Player(id, profile.equipped, false));
  } else {
    G.scene.add(hero.player.obj);
    // (a walk of every mesh: 7 ms of the opening's frame, needed only where the quality changed meanwhile)
    if (hero.level !== qualityLevel()) applyShadowDetail(hero.player.obj);
    Object.assign(hero, { profile, slot: saveSlot(), level: qualityLevel() });
  }
  return hero.player;
}

/** A hall hero's glowing weapon head kept under the bloom and given a halo of its own (`HEAD`, `HALO`): its colour,
 *  glow, roughness and coat, uniforms all (no program changes), on the hall's own copy, which never fights. */
function glowingHead(player: Player): void {
  const done = new Set<THREE.Material>();
  player.model.tip?.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m?.emissive || m.emissiveIntensity <= 0 || m.emissive.getHex() === 0 || done.has(m)) return;
    done.add(m);
    // (a glow alone, black but for its own light, as the crystal's rings: the key light finds nothing on it, and it's
    // dimmed, its even pink a flat ring over the gem)
    if (m.color.getHex() === 0) {
      m.emissive.multiplyScalar(HEAD.rings);
      return;
    }
    halos.set(player, { gem: o, colour: m.emissive.clone() });
    m.color.multiplyScalar(HEAD.lit);
    m.emissive.multiplyScalar(HEAD.glow);
    m.roughness = Math.max(m.roughness, HEAD.rough);
    const coated = m as THREE.MeshPhysicalMaterial;
    if (!coated.isMeshPhysicalMaterial) return;
    // (its coat thinned and roughened, never to none: a coat of none is another program)
    if (coated.clearcoat > 0) coated.clearcoat = Math.min(coated.clearcoat, HEAD.coat);
    coated.clearcoatRoughness = Math.max(coated.clearcoatRoughness, HEAD.rough);
    coated.specularIntensity = Math.min(coated.specularIntensity, HEAD.specular);
  });
}

/** The hall taken down, the lobby's hero shown again; its heroes kept out of the scene for its next opening, the camera
 *  back at once (from play, "no need to zoom to new character after choosing"). */
export function closeHall(): void {
  if (!hallOpen()) return;
  // (a showcase under way let go: a channel left open, Void Lance's hum played on in the lobby)
  for (const h of heroes) endShowcase(h);
  for (const h of heroes) G.scene.remove(h.player.obj);
  heroes = [];
  dragged = null;
  for (const l of lights) release(l);
  lights = [];
  clearProjectiles(); clearEffects(); particles.clear();
  G.arena.showHall(false);
  // (on the floor he stood on at once: hidden, his height followed the room's floor, and from the terrace he rose 1.6 m
  // out of the ground back to it, from play "when hero is not picked/cancelled, he rises from ground")
  for (const p of G.players) p.place(p.pos, p.facing);
  G.player.show(true);
  for (const p of G.players) if (!p.local) p.show(!p.away && p.out !== 'banked');
  G.player.idle = false;
  stageCamera(null, true);
}

/** Hero `i` in focus, the one left standing at rest: the camera comes to him (`cut`: at once; a drag let go glides onto
 *  him), and soon after he shows off his skill. */
export function focusHall(i: number, cut = false): void {
  const n = heroes.length;
  const left = heroes[focus];
  focus = ((i % n) + n) % n;
  if (left && left !== heroes[focus] && (left.cast || Math.abs(left.spin) > TURNING)) {
    if (left.cast?.endAt !== undefined) left.player.replay({ t: 'che' });
    left.cast = null;
    left.facing = ROW.facing;
    left.spin = 0;
    standAtRest(left.player, spot(heroes.indexOf(left)), ROW.facing);
    stillSince.add(left.player);
  }
  for (const [j, h] of heroes.entries()) h.due = j === focus && G.time - h.shown > SHOWCASE.again ? G.time + SHOWCASE.after : Infinity;
  stageCamera(shotAlong(focus, G.time), cut || reduced());
}

/** The shot the camera comes to rest on, on the hero in focus (its drift at its middle). */
export const hallShot = (): Shot => shotAlong(focus, opened);

/** The camera's place along the row: where a drag holds it, or on the hero in focus. */
export const hallAlong = (): number => dragged ?? focus;

/** The scene dragged: the camera held `along` the row (heroes from the first, a little past either end). */
export function dragHall(along: number): void {
  dragged = Math.max(-DRAG.over, Math.min(heroes.length - 1 + DRAG.over, along));
}

/** The drag let go `along` the row: the hero nearest in focus (returned). */
export function dropHall(along: number): number {
  dragged = null;
  const i = nearest(along);
  focusHall(i);
  return i;
}

/** The hero nearest `along` the row. */
const nearest = (along: number): number => Math.max(0, Math.min(heroes.length - 1, Math.round(along)));

/** The shot `along` the row at game time `t` (heroes from the first: on a hero, in front of him, drifting slowly
 *  round him; between two, between them), at the height of the plinth nearest (`glide`: how fast the camera follows
 *  it, `stageCamera`). */
function shotAlong(along: number, t: number, glide?: number): Shot {
  const at = hallSpot(along).setY(spot(nearest(along)).y);
  const yaw = reduced() ? 0 : Math.sin(((t - opened) / SHOT.driftS) * Math.PI * 2) * SHOT.drift;
  const back = SHOT.back * further;
  const lift = upright ? SHOT.upright : 0;
  const pos = new THREE.Vector3(at.x + Math.sin(yaw) * back, at.y + SHOT.high + lift, at.z + Math.cos(yaw) * back);
  const aim = (upright ? SHOT.middle : SHOT.at) + lift;
  return { pos, look: new THREE.Vector3(at.x, at.y + aim, at.z), fov: SHOT.fov, glide };
}

/** The camera `k` times as far back as the shot's own (1 or more): an upright screen leaves the hero a share of its
 *  height above the panel, and he's framed for all of it at 1 (ui/heroSelect.ts `layOut`); `up`: an upright
 *  screen's shot. */
export function frameHall(k: number, up = false): void {
  further = k;
  upright = up;
}

/** Stand a remote copy at `at`, facing `facing`: its reports, as its game would send them. */
function place(p: Player, at: THREE.Vector3, facing: number): void {
  Object.assign(p.remote, { x: at.x, z: at.z, vx: 0, vz: 0, f: facing, ax: at.x + Math.sin(facing) * 4, az: at.z + Math.cos(facing) * 4 });
  p.place(at, facing);
}

/** how long a hero is posed in one go as he's stood at rest (s): past what's left of any action's easing out; then the
 *  poses given his feet to step into his stance, and each one's time (s) */
const REST_POSE = 1;
const REST_STEPS = 10;
const REST_STEP = 0.1;

/** Hero `p` standing at `at` at once, whatever he was last doing. His last action eases out of his pose over a moment,
 *  and his feet, planted where that pose had them, stepped back under him as it went, on one bent knee (from play, "the
 *  previous hero starts irish dancing"), and a foot stepped into his stance after: both are run through before he shows. */
function standAtRest(p: Player, at: THREE.Vector3, facing: number): void {
  p.spawn.copy(at);
  p.reset();
  p.shine = SHINE;
  place(p, at, facing);
  p.update(REST_POSE);
  place(p, at, facing);
  for (let step = 0; step < REST_STEPS; step++) p.update(REST_STEP);
}

/** the heroes stood at rest since the hall's screen last had them, and those who haven't shown off since they were (who
 *  need no more of it for its row: the dais needs it again, or the warrior stepped 11 cm as he came to stand there) */
let atRest = new WeakSet<Player>();
const stillSince = new WeakSet<Player>();

/** `standAtRest`, and kept so. */
function restOn(p: Player, at: THREE.Vector3, facing: number): void {
  standAtRest(p, at, facing);
  atRest.add(p);
  stillSince.add(p);
}

/** `restOn` a pose a piece (models/steps.ts), the same poses in the same order: each is 3 to 5 ms. */
function* restingSteps(p: Player, at: THREE.Vector3, facing: number): Generator<void, void, undefined> {
  p.spawn.copy(at);
  p.reset();
  p.shine = SHINE;
  place(p, at, facing);
  p.update(REST_POSE);
  place(p, at, facing);
  for (let step = 0; step < REST_STEPS; step++) {
    yield;
    p.update(REST_STEP);
  }
  atRest.add(p);
  stillSince.add(p);
}

/** Hero `p`, at rest, stood at `at`: his feet brought with him, or they stepped there from where they stood. */
function movedAtRest(p: Player, at: THREE.Vector3, facing: number): void {
  place(p, at, facing);
  p.update(REST_POSE);
  place(p, at, facing);
}

/** The hall's frame: each hero stepped, the one in focus showing off when due, the lights on him, the camera's
 *  drift. */
export function updateHall(dt: number): void {
  if (!hallOpen()) return;
  hidePartners();
  const t = G.time;
  for (const h of heroes) {
    // (a hero not yet warm left out of the frame, his plinth empty, and his showcase held till he is: drawn, his programs
    // would be made in the frame; his tab's bar says how far along he is, ui/heroSelect.ts)
    const ready = heroShare(h.player.cls.model) >= 1;
    h.player.obj.visible = ready;
    if (!ready) h.due = Math.max(h.due, t + SHOWCASE.after);
    if (t >= h.due) showOff(h, t);
    stepCast(h, t);
    // (his showcase first: no glance round while it's due or under way)
    h.player.glances = h.due === Infinity && !h.cast;
    const r = h.player.remote;
    turnTo(h, dt);
    r.ax = r.x + Math.sin(r.f) * 4; r.az = r.z + Math.cos(r.f) * 4;
    h.player.update(dt);
    if (ready) haloRound(h.player, dt);
  }
  const at = spot(nearest(hallAlong()));
  const [key, rim] = lights;
  key.light.position.set(at.x + KEY.side, at.y + KEY.up, at.z + KEY.ahead);
  rim.light.position.set(at.x + RIM.side, at.y + RIM.up, at.z - RIM.behind);
  stageCamera(dragged === null ? shotAlong(focus, t) : shotAlong(dragged, t, DRAG.glide));
}

const _gemAt = new THREE.Vector3();
const _black = new THREE.Color(0, 0, 0);
/** How strong the halo breathes now (`HALO`), none with reduced motion. */
const breathing = (): number => (reduced() ? 1 : 1 + HALO.breath * Math.sin(G.time * HALO.rate * TAU));
/** The halo round `p`'s glowing weapon head and the light at its heart, this frame of `dt` s (`HALO`, `CORE`). */
function haloRound(p: Player, dt: number): void {
  const halo = halos.get(p);
  if (!halo || dt <= 0) return;
  halo.gem.getWorldPosition(_gemAt);
  const share = breathing() * dt * 30;
  glowAt(_gemAt, HALO.size, halo.colour.clone().multiplyScalar(HALO.strength * share));
  _gemAt.add(_toCamera.subVectors(G.camera.position, _gemAt).setLength(CORE.toward));
  glowAt(_gemAt, CORE.size, halo.colour.clone().lerp(_white, CORE.white).multiplyScalar(CORE.strength * share));
}

const _toCamera = new THREE.Vector3();
const _white = new THREE.Color(1, 1, 1);
/** A halo's glow particle at `at`, `size` m across, of `color` fading to none over `HALO.life`. */
function glowAt(at: THREE.Vector3, size: number, color: THREE.Color): void {
  particles.glow.spawn({ x: at.x, y: at.y, z: at.z, life: HALO.life, size, sizeEnd: size, color, colorEnd: _black });
}

/** Hero `h` turned towards the way he faces, by a critically damped spring (`TURN`). */
function turnTo(h: HallHero, dt: number): void {
  const r = h.player.remote;
  const off = ((h.facing - r.f + Math.PI) % TAU + TAU) % TAU - Math.PI;
  h.spin += (TURN * TURN * off - 2 * TURN * h.spin) * dt;
  r.f += h.spin * dt;
}

/** Hero `h` begins his showcase: the cast reported as his game would report it (a drawn shot drawn to full). */
function showOff(h: HallHero, t: number): void {
  stillSince.delete(h.player);
  h.due = Infinity;
  h.shown = t;
  const { skill, at, hold = 0 } = CLASSES[h.id].hall.showcase;
  const known = h.player.known.get(skill);
  if (!known) return;
  const def = known.def, from = spot(heroes.indexOf(h));
  const f = ROW.facing, right = f - Math.PI / 2;
  const target = new THREE.Vector3(from.x + Math.sin(f) * at[0] + Math.sin(right) * at[1], 0, from.z + Math.cos(f) * at[0] + Math.cos(right) * at[1]);
  h.facing = Math.atan2(target.x - from.x, target.z - from.z);
  // (a channel opened as his game reports it, aimed the way he turns: his copy's aim follows his facing)
  if (def.channel) {
    h.player.replay({ t: 'chs', s: skill, k: def.key });
    h.cast = { target, fireAt: 0, doneAt: t + hold + 0.9, drawn: false, endAt: t + hold };
    return;
  }
  const drawn = def.draw !== undefined;
  // (a bow's arrows taken from the quiver first, as the hero's own cast reports it: without, he drew an empty string)
  const nockT = h.player.nockTime(known), n = nockT ? { n: nockT } : {};
  const dur = drawn ? def.draw! : nockT + def.castTime;
  const fireIn = nockT + (drawn ? def.draw! : def.castTime * (def.fireAt ?? 0.55));
  const aim = { x: target.x, z: target.z, ...n };
  h.player.replay(drawn ? { t: 'cast', s: skill, dur, h: 1, ...aim } : { t: 'cast', s: skill, dur, ...aim });
  h.cast = { target, fireAt: t + fireIn, doneAt: t + Math.max(dur, fireIn) + 0.9, drawn };
}

/** Hero `h`'s showcase given up where it is: his channel let go, and he faces the camera again. */
function endShowcase(h: HallHero): void {
  if (h.cast?.endAt !== undefined) h.player.replay({ t: 'che' });
  h.cast = null;
  h.facing = ROW.facing;
}

/** A showcase under way: fired when due, the hero turned back to the camera once it's done. */
function stepCast(h: HallHero, t: number): void {
  const c = h.cast;
  if (!c) return;
  if (t >= c.fireAt && c.fireAt > 0) {
    const p = h.player;
    const skill = CLASSES[h.id].hall.showcase.skill;
    p.replay({ t: 'fire', s: skill, x: c.target.x, z: c.target.z, px: p.pos.x, pz: p.pos.z, f: h.facing, ...(c.drawn ? { k: 1 } : {}) });
    c.fireAt = 0;
  }
  if (c.endAt !== undefined && t >= c.endAt) {
    h.player.replay({ t: 'che' });
    c.endAt = undefined;
  }
  if (t >= c.doneAt) {
    h.cast = null;
    h.facing = ROW.facing;
  }
}
