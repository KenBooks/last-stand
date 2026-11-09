// tools/lab neck: each hero's neck as it's sculpted, bare, in his chest item and under his hat, at rest and looking
// aside: read up lines all round it from the clothes to the head (page/neckSlices.ts, the read in neckRead.ts) for
// the shelves and ridges round it, the steps and colour where the head's own skin takes over from the neck's, its
// girth against a man's, skin come out through the clothes and the ground seen through between them from above
// (neckGaps.ts); its canaries planted (neckCanaries.ts); and pictured close in the studio from behind, the sides, the
// front and from above behind, as the game's camera looks down on him. (The owner, of the ranger from above behind,
// #261: "Fix neck sculpting, check all characters"; the column neck's flat top stood out of the head's skin under his
// ears, a ledge the light drew as a line across the back of his neck, and none of the face harness's neck numbers
// said so.)
import * as THREE from 'three';
import type { Lab, Pictured, Report, Tile } from './lab';
import type { Gear, Model } from '../../../src/types';
import { cameraOn, shoot, studio, type Shot } from './studio';
import { meshesOf, wearLook, type Look } from './looks';
import { sliceNeck } from './neckSlices';
import { verdicts } from './neckRead';
import { canaries } from './neckCanaries';
import { buildModel } from '../../../src/entities/models/index';
import { CLASSES } from '../../../src/data/classes/index';

/** what the hero wears: nothing over his clothes, his chest item, or that and his hat or helm */
export type Dress = 'bare' | 'chest' | 'hat';
/** how he holds his head: straight, or turned aside as he looks at a foe (`LOOK_ASIDE`) */
export type NeckPose = 'rest' | 'aside';

export interface NeckOptions {
  classes: string[];
  dresses: Dress[];
  poses: NeckPose[];
  look: Look;
  /** plant the faults the measures must catch (neckCanaries.ts) */
  canary: boolean;
}

/** the head turned aside as `LookAt` turns it onto a foe to his left (rad: the neck's share, the head's, and the head
 *  bowed a little) */
const LOOK_ASIDE = { neck: 0.35, head: 0.5, bow: 0.15 };

/** The studio's views of the neck: from where (the hero facing +z, his left +x; looking aside, his neck stretches
 *  on his right). */
const VIEWS: { name: string; from: THREE.Vector3Tuple }[] = [
  { name: 'back', from: [0, 0.15, -1] },
  { name: 'behind-left', from: [0.8, 0.2, -0.8] },
  { name: 'left', from: [1, 0.1, 0] },
  { name: 'right', from: [-1, 0.1, 0] },
  { name: 'front', from: [0, 0.1, 1] },
  { name: 'above-behind', from: [0.35, 0.9, -1] },
];
/** what the pictures frame round the neck's axis (m): out to the sides, from below the neck's joint, above the
 *  head's */
const FRAME = { across: 0.13, below: 0.05, above: 0.25 };

/** The gear a hero is dressed in for `dress`, no weapon in his hands. */
function gearFor(dress: Dress): Gear {
  return {
    weapon: null,
    twoHanded: false,
    shield: false,
    offWeapon: null,
    helm: dress === 'hat',
    chest: dress !== 'bare',
    hands: false,
    rarity: {},
  };
}

const DRESSED: Record<Dress, string> = { bare: 'bare', chest: 'in his chest item', hat: 'under his hat or helm' };
const POSED: Record<NeckPose, string> = { rest: 'at rest', aside: 'looking aside' };

/** `model`'s neck and head turned `pose`'s way from where they were built. */
function pose(model: Model, how: NeckPose, rest: { neck: THREE.Euler; head: THREE.Euler }): void {
  const { neck, head } = model.joints!;
  neck.rotation.copy(rest.neck);
  head.rotation.copy(rest.head);
  if (how === 'aside') {
    neck.rotation.y += LOOK_ASIDE.neck;
    head.rotation.y += LOOK_ASIDE.head;
    head.rotation.x += LOOK_ASIDE.bow;
  }
  model.root.updateMatrixWorld(true);
}

/** `model`'s neck pictured in the studio from each view, as `look` draws it. */
function pictureOf(lab: Lab, model: Model, look: Look): Tile[] {
  const scene = studio();
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  const { neck, head } = model.joints!;
  const base = neck.getWorldPosition(new THREE.Vector3());
  const top = head.getWorldPosition(new THREE.Vector3()).y + FRAME.above;
  const box = new THREE.Box3(
    new THREE.Vector3(base.x - FRAME.across, base.y - FRAME.below, base.z - FRAME.across),
    new THREE.Vector3(base.x + FRAME.across, top, base.z + FRAME.across),
  );
  const shots: Shot[] = VIEWS.map((view) => ({ name: view.name, camera: cameraOn(box, view.from) }));
  const worn = wearLook(look, meshesOf(model.root));
  try {
    return shoot(lab, scene, shots).tiles;
  } finally {
    worn();
    scene.remove(model.root);
  }
}

/** Each hero's neck read and pictured in each dress and pose. */
export async function neck(lab: Lab, options: NeckOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const id of options.classes) {
    const cls = CLASSES[id];
    if (!cls) throw new Error(`lab: neck: no hero ${id} (${Object.keys(CLASSES).join(', ')})`);
    const model = buildModel(cls.model);
    const { neck: neckJoint, head } = model.joints!;
    const rest = { neck: neckJoint.rotation.clone(), head: head.rotation.clone() };
    try {
      for (const dress of options.dresses) {
        model.setGear?.(gearFor(dress));
        for (const how of options.poses) {
          pose(model, how, rest);
          const what = `${id} ${DRESSED[dress]}, ${POSED[how]}`;
          const slices = sliceNeck(model);
          const found = verdicts(what, slices);
          lines.push(...found.lines);
          problems.push(...found.problems);
          if (options.canary) {
            const caught = canaries(what, model, slices);
            lines.push(...caught.lines);
            problems.push(...caught.problems);
          }
          moments.push({ label: what, tiles: pictureOf(lab, model, options.look), notes: found.lines });
        }
      }
    } finally {
      model.dispose();
    }
  }
  return { text: lines.join('\n'), problems, moments };
}
