// `lab village --only heroCoarseFromAfar`: the hero drawn from fewer triangles seen from afar (`models/farDetail.ts`;
// from play, in the hall with three heroes in view, "1.3m not expected either": a hero is about 140k triangles on
// High at any distance). From above he must be drawn coarse, and the frame drawn so and whole at one moment must be
// the same to the eye: the share of its pixels apart, and by how much. Over the shoulder he must be whole. `canary`
// holds the coarse geometries off, which must be found.
import type * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { viewMode } from '../../../src/core/renderer';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the game's switch for the far detail (a commit from before it has none: an A/B's other side loads this module) */
interface FarSwitch { on: boolean }
/** what a hero says of his far detail */
interface FarDetail { far: boolean; meshes: number; update(distance: number): void }

/** the most of the frame's pixels that may differ between him coarse and whole, from above */
const MOST_APART = 0.004;
/** the frames given to settle in a view */
const SETTLE = 40;

/** The triangles the hero's meshes draw now (those the frame draws: not his shadows' own casters). */
function heroTriangles(): number {
  let triangles = 0;
  G.player.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || mesh.userData.shadowTwin) return;
    const geometry = mesh.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(triangles);
}

/** The hero from above coarse against whole, and whole over the shoulder. */
export async function heroCoarseFromAfar(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const module = await import('../../../src/entities/models/farDetail') as { farDetailOn: FarSwitch };
  const far = (G.player as unknown as { farDetail: FarDetail }).farDetail;
  const distance = (): number => G.camera.position.distanceTo(G.player.obj.position);
  holdHour(12);
  let line = '';
  let caught = false;
  try {
    module.farDetailOn.on = !canary;
    await viewBy(lab, 'top');
    await lab.step(SETTLE);
    const coarseNow = far.far;
    const fewer = heroTriangles();
    // (drawn once first: a frame's look follows from the one before, its exposure adapting)
    drawFrame(lab);
    const coarse = drawFrame(lab);
    module.farDetailOn.on = false;
    far.update(distance());
    const every = heroTriangles();
    const whole = drawFrame(lab);
    // (and whole twice, for what two draws of one thing differ by)
    const again = drawFrame(lab);
    const apart = Math.max(0, changedShare(coarse, whole) - changedShare(whole, again));
    module.farDetailOn.on = !canary;
    far.update(distance());
    if (!canary) moments.push(await lab.screen('from above, coarse', []));
    await viewBy(lab, 'third');
    await lab.step(SETTLE);
    const wholeClose = !far.far;
    line = `the hero from above, ${distance().toFixed(0)} m off over the shoulder and whole there (${wholeClose}): `
      + `${fewer} triangles of his ${every} (${far.meshes} meshes coarse), ${(apart * 100).toFixed(3)}% of the frame `
      + `apart from him whole (at most ${MOST_APART * 100}%)`;
    caught = !coarseNow;
    if (!canary) {
      if (!coarseNow) problems.push('heroCoarseFromAfar: from above he is drawn whole');
      if (fewer > every * 0.75) problems.push(`heroCoarseFromAfar: coarse he is ${fewer} triangles of ${every}`);
      if (apart > MOST_APART) problems.push(`heroCoarseFromAfar: ${(apart * 100).toFixed(3)}% of the frame apart`);
      if (!wholeClose) problems.push('heroCoarseFromAfar: over the shoulder he is drawn coarse');
    }
  } finally {
    module.farDetailOn.on = true;
    holdHour(null);
    await viewBy(lab, view);
  }
  return { lines: [line], problems, caught: canary ? caught : null, moments };
}
