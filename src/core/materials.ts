// Material kit: every entity builds its materials through a kit so that
// shared per-entity FX uniforms (dissolve, frozen, charred, hit flash) can be driven
// with a single write each frame.
import * as THREE from 'three';
import { tunable } from './tuning';

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

const FX_CHUNK_COMMON = /* glsl */ `
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
`;

/** A kit material's looks as WebGPU reads them (core/shaderPorts.ts `kitNodes`): the kit's uniforms, and the
 *  material's own near glow and rim. */
export interface KitLooks {
  u: Record<'uDissolve' | 'uFrozen' | 'uChar' | 'uHit' | 'uShine', { value: number }> & { uEdge: { value: THREE.Color } };
  near: { value: number };
  rim: { value: THREE.Color };
  /** the hood's shade (`Head.shade`): how deep, where up the mesh it's full, where it's gone, how much more aside */
  shade: { value: THREE.Vector4 };
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
    const looks: KitLooks = { u, near: { value: near ? 1 : 0 }, rim: { value: rim ?? new THREE.Color(0) }, shade };
    Object.defineProperty(m, 'kitLooks', { value: looks, configurable: true });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
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
