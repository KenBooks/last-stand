// Lifethread: the healing staff's spell (#402). Held, a beam of light arches up from the staff's orb and comes down
// on an ally, healing them as long as it's held: the ally nearest the aim among those within the cone before him
// (`arc` across) and his reach, or the mage himself with none there (alone, always). It rises `ARCH` above the level
// so it reads apart from every spell cast straight at a foe.
// Judged as a hit on a player is: a hero is healed by his own game, as it shows the beam on him (`healsHere`).
// It heals a flat `heal` raised by the healer's All Damage and `healPct` of the healed one's most Health, so it still
// counts at wave 40's 5 to 6 thousand; held on one ally it grows by its `ramp` (`Ramp`), every game following it from
// whom its own copy of the beam lands on, so the healed one's game, the one that heals, ramps as its screen shows.
import * as THREE from 'three';
import { G } from '../../state';
import { additive } from '../../core/materials';
import { healsHere } from '../../net/role';
import { particles, col } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { rand } from '../../util';
import { sfx } from '../../core/audio';
import { anchorLabel, floatText, removeLabel, textArt } from '../../ui/floaters';
import { ORDER, type Label } from '../../ui/overlay/layer';
import { OUTLINE, type TextStyle } from '../../ui/overlay/paint';
import type { ChannelSkill, Needs } from './types';
import type { Player } from '../../entities/player';
import type { LightSlot } from '../../fx/lights';
import type { SkillDef } from '../../types';

type Def = Needs<'heal' | 'range' | 'arc' | 'color'>;
type RampDef = NonNullable<SkillDef['ramp']>;

/** The beam's heal a second on `on` from `healer` before its ramp: its flat part raised by the healer's All Damage, and
 *  its share of `on`'s most Health, which gear doesn't raise. */
export function threadHeal(def: Pick<SkillDef, 'heal' | 'healPct'>, damagePct: number, maxLife: number): number {
  return (def.heal ?? 0) * (1 + damagePct / 100) + maxLife * (def.healPct ?? 0);
}

/** How long the beam has stayed on one ally: what its heal is raised by. */
export interface Ramp {
  /** whom it is ramping on (null: none yet) */
  on: Player | null;
  /** how long it has been held on him (s) */
  held: number;
  /** how long the beam has been off him since (s): past the ramp's `grace` it begins again on whom it is on */
  off: number;
}

/** A ramp begun on no one. */
export const freshRamp = (): Ramp => ({ on: null, held: 0, off: 0 });

/** The ramp's multiplier of a beam held `held` seconds on one ally. */
export const rampOf = (ramp: RampDef | undefined, held: number): number =>
  ramp ? Math.min(ramp.most, 1 + ramp.perSecond * held) : 1;

/**
 * The ramp followed through a frame of `dt` with the beam on `on`, and what this frame's heal is raised by. On the
 * same ally it grows; off him (a partner stepping out of the cone for a moment, the beam falling back on the healer)
 * it's kept for `grace` and grows no more, the beam healing whom it's on unraised meanwhile; past it, it begins again
 * on whom the beam is on. A frame's flick away and back loses nothing, a real switch costs the grace at most.
 */
export function followRamp(st: Ramp, ramp: RampDef | undefined, on: Player, dt: number): number {
  if (st.on === null || st.on === on) {
    st.on = on;
    st.off = 0;
    st.held += dt;
    return rampOf(ramp, st.held);
  }
  st.off += dt;
  if (st.off <= (ramp?.grace ?? 0)) return 1;
  st.on = on;
  st.off = 0;
  st.held = dt;
  return rampOf(ramp, st.held);
}

/** how often what it has healed is shown as a number over the healed (s): the heal itself lands every frame, the
 *  Health rising smoothly (from play: "should be smooth, not 1 tick per second") */
export const HEAL_SHOWN = 1;
/** the angle the beam leaves the orb at, above the level (rad) */
const ARCH = Math.PI / 6;
/** where on a hero it lands, above his feet (m) */
const CHEST = 1.25;
/** the beam's rings along it and sides round it, and its radius (m) */
const ALONG = 24, ROUND = 6, RADIUS = 0.03;

interface ThreadState {
  beam: THREE.Mesh; core: THREE.Mesh; geo: THREE.BufferGeometry; mats: THREE.Material[];
  due: number; healed: number; t: number; on: Player; light: LightSlot;
  /** how long it has been held on whom: let go, the channel's state goes and the next hold begins it again */
  ramp: Ramp;
  /** whom what it healed this second landed on here, the number shown over him (down a chain, not whom it's on) */
  shown?: Player;
  /** the healers whose beams it carries on (`linksInto`), as the count at his aim shows it */
  links: number;
  /** the count of them at his own aim (his own game alone), and where it stands */
  linkLabel?: Label;
  linkAt: THREE.Vector3 | null;
  /** its held sound let fade */
  hush?: () => void;
}

/** A tube of `ALONG` rings whose points `bend` places each frame. */
function tube(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ALONG + 1) * ROUND * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < ROUND; j++) {
      const a = i * ROUND + j, b = i * ROUND + (j + 1) % ROUND, c = a + ROUND, d = b + ROUND;
      index.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(index);
  return geo;
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** The beam's point `k` of the way from `from` to `to` (0..1): an arch leaving `from` at `ARCH` above the level. */
function along(from: THREE.Vector3, to: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const flat = Math.hypot(to.x - from.x, to.z - from.z);
  // (a parabola over the straight line between them, as high as leaving at `ARCH` makes it; to himself, a loop
  // over his head)
  const rise = Math.max(0.5, flat * Math.tan(ARCH) / 2) * 4 * k * (1 - k);
  return out.lerpVectors(from, to, k).setY(from.y + (to.y - from.y) * k + rise);
}

/** Lay the tube along the arch, `wide` times its radius, pulsing along its length. */
function bend(geo: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3, wide: number, t: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= ALONG; i++) {
    const k = i / ALONG;
    along(from, to, k, _p);
    along(from, to, Math.min(1, k + 0.02), _q);
    _t.subVectors(_q, along(from, to, Math.max(0, k - 0.02), _v)).normalize();
    _u.crossVectors(_t, UP);
    if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0);
    _u.normalize();
    _v.crossVectors(_t, _u);
    const r = RADIUS * wide * (1 + 0.25 * Math.sin(k * 26 - t * 14));
    for (let j = 0; j < ROUND; j++) {
      const a = (j / ROUND) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.setXYZ(i * ROUND + j, _p.x + _u.x * c + _v.x * s, _p.y + _u.y * c + _v.y * s, _p.z + _u.z * c + _v.z * s);
    }
  }
  pos.needsUpdate = true;
}

/** Whom the beam lands on: the ally nearest the aim within his reach and the cone before him, or himself. */
export function threadTarget(player: Player, def: Pick<Def, 'range' | 'arc'>): Player {
  const ax = player.aim.x - player.pos.x, az = player.aim.z - player.pos.z, al = Math.hypot(ax, az);
  if (al < 1e-3) return player;
  let best: Player = player, nearest = Infinity;
  for (const p of G.players) {
    if (p === player || !p.alive || p.away) continue;
    const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > def.range || d < 1e-3) continue;
    const off = Math.acos(Math.min(1, Math.max(-1, (dx * ax + dz * az) / (d * al))));
    if (off > def.arc / 2) continue;
    const fromAim = Math.hypot(p.pos.x - player.aim.x, p.pos.z - player.aim.z);
    if (fromAim < nearest) { nearest = fromAim; best = p; }
  }
  return best;
}

/** Whom `healer` holds his own Lifethread on, someone else: what reaches him full goes on to that one. */
export function passesTo(healer: Player): Player | null {
  const channel = healer.channel;
  if (!channel || channel.skill.impl !== skill) return null;
  const on = (channel.state as ThreadState).on;
  return on === healer ? null : on;
}

/** Whether a hero takes no more healing: his Health at his most (half a point short counts, as it's shown whole). */
const isFull = (p: Player): boolean => p.life >= p.stats.maxLife - 0.5;

/**
 * Where a frame's heal goes, beginning at `on`, and what each one healed here was given: a hero takes what he has room
 * for, and a full one holding Lifethread on another passes the rest on to him, and so on down the chain (a healer
 * healing a healer: from the owner, "the healing power transfers to the player they are healing"), each one's share of
 * the heal `heal(hisMostLife)` reckoned at his own most Health. Each game heals only its own hero (`healsHere`), and
 * reads the others' Health as their reports bring it, so the one at a chain's end is healed by his own game, from its
 * copy of the full healer's Health and beam. A ring of healers ends where it comes round. Each healer it passes adds
 * `bonus` of the heal (from the owner: "10% healing bonus per chain link"), added, not compounded: two links +20%.
 */
export function flowHeal(on: Player, heal: (maxLife: number) => number, bonus = 0): [Player, number][] {
  const given: [Player, number][] = [];
  const seen = new Set<Player>();
  let next: Player | null = on;
  // (the share of the frame's heal still to give, and the healers it has passed)
  let left = 1;
  let links = 0;
  while (next && left > 1e-9 && !seen.has(next)) {
    seen.add(next);
    const amount = heal(next.stats.maxLife) * (1 + bonus * links) * left;
    const room = Math.max(0, next.stats.maxLife - next.life);
    const takes = isFull(next) ? 0 : Math.min(amount, room);
    if (takes > 0 && healsHere(next)) {
      const before = next.life;
      next.heal(takes, true);
      given.push([next, next.life - before]);
    }
    left *= amount > 0 ? 1 - takes / amount : 0;
    next = passesTo(next);
    links++;
  }
  return given;
}

/** how much thicker a beam is for each healer whose beam it carries on, up to `LINKS_SHOWN` of them */
const LINK_THICKER = 0.45;
const LINKS_SHOWN = 3;
/** the count of the beams it carries, at his aim: the heal's own green, a size under a crit's number */
const LINK_STYLE: TextStyle = {
  face: 'display', weight: 700, size: 22, color: '#6dff7a',
  shadows: [...OUTLINE, { x: 0, y: 0, blur: 10, color: 'rgba(0, 50, 10, .9)' }],
};
/** how far over his aim the count stands (m) */
const LINK_ABOVE = 0.6;

/**
 * The healers whose beams `healer`'s carries on: while he's full, each one holding Lifethread on him and those
 * passing theirs on to that one, and so on (a ring counted once). Each game counts from its own copies, as it heals.
 */
export function linksInto(healer: Player, seen = new Set<Player>()): number {
  if (!isFull(healer)) return 0;
  seen.add(healer);
  let links = 0;
  for (const p of G.players) {
    if (seen.has(p) || !p.alive || passesTo(p) !== healer) continue;
    links += 1 + linksInto(p, seen);
  }
  return links;
}

/** The count of the beams his carries on, at his own aim (where the cursor or the crosshair is): his own game alone,
 *  painted only as it changes. */
function showLinks(player: Player, st: ThreadState, links: number): void {
  const shown = player.local ? links : 0;
  if (shown && !st.linkLabel) {
    st.linkLabel = anchorLabel(ORDER.float, () => st.linkAt);
    st.linkLabel.ax = 0.5;
    st.linkLabel.ay = 1;
  }
  if (shown !== st.links && shown) st.linkLabel!.show(textArt(`Linked ×${shown}`, LINK_STYLE));
  st.links = shown;
  st.linkAt = shown ? (st.linkAt ?? new THREE.Vector3()).copy(player.aim).setY(player.aim.y + LINK_ABOVE) : null;
}

const skill: ChannelSkill<ThreadState> = {
  anim: 'point',
  channel: true,
  warm: () => [new THREE.Mesh(tube(), additive(0xffffff, 2, 0.5))],
  start(player, rawDef) {
    const def = rawDef as Def;
    const geo = tube();
    const outer = additive(def.color, 1.1, 0.5), inner = additive(0xffe0e0, 1.3, 0.8);
    outer.depthWrite = inner.depthWrite = false;
    const beam = new THREE.Mesh(geo, outer), core = new THREE.Mesh(geo.clone(), inner);
    beam.frustumCulled = core.frustumCulled = false;
    beam.name = 'Lifethread: beam';
    core.name = 'Lifethread: core';
    G.scene.add(beam, core);
    return {
      hush: player.quiet ? undefined : sfx.thread(),
      beam, core, geo, mats: [outer, inner], due: HEAL_SHOWN, healed: 0, t: 0, on: player, ramp: freshRamp(), links: 0, linkAt: null,
      light: flash({ color: def.color, intensity: 3, distance: 4, life: 1, hold: 999 }),
    };
  },
  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const on = st.on = threadTarget(player, def);
    const from = player.castPoint;
    const to = _q.set(on.pos.x, on.pos.y + CHEST, on.pos.z).clone();
    // (a beam carrying another healer's on is thicker, by each it carries: seen by everyone)
    const links = linksInto(player);
    const thick = 1 + LINK_THICKER * Math.min(links, LINKS_SHOWN);
    bend(st.geo, from, to, 1.6 * thick, st.t);
    bend(st.core.geometry, from, to, 0.55 * thick, st.t);
    showLinks(player, st, links);
    st.light.light.position.copy(to);
    // motes of its light rising off whom it heals
    const want = 14 * dt, n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.15, 0.5);
      particles.glow.spawn({
        x: on.pos.x + Math.cos(a) * r, y: on.pos.y + rand(0.3, 1.6), z: on.pos.z + Math.sin(a) * r,
        vx: 0, vy: rand(0.6, 1.4), vz: 0, life: rand(0.4, 0.8), size: rand(0.06, 0.12), sizeEnd: 0.01,
        color: col(0xffffff, 2.5), colorEnd: col(def.color, 1.5), drag: 0.5, gravity: 0,
      });
    }
    // (followed on every game, from whom its beam lands on, so the healed one's game ramps as it shows the beam)
    const raised = followRamp(st.ramp, def.ramp, on, dt);
    // (healed by each one's own game, as its screen shows the beam on him: every frame, what it gave summed for the
    // number; what a full healer can't take goes on down his own beam, `flowHeal`)
    const healOf = (into: number): number => threadHeal(def, player.stats.damagePct, into) * raised * dt;
    for (const [to, gave] of flowHeal(on, healOf, def.passBonus)) {
      st.healed += gave;
      st.shown = to;
    }
    st.due -= dt;
    if (st.due > 0) return;
    st.due += HEAL_SHOWN;
    const at = st.shown ?? on;
    if (st.healed >= 1) floatText(at.pos.x, 2.4, at.pos.z, `+${Math.round(st.healed)}`, 'heal', '#6dff7a');
    st.healed = 0;
    st.shown = undefined;
  },
  stop(_player, _def, st) {
    st.hush?.();
    removeLabel(st.linkLabel);
    G.scene.remove(st.beam, st.core);
    st.geo.dispose();
    st.core.geometry.dispose();
    for (const m of st.mats) m.dispose();
    release(st.light);
  },
};

export default skill;
