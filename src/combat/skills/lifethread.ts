// Lifethread: the healing staff's spell (#402). Held, a beam of light arches up from the staff's orb and comes down
// on an ally, healing them as long as it's held: the ally nearest the aim among those within the cone before him
// (`arc` across) and his reach, or the mage himself with none there (alone, always). It rises `ARCH` above the level
// so it reads apart from every spell cast straight at a foe.
// Judged as a hit on a player is: a hero is healed by his own game, as it shows the beam on him (`healsHere`).
import * as THREE from 'three';
import { G } from '../../state';
import { additive } from '../../core/materials';
import { healsHere } from '../../net/role';
import { particles, col } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { rand } from '../../util';
import { sfx } from '../../core/audio';
import { floatText } from '../../ui/floaters';
import type { ChannelSkill, Needs } from './types';
import type { Player } from '../../entities/player';
import type { LightSlot } from '../../fx/lights';

type Def = Needs<'heal' | 'range' | 'arc' | 'color'>;

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
      beam, core, geo, mats: [outer, inner], due: HEAL_SHOWN, healed: 0, t: 0, on: player,
      light: flash({ color: def.color, intensity: 3, distance: 4, life: 1, hold: 999 }),
    };
  },
  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const on = st.on = threadTarget(player, def);
    const from = player.castPoint;
    const to = _q.set(on.pos.x, on.pos.y + CHEST, on.pos.z).clone();
    bend(st.geo, from, to, 1.6, st.t);
    bend(st.core.geometry, from, to, 0.55, st.t);
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
    // (healed by his own game, as its screen shows the beam on him: every frame, what it gave summed for the number)
    if (healsHere(on)) {
      const before = on.life;
      on.heal(def.heal * (1 + player.stats.damagePct / 100) * dt, true);
      st.healed += on.life - before;
    }
    st.due -= dt;
    if (st.due > 0) return;
    st.due += HEAL_SHOWN;
    if (st.healed >= 1) floatText(on.pos.x, 2.4, on.pos.z, `+${Math.round(st.healed)}`, 'heal', '#6dff7a');
    st.healed = 0;
  },
  stop(_player, _def, st) {
    st.hush?.();
    G.scene.remove(st.beam, st.core);
    st.geo.dispose();
    st.core.geometry.dispose();
    for (const m of st.mats) m.dispose();
    release(st.light);
  },
};

export default skill;
