// The hero's fall in a solo run, from a lethal hit to the settled body.
import type { Mesh } from 'three';
import { hurtPlayer } from '../../../src/combat/damage';
import { G } from '../../../src/state';
import { isShown, placeVertices } from './geometry';
import type { Fixture, Lab, Report } from './lab';

/** Setup and fault injection for the hero fall check. */
export interface HeroFallOptions {
  fixture: Fixture;
  canary: boolean;
}

const MAX_FLOOR_CLIP = 0.04;

/** Does the visible model cross the floor by more than the permitted contact tolerance? */
function clipsFloor(clearance: number): boolean {
  return clearance < -MAX_FLOOR_CLIP;
}

/** Read the lowest drawn vertex of the opaque body and its equipment, in world space. */
function lowestVertex(lab: Lab): { y: number; label: string; count: number } {
  const root = lab.model.root;
  root.updateWorldMatrix(true, true);
  const lowest = { y: Infinity, label: '', count: 0 };
  root.traverseVisible((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !isShown(mesh)) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || material.alphaTest > 0 || material.transparent) return;
    const vertices = new Float32Array(mesh.geometry.attributes.position.count * 3);
    placeVertices(mesh, vertices);
    for (let index = 1; index < vertices.length; index += 3) {
      if (vertices[index] < lowest.y) {
        lowest.y = vertices[index];
        lowest.label = mesh.name || mesh.parent?.name || 'unnamed mesh';
      }
    }
    lowest.count += vertices.length / 3;
  });
  return lowest;
}

/** Measure the actual fall and prove the settled-model floor check detects a planted fault. */
export async function measureHeroFall(lab: Lab, options: HeroFallOptions): Promise<Report> {
  await lab.setup({ ...options.fixture, view: 'top' });
  const hero = lab.player;
  const joints = lab.joints;
  const floor = hero.pos.y;
  hero.guardUntil = 0;
  hurtPlayer(hero, 1e9);
  if (hero.alive || hero.deadT !== 0 || hero.life !== 0) {
    return { text: '', problems: ['lethal damage did not start the solo death animation'] };
  }

  // The setup holds a wave back and writes this share of life before each frame.
  lab.lifeShare = 0;
  const poses = await lab.step(68, undefined, () => ({
    time: hero.deadT,
    tilt: -joints.body.rotation.x,
    knee: joints.kneeL.rotation.x,
  }));
  const early = poses.filter(({ time }) => time > 0.1 && time <= 0.3);
  const landing = poses.filter(({ time }) => time >= 0.49 && time <= 0.59);
  const rebound = poses.filter(({ time }) => time > 0.59 && time <= 0.76);
  const settled = poses.filter(({ time }) => time >= 1);
  if (![early, landing, rebound, settled].every((phase) => phase.length > 0)) {
    return { text: '', problems: ['the game did not advance through every phase of the death animation'] };
  }
  // The live hero may already stand with bent knees. Compare poses within the fall itself.
  const buckle = Math.max(...early.map(({ knee }) => knee)) - poses[0].knee;
  const impact = Math.max(...landing.map(({ tilt }) => tilt));
  const bounce = impact - Math.min(...rebound.map(({ tilt }) => tilt));
  const tilt = settled.at(-1)!.tilt;
  const drift = Math.max(...settled.map((pose) => Math.abs(pose.tilt - tilt)));
  const kneeDifference = joints.kneeL.rotation.x - joints.kneeR.rotation.x;
  const problems: string[] = [];
  if (buckle < 0.25) problems.push('the knee did not buckle before landing');
  if (impact < 1.3 || impact - early[0].tilt < 1) problems.push('the hero did not fall backward to his back');
  if (bounce < 0.025 || tilt < 1.3 || drift > 0.02) problems.push('the hero did not rebound and settle on his back');
  if (kneeDifference < 0.4) problems.push('the settled hero lost his asymmetric knee pose');
  if (G.player !== hero || hero.alive) problems.push('the fallen hero did not remain the local player');

  const model = lowestVertex(lab);
  const clearance = model.y - floor;
  if (!model.count || !Number.isFinite(clearance)) problems.push('no visible solid geometry was measured');
  else if (clipsFloor(clearance)) problems.push('the settled hero clips through the floor');
  else if (clearance > 0.09) problems.push('the settled hero floats above the floor');
  const lines = [
    `${hero.cls.id}: knee bend ${buckle.toFixed(2)} rad, impact ${impact.toFixed(2)}, rebound ${bounce.toFixed(2)}, `
      + `settled ${tilt.toFixed(2)}`,
    `floor clearance ${(clearance * 100).toFixed(1)} cm (${model.label}, ${model.count} vertices checked)`,
  ];
  if (options.canary) {
    joints.body.position.y -= 0.3;
    try {
      const planted = lowestVertex(lab);
      if (!planted.count || !clipsFloor(planted.y - floor)) problems.push('the planted floor clip went unseen');
      else lines.push('canary: caught a body put 30 cm down through the floor');
    } finally {
      joints.body.position.y += 0.3;
      lab.model.root.updateWorldMatrix(true, true);
    }
  }
  return { text: lines.join('\n'), problems };
}
