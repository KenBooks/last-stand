// `lab winding`: which way the game's faces point (tools/lab). Every model (the heroes, the foes, the dummy) built
// afresh, the library's scholar as he sits, and every biome's props, each mesh split into its parts and each part judged by its signed volume
// (page/windingParts.ts): out, in, or open. A part wound inside out shows its inside wherever its material draws one
// side only: the forest's roots, `taperTube`s wound inwards, drew as black lines on the floor (#289). On a
// double-sided material three turns a back face's normal to the camera, which hides it, so those are listed apart
// and aren't problems. A mesh drawn by its back faces (a sky dome) is seen from inside on purpose and isn't judged.
// A mirrored mesh needs nothing of its own: three turns its front-face test round, so its geometry's winding decides.
// `--canary` plants a box wound inside out, one sided, in the first biome: it must be found.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { MODELS } from '../../../src/entities/models';
import { facingOf, partsOf, type Part } from './windingParts';

export interface WindingOptions {
  /** the models read (every one by default) */
  models?: string[];
  /** the biomes read (every one by default) */
  biomes?: BiomeId[];
  canary: boolean;
}

const CANARY_NAME = 'winding canary';
/** the library's scholar, read as a model by this name (`--models scholar`) */
const SCHOLAR = 'scholar';
/** the parts named a subject at most */
const NAMED = 12;

/** A part read wrong way out: the mesh it's in, its size, where it is (m, in its subject), and whether its
 *  material shows it. */
interface Wrong {
  mesh: string;
  triangles: number;
  at: string;
  shown: boolean;
}

/** What a subject's meshes held: its parts judged, and those wound inside out. */
interface Read {
  judged: number;
  open: number;
  wrong: Wrong[];
}

/** A mesh's name: its own, else its material's kind and colour and the name up its parents (a creature's merged
 *  meshes have none of their own). */
function nameOf(mesh: THREE.Mesh, material: THREE.Material): string {
  if (mesh.name) return mesh.name;
  const colour = (material as THREE.MeshStandardMaterial).color;
  const look = `${material.type}${colour ? ` #${colour.getHexString()}` : ''}`;
  for (let at = mesh.parent; at; at = at.parent) if (at.name) return `${look} in ${at.name}`;
  return look;
}

/** The material that draws triangle `triangle` of `mesh`. */
function materialAt(mesh: THREE.Mesh, triangle: number): THREE.Material {
  if (!Array.isArray(mesh.material)) return mesh.material;
  const at = triangle * 3;
  const group = mesh.geometry.groups.find((each) => at >= each.start && at < each.start + each.count);
  return mesh.material[group?.materialIndex ?? 0];
}

/** `subject`'s meshes read, each geometry once. */
function readOf(subject: THREE.Object3D): Read {
  const read: Read = { judged: 0, open: 0, wrong: [] };
  subject.updateMatrixWorld(true);
  const toSubject = subject.matrixWorld.clone().invert();
  const seen = new Set<THREE.BufferGeometry>();
  subject.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.attributes.position || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const index = mesh.geometry.index;
    for (const part of partsOf(mesh.geometry.attributes.position.array, index ? index.array : null)) {
      const facing = facingOf(part);
      const material = materialAt(mesh, part.first);
      if (facing === 'open' || material.side === THREE.BackSide) {
        read.open++;
        continue;
      }
      read.judged++;
      if (facing !== 'in') continue;
      const shown = material.side !== THREE.DoubleSide;
      const at = new THREE.Vector3().fromArray(part.middle).applyMatrix4(mesh.matrixWorld).applyMatrix4(toSubject);
      const where = at.toArray().map((value) => value.toFixed(2)).join(', ');
      read.wrong.push({ mesh: nameOf(mesh, material), triangles: part.triangles, at: where, shown });
    }
  });
  return read;
}

/** A subject's line and its problems: the parts that show their inside, then those a double-sided material hides. */
function linesOf(name: string, read: Read): { lines: string[]; problems: string[] } {
  const shown = read.wrong.filter((part) => part.shown);
  const hidden = read.wrong.filter((part) => !part.shown);
  const judged = `${read.judged} parts judged (${read.open} open or seen from inside)`;
  const wrong = `${shown.length} inside out and shown, ${hidden.length} inside out on a double-sided material`;
  const lines = [`${name}: ${judged}, ${wrong}`];
  const describe = (part: Wrong) => `${part.mesh} (${part.triangles} triangles at ${part.at})`;
  if (shown.length) lines.push(`  shown inside out: ${tally(shown.map(describe))}`);
  if (hidden.length) lines.push(`  inside out, hidden by both sides drawn: ${tally(hidden.map(describe))}`);
  const problems = shown.length ? [`${name}: ${shown.length} parts show their inside (${shown[0].mesh} first)`] : [];
  return { lines, problems };
}

/** `names` counted alike and listed, the most first, the first `NAMED`. */
function tally(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const listed = sorted.slice(0, NAMED).map(([name, count]) => (count > 1 ? `${name} x${count}` : name));
  const more = sorted.length > NAMED ? `, and ${sorted.length - NAMED} more` : '';
  return listed.join(', ') + more;
}

/** A box wound inside out, drawn one sided: the canary's. */
function canaryBox(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const second = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, second);
  }
  const box = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  box.name = CANARY_NAME;
  return box;
}

/** `lab winding`: every model's and biome's parts judged by which way their faces point. */
export async function winding(lab: Lab, options: WindingOptions): Promise<Report> {
  await lab.setup({});
  const lines: string[] = [];
  const problems: string[] = [];
  const add = (name: string, read: Read) => {
    const found = linesOf(name, read);
    lines.push(...found.lines);
    problems.push(...found.problems);
  };
  for (const id of options.models ?? Object.keys(MODELS)) if (id !== SCHOLAR) add(id, readOf(MODELS[id]().root));
  // (the library's scholar: no model of MODELS, he's seated in his room once the heroes' heads are made)
  if (!options.models || options.models.includes(SCHOLAR)) {
    const folk = G.arena.rooms?.library.folk?.();
    if (folk) add(SCHOLAR, readOf(folk.root));
    else problems.push('the library has no scholar seated to read');
  }
  const biomes = options.biomes ?? [...BIOME_IDS];
  let caught: boolean | null = null;
  for (const biome of biomes) {
    const group = G.arena.groupOf(biome);
    const canary = options.canary && caught === null ? canaryBox() : null;
    if (canary) group.add(canary);
    let read: Read;
    try {
      read = readOf(group);
    } finally {
      canary?.removeFromParent();
    }
    if (canary) {
      caught = read.wrong.some((part) => part.mesh === CANARY_NAME && part.shown);
      read.wrong = read.wrong.filter((part) => part.mesh !== CANARY_NAME);
    }
    add(biome, read);
  }
  if (caught === null) return { text: lines.join('\n'), problems };
  lines.push(`canary: the box wound inside out ${caught ? 'found' : 'went unseen'}`);
  if (!caught) problems.push('canary: a box wound inside out, drawn one sided, went unseen');
  return { text: lines.join('\n'), problems };
}
