// tools/lab herolooks: each class's looks and the hair colours (data/heroLooks.ts) as the game builds them. Each look is
// made by the workers (`readyLook`, game/looks.ts) and a hero built in it, as the hall builds one when it's picked: his
// head must come whole from the workers (nothing sculpted on the page), its face, hair and beard where the look has
// them, and drawn in the game's frame he must compile no program. Each is pictured in the studio, his head close and
// his figure. Each hair colour must show on the hair's cards, the brows and the beard alike (pictured with the cards
// hidden, the face's own paint compared between two colours above the mouth and below it), and nowhere else; a look
// picked must be kept in the profile and come back as the slot's look. `--canary` plants a hair colour that leaves the
// face's paint alone, the cards' colour unchanged and a look not kept: each must be caught.
import * as THREE from 'three';
import type { Lab, Pictured, Report, Tile } from './lab';
import { G } from '../../../src/state';
import { CLASSES, CLASS_IDS } from '../../../src/data/classes/index';
import { HAIR_COLOURS, looksOf, type HeroLook, type HeroLookDef } from '../../../src/data/heroLooks';
import { FACES, LOOKS } from '../../../src/entities/models/face';
import { headFor, headsMadeHere } from '../../../src/entities/models/head';
import { heroDetail } from '../../../src/entities/models/armor';
import { Player } from '../../../src/entities/player';
import { chooseLooks, lookHead, pickLook, profileLook, readyLook } from '../../../src/game/looks';
import { loadProfile } from '../../../src/loot/profile';
import { saveSlot } from '../../../src/loot/saveSlots';
import { lateCompiles, programsCompiledInGame } from '../../../src/core/shaders';
import { frameRect } from '../../../src/core/renderer';
import { cameraOn, countsOf, shoot, studio, type Shot } from './studio';
import { opaqueRows } from './pixels';

export interface HeroLooksOptions {
  /** the classes to read (every class by default) */
  classes?: string[];
  /** plant the faults the measure is for: each must be caught */
  canary?: boolean;
}

/** what a head close-up frames round the head's joint (m): across, below it, above it */
const HEAD_FRAME = { across: 0.15, below: 0.12, above: 0.25 };
/** how far a pixel's channel must move between two hair colours to count as changed (0-255) */
const CHANGED = 12;
/** the least share of the face's picture above the mouth (the brows, the scalp's paint) and below it (the beard)
 *  that two hair colours must change; and of the head from behind, the hair's cards */
const LEAST_CHANGED = { brows: 0.01, beard: 0.01, cards: 0.05 };
/** the most share of the face's picture between the eyes and the mouth's sides (the cheeks: bare skin) a hair colour
 *  may change, as only hair may */
const CHEEKS_MOST = 0.02;
/** the two colours compared: the darkest and the lightest */
const DARK = 'black';
const LIGHT = 'white';
/** the colours one hero is pictured in, his own first */
const SHOWN_COLOURS: (string | null)[] = [null, 'black', 'auburn', 'ginger', 'blond', 'grey'];
/** where the hero stands in the game's frame to be drawn by it (beside the lobby's own hero) */
const BESIDE = new THREE.Vector3(1.4, 0, 0.6);

/** A hero of class `id` in look `look`, as the hall builds one, posed at rest at `at` facing +z, bareheaded (a hat or a
 *  hood hides the hair: his class's gear but its helm). */
function heroIn(id: string, look: HeroLook, at: THREE.Vector3): Player {
  const { head: _hat, ...bareheaded } = loadProfile(id).equipped;
  const player = new Player(id, bareheaded, false, undefined, look);
  player.quiet = true;
  player.spawn.copy(at);
  player.reset();
  Object.assign(player.remote, { x: at.x, z: at.z, vx: 0, vz: 0, f: 0, ax: at.x, az: at.z + 4 });
  player.place(at, 0);
  for (let step = 0; step < 6; step++) player.update(0.2);
  player.obj.updateMatrixWorld(true);
  return player;
}

/** The box round `player`'s head (his head joint's world place). */
function headBox(player: Player): THREE.Box3 {
  const head = player.model.joints!.head.getWorldPosition(new THREE.Vector3());
  return new THREE.Box3(
    new THREE.Vector3(head.x - HEAD_FRAME.across, head.y - HEAD_FRAME.below, head.z - HEAD_FRAME.across),
    new THREE.Vector3(head.x + HEAD_FRAME.across, head.y + HEAD_FRAME.above, head.z + HEAD_FRAME.across),
  );
}

/** what a figure's picture frames round him (m): across, and above his head joint */
const FIGURE_FRAME = { across: 0.55, above: 0.3 };

/** The box round `player`'s figure, from his feet to over his head (by his joints: a box of his meshes took in
 *  what's merged at the scene's origin, and he stood small in its corner). */
function figureBox(player: Player): THREE.Box3 {
  const head = player.model.joints!.head.getWorldPosition(new THREE.Vector3());
  const feet = player.model.root.getWorldPosition(new THREE.Vector3());
  return new THREE.Box3(
    new THREE.Vector3(head.x - FIGURE_FRAME.across, feet.y, head.z - FIGURE_FRAME.across),
    new THREE.Vector3(head.x + FIGURE_FRAME.across, head.y + FIGURE_FRAME.above, head.z + FIGURE_FRAME.across),
  );
}

/** The meshes under `root` named `name` (the head's: `face`, `hair`, `crop`, `beard`). */
function meshesNamed(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name === name) found.push(child as THREE.Mesh);
  });
  return found;
}

/** `scene` drawn by `camera` and read back, the middle of the canvas at a tile's shape as the studio's pictures are
 *  (rows top first, opaque). */
function pixelsOf(lab: Lab, scene: THREE.Scene, camera: THREE.PerspectiveCamera): { data: Uint8ClampedArray; width: number; height: number } {
  const renderer = G.renderer;
  const toneMapping = renderer.toneMapping;
  const drawing = lab.drawing;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // (the lab draws nothing unless it's picturing)
  lab.drawing = true;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  renderer.toneMapping = toneMapping;
  lab.drawing = drawing;
  const gl = renderer.getContext();
  const frame = frameRect();
  const height = frame.height;
  const width = Math.round(height * TILE_SHAPE);
  const left = frame.left + Math.round((frame.width - width) / 2);
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(left, frame.bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  return { data: opaqueRows(raw, width, height).data, width, height };
}

/** A band of a picture's rows and columns, as shares of its height and width. */
interface Band { top: number; bottom: number; left: number; right: number }

/** The share of `band`'s pixels that differ by more than `CHANGED` between two pictures of one size. */
function changedIn(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number, band: Band): number {
  let changed = 0;
  let count = 0;
  for (let y = Math.floor(band.top * height); y < band.bottom * height; y++) {
    for (let x = Math.floor(band.left * width); x < band.right * width; x++) {
      const k = (y * width + x) * 4;
      const off = Math.max(Math.abs(a[k] - b[k]), Math.abs(a[k + 1] - b[k + 1]), Math.abs(a[k + 2] - b[k + 2]));
      if (off > CHANGED) changed++;
      count++;
    }
  }
  return count ? changed / count : 0;
}

/** the studio's tile's shape (width over height: `TILE_SHAPE` in studio.ts) */
const TILE_SHAPE = 340 / 560;
/** the face's picture from the front cut into the brows' band, the cheeks' under the eyes and the beard's round the
 *  mouth and chin (shares of the picture: the head close-up frames the head, `HEAD_FRAME`, the eyes 0.38 down it, the
 *  mouth 0.52, the chin 0.6) */
const BROWS: Band = { top: 0.3, bottom: 0.37, left: 0.3, right: 0.7 };
const CHEEKS: Band = { top: 0.4, bottom: 0.44, left: 0.33, right: 0.4 };
const BEARD: Band = { top: 0.48, bottom: 0.61, left: 0.33, right: 0.67 };
const WHOLE: Band = { top: 0, bottom: 1, left: 0, right: 1 };

/** How much two hair colours change of the face's paint (the hair's cards hidden) and of the cards from behind. */
interface HairChange { brows: number; cheeks: number; beard: number; cards: number }

/** Hair colours `a` and `b` on `player` compared, his face from the front with his hair hidden, his head from behind;
 *  `breakFace` / `breakCards` plant a colour that leaves the face's paint or the cards' colour as it was. */
function hairChange(lab: Lab, player: Player, scene: THREE.Scene, a: string, b: string, plant: { face: boolean; cards: boolean }): HairChange {
  const box = headBox(player);
  const front = cameraOn(box, [0, 0, 1]);
  const behind = cameraOn(box, [0, 0, -1]);
  const cards = [...meshesNamed(player.model.root, 'hair'), ...meshesNamed(player.model.root, 'crop')];
  const beardCards = meshesNamed(player.model.root, 'beard').filter((mesh) => (mesh.material as THREE.Material).alphaTest > 0);
  const picture = (hair: string, camera: THREE.PerspectiveCamera, bare: boolean) => {
    player.setHair(hair);
    if (plant.face) faceShift(player).set(0, 0, 0);
    if (plant.cards) for (const mesh of cards) (mesh.material as THREE.MeshStandardMaterial).color.setRGB(0.3, 0.2, 0.1);
    for (const mesh of [...cards, ...beardCards]) mesh.visible = !bare;
    const pixels = pixelsOf(lab, scene, camera);
    for (const mesh of [...cards, ...beardCards]) mesh.visible = true;
    return pixels;
  };
  const own = player.heroLook.hair;
  const faceA = picture(a, front, true);
  const faceB = picture(b, front, true);
  const backA = picture(a, behind, false);
  const backB = picture(b, behind, false);
  player.setHair(own);
  const { width, height } = faceA;
  return {
    brows: changedIn(faceA.data, faceB.data, width, height, BROWS),
    cheeks: changedIn(faceA.data, faceB.data, width, height, CHEEKS),
    beard: changedIn(faceA.data, faceB.data, width, height, BEARD),
    cards: changedIn(backA.data, backB.data, backA.width, backA.height, WHOLE),
  };
}

/** The face material's hair shift (`KitLooks.hair`, core/materials.ts) on `player`'s head. */
function faceShift(player: Player): THREE.Vector3 {
  const face = meshesNamed(player.model.root, 'face')[0];
  return (face.material as unknown as { kitLooks: { hair: { value: THREE.Vector3 } } }).kitLooks.hair.value;
}

/** A frame of the game run and drawn. */
async function drawnFrame(lab: Lab): Promise<void> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    lab.drawing = drawing;
  }
}

/** What one look read: its lines, problems, and its pictures. */
interface LookRead { lines: string[]; problems: string[]; tiles: Tile[] }

/** Class `id`'s look `def` made, built, drawn in the game's frame and the studio, and its hair colours compared. */
async function readLook(lab: Lab, id: string, def: HeroLookDef, scene: THREE.Scene, canary: boolean): Promise<LookRead> {
  const look: HeroLook = { preset: def.id, hair: null };
  const name = `${id} ${def.id}`;
  const problems: string[] = [];
  await readyLook(id, look);
  // (a frame drawn first: the lab draws none of its own, and its run's first frame drew what the set-up changed)
  await drawnFrame(lab);
  const sculpted = headsMadeHere();
  const compiled = programsCompiledInGame();
  const player = heroIn(id, look, G.player.pos.clone().add(BESIDE));
  const madeHere = headsMadeHere() - sculpted;
  if (madeHere) problems.push(`${name}: ${madeHere} pieces of his head sculpted on the page, not by the workers`);
  if (player.heroLook.preset !== def.id) problems.push(`${name}: built in look ${player.heroLook.preset}`);
  const head = lookHead(id, look);
  const parts = { face: meshesNamed(player.model.root, 'face').length, hair: meshesNamed(player.model.root, 'hair').length,
    beard: meshesNamed(player.model.root, 'beard').length };
  if (!parts.face) problems.push(`${name}: no face`);
  if (head.hair && !parts.hair) problems.push(`${name}: no hair`);
  if (FACES[head.who].beardFull && !parts.beard) problems.push(`${name}: his look's full beard missing`);
  await drawnFrame(lab);
  const late = programsCompiledInGame() - compiled;
  if (late) problems.push(`${name}: ${late} programs compiled drawing him in the game's frame: ${lateCompiles.slice(-late).join('; ')}`);
  const root = player.model.root;
  const home = root.parent;
  scene.add(root);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  try {
    const shots: Shot[] = [
      { name: `${def.name}: face`, camera: cameraOn(headBox(player), [0, 0, 1]) },
      { name: `${def.name}: quarter`, camera: cameraOn(headBox(player), [-0.7, 0, 0.7]) },
      { name: `${def.name}: back`, camera: cameraOn(headBox(player), [0, 0, -1]) },
      { name: `${def.name}: figure`, camera: cameraOn(figureBox(player), [-0.35, 0.05, 1]) },
    ];
    const { tiles } = shoot(lab, scene, shots);
    const change = hairChange(lab, player, scene, DARK, LIGHT, { face: canary, cards: canary });
    const bearded = LOOKS[head.who].beard > 0;
    const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
    // (the head's triangles at the detail he's built at: Very low's heads coarse, `lod` in models/head.ts)
    const headTriangles = countsOf(player.model.joints!.head).triangles;
    const lines = [`${name}: face ${parts.face}, hair ${parts.hair}, beard ${parts.beard}; head ${headTriangles.toLocaleString('en')} `
      + `triangles at detail ${heroDetail().toFixed(2)}; programs drawing him ${late}, `
      + `head pieces sculpted ${madeHere}; ${DARK} against ${LIGHT}: brows ${percent(change.brows)}, beard `
      + `${bearded ? percent(change.beard) : '(none)'}, cheeks ${percent(change.cheeks)}, hair's cards ${percent(change.cards)}`];
    if (change.brows < LEAST_CHANGED.brows) problems.push(`${name}: the hair colour leaves the brows (${percent(change.brows)})`);
    if (bearded && change.beard < LEAST_CHANGED.beard) problems.push(`${name}: the hair colour leaves the beard (${percent(change.beard)})`);
    if (change.cards < LEAST_CHANGED.cards) problems.push(`${name}: the hair colour leaves the hair (${percent(change.cards)})`);
    // (a full beard grows up over the cheeks: theirs are hair)
    const bareCheeks = !FACES[head.who].beardFull;
    if (bareCheeks && change.cheeks > CHEEKS_MOST) problems.push(`${name}: the hair colour changes the bare cheeks (${percent(change.cheeks)})`);
    return { lines, problems, tiles };
  } finally {
    home?.add(root);
    player.dispose();
  }
}

/** One hero of class `id` in his first look pictured face on in each of `SHOWN_COLOURS`. */
async function readColours(lab: Lab, id: string, def: HeroLookDef, scene: THREE.Scene): Promise<Tile[]> {
  const player = heroIn(id, { preset: def.id, hair: null }, new THREE.Vector3());
  const root = player.model.root;
  const home = root.parent;
  scene.add(root);
  root.updateMatrixWorld(true);
  try {
    const box = headBox(player);
    const tiles: Tile[] = [];
    for (const hair of SHOWN_COLOURS) {
      player.setHair(hair);
      const label = hair ? HAIR_COLOURS.find((colour) => colour.id === hair)!.name : 'his own';
      tiles.push(...shoot(lab, scene, [{ name: `${def.name}, ${label}`, camera: cameraOn(box, [0.45, 0, 0.9]) }]).tiles);
    }
    return tiles;
  } finally {
    home?.add(root);
    player.dispose();
  }
}

/** A look picked for the lobby's own class kept in his profile and taken as the slot's look again, then put back; the
 *  canary takes it out of the stored profile, which must be caught. */
function readKept(canary: boolean): { line: string; problems: string[] } {
  const id = G.profile.classId;
  const model = CLASSES[id].model;
  const was = profileLook(G.profile);
  const other = looksOf(model).find((def) => def.id !== was.preset)!;
  const wanted: HeroLook = { preset: other.id, hair: 'auburn' };
  const problems: string[] = [];
  try {
    pickLook(G.profile, wanted);
    if (canary) {
      const stored = loadProfile(id);
      delete stored.look;
      localStorage.setItem(`last-stand.profile.${id}.v1`, JSON.stringify(stored));
    }
    const back = profileLook(loadProfile(id));
    chooseLooks(saveSlot(), id);
    const slotHead = headFor(model);
    if (back.preset !== wanted.preset || back.hair !== wanted.hair) {
      problems.push(`${id}: the look picked came back as ${back.preset}, ${back.hair ?? 'his own hair'}`);
    }
    if (slotHead.who !== lookHead(id, wanted).who) problems.push(`${id}: the slot's look built ${slotHead.who}`);
    return { line: `${id}: picked ${wanted.preset}, auburn; read back ${back.preset}, ${back.hair}; the slot builds ${slotHead.who}`, problems };
  } finally {
    pickLook(G.profile, was);
    chooseLooks(saveSlot(), id);
  }
}

/** Every look of each class read, a moment each, the hair colours on one hero of each, and a pick kept. */
export async function heroLooks(lab: Lab, options: HeroLooksOptions): Promise<Report> {
  await lab.setup({});
  const scene = studio(true);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const id of options.classes ?? CLASS_IDS) {
    const looks = looksOf(CLASSES[id].model);
    const tiles: Tile[] = [];
    for (const def of looks) {
      const read = await readLook(lab, id, def, scene, Boolean(options.canary));
      lines.push(...read.lines);
      problems.push(...read.problems);
      tiles.push(...read.tiles);
    }
    for (let k = 0; k < tiles.length; k += 4) moments.push({ label: `${id}: ${looks[k / 4].name}`, tiles: tiles.slice(k, k + 4), notes: [looks[k / 4].blurb] });
    moments.push({ label: `${id}: hair colours`, tiles: await readColours(lab, id, looks[0], scene), notes: [] });
  }
  const kept = readKept(Boolean(options.canary));
  lines.push(kept.line);
  problems.push(...kept.problems);
  if (options.canary) {
    const missed = ['the face', 'the cards', 'kept'].filter((what) => !problems.some((problem) => problem.includes(
      what === 'the face' ? 'brows' : what === 'the cards' ? 'leaves the hair' : 'came back')));
    const caught = problems.length;
    problems.length = 0;
    if (missed.length) problems.push(`the canary went unseen: ${missed.join(', ')}`);
    else lines.push(`the canary was caught (${caught} problems)`);
  }
  return { text: lines.join('\n'), problems, moments };
}
