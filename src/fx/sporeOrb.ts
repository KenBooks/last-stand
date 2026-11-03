// A spore orb (the Thornheart's and the Sporecallers' volleys): a ball of swirling toxic spores, drawn as animated noise with sap
// veins crawling over it and soft, see-through edges. It is blended over the scene, not added as light, so
// it reads as a thing thrown at you without glare, near or far. It trails spores and smoke.
import * as THREE from 'three';
import { G } from '../state';
import { particles, col } from './particles';
import { portShader, wgslNoise } from '../core/shaderPorts';

const geo = new THREE.SphereGeometry(1, 20, 14);
/** one per colour (same program); their time moves together */
const mats = new Map<number, THREE.ShaderMaterial>();
const time = { value: 0 };

function material(color: number): THREE.ShaderMaterial {
  let m = mats.get(color);
  if (!m) mats.set(color, m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: time },
    vertexShader: /* glsl */`varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ return noise(p) * 0.55 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 + 7.7) * 0.15; }
      void main(){
        // swirling: the noise is warped by itself and drifts over time
        vec3 p = vP * 2.2;
        vec3 w = vec3(fbm(p + vec3(0.0, uTime * 0.9, 0.0)), fbm(p + vec3(5.2, 0.0, uTime * 0.7)), fbm(p - vec3(uTime * 0.8, 1.3, 0.0)));
        float n = fbm(p + w * 2.5 + uTime * 0.4);
        float vein = pow(max(0.0, 1.0 - abs(n - 0.5) * 7.0), 3.0);
        float dense = smoothstep(0.3, 0.75, n);
        vec3 c = mix(uColor * 0.1, uColor * 0.75, dense) + uColor * 1.4 * vein;
        // thin where the spores are sparse (dark), so it reads as a cloud, with soft edges
        float f = max(dot(normalize(vN), normalize(vV)), 0.0);
        gl_FragColor = vec4(c, smoothstep(0.0, 0.6, f) * min(1.0, 0.2 + 0.75 * dense + vein));
      }`,
    transparent: true, depthWrite: false,
  }));
  portShader(m, ({ wgslFn, positionGeometry, normalView, positionViewDirection, varying }, u) => ({
    fragment: wgslFn(`fn sporeOrb(pos: vec3f, nrm: vec3f, v: vec3f, color: vec3f, time: f32) -> vec4f {
      let p = pos * 2.2;
      let w = vec3f(fbm3(p + vec3f(0.0, time * 0.9, 0.0)), fbm3(p + vec3f(5.2, 0.0, time * 0.7)),
        fbm3(p - vec3f(time * 0.8, 1.3, 0.0)));
      let n = fbm3(p + w * 2.5 + time * 0.4);
      let vein = pow(max(0.0, 1.0 - abs(n - 0.5) * 7.0), 3.0);
      let dense = smoothstep(0.3, 0.75, n);
      let c = mix(color * 0.1, color * 0.75, dense) + color * 1.4 * vein;
      let f = max(dot(normalize(nrm), normalize(v)), 0.0);
      return vec4f(c, smoothstep(0.0, 0.6, f) * min(1.0, 0.2 + 0.75 * dense + vein));
    }`, [wgslNoise().fbm3])({
      pos: varying(positionGeometry), nrm: normalView, v: positionViewDirection, color: u.uColor, time: u.uTime,
    }),
  }));
  return m;
}

/** An orb of radius `size` in the thrower's spore colour. */
export function sporeOrb(color: number, size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, material(color));
  mesh.scale.setScalar(size);
  return mesh;
}

/** Each frame of an orb's flight: the swirl moves on, and it trails spores and smoke. */
export function sporeOrbTick(mesh: THREE.Object3D, pos: THREE.Vector3, color: number, smoke: number, dt: number, acc: { t: number }): void {
  time.value = G.time;
  mesh.rotation.y += dt * 2;
  const r = mesh.scale.x, sc = col(smoke), gc = col(color, 1.2);
  acc.t += dt * 45;
  while (acc.t >= 1) {
    acc.t -= 1;
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
    const ox = Math.cos(a) * s * r, oy = u * r, oz = Math.sin(a) * s * r;
    // spores shed from its surface, drifting off
    particles.glow.spawn({
      x: pos.x + ox, y: pos.y + oy, z: pos.z + oz, vx: ox * 2, vy: oy * 2 + 0.3, vz: oz * 2,
      life: 0.5, size: 0.09, sizeEnd: 0.02, color: gc, drag: 2,
    });
    if (Math.random() < 0.5) particles.smoke.spawn({
      x: pos.x + ox * 0.5, y: pos.y + oy * 0.5, z: pos.z + oz * 0.5,
      vx: (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5,
      life: 0.6 + Math.random() * 0.4, size: r * 1.2, sizeEnd: r * 3.5, color: sc, alpha: 0.3, drag: 2.5,
    });
  }
}

/** Sample for the load-time warm-up. */
export const sporeOrbSample = (): THREE.Mesh => sporeOrb(0x6fd82a, 0.3);
