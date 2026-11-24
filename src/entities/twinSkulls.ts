// The Ossuary Twins' belt skulls (entities/twins.ts; their numbers `TWINS.belt`, `bomb`, `poison` in data/foes/twins.ts;
// from Kenneth: "have them throw a poisonous skull from a chain that they have (rope), dangling from the side. Both have
// this", "smaller skulls, just hung by rope near their waists", "they cant launch them often, there is a cooldown").
//
// - **The belt**: each twin carries `belt.skulls` on a rope at its waist for the whole fight, none coming back; its
//   model shows what's left (`userData.belt`, laid each frame from the frame hook). At half the one left standing takes
//   its fallen brother's, and throws both kinds (`inherit`).
// - **A throw**, as a body throws: a hand unhooks a skull from the rope, draws it back and throws it (the `bomb` or
//   `poison` action, its hit the release), the belt's own skull (models/beltSkull.ts) tumbling on a ballistic arc to
//   where the hero stood, a soft glow on the floor where it lands from the moment it leaves the hand (the Brute's chunk
//   flies so: entities/throws.ts), and lying there tilted on the floor for as long as what it does lasts, on every
//   game at the same spot. No glow has a rim drawn round it (from Kenneth: "no hard edges on rings please"). One out a twin at a
//   time (`Belt.out`), no sooner than `belt.every` after the last, and never landing with another of the pair's warned
//   hits (`claimBeat`).
// - **Slab's bomb**: it lands and lies rocking and glowing hotter for `bomb.fuse` s, a pooled light over it and a
//   glow drawing in on it, then bursts in a soft swell and a few large shards, the skull gone with it: a hero
//   within its radius hurt and stunned `bomb.stun` s (`Player.stun`: the stars over his head on every game), never
//   again within `bomb.rest` s of a stun's end; a raised shield turned to the blast takes the hurt as any hit
//   (`Player.takeDamage`) and the stun with it. The bomb's beat is claimed over the stun, so no other warned hit of the
//   pair lands on him till he can move, and their chain and poison pass a hero the bomb holds (`heldByBomb`). A dash
//   over it (`Player.airborne`) passes.
// - **Reliquary's poison**: a cloud of sickly green where it lands for `poison.life` s, its reach an even glow fading
//   at its edge and denser near the skull, gas let out of the skull's eyes and jaw, the skull sinking at its end;
//   hurting a hero inside it a little every `poison.every` s: a tick to walk out of, not a burst.
// Played through enemyAI's `fx` (`beltSkull`), so every co-op game flies the same skull and keeps the same belt counts,
// each judging its own hero alone.
import * as THREE from 'three';
import { G } from '../state';
import { TWINS } from '../data/foes/twins';
import { hurtPlayer } from '../combat/damage';
import { addEffect, groundFlash } from '../fx/effects';
import { burst, col, debris, particles, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { additive } from '../core/materials';
import { addShake } from '../core/renderer';
import { twinSounds } from '../core/sounds/twins';
import { groundHeight } from '../world/ground';
import { claimBeat, partnerOf, telegraphShare, telegraphTime, telegraphed } from './bossKit';
import { fx } from './enemyAI';
import { BELT_K, beltSkullMesh, SKULL_LIGHT, skullRest, type SkullKind } from './models/beltSkull';
import type { Enemy } from './enemy';
import type { Player } from './player';

/** the two kinds of belt skull: Slab's bomb and Reliquary's poison, by the number the `beltSkull` fx sends */
export const SKULL_KINDS: readonly SkullKind[] = ['bomb', 'poison'];
export { SKULL_LIGHT, type SkullKind };
/** the skull's fall (m/s²), as the Brute's chunk's: heavier than the world's, so its arc reads as a throw */
const FALL = 22;
/** the cloud's smoke, darker than its light */
const POISON_SMOKE = 0x3f6a1c;

/** What a twin has left on its belt of each kind, and until when its last thrown is still out (game time). */
export interface Belt { bomb: number; poison: number; out: number }

const slabOf = (e: Enemy): boolean => e.type === 'twinslab';
/** each twin's own kind: Slab's bombs, Reliquary's poison */
export const ownKind = (e: Enemy): SkullKind => (slabOf(e) ? 'bomb' : 'poison');

/** `e`'s belt, made full of its own kind the first time it's asked for (on every game alike). */
export function beltOf(e: Enemy): Belt {
  const b = e.brain;
  if (b.beltMade === undefined) {
    b.beltMade = 1;
    b.bomb = ownKind(e) === 'bomb' ? TWINS.belt.skulls : 0;
    b.poison = ownKind(e) === 'poison' ? TWINS.belt.skulls : 0;
    b.beltOut = 0;
  }
  return { bomb: b.bomb, poison: b.poison, out: b.beltOut };
}

/** A belt skull thrown, kept for the lab (`lab twins`) until the next ones push it out. */
export interface SkullThrown {
  kind: SkullKind;
  by: number;
  /** game time it left the hand, how long it flies (s), where from and where it was aimed */
  at: number;
  flight: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** its glow on the floor where it lands (placed there), and the skull itself: in flight, then lying where it landed
   *  (`userData.lying`) until its effect is done */
  ring: THREE.Object3D;
  skull: THREE.Object3D;
  /** where and when it came down; the bomb's blast; the cloud's end */
  landed?: { x: number; z: number; t: number };
  blast?: { t: number };
  gone?: number;
  /** each hurt it dealt this game's hero: when, how much, where he stood, and (a blast) whether it stunned him or a
   *  raised shield took it */
  struck: { t: number; taken: number; from?: { x: number; z: number }; stunned?: boolean; shielded?: boolean }[];
}
/** the latest belt skulls thrown, the newest last */
export const SKULLS_THROWN: SkullThrown[] = [];
const keep = (s: SkullThrown): SkullThrown => {
  SKULLS_THROWN.push(s);
  if (SKULLS_THROWN.length > 16) SKULLS_THROWN.shift();
  return s;
};

/** How long a skull thrown `d` m flies (s). */
export const skullFlight = (d: number): number => TWINS.belt.flight[0] + TWINS.belt.flight[1] * d;

/** The kind `e` would throw now: the one it has most of, its own on a tie; null with an empty belt. */
function kindToThrow(e: Enemy): SkullKind | null {
  const belt = beltOf(e), own = ownKind(e), other: SkullKind = own === 'bomb' ? 'poison' : 'bomb';
  if (!belt[own] && !belt[other]) return null;
  return belt[other] > belt[own] ? other : own;
}

/**
 * Where the fight is simulated: a belt skull thrown at `e`'s target if its belt has one, its last is no longer out, its
 * time has come round, the hero is within reach, and its landing (the bomb's: its blast) has its turn in the fight.
 * Returns whether it began one.
 */
export function beltThrow(e: Enemy, dist: number): boolean {
  const kind = kindToThrow(e), b = e.brain;
  b.beltT ??= G.time + TWINS.belt.first;
  if (!kind || G.time < b.beltT || G.time < beltOf(e).out) return false;
  if (dist < TWINS.belt.reach[0] || dist > TWINS.belt.reach[1]) return false;
  const release = telegraphTime(e, kind) * telegraphShare(e, kind)!;
  const lands = release + skullFlight(dist) + (kind === 'bomb' ? TWINS.bomb.fuse : 0);
  // (a bomb's blast claims the fight's beat through the stun it gives: no other warned hit lands on a held hero)
  if (!claimBeat(lands, TWINS.beat, kind === 'bomb' ? TWINS.bomb.stun : 0)) return false;
  b.beltT = G.time + TWINS.belt.every;
  e.cd = e.def.cooldown;
  telegraphed(e, kind, () => {
    const p = e.target;
    if (!p) return;
    const from = handOf(e);
    const d = Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
    // (a bomb hits harder from the slammer, the poison from the caster: each the other's when he's alone)
    const damage = e.damage * (kind === 'bomb' ? TWINS.bomb.hurt * (slabOf(e) ? 1 : 1.3) : TWINS.poison.hurt * (slabOf(e) ? 0.7 : 1));
    fx('beltSkull', e.id, SKULL_KINDS.indexOf(kind), from.x, from.y, from.z, p.pos.x, p.pos.z, skullFlight(d), damage);
  });
  return true;
}

const _hand = new THREE.Vector3();
/** Where `e` lets go of a belt skull: its throwing hand as posed, or by its side where the hand can't be read (a NaN
 *  there would fly a skull from nowhere, and draw black boxes through the bloom). */
function handOf(e: Enemy): THREE.Vector3 {
  const hand = e.model.root.userData.throwHand as THREE.Object3D | undefined;
  if (hand) {
    hand.getWorldPosition(_hand);
    if (Number.isFinite(_hand.x) && Number.isFinite(_hand.y) && Number.isFinite(_hand.z)) return _hand;
    if (import.meta.env.DEV) console.error(`twinSkulls: ${e.type}'s throwing hand isn't finite: ${badJoint(hand)}`);
  }
  return _hand.set(e.pos.x, e.height * 0.5, e.pos.z);
}

/** The first of `o` and its parents whose own place, turn or size isn't finite, said (a dev build's report). */
function badJoint(o: THREE.Object3D): string {
  for (let at: THREE.Object3D | null = o; at; at = at.parent) {
    const own = [...at.position.toArray(), ...at.quaternion.toArray(), ...at.scale.toArray()];
    if (own.some((x) => !Number.isFinite(x))) return `${at.name || at.type} ${own.map((x) => x.toFixed(2)).join(',')}`;
  }
  return 'every joint finite';
}

const foeOf = (id: number): Enemy | null => G.enemies.find((x) => x.id === id) ?? null;
/** this game's hero, if he can be hit on the ground */
const grounded = (): Player | null => (G.player.active && !G.player.airborne ? G.player : null);

/**
 * A belt skull of kind SKULL_KINDS[`kind`] thrown by twin `id` from (ox, oy, oz) to land at (tx, tz) in `flight` s
 * (`beltSkull` fx), on every game: one off its belt, a soft glow on the floor where it lands, the skull itself on its
 * arc, and lying where it landed for as long as what it does there lasts.
 */
export function skullThrown(id: number, kind: number, ox: number, oy: number, oz: number, tx: number, tz: number,
  flight: number, damage: number): void {
  const what = SKULL_KINDS[kind], foe = foeOf(id);
  if (foe) {
    beltOf(foe);
    foe.brain[what] = Math.max(0, foe.brain[what] - 1);
    foe.brain.beltOut = G.time + flight + (what === 'bomb' ? TWINS.bomb.fuse : TWINS.poison.life);
  }
  const radius = what === 'bomb' ? TWINS.bomb.radius : TWINS.poison.radius;
  const mark = softDisc(what, { x: tx, z: tz }, radius, what === 'bomb' ? 'soft' : 'edge');
  const skull = beltSkullMesh(what);
  G.scene.add(skull);
  const thrown = keep({
    kind: what, by: id, at: G.time, flight, from: { x: ox, z: oz }, to: { x: tx, z: tz }, ring: mark.mesh, skull, struck: [],
  });
  flyArc(thrown, skull, mark, ox, oy, oz, flight, () => {
    thrown.landed = { x: tx, z: tz, t: G.time };
    layDown(skull, tx, tz);
    if (what === 'bomb') bombLies(thrown, foe, damage, mark);
    else poisonCloud(thrown, foe, damage, mark);
  });
  twinSounds.skullThrow();
}

// --- the soft glows on the floor --------------------------------------------------------------------------

/** the glows' pictures: one fading from its middle, one even to near its rim and gone at it (a reach to step out of
 *  with no line drawn round it: from Kenneth, "no hard edges on rings please") */
let softMap: THREE.Texture | null = null;
let edgeMap: THREE.Texture | null = null;
let plane: THREE.BufferGeometry | null = null;

/** A radial glow's picture: white at its middle, held to `even` of its radius, gone at its rim. */
function radialMap(even: number): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(even, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft glow on the floor: its mesh (a flat square of added light, `nearGlow` as every effect's, the ground flash's
 *  kind: no pipeline of its own), set by `glow(radius, strength)` each frame, and put away. */
interface SoftDisc { mesh: THREE.Mesh; glow(radius: number, strength: number): void; away(): void }

/** A soft glow of `what`'s colour at (x, z) on the floor, `radius` m, of the fading picture or the even one. */
function softDisc(what: SkullKind, at: { x: number; z: number }, radius: number, look: 'soft' | 'edge'): SoftDisc {
  softMap ??= radialMap(0.05);
  edgeMap ??= radialMap(0.72);
  plane ??= new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = additive(SKULL_LIGHT[what], 1.4, 0);
  mat.map = look === 'soft' ? softMap : edgeMap;
  const mesh = new THREE.Mesh(plane, mat);
  mesh.name = `belt skull's glow`;
  mesh.position.set(at.x, groundHeight(at.x, at.z) + 0.05, at.z);
  mesh.scale.setScalar(radius);
  G.scene.add(mesh);
  return {
    mesh,
    glow(r, strength) {
      mesh.scale.setScalar(Math.max(0.01, r));
      mat.opacity = Math.max(0, strength);
    },
    away() {
      G.scene.remove(mesh);
      mat.dispose();
    },
  };
}

// --- the skull's flight and where it lies -----------------------------------------------------------------

/** A number from 0 to 1 a place gives, the same on every game: how a skull lands turned. */
const placeHash = (x: number, z: number): number => {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

/** How high a skull lying on the floor at (x, z) has its middle (m). */
const lyingY = (x: number, z: number): number => groundHeight(x, z) + skullRest();

/** The skull laid where it landed: on the floor's height, turned and tipped as a thrown thing comes to rest. */
function layDown(skull: THREE.Object3D, x: number, z: number): void {
  const k = placeHash(x, z);
  skull.position.set(x, lyingY(x, z), z);
  skull.rotation.set(-0.25 + k * 0.3, k * Math.PI * 2, (k - 0.5) * 0.7);
  skull.userData.lying = true;
}

/** The skull on its ballistic arc to where it lands, tumbling as it flies, a faint trail of its colour, its glow on the
 *  floor there swelling in; `landed` called as it lands. */
function flyArc(thrown: SkullThrown, skull: THREE.Object3D, mark: SoftDisc, ox: number, oy: number, oz: number,
  flight: number, landed: () => void): void {
  const { x: tx, z: tz } = thrown.to;
  const ty = lyingY(tx, tz);
  const vx = (tx - ox) / flight, vz = (tz - oz) / flight, vy = (ty - oy + 0.5 * FALL * flight * flight) / flight;
  const light = SKULL_LIGHT[thrown.kind], tail = col(light, 1.2), end = col(0x200a04, 0.2);
  const radius = thrown.kind === 'bomb' ? TWINS.bomb.radius : TWINS.poison.radius;
  let t = 0;
  skull.position.set(ox, oy, oz);
  addEffect({
    update(dt) {
      t = Math.min(flight, t + dt);
      skull.position.set(ox + vx * t, oy + vy * t - 0.5 * FALL * t * t, oz + vz * t);
      skull.rotation.set(t * 9, Math.atan2(vx, vz), t * 3);
      particles.glow.spawn({ x: skull.position.x, y: skull.position.y, z: skull.position.z, vx: -vx * 0.05, vy: 0.2, vz: -vz * 0.05,
        life: 0.3, size: 0.3, sizeEnd: 0.05, color: tail, colorEnd: end });
      mark.glow(radius, 0.35 * Math.min(1, t / flight));
      if (t < flight) return true;
      t = Infinity;
      landed();
      return false;
    },
    // (the effects cleared in flight, as a run ends: the skull and its glow taken with them, never left in the scene)
    dispose() {
      if (t === Infinity) return;
      G.scene.remove(skull);
      mark.away();
    },
  });
}

/** Slab's bomb lying where it landed over its fuse: rocking harder and glowing hotter, its glow on the floor tightening
 *  in on it and brightening (never flashing), then its blast. */
function bombLies(thrown: SkullThrown, foe: Enemy | null, damage: number, mark: SoftDisc): void {
  const { x, z } = thrown.landed!, light = SKULL_LIGHT.bomb, skull = thrown.skull;
  const fuse = TWINS.bomb.fuse, radius = TWINS.bomb.radius;
  const y = lyingY(x, z);
  const rest = skull.rotation.clone();
  debris({ x, y, z }, { count: 4, color: 0x6a5a48, speed: 2, size: 0.12 });
  const closing = softDisc('bomb', { x, z }, radius, 'soft');
  // (lit from over it by a pooled light through its fuse, so the skull itself reads from the run's camera: a glow laid
  // on it hid it)
  flash({ color: light, intensity: 14, distance: radius * 2.2, life: 0.2, hold: fuse, pos: { x, y: y + 1.6, z } });
  twinSounds.fuse(fuse);
  let t = 0;
  addEffect({
    update(dt) {
      t += dt;
      const hot = Math.min(1, t / fuse);
      // (its reach held soft; within it a glow drawing in on the skull, brighter as it closes)
      mark.glow(radius, 0.3 + 0.15 * hot);
      closing.glow(radius * (1 - 0.82 * hot), 0.15 + 0.6 * hot);
      skull.rotation.set(rest.x, rest.y, rest.z + Math.sin(t * (6 + hot * 8)) * 0.06 * hot);
      if (Math.random() < 0.2 + hot * 0.5) {
        particles.glow.spawn({ x, y: y + 0.2, z, vx: (Math.random() - 0.5) * 1.2, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.2,
          life: 0.5, size: 0.14, sizeEnd: 0.02, color: col(light, 3), colorEnd: col(0x401000, 0.3), gravity: 2 });
      }
      if (t < fuse) return true;
      t = Infinity;
      closing.away();
      mark.away();
      bombBursts(thrown, foe, damage);
      return false;
    },
    // (the effects cleared over its fuse: it goes unburst, its skull and glows with it)
    dispose() {
      if (t === Infinity) return;
      closing.away();
      mark.away();
      G.scene.remove(skull);
      skull.userData.lying = false;
    },
  });
}

/** The blast: the skull gone in a soft swell of light and a few large shards; this game's hero within its radius hurt
 *  and stunned (`stunBy`). */
function bombBursts(thrown: SkullThrown, foe: Enemy | null, damage: number): void {
  const { x, z } = thrown.landed!, b = TWINS.bomb, light = SKULL_LIGHT.bomb;
  const at = new THREE.Vector3(x, groundHeight(x, z), z);
  thrown.blast = { t: G.time };
  thrown.gone = G.time;
  G.scene.remove(thrown.skull);
  thrown.skull.userData.lying = false;
  const swell = softDisc('bomb', { x, z }, 0.5, 'soft');
  let t = 0;
  addEffect({
    update(dt) {
      t += dt;
      const k = Math.min(1, t / 0.45);
      swell.glow(0.5 + (b.radius * 1.25 - 0.5) * Math.sqrt(k), 1.1 * (1 - k));
      return k < 1;
    },
    dispose: () => swell.away(),
  });
  groundFlash(at, { color: light, intensity: 1.4, radius: b.radius, life: 0.45 });
  burst(new THREE.Vector3(x, at.y + 0.5, z), { count: 14, color: light, speed: 6, up: 3, life: 0.6, size: 0.5 });
  smokePuff(at, { count: 6, color: 0x2a1a10, alpha: 0.45, size: 1.4, sizeEnd: 3.4, speed: 1.4, life: 1.2 });
  debris(at, { count: 5, color: 0xcfc3a3, speed: 6, size: 0.3 });
  flash({ color: light, intensity: 40, distance: b.radius * 4, life: 0.35, pos: { x, y: at.y + 1.2, z } });
  addShake(0.45);
  twinSounds.blast();
  const p = grounded();
  if (!p || Math.hypot(p.pos.x - x, p.pos.z - z) > b.radius + p.radius) return;
  const from = { x: p.pos.x, z: p.pos.z };
  // (a raised shield turned to the blast takes it as any hit, and the stun with it)
  const raised = Boolean(p.channel?.skill.def.block);
  const taken = hurtPlayer(p, damage, 'fire', at, { foe, attack: 'bomb' });
  const shielded = raised && p.lastBlock === G.time;
  const stunned = !shielded && stunBy(p, foe);
  thrown.struck.push({ t: G.time, taken, from, stunned, shielded });
  burst(p.pos, { count: 10, color: light, speed: 5, life: 0.4, size: 0.3 });
}

/** when each hero may next be stunned by a bomb (game time: a stun's end and its rest), and when the stun he has from
 *  one ends */
const stunRest = new WeakMap<Player, number>();
const bombHolds = new WeakMap<Player, number>();

/** This game's hero `p` stunned by a bomb, unless one stunned him within its rest or the fight is a training one's;
 *  whether he was. */
function stunBy(p: Player, foe: Enemy | null): boolean {
  const b = TWINS.bomb;
  if (G.run?.training || foe?.training || G.time < (stunRest.get(p) ?? -1)) return false;
  p.stun(b.stun);
  bombHolds.set(p, G.time + b.stun);
  stunRest.set(p, G.time + b.stun + b.rest);
  return true;
}

/** Whether a bomb holds `p` stunned now: the pair's chain and poison pass him by while it does, so its stun is never
 *  a free hit for them. */
export const heldByBomb = (p: Player): boolean => BOMB_HOLD.passes && p.stunned && G.time < (bombHolds.get(p) ?? -1);
/** whether the pair passes a hero a bomb holds (the lab's canary sets it off: `lab twins --parts bomb --canary`) */
export const BOMB_HOLD = { passes: true };

/** the poison skull's eyes and jaw, where its gas comes out, in its own space (m at its size) */
const GAS_FROM: [number, number, number][] = [[-0.027, -0.024, 0.11], [0.027, -0.024, 0.11], [0, -0.075, 0.12]];
/** how long the skull takes to crumble and sink as its cloud ends (s), and how far it sinks (m) */
const SINKS = { over: 1, by: 0.3 };
const _gas = new THREE.Vector3();

/** Reliquary's poison: a cloud where it landed for `poison.life` s, the skull lying in its middle breathing its gas out
 *  of its eyes and jaw, the cloud's reach a soft glow even to near its rim, denser near the skull; hurting this game's
 *  hero inside it every `poison.every` s. The skull crumbles and sinks as the cloud ends. */
function poisonCloud(thrown: SkullThrown, foe: Enemy | null, damage: number, mark: SoftDisc): void {
  const { x, z } = thrown.landed!, P = TWINS.poison, light = SKULL_LIGHT.poison, skull = thrown.skull;
  const y = groundHeight(x, z);
  const dense = softDisc('poison', { x, z }, P.radius * 0.55, 'soft');
  burst(new THREE.Vector3(x, y + 0.5, z), { count: 16, color: light, speed: 3.5, up: 2, life: 0.6, size: 0.35 });
  twinSounds.poison();
  const by = { foe, attack: 'poison' as const };
  const lyingAt = skull.position.y;
  let t = 0, next = P.every;
  addEffect({
    update(dt) {
      t += dt;
      const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, P.life - t));
      // (a slow breath, well under a beat a second)
      mark.glow(P.radius, fade * (0.28 + 0.05 * Math.sin(t * 2.4)));
      dense.glow(P.radius * 0.55, fade * 0.3);
      gasFrom(skull, light, fade);
      if (Math.random() < 0.45) {
        // (drifting gas over its reach, more of it near the skull)
        const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.8) * P.radius * 0.92;
        particles.smoke.spawn({ x: x + Math.sin(a) * r, y: y + 0.2, z: z + Math.cos(a) * r, vx: Math.sin(a) * 0.15, vy: 0.35, vz: Math.cos(a) * 0.15,
          life: 1.8, size: 1.0, sizeEnd: 2.4, color: col(POISON_SMOKE), alpha: 0.3 * fade });
      }
      // (the skull crumbling and sinking into the floor over the cloud's last moment)
      const sink = Math.min(1, Math.max(0, (t - (P.life - SINKS.over)) / SINKS.over));
      skull.position.y = lyingAt - SINKS.by * sink;
      skull.scale.setScalar(BELT_K * (1 - 0.35 * sink));
      while (t >= next && next <= P.life) {
        next += P.every;
        const p = grounded();
        if (p && !heldByBomb(p) && Math.hypot(p.pos.x - x, p.pos.z - z) < P.radius + p.radius * 0.5) {
          const taken = hurtPlayer(p, damage, 'vitality', null, by);
          thrown.struck.push({ t: G.time, taken });
        }
      }
      if (t < P.life) return true;
      thrown.gone = G.time;
      debris({ x, y: y + 0.1, z }, { count: 4, color: 0xcfc3a3, speed: 1.5, size: 0.1 });
      return false;
    },
    dispose() {
      mark.away();
      dense.away();
      G.scene.remove(skull);
      skull.userData.lying = false;
    },
  });
}

/** Gas let out of the poison skull's eyes and jaw, as it lies. */
function gasFrom(skull: THREE.Object3D, light: number, fade: number): void {
  if (Math.random() > 0.6) return;
  const [ex, ey, ez] = GAS_FROM[Math.floor(Math.random() * GAS_FROM.length)];
  skull.localToWorld(_gas.set(ex, ey, ez));
  particles.smoke.spawn({ x: _gas.x, y: _gas.y, z: _gas.z, vx: (Math.random() - 0.5) * 0.3, vy: 0.7, vz: (Math.random() - 0.5) * 0.3,
    life: 1.2, size: 0.25, sizeEnd: 1.1, color: col(POISON_SMOKE), alpha: 0.5 * fade });
  particles.glow.spawn({ x: _gas.x, y: _gas.y, z: _gas.z, vy: 0.5, life: 0.6, size: 0.12, sizeEnd: 0.02,
    color: col(light, 2.2), colorEnd: col(0x0a2004, 0.3) });
}

/** Twin `fell`'s belt taken by its brother `stands` as it collapses at half (on every game alike). */
export function inherit(fell: Enemy, stands: Enemy | null): void {
  const from = beltOf(fell);
  fell.brain.bomb = fell.brain.poison = 0;
  if (!stands) return;
  beltOf(stands);
  stands.brain.bomb += from.bomb;
  stands.brain.poison += from.poison;
}

/** Each frame on every game: `e`'s belt shown on its model as it is. */
export function showBelt(e: Enemy): void {
  const lay = e.model.root.userData.belt as ((bomb: number, poison: number) => void) | undefined;
  const belt = beltOf(e);
  lay?.(belt.bomb, belt.poison);
}
