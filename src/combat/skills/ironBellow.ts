// Iron Bellow: a war cry that hurls back nearby foes and raises three spectral shields that circle
// the warrior as a damage-absorbing ward; each blow they soak flares them, and they shatter at the end.
import * as THREE from 'three';
import { nearGlow } from '../../core/materials';
import { portShader } from '../../core/shaderPorts';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { addEffect, shockwave, groundFlash, crackDecal } from '../../fx/effects';
import { particles, col, burst, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { schedule } from '../../core/timers';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { groundHeight } from '../../world/ground';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import type { InstantSkill, Needs } from './types';
import { blastCorpses } from '../../entities/corpse';

type Def = Needs<'damage' | 'radius' | 'knock' | 'absorbPct' | 'duration'>;
const GOLD = 0xffc85a;
const SHIELDS = 3;
/** the shields' circle round the warrior: height and radius; through the eyes higher and wider, where
 *  they're seen (at the waist and close in they circle under the view) */
const RING = { y: 1.1, r: 0.95 }, RING_EYES = { y: 1.25, r: 1.5 };
const _w = new THREE.Vector3();
// a thin ring of light on the floor
const haloGeo = new THREE.RingGeometry(1.05, 1.15, 64, 1, 0, Math.PI * 2);

// a spectral kite shield (face along +Z): a shimmering translucent face, a bright rim and a glowing
// emblem, all additive
function kite(s: number): THREE.Shape {
  const k = new THREE.Shape();
  k.moveTo(0, 0.36 * s);
  k.quadraticCurveTo(0.3 * s, 0.36 * s, 0.29 * s, 0.08 * s);
  k.quadraticCurveTo(0.26 * s, -0.2 * s, 0, -0.42 * s);
  k.quadraticCurveTo(-0.26 * s, -0.2 * s, -0.29 * s, 0.08 * s);
  k.quadraticCurveTo(-0.3 * s, 0.36 * s, 0, 0.36 * s);
  return k;
}
const faceGeo = new THREE.ShapeGeometry(kite(1), 12);
const rimShape = kite(1.08);
rimShape.holes.push(kite(0.92));
const rimGeo = new THREE.ShapeGeometry(rimShape, 12);
const emblemGeo = new THREE.ShapeGeometry(kite(0.34), 8);

function faceMaterial(): THREE.ShaderMaterial {
  return portShader(nearGlow(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(GOLD) }, uFade: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      uniform vec3 uColor; uniform float uFade, uFlash, uTime;
      void main(){
        // brighter towards the rim (distance from the centre), a band of light scanning down,
        // fine horizontal striations, and a white flare when a blow lands
        float edge = smoothstep(0.1, 0.4, length(vP * vec2(1.0, 0.85)));
        float scan = exp(-pow(fract(vP.y * 1.2 - uTime * 0.9) - 0.5, 2.0) * 60.0);
        float lines = 0.75 + 0.25 * sin(vP.y * 120.0 + uTime * 4.0);
        float i = (0.12 + edge * 0.35 + scan * 0.35) * lines + uFlash * 0.35;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), uFlash * 0.3) * i * uFade, i * uFade);
      }`,
  })), ({ wgslFn, positionGeometry, varying }, u) => ({
    fragment: wgslFn(`fn bellowFace(p: vec2f, color: vec3f, fade: f32, flash: f32, time: f32) -> vec4f {
      let edge = smoothstep(0.1, 0.4, length(p * vec2f(1.0, 0.85)));
      let s = fract(p.y * 1.2 - time * 0.9) - 0.5;
      let scan = exp(-s * s * 60.0);
      let lines = 0.75 + 0.25 * sin(p.y * 120.0 + time * 4.0);
      let i = (0.12 + edge * 0.35 + scan * 0.35) * lines + flash * 0.35;
      return vec4f(mix(color, vec3f(1.0), flash * 0.3) * i * fade, i * fade);
    }`)({ p: varying(positionGeometry.xy), color: u.uColor, fade: u.uFade, flash: u.uFlash, time: u.uTime }),
  }));
}

function shieldMaterials() {
  const m = (c: number, k: number) => nearGlow(new THREE.MeshBasicMaterial({
    color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  return { face: faceMaterial(), rim: m(0xffe2a0, 0.9), emblem: m(0xfff0c8, 1.2) };
}

function buildShield(mats: ReturnType<typeof shieldMaterials>): THREE.Group {
  const g = new THREE.Group();
  const emblem = new THREE.Mesh(emblemGeo, mats.emblem);
  emblem.position.z = 0.01;
  g.add(new THREE.Mesh(faceGeo, mats.face), new THREE.Mesh(rimGeo, mats.rim), emblem);
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}

const skill: InstantSkill = {
  anim: 'buff',
  // (its cry strikes as a blow does, whatever its own tags)
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical', tags: ['physical'] }],
  warm: () => [buildShield(shieldMaterials()), new THREE.Mesh(haloGeo, nearGlow(new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))],
  cast(player, rawDef) {
    const def = rawDef as Def;
    const c = player.pos.clone();
    // the roar: three rings rolling out, a dust ring and a cracked floor
    for (let i = 0; i < 3; i++) {
      schedule(i * 0.09, () => shockwave(c, { color: i ? GOLD : 0xffffff, intensity: 2.2 - i * 0.5, from: 0.4, to: def.radius * (1 - i * 0.18), life: 0.5 }));
    }
    groundFlash(c, { color: GOLD, intensity: 1, radius: def.radius * 0.8, life: 0.35 });
    crackDecal(c, { size: 2.2, color: GOLD, intensity: 0.6, life: 1.4 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      smokePuff({ x: c.x + Math.cos(a) * 1.2, y: 0, z: c.z + Math.sin(a) * 1.2 }, { count: 1, color: 0x2a241c, alpha: 0.45, size: 0.8, sizeEnd: 2.2, life: 0.9, speed: 0.4 });
    }
    flash({ color: GOLD, intensity: 12, distance: 10, life: 0.4, pos: player.eyes ? player.lightAhead(new THREE.Vector3()) : { x: c.x, y: 2, z: c.z } });
    addShake(0.3);
    sfx.roar();
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius) {
        hitEnemy(e, def.damage, { by: player, skill: def, tags: ['physical'], type: 'physical', knock: def.knock, from: c, blow: { lift: 0.25, force: 1.1 } });
      }
    }
    // (the roar rolls the bodies lying round him away)
    blastCorpses(c, def.radius, 6, { lift: 0.35 });

    // the ward, shown as shields circling the warrior
    player.ward?.onEnd?.();
    const mats = shieldMaterials();
    const shields = Array.from({ length: SHIELDS }, () => buildShield(mats));
    const root = new THREE.Group();
    root.add(...shields);
    const haloMat = nearGlow(new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.frustumCulled = false;
    G.scene.add(root, halo);
    let ended = false, hitFlash = 0, t = 0;
    const amount = player.stats.maxLife * def.absorbPct;
    const ward = {
      amount, t: def.duration,
      onHit: () => { hitFlash = 1; sfx.clang(); },
      onEnd: () => { ended = true; },
    };
    player.ward = ward;
    addEffect({
      update(dt) {
        t += dt;
        const p = player.pos;
        const ring = player.eyes ? RING_EYES : RING;
        root.position.set(p.x, player.obj.position.y + ring.y, p.z);
        // they rise out of the ground, orbit, and dim as the ward is used up
        const grow = Math.min(1, t / 0.25);
        const left = Math.max(0.25, ward.amount / amount);
        hitFlash = Math.max(0, hitFlash - dt * 4);
        shields.forEach((s, i) => {
          const a = t * 2.4 + (i / SHIELDS) * Math.PI * 2;
          s.position.set(Math.sin(a) * ring.r, Math.sin(t * 3 + i) * 0.08 - (1 - grow) * 1.1, Math.cos(a) * ring.r);
          s.rotation.y = a;   // face outwards
          s.scale.setScalar(grow * (1 + hitFlash * 0.25));
        });
        const flick = 0.9 + Math.random() * 0.1;
        const fu = mats.face.uniforms;
        fu.uTime.value = t; fu.uFade.value = grow * left * flick; fu.uFlash.value = hitFlash;
        mats.rim.opacity = (0.6 + hitFlash * 0.25) * grow * left * flick;
        mats.emblem.opacity = (0.5 + 0.2 * Math.sin(t * 6) + hitFlash * 0.5) * grow * left;
        // each shield leaves a thin trail of motes as it circles
        for (const s of shields) {
          if (Math.random() > dt * 40) continue;
          s.getWorldPosition(_w);
          particles.glow.spawn({ x: _w.x + rand(-0.15, 0.15), y: _w.y + rand(-0.3, 0.3), z: _w.z + rand(-0.15, 0.15), vy: rand(0.1, 0.5),
            life: rand(0.3, 0.55), size: rand(0.04, 0.09), sizeEnd: 0, color: col(GOLD, 1.8), colorEnd: col(0x802000, 0.2) });
        }
        // a slow golden ring of light on the floor beneath the warrior
        halo.position.set(p.x, groundHeight(p.x, p.z) + 0.05, p.z);
        halo.rotation.z = t * 0.6;
        haloMat.opacity = 0.35 * grow * left;
        if (ended || !player.alive) {
          for (const s of shields) burst(s.getWorldPosition(new THREE.Vector3()), { count: 14, color: GOLD, speed: 4, life: 0.45, size: 0.18, gravity: 3 });
          return false;
        }
        return true;
      },
      dispose() { G.scene.remove(root, halo); mats.face.dispose(); mats.rim.dispose(); mats.emblem.dispose(); haloMat.dispose(); },
    });
  },
};

export default skill;
