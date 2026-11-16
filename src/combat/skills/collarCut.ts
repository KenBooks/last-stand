// Collar and Cut: the warrior with a one-handed weapon and his other hand free. He seizes the nearest foe before him
// by the collar with the free hand, holding it where it stands, and cuts it away with the blade: one heavy blow on
// that foe alone, which launches it far through the air. A boss, an elite, a training dummy or a foe too big to hold (a Cinder Brute, a Barkhide Hulk) isn't
// held: it's shoved and cut for less. With no foe in his reach it isn't cast, and costs nothing.
//
// From play, on a sword and no shield (the one way of holding weapons with nothing on right click): "2. I like
// this one", the free hand used as a weapon of its own, grab and stab. The hold is a daze (`dazeEnemy`, judged by the
// caster's game as hits are), the blow a hit, so co-op sends nothing new.
import * as THREE from 'three';
import { carryEnemy, dazeEnemy, hitEnemy } from '../damage';
import { LET_GO } from '../../entities/carry';
import { COLLAR } from '../../data/balance';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { sparks } from './cleave';
import { markOf, heldUp } from './heave';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'duration' | 'knock'>;

/** the share of the blow a foe he can't hold takes, shoved off as he cuts */
const UNHELD = 0.6;
/** casts whose grab has happened (once each, as the cast's wind-up starts) */
const grabbed = new WeakMap<object, Enemy | null>();

const skill: InstantSkill = {
  anim: 'swing',
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical', least: UNHELD, note: 'the foe seized; one he cannot hold, less' }],
  canCast: (player, def, target) => markOf(player, def as Def, target) !== null,
  // (the free hand reaching out and taking hold through the wind-up, and yanking it in as the blade comes through)
  pose: (_player, _def, action) => { action.grab = true; },
  charging(player, rawDef) {
    const def = rawDef as Def;
    const c = player.casting;
    if (!c || grabbed.has(c)) return;
    const foe = markOf(player, def, c.target);
    grabbed.set(c, foe);
    if (!foe) return;
    // (turned to it: the cut comes the way he faces)
    c.target.copy(foe.pos);
    sfx.cleave(c.fireAt - c.t, 1, 1);
    if (heldUp(foe)) { dazeEnemy(foe, def.duration, player); sfx.heaveGrab(); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const c = player.casting;
    const foe = c ? grabbed.get(c) : null;
    if (!foe?.alive) return;
    const held = heldUp(foe), p = player.pos;
    const way = new THREE.Vector3(foe.pos.x - p.x, 0, foe.pos.z - p.z).normalize();
    // (what the blow kills flies as far as a launched foe does)
    hitEnemy(foe, def.damage * (held ? 1 : UNHELD), {
      by: player, skill: def, tags: def.tags, type: 'physical', from: p,
      blow: { dir: { x: way.x, z: way.z }, lift: 0.5, force: COLLAR.launch },
    });
    // and what it leaves standing is launched off the blade, far through the air: a carry given no time, thrown on
    // every game as a charge's are (a boss or an elite shoved, a training dummy standing). From play: "It just looks
    // like a left click swing, no diffrence, lets lauch it further away, while dealing a bit less damadge"
    if (foe.alive) carryEnemy(foe, player, { x: way.x * COLLAR.launch, z: way.z * COLLAR.launch }, LET_GO);
    sparks(foe.pos.x, foe.height * 0.6, foe.pos.z, 0xffd9a0, 12);
    addShake(0.12);
    sfx.cleaveBite(1);
  },
};

export default skill;
