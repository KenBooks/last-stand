// Compare the drawn bow sight with real arrow impacts in the village yard.
import * as THREE from 'three';
import { input } from '../../../src/core/input';
import { settleCamera } from '../../../src/core/renderer';
import { YARD, YARD_DUMMIES } from '../../../src/data/village';
import { ARROW } from '../../../src/entities/models/bow';
import { laserPaths, showLaser } from '../../../src/fx/aimLaser';
import { SINK, spentPoints } from '../../../src/fx/stuckArrows';
import { G } from '../../../src/state';
import { toggleMenuStowed } from '../../../src/ui/menus';
import { groundHeight } from '../../../src/world/ground';
import type { Lab, Pictured, Report } from './lab';
import { drawAt } from './shots';

const CASES = [
  { name: 'sack', height: 1.2, distance: 3.1 },
  { name: 'post', height: 0.4, distance: 3.1 },
  { name: 'post up close', height: 0.30, distance: 1.25 },
] as const;
const CONTACT_SLACK = 0.08;

/** Switches for pictures and the deliberately short sight. */
export interface BowSightOptions {
  pictures: boolean;
  canary: boolean;
}

/** Check that the cursor, preview and shot agree at the sack and the thin support below it. */
export async function measureBowSight(lab: Lab, { pictures, canary }: BowSightOptions): Promise<Report> {
  if (G.arena.place !== 'village' || lab.player.cls.id !== 'ranger') {
    throw new Error('lab: bowsight needs the ranger in the village');
  }
  const [x, z] = YARD_DUMMIES[1];
  const dummy = G.enemies.find((foe) => foe.meter && Math.hypot(foe.pos.x - x, foe.pos.z - z) < 0.1);
  if (!dummy?.meter) throw new Error('lab: the yard dummy is missing');
  const meter = dummy.meter;
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  toggleMenuStowed(true);
  await lab.until(() => !dummy.invulnerable, 150, 'the dummy never rose');
  const forward = new THREE.Vector3(Math.sin(YARD.turn), 0, Math.cos(YARD.turn));
  for (const test of CASES) {
    const stand = dummy.pos.clone().addScaledVector(forward, -test.distance);
    stand.y = groundHeight(stand.x, stand.z);
    lab.player.place(stand, YARD.turn);
    settleCamera(stand);
    const aim = new THREE.Vector3(x, dummy.obj.position.y + test.height, z);
    await lab.step(5, () => ({ aim }));
    const before = meter.burst;
    const earlierArrows = new Set(spentPoints().map((arrow) => arrow.p));
    await drawAt(lab, aim);
    if (input.foe !== dummy) problems.push(`${test.name}: the cursor never targeted the dummy`);
    const path = laserPaths()[0];
    if (canary && path?.end && path.pts.length > 1) {
      const from = path.pts[path.pts.length - 2];
      const end = path.end.clone().sub(path.end.clone().sub(from).setLength(ARROW / 2));
      showLaser([{ pts: [...path.pts.slice(0, -1), end], end }]);
    }
    const dot = laserPaths()[0]?.end?.clone();
    const aimHeight = input.ground.y;
    if (pictures) moments.push(await lab.screen(`sight at ${test.name}`));
    await lab.step(18, () => ({ aim }));
    const arrow = spentPoints().find((spent) => spent.mode === 'body' && !earlierArrows.has(spent.p));
    if (before.total === meter.burst.total || !arrow) {
      problems.push(`${test.name}: the arrow did not score a hit on the aimed dummy`);
      lines.push(`${test.name}: shot missed (aim height ${aimHeight.toFixed(2)} m)`);
    } else {
      const direction = arrow.tip.clone().sub(arrow.p).normalize();
      const contact = arrow.tip.clone().addScaledVector(direction, -SINK.body);
      const gap = dot?.distanceTo(contact) ?? Infinity;
      const height = contact.y - dummy.obj.position.y;
      if (canary ? gap < 0.3 || !Number.isFinite(gap) : gap > CONTACT_SLACK) {
        problems.push(`${test.name}: unexpected sight gap ${(gap * 100).toFixed(1)} cm`);
      }
      if (test.name !== 'sack' && (height >= 0.8 || height < 0.2 || Math.abs(height - test.height) > 0.20)) {
        problems.push(`${test.name}: the arrow missed the lower post at the aimed height`);
      }
      lines.push(`${test.name}: contact at ${height.toFixed(2)} m, sight gap ${(gap * 100).toFixed(1)} cm`);
    }
    await lab.step(180, () => ({ aim }));
  }
  if (canary && !problems.length) lines.push('canary: the half-arrow gap was caught for every hit');
  return { text: lines.join('\n'), problems, moments };
}
