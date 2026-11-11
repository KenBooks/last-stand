// Steel Tempest: channelled spin that shreds everything around the caster.
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

type Def = Needs<'damage' | 'radius' | 'spin'>;

interface TempestState {
  group: THREE.Group; arcs: ReturnType<typeof slashMesh>[]; tick: number; t: number;
  /** its sound's stop: the spin winding down */
  quiet: (() => void) | undefined;
  /** how far round the hero has turned (rad), and the heading the body was posed at last (its facing and that turn) */
  turn: number; posed: number;
}

/** how far round it turns between strikes (rad: a strike each 0.2 s at 15 rad/s) */
const TICK_TURN = 3;
/** how long the spin takes to come up to its speed from standing (s), as a body speeds up into a turn (started at its
 *  speed, the body's turn faded in from the stance over the pose's fade, and turned 1.7 times as fast as the spin for
 *  its first tenth of a second: lab eyes) */
const SPIN_UP = 0.2;
const ARC = 2.6;
const COLOR = 0xe8eef8;
/** what the blades drive round with them, against out */
const SWIRL = 1.3;

const skill: ChannelSkill<TempestState> = {
  anim: 'spin',
  // (each strike its share of the damage a second at the skill's own pace, struck the quicker for cast speed)
  hits(rawDef, stats) {
    const def = rawDef as Def;
    const rate = def.spin * (1 + stats.castSpeed / 100) / TICK_TURN;
    return [{ per: 'strike', base: def.damage * TICK_TURN / def.spin, rate, type: 'physical', note: 'struck faster at a higher casting speed' }];
  },
  channel: true,
  warm: () => [slashMesh(ARC, 0.55, COLOR).mesh],
  start(player, rawDef) {
    const group = new THREE.Group();
    // two opposed blade trails, one bright and one fainter and lower
    const arcs = [slashMesh(ARC, 0.55, COLOR), slashMesh(ARC, 0.6, 0xffc080)];
    arcs[1].mesh.rotation.y = Math.PI;
    arcs[1].mesh.position.y = -0.25;
    for (const a of arcs) group.add(a.mesh);
    G.scene.add(group);
    // (its sound one held voice going round with the blades, not a whoosh a turn: those came 5 times a second)
    const turns = (rawDef as Def).spin * (1 + player.stats.castSpeed / 100) / (Math.PI * 2);
    return { group, arcs, tick: 0, t: 0, turn: 0, posed: NaN, quiet: sfx.tempest(turns, heftOf(player)) };
  },

  pose(player, _def, st, action) {
    action.turn = st.turn;
    st.posed = player.facing + st.turn;
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const turned = def.spin * (1 + player.stats.castSpeed / 100) * Math.min(1, st.t / SPIN_UP) * dt;
    st.turn += turned;
    st.group.position.set(player.pos.x, player.obj.position.y + 1.0, player.pos.z);
    st.group.scale.setScalar(def.radius * 0.8);   // the blade's reach; hits count the foe's size too
    // the trail's head follows the blade as drawn: the way it pointed out of the body last frame, from the heading it
    // was posed at then, turned on as far as the body is now (each weapon style holds it its own way)
    const tip = player.castPoint, p = player.pos;
    const blade = Number.isNaN(st.posed) ? 0 : Math.atan2(tip.x - p.x, tip.z - p.z) - st.posed;
    st.group.rotation.y = player.facing + st.turn + blade - ARC / 2;
    const fade = Math.min(1, st.t / 0.15);
    st.arcs[0].mat.uniforms.uFade.value = fade * 0.6;
    st.arcs[1].mat.uniforms.uFade.value = fade * 0.3;

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
    G.scene.remove(st.group);
    for (const a of st.arcs) a.dispose();
  },
};

export default skill;
