// What lit a flash (tools/lab `cast`): the frame drawn again with each thing in the scene taken out in turn, and the
// light a cell of the frame loses without it. A flash's change is then shared out among them: what each lit at the
// change's end less what it lit at its start. A thing is whatever the scene holds under one name (an effect's mesh,
// a pool of particles, a crowd of foes, the hero, a biome's prop), and each light by itself: a group that holds a
// light is opened into its parts, as a light hidden changes the lights every material is compiled for, and a light
// is put out by its intensity alone. What no thing in the scene accounts for (the grade's adaptation, the exposure,
// the page) is the rest.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { frameCells } from './screenCells';
import type { ChangeSpan } from './flashes';

/** A thing of the scene that can be taken out of a frame: its name, and taking it out (the result puts it back). */
export interface Source {
  name: string;
  takeOut: () => () => void;
}

/** What each source lit of a cell in one frame (a share of white), and the cell's light with them all. */
export interface Lit {
  whole: number;
  bySource: Map<string, number>;
}

/** a source is listed for a change it lit this much of (a share of white) */
const LISTED_FROM = 0.005;
/** the sources listed for a change, at most */
const LISTED_MOST = 4;

/** A name for a thing of the scene without one: what it is and what it's drawn with. */
function described(object: THREE.Object3D): string {
  const material = (object as THREE.Mesh).material;
  const drawnWith = Array.isArray(material) ? material[0]?.type : material?.type;
  return `unnamed ${object.type}${drawnWith ? ` (${drawnWith})` : ''}`;
}

/** Whether `object` or anything under it is a light. */
function holdsLight(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    found ||= (child as THREE.Light).isLight === true;
  });
  return found;
}

/** A light as a source: put out by its intensity. */
function lightSource(light: THREE.Light, under: string): Source {
  const at = light.getWorldPosition(new THREE.Vector3());
  const place = `${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)}`;
  const name = `${under}${light.name || light.type} at ${place}`;
  return {
    name,
    takeOut: () => {
      const intensity = light.intensity;
      light.intensity = 0;
      return () => {
        light.intensity = intensity;
      };
    },
  };
}

/** The things under `parent` gathered into `byName`, and its lights into `lights`: a group holding a light is opened
 *  into its own parts, named under it. */
function gather(parent: THREE.Object3D, under: string, byName: Map<string, THREE.Object3D[]>, lights: Source[]): void {
  for (const child of parent.children) {
    if (!child.visible) continue;
    if ((child as THREE.Light).isLight) {
      if ((child as THREE.Light).intensity > 0) lights.push(lightSource(child as THREE.Light, under));
      continue;
    }
    if (holdsLight(child)) {
      gather(child, `${under}${child.name || child.type}: `, byName, lights);
      continue;
    }
    const name = `${under}${child.name || described(child)}`;
    const named = byName.get(name) ?? [];
    named.push(child);
    byName.set(name, named);
  }
}

/** Everything shown in the scene now, as sources: each name's things together, each lit light alone. */
export function sceneSources(): Source[] {
  const byName = new Map<string, THREE.Object3D[]>();
  const lights: Source[] = [];
  gather(G.scene, '', byName, lights);
  const things = [...byName].map(([name, objects]): Source => ({
    name: objects.length > 1 ? `${name} (${objects.length})` : name,
    takeOut: () => {
      for (const object of objects) object.visible = false;
      return () => {
        for (const object of objects) object.visible = true;
      };
    },
  }));
  return [...things, ...lights];
}

/** The light of `cell` in the frame drawn now, as the game draws it. */
function cellLightNow(lab: Lab, cell: number): number {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    renderer.render();
  } finally {
    lab.drawing = drawing;
  }
  return frameCells().cellLights[cell];
}

/** What each thing in the scene lights of `cell` now: the cell's light with everything, less its light without the
 *  thing. The frame is drawn once for each; the game isn't stepped. */
export function litNow(lab: Lab, cell: number): Lit {
  const whole = cellLightNow(lab, cell);
  const bySource = new Map<string, number>();
  for (const source of sceneSources()) {
    const putBack = source.takeOut();
    try {
      bySource.set(source.name, whole - cellLightNow(lab, cell));
    } finally {
      putBack();
    }
  }
  return { whole, bySource };
}

const signed = (light: number): string => `${light >= 0 ? '+' : '-'}${Math.abs(light).toFixed(3)}`;

/** A change as a line: how much of it each source lit, the most first, and what none of them accounts for. */
export function changeLine(span: ChangeSpan, from: Lit, to: Lit, time: (frame: number) => string): string {
  const change = to.whole - from.whole;
  const shares = [...new Set([...from.bySource.keys(), ...to.bySource.keys()])]
    .map((name) => ({ name, lit: (to.bySource.get(name) ?? 0) - (from.bySource.get(name) ?? 0) }))
    .sort((a, b) => Math.abs(b.lit) - Math.abs(a.lit));
  const accounted = shares.reduce((total, share) => total + share.lit, 0);
  const listed = shares.filter((share) => Math.abs(share.lit) >= LISTED_FROM).slice(0, LISTED_MOST)
    .map((share) => `${share.name} ${signed(share.lit)}`);
  const head = `${span.rising ? 'up' : 'down'} ${signed(change)} from ${time(span.from)} to ${time(span.to)}`;
  return `      ${head}: ${[...listed, `the rest ${signed(change - accounted)}`].join('; ')}`;
}

/** The source that lit the most of a change, and its share of the change (0 to 1; null when none lit any). */
export function mostOf(from: Lit, to: Lit): { name: string; share: number } | null {
  const change = to.whole - from.whole;
  let most: { name: string; share: number } | null = null;
  for (const [name, lit] of to.bySource) {
    const share = change ? (lit - (from.bySource.get(name) ?? 0)) / change : 0;
    if (!most || share > most.share) most = { name, share };
  }
  return most;
}
