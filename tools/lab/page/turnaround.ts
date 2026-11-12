// tools/lab turnaround: the hero standing as the game has him, in a plain, lit studio, from the four sides a character
// sheet's turnaround shows (his front, three-quarters to his right, his right side and his back) and his head close from
// the front, his right side, three-quarters to his left and behind (a hood is judged all round, as a sheet shows it;
// from his right front the staff came between), with a reference sheet's panels in a row of their own under ours: a
// hero is rebuilt against such a sheet (the mage's, Codex's realistic render of him), judged part by part beside it
// from the same side, where in a biome the forest's ferns and its light hid what he wore. Each picture says how many
// triangles and meshes he is drawn with.
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { cameraOn, countsOf, shoot, studio, type Shot } from './studio';

export interface TurnaroundOptions {
  fixture: Fixture;
  /** a reference sheet (a picture's data URL) and its panels, each [left, top, right, bottom] in shares of it, in the
   *  order of `VIEWS` (a panel left out leaves its place empty) */
  reference?: { url: string; panels: [number, number, number, number][] };
  /** picture an empty studio too: the measure of what's drawn must find nothing there */
  canary?: boolean;
  /** list his triangles by part too: each shown mesh by the joint it hangs from and its material */
  parts?: boolean;
}

/** The joint a mesh hangs from: the nearest of its ancestors that is one of the hero's joints, by its name there. */
function jointOf(mesh: THREE.Object3D, names: Map<THREE.Object3D, string>): string {
  for (let o: THREE.Object3D | null = mesh.parent; o; o = o.parent) {
    const name = names.get(o);
    if (name) return name;
  }
  return '(root)';
}

/** What a material is called: its name, else its kind and colour. */
function materialName(material: THREE.Material | undefined): string {
  if (!material) return '?';
  if (material.name) return material.name;
  const colour = (material as THREE.MeshStandardMaterial).color;
  return `${material.type.replace(/^Mesh|Material$/g, '')}${colour ? ` #${colour.getHexString()}` : ''}`;
}

/** His shown triangles by part, most first: each row a joint and a material, with its share of the whole. */
function partsOf(lab: Lab, root: THREE.Object3D, total: number): string[] {
  const joints = lab.joints as unknown as Record<string, THREE.Object3D>;
  const names = new Map(lab.jointNames().map((name) => [joints[name], name] as const));
  const rows = new Map<string, { triangles: number; meshes: number }>();
  root.traverseVisible((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const triangles = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const what = mesh.name || materialName(material);
    const key = `${jointOf(mesh, names)} · ${what}${mesh.userData.drawsAlone ? ' (alone)' : ''}`;
    const row = rows.get(key) ?? { triangles: 0, meshes: 0 };
    row.triangles += triangles;
    row.meshes++;
    rows.set(key, row);
  });
  return [...rows].sort((a, b) => b[1].triangles - a[1].triangles).map(([key, row]) =>
    `  ${row.triangles.toLocaleString('en').padStart(7)}  ${((row.triangles / total) * 100).toFixed(1).padStart(5)}%  ${key}`
    + (row.meshes > 1 ? ` (${row.meshes} meshes)` : ''));
}

/** A side the studio's camera looks at him from (the hero facing +z, his left +x), and what it frames. */
interface View {
  name: string;
  from: THREE.Vector3Tuple;
  frames: 'body' | 'head';
}

const VIEWS: View[] = [
  { name: 'front', from: [0, 0.05, 1], frames: 'body' },
  { name: 'quarter', from: [-0.7, 0.05, 0.7], frames: 'body' },
  { name: 'right', from: [-1, 0.05, 0], frames: 'body' },
  { name: 'back', from: [0, 0.05, -1], frames: 'body' },
  { name: 'face', from: [0, 0, 1], frames: 'head' },
  { name: 'profile', from: [-1, 0, 0], frames: 'head' },
  { name: 'head, quarter', from: [0.7, 0, 0.7], frames: 'head' },
  { name: 'head, back', from: [0, 0, -1], frames: 'head' },
];

/** what a head close-up frames round the head's joint (m): across, below it (the cowl, the collar), above it */
const HEAD_FRAME = { across: 0.16, below: 0.14, above: 0.26 };
/** the least share of a picture the hero must cover to count as drawn, and the most an empty studio may read */
const LEAST_DRAWN = 0.02;

/** The hero's model taken out of the world into `scene`, standing at its middle facing +z; `back` puts it back. */
function intoStudio(lab: Lab, scene: THREE.Scene): { root: THREE.Object3D; back: () => void } {
  const root = lab.model.root;
  const parent = root.parent;
  // (his own place under the player's object, which carries where he stands and his facing, is kept)
  scene.add(root);
  root.updateMatrixWorld(true);
  return {
    root,
    back: () => {
      parent?.add(root);
      root.updateMatrixWorld(true);
    },
  };
}

/** The box a view frames: his whole figure (the staff or the bow with it), or round his head. */
function frameOf(lab: Lab, root: THREE.Object3D, view: View): THREE.Box3 {
  if (view.frames === 'body') return new THREE.Box3().setFromObject(root);
  const head = lab.joints.head.getWorldPosition(new THREE.Vector3());
  return new THREE.Box3(
    new THREE.Vector3(head.x - HEAD_FRAME.across, head.y - HEAD_FRAME.below, head.z - HEAD_FRAME.across),
    new THREE.Vector3(head.x + HEAD_FRAME.across, head.y + HEAD_FRAME.above, head.z + HEAD_FRAME.across),
  );
}

/** An image from a data URL, loaded. */
async function imageOf(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** A tile the size of `like`, the studio's grey, and its canvas to draw on. */
function blankTile(like: Tile): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = like.width;
  canvas.height = like.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#5a5f66';
  context.fillRect(0, 0, like.width, like.height);
  return { canvas, context };
}

/** The reference's panel cut out and fitted, whole and centred, into a tile the size of `like`. */
function panelTile(image: HTMLImageElement, panel: [number, number, number, number], like: Tile, name: string): Tile {
  const [left, top, right, bottom] = panel;
  const sx = left * image.naturalWidth;
  const sy = top * image.naturalHeight;
  const sw = (right - left) * image.naturalWidth;
  const sh = (bottom - top) * image.naturalHeight;
  const scale = Math.min(like.width / sw, like.height / sh);
  const { canvas, context } = blankTile(like);
  const width = sw * scale;
  const height = sh * scale;
  context.drawImage(image, sx, sy, sw, sh, (like.width - width) / 2, (like.height - height) / 2, width, height);
  return { view: name, png: canvas.toDataURL('image/png'), width: like.width, height: like.height };
}

/** The reference's row: a tile a panel, in the views' order, each the size of ours beside it; an empty one left
 *  empty, so each panel after it stays under its view of ours (dropped, the row closed up under the wrong views). */
async function referenceRow(reference: NonNullable<TurnaroundOptions['reference']>, ours: Tile[]): Promise<Tile[]> {
  const image = await imageOf(reference.url);
  const lastPanel = reference.panels.length - 1;
  return ours.slice(0, lastPanel + 1).map((tile, k) => {
    const panel = reference.panels[k];
    if (panel) return panelTile(image, panel, tile, `${tile.view} (reference)`);
    const { canvas } = blankTile(tile);
    return { view: `${tile.view} (none)`, png: canvas.toDataURL('image/png'), width: tile.width, height: tile.height };
  });
}

/** The hero as he stands, pictured in the studio from each of `VIEWS`, beside the reference's panels. */
export async function turnaround(lab: Lab, options: TurnaroundOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const scene = studio();
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const placed = intoStudio(lab, scene);
  try {
    const shots: Shot[] = VIEWS.map((view) => ({
      name: view.name,
      camera: cameraOn(frameOf(lab, placed.root, view), view.from),
    }));
    const { tiles, least } = shoot(lab, scene, shots);
    const { triangles, meshes } = countsOf(placed.root);
    const counts = `${triangles.toLocaleString('en')} triangles in ${meshes} meshes shown`;
    lines.push(`${lab.player.cls.id}: ${counts}`);
    if (options.parts) lines.push(...partsOf(lab, placed.root, triangles));
    if (least < LEAST_DRAWN) problems.push(`the hero covers ${(least * 100).toFixed(1)}% of a picture: not drawn`);
    moments.push({ label: `${lab.player.cls.id} as he stands`, tiles, notes: [counts] });
    if (options.reference) {
      moments.push({ label: 'the reference', tiles: await referenceRow(options.reference, tiles), notes: [] });
    }
    if (options.canary) {
      scene.remove(placed.root);
      const { most } = shoot(lab, scene, shots);
      const read = `the canary's empty studio read as ${(most * 100).toFixed(1)}% drawn`;
      if (most >= LEAST_DRAWN) problems.push(read);
      else lines.push(read);
    }
  } finally {
    placed.back();
  }
  return { text: lines.join('\n'), problems, moments };
}
