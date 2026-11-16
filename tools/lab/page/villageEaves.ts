// `lab village --only eavesClosed`: nothing seen under a cottage's roof from the low views. From play, "Should not be
// able to peek under house roof": the camera low beside a cottage, looking up under its eaves, saw the sky through it,
// as its walls stopped at their plate and its roof's slopes rose from past them, an open band along each long side
// into the empty roof space and out the other side, and a sliver over each gable's slope.
//
// Rays from where a low eye stands round each cottage (out from each side and end, at a knee's, an eye's and over the
// shoulder's height) at points across the band between the walls' tops and the roof, and along each gable's slope just
// under the roof: each must be stopped within `STOPPED_PAST` of the point it's aimed at. Pictured from cottage 0's
// side and end, over the shoulder and through the eyes, looking up under the eaves. `--canary`: what closes the band
// and the slivers (the walls carried up to the roof, the gables up to its underside) let through, as it was.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { COTTAGES, type Cottage } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { groundHeight } from '../../../src/world/ground';
import { rayChunks } from './rayChunks';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far past the point it's aimed at a ray may go before something stops it (m) */
const STOPPED_PAST = 0.3;
/** how far out from a side or an end the eye stands, and how high (m, in the cottage's own size) */
const EYES_OUT = [0.8, 1.6, 2.8];
const EYES_UP = [0.6, 1.6, 2.4];
/** the eye's places along the side it stands at (shares of the side's half length) */
const EYES_ALONG = [-0.8, 0, 0.8];
/** how many points across each band and up it, and along each gable's slope */
const BAND_ACROSS = 7;
const BAND_UP = 3;
const SLOPE_ALONG = 6;
/** how far in from the band's ends and edges its points keep (m), and under the roof a gable's (m) */
const BAND_IN = 0.15;
const UNDER_ROOF = 0.03;
/** the frames he's given to look up under the eaves for a picture */
const LOOK = 60;

/** The roof's underside over a point `along` from the ridge (m, the cottage's own size), as the builder pitches it. */
function undersideAt(along: number): number {
  const { d, h, rise, eave, slate } = COTTAGE;
  const run = d / 2 + eave;
  const pitch = Math.atan2(rise, run);
  return h + rise * (1 - Math.abs(along) / run) - (slate ?? 0.14) / 2 / Math.cos(pitch);
}

/** `c`'s frame: a point of its own (x across, y up, z along, in its own size) into the world's, and back. */
/** A cottage's frame both ways. */
interface CottageFrame {
  toWorld: (x: number, y: number, z: number) => THREE.Vector3;
  toOwn: (point: THREE.Vector3) => THREE.Vector3;
}

function frameOf(c: Cottage): CottageFrame {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(c.x, 0, c.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.facing),
    new THREE.Vector3(c.size, c.size, c.size),
  );
  const inverse = matrix.clone().invert();
  return {
    toWorld: (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(matrix),
    toOwn: (point) => point.clone().applyMatrix4(inverse),
  };
}

/** A ray to send: from an eye at a point it's aimed at, and what it's for. */
interface Sight { from: THREE.Vector3; to: THREE.Vector3; where: string }

/** The points across the band under each long side's eave (x across, z out to that side). */
function bandPoints(): { x: number; y: number; z: number; side: string }[] {
  const { w, d, h } = COTTAGE;
  const top = undersideAt(d / 2);
  const points: { x: number; y: number; z: number; side: string }[] = [];
  for (const sz of [-1, 1]) {
    for (let i = 0; i < BAND_ACROSS; i++) {
      const x = -w / 2 + BAND_IN + (w - 2 * BAND_IN) * (i / (BAND_ACROSS - 1));
      for (let j = 0; j < BAND_UP; j++) {
        const y = h + 0.02 + (top - h - 0.04) * (j / (BAND_UP - 1));
        points.push({ x, y, z: sz * (d / 2 + 0.01), side: sz > 0 ? 'its front' : 'its back' });
      }
    }
  }
  return points;
}

/** The points along each gable's slope, just under the roof (outside the gable's face). */
function slopePoints(): { x: number; y: number; z: number; side: string }[] {
  const { w, d } = COTTAGE;
  const points: { x: number; y: number; z: number; side: string }[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < SLOPE_ALONG; i++) {
      const z = (-d / 2 + BAND_IN) + (d - 2 * BAND_IN) * (i / (SLOPE_ALONG - 1));
      const side = sx > 0 ? 'an end' : 'the other end';
      points.push({ x: sx * (w / 2 + 0.06), y: undersideAt(z) - UNDER_ROOF, z, side });
    }
  }
  return points;
}

/** Every ray round `c`: from eyes out from each side at its band, and out from each end at its gable's slope. */
function sightsAt(c: Cottage): Sight[] {
  const { toWorld } = frameOf(c);
  const { w, d } = COTTAGE;
  const sights: Sight[] = [];
  for (const point of [...bandPoints(), ...slopePoints()]) {
    const onSide = Math.abs(point.z) > d / 2;
    for (const out of EYES_OUT) {
      for (const up of EYES_UP) {
        for (const along of EYES_ALONG) {
          const eye = onSide
            ? toWorld(along * w / 2, up, Math.sign(point.z) * (d / 2 + out))
            : toWorld(Math.sign(point.x) * (w / 2 + out), up, along * d / 2);
          eye.y += groundHeight(eye.x, eye.z);
          sights.push({ from: eye, to: toWorld(point.x, point.y, point.z), where: point.side });
        }
      }
    }
  }
  return sights;
}

/** Whether a point of `c`'s own frame lies on what closes the band and the slivers (`--canary` lets it through). */
function onTheClosing(own: THREE.Vector3): boolean {
  const { w, d, h, rise } = COTTAGE;
  const wallTop = Math.abs(Math.abs(own.z) - d / 2) < 0.06 && own.y > h - 0.01 && Math.abs(own.x) < w / 2 + 0.01;
  const oldGable = h + rise * (1 - (2 * Math.abs(own.z)) / d);
  const gableTop = Math.abs(Math.abs(own.x) - w / 2) < 0.07 && own.y > oldGable - 0.01;
  return wallTop || gableTop;
}

/** Every mesh shown, as chunks for rays. */
function shownMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  return rayChunks(meshes);
}

/** Whether `sight` goes on past its point, under the roof or out through the house: nothing stopping it within
 *  `STOPPED_PAST` past the point (`canary`: what closes the band and slivers let through). */
function peeks(sight: Sight, meshes: THREE.Mesh[], c: Cottage, canary: boolean): boolean {
  const { toOwn } = frameOf(c);
  const way = sight.to.clone().sub(sight.from);
  const reach = way.length() + STOPPED_PAST * c.size;
  const hits = new THREE.Raycaster(sight.from, way.normalize(), 0, reach).intersectObjects(meshes, false);
  const stops = canary ? hits.filter((hit) => !onTheClosing(toOwn(hit.point))) : hits;
  return stops.length === 0;
}

/** A look up under the eaves of cottage 0, in `view`, from a side or an end, pictured. */
async function lookUnder(lab: Lab, view: ViewMode, end: boolean): Promise<Pictured> {
  const c = COTTAGES[0];
  const { toWorld } = frameOf(c);
  const { w, d, h } = COTTAGE;
  // (stood back a little and looking up at the band under the eave, or at a gable's slope near its wall)
  const at = end ? toWorld(w / 2 + 1.4, 0, d / 2 - 1.2) : toWorld(0.6, 0, d / 2 + 1.5);
  const target = end
    ? toWorld(w / 2 + 0.06, undersideAt(d / 2 - 0.5) - 0.05, d / 2 - 0.5)
    : toWorld(0, (h + undersideAt(d / 2)) / 2, d / 2);
  await viewBy(lab, view);
  const facing = Math.atan2(target.x - at.x, target.z - at.z);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z), facing);
  faceCamera(facing);
  await lab.step(LOOK, () => ({ sight: target }));
  return lab.screen(`under cottage 0's eaves from ${end ? 'its end' : 'its front'}, ${view}`, []);
}

/** No ray from a low eye gets in under a cottage's roof, by its sides' eaves or over its gables. */
export async function eavesClosed(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(12);
  const kept = viewMode();
  try {
    const meshes = shownMeshes();
    let sent = 0;
    const seen: string[] = [];
    COTTAGES.forEach((cottage, index) => {
      const sights = sightsAt(cottage);
      sent += sights.length;
      const through = sights.filter((sight) => peeks(sight, meshes, cottage, canary));
      if (through.length === 0) return;
      const sides = [...new Set(through.map((sight) => sight.where))].join(', ');
      seen.push(`cottage ${index}: ${through.length} (${sides})`);
    });
    const line = `${sent} rays from low eyes at the bands under the cottages' eaves and over their gables: `
      + `${seen.length ? seen.join('; ') : 'none'} went on under a roof`;
    if (canary) return { lines: [line], problems: [], caught: seen.length > 0, moments: [] };
    const moments: Pictured[] = [];
    for (const view of ['third', 'first'] as const) {
      for (const end of [false, true]) moments.push(await lookUnder(lab, view, end));
    }
    return { lines: [line], problems: seen.length ? [line] : [], caught: null, moments };
  } finally {
    holdHour(null);
    await viewBy(lab, kept);
  }
}
