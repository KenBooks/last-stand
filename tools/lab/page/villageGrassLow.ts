// `lab village --only grassOnLow`: the grass as Low draws it against High, in the lobby's view and over the shoulder
// (from play, an S25 Edge's Profile at full res: the grass 21 ms of an 80 ms frame; the owner's choice, "Keep cheaper
// grass"). Low spreads the blades twice as far apart, each twice as wide (`grassSpread`, `setGrassSpread` in
// meadow.ts): the vertices the grass's rings shade a frame are counted on each level, from the counts each ring lists
// as it's drawn, and Low must shade at most a third of High's; the switch, there and back, must compile no program.
// Each is pictured. `canary` leaves the blades as close as High's on Low, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, type ViewMode } from '../../../src/core/renderer';
import { qualityLevel, useQuality } from '../../../src/core/quality';
import { setGrassSpread } from '../../../src/world/meadow';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** where he stands and the way he faces: open meadow ahead, the cottages off to the side */
const STAND = new THREE.Vector3(10, 0, 4);
const FACING = Math.PI / 2;
/** the frames given to settle after a switch */
const SETTLE = 30;
/** the most of High's vertices Low may shade */
const MOST_OF_HIGH = 1 / 3;
/** the views read: the lobby's own, and over the shoulder */
const VIEWS: ViewMode[] = ['top', 'third'];

/** A share as a whole percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(0)}%`;

/** The vertices the meadow's rings shade in the frame just drawn: each ring's blades listed times a blade's points. */
function grassVertices(): number {
  let vertices = 0;
  G.arena.village!.meadow.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
    vertices += geometry.instanceCount * geometry.attributes.position.count;
  });
  return vertices;
}

/** The frame drawn at `level`: the vertices the grass shaded, and the programs compiled for it. */
async function drawnAt(lab: Lab, level: 'high' | 'low', canary: boolean): Promise<{ vertices: number; made: number }> {
  const before = G.renderer.info.programs?.length ?? 0;
  useQuality(level);
  if (canary && level === 'low') setGrassSpread(1);
  await lab.step(SETTLE);
  drawFrame(lab);
  return { vertices: grassVertices(), made: (G.renderer.info.programs?.length ?? 0) - before };
}

/** The grass on Low against High in each view, its vertices counted and pictured. */
export async function grassOnLow(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const was = qualityLevel();
  holdHour(12);
  G.player.walkTo = null;
  G.player.place(STAND, FACING);
  faceCamera(FACING);
  let caught = false;
  try {
    for (const view of VIEWS) {
      await viewBy(lab, view);
      const high = await drawnAt(lab, 'high', canary);
      if (!canary) moments.push(await lab.screen(`${view}: High`, []));
      const low = await drawnAt(lab, 'low', canary);
      if (!canary) moments.push(await lab.screen(`${view}: Low`, []));
      const share = low.vertices / high.vertices;
      const made = high.made + low.made;
      const shaded = `${low.vertices} vertices on Low, ${high.vertices} on High (${percent(share)})`;
      lines.push(`${view}: the grass shades ${shaded}, ${made} programs compiled by the switches`);
      if (!high.vertices) throw new Error(`lab: village: no grass drawn in the ${view} view`);
      if (made) problems.push(`grassOnLow: ${made} programs compiled switching to Low and back in the ${view} view`);
      if (share <= MOST_OF_HIGH) continue;
      if (canary) caught = true;
      else problems.push(`grassOnLow: Low shades ${percent(share)} of High's grass vertices in the ${view} view`);
    }
  } finally {
    useQuality(was);
  }
  return { lines, problems, caught: canary ? caught : null, moments };
}
