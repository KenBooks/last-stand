// Wrath: the warrior with both hands empty (#400). Every stack of Frenzy spent in one blow (combat/frenzy.ts), `damage`
// and `perStack` a stack, and the damage he takes back to normal with them. What the blow is goes by the stacks he
// has as he begins it (`ActionState.form`): under `FRENZY.slam` a single hook into the foe before him; from it both
// fists brought down together in a slam that strikes everything within `radius` of where they land too; from
// `FRENZY.quake` the slam cracks the ground and throws the foes round it back. Cast only with a stack or more.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { debris, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { blastCorpses } from '../../entities/corpse';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { FRENZY } from '../../data/balance';
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
  charging(player) { formOf(player); },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const form = formOf(player), heat = player.frenzy;
    const stacks = Math.max(1, spendFrenzy(player));
    const damage = def.damage + def.perStack * stacks;
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
      if (first) shockwave(first.pos, { color: heatOf(heat), intensity: 1.2, from: 0.2, to: 1.4, life: 0.25 });
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
