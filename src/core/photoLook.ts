// Photo mode's look (ui/photo.ts): exposure, bloom, contrast, saturation, a colour filter, the vignette and a focus blur,
// each a uniform of the post chain the boot compiled (the grade's `uPhoto` branch in core/renderer.ts, bloom's strength),
// so nothing compiles as a slider moves ("Settings switch live", the root's rules). With photo mode off the grade
// passes its branch by (`uPhoto` 0) and every value is the game's own again.
import * as THREE from 'three';
import { BLOOM_STRENGTH, gradeUniforms, setBloomStrength } from './renderer';
import { WEBGPU } from './webgpu';

/** the colour filters, by name */
export type PhotoFilter = 'none' | 'warm' | 'cool' | 'sepia' | 'mono' | 'cinematic';
export const PHOTO_FILTERS: readonly PhotoFilter[] = ['none', 'warm', 'cool', 'sepia', 'mono', 'cinematic'];
/** what the panel calls each */
export const FILTER_NAMES: Record<PhotoFilter, string> = {
  none: 'None', warm: 'Warm', cool: 'Cool', sepia: 'Sepia', mono: 'B&W', cinematic: 'Cinematic',
};

/** A look: every value photo mode sets. */
export interface PhotoLook {
  /** the light multiplied before it's compressed and tone mapped (1 the game's) */
  exposure: number;
  /** bloom's strength (the game's `BLOOM_STRENGTH`) */
  bloom: number;
  /** around the middle grey, as shown (1 the game's) */
  contrast: number;
  /** 0 grey to 2 twice as rich (1 the game's) */
  saturation: number;
  filter: PhotoFilter;
  /** how much of the filter is laid over (0 to 1) */
  filterStrength: number;
  /** the vignette as the grade draws it (`uVignette`: 1.05 the game's, 0 none) */
  vignette: number;
  /** the focus blur, 0 none to 1 its most, and where its band in focus lies (0 the frame's foot, 1 its top) */
  blur: number;
  focus: number;
}

/** the vignette as the game draws it (`GradeShader.uVignette`) */
export const GAME_VIGNETTE = 1.05;

/** The look photo mode opens with: the game's own. */
export const NEUTRAL_LOOK: Readonly<PhotoLook> = {
  exposure: 1, bloom: BLOOM_STRENGTH, contrast: 1, saturation: 1, filter: 'none', filterStrength: 1,
  vignette: GAME_VIGNETTE, blur: 0, focus: 0.5,
};

/** the share of the frame's height either side of the focus line kept sharp */
const FOCUS_BAND = 0.08;

/** Rows of a 3x3 matrix, as `Matrix3.set` takes them. */
type Rows = readonly [number, number, number, number, number, number, number, number, number];
const SAME: Rows = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MONO: Rows = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];
/** Each filter's matrices for the shadows and for the highlights (the same for all but the cinematic's teal and
 *  orange), on the frame as shown. */
const FILTERS: Record<PhotoFilter, { lo: Rows; hi: Rows }> = {
  none: { lo: SAME, hi: SAME },
  warm: { lo: [1.08, 0.02, 0, 0, 1.0, 0, 0, 0, 0.84], hi: [1.08, 0.02, 0, 0, 1.0, 0, 0, 0, 0.84] },
  cool: { lo: [0.88, 0, 0, 0, 0.99, 0.02, 0, 0.03, 1.12], hi: [0.88, 0, 0, 0, 0.99, 0.02, 0, 0.03, 1.12] },
  sepia: {
    lo: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
    hi: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
  },
  mono: { lo: MONO, hi: MONO },
  cinematic: { lo: [0.82, 0.06, 0.04, 0, 1.0, 0.06, 0, 0.08, 1.14], hi: [1.14, 0.04, 0, 0.02, 1.0, 0, 0, 0, 0.8] },
};

/** What of the look the renderer in use can draw: the grade's branch is WebGL's (WebGPU's grade has no port of it). */
export const GRADE_LOOK_DRAWN = !WEBGPU;

/** `look` put on the post chain, `on` (photo mode open) or not: off, the grade passes it by and bloom is the game's. */
export function applyPhotoLook(look: Readonly<PhotoLook>, on: boolean): void {
  const u = gradeUniforms();
  u.uPhoto.value = on ? 1 : 0;
  u.uExposure.value = look.exposure;
  u.uContrast.value = look.contrast;
  u.uSaturation.value = look.saturation;
  const filter = FILTERS[look.filter];
  (u.uFilterLo.value as THREE.Matrix3).set(...filter.lo);
  (u.uFilterHi.value as THREE.Matrix3).set(...filter.hi);
  u.uFilterMix.value = look.filter === 'none' ? 0 : look.filterStrength;
  u.uBlur.value = look.blur;
  u.uFocusY.value = look.focus;
  u.uFocusBand.value = FOCUS_BAND;
  u.uVignette.value = on ? look.vignette : GAME_VIGNETTE;
  setBloomStrength(on ? look.bloom : BLOOM_STRENGTH);
}
