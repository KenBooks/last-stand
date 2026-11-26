// Where the village dummy's head actually goes as a real skill hits it.
import * as THREE from 'three';
import { YARD_DUMMIES } from '../../../src/data/village';
import type { Enemy } from '../../../src/entities/enemy';
import { inYard } from '../../../src/game/village';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import type { Lab, Pictured, Report } from './lab';

/** Whether to plant the old behavior or capture the impact poses. */
export interface DummyHitOptions {
  canary: boolean;
  pictures: boolean;
}

const FROM_SIDES = [
  ['west', new THREE.Vector3(1, 0, 0)],
  ['east', new THREE.Vector3(-1, 0, 0)],
  ['north', new THREE.Vector3(0, 0, 1)],
  ['south', new THREE.Vector3(0, 0, -1)],
] as const;
const ATTACKS = { warrior: 'cleave', ranger: 'nockShot', mage: 'starfall' } as const;

/** Launch a known skill and return the horizontal direction the dummy should move. */
function strike(lab: Lab, dummy: Enemy, outward: THREE.Vector3, attack: string): THREE.Vector3 {
  const hero = lab.player;
  const skill = hero.skillOf(attack);
  if (!skill) throw new Error(`lab: the ${hero.cls.id} does not know ${attack}`);
  const target = dummy.pos.clone();
  if (skill.def.impl === ATTACKS.mage) target.addScaledVector(outward, -1.6);
  else target.y = dummy.obj.position.y + dummy.height * 0.56;
  hero.energy = hero.stats.maxEnergy;
  hero.fire(skill, target);
  if (skill.def.impl !== ATTACKS.ranger) return outward;

  const arrow = G.projectiles.find((shot) => !shot.hostile && shot.alive);
  if (!arrow) throw new Error('lab: Nockshot did not launch an arrow');
  const flight = new THREE.Vector3(arrow.vel.x, 0, arrow.vel.z).normalize();
  if (flight.dot(outward) < 0.85) throw new Error('lab: the arrow did not fly in from the named side');
  // The archer changes sides after release. The dummy must still follow the arrow.
  const other = dummy.pos.clone().addScaledVector(outward, 1.6);
  other.y = groundHeight(other.x, other.z);
  hero.place(other, hero.facing);
  return flight;
}

/** Play four attacks on the middle yard dummy and measure the first swing, rebound and settling. */
export async function measureDummyHit(lab: Lab, { canary, pictures }: DummyHitOptions): Promise<Report> {
  if (G.mode !== 'menu' || G.arena.place !== 'village') throw new Error('lab: expected the village lobby');
  const [x, z] = YARD_DUMMIES[1];
  const dummy = G.enemies.find((foe) => foe.meter && Math.hypot(foe.pos.x - x, foe.pos.z - z) < 0.1);
  if (!dummy?.meter || !dummy.model.head) throw new Error('lab: no middle training dummy with a head and meter');
  const meter = dummy.meter;
  const head = dummy.model.head;
  await lab.until(() => !dummy.invulnerable, 150, 'the dummy never became targetable');
  const kick = dummy.model.impact;
  if (canary && !kick) throw new Error('lab: no directional impact to plant');
  if (canary) dummy.model.impact = () => kick!(0, 1);
  const attack: string = ATTACKS[lab.player.cls.id as keyof typeof ATTACKS];
  const cases = FROM_SIDES.map(([side, outward]) => ({ side, outward, attack }));
  if (attack === ATTACKS.mage && !canary) cases.push({ side: 'west', outward: FROM_SIDES[0][1], attack: 'glacialNova' });
  const problems: string[] = [];
  const lines: string[] = [];
  const moments: Pictured[] = [];
  let wrongWays = 0;
  try {
    for (const test of cases) {
      const { side, outward, attack } = test;
      const label = `${attack} from ${side}`;
      const stand = dummy.pos.clone().addScaledVector(outward, -1.6);
      // For the area attack, the caster is to the side of the blast's direction.
      if (attack === ATTACKS.mage) stand.add(new THREE.Vector3(-outward.z, 0, outward.x));
      if (!inYard(stand.x, stand.z)) throw new Error(`lab: the ${side} attack started outside the yard`);
      stand.y = groundHeight(stand.x, stand.z);
      lab.player.walkTo = null;
      lab.player.place(stand, Math.atan2(outward.x, outward.z));
      await lab.step(3);
      const atRest = head.getWorldPosition(new THREE.Vector3());
      const before = meter.burst;
      const expected = strike(lab, dummy, outward, attack);
      await lab.until(() => meter.burst.hits !== before.hits || meter.burst.total !== before.total, 90,
        `the attack from ${side} never registered on the dummy's damage meter`);
      if (attack === 'glacialNova' && dummy.frozen <= 0) problems.push(`${label}: the dummy never froze`);

      const swing: THREE.Vector3[] = [head.getWorldPosition(new THREE.Vector3()).sub(atRest)];
      swing.push(...await lab.step(14, undefined, (frame) => {
        if (pictures && frame === 10 && (side === 'east' || side === 'west')) {
          moments.push(lab.picture(label, ['plan'], [], { at: atRest, distance: 3.8 }));
        }
        return head.getWorldPosition(new THREE.Vector3()).sub(atRest);
      }));
      const flat = (v: THREE.Vector3) => Math.hypot(v.x, v.z);
      const first = swing.find((offset) => flat(offset) > 0.03);
      if (!first) problems.push(`${label}: the hit did not visibly tip the dummy`);
      const alignment = first ? first.dot(expected) / flat(first) : 0;
      if (first && alignment < 0.93) {
        wrongWays++;
        if (!canary) problems.push(`${label}: the dummy did not tip away from the blow`);
      }
      const rebound = await lab.step(28, undefined, () => head.getWorldPosition(new THREE.Vector3()).sub(atRest));
      const reversed = rebound.some((offset) => offset.dot(first ?? expected) < -0.001);
      if (!reversed && attack !== ATTACKS.mage) problems.push(`${label}: the dummy did not rebound`);
      await lab.step(180);
      const drift = flat(head.getWorldPosition(new THREE.Vector3()).sub(atRest));
      if (drift > 0.01) problems.push(`${label}: the dummy did not settle back upright`);
      lines.push(`${label}: direction agreement ${alignment.toFixed(2)}, settled within ${(drift * 100).toFixed(2)} cm`);
    }
  } finally {
    dummy.model.impact = kick;
  }
  if (canary) {
    if (wrongWays !== 3) problems.push(`the fixed-direction canary should fail three approaches, caught ${wrongWays}`);
    lines.push(`fixed-direction canary: ${wrongWays}/3 wrong directions detected`);
  }
  return { text: lines.join('\n'), problems, moments };
}
