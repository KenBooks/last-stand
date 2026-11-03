// Raise Shield: hold the shield up. While held, Player.tryBlock blocks every frontal hit (for
// def.block times the block amount); this draws the ward in front and flares it on each block.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { portShader } from '../../core/shaderPorts';
import { G } from '../../state';
import { BLOCK } from '../../data/balance';
import type { ChannelSkill } from './types';

interface GuardState { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; seen: number }

const GOLD = new THREE.Color(0xffd08a);
// a curved wall in front of the warrior spanning the blocking arc (+Z is at theta 0)
const geo = new THREE.CylinderGeometry(0.95, 0.95, 1.6, 28, 1, true, -BLOCK.arc, BLOCK.arc * 2);

function guardMaterial(): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: GOLD }, uFade: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform vec3 uColor; uniform float uFade, uHit, uTime;
      void main(){
        // bright rims top and bottom, soft sides, faint scanning bands; a block flashes it all
        float sides = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float rim = pow(abs(vUv.y - 0.5) * 2.0, 6.0);
        float bands = 0.5 + 0.5 * sin(vUv.y * 40.0 - uTime * 6.0);
        float i = sides * (0.05 + rim * 0.45 + bands * 0.04 + uHit * (0.25 + rim * 0.5)) * uFade;
        gl_FragColor = vec4(uColor * i * 0.7, i);
      }`,
  })), ({ wgslFn, uv }, u) => ({
    fragment: wgslFn(`fn guardWard(uv: vec2f, color: vec3f, fade: f32, hit: f32, time: f32) -> vec4f {
      let sides = smoothstep(0.0, 0.18, uv.x) * (1.0 - smoothstep(0.82, 1.0, uv.x));
      let rim = pow(abs(uv.y - 0.5) * 2.0, 6.0);
      let bands = 0.5 + 0.5 * sin(uv.y * 40.0 - time * 6.0);
      let i = sides * (0.05 + rim * 0.45 + bands * 0.04 + hit * (0.25 + rim * 0.5)) * fade;
      return vec4f(color * i * 0.7, i);
    }`)({ uv: uv(), color: u.uColor, fade: u.uFade, hit: u.uHit, time: u.uTime }),
  }));
}

const skill: ChannelSkill<GuardState> = {
  anim: 'block',
  channel: true,
  warm: () => [new THREE.Mesh(geo, guardMaterial())],
  start(player) {
    const mat = guardMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    G.scene.add(mesh);
    return { mesh, mat, t: 0, seen: player.lastBlock };
  },
  tick(player, _def, dt, st) {
    st.t += dt;
    st.mesh.position.set(player.pos.x, player.obj.position.y + 0.9, player.pos.z);
    st.mesh.rotation.y = player.facing;
    const u = st.mat.uniforms;
    u.uTime.value = st.t;
    u.uFade.value = Math.min(1, st.t / 0.12);
    if (player.lastBlock > st.seen) {
      st.seen = player.lastBlock;
      u.uHit.value = 1;
    }
    u.uHit.value = Math.max(0, u.uHit.value - dt * 5);
  },
  stop(_player, _def, st) {
    G.scene.remove(st.mesh);
    st.mat.dispose();
  },
};

export default skill;
