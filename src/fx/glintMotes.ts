// Motes of light drawn in onto a drawn arrow's head once the bow is drawn to full (combat/skills/ranger.ts
// `drawGlint`), the sign the shot is at its strongest: specks spiralling in from round it and fading into the head,
// until it's loosed (shown as the bow was drawn, they didn't say when it was full). One quad faces
// the camera from the arrowhead (a child of the model's `arrowHead`, so it rides the arrow in every view) and its
// fragment shader places the motes, each with a short trail. Its reach is as far as the motes come from in the world,
// and never more than a share of the view's height: the world's particles fade within 3.5 m of the camera
// (fx/particles.ts), so through the eyes, the arrowhead under a metre off, nothing of them showed. Nothing gathers at
// the head itself: a star of light there read as a bright spark, and was too bright in every view.
import * as THREE from 'three';
import { addEffect } from './effects';
import { portShader } from '../core/shaderPorts';
import type { Player } from '../entities/player';

/** (a deep gold: paler, tone mapping washed it to white) */
const COLOR = 0xffc45a;
/** how far round the head the motes come from: in the world (m), and at most as a share of the view's height */
const REACH = 0.8, REACH_SHARE = 0.04;
/** the motes, how bright each is at its brightest (under the bloom's threshold over the ground: at 1.4, they bloomed
 *  into soft discs, and those near each other into blobs of glare), how wide (a share of the view's height: the same
 *  few pixels in every view), and how long a streak each leaves behind it (a share of its way in) */
const MOTES = 24, BRIGHT = 1.2, DOT = 0.0018, TRAIL = 0.12;
/** how near the head (a share of the reach) the motes are gone, and from how far they dim on their way to it */
const NEAR = 0.12, DIM_FROM = 0.45;
/** how fast it comes as the draw reaches full and goes as it's loosed (a share a second): eased, never switched */
const RISE = 10, FALL = 7;
/** how far towards the camera it's drawn, so the bow's limb, the hand round the arrow and the arm before it over the
 *  shoulder don't cut it (m: at 6 cm, the drawing arm hid half of them over the shoulder); it's sized where it's drawn,
 *  so it's the same on the screen */
const LIFT = 0.2;

const quad = new THREE.PlaneGeometry(2, 2);
quad.userData.shared = true;

function motesMaterial(): THREE.ShaderMaterial {
  return portShader(new THREE.ShaderMaterial({
    uniforms: {
      uStrength: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(COLOR) },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vAt; varying float vDot;
      void main(){
        vAt = position.xy;
        vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        centre.xyz *= 1.0 - ${LIFT.toFixed(3)} / max(length(centre.xyz), ${(LIFT * 2).toFixed(3)});
        float depth = max(-centre.z, 0.05);
        // (the view's height at that depth is 2 depth / projectionMatrix[1][1])
        float tall = 2.0 * depth / projectionMatrix[1][1];
        float reach = min(${REACH.toFixed(3)}, ${REACH_SHARE.toFixed(3)} * tall);
        vDot = ${DOT.toFixed(4)} * tall / reach;
        centre.xy += position.xy * reach;
        gl_Position = projectionMatrix * centre;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vAt; varying float vDot; uniform float uStrength, uTime; uniform vec3 uColor;
      float moteHash(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
      // (where a mote is, its life of its way in: spiralling in from the edge, faster as it nears the head)
      vec2 moteAt(float life, float start, float turn){
        float r = 0.08 + 0.84 * pow(1.0 - clamp(life, 0.0, 1.0), 1.4);
        float ang = start + life * turn;
        return vec2(cos(ang), sin(ang)) * r;
      }
      void main(){
        float light = 0.0;
        for (int i = 0; i < ${MOTES}; i++) {
          float fi = float(i);
          float speed = 0.8 + 0.6 * moteHash(fi + 1.0), phase = moteHash(fi + 31.0);
          float start = moteHash(fi + 57.0) * 6.2831853, turn = 1.8 + 1.2 * moteHash(fi + 83.0);
          // the mote and the streak it leaves, brightest at the mote and fading back along its way
          float life = fract(uTime * speed + phase);
          vec2 head = moteAt(life, start, turn), tail = moteAt(life - ${TRAIL.toFixed(2)}, start, turn);
          vec2 along = head - tail;
          float u = clamp(dot(vAt - tail, along) / max(dot(along, along), 1e-6), 0.0, 1.0);
          float d = length(vAt - tail - along * u);
          // (in from nothing at the edge, and dimming into the head as it nears it: those near it together merged
          // into a blob of glare there, a spark)
          float fade = smoothstep(0.0, 0.25, life)
            * smoothstep(${NEAR.toFixed(2)}, ${DIM_FROM.toFixed(2)}, length(head));
          light += exp(-d * d / (vDot * vDot)) * (0.15 + 0.85 * u * u) * fade;
        }
        float k = light * ${BRIGHT.toFixed(2)} * uStrength;
        gl_FragColor = vec4(uColor * k, k);
      }`,
  }), ({ wgslFn, positionGeometry, modelViewMatrix, cameraProjectionMatrix, varying }, u) => {
    const centre = wgslFn(`fn glintCentre(mv: mat4x4f) -> vec4f {
      let c = mv * vec4f(0.0, 0.0, 0.0, 1.0);
      return vec4f(c.xyz * (1.0 - ${LIFT.toFixed(3)} / max(length(c.xyz), ${(LIFT * 2).toFixed(3)})), c.w);
    }`);
    const tall = wgslFn(`fn glintTall(centre: vec4f, proj: mat4x4f) -> f32 {
      return 2.0 * max(-centre.z, 0.05) / proj[1][1];
    }`);
    const reach = wgslFn(`fn glintReach(tall: f32) -> f32 {
      return min(${REACH.toFixed(3)}, ${REACH_SHARE.toFixed(3)} * tall);
    }`);
    const vertex = wgslFn(`fn glintVertex(p: vec2f, mv: mat4x4f, proj: mat4x4f) -> vec4f {
      let centre = glintCentre(mv);
      return proj * vec4f(centre.xy + p * glintReach(glintTall(centre, proj)), centre.zw);
    }`, [centre, tall, reach]);
    const dotWidth = wgslFn(`fn glintDot(mv: mat4x4f, proj: mat4x4f) -> f32 {
      let tall = glintTall(glintCentre(mv), proj);
      return ${DOT.toFixed(4)} * tall / glintReach(tall);
    }`, [centre, tall, reach]);
    const hash = wgslFn(`fn moteHash(n: f32) -> f32 {
      return fract(sin(n * 12.9898) * 43758.5453);
    }`);
    const moteAt = wgslFn(`fn moteAt(life: f32, start: f32, turn: f32) -> vec2f {
      let r = 0.08 + 0.84 * pow(1.0 - clamp(life, 0.0, 1.0), 1.4);
      let ang = start + life * turn;
      return vec2f(cos(ang), sin(ang)) * r;
    }`);
    const motes = wgslFn(`fn glintMotes(at: vec2f, dotWidth: f32, strength: f32, time: f32, color: vec3f) -> vec4f {
      var light = 0.0;
      for (var i = 0; i < ${MOTES}; i++) {
        let fi = f32(i);
        let speed = 0.8 + 0.6 * moteHash(fi + 1.0);
        let phase = moteHash(fi + 31.0);
        let start = moteHash(fi + 57.0) * 6.2831853;
        let turn = 1.8 + 1.2 * moteHash(fi + 83.0);
        let life = fract(time * speed + phase);
        let head = moteAt(life, start, turn);
        let tail = moteAt(life - ${TRAIL.toFixed(2)}, start, turn);
        let along = head - tail;
        let u = clamp(dot(at - tail, along) / max(dot(along, along), 1e-6), 0.0, 1.0);
        let d = length(at - tail - along * u);
        let fade = smoothstep(0.0, 0.25, life) * smoothstep(${NEAR.toFixed(2)}, ${DIM_FROM.toFixed(2)}, length(head));
        light += exp(-d * d / (dotWidth * dotWidth)) * (0.15 + 0.85 * u * u) * fade;
      }
      let k = light * ${BRIGHT.toFixed(2)} * strength;
      return vec4f(color * k, k);
    }`, [hash, moteAt]);
    const matrices = { mv: modelViewMatrix, proj: cameraProjectionMatrix };
    return {
      vertex: vertex({ p: positionGeometry.xy, ...matrices }),
      fragment: motes({
        at: varying(positionGeometry.xy), dotWidth: varying(dotWidth(matrices)), strength: u.uStrength,
        time: u.uTime, color: u.uColor,
      }),
    };
  });
}

/** One of each of its materials, for the warm-up (core/shaders.ts). */
export function warmGlintMotes(): THREE.Mesh[] {
  return [new THREE.Mesh(quad, motesMaterial())];
}

/** A hero's motes: shown while asked for each frame, eased out once they aren't. */
class Motes {
  readonly mesh = new THREE.Mesh(quad, motesMaterial());
  strength = 0;
  private wanted = false;
  private time = 0;

  constructor() {
    // (by its name a measure finds it, to draw the frame without it: tools/lab `draw`)
    this.mesh.name = 'glintMotes';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** Shown this frame on `on` (the arrowhead). */
  want(on: THREE.Object3D): void {
    if (this.mesh.parent !== on) on.add(this.mesh);
    this.wanted = true;
  }

  /** A frame: eased towards shown or gone; false once gone. */
  step(dt: number): boolean {
    this.time += dt;
    const goal = this.wanted ? 1 : 0;
    const rate = this.wanted ? RISE : FALL;
    this.strength += Math.sign(goal - this.strength) * Math.min(Math.abs(goal - this.strength), rate * dt);
    this.wanted = false;
    const u = this.mesh.material.uniforms;
    u.uStrength.value = this.strength * this.strength * (3 - 2 * this.strength);
    u.uTime.value = this.time;
    this.mesh.visible = this.strength > 0;
    return this.strength > 0 || goal > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}

const motes = new WeakMap<Player, Motes>();

/** `player`'s motes shown this frame on its arrowhead (none for a model without one). */
export function glintMotes(player: Player): void {
  const head = player.model.arrowHead;
  if (!head) return;
  let shown = motes.get(player);
  if (!shown) {
    const made = new Motes();
    motes.set(player, made);
    addEffect({
      update: (dt) => made.step(dt),
      dispose: () => {
        made.dispose();
        if (motes.get(player) === made) motes.delete(player);
      },
    });
    shown = made;
  }
  shown.want(head);
}

/** How strongly `player`'s motes show this frame (0 to 1, 0 with none): what a measure reads (tools/lab `draw`). */
export function glintShown(player: Player): number {
  const shown = motes.get(player);
  return shown?.mesh.visible ? shown.strength : 0;
}
