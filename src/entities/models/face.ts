// The heroes' head as a signed distance field, in millimetres, sculpted from an average man's
// measurements (ANSUR II: head 228 mm chin to crown, 154 wide, 200 long; eyes halfway down; face in
// thirds). Frame: y up from the chin's underside (menton), z forward from the ear canals, x to the
// character's left. Pure maths, so the loading workers can paint the face maps (core/pbr.ts).
//
// The skin is meshed by casting rays out from inside the skull on a grid that is densest over the face
// (`HeadGrid`); the texture's uvs follow the same grid, so the paint gets the most texels where the
// features are. Features are blended volumes: skull, forehead, brow ridge, sockets with lids riding on
// the eyeballs, nose, lips, chin, jaw, cheekbones.
import { clamp, lerp } from '../../util';
import type { PBRData } from '../../core/pbr';

/** What makes one face differ from another: sizes in mm, prominences as factors (1 = average). */
export interface FaceShape {
  /** half the jaw's width at its angles */
  jaw: number;
  /** chin: half width, and how far forward it juts */
  chin: number; chinFwd: number;
  /** brow ridge prominence */
  brow: number;
  /** cheekbones: prominence */
  cheek: number;
  /** nose: length (nasion to tip), half the nostrils' width, projection, a hump on the bridge */
  noseLen: number; noseW: number; nosePro: number; hump: number;
  /** lip fullness */
  lips: number;
  /** face length below the eyes (scales the lower face), 1 = average */
  long: number;
  /** eye opening height (mm, half) */
  eyeOpen: number;
  /** iris colour (sRGB 0..1) */
  iris: [number, number, number];
  /** how far a short beard stands off the skin, mm */
  beardDepth: number;
  /** a full beard: how much further it stands off the skin at the jaw and the chin (mm), growing from the cheeks down and
   *  hanging below the chin, thinning down the throat (`beardLift`) */
  beardFull?: number;
  /** a high nose bridge (mm): the nose rises straight from between the brows instead of from a dip */
  bridge?: number;
  /** half the width of the nose's ridge (mm, 5.2): a broader one runs straight down to the tip instead of pinching in */
  bridgeW?: number;
  /** the nose's tip, how big and round (1 average) */
  tip?: number;
  /** how much lower the beard's edge comes down across the cheek (mm) */
  beardLine?: number;
  /** a trimmed moustache: how far it curves down to the mouth's corners (mm), thinning there */
  stacheCurve?: number;
  /** how much lower the brows sit (mm), the ridge and the hairs both: close over the eyes */
  browDrop?: number;
  /** hollows under the cheekbones (mm deep) */
  hollow?: number;
  /** half the lower face's width (mm; 54 average): a narrower one tapers to the chin */
  lowerW?: number;
  /** how far out the chewing muscle fills the face's side below the cheekbone (mm, 47) */
  masseter?: number;
  /** the chewing muscle under a measured mask too (its `masseter` the same): the mask rounds off behind the cheekbones
   *  inside a skull far narrower there, and on a clean-shaven face the overhang showed as a dark band to the ear */
  maskMasseter?: boolean;
  /** the cheekbones under a measured mask too (not their arches back to the ears: under narrower temples they stood out
   *  as lumps): the mask's own cheeks, on a clean-shaven face, read flat and blank (the mage) */
  maskCheekbones?: boolean;
  /** the top of the neck under the jaw: half its width (mm, 57), its middle's depth (mm, -8) and how softly it
   *  blends into the jaw (mm, 18); narrower, further back and blended less, the jaw stands out over it in a line */
  neckW?: number; neckBack?: number; neckBlend?: number;
  /** a column neck: the free neck's half-width and half-depth (mm), the head's own skin carrying straight on down it under the
   *  jaw and the skull to its seam, where the rig's neck takes over with the same section (`neckSeam`, models/head.ts `buildNeck`). A
   *  man's neck keeps its girth up to the head (ANSUR II: 0.69 of the head's); an egg-shaped stub over a neck narrowing up
   *  into it read as a cone, creased where the two met */
  neckCol?: [number, number];
  /** how far down under the jaw the beard grows (mm from the chin's underside; -45 down the throat) */
  beardUnder?: number;
  /** how softly the lower lid blends into the cheek (mm; 0 a lid standing out of the socket, its edge a crease) */
  lidSoft?: number;
  /** the eye's outer corner higher than its inner (mm, 1.1), and how far its upper lid arches over the opening and its lower
   *  lid sags under it (shares of eyeOpen: 1.08 and 1.22; a higher upper and a straighter lower lid make an almond) */
  eyeTilt?: number; lidUp?: number; lidLow?: number;
  /** the opening's half-width (mm, 15 by default): past the eyeball's outline (12 mm from its middle) the opening shows the
   *  socket behind it, and the eye ends square, cut off by the eyeball's edge, instead of tapering to its corners */
  eyeW?: number;
  /** how far forward the mouth, its muzzle and the chin sit (mm): a lower face set back reads as flat and receding */
  muzzleFwd?: number;
  /** how far the ears' backs stand out from the head (radians, 0.5 average) */
  earFlare?: number;
  /** how thick the ears are (mm; 3.4 as most): thin, from the front they read as fins (the mage) */
  earThick?: number;
  /** how big the ears are (1 as most: ANSUR's 64 mm long) */
  earScale?: number;
  /** how round the ears are (0 as most, 1 round): the top of the rim rounded, the rim rolled round from front to back
   *  (pointed and with a flat band of an edge, the mage's read as an elf's) */
  earRound?: number;
  /** how much closer (mm) the ears sit in against the side of the head (0 as most), set (even to 0) riding out over the
   *  head where it bulges under them: a lean head drawn in round the ear canal left a gap before them, and a full back of
   *  the skull swallowed their back halves (the mage) */
  earIn?: number;
  /** how much wider (mm each way) a column neck grows down to its base, over the part below the head's skin: a neck
   *  widening into the shoulders, not a column of one width down to the collar */
  neckFlare?: number;
  /** how much further out the cheekbones' arches stand (mm each side), the mid-face widening with them: a broad face
   *  at the cheekbones without a bump on them */
  zygo?: number;
  /** how much further forward (mm) the brow ridge stands over the eyes (its outer ends less), the sockets dug under it: deep-set eyes */
  browFwd?: number;
  /** how much lower (mm) the brow ridge's inner ends sit than its outer ones: a frown, the brows drawn together (level,
   *  a clean-shaven face read blank) */
  browFrown?: number;
  /** how much further forward (mm) the forehead's front comes, lower down too, so it rises nearly upright from the brow */
  foreheadFwd?: number;
  /** how much further forward (mm) the nose's root sits, at the dip between the eyes */
  noseRoot?: number;
  /** how much further forward (mm) the skull's back comes (its length kept as the face comes forward) */
  skullFwd?: number;
  /** how much further back (mm) the back of the skull reaches about the ears' tops, where it is furthest (its crown and
   *  its base kept): a head's back rounding out low before it turns in to the neck, not a dome's falling straight down */
  occiput?: number;
  /** how much further forward (mm) the lips and the muzzle over the teeth stand, the chin left where it is */
  lipFwd?: number;
  /** how much higher (mm) the mouth sits, the nose's base with it (the eyes and the chin stay): a shorter upper lip and a
   *  longer chin */
  mouthUp?: number;
  /** the face's front as one smooth surface instead of the blobs (the upper face, the lower face's core, the cheeks, the
   *  muzzle, the chewing muscle, the forehead): its cross-section at each height a superellipse, measured off a reference
   *  (`front` from its profile, `half` from its front view, `side` where it is widest, `p` how square); the nose, lips,
   *  brow, eyes, chin and cheekbones stand on it */
  mask?: FaceMask;
  /** a fleshy upper lid (mm): the skin over the eye thickens from the lashes up to the brow, filling the socket under it
   *  (a hooded, deep-set eye, its crease under the brow), not a hollow there */
  lidFold?: number;
  /** how much narrower (mm each side) the skull is towards the front, at the temples, than at its widest behind the ears:
   *  the face's sides then run straight down from the temples to the jaw instead of the cheekbones standing out of them */
  templeNarrow?: number;
  /** how far out (mm) the mouth's corners are tucked in (25 as most faces) */
  cornerIn?: number;
  /** the mouth's width (1 average): the lips, their corners and their paint drawn in towards the middle */
  mouthW?: number;
  /** more of the mesh's rows and columns over the eyes (0 none, 1 about 3.5 times the rows there): at the grid's spacing
   *  an opening 8 mm tall fell between two rows and showed as a slot, its corners cut off square */
  gridEye?: number;
}

/** knots up the face (heights `y`, mm) and at each: the front's depth at the middle (the face under the nose and lips),
 *  the half-width, the depth where it is widest and the squareness across (2 an ellipse, more a flatter front turning
 *  sooner); `pz`, how its sides run back (2 an ellipse; less, straighter sides closing in to the front: a lean jaw and
 *  cheeks, not full ones; `p` when not given) */
export interface FaceMask {
  y: number[]; front: number[]; half: number[]; side: number[]; p: number[]; pz?: number[];
  /** a soft hollow running down from under the cheekbone towards the mouth's corner (mm deep): the cheekbone then reads by
   *  the shade under it, not by standing out */
  hollow?: number;
}

/** a smooth curve through knots (cubic Hermite, tangents from the neighbours), flat beyond the ends */
function knots(ys: number[], vs: number[], y: number): number {
  const n = ys.length;
  if (y <= ys[0]) return vs[0];
  if (y >= ys[n - 1]) return vs[n - 1];
  let k = 0;
  while (y > ys[k + 1]) k++;
  const h = ys[k + 1] - ys[k], t = (y - ys[k]) / h;
  const slope = (i: number) => i <= 0 || i >= n - 1 ? 0 : ((vs[i + 1] - vs[i]) / (ys[i + 1] - ys[i]) + (vs[i] - vs[i - 1]) / (ys[i] - ys[i - 1])) / 2;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * vs[k] + (t3 - 2 * t2 + t) * h * slope(k) + (-2 * t3 + 3 * t2) * vs[k + 1] + (t3 - t2) * h * slope(k + 1);
}

/** the mask's distance: its superellipse at this height (a short taper behind the widest point, inside the skull), the
 *  jaw's underside below it (a plane from the chin's bottom back to the jaw's angles) and its top inside the skull */
function maskSDF(ax: number, y: number, z: number, M: FaceMask): number {
  const W = knots(M.y, M.half, y), Zc = knots(M.y, M.side, y), p = knots(M.y, M.p, y), D = z > Zc ? Math.max(4, knots(M.y, M.front, y) - Zc) : 30;
  // (behind its widest point the taper inside the skull stays round)
  const q = z > Zc && M.pz ? knots(M.y, M.pz, y) : p;
  const u = ax / W, v = Math.abs(z - Zc) / D;
  // (round where the front meets the back: v^q with q under 2 turns infinitely sharply there, a crease down the face's
  // side; eased into a square near v = 0 it keeps its line further out)
  const e2 = 0.0144, vv = v * v + e2, vq = Math.pow(vv, q / 2) - Math.pow(e2, q / 2);
  const up = Math.pow(u, p), f = up + vq - 1;
  let d: number;
  if (u + v < 1e-6) d = -Math.min(W, D);
  else {
    // (over its gradient: a distance near the surface)
    const gx = u > 0 ? p * up / u / W : 0, gz = q * v * Math.pow(vv, q / 2 - 1) / D;
    d = f / Math.max(1e-6, Math.hypot(gx, gz));
  }
  if (M.hollow && z > Zc) {
    // (pressed in along a band from under the cheekbone, out by the face's side, to beside the mouth's corner)
    const ax0 = 53, ay0 = 88, bx = 33, by = 55, dx = bx - ax0, dy = by - ay0;
    const t = clamp(((ax - ax0) * dx + (y - ay0) * dy) / (dx * dx + dy * dy), 0, 1);
    const dist = Math.hypot(ax - ax0 - dx * t, y - ay0 - dy * t);
    d += M.hollow * Math.exp(-((dist / 13) ** 2)) * sm(0, 0.3, t) * sm(1, 0.65, t) * sm(Zc, Zc + 25, z);
  }
  const s = 0.3;
  const under = (1 + (100 - z) * s - y) / Math.hypot(1, s);
  return smax(smax(d, under, 6), y - M.y[M.y.length - 1], 10);
}

/** the face's own height for a point at height `y` (mm): with `mouthUp` the mouth and the nose's base are higher, the
 *  eyes and the chin where they were (everything about the face is shaped and painted at this height) */
export function faceY(y: number, F: FaceShape): number {
  const u = F.mouthUp;
  return u ? y - u * sm(2, 45, y) * sm(106, 45, y) : y;
}

export const FACES: Record<'warrior' | 'mage' | 'ranger', FaceShape> = {
  // a strong jaw and chin, a brow over deep-set eyes, a straight nose
  warrior: { jaw: 55.2, chin: 10, chinFwd: -3.4, brow: 1.7, cheek: 0.9, noseLen: 50, noseW: 13.2, nosePro: 1.5, hump: 0, lips: 0.78, long: 0.96, tip: 1.15, eyeOpen: 3.4, iris: [0.234, 0.237, 0.164], beardDepth: 0.8, browFwd: 5.5, foreheadFwd: 10, noseRoot: 11, skullFwd: -3.7, lipFwd: 10.5, mouthW: 1.07, mouthUp: 6, beardLine: 22, browDrop: 2.6, masseter: 53, stacheCurve: 8, beardUnder: -12, lowerW: 60, neckW: 48, neckBack: -5, neckBlend: 9, neckCol: [65, 62], lidSoft: 4, earFlare: 0.3, zygo: 2, bridgeW: 6.8, eyeTilt: -0.3, lidUp: 1.25, lidLow: 1.03, eyeW: 14, muzzleFwd: -1.5,
    templeNarrow: -4.4, lidFold: 5, gridEye: 1,
    // (the mask, the skull and the jaw fitted by least squares (tools/facelab/fit.mjs) to the reference rebuilt in 3D from its
    // turnaround (within 1 mm rms) and to its front view's widths; the nose, lips and eyes to the pictures' landmarks)
    mask: { y: [-2, 8, 18, 30, 45, 60, 75, 90, 100, 110, 120, 132, 145, 160, 175, 190],
      front: [95, 96.5, 97.5, 99.3, 101.1, 101.3, 100.2, 98, 95.6, 93.7, 94.4, 98.1, 99.9, 98.6, 94, 80],
      half: [20, 32.6, 45.1, 56.4, 63.8, 66.8, 68, 69.5, 69, 67.2, 66.2, 65.2, 65.1, 65.1, 63, 58],
      side: [60, 48.6, 38.1, 29, 21.3, 15.5, 11.8, 10.4, 10.1, 10.7, 11.8, 11.7, 10, 6.3, 0, -10],
      p: [2, 2.15, 2.22, 2.21, 2.11, 1.98, 1.84, 1.76, 1.8, 2.02, 2.36, 2.5, 2.44, 2.39, 2.4, 2.2],
      pz: [1.2, 1.2, 1.2, 1.2, 1.22, 1.58, 2.11, 2.65, 2.98, 3.18, 3.3, 3.18, 2.88, 2.61, 2.4, 2.2], hollow: 0 } },
  // the battle scholar, clean-shaven: his lower face tapers to a rounded chin, blending softly into the neck. An extra
  // masseter on his mask made the side of the jaw lumpy; its own surface carries the cheek.
  mage: { jaw: 46, chin: 9.5, chinFwd: 6, brow: 2.6, cheek: 0.9, noseLen: 54, noseW: 13, nosePro: 1.25, hump: 0, lips: 1.1, long: 0.91, tip: 1.0, eyeOpen: 2.75, iris: [0.26, 0.29, 0.23], beardDepth: 0, browFwd: 8, browFrown: 4, foreheadFwd: 10, noseRoot: 6, skullFwd: -3.7, occiput: 12, lipFwd: 11, cornerIn: 22, mouthUp: 7, beardLine: 22, browDrop: 3.5, earIn: 2, earThick: 5.5, earScale: 1.15, earRound: 1, neckFlare: 12, stacheCurve: 8, beardUnder: -12, lowerW: 60, neckW: 50, neckBack: -14, neckBlend: 20, neckCol: [64, 63], lidSoft: 4, earFlare: 0.1, zygo: 3.5, bridgeW: 5.6, eyeTilt: -0.3, lidUp: 1.25, lidLow: 1.03, eyeW: 16.5, muzzleFwd: -1.5,
    templeNarrow: 3, lidFold: 3, gridEye: 1,
    // (the mask, the skull and the jaw fitted by least squares (tools/facelab/fit.mjs) to the reference rebuilt in 3D from its
    // turnaround (within 1 mm rms) and to its front view's widths; the nose, lips and eyes to the pictures' landmarks)
    mask: { y: [-2, 8, 18, 30, 45, 60, 75, 90, 100, 110, 120, 132, 145, 160, 175, 190, 205],
      front: [93, 99, 100, 101, 102.5, 102.5, 101, 98, 95.6, 93.7, 94.4, 95.5, 94.5, 93, 90, 85, 69],
      half: [18, 30, 42, 50, 55, 58, 62, 65.5, 67, 67, 66.2, 65.2, 65.1, 65.1, 63, 58, 50],
      side: [60, 48.6, 38.1, 29, 21.3, 15.5, 11.8, 10.4, 10.1, 10.7, 11.8, 11.7, 10, 6.3, 1, -4, -14],
      p: [2.5, 2.6, 2.6, 2.45, 2.2, 1.98, 1.84, 1.8, 1.86, 2.02, 2.25, 2.45, 2.44, 2.39, 2.4, 2.2, 2.2],
      pz: [1.2, 1.3, 1.5, 1.75, 1.95, 2.1, 2.3, 2.45, 2.55, 2.65, 2.75, 2.75, 2.65, 2.5, 2.4, 2.2, 2.2], hollow: 0 } },
  // the ranger, after his reference sheet: younger and darker than the mage, his eyes brown and deep-set, his full beard
  // cut short (about 3 cm under the chin)
  ranger: { jaw: 25.9, chin: -5.4, chinFwd: 1.1, brow: 1.4, cheek: 1.25, noseLen: 51, noseW: 17.5, nosePro: 1.1, hump: 0, noseRoot: 6, bridgeW: 7.5, lips: 1, long: 1.04, eyeOpen: 3, iris: [0.27, 0.17, 0.1], lidSoft: 4, eyeTilt: -0.3, lidUp: 1.25, lidLow: 1.03, eyeW: 14, lidFold: 5, gridEye: 1, beardDepth: 6, beardFull: 15, beardLine: 12, neckBack: -5, neckCol: [65, 62], beardUnder: -30,
    // (the mask and the broad shape fitted by least squares (tools/facelab/fit.mjs) to his reference sheet's head views
    // rebuilt in 3D (from 4.0 to 1.4 mm rms), started from the mage's; the eyes' lids and the grid over them the warrior's;
    // the nose shorter and broader, the eyes narrower, to the sheet's landmarks)
    skullFwd: -8.4,
    templeNarrow: -2.3,
    muzzleFwd: -35.2,
    browFwd: 3,
    browDrop: 9.3,
    lipFwd: 35.2,
    mask: { y: [-2, 8, 18, 30, 45, 60, 75, 90, 100, 110, 120, 132, 145, 160, 175, 190],
      front: [95, 95.4, 98.6, 101.4, 103.4, 103.3, 101.3, 97.8, 92.9, 91.6, 94.5, 98.8, 99.6, 96.8, 94, 80],
      half: [20, 23.8, 31.2, 40.2, 48.7, 56, 62.3, 67, 68.6, 68.7, 67.5, 65.5, 64.7, 63.9, 63, 58],
      side: [60, 54.9, 49.7, 43.2, 34.6, 24, 15.2, 9.8, 7, 6.4, 7.1, 7.7, 7.4, 5.1, 0, -10],
      p: [2, 1.84, 1.81, 1.8, 1.89, 2.1, 2.34, 2.52, 2.6, 2.76, 2.89, 2.74, 2.5, 2.33, 2.4, 2.2],
      pz: [1.2, 1.61, 1.97, 2.15, 2.19, 2.16, 2.26, 2.48, 2.6, 2.69, 2.75, 2.66, 2.54, 2.43, 2.4, 2.2], hollow: 0 } },
};

// --- distance primitives (approximate, good near the surface, which is all the meshing needs) ---
function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
/** a capsule from a (radius ra) to b (radius rb) */
function seg(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number): number {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const ex = px - dx * h, ey = py - dy * h, ez = pz - dz * h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h);
}
const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** where a column neck's skin passes from the head's to the rig's neck (mm, the face's frame), round it (`c` the cosine of the
 *  angle from the front round the column): low in front, under a full beard's neckline, which ends above it (at a seam under
 *  the chin the beard was cut off there); high behind, so the rig's neck bends above the collar (the head's skin moves with
 *  the head: down to the collar, the neck swung in it as the head turned) */
export const neckSeam = (c: number): number => lerp(-36, -12, ((1 - c) / 2) ** 0.7);
/** the cosine round a column neck from its front, at a point (mm) */
const neckCos = (ax: number, z: number, F: FaceShape): number => { const dz = z - (F.neckBack ?? -8); return dz / (Math.hypot(ax, dz) || 1); };
/** A column neck's top (mm): its sides drawn in by `sides` of its width from `from` up to `to`, under the skin below the
 *  ears, and the whole of it carried up behind into the base of the skull, ending inside it at `end`, as a man's neck's
 *  muscles carry up to his skull (cut off level at 40 mm, the column stood out of the narrower skin under the ears and
 *  behind them, a ledge the light drew as a line across the neck: lab neck) */
const COLUMN_TOP = { from: 20, to: 60, sides: 0.10, end: 70 };
/** A column neck (`neckCol`): the free neck's ellipse from inside the head down through the band round its seam where
 *  the rig's neck crosses it, then drawn in (below it the rig's neck is the skin, and where that bends the column moving
 *  with the head would show through; drawn in nearer the seam, its normals tilted there and the seam showed). */
function neckColumn(ax: number, y: number, z: number, F: FaceShape): number {
  const [rx, rz] = F.neckCol!, s = neckSeam(neckCos(ax, z, F)), T = COLUMN_TOP;
  const k = 1 - 0.35 * sm(s - 12, s - 32, y), kx = k * (1 - T.sides * sm(T.from, T.to, y)), m = Math.min(rx * kx, rz * k);
  return Math.max((Math.hypot(ax / (rx * kx), (z - (F.neckBack ?? -8)) / (rz * k)) - 1) * m, y - T.end, s - 32 - y);
}

/** eyeball centre (the left one; the right mirrors it) and radius, mm */
export const EYE = { x: 32, y: 114, z: 71, r: 12 };

/**
 * The eye opening in the eye's own frame (xe: mm towards the ear from the pupil, ye up): negative
 * inside the almond, the outer corner a little higher than the inner one, the upper lid's arc highest
 * towards the nose and the lower one's lowest towards the ear.
 */
export function eyeOpening(xe: number, ye: number, F: FaceShape): number {
  const ew = F.eyeW ?? 15, t = (xe + 0.5) / ew, u = clamp(t, -1, 1), w = 1 - u * u;
  const tilt = (F.eyeTilt ?? 1.1) * u;
  const top = tilt + F.eyeOpen * (F.lidUp ?? 1.08) * Math.pow(w, 0.72) * (1 - 0.22 * u) + 0.2;
  const bot = tilt - F.eyeOpen * (F.lidLow ?? 1.22) * Math.pow(w, 0.95) * (1 + 0.18 * u) - 0.4;
  return Math.max(ye - top, bot - ye, (Math.abs(t) - 1) * ew);
}

/** an ellipsoid tilted by `a` (radians, its top towards +z) about the x axis */
function tilted(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, a: number): number {
  const dy = y - cy, dz = z - cz, c = Math.cos(a), s = Math.sin(a);
  return ell(x, cy + dy * c - dz * s, cz + dy * s + dz * c, cx, cy, cz, rx, ry, rz);
}

/**
 * A lip: a roll along the curve of the teeth (its centre `yc` high and `zc` forward at the middle,
 * falling back towards the corners at `half` mm), `r` thick at the middle and thinning to the corners.
 */
function lip(ax: number, y: number, z: number, yc: number, zc: number, half: number, r: number, droop: number): number {
  const xq = Math.min(ax, half), k = xq / half;
  const qy = yc - droop * k * k, qz = zc - xq * xq / 62;
  const rr = r * Math.pow(Math.max(0, 1 - k * k), 0.9) + 0.9;
  return Math.hypot(ax - xq, y - qy, z - qz) - rr;
}

/** the mouth's line (the lips' meeting), mm up from the chin at `ax` from the middle */
export const mouthY = (ax: number): number => 45.3 - 0.0045 * ax * ax;

/** The lips' outer border (`side` +1 the upper lip's, -1 the lower's) at `ax` from the middle: the
 *  upper lip's bow peaks either side of a dip in the middle, both lips thin out into the corners. */
export function lipBorder(ax: number, side: number, F: FaceShape): number {
  ax /= F.mouthW ?? 1;
  const my = mouthY(Math.min(ax, 24));
  if (side > 0) {
    const w = Math.max(0, 1 - (ax / 23.5) ** 2);
    return my + (6.6 * F.lips) * Math.pow(w, 0.7) + 1.1 * Math.exp(-(((ax - 5.5) / 3.2) ** 2)) - 0.9 * Math.exp(-((ax / 2.4) ** 2));
  }
  const w = Math.max(0, 1 - (ax / 21.5) ** 2);
  return my - (9.2 * F.lips) * Math.pow(w, 0.55);
}

/** The head's signed distance at (x, y, z) mm, for face F. */
export function headSDF(x: number, y: number, z: number, F: FaceShape): number {
  const ax = Math.abs(x);
  y = faceY(y, F);
  // the lower face stretched for a longer face (below the eyes)
  const L = F.long, yl = y < 114 ? 114 - (114 - y) / L : y;
  // the skull: an egg, widest behind the ears; the forehead's broad front; the upper face
  const ff = F.foreheadFwd ?? 0;
  const tn = F.templeNarrow ? 1 + F.templeNarrow / 76 * sm(-20, 60, z) : 1;
  let d = ell(ax * tn, y, z, 0, 146, -8 + (F.skullFwd ?? 0), 76, 82, 96);
  const zg = F.zygo ?? 0, mf = F.muzzleFwd ?? 0, M = F.mask;
  if (M) d = smin(d, maskSDF(ax, yl, z, M), 14);
  else {
    d = smin(d, ell(ax, y, z, 0, 163 - ff * 1.5, 34 + ff * 1.3, 63, 46, 58), 20);
    d = smin(d, ell(ax, yl, z, 0, 92, 44, 54 + zg, 38, 48), 16);
    // the lower face's solid core: the cheeks and jaw are one mass, not blobs round a hollow
    d = smin(d, ell(ax, yl, z, 0, 48, 30 + mf * 0.5, F.lowerW ?? 54, 42, 58), 16);
  }
  // the base of the skull behind the jaw, down into the neck
  d = smin(d, ell(ax, y, z, 0, 76, -24, 52, 44, 60), 30);
  if (F.occiput) d = smin(d, ell(ax, y, z, 0, 124, -36, 60, 46, 66 + F.occiput), 24);
  // the jaw: its body from the chin back to its angle, the ramus from there up towards the ear, the
  // floor between its sides
  d = smin(d, seg(ax, yl, z, F.chin - 2, 9, 78 + mf * 0.8, F.jaw, 30, 4, 12, 10), 18);
  d = smin(d, seg(ax, yl, z, F.jaw - 3, 30, 6, 46, 80, 2, 9, 7.5), 12);
  d = smin(d, ell(ax, yl, z, 0, 28, 24, 44, 18, 44), 12);
  // the side of the face under the cheekbone's arch, in front of the ear (the chewing muscle)
  if (!M || F.maskMasseter) d = smin(d, ell(ax, yl, z, (F.masseter ?? 47) + zg * 0.6, 76, 20, 12, 30, 24), 18);
  // the top of the neck under the jaw and the skull (the rig's neck carries on below it)
  d = smin(d, F.neckCol ? neckColumn(ax, y, z, F) : ell(ax, y, z, 0, 0, F.neckBack ?? -8, F.neckW ?? 57, 58, 53), F.neckBlend ?? 18);
  // the cheekbones' arches back towards the ears (a measured face's mask has its own cheekbones: these stood out of it
  // with grooves between them)
  if (!M) d = smin(d, seg(ax, yl, z, 55 + zg, 102, 44, 59 + zg, 100, 14, 5, 4.5), 14);
  // (and the temples above them, the muscle there filling the side of the head out to the arches)
  if (zg && !M) d = smin(d, ell(ax, y, z, 56 + zg * 0.6, 120, 28, 9, 22, 24), 14);
  // nothing below reaches this far back (but the beard does: cut off here it left a step down the jaw)
  if (z < 25) return beardOn(d, ax, y, z, F);
  // brow ridge: from the glabella out over each eye, heavier in the middle
  const b = F.brow;
  const bd = F.browDrop ?? 0, bf = F.browFwd ?? 0, fr = F.browFrown ?? 0;
  d = smin(d, seg(ax, y, z, 0, 138 - bd - fr, 86 + 2 * b + bf, 42, 135 - bd, 75 + 1.5 * b + bf * 0.7, 6 + 1.2 * b, 5.5), 18);
  // cheekbones, the cheeks' fullness below them
  const c = F.cheek;
  // (over a hollow the cheekbone stands further out, catching the light above it)
  if (!M || F.maskCheekbones) d = smin(d, ell(ax, yl, z, 50, 101 + (F.hollow ?? 0) * 0.6, 57 + (F.hollow ?? 0) * 0.9, 15 * c, 11, 16), 10);
  if (!M) d = smin(d, ell(ax, yl, z, 40, 78, 62, 18, 20, 15), 12);
  // (in front of the face's side, so the outline keeps its line)
  if (F.hollow) d = smax(d, -ell(ax, yl, z, 38, 66, 62 + F.hollow * 2.2, 11, 15, 11), 14);
  // the muzzle over the teeth above and below the mouth, the chin
  const lf = mf + (F.lipFwd ?? 0);
  if (!M) {
    d = smin(d, ell(ax, yl, z, 0, 58, 78 + lf, 26, 20, 22), 10);
    d = smin(d, ell(ax, yl, z, 0, 31, 76 + lf, 24, 16, 19), 10);
  }
  d = smin(d, ell(ax, yl, z, 0, 13, 80 + F.chinFwd + mf * 0.8, F.chin, 15, 15), 8);
  const mw = F.mouthW ?? 1, axm = ax / mw;
  if (ax < 40 && yl > 28 && yl < 62) {
    // lips: rolls along the teeth meeting in a crease, the upper one thinner; the corners tucked in
    const lp = F.lips;
    // joined sharply, so the line between them stays a crease, then blended into the face
    const m0 = mouthY(0);
    const lips = Math.min(lip(axm, yl, z, m0 + 3.8 * lp + 0.6, 94.8 + lf, 22.5, 3.8 * lp, 3), lip(axm, yl, z, m0 - 4.8 * lp - 0.6, 92.5 + lf, 20.5, 4.8 * lp, 1.8));
    // (on a measured face, blended more softly: a sharp corner shows the mesh's steps)
    d = smin(d, lips, M ? 4.5 : 3.5);
    // (on the lips' ends where they stand off a flat muzzle: at 25 mm their round ends stood out past it, bright nubs)
    const tc = F.cornerIn ?? 25;
    d = smax(d, -ell(ax, yl, z, tc * mw, mouthY(axm) - 0.3, 90 + lf * 0.7 - (M ? 2 : 0), 3, 2.4, 3.5), M ? 3 : 2);
  }
  if (Math.abs(ax - EYE.x) < 32 && y > 85 && y < 150) {
    // eye sockets under the brow, then the lids riding on the eyeball round the opening
    // (dug further forward under a brow that stands further out)
    const sk = (F.browFwd ?? 0) * 0.5;
    d = smax(d, -ell(ax, y, z, EYE.x, 117, 77 + sk, 16, 11.5, 10 + sk), 12);
    const ex = ax - EYE.x, ey = y - EYE.y, ez = z - EYE.z;
    const ball = Math.sqrt(ex * ex + ey * ey + ez * ez);
    // (a soft lower lid is thinner and blends into the cheek: no bag over a crease)
    const below = F.lidSoft ? sm(-2, -8, ey) : 0;
    const eo = eyeOpening(ex, ey, F);
    // (a fold thickening upwards from the lash line, over the eye's width)
    const fold = F.lidFold && ey > -2 ? F.lidFold * sm(0.4, 7, eo) * sm(-2, 3, ey) * sm(20, 12, Math.abs(ex + 0.5)) : 0;
    const lids = smax(ball - (EYE.r + 1.9 - 0.8 * below + fold), -eo, 0.9);
    d = smin(d, lids, 2.5 + (F.lidSoft ?? 0) * below);
    // the eyeball's own surface, just behind the rendered eye
    d = Math.min(d, ball - (EYE.r - 0.35));
  }
  // (the box holds the bridge's top too: cut off at its edge, the skin and the occlusion sampled out from it step)
  if (ax < 30 && y > 55 && y < 146) {
    // the nose: a narrow ridge from between the eyes to the tip over a body that widens to the
    // nostrils, a hump on the bridge, the rounded tip, the nostrils' wings with a crease round them
    const nl = F.noseLen, np = F.nosePro, ty = 124 - nl + 4, tz = 90 + 22 * np, r0 = 88 + (F.noseRoot ?? 0);
    const tilt = Math.atan2(tz - r0, 124 - ty);
    // (a broad ridge blends in more softly: a narrow valley along its side shows as a line)
    d = smin(d, tilted(ax, y, z, 0, (124 + ty) / 2 + 2, (r0 + tz) / 2 - 1.5, F.bridgeW ?? 5.2, nl / 2 + 3, 4.6, tilt), F.bridgeW ? 8 : 5);
    d = smin(d, tilted(ax, y, z, 0, lerp(124, ty, 0.64), lerp(r0, tz, 0.64) - 8, 10, nl * 0.42, 7.5, tilt), 7);
    if (F.bridge) d = smin(d, ell(ax, y, z, 0, 126, 86 + F.bridge, 7, 10, 5), 5);
    if (F.hump > 0) d = smin(d, ell(ax, y, z, 0, 124 - nl * 0.42, 90 + 12.5 * np + (r0 - 88) * 0.58, 5, 7, 3 + F.hump), 4);
    const tp = F.tip ?? 1;
    d = smin(d, ell(ax, y, z, 0, ty, tz - 7 - 1.5 * (tp - 1), 9 * tp, 7.5 * tp, 8.5 * tp), 4);
    d = smin(d, ell(ax, y, z, F.noseW - 6.5, ty - 3, tz - 18, 6.8, 6, 8), 3.5);
  }
  return beardOn(d, ax, y, z, F);
}

/** a short beard standing off the skin: easing in across its edge, and shorter round the lips */
function beardOn(d: number, ax: number, y: number, z: number, F: FaceShape): number {
  if (!(F.beardDepth > 0 && y < 125 && z > -30)) return d;
  // (eased out towards the back, where it ends; a thick one thins out over its back edge, behind the jaw: ending within a
  // few mm it stood there as a ledge)
  // (and it eases in over a wider band, on the cheeks and round the lips: over a few mm, standing 6 mm off the skin, it made
  // a ridge from the cheekbones down to the mouth's corners)
  const thick = F.beardDepth > 2, lw = thick ? 4 : 0, thin = thick ? sm(beardBack(y) - 4, beardBack(y) + 30, z) : 1;
  const b = beardAt(ax, y, z, F, thick ? 7 : 2.5) * sm(-30, -15, z) * thin, my = mouthY(Math.min(ax / (F.mouthW ?? 1), 24));
  const nearLips = sm(32 + lw, 20 - lw, ax) * sm(my + 18 + lw, my + 8 - lw, y) * sm(my - 22 - lw, my - 12 + lw, y);
  return d - F.beardDepth * (thick ? b : b * b * (3 - 2 * b)) * (1 - 0.85 * nearLips);
}

/**
 * A full beard's volume over the skin at a point of it (mm, along the grid's ray there; 0 without one): from the cheeks
 * down, standing furthest off at the jaw and the chin and hanging below it, not down the throat behind them, short round
 * the lips. A mesh of its own (head.ts): in the skin's own distance field the rays, cast from above the jaw, met its
 * hanging underside and the neck behind it by turns, and its lower edge came out as a row of teeth.
 */
export function beardLift(ax: number, y: number, z: number, F: FaceShape): number {
  if (!F.beardFull) return 0;
  const b = beardAt(ax, y, z, F, 7) * sm(-30, -15, z), my = mouthY(Math.min(ax / (F.mouthW ?? 1), 24));
  const nearLips = sm(36, 16, ax) * sm(my + 22, my + 4, y) * sm(my - 26, my - 8, y);
  return F.beardFull * b * sm(80, 20, y) * sm(28, 58, z) * (1 - 0.9 * nearLips);
}

// --- the grid the skin is meshed on (and its uvs) -------------------------------------------------

/**
 * Where a ray at elevation `el` starts: rays aimed down (the jaw, the mouth, under the nose) start low
 * behind the nose, rays aimed up (the brow, the forehead) at eye level further back, so each meets its
 * part of the face squarely instead of skimming along it. The start rises with the elevation, so the
 * rays fan out without crossing.
 */
export function origin(el: number, out: { x: number; y: number; z: number }): typeof out {
  const k = sm(-0.3, 0.4, el);
  out.x = 0; out.y = lerp(82, 112, k); out.z = lerp(18, 5, k);
  return out;
}

/** positions along an axis, spaced so that each step holds the same share of `density` */
function warp(n: number, lo: number, hi: number, density: (a: number) => number): Float64Array {
  const M = 2048, cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) cum[i + 1] = cum[i] + density(lo + (hi - lo) * (i + 0.5) / M);
  const out = new Float64Array(n + 1), total = cum[M];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const want = (i / n) * total;
    while (k < M && cum[k + 1] < want) k++;
    const f = cum[k + 1] > cum[k] ? (want - cum[k]) / (cum[k + 1] - cum[k]) : 0;
    out[i] = lo + (hi - lo) * (k + clamp(f, 0, 1)) / M;
  }
  out[0] = lo; out[n] = hi;
  return out;
}

export interface HeadGrid {
  nu: number; nv: number;
  /** azimuth per column (0 the face, +x the left side), elevation per row (bottom up) */
  az: Float64Array; el: Float64Array;
  /** distance from the ray's origin to the skin along each grid ray, mm, row-major (nv + 1) x (nu + 1) */
  r: Float32Array;
  /** each grid point on the skin (mm, x y z, row-major): where its ray meets it, moved along the skin past an overhang
   *  (see `relax`) */
  p: Float32Array;
}

/** a direction from the grid's angles */
export function gridDir(az: number, el: number, out: { x: number; y: number; z: number }): typeof out {
  const ce = Math.cos(el);
  out.x = Math.sin(az) * ce; out.y = Math.sin(el); out.z = Math.cos(az) * ce;
  return out;
}

/** the grid's ray (azimuth, elevation) through a point (mm): its start depends on its elevation, so found by iterating */
function rayTo(x: number, y: number, z: number): [number, number] {
  const o = { x: 0, y: 0, z: 0 };
  let az = 0, el = 0;
  for (let k = 0; k < 30; k++) { origin(el, o); az = Math.atan2(x - o.x, z - o.z); el = Math.atan2(y - o.y, Math.hypot(x - o.x, z - o.z)); }
  return [az, el];
}

/** the grid's size at a detail: `nu` x `nv` cells, more for a face with rows and columns added over its eyes */
export const gridSize = (F: FaceShape, nu: number, nv: number): [number, number] => [Math.round(nu * (1 + 0.09 * (F.gridEye ?? 0))), Math.round(nv * (1 + 0.09 * (F.gridEye ?? 0)))];

/** Cast the grid's rays: the outermost crossing of the skin along each, found from outside inwards. */
export function headGrid(F: FaceShape, nu: number, nv: number): HeadGrid {
  // columns densest over the face, rows densest from the chin to the brows (and over the eyes, with gridEye)
  const ge = F.gridEye ?? 0, [aE, eE] = ge ? rayTo(EYE.x, EYE.y, EYE.z + EYE.r) : [0, 0];
  const az = warp(nu, -Math.PI, Math.PI, (a) => 1 + 2.2 * Math.exp(-((a / 0.95) ** 2)) + ge * 1.2 * Math.exp(-(((Math.abs(a) - aE) / 0.2) ** 2)));
  const el = warp(nv, -Math.PI / 2, Math.PI / 2, (e) => 0.35 + 1.6 * Math.exp(-(((e + 0.1) / 0.75) ** 2)) + ge * 4.5 * Math.exp(-(((e - eE) / 0.035) ** 2)));
  const r = new Float32Array((nu + 1) * (nv + 1)), W = nu + 1;
  const d = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 };
  const f = (t: number) => headSDF(C.x + d.x * t, C.y + d.y * t, C.z + d.z * t, F);
  /** the outermost crossing along ray (i, j), from `start` (outside) inwards: steps no longer than the
   *  distance to the skin until inside, then halving the bracket */
  const cast = (i: number, j: number, start: number) => {
    gridDir(az[i], el[j], d);
    origin(el[j], C);
    let hi = start, v = f(hi);
    // a start inside (a nose standing out of its neighbours) steps out first
    while (v < 0 && hi < 162) { hi = Math.min(162, hi + 10); v = f(hi); }
    let lo = hi;
    for (let s = 0; s < 200; s++) {
      lo = hi - (v > 12 ? Math.min(10, v * 0.85) : Math.max(0.4, v * 0.85));
      const w = f(lo);
      if (w < 0 || lo < 5) break;
      hi = lo; v = w;
    }
    for (let s = 0; s < 7; s++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // every fourth ray from outside the whole head, then the rest from just outside what those give
  const K = 4, done = new Uint8Array(W * (nv + 1));
  for (let j = 0; j <= nv; j += K) for (let i = 0; i <= nu; i += K) { r[j * W + i] = cast(i, j, 162); done[j * W + i] = 1; }
  const coarse = (i: number, j: number) => {
    const i0 = Math.min(Math.floor(i / K) * K, Math.floor(nu / K) * K), j0 = Math.min(Math.floor(j / K) * K, Math.floor(nv / K) * K);
    const i1 = Math.min(i0 + K, Math.floor(nu / K) * K), j1 = Math.min(j0 + K, Math.floor(nv / K) * K);
    const a = i1 > i0 ? (i - i0) / (i1 - i0) : 0, b = j1 > j0 ? (j - j0) / (j1 - j0) : 0;
    return lerp(lerp(r[j0 * W + i0], r[j0 * W + i1], a), lerp(r[j1 * W + i0], r[j1 * W + i1], a), b);
  };
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) if (!done[j * W + i]) r[j * W + i] = cast(i, j, Math.min(162, coarse(i, j) + 14));
  const p = new Float32Array(W * (nv + 1) * 3);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * W + i;
    gridDir(az[i], el[j], d); origin(el[j], C);
    p[k * 3] = C.x + d.x * r[k]; p[k * 3 + 1] = C.y + d.y * r[k]; p[k * 3 + 2] = C.z + d.z * r[k];
  }
  const g = { nu, nv, az, el, r, p };
  relax(g, F);
  return g;
}

/**
 * Past an overhang seen from the rays' start (under the brow, into the lid's crease, round the nose's wings) neighbouring
 * rays meet the skin far apart, and the triangle between them hangs in the air: a dark streak. Where an edge is much
 * longer than its rays' spacing, the points round it slide over the skin towards their neighbours' average (weighted by
 * the grid's own spacing, so a smooth part keeps its layout) and back onto it, until they cover the skin the rays missed.
 */
function relax(g: HeadGrid, F: FaceShape): void {
  const { nu, nv, az, el, r, p } = g, W = nu + 1, n = W * (nv + 1);
  const d0 = { x: 0, y: 0, z: 0 }, d1 = { x: 0, y: 0, z: 0 }, o0 = { x: 0, y: 0, z: 0 }, o1 = { x: 0, y: 0, z: 0 };
  // each edge's length on a smooth head at its rays' radius (to the next column, `hi`; to the next row, `hj`), and how
  // much longer it actually is
  const hi = new Float32Array(n), hj = new Float32Array(n), st = new Float32Array(n);
  const dist = (a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * W + i;
    if (i < nu) {
      gridDir(az[i], el[j], d0); gridDir(az[i + 1], el[j], d1);
      hi[k] = Math.max(0.3, r[k] * Math.hypot(d1.x - d0.x, d1.y - d0.y, d1.z - d0.z));
      const s = dist(k, k + 1) / hi[k];
      st[k] = Math.max(st[k], s); st[k + 1] = Math.max(st[k + 1], s);
    }
    if (j < nv) {
      gridDir(az[i], el[j], d0); gridDir(az[i], el[j + 1], d1); origin(el[j], o0); origin(el[j + 1], o1);
      const rr = r[k];
      hj[k] = Math.max(0.3, Math.hypot(o1.x + d1.x * rr - o0.x - d0.x * rr, o1.y + d1.y * rr - o0.y - d0.y * rr, o1.z + d1.z * rr - o0.z - d0.z * rr));
      const s = dist(k, k + W) / hj[k];
      st[k] = Math.max(st[k], s); st[k + W] = Math.max(st[k + W], s);
    }
  }
  // the points that move: round every edge over two and a half times its length, easing off over a few cells
  const R = 3, m = new Float32Array(n), idx: number[] = [];
  for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
    let w = 0;
    for (let dj = -R; dj <= R; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj > nv) continue;
      for (let di = -R; di <= R; di++) {
        const s = st[jj * W + (i + di + nu) % nu];
        if (s > 2.5) w = Math.max(w, sm(2.5, 4, s) * sm(R + 1, 1, Math.hypot(di, dj)));
      }
    }
    if (w > 0.01) { m[j * W + i] = w; idx.push(j * W + i); }
  }
  if (!idx.length) return;
  const f = (x: number, y: number, z: number) => headSDF(x, y, z, F);
  const N = new Float32Array(n * 3), q = new Float32Array(n * 3), e = 0.4;
  /** onto the skin along the distance's gradient, keeping the normal there */
  const project = (k: number, steps: number) => {
    for (let s = 0; s < steps; s++) {
      const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2], v = f(x, y, z);
      const gx = (f(x + e, y, z) - v) / e, gy = (f(x, y + e, z) - v) / e, gz = (f(x, y, z + e) - v) / e, gl = Math.hypot(gx, gy, gz) || 1;
      N[k * 3] = gx / gl; N[k * 3 + 1] = gy / gl; N[k * 3 + 2] = gz / gl;
      if (Math.abs(v) < 0.02) break;
      p[k * 3] -= v * gx / (gl * gl); p[k * 3 + 1] -= v * gy / (gl * gl); p[k * 3 + 2] -= v * gz / (gl * gl);
    }
  };
  for (const k of idx) project(k, 2);
  // (a point that hardly moves stays on the skin, its normal still good: only the ones moving are put back, a step each,
  // until none moves)
  const moved = new Uint8Array(n);
  for (let it = 0; it < 16; it++) {
    let most = 0;
    for (const k of idx) {
      const i = k % W, j = (k - i) / W;
      // neighbours round the head wrap across the seam (the last column is the first)
      const kl = j * W + (i + nu - 1) % nu, kr = j * W + (i + 1) % nu, kd = k - W, ku = k + W;
      const wl = 1 / hi[kl] ** 2, wr = 1 / hi[k] ** 2, wd = 1 / hj[kd] ** 2, wu = 1 / hj[k] ** 2, ws = wl + wr + wd + wu;
      for (let c = 0; c < 3; c++) q[k * 3 + c] = (p[kl * 3 + c] * wl + p[kr * 3 + c] * wr + p[kd * 3 + c] * wd + p[ku * 3 + c] * wu) / ws - p[k * 3 + c];
      // (along the skin only, and a step at a time)
      const dn = q[k * 3] * N[k * 3] + q[k * 3 + 1] * N[k * 3 + 1] + q[k * 3 + 2] * N[k * 3 + 2];
      for (let c = 0; c < 3; c++) q[k * 3 + c] -= dn * N[k * 3 + c];
      const len = Math.hypot(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]), lim = Math.min(1, 3 / (len || 1)) * 0.9 * m[k];
      for (let c = 0; c < 3; c++) q[k * 3 + c] *= lim;
      most = Math.max(most, len * lim);
    }
    for (const k of idx) {
      if (Math.abs(q[k * 3]) + Math.abs(q[k * 3 + 1]) + Math.abs(q[k * 3 + 2]) < 0.01) continue;
      for (let c = 0; c < 3; c++) p[k * 3 + c] += q[k * 3 + c];
      project(k, 1); moved[k] = 1;
    }
    if (most < 0.03) break;
  }
  for (const k of idx) if (moved[k]) project(k, 2);
  // the seam's last column is its first
  for (let j = 0; j <= nv; j++) for (let c = 0; c < 3; c++) p[(j * W + nu) * 3 + c] = p[j * W * 3 + c];
}

/** the skin's point at fractional grid coordinates (bilinear between the grid's points), mm */
export function gridP(g: HeadGrid, fi: number, fj: number, out: { x: number; y: number; z: number }): typeof out {
  const i0 = clamp(Math.floor(fi), 0, g.nu - 1), j0 = clamp(Math.floor(fj), 0, g.nv - 1);
  const a = clamp(fi - i0, 0, 1), b = clamp(fj - j0, 0, 1), W = g.nu + 1, p = g.p;
  const k00 = (j0 * W + i0) * 3, k10 = k00 + 3, k01 = k00 + W * 3, k11 = k01 + 3;
  out.x = lerp(lerp(p[k00], p[k10], a), lerp(p[k01], p[k11], a), b);
  out.y = lerp(lerp(p[k00 + 1], p[k10 + 1], a), lerp(p[k01 + 1], p[k11 + 1], a), b);
  out.z = lerp(lerp(p[k00 + 2], p[k10 + 2], a), lerp(p[k01 + 2], p[k11 + 2], a), b);
  return out;
}

/** the skin's radius at fractional grid coordinates (bilinear) */
export function gridR(g: HeadGrid, fi: number, fj: number): number {
  const i0 = clamp(Math.floor(fi), 0, g.nu - 1), j0 = clamp(Math.floor(fj), 0, g.nv - 1);
  const a = clamp(fi - i0, 0, 1), b = clamp(fj - j0, 0, 1), W = g.nu + 1;
  const r00 = g.r[j0 * W + i0], r10 = g.r[j0 * W + i0 + 1], r01 = g.r[(j0 + 1) * W + i0], r11 = g.r[(j0 + 1) * W + i0 + 1];
  return lerp(lerp(r00, r10, a), lerp(r01, r11, a), b);
}

// --- the painted skin ---------------------------------------------------------------------------

/** the plain skin's shade of the face's skin colour (the ears', the neck's: models/head.ts `plainSkin`) */
export const PLAIN_SKIN = 0.97;
/** how far above a column neck's seam (mm) its paint has become the rig's neck's own colour */
const NECK_PAINT = 12;

/** the occlusion's steps out from the skin (mm) and their weights */
const AO_STEPS: [number, number][] = [[2, 0.5], [5, 0.35], [10, 0.25], [18, 0.15], [30, 0.1]];

/** A face's colouring: skin, hair and beard (sRGB 0..1), and how the hair grows. */
export interface FaceLook {
  skin: [number, number, number];
  hair: [number, number, number];
  /** lighter strands through the hair and beard */
  streak: [number, number, number];
  /** share of grey strands */
  grey: number;
  /** a beard over the jaw, chin and upper lip (0 clean-shaven, 1 full) */
  beard: number;
  /** age: deeper lines on the brow and round the eyes */
  age: number;
  /** how heavy the brows are (1 average): thicker and denser */
  brows?: number;
  /** how much the brows arch (1 average; 0 straight, their inner ends drawn down towards the nose) */
  browArch?: number;
  /** how far the brows' outer tails droop (1 average) and how solidly their middle is filled (0 hairs only) */
  browTail?: number; browFill?: number;
  /** how evenly thick the brows are (0 tapering to a thin tail, 1 nearly even: a wedge reads as a scowl) */
  browEven?: number;
  /** how far the brows' outer ends are raised (mm): level as the forehead curves away, rather than drooping */
  browLift?: number;
  /** how much higher the brows are painted (mm; lower: close over the eyes), and how far from the middle their inner ends
   *  start (mm, 6 by default: closer, they nearly meet over the nose) */
  browY?: number; browIn?: number;
  /** how deep the pores and fine bumps of the skin are (1 average) */
  pores?: number;
  /** how much lower the hairline comes over the forehead (mm), and lower again at the temples, and behind the ears and
   *  down the nape (`nape`: hair cut short there grows down to the neck) */
  hairDrop?: number; templeDrop?: number; nape?: number;
  /** a short-cropped beard (0 a full one): sparser, the skin showing through it */
  stubble?: number;
  /** how deep the folds from the nose's wings to past the mouth's corners are (0 none, 1 a lean man of 40's) */
  folds?: number;
  /** the beard's hairs as soft short strands in the head's own mm, the way they grow, in patches, the skin showing between
   *  them (0: strokes at the texture's own scale): hairs finer than a texel average out at a distance to one flat tone,
   *  and the beard reads as a block */
  beardClump?: number;
  /** how strongly the lips are coloured (1 average), and their colour (sRGB 0..1; a dusky rose by default) */
  lipTint?: number; lipColor?: [number, number, number];
  /** how dark and big the nostrils show from the front (1 average) */
  nostrils?: number;
  /** how dark the skin under the eyes is (1 average) */
  under?: number;
  /** shading painted into the skin where light falls less (the eye sockets, beside the nose, under the
   *  cheekbones and the jaw): a lean, sculpted face */
  contour?: number;
  /** occlusion baked into the skin (0 none, 1 full): how much of the open air round each point the head itself takes,
   *  in the eye sockets, under the nose and the lips, under the jaw (the game's shadows are far too coarse for a face's) */
  ao?: number;
  /** the beard's hairs (sRGB 0..1; the hair's by default), and the brows' halfway between the two */
  beardHair?: [number, number, number];
  /** how much the upper lid shades the eye under it (0 none, 1 deep-set) and how dim the white of the eye is */
  eyeShade?: number;
  /** how rosy the cheeks, nose, chin and lips' surround are (1 average), and the nose's share of it (1 as the rest) */
  flush?: number; noseWarm?: number;
  /** the crease round the wings of the nose and the shine on its tip (0 none, 1 clear) */
  alar?: number;
  /** how glossy the lips are (1 average: moist; less, dry and matte, no shine along the lower lip) */
  lipGloss?: number;
  /** the face's outer edge darker, the temples and the cheeks' sides, as the hair standing over them shades them, and the
   *  cheekbones turning away under the eyes (0 none, 1 under thick hair) */
  cheekShade?: number;
}

export const LOOKS: Record<keyof typeof FACES, FaceLook> = {
  warrior: { skin: [0.822, 0.628, 0.572], hair: [0.155, 0.112, 0.07], streak: [0.4, 0.3, 0.18], ao: 0.55, beardHair: [0.42, 0.29, 0.17], eyeShade: 0.55, flush: 1.3, noseWarm: 0.1, lipGloss: 0.3, grey: 0.02, beard: 1, age: 0.5, brows: 0.92, hairDrop: 20, cheekShade: 0.5, stubble: 0.8, beardClump: 1, contour: 0.6, browArch: 0.1, pores: 0.8, lipTint: 1.25, lipColor: [0.69, 0.41, 0.38], nostrils: 1.1, alar: 1, browTail: 0, browFill: 0.2, browEven: 1, under: 0.8, browLift: 2.5, browY: -5.5, browIn: 10, templeDrop: 22 },
  // (a lean face weathered by the sun, dark brown hair with warm lights and a dark beard, as his sheet's; shaded and
  // textured as the others: his plain look left the face flat, the skin pale peach and the eyes staring)
  mage: { skin: [0.64, 0.5, 0.42], hair: [0.15, 0.085, 0.055], streak: [0.22, 0.13, 0.08], ao: 0.6, beardHair: [0.055, 0.04, 0.032], eyeShade: 0.6, flush: 0.8, noseWarm: 0.1, lipGloss: 0.3, grey: 0.03, beard: 0, age: 0.45, folds: 0, brows: 0.8, hairDrop: 6, nape: 40, templeDrop: 6, cheekShade: 0, beardClump: 0.55, contour: 0, browArch: 0.12, pores: 0.9, lipTint: 1, lipColor: [0.6, 0.37, 0.33], nostrils: 1.1, alar: 1, browTail: 0, browFill: 0.5, browEven: 1, under: 0.9, browLift: 2.5, browY: -3.5, browIn: 10 },
  // (weathered from the outdoors, his hair and beard a dark brown; shaded and textured as the warrior's, which was tuned
  // against a photograph: the mage's plain look left his face flat and his eyes staring)
  ranger: { skin: [0.72, 0.5, 0.38], hair: [0.1, 0.066, 0.045], streak: [0.22, 0.15, 0.1], ao: 0.55, beardHair: [0.16, 0.105, 0.072], eyeShade: 0.55, flush: 1.1, noseWarm: 0.1, lipGloss: 0.3, grey: 0.01, beard: 1, age: 0.45, brows: 1, hairDrop: 20, nape: 55, cheekShade: 0.5, beardClump: 1, contour: 0.7, browArch: 0.1, pores: 0.8, lipTint: 1.1, lipColor: [0.6, 0.38, 0.33], nostrils: 1.1, alar: 1, browTail: 0, browFill: 0.3, browEven: 1, under: 0.8, browLift: 2.5, browY: -5.5, browIn: 10, templeDrop: 22 },
};

/** a smooth 3D value noise in [0, 1] from integer hashing (no tables, so it costs nothing to set up) */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = x - X, fy = y - Y, fz = z - Z, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number, k: number) => {
    let n = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const a = lerp(h(X, Y, Z), h(X + 1, Y, Z), u), b = lerp(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u);
  const c = lerp(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), e = lerp(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u);
  return lerp(lerp(a, b, v), lerp(c, e, v), w);
}
/** a table of random values for the fast 2D noise below (the same everywhere: seeded) */
const NT = 256, TABLE = ((): Float32Array => {
  const t = new Float32Array(NT * NT);
  let s = 12345;
  for (let i = 0; i < t.length; i++) { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) | 0; t[i] = (s >>> 0) / 4294967295; }
  return t;
})();
/** 2D value noise over texel coordinates, wrapping round the head every `px` in x (a table lookup: the
 *  paint calls it millions of times) */
function tnoise(x: number, y: number, px: number, seed: number): number {
  x = ((x % px) + px) % px + seed * 57.3; y += seed * 131.7;
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = X & (NT - 1), y0 = (Y & (NT - 1)) * NT, x1 = (X + 1) & (NT - 1), y1 = ((Y + 1) & (NT - 1)) * NT;
  return lerp(lerp(TABLE[y0 + x0], TABLE[y0 + x1], u), lerp(TABLE[y1 + x0], TABLE[y1 + x1], u), v);
}

/** how far below the hairline at the back short hair (`nape`) thins out down the neck (mm) */
const NAPE_FADE = 16;
/** 0 on the face, 1 where hair grows on the scalp: the forehead's line with recessions at the temples,
 *  sideburns in front of the ears, above the ears, down to the nape */
export function scalp(ax: number, y: number, z: number, drop = 0, temple = 0, nape = 0): number {
  const line = hairline(ax, z, drop, temple, nape);
  return sm(line - 3, line + 5, y);
}

/** the hairline's height (mm) round the head at (ax, z), `drop` mm lower over the forehead and `temple` mm lower
 *  again at the temples (hair framing the forehead), and `nape` mm lower behind the ears and at the nape */
export function hairline(ax: number, z: number, drop = 0, temple = 0, nape = 0): number {
  const a = Math.atan2(ax, z + 12);
  return -drop * (1 - sm(0.6, 1.1, a)) - temple * sm(0.35, 0.75, a) * (1 - sm(1.0, 1.3, a)) - nape * sm(1.8, 2.5, a) + (a < 0.35 ? lerp(188, 194, sm(0, 0.35, a))
    : a < 0.8 ? lerp(194, 170, sm(0.35, 0.8, a))
    : a < 1.25 ? lerp(170, 104, sm(0.8, 1.2, a))
    : a < 1.7 ? lerp(104, 132, sm(1.3, 1.62, a))
    : lerp(132, 78, sm(1.75, 2.6, a)));
}

/** the beard's back edge (z, mm) at height y: in front of the ears, then behind the jaw's angle and down and forward along
 *  the neck to the throat (eased from one to the other: a step showed as a notch in the beard behind the jaw) */
const beardBack = (y: number): number => lerp(lerp(-12, 30, sm(50, -30, y)), 4, sm(54, 66, y));

/** How much beard grows at a point (0..1): the jaw and chin, the cheeks below a line from the sideburns
 *  to the corners of the mouth, the moustache, under the jaw; never on the lips. `soft` widens its edges
 *  (the beard's volume eases in more gradually than its paint). */
export function beardAt(ax: number, y: number, z: number, F: FaceShape, soft = 1): number {
  const axm = ax / (F.mouthW ?? 1), my = mouthY(Math.min(axm, 24));
  // the cheek line: high at the sideburns, dropping across the cheek to the moustache
  const cheek = lerp(66, 112, sm(26, 58, ax)) - 8 * sm(40, 80, z) * sm(20, 50, ax);
  const bl = cheek - (F.beardLine ?? 0) * sm(20, 45, ax);
  let b = sm(bl + 3 * soft, bl - 6 * soft, y);
  // the moustache over the upper lip, clear of the nostrils
  const nb = 124 - F.noseLen + 4 - 5;
  // (a trimmed one follows the upper lip, curving down and thinning to the mouth's corners)
  const sc = F.stacheCurve ?? 0, nbx = nb - sc * (ax / 24) ** 2;
  // (a trimmed one thins in the groove under the nose)
  const stache = sm(nbx + 1, nbx - 4, y) * (sc ? sm(30, 16, ax) : sm(28, 20, ax)) * sm(80, 90, z);
  b = Math.max(b, stache);
  // (a trimmed one thins in the groove under the nose)
  if (sc) b *= 1 - 0.6 * sm(9, 3, ax) * sm(nb + 2, nb - 4, y) * sm(mouthY(0) + 4, mouthY(0) + 9, y);
  // the lips stay bare, right up to their border
  // (at the height the shape builds them, as the lips' paint: the lower face stretched for a longer face)
  const yq = y < 114 ? 114 - (114 - y) / F.long : y;
  if (axm < 26 && yq > 25 && yq < 62 && z > 82) {
    const top = lipBorder(ax, 1, F), bot = lipBorder(ax, -1, F);
    // (a trimmed one comes right up to them: a margin of bare skin reads as a light line drawn round the lips)
    // (just inside their border, under the lip colour's own soft edge)
    const mg = F.stacheCurve ? 0.25 : 0.8, ins = F.stacheCurve ? 0.7 : 0;
    b *= 1 - sm(24 + soft, 22, axm) * sm(top - ins + mg * soft, top - ins, yq) * sm(bot + ins - mg * soft, bot + ins, yq) * sm(84, 90, z);
  }
  const back = beardBack(y);
  let out = b * sm(back - 4, back + 6, z) * sm(F.beardUnder ?? -45, (F.beardUnder ?? -45) + 20, y);
  if (F.neckW !== undefined && y < 40) {
    // (with a jaw standing out over the neck, below its angle the beard grows on the jaw, not down the neck)
    const mf = F.muzzleFwd ?? 0, yl = y < 114 ? 114 - (114 - y) / F.long : y;
    const dj = Math.min(seg(ax, yl, z, F.chin - 2, 9, 78 + mf * 0.8, F.jaw, 30, 4, 12, 10), ell(ax, yl, z, 0, 13, 80 + F.chinFwd + mf * 0.8, F.chin + 4, 19, 19));
    out *= 1 - (1 - sm(22 + 2 * soft, 4, dj)) * sm(40, 25, y);
  }
  return out;
}

export interface FaceMaps { w: number; h: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer>; rough: Uint8ClampedArray<ArrayBuffer> }

/**
 * Paint a face on its grid (`w` x `h` texels, uvs as the grid's): skin mottled and warmer on the cheeks,
 * nose and lips, shadow under the eyes and in the lid crease, the lash line, brows and beard in hair
 * strokes, stubble at the beard's edge, nostrils, the mouth's line, the scalp under the hair; and a
 * height for the normal map (pores, lines, hairs) and roughness (an oilier brow and nose, moist lips).
 */
export function paintFace(F: FaceShape, L: FaceLook, g: HeadGrid, w: number, h: number): FaceMaps {
  const n = w * h, albedo = new Uint8ClampedArray(n * 4), rough = new Uint8ClampedArray(n * 4), hgt = new Float32Array(n);
  const o = { x: 0, y: 0, z: 0 };
  // --- occlusion, on a coarse grid (it varies slowly): the head's distance sampled out along the normal, each step
  // short of its length by how much of the air there the head takes
  let aoAt: ((tx: number, ty: number) => number) | null = null;
  if (L.ao) {
    const aw = w >> 2, ah = h >> 2, A = new Float32Array(aw * ah), f = (x: number, y: number, z: number) => headSDF(x, y, z, F), e = 0.75;
    for (let j = 0; j < ah; j++) {
      const fj = (1 - (j + 0.5) / ah) * g.nv;
      for (let i = 0; i < aw; i++) {
        const { x, y, z } = gridP(g, (i + 0.5) / aw * g.nu, fj, o);
        let nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        let occ = 0;
        for (const [d, k] of AO_STEPS) occ += k * Math.max(0, d - f(x + nx * d, y + ny * d, z + nz * d)) / d;
        A[j * aw + i] = clamp(1 - occ, 0, 1);
      }
    }
    aoAt = (tx, ty) => {
      const u = (tx + 0.5) / w * aw - 0.5, v = clamp((ty + 0.5) / h * ah - 0.5, 0, ah - 1.001), i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const i1 = ((i0 + 1) % aw + aw) % aw, ia = (i0 % aw + aw) % aw, at = (i: number, j: number) => A[j * aw + i];
      return lerp(lerp(at(ia, j0), at(i1, j0), fu), lerp(at(ia, j0 + 1), at(i1, j0 + 1), fu), fv);
    };
  }
  const nb = 124 - F.noseLen + 4, tz = 90 + 22 * F.nosePro;
  const S = L.skin, HAIR = L.hair, BH = L.beardHair ?? HAIR, BROW = [lerp(HAIR[0], BH[0], 0.85), lerp(HAIR[1], BH[1], 0.85), lerp(HAIR[2], BH[2], 0.85)];
  const c = [0, 0, 0];
  const mix = (t: number, r: number, gg: number, b: number) => { c[0] += (r - c[0]) * t; c[1] += (gg - c[1]) * t; c[2] += (b - c[2]) * t; };
  const G = (dx: number, dy: number, dz: number, s: number) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s));
  for (let ty = 0; ty < h; ty++) {
    // (texture rows run down from the top, v = 1)
    const fj = (1 - (ty + 0.5) / h) * g.nv;
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      gridP(g, (tx + 0.5) / w * g.nu, fj, o);
      const x = o.x, yy = faceY(o.y, F), z = o.z, ax = Math.abs(x);
      const face = sm(30, 70, z);
      // --- skin: mottled at two scales, warmer on the cheeks, nose, chin, round the mouth and the brow
      const m1 = vnoise(x / 14, yy / 14, z / 14, 1), m2 = tnoise(tx / 15, ty / 15, w / 15, 2);
      const k = 0.93 + 0.1 * m1 + 0.04 * m2;
      c[0] = S[0] * k; c[1] = S[1] * k * (0.98 + 0.04 * m1); c[2] = S[2] * k;
      if (z > 20) {
        // (a flushed face's cheeks spread wider, not patches)
        const warm = 0.75 * G(ax - 42, yy - 88, z - 70, L.flush ? 24 : 16) + 0.8 * (L.noseWarm ?? 1) * G(x, yy - (nb + 6), z - tz, 12) + 0.35 * G(x, yy - 18, z - 90, 18) + 0.3 * G(x, yy - 58, z - 95, 14) + 0.25 * G(x, yy - 160, z - 88, 30);
        const fl = L.flush ?? 1;
        c[0] *= 1 + 0.08 * fl * warm; c[1] *= 1 - 0.07 * fl * warm; c[2] *= 1 - 0.05 * fl * warm;
      }
      if (L.contour && z > 20) {
        const ex0 = ax - EYE.x, ey0 = yy - EYE.y;
        const shade = 0.9 * G(ex0 + 12, ey0 - 2, 0, 9) + 0.6 * G(ex0, ey0 - 9, 0, 11) + 0.55 * G(ax - 17, yy - (nb + 12), 0, 7)
          + 0.45 * G(ax - 48, yy - 66, 0, 14) * sm(40, 65, z) + 0.5 * sm(30, 12, yy) * sm(10, 30, ax);
        const k2 = 1 - L.contour * 0.22 * Math.min(1.2, shade);
        c[0] *= k2; c[1] *= k2 * 0.98; c[2] *= k2 * 0.98;
      }
      if (L.cheekShade && z > 0) {
        // (the face's outer edge, the temples and the cheeks' sides, under the hair standing over them)
        // (and softly over the cheekbone, turning away under the eye: a patch, not a band down the cheek, which looks gaunt)
        const k3 = 1 - L.cheekShade * (0.3 * sm(44, 60, ax) * sm(70, 88, yy) * sm(155, 135, yy) * (1 - sm(45, 75, z)) + 0.26 * G(ax - 46, yy - 90, 0, 13) * sm(30, 55, z));
        c[0] *= k3 ** 0.85; c[1] *= k3; c[2] *= k3 ** 1.12;
      }
      let hh = ((tnoise(tx * 0.9, ty * 0.9, w * 0.9, 3) - 0.5) * 0.35 + (tnoise(tx * 0.3, ty * 0.3, w * 0.3, 4) - 0.5) * 0.2) * (L.pores ?? 1);
      let rr = 0.55 - 0.12 * face * (sm(150, 175, yy) * sm(200, 180, yy) + G(x, yy - 100, z - 105, 18)) + 0.06 * m2;
      // --- eyes: shadow under them and in the upper lid's crease, the lash line, pink inner corners
      const ex = ax - EYE.x, ey = yy - EYE.y;
      if (Math.abs(ex) < 26 && ey > -22 && ey < 20) {
        const op = eyeOpening(ex, ey, F), ew = F.eyeW ?? 15, ek = ew / 15;
        const under = G(ex + 2, ey + 9, 0, 7) * face * (L.under ?? 1);
        c[0] *= 1 - 0.1 * under; c[1] *= 1 - 0.15 * under; c[2] *= 1 - 0.06 * under;
        if (L.eyeShade) {
          // (the lid under a heavy brow is in its shadow, between the lashes and the brow)
          const lid = L.eyeShade * G(ex + 1, ey - 6.5, 0, 6.5) * sm(0, 4, ey) * face;
          c[0] *= 1 - 0.3 * lid; c[1] *= 1 - 0.36 * lid; c[2] *= 1 - 0.34 * lid;
        }
        // the crease above the lid, following the opening's arc about 6 mm higher
        // (a hooded lid's fold hangs close over the lashes: its crease lower and darker)
        const cz = L.eyeShade ? 4 : 5.5, crease = Math.exp(-(((op + cz) / 1.2) ** 2)) * sm(-1, 3, ey) * sm(17 * ek, 9 * ek, Math.abs(ex + 1));
        mix((L.eyeShade ? 0.7 : 0.45) * crease, c[0] * 0.6, c[1] * 0.52, c[2] * 0.52); hh -= crease * 0.5;
        // the lash line: dark along the upper edge, softer along the lower
        // (a deep-set eye has no lash strip: its lashes are this line, softer and wider, darkest along the upper lid)
        // (along the upper lid it sits on the lid's front, above the edge: the edge itself rolls in towards the eye, facing down,
        // and a line painted there doesn't show from the front)
        const lw = L.eyeShade ? 1.4 : 0.9, lo = L.eyeShade && ey > 0 ? 1 : 0;
        const lashes = Math.exp(-(((op - lo) / lw) ** 2)) * (ey > 0 ? 1 : 0.35) * sm(16 * ek, 11 * ek, Math.abs(ex + 0.5));
        mix((L.eyeShade ? 0.85 : 0.8) * lashes, 0.08, 0.05, 0.04);
        mix(0.6 * G(ex + ew, ey + 0.5, 0, 2.6), 0.75, 0.42, 0.42);
      }
      // --- brows: strokes along the brow ridge, thickest at the inner end
      const bx = ax - (L.browIn ?? 6);
      if (bx > -2 && bx < 48 && yy > 118 && yy < 150) {
        const arch = L.browArch ?? 1, lift = (L.browLift ?? 0) * sm(24, 44, bx);
        const top = 136 - (F.browDrop ?? 0) + (L.browY ?? 0) + 5 * arch * Math.sin(Math.min(1, bx / 30) * Math.PI * 0.7) - 0.06 * (L.browTail ?? 1) * Math.max(0, bx - 30) ** 1.5 - 5.5 * (1 - arch) * sm(16, 0, bx) + lift;
        const bk = L.brows ?? 1, thick = lerp(8, lerp(3.2, 5.8, L.browEven ?? 0), sm(0, 44, bx)) * bk;
        const d = (yy - (top - thick / 2)) / (thick / 2);
        const brow = Math.exp(-(d * d) * 1.2) * sm(-2, 3, bx) * sm(48, 38, bx) * face;
        if (brow > 0.01) {
          // (evenly thick brows' hairs coarser and softer: noise finer than the texels reads as a ragged edge)
          const ev = L.browEven ?? 0, s1 = tnoise(tx * lerp(0.12, 0.3, ev), ty * lerp(2.2, 0.8, ev), w * lerp(0.12, 0.3, ev), 5), s2 = tnoise(tx * 0.3, ty * lerp(3.1, 1.2, ev), w * 0.3, 6);
          // (filled solid in its middle, the hairs showing at its edges)
          const hairs = brow * lerp(sm(0.35 - 0.25 * (bk - 1), 0.65 - 0.2 * (bk - 1), s1 * 0.6 + s2 * 0.4), 1, (L.browFill ?? 0) * sm(0.35, 0.75, brow));
          mix((L.beardHair ? 0.72 : 0.95) * hairs, BROW[0], BROW[1], BROW[2]); hh += hairs * 0.7; rr += hairs * 0.25;
        }
      }
      // --- nostrils
      if (ax < 20 && Math.abs(yy - nb) < 16 && z > 80) {
        // (with a crease round the wings, a little forward and apart: seen from the front, at the base of the tip)
        const nf = L.alar ? 3 : 0, nk = L.nostrils ?? 1, nos = G(ax - (F.noseW - 10 + nf * 0.6), yy - (nb - 5.5 + (nk - 1) * 1.5), (z - (tz - 10 + (nk - 1) * 6 + nf)) * 0.5, 3.2 * Math.sqrt(nk)) * sm(nb - 1, nb - 5 - (nk - 1) * 2, yy);
        mix(Math.min(0.95, 0.9 * nk * nos), 0.12, 0.05, 0.04);
        if (L.alar) {
          // the crease round each wing of the nose, and the tip catching the light (a column of even skin reads flat)
          const r = Math.hypot((ax - (F.noseW - 6.5)) / 7.5, (yy - (nb - 3)) / 6.8);
          // (over the top of the wing and round its outside: below, the nostril is the shadow)
          const crease = L.alar * Math.exp(-(((r - 1) / 0.2) ** 2)) * sm(F.noseW - 9, F.noseW - 4, ax) * sm(nb - 5, nb - 1, yy);
          c[0] *= 1 - 0.22 * crease; c[1] *= 1 - 0.27 * crease; c[2] *= 1 - 0.27 * crease;
          rr -= L.alar * 0.18 * G(x, yy - nb, (z - tz) * 0.6, 6);
        }
      }
      // --- lips: the vermilion with its fine vertical lines, and the line between them
      // (at the height the shape builds them: the lower face stretched for a longer face, as in headSDF; unstretched, on a
      // face of `long` 0.95 the line between the lips was painted 3.4 mm under their crease, a second line)
      const yq = yy < 114 ? 114 - (114 - yy) / F.long : yy;
      const axm = ax / (F.mouthW ?? 1), my = mouthY(Math.min(axm, 24)), mouth = axm < 30 && yq > 25 && yq < 62 && z > 80;
      const top = mouth ? lipBorder(ax, 1, F) : 0, bot = mouth ? lipBorder(ax, -1, F) : 0;
      const lipK = mouth ? sm(top + 0.3, top - 0.9, yq) * sm(bot - 0.3, bot + 0.9, yq) * sm(84, 90, z) : 0;
      if (mouth && z > 84) {
        // (the pale roll along the upper lip's border, and the skin under the lower lip in its shade)
        const roll = Math.exp(-(((yq - top - 0.6) / 0.6) ** 2)) * sm(22, 14, axm) * sm(84, 90, z);
        mix(0.07 * roll, 1, 0.92, 0.86);
        const under = Math.exp(-(((yq - bot + 1.6) / 1.4) ** 2)) * sm(15, 5, axm) * sm(84, 90, z) * (1 - lipK);
        c[0] *= 1 - 0.13 * under; c[1] *= 1 - 0.16 * under; c[2] *= 1 - 0.16 * under;
      }
      if (lipK > 0.01) {
        // dusky rose: the upper lip darker (it faces down), the lower lighter and wetter at its middle, both darker into
        // the corners and the lower one under its curve
        const lo = yq < my ? 1 : 0;
        const lc = L.lipColor ?? [0.6, 0.34, 0.32];
        mix(0.62 * (L.lipTint ?? 1) * lipK, lc[0] + 0.04 * lo, lc[1] + 0.03 * lo, lc[2] + 0.02 * lo);
        const mid = lo * sm(9, 2, axm) * Math.exp(-(((yq - (my + bot) / 2 - 0.8) / 1.3) ** 2));
        const shade = (1 - lo) * 0.07 * sm(top - 0.5, my + 0.5, yq) + 0.1 * sm(12, 22, axm) + lo * 0.1 * sm(bot + 3, bot + 0.5, yq);
        const k = 1 + (0.05 * mid - shade) * lipK;
        c[0] *= k; c[1] *= k; c[2] *= k;
        hh += lipK * 0.25 * Math.sin(x * 9 + Math.sin(yq * 2) * 0.6); rr -= lipK * (0.12 + 0.1 * lo + 0.06 * mid) * (L.lipGloss ?? 1);
      }
      // the line between the lips, darker into the corners
      if (mouth) {
        // (darkest where they press together; thinning out before the corners, not on into the cheek)
        const line = Math.exp(-(((yq - my) / (0.75 - 0.2 * sm(14, 22, axm))) ** 2)) * sm(23, 18, axm) * sm(84, 90, z) * (1 - 0.3 * sm(8, 20, axm));
        mix(0.85 * line, 0.16, 0.06, 0.05); hh -= line * 0.8;
      }
      // --- age: lines across the brow, crow's feet at the eyes' outer corners
      if (L.age > 0 && z > 30 && yy > 95 && yy < 185) {
        const fh = sm(145, 150, yy) * sm(178, 168, yy) * sm(55, 30, ax) * face;
        const lines = Math.max(0, Math.sin(yy * 0.62 + Math.sin(x * 0.09) * 1.2 + vnoise(x / 20, yy / 20, 0, 7) * 2)) ** 6;
        hh -= L.age * fh * lines * 0.5;
        c[0] *= 1 - L.age * fh * lines * 0.05; c[1] *= 1 - L.age * fh * lines * 0.07; c[2] *= 1 - L.age * fh * lines * 0.07;
        const cf = G(ex - 20, ey - 1, 0, 7) * face;
        const rays = Math.max(0, Math.sin(Math.atan2(ey - 1, ex - 14) * 11)) ** 5;
        hh -= L.age * cf * rays * 0.6;
      }
      // --- the folds from the nose's wings round the mouth (a clean-shaven face without them read as a boy's): the cheek
      // overhanging the mouth's surround, a soft light on it and a broad soft shade under it fading towards the lip, no
      // line; from the crease at the wing, faded out by the mouth's corner (a dark groove read as a drawn wrinkle, an edge
      // of tone with a light stripe beside it as an inked bracket)
      if (L.folds && z > 60 && yy > 20 && yy < nb + 8) {
        const y0 = nb + 5, y1 = mouthY(24) - 1, f = clamp((y0 - yy) / (y0 - y1), 0, 1);
        // (how far out on the cheek's side of the fold, mm: hugging the wing, then bowing out round the mouth)
        const out = ax - (14 + 20 * Math.pow(f, 0.6));
        const k = L.folds * sm(-0.1, 0.15, f) * sm(1.05, 0.55, f) * face;
        const shade = k * sm(1.5, -1, out) * Math.exp(-((Math.min(0, out) / 6) ** 2));
        const lit = k * sm(-1, 2, out) * Math.exp(-((Math.max(0, out - 2) / 6) ** 2));
        c[0] *= 1 - shade * 0.08 + lit * 0.035; c[1] *= 1 - shade * 0.1 + lit * 0.035; c[2] *= 1 - shade * 0.1 + lit * 0.03;
      }
      // --- the beard: dense short hairs growing down, lighter strands through it, stubble at its edge
      const b = yy < 125 && z > -40 ? L.beard * beardAt(ax, yy, z, F, 1.5 + 2.5 * (L.stubble ?? 0)) : 0;
      if (b > 0.005) {
        // (cropped short, the strokes are short too: long ones read as a full beard's strands)
        const st0 = L.stubble ?? 0, sy = lerp(0.12, 0.7, st0);
        const s1 = tnoise(tx * 0.9, ty * sy, w * 0.9, 8), s2 = tnoise(tx * 0.45, ty * sy * 0.6, w * 0.45, 9), s3 = tnoise(tx * 1.7, ty * 1.7, w * 1.7, 10);
        const dense = sm(0.15, 0.6, b);
        const st = L.stubble ?? 0, s4 = tnoise(tx * 2.6, ty * 2.6, w * 2.6, 13);
        // (thickest on the chin and the moustache)
        const thick = Math.max(sm(22, 10, ax) * sm(40, 20, yy), sm(24, 12, ax) * sm(mouthY(0) + 2, mouthY(0) + 6, yy) * sm(nb, nb - 4, yy));
        const cover0 = (dense * (0.78 + 0.22 * sm(0.3, 0.7, s1)) + (1 - dense) * sm(0.55, 0.8, s3) * b * 2) * (1 - st * (0.62 - 0.45 * sm(0.45, 0.72, s4)) * (1 - 0.2 * thick)) * (1 - st * 0.35 * sm(24, 40, ax) * sm(45, 65, yy)) * (1 - st * 0.4 * sm(18, 30, ax) * sm(26, 44, yy) * sm(70, 58, yy));
        let cover = cover0, dk = 1 - 0.3 * st0;
        if (L.beardClump) {
          // (fine hairs in the head's own mm round the face, short strands the way they grow: down the chin, down and out
          // over the cheeks, out along the moustache to the mouth's corners; softly, in patches, as dense on average as the
          // beard: hairs finer than a texel average out at a distance to one flat tone, and a hard-edged pattern reads as
          // wood grain. Thickest on the moustache, in a patch under the lower lip and along the jaw, thinner beside the chin
          // under the mouth's corners, the corners themselves clear; the skin between the hairs in their shade)
          const bc = L.beardClump, my0 = mouthY(0), soul = sm(12, 5, ax) * sm(my0 - 17, my0 - 10, yy) * sm(my0 - 3, my0 - 7, yy);
          const corner = Math.exp(-(((ax / (F.mouthW ?? 1) - 23) / 3.5) ** 2) - ((yy - mouthY(23)) / 4) ** 2);
          const beside = sm(14, 20, ax) * sm(36, 28, ax) * sm(my0 - 30, my0 - 20, yy) * sm(my0 - 2, my0 - 8, yy), jawLine = sm(30, 12, yy) * sm(12, 30, ax);
          const dens = clamp((dense * 0.9 + (1 - dense) * b) * (1 - st * 0.42 * (1 - 0.2 * thick)) * (1 - st * 0.35 * sm(24, 40, ax) * sm(45, 65, yy)) * (1 - st * 0.4 * sm(18, 30, ax) * sm(26, 44, yy) * sm(70, 58, yy))
            * (1 + 0.4 * thick + 0.6 * soul + 0.35 * jawLine) * (1 - 0.7 * corner) * (1 - 0.35 * beside), 0, 1);
          const overLip = sm(my0 - 1, my0 + 4, yy) * sm(nb + 1, nb - 3, yy) * sm(30, 20, ax);
          const th = Math.sign(x) * lerp(0.35 * sm(8, 50, ax), lerp(0.3, 1, sm(3, 22, ax)), overLip);
          const arc = Math.atan2(x, z + 10) * 75, cs = Math.cos(th), sn = Math.sin(th), ac = arc * cs + yy * sn, al = -arc * sn + yy * cs;
          const fib = 0.55 * vnoise(ac / 0.25, al / 1.6, 0, 15) + 0.45 * vnoise(ac / 0.15, al / 0.9, 7.7, 16);
          const dn = clamp(dens * (0.75 + 0.5 * vnoise(arc / 4, yy / 5, 3.3, 17)), 0, 1);
          cover = lerp(cover0, clamp(dn * (0.35 + 1.3 * sm(0.3, 0.75, fib)), 0, 0.95), bc);
          const shade = 1 - 0.12 * dn * bc;
          c[0] *= shade; c[1] *= shade; c[2] *= shade;
          dk = lerp(dk, 0.92, bc);
        }
        const strand = sm(0.55, 0.8, s2);
        const sk = 0.55 * (1 - 0.6 * st0);
        let hr = lerp(BH[0], L.streak[0], strand * sk) * dk, hg = lerp(BH[1], L.streak[1], strand * sk) * dk, hb = lerp(BH[2], L.streak[2], strand * sk) * dk;
        if (L.grey > 0 && tnoise(tx * 0.5, ty * 0.05, w * 0.5, 11) > 1 - L.grey) { hr = 0.42; hg = 0.4; hb = 0.38; }
        mix(clamp(cover, 0, 0.97), hr, hg, hb);
        hh += b * (s1 * 0.9 + s3 * 0.3); rr = lerp(rr, 0.8, clamp(cover, 0, 1));
      }
      // --- the scalp under the hair
      // (hair cut short at the nape, `nape`, thins out down the neck below its line in streaks the way it grows: ending
      // at the line, the hair under a hat was a dark shell with a hard edge across the back of the neck)
      const fade = L.nape ? NAPE_FADE * sm(1.9, 2.5, Math.atan2(ax, z + 12)) : 0;
      const sc0 = yy > 70 - (L.nape ?? 0) - fade ? scalp(ax, yy, z, L.hairDrop, L.templeDrop, L.nape) : 0;
      const s1 = tnoise(tx * 0.9, ty * 0.15, w * 0.9, 12);
      const line = fade ? hairline(ax, z, L.hairDrop, L.templeDrop, L.nape) : 0;
      const sc = fade ? Math.max(sc0, sm(line - fade, line + 3, yy) * sm(0.25, 0.75, s1 + 0.35 * sm(line - fade, line, yy))) : sc0;
      if (sc > 0) {
        mix(sc * 0.97, lerp(HAIR[0], L.streak[0], s1 * 0.4), lerp(HAIR[1], L.streak[1], s1 * 0.4), lerp(HAIR[2], L.streak[2], s1 * 0.4));
        hh += sc * s1 * 0.6; rr = lerp(rr, 0.75, sc);
      }
      if (aoAt) {
        // (light that reaches a crease has gone through skin and comes out redder; leave the neck to the lighting)
        const neck = F.neckCol ? sm(0, 8, neckColumn(ax, yy, z, F)) : 1;
        const k = 1 - L.ao! * neck * (1 - aoAt(tx, ty));
        c[0] *= k ** 0.75; c[1] *= k; c[2] *= k ** 1.15;
      }
      // (a column neck's skin as plain down to the seam as the rig's neck below it, its relief and sheen easing out: ending at
      // it, the face's pores, stretched down the neck by the grid's sparse rows there, showed as a crumpled band)
      if (F.neckCol) {
        const cz = neckCos(ax, z, F), s = neckSeam(cz), nk = sm(s, s + 40, yy), pk = sm(s, s + NECK_PAINT, yy);
        hh *= nk; rr = lerp(L.ao ? 0.88 : 0.6, rr, nk);
        // (and its colour the rig's neck's own by the seam)
        if (pk < 1) for (let ch = 0; ch < 3; ch++) c[ch] = lerp(L.skin[ch] * PLAIN_SKIN, c[ch], pk);
      }
      albedo[i * 4] = clamp(c[0], 0, 1) * 255; albedo[i * 4 + 1] = clamp(c[1], 0, 1) * 255; albedo[i * 4 + 2] = clamp(c[2], 0, 1) * 255; albedo[i * 4 + 3] = 255;
      const rv = clamp(rr, 0.2, 0.95) * 255;
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
      hgt[i] = hh;
    }
  }
  const normal = new Uint8ClampedArray(n * 4);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx, l = ty * w + (tx + w - 1) % w, rt = ty * w + (tx + 1) % w;
    const up = Math.max(0, ty - 1) * w + tx, dn = Math.min(h - 1, ty + 1) * w + tx;
    const dx = (hgt[rt] - hgt[l]) * 1.5, dy = (hgt[dn] - hgt[up]) * 1.5, len = Math.hypot(dx, dy, 1);
    normal[i * 4] = (-dx / len * 0.5 + 0.5) * 255; normal[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255; normal[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; normal[i * 4 + 3] = 255;
  }
  return { w, h, albedo, normal, rough };
}

/** the face maps' size, and the grid they are painted on (any grid of the head shares its uvs) */
const MAP_W = 1024, MAP_H = 512;

/** A hero's face maps, as the loading workers make them (core/pbr.ts), with the grid they're painted on: the head's at
 *  full detail (models/head.ts), so it's cast once. */
export function faceData(who: keyof typeof FACES): PBRData {
  const F = FACES[who], grid = headGrid(F, ...gridSize(F, 112, 88)), P = paintFace(F, LOOKS[who], grid, MAP_W, MAP_H);
  return { size: P.w, height: P.h, albedo: P.albedo, normal: P.normal, rough: P.rough, grid };
}
