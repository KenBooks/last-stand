// The village's signs painted to be read from afar (the signposts' arms, signposts.ts, and the houses' signs over their
// doors, door.ts): a flat painted board, ivory, with faint brush streaks and a dark painted border, the name lettered
// plain and heavy in the game's own sans in dark paint, filling the board; its face flat and lit no brighter than the
// bloom lets it stay readable. From Viktor, of the first ones (dark boards, thin gilt letters): "signs need better
// visibility at the distance... maybe bolder text, different wood grain", and of the houses' after the arms were
// painted so: "labels on houses should be high contrast as well".
import * as THREE from 'three';
import { mulberry } from '../util';
import { tsl } from '../core/webgpu';
import type { OwnLooks } from '../core/shaderPorts';

/** the paint: the board's ivory at its top and foot, its brush streaks, and the dark its border and letters are
 *  painted in */
export const PAINT = { top: '#d8cbac', foot: '#c4b592', streak: '90,70,40', ink: '#1c140c' };
/** the most light a painted face gives back (a luminance): well under the bloom's threshold, 0.9 (`UnrealBloomPass` in
 *  core/renderer.ts, `bloom` in core/webgpu.ts). From Kenneth's look at night: the pale arm a hand's width from a
 *  street lamp was lit past it, bloomed into a white bar its name couldn't be read on, and the arm beside it nearly so;
 *  the dark boards before never reached it. Capped, the board is lit as bright as it may be and its letters, dark,
 *  stay dark on it; the lamp is as it was. At 0.78 it no longer bloomed, but the night's adaptation still lit it near
 *  white and thinned its letters; at 0.35 it reads at midnight, and the sun at noon never lights a board that far (its
 *  pictures at 0.35 and 0.5 alike), so only a lamp's near side is held. */
const FACE_MOST = 0.35;
/** the painted face's roughness: a dull, weathered paint, no sheen to catch a lamp */
const FACE_ROUGH = 0.92;

/** A board's face `w` by `h` px painted with `name`, as a street sign is: a flat painted board, ivory, with faint
 *  brush streaks along it and a dark painted border, and the name lettered plain and heavy in the game's own sans
 *  (Alegreya Sans, bold capitals, a little apart), in dark paint. From Kenneth, of the arms before (pale wood of an open
 *  grain with knots, the names cut in Cinzel's heaviest): "try a different texture or something, the text is not easy
 *  to read": the grain and the knots ran through the letters, and the serifs blurred at a distance. Without its `ends`,
 *  its border runs along its top and foot alone, open at either end (an arm's: its paint runs on over its point). */
export function paintBoard(c: CanvasRenderingContext2D, w: number, h: number, name: string, ends = true): void {
  const rng = mulberry(name.length * 53 + name.charCodeAt(0));
  c.fillStyle = boardGround(c, h);
  c.fillRect(0, 0, w, h);
  // (its brush streaks: faint, along it, none strong enough to cross a letter)
  for (let k = 0; k < 24; k++) {
    c.strokeStyle = `rgba(${PAINT.streak},${0.04 + rng() * 0.05})`;
    c.lineWidth = 2 + rng() * 4;
    const y = rng() * h;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y + (rng() - 0.5) * 3);
    c.stroke();
  }
  // its border, painted dark, and a thin line inside it; or, without its ends, a band along its top and foot alone
  const band = boardBand(h);
  if (ends) {
    c.strokeStyle = PAINT.ink;
    c.lineWidth = band;
    c.strokeRect(band / 2, band / 2, w - band, h - band);
    c.lineWidth = Math.max(1, h * 0.015);
    c.strokeRect(band * 1.9, band * 1.9, w - band * 3.8, h - band * 3.8);
  } else {
    c.fillStyle = PAINT.ink;
    c.fillRect(0, 0, w, band);
    c.fillRect(0, h - band, w, band);
  }
  // the name, plain and heavy, as large as the board takes
  const text = name.toUpperCase();
  let size = h * 0.6;
  const font = (px: number): string => `700 ${px}px 'Alegreya Sans', 'Trebuchet MS', sans-serif`;
  const spaced = (px: number): void => {
    c.font = font(px);
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(px * 0.06).toFixed(1)}px`;
  };
  spaced(size);
  const room = w - band * 6;
  while (c.measureText(text).width > room && size > 8) spaced(size -= 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = PAINT.ink;
  c.fillText(text, w / 2, h / 2 + size * 0.05);
}

/** The board's ground on `c`, `h` px tall: its ivory, a little darker toward its foot. */
export function boardGround(c: CanvasRenderingContext2D, h: number): CanvasGradient {
  const ground = c.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, PAINT.top);
  ground.addColorStop(1, PAINT.foot);
  return ground;
}

/** The width of a board's painted border, `h` px tall (px). */
export const boardBand = (h: number): number => Math.max(3, h * 0.07);

/** `m` painted flat: none of the planks' relief or roughness maps it was copied with, so the light lies even over the
 *  paint (the planks' grooves, at its picture's scale, rippled the light across the letters). */
export function flatFace<M extends THREE.Material>(m: M): M {
  const standard = m as unknown as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial) {
    standard.normalMap = null;
    standard.bumpMap = null;
    standard.roughnessMap = null;
    standard.roughness = FACE_ROUGH;
  }
  return m;
}

/** `m` lit no brighter than `FACE_MOST`: what it gives back scaled down to that luminance where it would be more (its
 *  hue kept), on WebGL by a line after its output (its program's key told), on WebGPU by its output node. */
export function underBloom<M extends THREE.Material>(m: M): M {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  const most = FACE_MOST.toFixed(3);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { float faceLit = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        if (faceLit > ${most}) gl_FragColor.rgb *= ${most} / faceLit; }`);
  };
  m.customProgramCacheKey = () => `${key}|underBloom`;
  (m as unknown as OwnLooks).webgpuLooks = (converted) => {
    const out = tsl.output, lit = tsl.dot(out.rgb, tsl.vec3(0.2126, 0.7152, 0.0722));
    converted.outputNode = tsl.vec4(out.rgb.mul(tsl.min(1, tsl.float(FACE_MOST).div(tsl.max(lit, 1e-4)))), out.a);
  };
  return m;
}

/** A painted face: `m` flat and held under the bloom. */
export const paintedFace = <M extends THREE.Material>(m: M): M => underBloom(flatFace(m));
