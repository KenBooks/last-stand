// Steel Tempest: channelled spin that shreds everything around the caster. Its look is a whirl of blade trails
// staggered round the body at three heights, a faint ring on the floor at its reach, the wind it raises streaming off
// that ring, and dust kicked up where it strikes; let go, the whirl runs down and fades rather than vanishing. All of
// it is lit steadily (nothing pulses with the strikes): the trails overlap round the circle, so a patch of the screen
// the whirl turns past keeps about the same light.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { sfx } from '../../core/audio';
import { slashMesh } from './slash';
import { heftOf, sparks } from './cleave';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import type { ChannelSkill, Needs } from './types';
import { swingOn, swingWay } from '../fling';
import { blastCorpses } from '../../entities/corpse';
import { particles, col } from '../../fx/particles';
import { addEffect } from '../../fx/effects';
import { rand } from '../../util';

type Def = Needs<'damage' | 'radius' | 'spin'>;
type Arc = ReturnType<typeof slashMesh>;

interface TempestState {
  /** the blade trails (scaled to the blade's reach) and the floor's ring (to the skill's), both turned with the body */
  group: THREE.Group; ring: THREE.Group; arcs: Arc[]; tick: number; t: number;
  /** its sound's stop: the spin winding down */
  quiet: (() => void) | undefined;
  /** how far round the hero has turned (rad), and the heading the body was posed at last (its facing and that turn) */
  turn: number; posed: number;
  /** the spin's speed last frame (rad/s), which the wind-down runs down from; wind streaks owed to the next frame */
  speed: number; gust: number;
}

/** how far round it turns between strikes (rad: a strike each 0.2 s at 15 rad/s) */
const TICK_TURN = 3;
/** how long the spin takes to come up to its speed from standing (s), as a body speeds up into a turn (started at its
 *  speed, the body's turn faded in from the stance over the pose's fade, and turned 1.7 times as fast as the spin for
 *  its first tenth of a second: lab eyes) */
const SPIN_UP = 0.2;
/** each trail's length (rad): half a turn, the most one arc's shader takes (atan's range) */
const ARC = Math.PI;
/** what the blades drive round with them, against out */
const SWIRL = 1.3;
/** the blade trails, the first on the blade itself and the others following it round a third of a turn apart, lower
 *  (each its colour, inner edge, light, height under the blade's (m, before the reach's scale) and how quickly its
 *  tail fades: long tails, so the three overlap into a whirl, and no patch of the screen is lit and dark in turn) */
const BLADES = [
  { color: 0xe8eef8, inner: 0.6, fade: 0.6, y: 0, trail: 2.6 },
  { color: 0xc8d8ff, inner: 0.84, fade: 0.4, y: -0.1, trail: 3.2 },
  { color: 0xffc080, inner: 0.86, fade: 0.32, y: -0.2, trail: 3.2 },
] as const;
/** the floor's ring at the skill's reach: two half turns, dusty and faint, showing where it strikes */
const RING = { color: 0xe0cfa8, inner: 0.9, fade: 0.26, trail: 1.6, lift: 0.05 } as const;
/** wind streaking off the ring (a second at full speed), and the dust a strike kicks up there */
const GUSTS = 36, DUST = 3;
/** how long the whirl takes to run down once let go (s) */
const WIND_DOWN = 0.3;

function arcOf(spec: { color: number; inner: number; trail: number }): Arc {
  const a = slashMesh(ARC, spec.inner, spec.color);
  a.mat.uniforms.uTrail.value = spec.trail;
  a.mat.uniforms.uFade.value = 0;
  return a;
}

/** Lights every trail at `k` of its own light (0..1). */
function light(st: TempestState, k: number): void {
  for (let i = 0; i < BLADES.length; i++) st.arcs[i].mat.uniforms.uFade.value = BLADES[i].fade * k;
  for (let i = BLADES.length; i < st.arcs.length; i++) st.arcs[i].mat.uniforms.uFade.value = RING.fade * k;
}

/** A point on the ring at heading `h` and `r` out, and the way round the spin goes there. */
function rim(cx: number, cz: number, h: number, r: number): { x: number; z: number; tx: number; tz: number } {
  const s = Math.sin(h), c = Math.cos(h);
  return { x: cx + s * r, z: cz + c * r, tx: c, tz: -s };
}

const skill: ChannelSkill<TempestState> = {
  anim: 'spin',
  // (each strike its share of the damage a second at the skill's own pace, struck the quicker for cast speed)
  hits(rawDef, stats) {
    const def = rawDef as Def;
    const rate = def.spin * (1 + stats.castSpeed / 100) / TICK_TURN;
    return [{ per: 'strike', base: def.damage * TICK_TURN / def.spin, rate, type: 'physical', note: 'struck faster at a higher casting speed' }];
  },
  channel: true,
  // (every trail and the ring are one program, the blade arcs' own)
  warm: () => [arcOf(BLADES[0]).mesh],
  start(player, rawDef) {
    const group = new THREE.Group(), ring = new THREE.Group();
    group.name = 'Steel Tempest: blades'; ring.name = 'Steel Tempest: ring';
    const arcs: Arc[] = [];
    BLADES.forEach((b, i) => {
      const a = arcOf(b);
      // (a trail's head is at its arc's +heading end, which the group turns onto the blade: the others follow it)
      a.mesh.rotation.y = -i * Math.PI * 2 / BLADES.length;
      a.mesh.position.y = b.y;
      a.mesh.name = `Steel Tempest: trail ${i + 1}`;
      group.add(a.mesh); arcs.push(a);
    });
    for (let i = 0; i < 2; i++) {
      const a = arcOf(RING);
      a.mesh.rotation.y = -i * Math.PI;
      a.mesh.name = `Steel Tempest: ring ${i + 1}`;
      ring.add(a.mesh); arcs.push(a);
    }
    G.scene.add(group, ring);
    // (its sound one held voice going round with the blades, not a whoosh a turn: those came 5 times a second)
    const turns = (rawDef as Def).spin * (1 + player.stats.castSpeed / 100) / (Math.PI * 2);
    return { group, ring, arcs, tick: 0, t: 0, turn: 0, posed: NaN, speed: 0, gust: 0, quiet: sfx.tempest(turns, heftOf(player)) };
  },

  pose(player, _def, st, action) {
    action.turn = st.turn;
    st.posed = player.facing + st.turn;
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    st.speed = def.spin * (1 + player.stats.castSpeed / 100) * Math.min(1, st.t / SPIN_UP);
    const turned = st.speed * dt;
    st.turn += turned;
    const p = player.pos, foot = player.obj.position.y;
    st.group.position.set(p.x, foot + 1.0, p.z);
    st.group.scale.setScalar(def.radius * 0.8);   // the blade's reach; hits count the foe's size too
    st.ring.position.set(p.x, foot + RING.lift, p.z);
    st.ring.scale.setScalar(def.radius);
    // the trail's head follows the blade as drawn: the way it pointed out of the body last frame, from the heading it
    // was posed at then, turned on as far as the body is now (each weapon style holds it its own way)
    const tip = player.castPoint;
    const blade = Number.isNaN(st.posed) ? 0 : Math.atan2(tip.x - p.x, tip.z - p.z) - st.posed;
    const head = player.facing + st.turn + blade;
    st.group.rotation.y = head - ARC / 2;
    st.ring.rotation.y = head - ARC / 2;
    const k = Math.min(1, st.t / 0.15);
    light(st, k);

    // the wind it raises, streaming round off the ring's edge
    st.gust += GUSTS * k * dt;
    for (; st.gust >= 1; st.gust--) {
      const r = rim(p.x, p.z, head - rand(0, 1.2), def.radius * rand(0.75, 1.0)), s = rand(5, 8);
      particles.glow.spawn({
        x: r.x, y: foot + rand(0.3, 1.3), z: r.z, vx: r.tx * s, vy: rand(0, 0.6), vz: r.tz * s,
        life: rand(0.18, 0.3), size: rand(0.05, 0.09), sizeEnd: 0, color: col(0xdfe8ff, 0.9), colorEnd: col(0x8090b0, 0.1), drag: 3,
      });
    }

    st.tick += turned;
    if (st.tick < TICK_TURN) return;
    st.tick -= TICK_TURN;
    // (each strike its share of the damage a second at the skill's own pace: quicker for cast speed, as a cast is)
    const share = TICK_TURN / def.spin;
    let hits = 0;
    hurtPropsIn(player, p.x, p.z, def.radius, PROP_DAMAGE.zone * share);
    // (the blades spin as a heading turns to the left: what they kill goes round with them and out, and the bodies
    // lying in their reach are batted on round)
    blastCorpses(p, def.radius, 3.5, { swirl: SWIRL, lift: 0.35 });
    // the dust the blade's wind kicks up off the floor where it passes, swept on round
    for (let i = 0; i < DUST; i++) {
      const r = rim(p.x, p.z, head - rand(0, 1.5), def.radius * rand(0.7, 1.0)), s = rand(1.5, 3);
      particles.smoke.spawn({
        x: r.x, y: foot + 0.15, z: r.z, vx: r.tx * s, vy: rand(0.3, 0.8), vz: r.tz * s,
        life: rand(0.5, 0.8), size: rand(0.5, 0.8), sizeEnd: rand(1.2, 1.6), color: col(0x6a6050), alpha: 0.22, drag: 2.5,
      });
    }
    for (const e of G.enemies) {
      if (!e.alive || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > def.radius + e.radius) continue;
      hitEnemy(e, def.damage * share, { by: player, skill: def, tags: def.tags, type: 'physical', knock: 0.8, from: p, blow: { dir: swingWay(p, e.pos, 1, SWIRL, 1), lift: 0.3, on: swingOn(p, e.pos, 1, e.radius) } });
      sparks(e.pos.x, e.height * 0.55, e.pos.z, 0xffe0b0, 4);
      hits++;
    }
    if (hits) sfx.tempestBite(heftOf(player));
  },

  stop(_player, _def, st) {
    st.quiet?.();
    // let go, the whirl runs on round from the speed it had, slowing and fading out where it stands
    let t = 0, speed = st.speed;
    addEffect({
      update(dt: number) {
        t += dt;
        const k = Math.max(0, 1 - t / WIND_DOWN);
        speed *= Math.exp(-6 * dt);
        st.group.rotation.y += speed * dt;
        st.ring.rotation.y += speed * dt;
        light(st, Math.min(1, st.t / 0.15) * k * k);
        return k > 0;
      },
      dispose() {
        G.scene.remove(st.group, st.ring);
        for (const a of st.arcs) a.dispose();
      },
    });
  },
};

export default skill;
