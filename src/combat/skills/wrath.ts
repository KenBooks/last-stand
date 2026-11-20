// Wrath: the warrior with both hands empty (#400). Every stack of Frenzy spent in one blow (combat/frenzy.ts), `damage`
// and `perStack` a stack, and the damage he takes back to normal with them. What the blow is goes by the stacks he
// has as he begins it (`ActionState.form`): under `FRENZY.slam` a single hook into the foe before him; from it both
// fists brought down together in a slam that strikes everything within `radius` of where they land too; from
// `FRENZY.quake` the slam cracks the ground and throws the foes round it back. Cast only with a stack or more.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { particles, col, debris, smokePuff } from '../../fx/particles';
import { rand } from '../../util';
import { flash } from '../../fx/lights';
import { addShake, kickFov } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { blastCorpses } from '../../entities/corpse';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { FRENZY, POUNCE } from '../../data/balance';
import { leapSpeed } from './pounce';
import { spendFrenzy } from '../frenzy';
import { fistMark, heatOf } from './savageFists';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'perStack' | 'range' | 'arc' | 'radius' | 'knock'>;

/** each cast's form, chosen as it begins: 0 a hook, 1 a slam, 2 a quake */
const forms = new WeakMap<object, number>();
/** where the slam's fists land ahead of him (m) */
const LANDS = 1.2;
/** each cast's build-up (`gather`): whether its ring has been drawn, and the time to its next dust */
const gathers = new WeakMap<object, { ring: boolean; dust: number }>();

/**
 * The blow gathering through its wind-up, `k` of the way, at `form` (from play: "3 needs more visuals during an
 * attack, to indicate power, in all views": nothing showed until it landed). A ring on the floor drawn in to his
 * feet, dust dragged in after it, and motes of his heat streaming in to his fists, more of each the greater the
 * blow; through his own eyes the view widens and motes stream in to the crosshair from ahead (what's round his body
 * is inside the camera there).
 */
function gather(player: Player, k: number, dt: number, form: number): void {
  const c = player.casting;
  if (!c) return;
  const state = gathers.get(c) ?? { ring: false, dust: 0 };
  gathers.set(c, state);
  const p = player.pos, hot = heatOf(player.frenzy), reach = 1.4 + 0.7 * form;
  const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
  if (!state.ring) {
    state.ring = true;
    const left = Math.max(0.12, c.fireAt - c.t);
    shockwave(p, { color: hot, intensity: 0.9 + 0.5 * form, from: reach + 0.6, to: 0.3, life: left });
    if (form > 0) shockwave(p, { color: 0xffffff, intensity: 0.4 * form, from: reach, to: 0.2, life: left * 0.8 });
  }
  if ((state.dust -= dt) <= 0) {
    state.dust = 0.05;
    const a = Math.random() * Math.PI * 2, r = reach * (1 - 0.6 * k);
    smokePuff({ x: p.x + Math.cos(a) * r, y: 0, z: p.z + Math.sin(a) * r }, {
      count: 1, color: 0x2a241c, alpha: 0.4, size: 0.4, sizeEnd: 1.2, life: 0.5, speed: 0.4, rise: 0.6 + form * 0.4,
    });
  }
  const fists = { x: p.x + fx * 0.4, y: 1.35 + 0.5 * k * Math.min(1, form), z: p.z + fz * 0.4 };
  for (let i = 0; i < 2 + form * 2; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.9, reach), up = rand(-0.9, 0.9), life = rand(0.14, 0.24);
    const from = { x: fists.x + Math.cos(a) * r, y: Math.max(0.1, fists.y + up), z: fists.z + Math.sin(a) * r };
    particles.glow.spawn({
      x: from.x, y: from.y, z: from.z,
      vx: (fists.x - from.x) / life, vy: (fists.y - from.y) / life, vz: (fists.z - from.z) / life,
      life, size: rand(0.05, 0.09) * (1 + 0.3 * form), sizeEnd: 0.01, color: col(hot, 0.8 + 0.5 * k), colorEnd: col(hot, 1.6),
    });
  }
  if (!player.local) return;
  kickFov(3 + 3 * form * k);
  if (!player.eyes) return;
  const to = { x: p.x + fx * 4.2, y: 1.5, z: p.z + fz * 4.2 };
  for (let i = 0; i < 1 + form; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(1.2, 2.4), life = rand(0.18, 0.28);
    const from = { x: to.x - fz * Math.cos(a) * r, y: to.y + Math.sin(a) * r, z: to.z + fx * Math.cos(a) * r };
    particles.glow.spawn({
      x: from.x, y: from.y, z: from.z,
      vx: (to.x - from.x) / life, vy: (to.y - from.y) / life, vz: (to.z - from.z) / life,
      life, size: rand(0.04, 0.07), sizeEnd: 0.01, color: col(hot, 0.7 + 0.5 * k), colorEnd: col(hot, 1.4),
    });
  }
}

/** The form a blow of `stacks` takes. */
export const wrathForm = (stacks: number): number => (stacks >= FRENZY.quake ? 2 : stacks >= FRENZY.slam ? 1 : 0);

function formOf(player: Player): number {
  const c = player.casting;
  if (!c) return wrathForm(player.frenzy);
  let form = forms.get(c);
  if (form === undefined) { form = wrathForm(player.frenzy); forms.set(c, form); }
  return form;
}

/** The foe the hook goes into: the nearest within its reach and arc before him. */
function before(player: Player, def: Def): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!e.alive || e.spawning) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > def.range + e.radius || d >= bd) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - player.facing), Math.cos(Math.atan2(dx, dz) - player.facing)));
    if (off > def.arc / 2 && d > e.radius + player.radius) continue;
    best = e; bd = d;
  }
  return best;
}

const skill: InstantSkill = {
  anim: 'wrath',
  hits: (def) => {
    const d = def as Def;
    return [{ per: 'foe', base: d.damage + d.perStack, type: 'physical', note: `${d.damage} and ${d.perStack} for each stack of Frenzy spent` }];
  },
  canCast: (player) => !player.local || player.frenzy >= 1,
  pose(player, _def, action) { action.form = formOf(player); },
  charging(player, _def, k, dt) { gather(player, k, dt, formOf(player)); },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const form = formOf(player), heat = player.frenzy;
    const stacks = Math.max(1, spendFrenzy(player));
    // (harder with a leap's speed behind it: cast in a Pounce's air or as it lands)
    const damage = (def.damage + def.perStack * stacks) * (1 + POUNCE.slam * leapSpeed(player));
    const facing = player.facing, dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const p = player.pos, at = new THREE.Vector3(p.x + dir.x * LANDS, 0, p.z + dir.z * LANDS);
    const struck = new Set<Enemy>();
    const strike = (e: Enemy, knock: number, lift: number) => {
      if (struck.has(e)) return;
      struck.add(e);
      hitEnemy(e, damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock, from: p, blow: { dir, lift, force: 1 + form * 0.3 } });
      fistMark(e, heat, 10);
    };
    const first = before(player, def);
    if (form === 0) {
      if (first) strike(first, def.knock * 0.5, 0.35);
      sfx.punchLand(1, heat / FRENZY.cap + 0.5); sfx.grunt(heat / FRENZY.cap);
      addShake(0.25);
      if (first) {
        // (the hook lands: a ring of its heat off the foe, a burst thrown on the way it was driven, dust)
        shockwave(first.pos, { color: heatOf(heat), intensity: 1.6, from: 0.2, to: 1.8, life: 0.28 });
        shockwave(first.pos, { color: 0xffffff, intensity: 0.7, from: 0.1, to: 1, life: 0.18, y: first.height * 0.6 });
        debris({ x: first.pos.x + dir.x * 0.4, y: 0, z: first.pos.z + dir.z * 0.4 }, { count: 8, speed: 5 });
        smokePuff(first.pos, { count: 5, color: 0x2a241c, alpha: 0.5, size: 0.6, sizeEnd: 1.8, speed: 2 });
      }
      return;
    }
    if (first) strike(first, def.knock, -0.2);
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) <= def.radius + e.radius) strike(e, form === 2 ? def.knock * 1.5 : def.knock * 0.6, form === 2 ? 0.6 : -0.2);
    }
    hurtPropsIn(player, at.x, at.z, def.radius, PROP_DAMAGE.zone);
    const hot = heatOf(heat);
    shockwave(at, { color: hot, intensity: 2, from: 0.3, to: def.radius, life: 0.4 });
    groundFlash(at, { color: hot, intensity: 1.2, radius: def.radius * 0.7, life: 0.3 });
    decal(at, { type: 'scorch', size: 2, life: 5 });
    smokePuff(at, { count: 10, color: 0x2a241c, size: 1, sizeEnd: 2.8, speed: 3 });
    debris(at, { count: form === 2 ? 26 : 12, speed: form === 2 ? 8 : 5 });
    flash({ color: hot, intensity: form === 2 ? 18 : 9, distance: 7, life: 0.3, pos: { x: at.x, y: 0.5, z: at.z } });
    // (the slam cracks the floor too, less than the quake does. A column of light off it was a slab across the view
    // through the eyes, and is gone)
    if (form === 1) crackDecal(at, { size: def.radius * 0.9, color: hot, intensity: 1.2, life: 2.5 });
    if (form === 2) {
      crackDecal(at, { size: def.radius * 1.4, color: 0xff6030, intensity: 1.6, life: 3 });
      shockwave(at, { color: 0xffffff, intensity: 1, from: 0.2, to: def.radius * 0.7, life: 0.3 });
      blastCorpses(at, def.radius + 0.5, 7, { lift: 1.1 });
    }
    addShake(form === 2 ? 0.7 : 0.4);
    sfx.pound(0); sfx.grunt(1.2);
  },
};

export default skill;
