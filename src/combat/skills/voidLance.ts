// Void Lance: channeled piercing beam. The hand first draws a portal in the air (a spark tracing a
// circle that opens into turning rune rings); only once it is open does the lance pour out of it.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { portShader, wgslNoise } from '../../core/shaderPorts';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import type { Enemy } from '../../entities/enemy';
import { particles, col, burst } from '../../fx/particles';
import { flash, release } from '../../fx/lights';
import { sfx } from '../../core/audio';
import { armsScale, seenFromArms, viewMode } from '../../core/renderer';
import { eyesPortal } from '../../core/eyesEffects';
import { rand } from '../../util';
import { hurtProp, PROP_DAMAGE } from '../../world/destructible';
import type { Obstacle } from '../../types';
import type { ChannelSkill, Needs } from './types';
import type { LightSlot } from '../../fx/lights';
import { addField } from '../../entities/corpse';
import { GRAVITY, type Field } from '../../entities/ragdoll';

type Def = Needs<'damage' | 'length' | 'width'>;

/** Per-channel state: beam and portal meshes, lights and the damage tick timer. */
interface LanceState {
  outer: THREE.Mesh; core: THREE.Mesh; portal: THREE.Mesh;
  outerMat: THREE.ShaderMaterial; coreMat: THREE.ShaderMaterial; portalMat: THREE.ShaderMaterial;
  /** a strand of arcana from each fingertip of the free hand to the portal's middle, and their material */
  strands: THREE.Mesh[]; strandMat: THREE.ShaderMaterial;
  lightA: LightSlot; lightB: LightSlot;
  tick: number; t: number;
  /** the beam is out (the portal finished opening) */
  firing: boolean;
  /** how far the lance is drawn out (m): it follows the length it's judged to at a pace */
  reach: number;
  stopHum?: () => void;
  /** where the beam runs this frame, and what takes its pull on the fallen away */
  beam: Beam;
  calm: () => void;
  /** the foes that have seen it coming (each judged once a channel: entities/evade.ts) */
  judged: Set<Enemy>;
}

/** The beam as the fallen meet it: from (x, y, z) along (dx, dz), this long and wide (m), while it's out. */
interface Beam { on: boolean; x: number; y: number; z: number; dx: number; dz: number; len: number; w: number }

/** the fallen in the beam carried along it this fast (m/s), gripped this hard (/s), with this much of their weight
 *  borne, as far as this beyond its width and above it (m): they drift down it and drop off its end */
const CARRY = 5, CARRY_GRIP = 3, BEAR = 0.85, BEAM_REACH = 0.4, BEAM_ABOVE = 1.2;

/** The beam's pull on the fallen in it. */
function carry(beam: Beam): Field {
  return {
    accel(p, v, out) {
      if (!beam.on) return false;
      const ox = p.x - beam.x, oz = p.z - beam.z, along = ox * beam.dx + oz * beam.dz;
      if (along < 0 || along > beam.len || p.y > beam.y + BEAM_ABOVE) return false;
      if (Math.abs(ox * beam.dz - oz * beam.dx) > beam.w * 0.5 + BEAM_REACH) return false;
      const push = (CARRY - (v.x * beam.dx + v.z * beam.dz)) * CARRY_GRIP;
      out.x += beam.dx * push;
      out.z += beam.dz * push;
      out.y += GRAVITY * BEAR - v.y * CARRY_GRIP * 0.5;
      return true;
    },
  };
}

const COLOR = new THREE.Color(0x5dffa8);
const TICK = 0.12;
/** the portal's radius once open (m); it opens from a spark to this, and shrinks a little while the beam pours out */
const PORTAL_R = 0.72;
/** where the lance is judged from in every view, this far ahead of the caster and this high (m): what it reaches,
 *  what stops it, whom it strikes. Its look leaves the hand as each view shows it, and ends where this ends */
const PORTAL_AHEAD = 0.85;
const PORTAL_Y = 1.7;
/** how far past the palm the portal stands (m): the lance leaves the hand and passes through it, as the skill's
 *  icon draws it (from play: "project ray from the hand through the portal, not from portal"). Through the eyes it
 *  is at its full size against the hand as it's drawn there (`armsScale`): from play, "fix the difference between
 *  ray cast circle size in 3rd and 1st person", "see relative size to hand on both pics", "those dashes on the
 *  circle effect are same size as finger, in 3 person". It was drawn at 0.45 of its size there, and at its full
 *  size 1 m past the hand was under half as large against the hand as third person's */
const PORTAL_GAP = 0.35;
/** and how much of its light it keeps there (its `uFade`, a uniform's value): at its full size its rings lie over
 *  the middle of the view, where the player aims, so through the eyes it is fainter and seen through (from play:
 *  "make it more transparent in 1st person") */
const EYES_LIGHT = 0.45;
/** how fast the drawn lance reaches out and draws back (m/s). What it strikes is judged at once; drawn at once
 *  too, a tree at the edge of its way stopped it one frame and not the next, its whole length there and gone: 3
 *  flashes in a second over a sixteenth of the screen in the forest's third person, on main too (`lab cast`
 *  names what lit each flash: the beam and its core) */
const REACH_OUT = 45;
const REACH_BACK = 40;

/** the lance's outline along its length ([share of its length, share of its width]), as the skill's icon draws a
 *  lance: thin from the palm through the portal, widening over its first third (swelling at once out of the
 *  portal, its shell stood round the view through the eyes as a dome), narrowing down its shaft to a head that
 *  widens and comes to a point, never wider than the width it strikes (from play: "make the beam more
 *  interesting, not just straight cylinder") */
const LANCE: [number, number][] = [
  [0, 0.22], [0.1, 1], [0.85, 0.78], [1, 0.04],
];
const beamGeo = lanceGeometry();
/** a strand of arcana from a fingertip to the portal's middle, 1 long up y: thin at the finger, thicker where
 *  the five meet (from play: "it should channel from fingers maybe, or smth, to give it volume") */
const strandGeo = new THREE.CylinderGeometry(1, 0.3, 1, 8, 1, true).translate(0, 0.5, 0);
/** a strand's radius where the five meet (m) */
const STRAND_R = 0.022;

/** The lance's shell, 1 long up y and 1 in radius at its widest, its uv's v its share of the length. */
function lanceGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(LANCE.map(([along, radius]) => new THREE.Vector2(radius, along)), 20);
  const uv = geometry.attributes.uv, position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, position.getY(i));
  return geometry;
}
/** the portal's quad spans -1..1; its rim sits at RIM of that */
const portalGeo = new THREE.PlaneGeometry(2, 2);
const RIM = 0.85;

function beamMaterial(core: boolean): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: 10 }, uColor: { value: COLOR.clone() }, uCore: { value: core ? 1 : 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        // how far across the tube this point is, seen from the camera: the view direction flattened onto
        // the tube's cross-section, so a beam seen along its length (the close views) keeps its bright
        // middle instead of reading as all edge and fading away
        vec3 axis = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
        vec3 v = normalize(-mv.xyz);
        vec3 across = v - axis * dot(v, axis);
        float l = length(across);
        // (the normal round the lance alone: where its outline widens or narrows the normal leans along it, and
        // the widening shell lit up face on, a funnel of green glass before the eyes)
        vec3 round = n - axis * dot(n, axis);
        float lr = length(round);
        vFres = l > 1e-3 && lr > 1e-3 ? abs(dot(round / lr, across / l)) : 1.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vFres;
      uniform float uTime, uLen, uCore, uFade; uniform vec3 uColor;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float along = vUv.y * uLen;
        float flow = n(vec2(vUv.x * 10.0, along * 1.4 - uTime * 14.0)) * 0.6 + n(vec2(vUv.x * 22.0, along * 3.0 - uTime * 22.0)) * 0.4;
        // (the glow round the core comes in along the lance's first fifth: at the hand it's the core alone)
        float ends = smoothstep(0.0, uCore > 0.5 ? 0.03 : 0.06, vUv.y) * (1.0 - smoothstep(0.97, 1.0, vUv.y));
        float body = pow(vFres, uCore > 0.5 ? 2.5 : 1.2);
        // two ribbons of brighter light winding slowly round it (a strand passes a point about once a second:
        // faster, a pattern crossing the view flashes)
        float wind = fract(vUv.x * 2.0 + along * 0.4 - uTime * 0.5);
        float ribbon = smoothstep(0.0, 0.12, wind) * (1.0 - smoothstep(0.2, 0.42, wind));
        // not far over bloom's threshold: seen low along its length (the lobby) the beam covers much of the
        // screen, and a hotter one blooms into a green haze over the ground round it. Its core keeps its colour:
        // 0.7 of the way to white at 1.6, it was a white bar (from play: "make it less bright, not washed color")
        // (the core white at its very middle alone, green round it; the shell mostly its ribbons, not a fog)
        vec3 hot = mix(uColor, vec3(1.0), 0.75 * pow(vFres, 6.0)) * 1.5;
        vec3 c = uCore > 0.5 ? hot : uColor * (0.2 + flow * 0.7 + ribbon * 1.5);
        float a = body * ends * (uCore > 0.5 ? 1.0 : (0.18 + flow * 0.4 + ribbon * 0.7)) * uFade;
        gl_FragColor = vec4(c * a, a);
      }`,
  })), ({ wgslFn, uv, varying, normalView, positionViewDirection, modelViewMatrix, vec4 }, u) => {
    const { noise2 } = wgslNoise();
    const fres = wgslFn(`fn lanceFres(n: vec3f, v: vec3f, axis: vec3f) -> f32 {
      let across = v - axis * dot(v, axis);
      let l = length(across);
      let nn = normalize(n);
      let around = nn - axis * dot(nn, axis);
      let lr = length(around);
      if (l > 1e-3 && lr > 1e-3) { return abs(dot(around / lr, across / l)); }
      return 1.0;
    }`);
    const axis = modelViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
    return {
      fragment: wgslFn(`fn lanceBeam(uv: vec2f, fres: f32, time: f32, len: f32, color: vec3f, core: f32,
        fade: f32) -> vec4f {
        let along = uv.y * len;
        let flow = noise2(vec2f(uv.x * 10.0, along * 1.4 - time * 14.0)) * 0.6
          + noise2(vec2f(uv.x * 22.0, along * 3.0 - time * 22.0)) * 0.4;
        let ends = smoothstep(0.0, select(0.06, 0.03, core > 0.5), uv.y) * (1.0 - smoothstep(0.97, 1.0, uv.y));
        let body = pow(fres, select(1.2, 2.5, core > 0.5));
        let wind = fract(uv.x * 2.0 + along * 0.4 - time * 0.5);
        let ribbon = smoothstep(0.0, 0.12, wind) * (1.0 - smoothstep(0.2, 0.42, wind));
        let hot = mix(color, vec3f(1.0), 0.75 * pow(fres, 6.0)) * 1.5;
        let c = select(color * (0.2 + flow * 0.7 + ribbon * 1.5), hot, core > 0.5);
        let a = body * ends * select(0.18 + flow * 0.4 + ribbon * 0.7, 1.0, core > 0.5) * fade;
        return vec4f(c * a, a);
      }`, [noise2])({
        uv: uv(), fres: varying(fres({ n: normalView, v: positionViewDirection, axis })), time: u.uTime,
        len: u.uLen, color: u.uColor, core: u.uCore, fade: u.uFade,
      }),
    };
  });
}

/**
 * The portal, in the quad's -1..1 space: a crackling rim of sparks that a bright head traces round
 * (uOpen 0..0.7), then two rune rings turning against each other, spokes and a slow swirl inside
 * fading in (0.4..1). Added light, no depth write.
 */
function portalMaterial(): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 }, uColor: { value: COLOR.clone() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; uniform float uTime, uOpen, uFade; uniform vec3 uColor;
      const float TAU = 6.2831853, R = ${RIM.toFixed(2)};
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float r = length(vP);
        if (r > 1.0) discard;
        // angle from the top, running clockwise the way the head traces it (atan's (0, 0) is undefined)
        float a = r < 1e-4 ? 0.0 : atan(vP.x, vP.y);
        float u = fract(a / TAU + 1.0);
        float trace = clamp(uOpen / 0.7, 0.0, 1.0);
        // how far behind the tracing head this angle is (0 at the head)
        float behind = trace - u;
        float drawn = trace >= 1.0 ? 1.0 : step(0.0, behind);
        float head = trace >= 1.0 ? 0.0 : exp(-max(behind, 0.0) * 18.0) * drawn;
        // the rim: a thin crackling band of sparks turning round
        float crackle = n(vec2(u * 90.0 - uTime * 30.0, uTime * 9.0)) * 0.7 + n(vec2(u * 260.0 + uTime * 55.0, 3.0)) * 0.6;
        float band = exp(-pow((r - R) / (0.018 + 0.02 * crackle), 2.0));
        float halo = exp(-pow((r - R) / 0.09, 2.0)) * 0.25;
        float rim = (band * (0.6 + crackle) + halo) * drawn + head * (exp(-pow((r - R) / 0.06, 2.0)) * 3.0);
        // rune rings, turning against each other: broken bands of ticks
        float k2 = smoothstep(0.4, 1.0, uOpen);
        // (glyph ticks of uneven length: each cell's own height)
        float cell1 = floor(u * 48.0 + uTime * 0.8), len1 = 0.012 + 0.03 * h(vec2(cell1, 1.0));
        float ring1 = smoothstep(0.008, 0.0, abs(r - 0.72 * R) - len1);
        float ticks1 = step(0.72, fract(u * 48.0 + uTime * 0.8)) * step(0.15, fract(u * 6.0 + uTime * 0.13));
        float ring2 = smoothstep(0.008, 0.0, abs(r - 0.56 * R) - 0.014);
        float ticks2 = step(0.62, fract(u * 30.0 - uTime * 0.9));
        float lines = smoothstep(0.01, 0.0, abs(r - 0.8 * R) - 0.004) + smoothstep(0.01, 0.0, abs(r - 0.64 * R) - 0.003);
        // spokes, a squared-off star turning slowly between the rings
        float spokes = exp(-abs(sin((a + uTime * 0.25) * 4.0)) * 30.0) * step(0.3 * R, r) * step(r, 0.56 * R);
        float runes = (ring1 * ticks1 + ring2 * ticks2 * 0.8 + lines * 0.6 + spokes * 0.5) * k2;
        // the portal itself: a slow swirl, brightest at the middle once open
        float sw = n(vec2(u * 6.0 + r * 5.0 - uTime * 1.5, r * 7.0 - uTime * 2.0));
        // (faint: over the shoulder the view looks through it)
        float inner = (sw * sw * 0.08 + exp(-r * r * 60.0) * 0.45) * k2 * smoothstep(R, 0.3, r);
        // (its rim in its colour: over half way to white at 2.2, it bloomed into a white hoop)
        vec3 spark = mix(uColor, vec3(1.0, 0.98, 0.85), 0.25);
        vec3 c = spark * rim * 1.4 + uColor * runes * 1.8 + uColor * inner * 1.0;
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
  })), ({ wgslFn, positionGeometry, varying }, u) => {
    const { hash2, noise2 } = wgslNoise();
    // (smoothstep's edges the right way round: falling ones as 1 - the rising, WGSL leaves them undefined)
    return {
      fragment: wgslFn(`fn lancePortal(p: vec2f, time: f32, open: f32, fade: f32, color: vec3f) -> vec4f {
        let TAU = 6.2831853;
        let R = ${RIM.toFixed(2)};
        let r = length(p);
        if (r > 1.0) { discard; }
        var a = 0.0;
        if (r >= 1e-4) { a = atan2(p.x, p.y); }
        let u = fract(a / TAU + 1.0);
        let trace = clamp(open / 0.7, 0.0, 1.0);
        let behind = trace - u;
        let drawn = select(step(0.0, behind), 1.0, trace >= 1.0);
        let head = select(exp(-max(behind, 0.0) * 18.0) * drawn, 0.0, trace >= 1.0);
        let crackle = noise2(vec2f(u * 90.0 - time * 30.0, time * 9.0)) * 0.7
          + noise2(vec2f(u * 260.0 + time * 55.0, 3.0)) * 0.6;
        let d1 = (r - R) / (0.018 + 0.02 * crackle);
        let d2 = (r - R) / 0.09;
        let d3 = (r - R) / 0.06;
        let band = exp(-d1 * d1);
        let halo = exp(-d2 * d2) * 0.25;
        let rim = (band * (0.6 + crackle) + halo) * drawn + head * (exp(-d3 * d3) * 3.0);
        let k2 = smoothstep(0.4, 1.0, open);
        let cell1 = floor(u * 48.0 + time * 0.8);
        let len1 = 0.012 + 0.03 * hash2(vec2f(cell1, 1.0));
        let ring1 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.72 * R) - len1);
        let ticks1 = step(0.72, fract(u * 48.0 + time * 0.8)) * step(0.15, fract(u * 6.0 + time * 0.13));
        let ring2 = 1.0 - smoothstep(0.0, 0.008, abs(r - 0.56 * R) - 0.014);
        let ticks2 = step(0.62, fract(u * 30.0 - time * 0.9));
        let lines = (1.0 - smoothstep(0.0, 0.01, abs(r - 0.8 * R) - 0.004))
          + (1.0 - smoothstep(0.0, 0.01, abs(r - 0.64 * R) - 0.003));
        let spokes = exp(-abs(sin((a + time * 0.25) * 4.0)) * 30.0) * step(0.3 * R, r) * step(r, 0.56 * R);
        let runes = (ring1 * ticks1 + ring2 * ticks2 * 0.8 + lines * 0.6 + spokes * 0.5) * k2;
        let sw = noise2(vec2f(u * 6.0 + r * 5.0 - time * 1.5, r * 7.0 - time * 2.0));
        let inner = (sw * sw * 0.08 + exp(-r * r * 60.0) * 0.45) * k2 * (1.0 - smoothstep(0.3, R, r));
        let spark = mix(color, vec3f(1.0, 0.98, 0.85), 0.25);
        let c = spark * rim * 1.4 + color * runes * 1.8 + color * inner * 1.0;
        return vec4f(c * fade, 1.0);
      }`, [hash2, noise2])({
        p: varying(positionGeometry.xy), time: u.uTime, open: u.uOpen, fade: u.uFade, color: u.uColor,
      }),
    };
  });
}

const _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _end = new THREE.Vector3(), _c = new THREE.Vector3(), _from = new THREE.Vector3(), _palm = new THREE.Vector3(), _way = new THREE.Vector3(), _tip = new THREE.Vector3(), _toFocus = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

const skill: ChannelSkill<LanceState> = {
  anim: 'channel',
  hits: (def) => [{ per: 'tick', base: (def.damage ?? 0) * TICK, rate: 1 / TICK, type: 'arcane' }],
  channel: true,
  warm: () => [new THREE.Mesh(beamGeo, beamMaterial(false)), new THREE.Mesh(portalGeo, portalMaterial())],
  start(player, rawDef) {
    const outerMat = beamMaterial(false), coreMat = beamMaterial(true), portalMat = portalMaterial();
    const outer = new THREE.Mesh(beamGeo, outerMat), core = new THREE.Mesh(beamGeo, coreMat), portal = new THREE.Mesh(portalGeo, portalMat);
    outer.frustumCulled = core.frustumCulled = portal.frustumCulled = false;
    // (named for what reads the scene: the lab's `cast` says which of them lit a flash)
    outer.name = 'Void Lance: beam';
    core.name = 'Void Lance: core';
    portal.name = 'Void Lance: portal';
    outer.visible = core.visible = false;
    G.scene.add(outer, core, portal);
    const strandMat = beamMaterial(true);
    const strands = Array.from({ length: 5 }, () => new THREE.Mesh(strandGeo, strandMat));
    for (const strand of strands) {
      strand.frustumCulled = false;
      strand.name = 'Void Lance: strands';
      strand.visible = false;
      G.scene.add(strand);
    }
    const opens = rawDef.opening ?? 0;
    const beam: Beam = { on: false, x: 0, y: 0, z: 0, dx: 0, dz: 1, len: 0, w: 0 };
    return {
      outer, core, portal, outerMat, coreMat, portalMat, strands, strandMat, tick: 0, t: 0, firing: false, reach: 0, beam,
      stopHum: opens > 0 && !player.quiet ? sfx.lanceCharge(opens) : undefined, calm: addField(carry(beam)), judged: new Set(),
      // a glow at the hand and a pool where it hits, a few metres across: green light washed over a wide
      // circle of ground reads as a haze round the whole cast
      lightA: flash({ color: 0x5dffa8, intensity: 2, distance: 4, life: 1, hold: 999 }),
      lightB: flash({ color: 0x5dffa8, intensity: 0, distance: 4.5, life: 1, hold: 999 }),
    };
  },

  tick(player, rawDef, dt, st) {
    const def = rawDef as Def;
    st.t += dt;
    const opens = def.opening ?? 0;
    const open = opens > 0 ? Math.min(1, st.t / opens) : 1;

    const hand = player.palmPoint;
    _dir.set(player.aim.x - player.pos.x, 0, player.aim.z - player.pos.z);
    if (_dir.lengthSq() < 1e-4) _dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    _dir.normalize();
    // the lance is judged from before the chest (`from`); it is drawn from the palm as the view shows it, towards
    // where the judged one ends, through the portal a little past the hand (`origin`)
    const from = _from.set(player.pos.x + _dir.x * PORTAL_AHEAD, PORTAL_Y, player.pos.z + _dir.z * PORTAL_AHEAD);
    const eyes = player.eyes;
    const palm = eyes ? seenFromArms(hand, _palm) : _palm.copy(hand);
    const way = _way.copy(from).addScaledVector(_dir, def.length).sub(palm).normalize();
    const origin = _c.copy(palm).addScaledVector(way, PORTAL_GAP);

    // the portal stands upright across the lance
    _u.set(-way.z, 0, way.x).normalize();
    _n.copy(way).negate();
    _v.crossVectors(_n, _u);
    st.portal.quaternion.setFromRotationMatrix(_m.makeBasis(_u, _v, _n));
    st.portal.position.copy(origin);
    const radius = PORTAL_R * (eyes ? armsScale() : 1) * (0.2 + 0.8 * easeOutBack(open)) * (st.firing ? 0.9 + Math.sin(st.t * 9) * 0.03 : 1);
    st.portal.scale.setScalar(radius / RIM);
    st.portalMat.uniforms.uTime.value = G.time;
    st.portalMat.uniforms.uOpen.value = open;
    st.portalMat.uniforms.uFade.value = eyes ? EYES_LIGHT : 1;
    // (through the eyes the player may leave the portal out, the lance alone drawn: Settings' Spell circle)
    const shown = !eyes || eyesPortal();
    st.portal.visible = shown;
    st.lightA.light.position.copy(origin);
    // a strand from each fingertip of the free hand into the portal's middle, one after another at the pace the
    // portal is traced, the thumb's first and the little finger's as the ring closes; the lance then pours out of
    // where they meet (from play: "channel one beam from each finger, as the dial summons (same pace)", "one beam
    // into the center of the dial")
    const digits = player.model.hands ? [player.model.hands.L.thumb, ...player.model.hands.L.f] : [];
    const traced = Math.min(1, open / 0.7);
    st.strandMat.uniforms.uTime.value = G.time;
    st.strandMat.uniforms.uFade.value = 1;
    st.strands.forEach((strand, i) => {
      const digit = digits[i];
      // (how far this finger's strand has reached: each takes a fifth of the tracing)
      const out = Math.min(1, Math.max(0, traced * digits.length - i));
      strand.visible = Boolean(digit) && out > 0;
      if (!digit || out <= 0) return;
      const tip = digit.j[2].localToWorld(_tip.set(0, -digit.len[2], 0));
      if (eyes) seenFromArms(tip, tip);
      const long = tip.distanceTo(origin) * out;
      const wide = STRAND_R * (eyes ? armsScale() : 1);
      strand.position.copy(tip);
      strand.quaternion.setFromUnitVectors(_up, _toFocus.copy(origin).sub(tip).normalize());
      strand.scale.set(wide, Math.max(0.001, long), wide);
      st.strandMat.uniforms.uLen.value = long;
    });
    st.lightA.peak = 2 + 5 * open;

    if (!st.firing) {
      // sparks thrown off the tracing head, falling away
      const trace = Math.min(1, open / 0.7);
      const n = !shown ? 0 : trace < 1 ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const ang = (trace < 1 ? trace : Math.random()) * Math.PI * 2 + rand(-0.08, 0.02);
        const s = Math.sin(ang), c = Math.cos(ang), r = radius;
        particles.glow.spawn({
          x: origin.x + (_u.x * s + _v.x * c) * r, y: origin.y + _v.y * c * r, z: origin.z + (_u.z * s + _v.z * c) * r,
          // along the circle (clockwise from the top) and a little outwards
          vx: _u.x * (c * 3 + s * 1.2) + _v.x * (c * 1.2 - s * 3) + rand(-0.6, 0.6), vy: _v.y * (c * 1.2 - s * 3) + rand(0, 1.5),
          vz: _u.z * (c * 3 + s * 1.2) + _v.z * (c * 1.2 - s * 3) + rand(-0.6, 0.6),
          life: rand(0.25, 0.5), size: rand(0.05, 0.11), sizeEnd: 0, color: col(0xeaffd8, 3), colorEnd: col(0x5dffa8, 0.6), drag: 2, gravity: 7,
        });
      }
      if (open < 1) return;
      // open: the lance bursts out of the portal
      st.firing = true;
      st.outer.visible = st.core.visible = true;
      st.stopHum?.();
      st.stopHum = player.quiet ? undefined : sfx.lance();
      burst(origin, { count: 18, color: 0x5dffa8, speed: 5, life: 0.35, size: 0.22, gravity: 2 });
      st.lightB.peak = 10;
    }
    const ft = st.t - opens;

    // beam stops at obstacles that reach up to it (not enemies: it pierces)
    let len = def.length, blocker: Obstacle | null = null;
    for (const o of G.arena.obstacles) {
      if (o.h <= from.y) continue;
      const ox = o.x - from.x, oz = o.z - from.z;
      const proj = ox * _dir.x + oz * _dir.z;
      if (proj <= 0 || proj > len) continue;
      const perp = Math.abs(ox * _dir.z - oz * _dir.x);
      if (perp < o.r) { const l = proj - Math.sqrt(o.r * o.r - perp * perp); if (l < len) { len = l; blocker = o; } }
    }
    // focused fire wears down what stops it
    if (blocker && st.firing) hurtProp(blocker, PROP_DAMAGE.beam * dt);
    const edge = G.arena.radius + 1;
    for (let k = 0; k < 20 && Math.hypot(from.x + _dir.x * len, from.z + _dir.z * len) > edge; k++) len *= 0.95;

    const fadeIn = Math.min(1, ft / 0.12);
    // it bursts out wide and settles
    const w = def.width * (0.9 + Math.sin(st.t * 30) * 0.08) * (1 + 0.5 * Math.max(0, 1 - ft / 0.25));
    // top-down the glow's radius is the width the lance hits (half of it): a wider soft tube reads as a haze
    // round it from above. Up close the beam is seen along its length, where that thin a glow is barely a line
    const glow = player.local && viewMode() !== 'top' ? 1 : 0.5;
    st.reach = st.reach < len ? Math.min(len, st.reach + REACH_OUT * dt) : Math.max(len, st.reach - REACH_BACK * dt);
    _end.copy(from).addScaledVector(_dir, st.reach);
    const drawn = Math.max(0.01, _end.distanceTo(origin));
    for (const [m, mat, scale] of [[st.outer, st.outerMat, w * glow], [st.core, st.coreMat, w * 0.36 * glow]] as const) {
      m.position.copy(origin);
      m.quaternion.setFromUnitVectors(_up, way);
      m.scale.set(scale, drawn, scale);
      mat.uniforms.uTime.value = G.time;
      mat.uniforms.uLen.value = drawn;
      mat.uniforms.uFade.value = fadeIn;
    }
    Object.assign(st.beam, { on: true, x: from.x, y: from.y, z: from.z, dx: _dir.x, dz: _dir.z, len, w });
    st.lightB.light.position.copy(_end);

    // sparks streaming along the beam: few and small, since a dense stream of soft particles smears
    // into a haze round it
    for (let i = 0; i < 2; i++) {
      const d = Math.random() * drawn;
      const a = Math.random() * Math.PI * 2;
      particles.glow.spawn({
        // offset on the ring around the beam's axis (across it, `_u`, and up)
        x: origin.x + way.x * d + _u.x * Math.cos(a) * w * 0.5, y: origin.y + way.y * d + Math.sin(a) * w * 0.5,
        z: origin.z + way.z * d + _u.z * Math.cos(a) * w * 0.5,
        vx: _dir.x * 6 + rand(-1, 1), vy: rand(-0.5, 1), vz: _dir.z * 6 + rand(-1, 1),
        life: 0.3, size: rand(0.04, 0.09), sizeEnd: 0, color: col(0x5dffa8, 3), colorEnd: col(0x2050ff, 0.5), drag: 4,
      });
    }
    burst(_end, { count: 2, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.3, gravity: 3 });

    // damage ticks
    st.tick += dt;
    if (st.tick >= TICK) {
      st.tick -= TICK;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const ex = e.pos.x - from.x, ez = e.pos.z - from.z;
        const proj = ex * _dir.x + ez * _dir.z;
        if (proj < 0 || proj > len + e.radius) continue;
        if (Math.abs(ex * _dir.z - ez * _dir.x) < w * 0.5 + e.radius) {
          // (over a ducked foe; and one that sees it coming may blink out of its way)
          if (from.y > (e.duckedTop ?? Infinity)) continue;
          const threat = { kind: 'beam', x: from.x, z: from.z, way: _dir, half: w * 0.5 } as const;
          if (!st.judged.has(e) && st.judged.add(e) && evades(e, player, threat)) continue;
          // (the beam through it where it passes: off its middle, the body turns off the beam)
          const on = { x: from.x + _dir.x * proj, z: from.z + _dir.z * proj };
          const blow = { dir: { x: _dir.x, z: _dir.z }, lift: 0.15, on };
          hitEnemy(e, def.damage * TICK, { by: player, skill: def, tags: def.tags, type: 'arcane', knock: 0.6, from, blow });
          burst(new THREE.Vector3(e.pos.x, 1.1, e.pos.z), { count: 4, color: 0x5dffa8, speed: 3, life: 0.3, size: 0.25 });
        }
      }
    }
  },

  stop(_player, _def, st) {
    st.calm();
    G.scene.remove(st.outer, st.core, st.portal, ...st.strands);
    st.outerMat.dispose(); st.coreMat.dispose(); st.portalMat.dispose(); st.strandMat.dispose();
    release(st.lightA); release(st.lightB);
    st.stopHum?.();
  },
};

export default skill;
