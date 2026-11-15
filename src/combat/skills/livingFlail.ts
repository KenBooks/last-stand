// Living Flail: the warrior with both hands empty. Held, he turns on the spot with his arms out; the first foe his
// hands meet that a man could lift is seized and swung round him as a club, striking everything in its reach, and
// let go as the key is, thrown out the way it was swinging. With no foe in hand his fists strike what stands close,
// lighter. A boss, an elite, a foe too big to lift (a Cinder Brute, a Barkhide Hulk) and a training dummy are never
// taken up: they are struck as the rest are.
//
// The foe in hand is a carried one (entities/carry.ts, as Bull Rush's and Heave's): thinking of nothing, placed by
// its game. The caster's game seizes it and keeps the carry up (`carryEnemy`, which co-op reports as it does a
// charge's); every game's own tick of the skill then places the foe its hero carries round him, so each screen shows
// it swung, and a carry given no time lets it go, thrown on every game as a charge's are.
import { G } from '../../state';
import { carryEnemy, hitEnemy } from '../damage';
import { dealsDamage } from '../../net/role';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { blastCorpses } from '../../entities/corpse';
import { swingOn, swingWay } from '../fling';
import { fistMark } from './knuckles';
import { FLAIL } from '../../data/balance';
import { LET_GO } from '../../entities/carry';
import type { ChannelSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'radius' | 'spin'>;

interface FlailState {
  /** the foe in hand (none: his fists alone) */
  held: Enemy | null;
  /** how far round he has turned (rad), since the last strike too, and how long he has (s) */
  turn: number; tick: number; t: number;
  /** until the carry is kept up again (s), and when the foe in hand was taken up (of `t`) */
  renew: number; since: number;
}

/** how far round it turns between strikes (rad), and how long the turn takes to come up to speed (s): Steel Tempest's */
const TICK_TURN = 3, SPIN_UP = 0.2;
/** what the swing drives round with it, against out */
const SWIRL = 1.3;

/** Whether `e` can be taken up and swung: a living foe a man could lift, in no one's hands. */
function liftable(e: Enemy): boolean {
  return e.alive && !e.boss && !e.hero && !e.def.dummy && !e.invulnerable && e.radius <= FLAIL.lifts && !e.carried && !e.tossed;
}

/** The foe his hands meet first: the nearest that can be lifted within their reach. */
function seize(player: Player): Enemy | null {
  let nearest: Enemy | null = null, least = FLAIL.reach;
  for (const e of G.enemies) {
    if (!liftable(e)) continue;
    const off = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) - e.radius;
    if (off < least) { nearest = e; least = off; }
  }
  return nearest;
}

/** The way the swing points now (along the ground, its length 1): the way his turned body faces. */
const wayOf = (player: Player, st: FlailState) => ({ x: Math.sin(player.facing + st.turn), z: Math.cos(player.facing + st.turn) });

const skill: ChannelSkill<FlailState> = {
  anim: 'whirl',
  channel: true,
  // (each strike its share of the damage a second at the skill's own pace; his fists alone, and the foe swung as it
  // strikes another, the least of it)
  hits(rawDef, stats) {
    const def = rawDef as Def;
    const rate = def.spin * (1 + stats.castSpeed / 100) / TICK_TURN;
    const base = def.damage * TICK_TURN / def.spin;
    return [
      { per: 'strike', base, rate, type: 'physical', note: 'with a foe in hand, on every foe in its reach' },
      { per: 'fist', base: base * FLAIL.bare, rate, type: 'physical', note: 'with no foe in hand; the foe swung takes as much as it strikes' },
    ];
  },
  start: () => ({ held: null, turn: 0, tick: 0, t: 0, renew: 0, since: 0 }),

  pose(_player, _def, st, action) {
    action.turn = st.turn;
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    const p = player.pos, deals = dealsDamage(player);
    st.t += dt;
    const turned = def.spin * (1 + player.stats.castSpeed / 100) * Math.min(1, st.t / SPIN_UP) * dt;
    st.turn += turned;
    const way = wayOf(player, st);

    // the foe in hand: seized by the caster's game, found by the others as the one their copy of him carries
    if (st.held && (!st.held.alive || st.held.carried?.by !== player)) st.held = null;
    const had = st.held;
    if (!st.held && deals && st.t > SPIN_UP) {
      st.held = seize(player);
      if (st.held) { carryEnemy(st.held, player, way, FLAIL.carry); st.renew = FLAIL.renew; fistMark(st.held, 8); sfx.heaveGrab(); }
    } else if (!st.held && !deals) {
      st.held = G.enemies.find((e) => e.alive && e.carried?.by === player) ?? null;
    }
    if (st.held && st.held !== had) st.since = st.t;
    const held = st.held, carry = held?.carried;
    if (held && carry) {
      // (kept up while he swings: a carry lasts as long as it was given)
      if (deals && (st.renew -= dt) <= 0) { carryEnemy(held, player, way, FLAIL.carry); st.renew = FLAIL.renew; }
      // swung round him at arm's length, its feet in his hands and its head out
      const c = held.carried!, out = player.radius + held.radius + FLAIL.arm;
      c.way.x = way.x; c.way.z = way.z;
      c.swung = { tilt: FLAIL.tilt, lift: FLAIL.lift };
      // (drawn into his hands over a moment as it's seized: put there at once, it jumped over a metre in a frame)
      const k = Math.min(1, (st.t - st.since) / FLAIL.takes);
      held.pos.x += (p.x + way.x * out - held.pos.x) * k; held.pos.z += (p.z + way.z * out - held.pos.z) * k;
    }

    st.tick += turned;
    if (st.tick < TICK_TURN) return;
    st.tick -= TICK_TURN;
    sfx.flailAir(held ? 1 : 0);
    const share = TICK_TURN / def.spin, k = held ? 1 : FLAIL.bare, reach = held ? def.radius : FLAIL.fists;
    hurtPropsIn(player, p.x, p.z, reach, PROP_DAMAGE.zone * share);
    blastCorpses(p, reach, 3.5, { swirl: SWIRL, lift: 0.35 });
    let hits = 0;
    for (const e of G.enemies) {
      if (!e.alive || e === held || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > reach + e.radius) continue;
      hitEnemy(e, def.damage * share * k, { by: player, skill: def, tags: def.tags, type: 'physical', knock: held ? 2.5 : 0.8, from: p, blow: { dir: swingWay(p, e.pos, 1, SWIRL, 1), lift: 0.3, on: swingOn(p, e.pos, 1, e.radius) } });
      fistMark(e, 4);
      hits++;
    }
    if (!hits) return;
    // (the club takes its blows too)
    if (held) hitEnemy(held, def.damage * share * FLAIL.bare, { by: player, skill: def, tags: def.tags, type: 'physical', from: p, blow: { dir: way, lift: 0.3 } });
    if (held) sfx.heaveLand(); else sfx.punchLand(0);
  },

  stop(player, _def, st) {
    const held = st.held;
    if (!held?.alive || held.carried?.by !== player || !dealsDamage(player)) return;
    // let go: a carry given no time to speak of ends at once, thrown on along the swing (its way's length how hard, `carryOf`)
    const way = wayOf(player, st);
    carryEnemy(held, player, { x: way.x * FLAIL.throw, z: way.z * FLAIL.throw }, LET_GO);
    if (held.carried) held.carried.swung = { tilt: FLAIL.tilt, lift: FLAIL.lift };
  },
};

export default skill;
