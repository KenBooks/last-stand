// Material kit: every entity builds its materials through a kit so that
// shared per-entity FX uniforms (dissolve, frozen, charred, hit flash) can be driven
// with a single write each frame.
import * as THREE from 'three';
import { tunable } from './tuning';
import { readCookie, writeCookie } from './cookies';

/**
 * Through the eyes the hero's own gear is held a hand's breadth from them, and a light's highlight on it fills the
 * view: the sun on a blade's flat (steel polished to 0.3) blew it out white and bloomed over 7.7% of the frame,
 * its rougher grime left as dark blots across it. There the highlights on his materials are eased from half of
 * `eyes` (light, HDR) towards it, as the eye stops down for a glint that near (`kit.u.uShine`, set each frame by his
 * player; 0 elsewhere, as they are). Measure with `npm run lab -- haze --class warrior --gear dual`.
 */
export const SHINE = tunable('shine', { eyes: 0.7 });

/**
 * Effect glows dim with their distance from the camera, the way a light up close dazzles and the eye stops
 * down: full strength from NEAR_GLOW.ref metres (the top-down camera, which effects are tuned for), then
 * (distance / ref)^pow, never below min.
 */
export const NEAR_GLOW = { ref: 20, pow: 0.75, min: 0.25 };
const NEAR_GLOW_GLSL = /* glsl */`
float nearGlow(){ return clamp(pow((1.0 / gl_FragCoord.w) / ${NEAR_GLOW.ref.toFixed(1)}, ${NEAR_GLOW.pow.toFixed(2)}), ${NEAR_GLOW.min.toFixed(2)}, 1.0); }`;

/**
 * A worn item's glow in its rarity's colour (#404, from play: "slight glow, not much, no light source", "should not
 * make it flat", "subtly animated (slowly)", "glow should be on the object, not around it", "tendrils need to animate
 * too, not just pan", "make sure glow is continuous/looped and not jumping"): tendrils of light on the item's own
 * surface, `strength` times its rarity's colour, `face` of it over all the item. A noise in the item's own space,
 * `across` cells a metre across it and `up` along it, warped by itself, its light in thin strands where it crosses
 * `centre`, `width` either side (light wherever it lay over a level made broad blobs, read on a robe as camouflage),
 * brighter over part of the item at a time, where the slow field that warps it is high (strands even everywhere made
 * a net; none outside those parts left a small item, a blade or a glove, without any);
 * as time goes on it drifts `rise` cells up and moves `turns` cells on through its own time each `cycle` s, and
 * wraps at both: after a cycle it is exactly where it began, so it loops with no join (a crossfade between two cycles
 * was seen as one; so was an odd `turns`, which its warp's half scale left a cell short: both are rounded even). Chosen on a flat panel first (`.tmp`'s live page, then `lab glow`); an outline, an even tint
 * and blotches were each turned down. A material's own colour (its `kitLooks.aura`, black for none), the same shape
 * for all: `ITEM_GLOW` the shape, `tickItemGlow` its clock, the colour the item's (`models/itemGlow.ts`).
 */
export const ITEM_GLOW = tunable('itemGlow', {
  strength: 0.07, face: 0.05, across: 6, up: 3, centre: 0.5, width: 0.05, rise: 2, turns: 4, cycle: 16,
  // the weapon's glow this many times the rest: its brightest strands past the bloom's threshold, a soft light round
  // them (from play: "a bit of glow on weapon only, in addition to the shader"); read as its gear is set. The rest at
  // 0.07 (0.12 before: "more subtle... 4 player coop might look too distracting"), the weapon kept as it was
  weapon: 10,
});
/** the glow's shape (x its cells a metre across, y along, z the level its strands lie on, w how far either side), its loop (x the cells
 *  it rises a cycle, y the cells it moves on through time, z the face's share, w the strength) and its clock (the
 *  share of its cycle, 0 to 1: kept small on the CPU, as a game's time grows past what a float holds finely) */
const AURA_SHAPE = { value: new THREE.Vector4() };
const AURA_LOOP = { value: new THREE.Vector4() };
const AURA_CLOCK = { value: 0 };
/** what WebGPU's kit reads them by (core/shaderPorts.ts `kitNodes`) */
export const itemGlowUniforms = { shape: AURA_SHAPE, loop: AURA_LOOP, clock: AURA_CLOCK };

/** A loop's cells rounded to an even count: the noise wraps where the cycle does only in whole cells, and the slow
 *  field that warps it runs at half the scale (`turns` 3 left it 1.5 cells, and it jumped as each cycle began). */
const wholeAtHalf = (cells: number): number => Math.max(2, 2 * Math.round(cells / 2));

/** the setting (Settings' Gear glow, the cookie): on unless turned off ("opt in, enabled by default, but can be
 *  disabled in pause menu settings"); off, the glow's strength is 0, a uniform's value: nothing compiles, and a
 *  pixel passes its strands over (worked out and multiplied by nothing, Off saved none of the 3 to 10% of the frame
 *  the glow takes where gear fills the view: `npm run lab -- glowcost`). Until the player chooses, the quality
 *  level decides (`QualityPreset.gearGlow`: off at Very low; from play, "turn off gear glow automatically at very
 *  low, could be toggled on in settings if user prefers it on"). */
const GLOW_COOKIE = 'last-stand-gear-glow';
// Geometry workers import the material kit too; they have no page preferences or document.
const glowKept = typeof document === 'undefined' ? null : readCookie(GLOW_COOKIE);
/** the player's own choice, null while none was made */
let gearGlowChosen: boolean | null = glowKept === 'on' ? true : glowKept === 'off' ? false : null;
/** what the quality level in effect has it at */
let gearGlowByLevel = true;

/** Whether worn gear glows in its rarity's colour: the player's choice, else the quality level's. */
export const gearGlow = (): boolean => gearGlowChosen ?? gearGlowByLevel;

/** The setting: worn gear glowing or not, kept for the next visit, whatever the quality level. */
export function setGearGlow(on: boolean): void {
  gearGlowChosen = on;
  writeCookie(GLOW_COOKIE, on ? 'on' : 'off');
}

/** Whether worn gear glows at the quality level in effect, where the player hasn't chosen (core/quality.ts). */
export function setGearGlowByLevel(on: boolean): void {
  gearGlowByLevel = on;
}

/** The glow's clock moved to the game's (`G.time`, s), and its shape read, once a frame. */
export function tickItemGlow(time: number): void {
  const { strength, face, across, up, centre, width, rise, turns, cycle } = ITEM_GLOW;
  AURA_SHAPE.value.set(across, up, centre, width);
  AURA_LOOP.value.set(wholeAtHalf(rise), wholeAtHalf(turns), face, gearGlow() ? strength : 0);
  AURA_CLOCK.value = (((time % cycle) + cycle) % cycle) / cycle;
}

/**
 * The glow's pattern, GLSL (the kit's patch) and WGSL (WebGPU's kit, core/shaderPorts.ts) alike: a value noise whose
 * lattice wraps along y at `per.x` cells, and through time, slice by slice, at `per.y` (two of its 3D fields
 * blended a slice apart, each slice's at an offset of its own), so the pattern drifting up and moving on through
 * time comes back to itself after a cycle.
 */
export const AURA_GLSL = /* glsl */ `
float auraHash(vec3 c, float per){ c.y = mod(c.y, per); return fxHash(c); }
float auraNoise3(vec3 x, float per){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(auraHash(i,per),auraHash(i+vec3(1,0,0),per),f.x), mix(auraHash(i+vec3(0,1,0),per),auraHash(i+vec3(1,1,0),per),f.x),f.y),
             mix(mix(auraHash(i+vec3(0,0,1),per),auraHash(i+vec3(1,0,1),per),f.x), mix(auraHash(i+vec3(0,1,1),per),auraHash(i+vec3(1,1,1),per),f.x),f.y), f.z);
}
float auraNoise(vec3 p, float w, vec2 per){
  float s = floor(w); float f = fract(w); f = f*f*(3.0-2.0*f);
  float s0 = mod(s, per.y); float s1 = mod(s + 1.0, per.y);
  return mix(auraNoise3(p + vec3(17.31, 7.0, 11.13) * s0, per.x), auraNoise3(p + vec3(17.31, 7.0, 11.13) * s1, per.x), f);
}
float auraFbm(vec3 p, float w, vec2 per){
  return auraNoise(p, w, per)*0.5 + auraNoise(p*2.0+3.7, w*2.0, per*2.0)*0.3 + auraNoise(p*4.0+9.1, w*4.0, per*4.0)*0.2;
}
float auraWarp(vec3 p, float w, vec2 per){ return auraNoise(p, w, per)*0.62 + auraNoise(p*2.0+3.7, w*2.0, per*2.0)*0.38; }
float auraTendrils(vec3 at, float c, vec4 shape, vec4 loop){
  vec3 p = at * shape.xyx - vec3(0.0, c * loop.x, 0.0);
  float w = c * loop.y;
  vec2 per = loop.xy;
  vec2 warp = vec2(auraWarp(p * 0.5, w * 0.5, per * 0.5), auraWarp(p * 0.5 + vec3(5.0, 1.0, 3.0), w * 0.5 + 1.0, per * 0.5));
  float tex = auraFbm(p + vec3(warp.x, warp.y, warp.x) * 2.2, w, per);
  float strand = smoothstep(0.0, 1.0, 1.0 - abs(tex - shape.z) / shape.w);
  return loop.z + strand * mix(0.4, 1.0, smoothstep(0.3, 0.5, warp.x));
}
`;

const FX_CHUNK_COMMON = /* glsl */ `
uniform vec3 uAura;
uniform vec4 uAuraShape;
uniform vec4 uAuraLoop;
uniform float uAuraClock;
uniform float uDissolve;
uniform float uFrozen;
uniform float uChar;
uniform float uHit;
uniform vec3 uEdge;
uniform float uShine;
varying vec3 vFxPos;
${NEAR_GLOW_GLSL}
float fxHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float fxNoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fxHash(i),fxHash(i+vec3(1,0,0)),f.x), mix(fxHash(i+vec3(0,1,0)),fxHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(fxHash(i+vec3(0,0,1)),fxHash(i+vec3(1,0,1)),f.x), mix(fxHash(i+vec3(0,1,1)),fxHash(i+vec3(1,1,1)),f.x),f.y), f.z);
}
${AURA_GLSL}`;

/** A kit material's looks as WebGPU reads them (core/shaderPorts.ts `kitNodes`): the kit's uniforms, and the
 *  material's own near glow and rim. */
export interface KitLooks {
  u: Record<'uDissolve' | 'uFrozen' | 'uChar' | 'uHit' | 'uShine', { value: number }> & { uEdge: { value: THREE.Color } };
  near: { value: number };
  rim: { value: THREE.Color };
  /** the hood's shade (`Head.shade`): how deep, where up the mesh it's full, where it's gone, how much more aside */
  shade: { value: THREE.Vector4 };
  /** a worn item's glow in its rarity's colour (`ITEM_GLOW`), black for none: the material's own, never the kit's */
  aura: { value: THREE.Color };
}

export function createKit(edgeColor: THREE.ColorRepresentation = 0x66ffcc) {
  const u = {
    uDissolve: { value: 0 },
    uFrozen: { value: 0 },
    /** burnt: charred black, embers glowing in its cracks (a body the fire killed, entities/corpse.ts) */
    uChar: { value: 0 },
    uHit: { value: 0 },
    uEdge: { value: new THREE.Color(edgeColor).multiplyScalar(3) },
    /** the most light a highlight reflects, eased into from half of it (`SHINE`); 0: as it is */
    uShine: { value: 0 },
  };
  const mats: THREE.Material[] = [];

  /**
   * near: an enemy's glow dims near the camera like the effect glows (its eyes up close would dazzle).
   * rim: light added at glancing angles, the cheap stand-in for a physical material's sheen.
   * Both are the material's uniforms, not variants of its shader: every kit's material of a kind shares one program
   * (a variant each made 26 more programs at boot, each compiled for half a second on a first visit's ANGLE).
   */
  function patch<M extends THREE.Material>(m: M, near = false, rim?: THREE.Color): M {
    // (in a hood's shade, `Head.shade`: x how deep, y where up the mesh it's full, z where it's gone, w how much more
    // towards the sides; the game's shadow map is too coarse to shade a face under a brim)
    const shade = { value: new THREE.Vector4() };
    m.userData.shade = shade;
    // (what WebGPU reads its looks from, off the material drawn: core/shaderPorts.ts `kitNodes`; a property of its
    // own, not copied to a clone, as its `onBeforeCompile` isn't)
    const looks: KitLooks = {
      u, near: { value: near ? 1 : 0 }, rim: { value: rim ?? new THREE.Color(0) }, shade,
      aura: { value: new THREE.Color(0) },
    };
    Object.defineProperty(m, 'kitLooks', { value: looks, configurable: true });
    // (a method: three calls it on the material it compiles for, so a copy's own glow (`kitCopy`) is read off the copy;
    // a wrapper calling it with no material falls back to this one's)
    m.onBeforeCompile = function (this: THREE.Material | undefined, shader) {
      Object.assign(shader.uniforms, u);
      shader.uniforms.uAura = ((this as { kitLooks?: KitLooks } | undefined)?.kitLooks ?? looks).aura;
      shader.uniforms.uAuraShape = AURA_SHAPE;
      shader.uniforms.uAuraLoop = AURA_LOOP;
      shader.uniforms.uAuraClock = AURA_CLOCK;
      shader.uniforms.uNear = { value: near ? 1 : 0 };
      shader.uniforms.uRim = { value: rim ?? new THREE.Color(0) };
      shader.uniforms.uShade = shade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFxPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFxPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FX_CHUNK_COMMON + 'uniform float uNear;\nuniform vec3 uRim;\nuniform vec4 uShade;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55,0.8,1.0), uFrozen*0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045,0.035,0.03), uChar*0.9);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= mix(1.0, nearGlow(), uNear);
          totalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          if (uAuraLoop.w > 0.0 && dot(uAura, uAura) > 0.0) {
            // a worn item's glow (ITEM_GLOW): tendrils of light on its surface, drifting up on a loop; passed over
            // with the setting off (its strength 0) as on plain gear
            totalEmissiveRadiance += uAura * uAuraLoop.w * auraTendrils(vFxPos, uAuraClock, uAuraShape, uAuraLoop);
          }
          float dn = fxNoise(vFxPos*7.0)*0.65 + fxNoise(vFxPos*19.0)*0.35;
          if (uDissolve > 0.0 && dn < uDissolve) discard;
          float edge = uDissolve > 0.0 ? (1.0 - smoothstep(uDissolve, uDissolve + 0.09, dn)) : 0.0;
          totalEmissiveRadiance += uEdge * edge * 3.0;
          totalEmissiveRadiance += vec3(0.25,0.55,0.9) * uFrozen * 0.35;
          // charred: its own glow smothered, embers in the cracks the dissolve's noise draws
          totalEmissiveRadiance *= 1.0 - uChar * 0.7;
          totalEmissiveRadiance += vec3(1.0,0.32,0.06) * uChar * smoothstep(0.6, 0.78, dn) * 1.6 * nearGlow();
          // a tint, not white, dimmer near the camera like the effect glows: up close a body fills much of the screen
          totalEmissiveRadiance += vec3(1.0,0.9,0.85) * uHit * 0.45 * nearGlow();`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          if (uShade.x > 0.0) {
            float hood = uShade.x * clamp(smoothstep(uShade.z, uShade.y, vFxPos.y) + uShade.w * abs(vFxPos.x), 0.0, 1.0);
            reflectedLight.directDiffuse *= 1.0 - hood;
            reflectedLight.directSpecular *= 1.0 - hood;
            reflectedLight.indirectDiffuse *= 1.0 - hood;
            reflectedLight.indirectSpecular *= 1.0 - hood;
            totalEmissiveRadiance *= 1.0 - hood;
          }
          if (uShine > 0.0) {
            vec3 shine = reflectedLight.directSpecular;
            float most = max(max(shine.r, shine.g), shine.b), knee = 0.5 * uShine;
            if (most > knee) reflectedLight.directSpecular = shine * (knee + (most - knee) / (1.0 + (most - knee) / (uShine - knee))) / most;
          }`);
    };
    m.customProgramCacheKey = () => 'entityfx';
    mats.push(m);
    return m;
  }

  return {
    u,
    mats,
    std: (p?: THREE.MeshStandardMaterialParameters) => patch(new THREE.MeshStandardMaterial(p)),
    phys: (p?: THREE.MeshPhysicalMaterialParameters) => patch(new THREE.MeshPhysicalMaterial(p)),
    /** a standard material with a rim of `rim` light at glancing angles (skin, cloth) */
    rim: (p: THREE.MeshStandardMaterialParameters, rim: THREE.ColorRepresentation, strength = 1) =>
      patch(new THREE.MeshStandardMaterial(p), false, new THREE.Color(rim).multiplyScalar(strength)),
    // Unlit glow (eyes, crystals) - still dissolves via patch on MeshStandard with black base.
    // `near`: dims near the camera (enemies' glows; the heroes keep theirs)
    glow: (color: THREE.ColorRepresentation, intensity = 3, near = true) => patch(new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 1,
    }), near),
    dispose() { for (const m of mats) m.dispose(); },
  };
}

/** `copy`, a copy of a kit's material, given its looks on WebGPU, which `clone` leaves behind (what they read are the
 *  kit's own uniforms, so it shows them as its original does). */
export function sameLooks(copy: THREE.Material, original: THREE.Material): void {
  const { kitLooks } = original as { kitLooks?: KitLooks };
  if (kitLooks) (copy as unknown as { kitLooks: KitLooks }).kitLooks = kitLooks;
}

/** A kit material's copy of its own, drawn by the same program, its glow (`kitLooks.aura`) its own: an item's parts
 *  glow in its rarity's colour, the rest of the hero's in that material not (models/itemGlow.ts). Dyed with its
 *  original (models/dye.ts finds it by the hook they share). */
export function kitCopy<M extends THREE.Material>(original: M): M {
  const copy = original.clone() as M;
  copy.onBeforeCompile = original.onBeforeCompile;
  copy.customProgramCacheKey = original.customProgramCacheKey;
  // (its hood's shade its original's, the uniform the hook binds: `clone` copies user data through JSON, and the
  // head's `shade` set a plain object's value)
  copy.userData.shade = original.userData.shade;
  ownAura(copy, original);
  return copy;
}

/** `m` given looks of its own, as `from`'s but with a glow of its own (black), which it returns. */
export function ownAura(m: THREE.Material, from: THREE.Material = m): THREE.Color | null {
  const looks = (from as { kitLooks?: KitLooks }).kitLooks;
  if (!looks) return null;
  const aura = new THREE.Color(0);
  Object.defineProperty(m, 'kitLooks', { value: { ...looks, aura: { value: aura } }, configurable: true });
  return aura;
}

/**
 * Makes an effect material (built-in or a ShaderMaterial writing gl_FragColor at the end of main) dim
 * with distance, see NEAR_GLOW. Only for effects: the world's own glows keep their look.
 */
export function nearGlow<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    const f = sh.fragmentShader.replace(/void\s+main\s*\(\s*\)/, `${NEAR_GLOW_GLSL}
void main()`);
    const end = f.lastIndexOf('}');
    sh.fragmentShader = `${f.slice(0, end)}  gl_FragColor.rgb *= nearGlow();
}${f.slice(end + 1)}`;
  };
  m.customProgramCacheKey = () => 'nearGlow';
  return m;
}

// Additive, unlit HDR material for VFX meshes (dimming with distance, see nearGlow).
export function additive(color: THREE.ColorRepresentation, intensity = 2, opacity = 1): THREE.MeshBasicMaterial {
  return nearGlow(new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
  }));
}
