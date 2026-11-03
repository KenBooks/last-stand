// Fur that moves: each fur mesh (a collar, a cuff) gets a damped spring that lags the acceleration of the
// joint it rides, plus a light flutter, both applied in the vertex shader so the tufts (a static merged mesh)
// cost nothing extra to draw. A tuft's weight along its length is its uv's v (0 at the root, 1 at the tip:
// `furTufts` scales it by three), so roots stay put and tips swing. One material copy per mesh, because a
// uniform is only uploaded when the material changes, and the meshes each have their own lag.
import * as THREE from 'three';
import { sameLooks } from '../../core/materials';
import type { OwnLooks } from '../../core/shaderPorts';
import { tsl } from '../../core/webgpu';

/** `?fur=0` keeps the fur still, for A/B comparison */
const FUR = typeof location === 'undefined' || !/[?&]fur=0/.test(location.search);
const F = 3.2, ZETA = 0.22, MAX = 0.05, GAIN = 0.9;
const _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _l = new THREE.Vector3();

export class FurSway {
  readonly material: THREE.Material;
  private readonly lag = { value: new THREE.Vector3() };
  private readonly time = { value: 0 };
  private readonly x = new THREE.Vector3();   // the spring's displacement (world), and its speed
  private readonly v = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private fresh = true;

  constructor(private readonly mesh: THREE.Mesh, base: THREE.Material) {
    const m = this.material = base.clone();
    const obc = base.onBeforeCompile, key = base.customProgramCacheKey.bind(base);
    m.onBeforeCompile = (sh, r) => {
      obc(sh, r);
      sh.uniforms.uFurLag = this.lag; sh.uniforms.uFurT = this.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFurLag; uniform float uFurT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fw = uv.y / 3.0; fw *= fw;
          float fph = dot(position, vec3(127.1, 311.7, 74.7));
          transformed += (uFurLag + vec3(sin(uFurT * 5.1 + fph), sin(uFurT * 4.3 + fph * 1.7) * 0.4, sin(uFurT * 4.7 + fph * 0.6)) * 0.0035) * fw;`);
    };
    m.customProgramCacheKey = () => key() + '-fur';
    sameLooks(m, base);
    (m as unknown as OwnLooks).webgpuLooks = (node) => this.swayNodes(node);
    // (each mesh's lag its own: models/drawAsOne.ts would merge it still)
    mesh.userData.drawsAlone = true;
    mesh.material = m;
    mesh.userData.furLag = this.lag;   // (read by probes)
    mesh.geometry.computeBoundingSphere();
    this.centre.copy(mesh.geometry.boundingSphere!.center);
  }

  /** The sway on WebGPU, where the GLSL above is WebGL's alone. */
  private swayNodes(node: { positionNode: unknown }): void {
    const { positionGeometry, reference, sin, uv, vec3, dot } = tsl as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const along = uv().y.div(3);
    const phase = dot(positionGeometry, vec3(127.1, 311.7, 74.7));
    const time = reference('value', 'float', this.time);
    const flutter = vec3(sin(time.mul(5.1).add(phase)), sin(time.mul(4.3).add(phase.mul(1.7))).mul(0.4),
      sin(time.mul(4.7).add(phase.mul(0.6))));
    const sway = reference('value', 'vec3', this.lag).add(flutter.mul(0.0035)).mul(along).mul(along);
    node.positionNode = positionGeometry.add(sway);
  }

  /** after the pose, the mesh's world matrix current */
  update(dt: number): void {
    const mesh = this.mesh;
    mesh.updateWorldMatrix(true, false);
    _w.copy(this.centre).applyMatrix4(mesh.matrixWorld);
    if (this.fresh || _w.distanceToSquared(this.pos) > 4) { this.pos.copy(_w); this.vel.set(0, 0, 0); this.x.set(0, 0, 0); this.v.set(0, 0, 0); this.fresh = false; }
    dt = Math.min(dt, 1 / 30);
    if (dt <= 0 || !FUR) return;
    const vel = _l.copy(_w).sub(this.pos).divideScalar(dt), acc = vel.sub(this.vel).divideScalar(dt);
    this.vel.copy(_w).sub(this.pos).divideScalar(dt);
    this.pos.copy(_w);
    // the tuft's tip is a mass on a spring hung from the joint: an acceleration pushes it the other way
    const w = 2 * Math.PI * F, k = w * w, c = 2 * ZETA * w;
    this.v.addScaledVector(acc, -1 * dt).addScaledVector(this.x, -k * dt).addScaledVector(this.v, -c * dt);
    this.x.addScaledVector(this.v, dt);
    if (this.x.length() > MAX) this.x.setLength(MAX);
    // into the mesh's own space, at the model's scale
    mesh.matrixWorld.decompose(_w, _q, _s);
    this.lag.value.copy(this.x).applyQuaternion(_q.invert()).multiplyScalar(GAIN / _s.x);
    this.time.value += dt;
  }

  dispose(): void { this.material.dispose(); }
}
