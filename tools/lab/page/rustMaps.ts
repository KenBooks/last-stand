// `lab rustcheck`'s checks of the maps the game hands the engine: a canvas nothing has drawn on (it stopped the
// engine for good), and one painted after the engine first met it (the village's ground stayed white).
import * as THREE from 'three';
import type { Lab } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';

/** A canvas nothing has drawn on, shown as a map: the engine draws on after it. */
export async function blankCanvas(lab: Lab, bridge: Bridge): Promise<Checked> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const map = new THREE.CanvasTexture(canvas);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map }));
  card.position.copy(G.player.pos).add(new THREE.Vector3(0, 3, 0));
  G.scene.add(card);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(3);
  } catch (error) {
    return failed(`a blank canvas as a map stopped the engine: ${String(error).slice(0, 200)}`);
  } finally {
    lab.drawing = drawing;
    G.scene.remove(card);
    map.dispose();
  }
  if (bridge.stats.draws < 10) return failed(`after a blank canvas as a map the engine drew ${bridge.stats.draws} things`);
  return passed('a canvas nothing has drawn on is taken as a map');
}

/** how wide the game hands a map out before its worker has made it, and how wide one comes (pixels) */
const BLANK_WIDE = 1;
const PAINTED_WIDE = 64;

/** How many maps the engine took over `frames` frames with `card` in the scene. */
async function mapsTakenOver(lab: Lab, bridge: Bridge, frames: number): Promise<number> {
  let taken = 0;
  for (let frame = 0; frame < frames; frame++) {
    await lab.step(1);
    taken += bridge.stats.newTextures;
  }
  return taken;
}

/**
 * A map painted after the engine first met it (the game hands one out blank, a pixel wide, while a worker makes it,
 * and paints it as it comes with no word to its texture) is handed over again: the village's ground stayed white on
 * a loaded PC. With maps kept whatever their size (`rust.mapsBySize=0`), it must not be.
 */
export async function mapPaintedLate(lab: Lab, bridge: Bridge): Promise<Checked> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BLANK_WIDE;
  const map = new THREE.CanvasTexture(canvas);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map }));
  card.position.copy(G.player.pos).add(new THREE.Vector3(0, 3, 0));
  G.scene.add(card);
  const drawing = lab.drawing;
  lab.drawing = true;
  const paint = (wide: number): void => {
    canvas.width = canvas.height = wide;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#804020';
    context.fillRect(0, 0, wide, wide);
  };
  try {
    const first = await mapsTakenOver(lab, bridge, 3);
    if (first < 1) return failed('a map on a blank canvas was never handed to the engine');
    paint(PAINTED_WIDE);
    const again = await mapsTakenOver(lab, bridge, 3);
    if (again !== 1) return failed(`a map painted after it was handed over was handed over ${again} times more, not once`);
    RUST.tune.mapsBySize = 0;
    paint(PAINTED_WIDE * 2);
    const canary = await mapsTakenOver(lab, bridge, 3);
    if (canary !== 0) return failed('the canary: with maps kept whatever their size, a repainted one was still handed over');
    return passed('a map painted after the engine first met it is handed over again, once (the canary: kept as it was)');
  } finally {
    RUST.tune.mapsBySize = 1;
    lab.drawing = drawing;
    G.scene.remove(card);
    map.dispose();
  }
}
