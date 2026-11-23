// tools/lab looks: the frame drawn other ways than the player sees it, as a modelling tool's viewport can show it:
// the hero's wireframe, which way his faces point (front blue, back red: a face wound inside out shows red), each of
// his parts in a flat colour of its own with the share of the frame it covers and where, and his skeleton drawn over
// the frame as the player sees it. (Each question of where a part was on the screen took a probe of its own.)
//
// In the first three the world keeps its own materials but draws only its depth, so what the game draws in front
// of him (a leaf card cut out by its texture, a prop dissolved round him) still hides him, and nothing more: drawn
// flat, the forest's leaf cards were whole squares, and one by a close-up's camera filled its frame.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as gameRenderer from '../../../src/core/renderer';
import type { Joints } from '../../../src/entities/models/rig';
import { readOpaque, type Area } from './pixels';

export const LOOKS = ['lit', 'wire', 'faces', 'parts', 'bones'] as const;
export type Look = (typeof LOOKS)[number];

/** A part of the hero in the frame, in the `parts` look: what it is, its colour there, the share of the picture it
 *  covers and its box (shares of the picture across and down: left, top, right, bottom). */
export interface PartOnScreen {
  name: string;
  colour: string;
  share: number;
  box: [number, number, number, number];
}

/** behind the hero in the flat looks */
const SKY = new THREE.Color(0x101114);
/** the faces' colours: the front of a face, and its back */
const FRONT = new THREE.Color(0x3d6fe0);
const BACK = new THREE.Color(0xe0402e);
/** how far a pixel's channels may be from a part's colour and still count as it (0-255; an edge blends two) */
const PART_SLACK = 2;
/** the skeleton's lines and joints over the frame, and the joints it names */
const BONE_COLOUR = '#ffe14d';
const JOINT_RADIUS = 4;
const NAMED_JOINTS = ['head', 'chest', 'hips', 'handL', 'handR', 'elbowL', 'elbowR'];

/** A part's colour in the `parts` look: hues a golden angle apart, at three lightnesses, so neighbours differ. */
export function partColour(index: number): THREE.Color {
  const hue = (index * 137.508) % 360 / 360;
  const lightness = [0.55, 0.7, 0.42][index % 3];
  return new THREE.Color().setHSL(hue, 0.75, lightness, THREE.SRGBColorSpace);
}

/** A part's cut-out: the texture whose alpha cuts its shape (a hair card's), and where. */
interface Cut {
  map: THREE.Texture;
  alphaTest: number;
}

/** The cut-out `material` draws with, if it has one. */
function cutOf(material: THREE.Material): Cut | null {
  const { map, alphaTest } = material as THREE.MeshStandardMaterial;
  return alphaTest > 0 && map ? { map, alphaTest } : null;
}

/** A flat, unlit material of `colour`, drawn as it is (no tone mapping) on both sides, cut out as `cut` says. */
function flat(colour: THREE.Color, wireframe = false, cut: Cut | null = null): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: colour, wireframe, toneMapped: false, side: THREE.DoubleSide });
  if (!cut) return material;
  material.map = cut.map;
  material.alphaTest = cut.alphaTest;
  // (the texture's alpha alone: its colours would change the part's, by which it's found in the picture)
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      'diffuseColor.a *= texture2D( map, vMapUv ).a;',
    );
  };
  return material;
}

/** A face's front blue and its back red (Blender's "face orientation"): the front by the mesh's own material, the
 *  back by a twin of it drawing its back faces alone, whichever is nearer at a pixel shown. One material choosing by
 *  `gl_FrontFacing` was a patch of three's shader, which the engine never runs: every face drew alike, and the hands'
 *  see-through read no skin from inside and the backdrop through the fist from every side. */
function facing(): { front: THREE.MeshBasicMaterial; back: THREE.MeshBasicMaterial } {
  return {
    front: new THREE.MeshBasicMaterial({ color: FRONT, side: THREE.FrontSide }),
    back: new THREE.MeshBasicMaterial({ color: BACK, side: THREE.BackSide }),
  };
}

/** A twin of `mesh` drawing its geometry in `material`, beside it under its parent (bound to its skeleton where it's
 *  skinned): what takes it out again. */
function twinOf(mesh: THREE.Mesh, material: THREE.Material): () => void {
  const skinned = mesh as THREE.SkinnedMesh;
  const twin = skinned.isSkinnedMesh
    ? new THREE.SkinnedMesh(mesh.geometry, material)
    : new THREE.Mesh(mesh.geometry, material);
  if (skinned.isSkinnedMesh) (twin as THREE.SkinnedMesh).bind(skinned.skeleton, skinned.bindMatrix);
  twin.position.copy(mesh.position);
  twin.quaternion.copy(mesh.quaternion);
  twin.scale.copy(mesh.scale);
  twin.layers.mask = mesh.layers.mask;
  twin.visible = mesh.visible;
  mesh.parent?.add(twin);
  twin.updateMatrixWorld(true);
  return () => twin.removeFromParent();
}

/** Whether `object` is drawn but isn't a mesh: particles, a line, a sprite. */
function isDrawnOther(object: THREE.Object3D): boolean {
  const drawn = object as THREE.Points & THREE.Line & THREE.Sprite;
  return Boolean(drawn.isPoints || drawn.isLine || drawn.isSprite);
}

/** What a look changed on the scene, put back after its draw. */
interface Changes {
  /** puts the subject's meshes back in what they wore */
  worn: () => void;
  /** the world's materials drawing their depth alone */
  colourless: Set<THREE.Material>;
  hidden: THREE.Object3D[];
  background: THREE.Scene['background'];
  fog: THREE.Scene['fog'];
}

/** The meshes of `subject` that would be drawn, in the order they're found. */
export function meshesOf(subject: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  subject.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  return meshes;
}

/** A mesh's materials, one or more. */
const materialsOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * The scene dressed for `look` (wire, faces or parts): `subject`'s meshes in the look's materials (the parts' colour
 * each its index in `meshes`), every other mesh its depth alone, what isn't a mesh (particles, sprites, lines)
 * hidden, the sky a flat dark. Returns what to put back.
 */
function dress(look: Look, meshes: THREE.Mesh[]): Changes {
  const scene = G.scene;
  const changes: Changes = {
    worn: wearLook(look, meshes),
    colourless: new Set(),
    hidden: [],
    background: scene.background,
    fog: scene.fog,
  };
  const subject = new Set(meshes);
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      if (isDrawnOther(object)) changes.hidden.push(object);
      return;
    }
    if (subject.has(mesh)) return;
    for (const material of materialsOf(mesh)) if (material.colorWrite) changes.colourless.add(material);
  });
  for (const material of changes.colourless) material.colorWrite = false;
  for (const object of changes.hidden) object.visible = false;
  scene.background = SKY;
  scene.fog = null;
  return changes;
}

function undress(changes: Changes): void {
  changes.worn();
  for (const material of changes.colourless) material.colorWrite = true;
  for (const object of changes.hidden) object.visible = true;
  G.scene.background = changes.background;
  G.scene.fog = changes.fog;
}

/**
 * `meshes` in `look`'s materials (wire, faces or parts: each part the colour of its index in `meshes`; as they are,
 * lit), and nothing else changed: what puts them back in what they wore.
 */
export function wearLook(look: Look, meshes: THREE.Mesh[]): () => void {
  if (look === 'lit' || look === 'bones') return () => {};
  const worn = meshes.map((mesh) => mesh.material);
  const made: THREE.Material[] = [];
  const twins: (() => void)[] = [];
  const faces = facing();
  made.push(faces.front, faces.back);
  meshes.forEach((mesh, i) => {
    if (look === 'faces') {
      mesh.material = faces.front;
      twins.push(twinOf(mesh, faces.back));
      return;
    }
    const own = flat(partColour(i), look === 'wire', cutOf(materialsOf(mesh)[0]));
    made.push(own);
    mesh.material = own;
  });
  return () => {
    for (const untwin of twins) untwin();
    meshes.forEach((mesh, i) => {
      mesh.material = worn[i];
    });
    for (const material of made) material.dispose();
  };
}

/** The camera that draws `mesh` this frame: the hero's arms' own through the eyes (renderer.ts `armsCamera`, on a
 *  layer of their own), else the game's; none for a mesh on a layer neither draws. */
export function lensOf(mesh: THREE.Object3D): THREE.Camera | null {
  if (G.camera.layers.test(mesh.layers)) return G.camera;
  const arms = armsLens();
  return arms.layers.test(mesh.layers) ? arms : null;
}

/** The camera the hero's arms are drawn with: their own through the eyes, else the game's (a tree whose renderer
 *  has no `armsCamera` draws them with the game's). */
export function armsLens(): THREE.Camera {
  const own = (gameRenderer as { armsCamera?: () => THREE.Camera }).armsCamera;
  return own?.() ?? G.camera;
}

/** The arms drawn by their own camera over what's drawn already, as the game draws them: depth cleared first, no
 *  background. */
function drawArmsOver(arms: THREE.Camera): void {
  const renderer = G.renderer;
  const { autoClear } = renderer;
  const background = G.scene.background;
  renderer.autoClear = false;
  G.scene.background = null;
  try {
    renderer.clearDepth();
    renderer.render(G.scene, arms);
  } finally {
    renderer.autoClear = autoClear;
    G.scene.background = background;
  }
}

/**
 * The frame drawn as `look` (wire, faces or parts) has it with the game's camera as it is now, `subject` the part
 * of the scene the look is of, read back within `area` as an opaque picture. With `parts`, also each of `subject`'s
 * meshes in it (`named` names them), the most first.
 */
export function drawLook(look: Look, subject: THREE.Object3D, area: Area, named: (mesh: THREE.Mesh) => string):
  { image: ImageData; parts: PartOnScreen[] } {
  return drawLookOf(look, meshesOf(subject), area, named);
}

/** The frame drawn as `look` has it (`drawLook`), its subject `meshes` (a prop's, from anywhere in the scene). */
export function drawLookOf(look: Look, meshes: THREE.Mesh[], area: Area, named: (mesh: THREE.Mesh) => string):
  { image: ImageData; parts: PartOnScreen[] } {
  const changes = dress(look, meshes);
  const renderer = G.renderer;
  try {
    renderer.setRenderTarget(null);
    renderer.render(G.scene, G.camera);
    const arms = armsLens();
    if (arms !== G.camera) drawArmsOver(arms);
  } finally {
    undress(changes);
  }
  const image = readOpaque(area);
  const parts = look === 'parts' ? partsIn(image, meshes, named) : [];
  return { image, parts };
}

/** Each pixel of `image` (drawn in the `parts` look, rows from the top) as the index in `meshes` of the part it
 *  shows, -1 where none does. */
export function partAt(image: ImageData, meshes: THREE.Mesh[]): Int32Array {
  const partOf = partsByPixel(meshes.map((_, i) => partColour(i)));
  const { data } = image;
  const parts = new Int32Array(data.length / 4);
  for (let pixel = 0; pixel < parts.length; pixel++) {
    const k = pixel * 4;
    parts[pixel] = partOf.get(packed(data[k], data[k + 1], data[k + 2])) ?? -1;
  }
  return parts;
}

/** Each of `meshes` found in `image` (drawn in the `parts` look), by the share of it it covers, the most first. */
function partsIn(image: ImageData, meshes: THREE.Mesh[], named: (mesh: THREE.Mesh) => string): PartOnScreen[] {
  const colours = meshes.map((_, i) => partColour(i));
  const parts = partAt(image, meshes);
  const tally = meshes.map(() => ({ count: 0, left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }));
  const { width, height } = image;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = parts[y * width + x];
      if (i < 0) continue;
      const part = tally[i];
      part.count++;
      part.left = Math.min(part.left, x);
      part.right = Math.max(part.right, x + 1);
      part.top = Math.min(part.top, y);
      part.bottom = Math.max(part.bottom, y + 1);
    }
  }
  const found: PartOnScreen[] = [];
  tally.forEach((part, i) => {
    if (part.count === 0) return;
    found.push({
      name: named(meshes[i]),
      colour: `#${colours[i].getHexString()}`,
      share: part.count / (width * height),
      box: [part.left / width, part.top / height, part.right / width, part.bottom / height],
    });
  });
  return found.sort((a, b) => b.share - a.share);
}

/** the parts a picture's notes name, the most first */
const PARTS_NAMED = 8;

/** `parts` (a picture's, the most first) as a note: each one's share of the picture and its box there. */
export function describeParts(parts: PartOnScreen[], count = PARTS_NAMED): string {
  if (parts.length === 0) return 'none of the hero';
  const percent = (share: number) => `${Math.round(share * 100)}%`;
  const named = parts.slice(0, count).map((part) => {
    const [left, top, right, bottom] = part.box.map(percent);
    const share = (part.share * 100).toFixed(1);
    return `${part.name} (${part.colour}) ${share}%, across ${left}-${right}, down ${top}-${bottom}`;
  });
  const more = parts.length > count ? `; ${parts.length - count} more` : '';
  return named.join('; ') + more;
}

/** A pixel's colour as one number. */
const packed = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/** Each part by the pixels that are its colour (`colours`, by index), each channel within `PART_SLACK` of it: a
 *  pixel looked up once, where matched against every part's colour a picture took 10 s to read. */
function partsByPixel(colours: THREE.Color[]): Map<number, number> {
  const parts = new Map<number, number>();
  colours.forEach((colour, i) => {
    const shown = colour.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    const [r, g, b] = [shown.r, shown.g, shown.b].map((channel) => Math.round(channel * 255));
    for (let dr = -PART_SLACK; dr <= PART_SLACK; dr++) {
      for (let dg = -PART_SLACK; dg <= PART_SLACK; dg++) {
        for (let db = -PART_SLACK; db <= PART_SLACK; db++) {
          const channels = [r + dr, g + dg, b + db];
          if (channels.some((channel) => channel < 0 || channel > 255)) continue;
          const key = packed(channels[0], channels[1], channels[2]);
          if (!parts.has(key)) parts.set(key, i);
        }
      }
    }
  });
  return parts;
}

/** What a mesh of the hero is, for the `parts` look: the nearest of it and its parents with a name (its own, or a
 *  joint's), and its material (its kind and colour). */
export function partName(mesh: THREE.Mesh, joints: Map<THREE.Object3D, string>): string {
  let named: THREE.Object3D | null = mesh;
  while (named && !named.name && !joints.has(named)) named = named.parent;
  const owner = named ? named.name || joints.get(named)! : 'the scene';
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const colour = (material as THREE.MeshStandardMaterial).color;
  const kind = material.type.replace(/^Mesh/, '').replace(/Material$/, '').toLowerCase();
  return `${owner}: ${kind}${colour ? ` #${colour.getHexString()}` : ''}`;
}

/** Each joint of `joints` with the joint it hangs from (the nearest of its parents that is one), the root's none. */
function bonesOf(joints: Joints): { name: string; joint: THREE.Object3D; parent: THREE.Object3D | null }[] {
  const named = jointsByObject(joints);
  return [...named].map(([joint, name]) => {
    let parent = joint.parent;
    while (parent && !named.has(parent)) parent = parent.parent;
    return { name, joint, parent };
  });
}

/** The joints of `joints` by their objects. */
export function jointsByObject(joints: Joints): Map<THREE.Object3D, string> {
  const named = new Map<THREE.Object3D, string>();
  for (const [name, value] of Object.entries(joints)) {
    if (value instanceof THREE.Object3D && !(value as THREE.Mesh).isMesh) named.set(value, name);
  }
  return named;
}

/** Where `point` (the world) is in `area` of the frame through `camera`, px; null behind the camera. */
function onFrame(point: THREE.Vector3, camera: THREE.Camera, area: Area, ratio: number): THREE.Vector2 | null {
  const ndc = point.clone().project(camera);
  if (ndc.z > 1 || ndc.z < -1) return null;
  const x = ((ndc.x + 1) / 2 * innerWidth - area.left) * ratio;
  const y = ((1 - ndc.y) / 2 * innerHeight - area.top) * ratio;
  return new THREE.Vector2(x, y);
}

/** `canvas` (a picture of `area` of the frame) with `joints`' skeleton drawn over it: each bone a line, each joint
 *  a dot, the main ones named. */
export function withBones(canvas: HTMLCanvasElement, joints: Joints, area: Area): HTMLCanvasElement {
  const context = canvas.getContext('2d')!;
  const ratio = canvas.width / area.width;
  context.strokeStyle = BONE_COLOUR;
  context.fillStyle = BONE_COLOUR;
  context.lineWidth = 2;
  context.font = `${Math.round(12 * ratio)}px sans-serif`;
  // (through the eyes only the arms are drawn, by their own camera)
  const camera = armsLens();
  const at = (object: THREE.Object3D) => onFrame(object.getWorldPosition(new THREE.Vector3()), camera, area, ratio);
  for (const { name, joint, parent } of bonesOf(joints)) {
    const point = at(joint);
    if (!point) continue;
    const from = parent ? at(parent) : null;
    if (from) {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.beginPath();
    context.arc(point.x, point.y, JOINT_RADIUS * ratio, 0, Math.PI * 2);
    context.fill();
    if (NAMED_JOINTS.includes(name)) context.fillText(name, point.x + 6 * ratio, point.y - 6 * ratio);
  }
  return canvas;
}
