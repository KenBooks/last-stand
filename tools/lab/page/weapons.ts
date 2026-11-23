// tools/lab weapons: each of the hero's weapons pictured alone in a plain, lit studio: face on (a blade's flat, an
// axe's bit to the side), edge on, from three-quarters and its head close up, with its size and how many triangles
// it's drawn with. A weapon is judged here as it's made, before it's seen in a hand: through the eyes, a maul with a
// thin haft and a small head showed nothing of what it is, and no placement of it matched Vermintide 2's. (From
// behind too: a face wound the wrong way shows there as a hole.)
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { cameraOn, countsOf, shoot, studio } from './studio';
import type { WeaponStyle } from '../../../src/types';

export interface WeaponsOptions {
  fixture: Fixture;
  /** the bases pictured (the class's weapons by default) */
  weapons?: string[];
  /** picture an empty studio too: the measure of what's drawn must find nothing there */
  canary?: boolean;
}

/** A way the studio's camera looks at a weapon: from where (the weapon's own frame: its length +y, a blade's width or
 *  an axe's bit +x, its flat facing +z), and what of it it frames (shares of its length from its butt) */
interface StudioView {
  name: string;
  from: THREE.Vector3Tuple;
  frames: [number, number];
}

const VIEWS: StudioView[] = [
  { name: 'face', from: [0, 0, 1], frames: [0, 1] },
  { name: 'edge', from: [1, 0, 0], frames: [0, 1] },
  { name: 'behind', from: [-0.5, 0.2, -1], frames: [0, 1] },
  { name: 'quarter', from: [0.8, 0.35, 1], frames: [0, 1] },
  { name: 'head', from: [0.45, 0.25, 1], frames: [0.6, 1] },
];

/** the least share of a picture a weapon must cover to count as drawn (a blade edge on covers under 1%) */
const LEAST_DRAWN = 0.001;

/** The weapon in the hero's hand (a bow's in his left), a copy of it at its own frame (unturned in the fist), or none. */
function weaponCopy(lab: Lab): THREE.Object3D | null {
  // (a bow's own tip is on the bow, its limb's: its `tip` is the nocked arrow's, under the right hand, which holds no
  // weapon, and `lab weapons --class ranger` found none)
  const bow = lab.model.weaponTip?.parent;
  const grip = lab.model.tip?.parent;
  if (!bow && (!grip || grip === lab.model.root)) return null;
  const held = (child: THREE.Object3D): boolean => child.visible && child instanceof THREE.Group && hasMeshes(child);
  const shown = bow ?? grip!.children.find(held);
  if (!shown) return null;
  const copy = cloneBare(shown);
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.set(1, 1, 1);
  copy.updateMatrixWorld(true);
  return copy;
}

/** A clone of `object` with no `userData`, which three copies through JSON: the bow's points back at the bow. */
function cloneBare(object: THREE.Object3D): THREE.Object3D {
  const kept = new Map<THREE.Object3D, Record<string, unknown>>();
  object.traverse((child) => {
    kept.set(child, child.userData);
    child.userData = {};
  });
  try {
    return object.clone();
  } finally {
    kept.forEach((data, child) => {
      child.userData = data;
    });
  }
}

function hasMeshes(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) found = true;
  });
  return found;
}

/** The part of `box` (the weapon's, its own frame) between shares `frames` of its length. */
function partOf(box: THREE.Box3, frames: [number, number]): THREE.Box3 {
  const length = box.max.y - box.min.y;
  const part = box.clone();
  part.min.y = box.min.y + length * frames[0];
  part.max.y = box.min.y + length * frames[1];
  return part;
}

/** `copy` pictured from each of the studio's views (none of it shown with `empty`), and the least and the most of a
 *  picture drawn. */
async function pictureOf(lab: Lab, copy: THREE.Object3D, empty = false):
  Promise<{ tiles: Tile[]; least: number; most: number }> {
  const scene = studio();
  if (!empty) scene.add(copy);
  const box = new THREE.Box3().setFromObject(copy);
  const shots = VIEWS.map((view) => ({ name: view.name, camera: cameraOn(partOf(box, view.frames), view.from) }));
  try {
    return await shoot(lab, scene, shots);
  } finally {
    scene.remove(copy);
  }
}

/** A weapon's notes: its size in its own frame (m) and what it's drawn with. */
function notesOn(copy: THREE.Object3D): string[] {
  const size = new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3());
  const { triangles, meshes } = countsOf(copy);
  return [
    `${size.y.toFixed(2)} m long, ${size.x.toFixed(2)} m across its width, ${size.z.toFixed(2)} m thick`,
    `${triangles.toLocaleString('en')} triangles in ${meshes} meshes`,
  ];
}

/** The style a base is held in: a two-hander's, or one in one hand. */
function styleOf(lab: Lab, base: string): WeaponStyle {
  return lab.player.cls.twoHanded?.includes(base) ? 'twoHanded' : 'oneHanded';
}

/** Each of the bases pictured alone from the studio's views, with its notes. */
export async function weapons(lab: Lab, options: WeaponsOptions): Promise<Report> {
  const bases = options.weapons ?? lab.player.cls.bases?.weapon ?? [];
  if (!bases.length) throw new Error('lab: weapons: this class has no weapons');
  const moments: Pictured[] = [];
  const problems: string[] = [];
  const lines: string[] = [];
  for (const base of bases) {
    await lab.setup({ ...options.fixture, gear: styleOf(lab, base), weapon: base });
    const copy = weaponCopy(lab);
    if (!copy) throw new Error(`lab: weapons: no ${base} in the hero's hand`);
    const { tiles, least } = await pictureOf(lab, copy);
    if (least < LEAST_DRAWN) problems.push(`the ${base} covers ${(least * 100).toFixed(1)}% of a picture: not drawn`);
    const notes = notesOn(copy);
    moments.push({ label: base, tiles, notes });
    lines.push(`${base}: ${notes.join('; ')}`);
  }
  if (options.canary) {
    const copy = weaponCopy(lab)!;
    const { most } = await pictureOf(lab, copy, true);
    const read = `the canary's empty studio read as ${(most * 100).toFixed(1)}% drawn`;
    if (most >= LEAST_DRAWN) problems.push(read);
    else lines.push(read);
  }
  return { text: lines.join('\n'), problems, moments };
}
