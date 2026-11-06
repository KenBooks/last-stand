// Renderer, post-processing chain and the camera rig: top-down, over the shoulder or first person.
// The scene renders into its own MSAA target; the post passes (sanitize, bloom, grade)
// run on plain single-sample targets, since multisampled post targets cost a resolve per
// pass (very slow on tile-based GPUs such as Apple's).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { WEBGPU, drawOverScene, makeWebGPURenderer, makePipeline, renderWebGPU, setSceneSamples, setSceneShare, shadeEnvironmentNodes, webgpuSceneTarget } from './webgpu';
import { G } from '../state';
import { CAMERA } from '../data/balance';
import { clamp, damp } from '../util';
import { updateSeeThrough } from './seeThrough';
import type { QualityPreset } from '../data/quality';
import { hdrLevels, initHdr, presentHdr } from './hdr';
import { bloodMask, fitBloodMask } from './bloodEdges';
import { ARMS_LAYER, WARM_LAYER } from './layers';
import { takePorts } from './shaderPorts';
import type { WebGPURenderer } from 'three/webgpu';

/** Final colour: above HI_KNEE the brightest channel eases towards HI_CAP (hue kept); in HDR towards as much more
 *  as the peak has room over the paper white (`uCap`), so the highlights it grows aren't all held at SDR's. */
const HI_KNEE = 1, HI_CAP = 2;
/** HDR (core/hdr.ts): the share of white (as shown) under which the frame shows as on an SDR screen; above it the
 *  highlights grow towards the peak */
export const HDR_KNEE = 0.5;
/**
 * Tone mapping keeps the colour of a bright pixel (brightest channel over HUE_FROM, fully over HUE_TO)
 * in a large glare (GLARE_FROM..GLARE_TO): a big bright area stays its colour, a small hot core may go white.
 */
const HUE_FROM = 1, HUE_TO = 1.6, GLARE_FROM = 0.05, GLARE_TO = 0.4;
/**
 * The eye adapts to how bright an area is, at two scales: where the average light over a small area (a 16x9
 * grid of the frame) or a large one (4x3) is over its target, the light above ADAPT_BASE is compressed on a
 * power curve that brings that average down to the target. The dim part of every pixel is kept, so the ground
 * round a bright effect never darkens into a shadow, and a curve (not a scale) keeps a glow's falloff instead
 * of flattening it into a disc. Measured after bloom, which then still sees the full light (the eye sees the
 * halos too). The targets [small, large] sit just above each view's ordinary scenes (the close views see the
 * ground the staff light lights up close; the top view's is for its full distance and eases towards `lobby`
 * as it zooms in), which they leave untouched.
 */
const ADAPT = { top: [0.35, 0.11], lobby: [0.45, 0.13], third: [1.2, 0.26], first: [0.5, 0.13] } as const;
const ADAPT_BASE = 0.04;
/** a pixel this share of its area's average light or dimmer keeps its light as the area adapts, and one as bright as
 *  the average adapts with it in full (between, in part) */
const ADAPT_ALIKE = [0.5, 1.0] as const;
/**
 * The top view's large target (the lobby's too, which it zooms in to) is for the night crypt; a brighter
 * biome's ordinary scenes sit higher (the daylit forest's 4x3 areas average about 2.3 times the crypt's), so
 * the biome scales it (`BiomeLook.adapt`).
 * At the crypt's target the forest sat right at it doing nothing, and any effect tipped the area round it
 * over: all its ground compressed into a flat grey veil. (The small target is local enough, and the close
 * views look at the sky, which needs their targets as they are.)
 */
let adaptScale = 1;
export function setAdaptScale(k: number): void { adaptScale = k; }
/** `?adapt=0` holds the adaptation off (a studio render measured against a picture: its colours mustn't follow how
 *  much of the frame is dark hair) */
const NO_ADAPT = typeof location !== 'undefined' && /[?&]adapt=0/.test(location.search);
/** the adaptation held off from now on, or no longer, as `?adapt=0` holds it (the lab's haze draws a frame both ways) */
let adaptHeld = NO_ADAPT;
export function holdAdaptation(off: boolean): void { adaptHeld = off || NO_ADAPT; }
/** bloom left out from now on, or no longer (the lab's trail draws where an effect is, not its glow round it) */
let bloomPass: UnrealBloomPass | null = null;
export function holdBloom(off: boolean): void { if (bloomPass) bloomPass.enabled = !off; }
/** Bloom's blur levels, tightest to widest: the halo round an effect, and only a trace of the screen-wide veil. */
const BLOOM_LEVELS = [0.56, 0.5, 0.35, 0.12, 0.03];
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 1.05 },
    uLow: { value: 0 }, uBeat: { value: 0 }, tBlood: { value: null as THREE.Texture | null },
    tGlare: { value: null as THREE.Texture | null },
    tSmall: { value: null as THREE.Texture | null }, tLarge: { value: null as THREE.Texture | null },
    uSmall: { value: ADAPT.top[0] }, uLarge: { value: ADAPT.top[1] },
    uCap: { value: HI_CAP - HI_KNEE },
    uHdr: { value: 0 }, uPaper: { value: 1 }, uPeak: { value: 1 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uHurt; uniform float uVignette; uniform sampler2D tGlare;
    uniform float uLow; uniform float uBeat; uniform sampler2D tBlood;
    uniform sampler2D tSmall; uniform sampler2D tLarge; uniform float uSmall; uniform float uLarge;
    uniform float uCap; uniform float uHdr; uniform float uPaper; uniform float uPeak;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    // the power of the light over the base that brings an area's average down to its target
    float adapt(float avg, float target){ return avg > target ? log(target / ${ADAPT_BASE.toFixed(3)}) / log(avg / ${ADAPT_BASE.toFixed(3)}) : 1.0; }
    // and a pixel adapts to it as far as it's as bright as it: from half the area's average light up (a pixel much
    // dimmer than its area is beside what makes it bright, which the eye adapts to apart; adapted alike, the stone
    // round a sunlit blade through the eyes darkened into a veil, its edge on the grid's cells)
    float adaptAt(float avg, float target, float lum){ return mix(1.0, adapt(avg, target), smoothstep(${ADAPT_ALIKE[0].toFixed(2)}, ${ADAPT_ALIKE[1].toFixed(2)}, lum / max(avg, 1e-4))); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // the eye adapts to a bright area, so a big effect doesn't wash out the view
      const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
      float lum = dot(c.rgb, LUM);
      float g = min(adaptAt(dot(texture2D(tSmall, vUv).rgb, LUM), uSmall, lum), adaptAt(dot(texture2D(tLarge, vUv).rgb, LUM), uLarge, lum));
      if (lum > ${ADAPT_BASE.toFixed(3)}) c.rgb *= ${ADAPT_BASE.toFixed(3)} * pow(lum / ${ADAPT_BASE.toFixed(3)}, g) / lum;
      // glare (bloom's blurriest level): how large a bright spot is
      vec3 gl = texture2D(tGlare, vUv).rgb;
      float glare = max(gl.r, max(gl.g, gl.b));
      // the scene and its bloom, compressed like the eye: the brightest channel eases towards a
      // ceiling and the others keep their ratio to it, so a stack of lights stops adding up
      float m = max(c.r, max(c.g, c.b));
      if (m > ${HI_KNEE.toFixed(2)}) c.rgb *= (${HI_KNEE.toFixed(2)} + uCap * (1.0 - exp(-(m - ${HI_KNEE.toFixed(2)}) / uCap))) / m;
      // tone mapping + sRGB here instead of a separate OutputPass (renderer settings, drawn to the screen).
      // Per channel it squeezes the brightest channel most, so any bright colour ends up white. The eye
      // adapts to a large bright area and sees its colour, so there pixels are mapped by their brightest
      // channel instead, keeping their colour; a small hot core may still go white, and ordinary pixels are as before
      m = max(max(c.r, max(c.g, c.b)), 1e-4);
      vec3 hue = c.rgb / m * toneMapping(vec3(m)).g;
      float keep = smoothstep(${HUE_FROM.toFixed(2)}, ${HUE_TO.toFixed(2)}, m) * smoothstep(${GLARE_FROM.toFixed(2)}, ${GLARE_TO.toFixed(2)}, glare);
      c.rgb = mix(toneMapping(c.rgb), hue, keep);
      c = linearToOutputTexel(c);
      vec2 d = vUv - 0.5;
      float r = dot(d, d);
      float vig = 1.0 - smoothstep(0.12, 0.75, r * uVignette);
      c.rgb *= mix(0.35, 1.0, vig);
      // cool shadows, warm highlights
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(c.rgb * vec3(0.93,0.97,1.08), c.rgb * vec3(1.04,1.0,0.94), smoothstep(0.2,0.8,l));
      c.rgb += (h(vUv * 900.0 + uTime) - 0.5) * 0.025;
      // low health (core/lowLife.ts): the world's colour drains away, and the blood round the screen's edges (its
      // shapes painted in core/bloodEdges.ts: red its cover, green how near to nothing it shows from, blue its shade)
      // shows as far as the Health has fallen, a little further at each beat of the heart: fresh, thin and bright at
      // its front with a wet rim, darker and thicker the longer it has shown
      if (uLow > 0.0) {
        float grey = dot(c.rgb, vec3(0.299,0.587,0.114));
        c.rgb = mix(c.rgb, vec3(grey), 0.9 * pow(uLow, 1.5));
        vec3 mask = texture2D(tBlood, vUv).rgb;
        float reach = uLow * (1.0 + 0.06 * uBeat);
        float shown = mask.r * smoothstep(mask.g - 0.03, mask.g + 0.004, reach);
        float age = clamp((reach - mask.g) / 0.45, 0.0, 1.0);
        float rim = 1.0 - smoothstep(0.0, 0.035, reach - mask.g);
        vec3 blood = mix(vec3(0.42,0.015,0.025), vec3(0.11,0.0,0.006), age) * (0.75 + 0.5 * mask.b);
        blood += vec3(0.28,0.04,0.04) * rim * mask.b;
        c.rgb = mix(c.rgb, blood, shown * mix(0.62, 0.94, age));
      }
      c.rgb = mix(c.rgb, vec3(0.6,0.02,0.02), uHurt * smoothstep(0.05, 0.5, r) * 0.8);
      // HDR: the frame as an SDR screen shows it (gamma 2.2: Windows shows SDR content by the sRGB curve, which lifts
      // its shadows), the highlights over the knee grown towards the peak by their brightest channel (hue kept, and
      // with no room over the paper white, nothing grown), and all of it at the paper white, encoded as extended sRGB
      if (uHdr > 0.5) {
        const float K = ${HDR_KNEE.toFixed(2)};
        vec3 v = pow(clamp(c.rgb, 0.0, 1.0), vec3(2.2));
        float top = max(v.r, max(v.g, v.b));
        float room = max(uPeak / uPaper, 1.0);
        float u = clamp((top - K) / (1.0 - K), 0.0, 1.0);
        float a = (1.0 - K) / (room - K);
        if (top > K) v *= (K + (1.0 - K) * u / (1.0 - u * (1.0 - a))) / top;
        c.rgb = sRGBTransferOETF(vec4(v * uPaper, 1.0)).rgb;
      }
      gl_FragColor = c;
    }`,
};

/** The frame's average light (box downsamples to one pixel), for the grade's adaptation. */
class AreaPass extends Pass {
  private steps = [[64, 36], [16, 9], [4, 3]].map(([w, h]) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
  readonly small = this.steps[1];
  readonly large = this.steps[2];
  private mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    // 8x8 bilinear taps spread over the output texel: a box average of its footprint
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
      void main(){
        vec3 s = vec3(0.0);
        for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++)
          { vec3 v = texture2D(tDiffuse, vUv + (vec2(float(x), float(y)) - 3.5) * uStep).rgb; s += any(isnan(v)) || any(isinf(v)) ? vec3(0.0) : min(v, vec3(64.0)); }
        gl_FragColor = vec4(s / 64.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  private quad = new FullScreenQuad(this.mat);
  /** what it draws with (`compilePasses`) */
  get material(): THREE.ShaderMaterial { return this.mat; }
  constructor() { super(); this.needsSwap = false; }
  override render(r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    let src = read;
    for (const dst of this.steps) {
      this.mat.uniforms.tDiffuse.value = src.texture; src = dst;
      // taps an eighth of an output texel apart
      this.mat.uniforms.uStep.value.set(1 / dst.width / 8, 1 / dst.height / 8);
      r.setRenderTarget(dst);
      this.quad.render(r);
    }
  }
}

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c)) || any(isinf(c)) || c.r != c.r || c.g != c.g || c.b != c.b;
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : clamp(c, 0.0, 64.0);
    }`,
};

let composer: EffectComposer, grade: ShaderPass, gl: THREE.WebGLRenderer, sceneRT: THREE.WebGLRenderTarget;
/** the post chain's materials: those its passes draw into its targets with, and the grade's, drawn to the screen */
let passMaterials: { intoTargets: THREE.ShaderMaterial[]; toScreen: THREE.ShaderMaterial[] } = { intoTargets: [], toScreen: [] };

/**
 * The post chain's programs compiled now, each for what it draws into (a target, or the screen: the grade's, and
 * `onScreen`'s, the overlay's), so the GPU's threads link them side by side: the first full frame linked each as it
 * first drew it, one after another (0.33 s on a first visit).
 */
export function compilePasses(onScreen: THREE.Scene[]): void {
  const quad = passTriangle();
  const compiled = (materials: THREE.Material[], target: THREE.WebGLRenderTarget | null): void => {
    const holder = new THREE.Scene();
    holder.add(...materials.map((material) => new THREE.Mesh(quad, material)));
    gl.setRenderTarget(target);
    gl.compile(holder, passCamera);
  };
  const prev = gl.getRenderTarget();
  // (WebGPU draws its own pipeline: the WebGL chain's passes are never drawn there, makePipeline in webgpu.ts)
  if (!WEBGPU) {
    compiled(passMaterials.intoTargets, sceneRT);
    compiled(passMaterials.toScreen, null);
  }
  for (const scene of onScreen) gl.compile(scene, passCamera);
  gl.setRenderTarget(prev);
  quad.dispose();
}

/** A pass's full-screen triangle as three's full-screen quad has it, to compile a pass's material on: positions and
 *  uvs alone, as normals would make another program. Seen through `passCamera`. */
export function passTriangle(): THREE.BufferGeometry {
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  return quad;
}
/** what a pass's triangle is seen through, as three's full-screen quad's */
export const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const rig = {
  zoom: 1,
  targetZoom: 1,
  shake: 0,
  /** the field of view's widening for speed (kickFov), and what it eases to this frame */
  kick: 0, kickTo: 0,
  focus: new THREE.Vector3(),
  hurt: 0,
  yaw: 0,          // rotation around the focus; 0 looks toward -Z
  targetYaw: 0,
  /** the top-down view's yaw (its middle-drag orbit), kept while a close view turns the camera */
  topYaw: 0,
  view: 'top' as ViewMode,
  fromView: 'top' as ViewMode,
  look: 0,         // close views: pitch below the horizon
  boom: CAMERA.third.boom,
  targetBoom: CAMERA.third.boom,
  /** a view switch glides from the pose the camera had (blend 0) to the new view's (1) */
  blend: 1,
  fromPos: new THREE.Vector3(),
  fromQuat: new THREE.Quaternion(),
  fromFov: CAMERA.fov,
};

/** the arms camera's near and far planes (m): they're within reach */
const ARMS_NEAR = 0.03, ARMS_FAR = 6;
/**
 * Through the eyes, a hero's arms and what they hold can be drawn on a layer of their own (`ARMS_LAYER`) by a camera
 * of their own (`drawArms`), placed as the world's but with a narrower view, over the frame the world drew, as games
 * draw a first-person weapon: drawn through the world's 66 degrees (98 across on a wide screen), a weapon at the
 * frame's edge leaned in towards the middle, and a fist near the camera looked huge. The world's lights light them
 * too: every light is on their layer as well (`lightThePasses`).
 */
const armsCam = new THREE.PerspectiveCamera();
armsCam.layers.set(ARMS_LAYER);
/** the arms camera's field of view (vertical, degrees) while it draws them, none while the world's camera does */
let armsFov: number | null = null;

/**
 * Every light of `scene` on the arms' layer and the warm-ups' as well, from the moment it's added: a light missing
 * from a pass changes its lights' count, and every material it draws compiles again. (Put on it once, as the arms
 * were first drawn, a hero built afresh by a class switch brought his own light in after, and his arms compiled
 * mid-run: #268.)
 */
function lightThePasses(scene: THREE.Scene): void {
  const onPasses = (o: THREE.Object3D) => {
    if (!(o as THREE.Light).isLight) return;
    o.layers.enable(ARMS_LAYER);
    o.layers.enable(WARM_LAYER);
  };
  scene.traverse(onPasses);
  scene.addEventListener('childadded', ({ child }) => child.traverse(onPasses));
}

/** The arms layer drawn by its own camera at `fov` (vertical, degrees) from this frame on, or no longer (null). */
export function drawArms(fov: number | null): void {
  armsFov = fov;
}

/** The camera the arms are seen through this frame: their own while it draws them, else the world's. */
export function armsCamera(): THREE.PerspectiveCamera {
  if (armsFov === null) return G.camera as THREE.PerspectiveCamera;
  placeArmsCamera();
  return armsCam;
}

/** Where a point of what the arms hold (world, as posed) is seen in the world's view, into `out`: through their own
 *  camera it shows where the world's shows a point as far ahead and as far across the view by the views' widths, so
 *  what leaves from it (a skill cast from the weapon's tip) leaves where the weapon is seen. The point itself while the
 *  world's camera draws the arms. */
export function seenFromArms(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  if (armsFov === null) return out.copy(p);
  placeArmsCamera();
  const cam = G.camera as THREE.PerspectiveCamera;
  const k = Math.tan((cam.fov * Math.PI) / 360) / Math.tan((armsCam.fov * Math.PI) / 360);
  const local = armsCam.worldToLocal(out.copy(p));
  local.x *= k;
  local.y *= k;
  return armsCam.localToWorld(local);
}

/** The arms camera where the world's is, looking as it looks, its own view. */
function placeArmsCamera(): void {
  const cam = G.camera as THREE.PerspectiveCamera;
  cam.updateMatrixWorld();
  armsCam.position.copy(cam.position);
  armsCam.quaternion.copy(cam.quaternion);
  armsCam.aspect = cam.aspect;
  armsCam.fov = armsFov ?? cam.fov;
  armsCam.near = ARMS_NEAR;
  armsCam.far = ARMS_FAR;
  armsCam.updateProjectionMatrix();
  armsCam.updateMatrixWorld();
}

/** Draws the arms layer over the world's frame in the bound target: its depth cleared first, so nothing of the world
 *  goes through them; the world's shadows kept, not drawn again; nothing behind them (the scene's background). */
function drawArmsOver(): void {
  placeArmsCamera();
  const autoClear = gl.autoClear, shadows = gl.shadowMap.autoUpdate, background = G.scene.background;
  gl.autoClear = false;
  gl.shadowMap.autoUpdate = false;
  G.scene.background = null;
  gl.clearDepth();
  gl.render(G.scene, armsCam);
  gl.autoClear = autoClear;
  gl.shadowMap.autoUpdate = shadows;
  G.scene.background = background;
}

/** The world's lights' shadows held as they are for `draw` (`shadow.autoUpdate`: on WebGPU each camera's draw would
 *  draw every shadow map again). */
function withShadowsKept(draw: () => void): void {
  const held: THREE.LightShadow[] = [];
  G.scene.traverse((object) => {
    const shadow = (object as THREE.DirectionalLight).shadow;
    if (!(object as THREE.Light).isLight || !shadow?.autoUpdate) return;
    shadow.autoUpdate = false;
    held.push(shadow);
  });
  draw();
  for (const shadow of held) shadow.autoUpdate = true;
}

/** `drawArmsOver` on WebGPU: into the scene's pass's target as it stands, its colour kept and its depth cleared, as
 *  the post chain reads it next. */
function drawArmsOverPass(): void {
  if (armsFov === null) return;
  placeArmsCamera();
  const target = gl.getRenderTarget();
  const clearing = gl as unknown as { autoClearColor: boolean; autoClearDepth: boolean; autoClearStencil: boolean };
  const { autoClearColor, autoClearDepth, autoClearStencil } = clearing;
  const { autoClear } = gl;
  const background = G.scene.background;
  gl.autoClear = true;
  clearing.autoClearColor = false;
  clearing.autoClearDepth = true;
  clearing.autoClearStencil = false;
  G.scene.background = null;
  gl.setRenderTarget(webgpuSceneTarget() as THREE.WebGLRenderTarget);
  withShadowsKept(() => gl.render(G.scene, armsCam));
  gl.setRenderTarget(target);
  G.scene.background = background;
  gl.autoClear = autoClear;
  clearing.autoClearColor = autoClearColor;
  clearing.autoClearDepth = autoClearDepth;
  clearing.autoClearStencil = autoClearStencil;
}

/** the frames over which the sun's shadow is drawn every other one on WebGPU: from about 90 a second (ms a frame) */
const SHADOW_IN_TURNS_MS = 1000 / 65;
/** how much of the frames' mean a new frame moves (about the last 10 frames') */
const FRAME_MEAN_SHARE = 0.1;
const SHADOW_EVERY_FRAME = typeof location !== 'undefined' && /[?&]shadowEvery=1/.test(location.search);
let lastFrameAt = 0;
let frameMean = SHADOW_IN_TURNS_MS;
let shadowDrawnLast = false;

/**
 * The sun's shadow drawn every other frame while the frames come fast: its pass was a sixth of the frame's JS on WebGPU,
 * and at 144 a second its 72 show no lag. Told by the frames' mean: by each frame's own time, a frame that missed the
 * screen's refresh (13.9 ms at 144 Hz) had the next draw the shadow too, which missed it again, and the game stayed at
 * half the screen's rate with the shadow in every frame. A 60 Hz screen's stay whole. (`?shadowEvery=1` draws it every
 * frame, to compare.)
 */
function sunShadowInTurns(): void {
  const now = performance.now();
  frameMean += (Math.min(now - lastFrameAt, 2 * SHADOW_IN_TURNS_MS) - frameMean) * FRAME_MEAN_SHARE;
  const fast = frameMean < SHADOW_IN_TURNS_MS;
  lastFrameAt = now;
  const skip = fast && shadowDrawnLast && !SHADOW_EVERY_FRAME;
  shadowDrawnLast = !skip;
  G.arena.moon.shadow.autoUpdate = !skip;
}

/** top-down (the default), over the shoulder, or through the character's eyes */
export type ViewMode = 'top' | 'third' | 'first';
export const VIEWS: ViewMode[] = ['top', 'third', 'first'];

/** three's point lights, as its lit shaders begin them: the block `loopPointLights` lights in a loop */
const POINT_LIGHTS_IF = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )';
/** the end of its written-out loop, the block's last line before its `#endif` */
const POINT_LIGHTS_END = '#pragma unroll_loop_end';
/** the shadowed point lights (three puts them first) written out, each with its shadow map, the rest in a loop; each
 *  lit (and its shadow looked up) only where its colour isn't 0, out of its reach or idle in the pool (three lights
 *  every one at every pixel, adding nothing) */
const POINT_LIGHTS_LOOPED = [
  POINT_LIGHTS_IF,
  '\tPointLight pointLight;',
  '\t#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0',
  '\tPointLightShadow pointLightShadow;',
  '\t#pragma unroll_loop_start',
  '\tfor ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {',
  '\t\tpointLight = pointLights[ i ];',
  '\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );',
  '\t\tif ( directLight.visible ) {',
  '\t\t#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC )',
  '\t\tpointLightShadow = pointLightShadows[ i ];',
  '\t\tdirectLight.color *= receiveShadow ? getPointShadow( pointShadowMap[ i ], '
    + 'pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, '
    + 'pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, '
    + 'pointLightShadow.shadowCameraFar ) : 1.0;',
  '\t\t#endif',
  '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
  '\t\t}',
  '\t}',
  '\t#pragma unroll_loop_end',
  '\tconst int unshadowedFrom = NUM_POINT_LIGHT_SHADOWS;',
  '\t#else',
  '\tconst int unshadowedFrom = 0;',
  '\t#endif',
  '\tfor ( int i = unshadowedFrom; i < NUM_POINT_LIGHTS; i ++ ) {',
  '\t\tpointLight = pointLights[ i ];',
  '\t\tgetPointLightInfo( pointLight, geometryPosition, directLight );',
  '\t\tif ( directLight.visible ) RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, '
    + 'geometryClearcoatNormal, material, reflectedLight );',
  '\t}',
].join('\n');

/**
 * The point lights lit in a loop, not written out once a light as three writes them (`#pragma unroll_loop_start`,
 * which a light's shadow map needs): with 16 point lights a lit shader was 85 kB, and on a first visit ANGLE's D3D
 * compiler spent half a second on each, 36 of the 40 s the boot's programs cost (`lab programs --cost`). Only the
 * lights that cast (each biome's two warmest, `staticShadow` in `world/props.ts`) are written out; with one casting,
 * three wrote every point light out again.
 */
function loopPointLights(): void {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const at = chunk.indexOf(POINT_LIGHTS_IF);
  const end = at < 0 ? -1 : chunk.indexOf(POINT_LIGHTS_END, at);
  if (end < 0) {
    console.error('loopPointLights: three\'s lights_fragment_begin has changed: its point lights stay written out');
    return;
  }
  THREE.ShaderChunk.lights_fragment_begin = chunk.slice(0, at) + POINT_LIGHTS_LOOPED
    + chunk.slice(end + POINT_LIGHTS_END.length);
}

/** three's sun's (the moon's) shadow on a lit point, as its lit shaders take it in their directional lights' loop */
const SUN_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], '
  + 'directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, '
  + 'directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
const SUN_SHADOW_KEPT = SUN_SHADOW.replace('directLight.color *= ', 'shadowSeen = ')
  + ' directLight.color *= shadowSeen; sunShadow = min( sunShadow, shadowSeen );';
/** the share of the environment's reflection, and of the ambient light (the sky's, the environment's), left in the
 *  sun's shadow */
const ENV_IN_SHADOW = 0.25;
const AMBIENT_IN_SHADOW = 0.5;
const ENV_SPECULAR = 'RE_IndirectSpecular( radiance,';
const AMBIENT = '#if defined( RE_IndirectDiffuse )\n';

/**
 * The ambient light and the environment's reflection darkened in the sun's shadow. three lights a surface by the sky
 * and its reflection of the environment whatever stands between it and the sky, and each biome's environment has one
 * bright panel where the sun stands. The crypt's pale marble walks are lit mostly by the sky (with the moon off, as
 * bright as with it), so a column's or a tree's shadow stopped at a walk's edge, the cobbles beside it dark. (Kept:
 * the share of the sky a point in shadow still sees, `AMBIENT_IN_SHADOW`, `ENV_IN_SHADOW`.)
 */
function shadeEnvironment(): void {
  const begin = THREE.ShaderChunk.lights_fragment_begin, end = THREE.ShaderChunk.lights_fragment_end;
  if (!begin.includes(SUN_SHADOW) || !end.includes(ENV_SPECULAR) || !end.includes(AMBIENT)) {
    console.error('shadeEnvironment: three\'s lit shaders have changed: the ambient light ignores shadows');
    return;
  }
  // (declared once ahead of the loop: three writes its body out once a light, in one scope)
  THREE.ShaderChunk.lights_fragment_begin = 'float sunShadow = 1.0, shadowSeen;\n'
    + begin.replace(SUN_SHADOW, SUN_SHADOW_KEPT);
  // (the environment's light on a physical surface is `iblIrradiance`, taken in its indirect specular)
  const ambient = `\tfloat ambientSeen = mix( ${AMBIENT_IN_SHADOW.toFixed(2)}, 1.0, sunShadow );\n`
    + '\tirradiance *= ambientSeen;\n\tiblIrradiance *= ambientSeen;\n';
  THREE.ShaderChunk.lights_fragment_end = end.replace(AMBIENT, AMBIENT + ambient).replace(ENV_SPECULAR,
    `radiance *= mix( ${ENV_IN_SHADOW.toFixed(2)}, 1.0, sunShadow );\n\t${ENV_SPECULAR}`);
}

/** WEBGL_provoking_vertex, as its spec names it (lib.dom has no type for it) */
interface ProvokingVertex { FIRST_VERTEX_CONVENTION_WEBGL: number; provokingVertexWEBGL(mode: number): void }

/**
 * A `flat` varying taken from a triangle's first vertex, where the browser can (WEBGL_provoking_vertex): D3D11 takes
 * it from the first, and for GL's last ANGLE added a geometry shader to every program with one, compiled at its first
 * draw on the GPU process's main thread and run on every draw after (the crowds' rows: models/crowd.ts, whose flat
 * values are the same at each of a triangle's vertices).
 */
function firstVertexProvokes(context: WebGLRenderingContext | WebGL2RenderingContext): void {
  const provoking = context.getExtension('WEBGL_provoking_vertex') as ProvokingVertex | null;
  provoking?.provokingVertexWEBGL(provoking.FIRST_VERTEX_CONVENTION_WEBGL);
}

export async function initRenderer(container: HTMLElement) {
  loopPointLights();
  shadeEnvironment();
  if (WEBGPU) drawOverScene(drawArmsOverPass);
  const renderer = gl = WEBGPU ? await makeWebGPURenderer()
    : new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  if (WEBGPU) {
    takePorts(renderer as unknown as WebGPURenderer);
    // (`?envShadow=0` leaves the environment unshadowed, to compare)
    if (!/[?&]envShadow=0/.test(location.search)) shadeEnvironmentNodes({ environment: ENV_IN_SHADOW, ambient: AMBIENT_IN_SHADOW });
  }
  renderer.setPixelRatio(canvasRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // three's checks of a program as it's first used are round trips to the GPU's process, one after another for
  // each of the boot's programs: a production build checks them all once after the reveal (`checkPrograms`)
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  // asked now, while the GPU's process is idle: three asks it as the first texture is uploaded and keeps it, and a
  // round trip waits for everything sent before it (a first visit's lobby warm-up waited 0.45 s there, behind its
  // programs)
  renderer.capabilities.getMaxAnisotropy();
  if (!WEBGPU) firstVertexProvokes(renderer.getContext());
  container.appendChild(renderer.domElement);
  if (!WEBGPU) initHdr(renderer.domElement, renderer.getContext() as WebGL2RenderingContext);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030307);
  lightThePasses(scene);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.5, 300);

  const size = sceneSize(new THREE.Vector2());
  sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false }));
  // Kill NaN/Inf pixels before bloom: a single bad pixel would otherwise be blurred
  // into large black rectangles. It reads the scene target itself ('none': not the read buffer).
  const sanitize = new ShaderPass(SanitizeShader, 'none');
  sanitize.uniforms.tDiffuse.value = sceneRT.texture;
  composer.addPass(sanitize);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.85, 0, 0.9);
  // each blur level's weight, tightest to widest (radius 0: used as they are). The widest levels spread a
  // bright effect over half the screen as a pale veil that fogs up the scene, so they only add a trace
  bloom.compositeMaterial.uniforms.bloomFactors.value = BLOOM_LEVELS;
  composer.addPass(bloom);
  bloomPass = bloom;
  // after bloom: the eye adapts to all the light that reaches it, halos included
  const area = new AreaPass();
  composer.addPass(area);
  grade = new ShaderPass(GradeShader);
  grade.uniforms.tGlare.value = bloom.renderTargetsVertical[bloom.nMips - 1].texture;
  // (set on the pass: it copies the uniforms it's made with, a texture's settings too, and the copy never saw the mask painted)
  grade.uniforms.tBlood.value = bloodMask;
  grade.uniforms.tSmall.value = area.small.texture;
  grade.uniforms.tLarge.value = area.large.texture;
  composer.addPass(grade);
  passMaterials = {
    intoTargets: [
      sanitize.material, bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial,
      bloom.blendMaterial, area.material,
    ],
    toScreen: [grade.material],
  };
  // the perf overlay times each pass on the GPU
  for (const [label, pass] of [['sanitize', sanitize], ['area', area], ['bloom', bloom], ['grade', grade]] as [string, Pass][]) {
    const run = pass.render.bind(pass);
    pass.render = (...a: Parameters<typeof run>) => { gpuMarks.mark(label); run(...a); };
  }

  if (WEBGPU) {
    const looks = {
      highlights: { knee: HI_KNEE, cap: HI_CAP }, hdrKnee: HDR_KNEE, adaptBase: ADAPT_BASE, adaptAlike: ADAPT_ALIKE,
      hue: [HUE_FROM, HUE_TO], glare: [GLARE_FROM, GLARE_TO], bloom: BLOOM_LEVELS,
    } as const;
    await makePipeline(renderer, scene, camera, looks, grade.uniforms as never);
  }
  G.scene = scene; G.camera = camera; G.renderer = renderer;
  window.addEventListener('resize', fitViewport);
  fitViewport();
  return { scene, camera, renderer };
}

/** the window size and device pixel ratio the canvas was last fitted to */
const fitted = { w: 0, h: 0, dpr: 0 };
/** the most pixels the scene renders: the quality's, and Auto's budget (core/quality.ts) */
let pixelCap = Infinity;
let pixelBudget = Infinity;
/** a scene of fewer pixels than the screen's renders a share of its pixels each way rounded down to a multiple of
 *  this (a power of two: the share times the screen's pixels comes out the same whatever the OS's scaling) */
const SHARE_STEP = 1 / 256;
/**
 * The canvas's pixels per css px: the screen's own. What is rendered is counted in the screen's pixels, never by the
 * OS's scaling (a 4K screen at 300% is a window of 1280x720 css px, at 100% of 3840x2160: both render the same).
 */
const canvasRatio = (): number => window.devicePixelRatio || 1;
/** The screen's pixels under the window: the canvas's. */
export function screenPixels(): number {
  const ratio = canvasRatio();
  return Math.floor(window.innerWidth * ratio) * Math.floor(window.innerHeight * ratio);
}
/** The most pixels the scene renders now: the screen's, within the quality's and Auto's budget. */
export const scenePixels = (): number => Math.min(screenPixels(), pixelCap, pixelBudget);
/** The share of the screen's pixels each way the scene renders: all of them, or as many as `scenePixels` gives. */
function sceneShare(): number {
  const most = Math.min(pixelCap, pixelBudget);
  const screen = screenPixels();
  if (most >= screen) return 1;
  return Math.max(SHARE_STEP, Math.floor(Math.sqrt(most / screen) / SHARE_STEP) * SHARE_STEP);
}
/** The scene's pixels per css px (the last pass scales it up to the canvas). */
export const sceneRatio = (): number => canvasRatio() * sceneShare();
/** The scene's render size in pixels (the canvas's at the scene's own ratio). */
export function sceneSize(out: THREE.Vector2): THREE.Vector2 {
  const r = sceneRatio();
  return out.set(Math.floor(window.innerWidth * r), Math.floor(window.innerHeight * r));
}
/**
 * Fit the canvas, render targets and camera to the window. Runs on resize and every frame, as
 * moving the window to another monitor can change the pixel ratio without a resize event, and can
 * report a zero size on the way: that would leave zero-sized render targets (a black screen) until
 * the next resize, so the last real size stays. Returns whether anything changed.
 */
function fitViewport(): boolean {
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (w < 1 || h < 1 || (w === fitted.w && h === fitted.h && dpr === fitted.dpr)) return false;
  fitted.w = w; fitted.h = h; fitted.dpr = dpr;
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  const cr = canvasRatio();
  if (cr !== gl.getPixelRatio()) gl.setPixelRatio(cr);
  gl.setSize(w, h);
  applySceneRatio();
  composer.setSize(w, h);
  fitSceneTarget();
  return true;
}

/** The offscreen target the scene is rendered into (shaders must be compiled for it). */
export const sceneTarget = (): THREE.WebGLRenderTarget => (WEBGPU ? webgpuSceneTarget() as THREE.WebGLRenderTarget : sceneRT);

/** What a point's size (m) over its distance is multiplied by for its size in the scene's pixels: the scene's
 *  target's height over the view's height 1 m out. (Sized by the canvas's height, a point was as many times too
 *  wide as the canvas has more pixels than the scene, wherever the quality caps the scene's: 3 times as wide on
 *  #243's phone, 9 times the pixels to fill.) */
export const pointScale = (): number => sceneRT.height / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov) / 2));

/** the scene's ratio the post chain was last sized at */
let appliedSceneRatio = 0;
/** Sizes the post chain at the scene's ratio if it changed (the composer resizes every pass for it); whether it did. */
function applySceneRatio(): boolean {
  const r = sceneRatio();
  if (r === appliedSceneRatio) return false;
  appliedSceneRatio = r;
  composer.setPixelRatio(r);
  if (WEBGPU) setSceneShare(sceneShare());
  return true;
}

const _size = new THREE.Vector2();
function fitSceneTarget(): void {
  sceneSize(_size);
  sceneRT.setSize(_size.x, _size.y);
}

/** Apply the render-cost settings of a quality preset, live, the scene rendering `budget` pixels at most (Auto's).
 *  None of them change shader variants. */
export function setRenderQuality(p: QualityPreset, budget = Infinity): void {
  pixelCap = p.pixels;
  pixelBudget = budget;
  // (the canvas keeps the screen's pixels: the scene alone renders fewer)
  if (applySceneRatio()) fitSceneTarget();
  // a render target re-initialises with the new sample count on its next use
  if (sceneRT.samples !== p.msaa) { sceneRT.samples = p.msaa; sceneRT.dispose(); }
  if (WEBGPU) setSceneSamples(p.msaa);
}

export function addShake(amount: number): void { rig.shake = Math.min(1.2, rig.shake + amount); }
/** Widen the close views' field of view by `deg` while called each frame (a rush's speed): it eases in
 *  and back out. */
export function kickFov(deg: number): void { rig.kickTo = Math.max(rig.kickTo, deg); }
export function flashHurt(amount: number): void { rig.hurt = Math.min(1, rig.hurt + amount); }
/** How near to nothing the local hero's Health is shown (0 not at all, 1 nothing left) and the heart's beat (core/lowLife.ts). */
export function setLowLife(low: number, beat: number): void { grade.uniforms.uLow.value = low; grade.uniforms.uBeat.value = beat; }
export function setZoom(z: number): void { rig.targetZoom = clamp(z, CAMERA.minZoom, CAMERA.maxZoom); }
/** 
otches = mouse-wheel steps (positive = zoom out). */
export function zoomBy(notches: number): void {
  // over the shoulder the wheel pulls the camera in or out; through the eyes it does nothing
  if (rig.view === 'third') { rig.targetBoom = clamp(rig.targetBoom * CAMERA.zoomStep ** notches, CAMERA.third.minBoom, CAMERA.third.maxBoom); return; }
  if (rig.view !== 'top') return;
  rig.targetZoom = clamp(rig.targetZoom * CAMERA.zoomStep ** notches, CAMERA.minZoom, CAMERA.maxZoom); }

/** Middle-drag orbit: dragging right turns the world right (the camera swings left). */
export function orbitBy(px: number): void { if (rig.view === 'top') rig.targetYaw -= px * CAMERA.orbitSpeed; }
/** Mouse look in the close views: right turns right, down looks down. */
export function lookBy(dx: number, dy: number): void {
  if (rig.view === 'top') return;
  rig.yaw = rig.targetYaw = rig.yaw - dx * CAMERA.lookSpeed;
  const v = CAMERA[rig.view];
  rig.look = clamp(rig.look + dy * CAMERA.lookSpeed, v.minPitch, v.maxPitch);
}
export const viewMode = (): ViewMode => rig.view;
/** First person: the way the character faces is where the camera looks. */
export const lookFacing = (): number | null => (rig.view === 'first' ? rig.yaw + Math.PI : null);
/** Switch view, gliding there from wherever the camera is now. */
export function setView(v: ViewMode): void {
  if (v === rig.view) return;
  const cam = G.camera;
  rig.fromPos.copy(cam.position); rig.fromQuat.copy(cam.quaternion); rig.fromFov = cam.fov;
  rig.blend = 0;
  if (v !== 'top') rig.look = CAMERA[v].pitch;
  // leaving top-down keeps its yaw; coming back swings to it the short way round, not the way mouse look left it
  if (rig.view === 'top') rig.topYaw = rig.targetYaw;
  else if (v === 'top') {
    const turn = Math.PI * 2;
    rig.targetYaw = rig.topYaw + Math.round((rig.yaw - rig.topYaw) / turn) * turn;
  }
  rig.fromView = rig.view; rig.view = v;
}
/** The first-person view is still gliding in (the body stays visible until the camera reaches the eyes). */
export const viewSettled = (): boolean => rig.blend >= 1;
/** Camera yaw in radians: screen-up is world (-sin, -cos) on XZ. */
export const cameraYaw = (): number => rig.yaw;

/** The camera rig as it is, and a function that puts it back: tools/lab pictures the game from its other views and
 *  leaves the game's own as it found it (the aim follows the camera). */
export function saveCamera(): () => void {
  const saved = { ...rig }, focus = rig.focus.clone(), fromPos = rig.fromPos.clone(), fromQuat = rig.fromQuat.clone();
  return () => { Object.assign(rig, saved); rig.focus.copy(focus); rig.fromPos.copy(fromPos); rig.fromQuat.copy(fromQuat); };
}

/** Screen px to move the view by, so the character stays in sight beside (x) or below (y) a lobby panel. */
const shift = { x: 0, y: 0, tx: 0, ty: 0 };
export function setViewShift(x: number, y: number): void { shift.tx = x; shift.ty = y; }

/** The camera's follow, zoom, turn and shake brought to rest at once, on `focus`: tools/lab sets a run up again with
 *  the camera where it would have come to rest, whatever ran before it (the aim follows the camera: gliding back
 *  from where the last run ended, it left a run's arms a frame or two elsewhere past a range). */
export function settleCamera(focus: THREE.Vector3): void {
  rig.focus.set(focus.x, 0, focus.z);
  rig.zoom = rig.targetZoom; rig.yaw = rig.targetYaw; rig.boom = rig.targetBoom;
  rig.shake = rig.kick = rig.kickTo = rig.hurt = 0;
  shift.x = shift.tx; shift.y = shift.ty;
}

/** A staged shot (the hero selection screen, game/hall.ts): where the camera stands and what it looks at, and how
 *  fast it glides there (`damp`'s rate: `STAGE_GLIDE` if left out; a drag's, faster, to keep up with the finger). */
export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; fov: number; glide?: number }
/** the shot asked for (null: the views have the camera), and the camera's glide to it */
const stage = { shot: null as Shot | null, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CAMERA.fov };
/** how fast the camera glides to a new shot (`damp`'s rate: most of the way in about a second) */
const STAGE_GLIDE = 2.6;

/**
 * The camera on a staged shot, gliding to it from where it is (`cut`: there at once), or given back to the views
 * (null), which glide in from it as a view switch does.
 */
export function stageCamera(shot: Shot | null, cut = false): void {
  const cam = G.camera;
  if (shot && (!stage.shot || cut)) {
    stage.pos.copy(cut ? shot.pos : cam.position);
    stage.look.copy(cut ? shot.look : _look.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(6).add(cam.position));
    stage.fov = cut ? shot.fov : cam.fov;
  }
  if (!shot && stage.shot) {
    rig.fromPos.copy(cam.position); rig.fromQuat.copy(cam.quaternion); rig.fromFov = cam.fov;
    rig.blend = 0;
    rig.fromView = rig.view;
  }
  stage.shot = shot;
}

/** The camera on its staged shot, gliding there. */
function onStage(cam: THREE.PerspectiveCamera, shot: Shot, dt: number): void {
  const k = 1 - Math.exp(-(shot.glide ?? STAGE_GLIDE) * dt);
  stage.pos.lerp(shot.pos, k);
  stage.look.lerp(shot.look, k);
  stage.fov += (shot.fov - stage.fov) * k;
  cam.position.copy(stage.pos);
  cam.lookAt(stage.look);
  if (cam.fov !== stage.fov || cam.near !== 0.3) { cam.fov = stage.fov; cam.near = 0.3; cam.updateProjectionMatrix(); }
  // (nothing between the camera and the heroes to see through)
  updateSeeThrough(stage.look.x, stage.look.y, stage.look.z, 0, 0);
  cam.updateMatrixWorld();
}

/** `height`: the character's, for the close views' shoulder and eye level. */
export function updateCamera(dt: number, focus: THREE.Vector3, height: number): void {
  const cam = G.camera;
  shift.x = damp(shift.x, shift.tx, 6, dt);
  shift.y = damp(shift.y, shift.ty, 6, dt);
  if (Math.abs(shift.x) + Math.abs(shift.y) > 0.5) {
    const w = fitted.w, h = fitted.h;
    cam.setViewOffset(w, h, -shift.x, -shift.y, w, h);
  } else if (cam.view) cam.clearViewOffset();
  if (stage.shot) { onStage(cam, stage.shot, dt); return; }
  rig.zoom = damp(rig.zoom, rig.targetZoom, 8, dt);
  rig.focus.x = damp(rig.focus.x, focus.x, CAMERA.follow, dt);
  rig.focus.z = damp(rig.focus.z, focus.z, CAMERA.follow, dt);
  rig.focus.y = 0;
  rig.yaw = damp(rig.yaw, rig.targetYaw, 18, dt);
  let fov: number = CAMERA.fov, near = 0.5;
  if (rig.view === 'top') {
    const d = CAMERA.distance * rig.zoom;
    // tilt towards the horizon as we zoom in
    const k = clamp((rig.zoom - CAMERA.minZoom) / (1 - CAMERA.minZoom), 0, 1);
    const pitch = CAMERA.closePitch + (CAMERA.pitch - CAMERA.closePitch) * k;
    const lookY = 0.6 + (1 - k) * 0.7;
    const r = Math.cos(pitch) * d;
    cam.position.set(rig.focus.x + Math.sin(rig.yaw) * r, Math.sin(pitch) * d, rig.focus.z + Math.cos(rig.yaw) * r);
    _look.set(rig.focus.x, lookY, rig.focus.z);
    cam.lookAt(_look);
  } else {
    // close views sit right on the character: no follow lag, or the aim would swim
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw), cp = Math.cos(rig.look), sp = Math.sin(rig.look);
    _fwd.set(-sy * cp, -sp, -cy * cp);
    if (rig.view === 'third') {
      fov = CAMERA.third.fov;
      rig.boom = damp(rig.boom, rig.targetBoom, 6, dt);
      // the shoulder the camera looks over, then back along the view. It never closes in on the
      // character: props and walls in the way dissolve instead (core/seeThrough.ts)
      _pivot.set(focus.x + cy * CAMERA.third.side, height * 0.82, focus.z - sy * CAMERA.third.side);
      cam.position.copy(_pivot).addScaledVector(_fwd, -rig.boom);
      cam.position.y = Math.max(0.4, cam.position.y);
    } else {
      fov = CAMERA.first.fov; near = 0.08;
      cam.position.set(focus.x - sy * 0.12, height * 0.9, focus.z - cy * 0.12);
    }
    cam.lookAt(_look.copy(cam.position).add(_fwd));
  }
  if (rig.blend < 1) {
    rig.blend = Math.min(1, rig.blend + dt / CAMERA.switchTime);
    const e = ease(rig.blend);
    cam.position.lerpVectors(rig.fromPos, cam.position, e);
    // aim at the character all the way (turning to it early), and settle into the new view's own
    // framing (over the shoulder, through the eyes) only over the last stretch
    _quat.copy(cam.quaternion);
    cam.lookAt(focus.x, height * 0.55, focus.z);
    _quat2.copy(cam.quaternion);   // (slerpQuaternions copies its first argument in before reading the second)
    // (into the eyes the character's direction swings wildly as the camera closes on it, so the settling
    // follows the distance closed, not the clock)
    cam.quaternion.slerpQuaternions(rig.fromQuat, _quat2, ease(Math.min(1, rig.blend / 0.4)));
    cam.quaternion.slerp(_quat, rig.view === 'first' ? ease(clamp((e - 0.3) / 0.65, 0, 1)) : ease(clamp((rig.blend - 0.6) / 0.4, 0, 1)));
    fov = rig.fromFov + (fov - rig.fromFov) * e;
    near = 0.5 + (near - 0.5) * e;
  }
  // props dissolve where they hide the character, from above and over the shoulder (through the eyes nothing is
  // between), fading in and out with the glide to and from the eyes
  const e = ease(rig.blend);
  const share = (view: ViewMode) => (rig.view === view ? e : 0) + (rig.fromView === view ? 1 - e : 0);
  updateSeeThrough(focus.x, height * 0.6, focus.z, 1 - share('first'), share('top'));
  rig.kick = damp(rig.kick, rig.kickTo, rig.kickTo > rig.kick ? 14 : 6, dt); rig.kickTo = 0;
  if (rig.view !== 'top') fov += rig.kick * e;
  if (cam.fov !== fov || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
  if (rig.shake > 0.001) {
    const s = rig.shake * rig.shake * (rig.view === 'top' ? 0.6 : 0.12);
    const t = G.time * 60;
    cam.position.x += Math.sin(t * 1.3) * s;
    cam.position.y += Math.sin(t * 1.7 + 1) * s * 0.6;
    cam.position.z += Math.sin(t * 1.1 + 2) * s;
  }
  rig.shake = Math.max(0, rig.shake - dt * 2.2);
  rig.hurt = Math.max(0, rig.hurt - dt * 1.6);
  // (its matrices as the frame will draw it: the world's labels are placed by them before the frame is drawn, and
  // with the last frame's turn they slid off what they label as a view switch glided round)
  cam.updateMatrixWorld();
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const _fwd = new THREE.Vector3(), _pivot = new THREE.Vector3(), _look = new THREE.Vector3(), _quat = new THREE.Quaternion(), _quat2 = new THREE.Quaternion();
/** Where the perf overlay's GPU timing moves on to the next part of the frame (a no-op unless it's on). */
export const gpuMarks = { mark: (_label: string): void => {} };
/** What is drawn over the finished frame, on the canvas at its own pixel ratio: the world's overlays (ui/overlay). */
export const overFrame = { draw: (): void => {} };

export function render(): void {
  // a change the resize event missed: fit, and tell the rest of the page (UI scale...) too
  if (fitViewport()) window.dispatchEvent(new Event('resize'));
  // (the grade's, WebGPU's too: core/webgpu.ts `graded`)
  grade.uniforms.uTime.value = G.time;
  grade.uniforms.uHurt.value = rig.hurt;
  fitBloodMask(gl.domElement.width, gl.domElement.height);
  // the adaptation targets glide with the view
  const target = (v: ViewMode, i: 0 | 1): number => v !== 'top' ? ADAPT[v][i]
    : (ADAPT.lobby[i] + (ADAPT.top[i] - ADAPT.lobby[i]) * clamp((rig.zoom - CAMERA.lobbyZoom) / (1 - CAMERA.lobbyZoom), 0, 1)) * (i === 1 ? adaptScale : 1);
  const e = ease(rig.blend), u = grade.uniforms;
  u.uSmall.value = target(rig.fromView, 0) + (target(rig.view, 0) - target(rig.fromView, 0)) * e;
  u.uLarge.value = target(rig.fromView, 1) + (target(rig.view, 1) - target(rig.fromView, 1)) * e;
  if (adaptHeld) u.uSmall.value = u.uLarge.value = 1e4;
  const hdr = hdrLevels();
  u.uHdr.value = hdr.peak > 1 || hdr.paper !== 1 ? 1 : 0;
  u.uPaper.value = hdr.paper;
  u.uPeak.value = hdr.peak;
  u.uCap.value = (HI_CAP - HI_KNEE) * Math.max(1, hdr.peak / hdr.paper);
  if (WEBGPU) {
    sunShadowInTurns();
    renderWebGPU();
    overFrame.draw();
    return;
  }
  gl.setRenderTarget(sceneRT);
  gpuMarks.mark('scene');
  gl.render(G.scene, G.camera);
  if (armsFov !== null) { gpuMarks.mark('arms'); drawArmsOver(); }
  composer.render();
  gpuMarks.mark('overlay');
  overFrame.draw();
  presentHdr();
}
