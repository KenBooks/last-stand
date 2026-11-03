// The Crypt: a moonlit cobblestone courtyard ringed by an octagonal gothic wall with four
// spawn gates, lancet window niches and banners; a raised central dais with obelisks,
// flagstone paths from the gates and a ring walk, spirit beacons and braziers. Broken columns,
// sarcophagi and gravestones break up the floor; a ruined necropolis and dead trees stand beyond.
import * as THREE from 'three';
import { portShader, seeKept, seeUniforms, wgslNoise } from '../core/shaderPorts';
import { WEBGPU } from '../core/webgpu';
import { dampNodes, outsideOutputNode } from './cryptNodes';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA } from '../data/balance';
import { cobblestone, soil, ashlar, granite, limestone, marble, slate, bark, bannerCloth, pbrMaterialMaps, runeCircle } from '../core/textures';
import { particles, col } from '../fx/particles';
import { damp, mulberry, rand, TAU } from '../util';
import { viewMode } from '../core/renderer';
import { seeThrough, seeThroughFade } from '../core/seeThrough';
import { floorRelief, reliefContext } from '../core/parallax';
import { buildSky, boxWithUV, buildGrassGeo, lumpy, placeGate, portalMembrane, setInstance, taperedTube, treeSpots, contactShadows, staticShadow, WALL_R, GATE_W, type BiomeBuilder, type EnvColours, type Portal, type Updater } from './props';

/** the crypt's environment's colours (compiled ahead: `compileEnvMaps`) */
export const CRYPT_ENV: EnvColours = { sky: [0.3, 0.36, 0.56], panel: [1.0, 1.05, 1.3] };
import { PropSet, instanceLook, meshLook, groupLook, type PropLook } from './destructible';
import { buildFire } from './fire';
import { restingLift, skullGeometry } from './skull';
import type { Obstacle } from '../types';
import { Wall } from './wall';
import { valueNoise3 } from '../core/patterns';
import { growTree, type Grow, type TreeKind } from './ezTrees';
import { restartsAt, runPhase } from './runPhase';

/** where the wall's parts are made: in the arena's frame */
const IDENTITY = new THREE.Matrix4();

const GATES = [0, 1, 2, 3].map((k) => (k / 4) * TAU);
/** angular distance from `a` to the nearest spawn gate */
const gateGap = (a: number) => Math.min(...GATES.map((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g)))));
/** the small dead trees standing on the floor among the props (`treeSpots`) */
const SMALL_TREES = { n: 6, near: 8, far: 24, apart: 7 };
/** the dead trees, grown by ez-tree bare and crooked: those beyond the wall, two kinds in turn, and the small ones in the
 *  play area (their trunks thicker: an arrow at a thin one slips past) */
const DEAD_TREES: Grow[] = [
  { preset: 'Oak Medium', seed: 811, sections: [8, 4, 2, 1], segments: [7, 4, 3, 3], leaves: 0.01, gnarl: 0.2, limbs: 1.8 },
  { preset: 'Ash Medium', seed: 2207, sections: [8, 4, 2, 1], segments: [7, 4, 3, 3], leaves: 0.01, gnarl: 0.2, limbs: 1.8 },
];
const SMALL_DEAD: Grow = {
  preset: 'Oak Medium', seed: 4401, sections: [8, 4, 2, 1], segments: [7, 4, 3, 3], leaves: 0.01, gnarl: 0.2, girth: 3.4,
  trunk: 2.2, crownStart: 0.7, limbs: 1.8,
};
/** a small dead tree's foot as it grows from the earth, in its trunk's radius at the foot: its flare (as wide at the
 *  ground, as high up the trunk) and its roots (how many, how far out, how thick where they leave the trunk) */
const TREE_FOOT = { flare: 1.7, flareUp: 1.6, roots: 5, reach: [3, 5], girth: 0.55 };
/** the dead bark's repeat, round and along (`growTree` lays a tile round each branch and as long as it's round) */
const DEAD_BARK: [number, number] = [6, 6];
/** the draws the old dead trees' geometry took from the biome's stream */
const OLD_DEAD_TREE_DRAWS = 12;
const polar = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
/** how high a grown tree's bark reaches (of its height of 1, its leaves' cards counted: bare, its bark stops short) */
function barkTop(kind: TreeKind): number {
  kind.bark.computeBoundingBox();
  return kind.bark.boundingBox!.max.y;
}

const FOG = 0x1a2034;
/** where the painted moon hangs in the sky (the shadow-casting light stays overhead for readable shadows) */
const MOON_DIR = new THREE.Vector3(-0.74, 0.3, 0.6).normalize();

/**
 * Beyond the wall, the ground, tombs and trees darken in the top-down view (`outside` eases to 1),
 * so the eye stays on the arena; the close views look out at the full skyline.
 */
const outside = restartsAt({ value: 0 }, { value: 1 });
function dimOutside(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uOutside = outside;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vOutXZ;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 outW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        outW = instanceMatrix * outW;
      #endif
      vOutXZ = (modelMatrix * outW).xz;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vOutXZ;\nuniform float uOutside;')
    .replace('#include <opaque_fragment>', `outgoingLight *= 1.0 - uOutside * 0.8 * smoothstep(${(WALL_R + 1.5).toFixed(1)}, ${(WALL_R + 7).toFixed(1)}, length(vOutXZ));
      #include <opaque_fragment>`);
}
/** how `dimOutside` darkens past the wall (WebGPU's nodes: `outsideOutputNode`) */
const OUTSIDE = { from: WALL_R + 1.5, to: WALL_R + 7, most: 0.8 };
function outsideDim<M extends THREE.Material>(m: M): M {
  if (WEBGPU) {
    (m as M & { outputNode: unknown }).outputNode = outsideOutputNode(outside, OUTSIDE);
    return m;
  }
  m.onBeforeCompile = dimOutside;
  m.customProgramCacheKey = () => 'outsidedim';
  return m;
}

/** World span (m) of one tile of the damp map; it repeats beyond, deep in the fog. */
const DAMP_SPAN = 128;

/**
 * The floor's damp, brightness drift and moss patches, baked once into a tiling map: the value
 * noise per pixel cost about a fifth of the frame's GPU time (the ground covers most of the screen).
 * Channels: r = damp amount, g = brightness drift, b = moss. Each noise has a whole number of
 * cells per tile, so the map repeats without a seam.
 */
function dampMap(size = 512): THREE.DataTexture {
  const noise = (freq: number, seed: number) => {
    const n = Math.max(1, Math.round(freq * DAMP_SPAN)), rng = mulberry(seed), lat = Float32Array.from({ length: n * n }, rng);
    const at = (i: number, j: number) => lat[((j % n) * n) + (i % n)];
    return (u: number, v: number): number => {
      const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y);
      let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
      return a + (b - a) * fy;
    };
  };
  const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const big = noise(0.13, 11), fine = noise(0.45, 12), drift = noise(0.05, 13), moss = noise(0.6, 14);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0, k = 0; y < size; y++) for (let x = 0; x < size; x++, k += 4) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    data[k] = 255 * smooth(0.52, 0.72, big(u, v) * 0.65 + fine(u, v) * 0.35);
    data[k + 1] = 255 * drift(u, v);
    data[k + 2] = 255 * smooth(0.35, 0.7, moss(u, v));
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** the cobbles' maps' repeat over the ground (110 m round): their photo 3.5 m a tile, where it covers 1.5 m (cobbles
 *  a hand across, as big as they are, were a glitter of noise from the camera) */
const COBBLE_REPEAT = 220 / 3.5;
/** the cobbles' relief: the grout this far under their tops (m), and gone this far off (m: past the top-down view's 30 to 51) */
const COBBLE_RELIEF = { depth: 0.06, perMetre: COBBLE_REPEAT / 220, fade: 70 };

/** the earth round each small dead tree's foot: how far out it reaches (m: at 2.4 "could be smaller"), how ragged
 *  its edge (of that), and its soil's tile (m: bare earth, `soil`; the forest floor's photo was fallen leaves, which in
 *  the crypt "cannot come from anywhere"), how
 *  far (m) its edge goes round the cobbles, in along the grout and out past the stones' tops, and how far (m) in and
 *  out of its edge the stones are washed with dirt: the grout fills first, then the stones are dirtied, then only
 *  dirt. Faded out evenly it was earth under a haze of cobbles ("the tiles around it should be clearly ending");
 *  cut sharp round the stones, a line ("some dirt on stones first, then only dirt") */
const EARTH = { reach: 1.4, ragged: 0.45, tile: 3, stones: 0.4, washed: [0.25, 0.3] };

/** Damp patches and a slow brightness drift over the cobbles in world space, so the floor doesn't
 * read as one tiled texture; the damp is darker and glossy, catching the moonlight. The cobbles stand
 * up out of their grout (core/parallax.ts). Round each of `earth`'s spots (x, z, reach; filled once the trees are
 * placed) the cobbles give way to the earth a tree grows from: stood on the stones, a dead tree's trunk rose out of
 * them as a post set in a pavement ("they need to grow from ground, not from stone"). */
function dampGround<M extends THREE.MeshStandardMaterial>(m: M, earth: THREE.Vector3[]): M {
  const damp = { value: dampMap() };
  const litter = pbrMaterialMaps(soil(), 1);
  if (WEBGPU) {
    const nodes = dampNodes(m, {
      map: damp.value, span: DAMP_SPAN, earth, ragged: EARTH.ragged, stones: EARTH.stones, washed: EARTH.washed,
      tile: EARTH.tile, soil: litter,
    });
    Object.assign(m, {
      colorNode: nodes.color, roughnessNode: nodes.roughness, normalNode: nodes.normal,
      outputNode: outsideOutputNode(outside, OUTSIDE),
    });
    reliefContext(m, COBBLE_RELIEF);
    return m;
  }
  m.onBeforeCompile = (shader) => {
    dimOutside(shader);
    shader.uniforms.uDamp = damp;
    shader.uniforms.uEarth = { value: earth };
    shader.uniforms.uLitter = { value: litter.map };
    shader.uniforms.uLitterN = { value: litter.normalMap };
    shader.uniforms.uLitterR = { value: litter.roughnessMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDampXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDampXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vDampXZ;
        uniform sampler2D uDamp;
        uniform vec3 uEarth[${earth.length}];
        uniform sampler2D uLitter;
        uniform sampler2D uLitterN;
        uniform sampler2D uLitterR;
        float dampAmt;
        float earthAmt;
        vec2 litterAt;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 dampS = texture2D(uDamp, vDampXZ * ${(1 / DAMP_SPAN).toFixed(6)}).rgb;
        dampAmt = dampS.r;
        diffuseColor.rgb *= 0.82 + dampS.g * 0.36;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.55, 0.68), dampAmt);
        // moss creeping in from the wall
        float mossR = smoothstep(22.0, 28.0, length(vDampXZ)) * dampS.b;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.075, 0.035), mossR * 0.7);
        // earth round the dead trees' feet, its edge ragged by the damp's own noise and cut round the cobbles: the
        // grout gives way first, a stone's top last, so the paving stops at whole stones
        float stoneTop = textureGrad(roughnessMap, reliefAt, reliefDx, reliefDy).r;
        earthAmt = 0.0;
        float earthIn = 1.0;
        for (int i = 0; i < ${earth.length}; i++) {
          float reach = uEarth[i].z;
          float d = length(vDampXZ - uEarth[i].xy) + (dampS.g - 0.5) * reach * ${EARTH.ragged.toFixed(2)};
          float edge = d - reach - (0.5 - stoneTop) * ${EARTH.stones.toFixed(2)};
          earthAmt = max(earthAmt, 1.0 - smoothstep(${(-EARTH.washed[0]).toFixed(2)}, ${EARTH.washed[1].toFixed(2)}, edge));
          earthIn = min(earthIn, d / max(reach, 1e-3));
        }
        // (bare soil, darker in towards the trunk)
        litterAt = vDampXZ * ${(1 / EARTH.tile).toFixed(6)};
        vec3 soil = texture2D(uLitter, litterAt).rgb * (0.75 + 0.25 * clamp(earthIn, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, soil, earthAmt);
        dampAmt *= 1.0 - earthAmt;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // (the soil's own relief, its tangent space the floor's: u along x, v along z, up its normal)
        vec3 litterN = texture2D(uLitterN, litterAt).xyz * 2.0 - 1.0;
        vec3 litterUp = normalize((viewMatrix * vec4(litterN.x, litterN.z, -litterN.y, 0.0)).xyz);
        normal = normalize(mix(normal, litterUp, earthAmt));`)

      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.42, dampAmt);
        roughnessFactor = mix(roughnessFactor, texture2D(uLitterR, litterAt).g, earthAmt);`);
    floorRelief(shader, COBBLE_RELIEF);
  };
  m.customProgramCacheKey = () => 'dampground';
  return m;
}

export const buildCrypt: BiomeBuilder = (scene) => {
  const rng = mulberry(1337);
  const r = (a: number, b: number) => a + rng() * (b - a);
  const obstacles: Obstacle[] = [];
  const breakable = new PropSet(obstacles);
  const updaters: Updater[] = [];
  const wall = new Wall('crypt');
  const h = ARENA.daisHalf;

  // --- Materials ------------------------------------------------------------
  const cob = cobblestone();
  // the ground reaches past the fog's far end, so its edge melts into the sky's horizon
  // (the earth round the small dead trees' feet, one a tree: set as they're placed)
  const earth = Array.from({ length: SMALL_TREES.n }, () => new THREE.Vector3());
  const groundMat = dampGround(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(cob, COBBLE_REPEAT, 1.1), color: 0xd0d4e0 }), earth);
  const wallMaps = ashlar(21, 6, 3);
  const wallMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wallMaps, 1, 1.2), color: 0xb4b8c6 });
  // the dais in riven slate; the paths to them in pale marble, lighter than the cobbles
  const daisMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(slate(33, 2, 2), 1, 1.2), color: 0xb8b8c0 });
  // (the braziers' plinths in honed granite: in slate's strata their steps read as planks)
  const graniteMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(granite(7), 2, 0.8), color: 0xd0d0d8 });
  const walkMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(marble(33, 5), 1, 1.2), color: 0xb8b8c0 });
  const darkStone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wallMaps, 1, 1), color: 0x7a7e8a });
  // (weathered limestone, pitted and streaked: in a plain grunge the columns read flat, painted grey)
  const carved = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(limestone(11), 2, 1.6), color: 0x8a8c92 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.9, roughness: 0.45 });
  // (its vertex colours darken a skull's sockets: `skullGeometry`)
  const boneMat = new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 0.8, vertexColors: true });
  // (grey, weathered: the forest's oak bark, its tiles square on ez-tree's trunks as on the forest's trees)
  const deadWood = outsideDim(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(bark(), DEAD_BARK, 1.4), color: 0x7a7670 }));
  // (velvet, as sdf-harness's: matte, with a sheen of its own colour at grazing angles; its gold sigil embroidered)
  const cloth = bannerCloth();
  const banner = new THREE.MeshPhysicalMaterial({
    map: cloth, roughness: 0.9, sheen: 1, sheenColorMap: cloth, sheenColor: new THREE.Color(1.8, 1.8, 1.8),
    sheenRoughness: 0.4, side: THREE.DoubleSide,
  });
  const gold = new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.8, roughness: 0.4 });
  const weedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const wax = new THREE.MeshStandardMaterial({ color: 0xd8ceb4, roughness: 0.6, emissive: 0x3a2008 });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3) });
  // window openings: dark recesses
  const nicheMat = new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 1 });

  // --- Sky: a horizon glow, a painted moon and stars ------------------------------
  scene.add(buildSky(FOG, MOON_DIR));

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 128).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Central dais -----------------------------------------------------------
  // (a 2 m tile: its slabs a metre long; at 2.4 and 2 tiles a metre they were 8 cm and read as speckle)
  const lower = boxWithUV(2 * (h + 0.7), 0.18, 2 * (h + 0.7), 0.5);
  const lowerM = new THREE.Mesh(lower, daisMat); lowerM.position.y = 0.09;
  const upper = boxWithUV(2 * h, 0.35, 2 * h, 0.5);
  const upperM = new THREE.Mesh(upper, daisMat); upperM.position.y = 0.175;
  for (const m of [lowerM, upperM]) { m.receiveShadow = true; m.castShadow = true; scene.add(m); }

  // rune circle in the center of the dais
  const runeMat = new THREE.MeshBasicMaterial({
    map: runeCircle(7), color: new THREE.Color(0x40d0ff).multiplyScalar(0.8),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), runeMat);
  rune.position.y = ARENA.daisHeight + 0.02;
  scene.add(rune);
  const eased = runPhase({ calm: 0 });
  let calmTarget = 0;
  updaters.push((dt: number, t: number) => {
    eased.calm += (calmTarget - eased.calm) * Math.min(1, dt * 2);
    const calm = eased.calm;
    const pulse = 0.55 + Math.sin(t * 1.6) * 0.15;
    // calm (lobby / between waves) brightens the circle slightly; keep the peak modest for bloom
    runeMat.color.setRGB(0.25, 0.8, 1.0).multiplyScalar(pulse * (0.6 + calm * 0.9));
    rune.rotation.y = t * 0.03;
  });

  // obelisks at the dais corners
  const obeliskGeo = buildObeliskGeo();
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3ab8ff, emissiveIntensity: 2.2 });
  // the props and walls dissolve between the camera and the player in the close views (the camera never pulls in)
  for (const m of [wallMat, darkStone, carved, iron, boneMat, deadWood, banner, gold, weedMat, wax, flameMat, nicheMat, glyphMat]) seeThrough(m, 'prop');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (h - 0.5), z = sz * (h - 0.5), g = new THREE.Group();
    scene.add(g);
    const ob = new THREE.Mesh(obeliskGeo, darkStone);
    ob.position.set(x, ARENA.daisHeight, z);
    ob.castShadow = ob.receiveShadow = true;
    g.add(ob);
    // glowing glyph strips on the two outward faces
    for (const [fx, fz] of [[sx, 0], [0, sz]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(fx ? 0.02 : 0.12, 1.6, fz ? 0.02 : 0.12), glyphMat);
      strip.position.set(x + fx * 0.5, ARENA.daisHeight + 2.0, z + fz * 0.5);
      g.add(strip);
    }
    obstacles.push({ x, z, r: 0.95, h: 6 });
    breakable.add(obstacles.length - 1, 60, 0x4a4a58, groupLook(g, updaters, updaters.length));
  }

  // --- Flagstone paths from the gates to the dais, and a ring walk ---------------------
  const walkParts: THREE.BufferGeometry[] = [];
  for (const a of GATES) {
    const len = WALL_R - (h + 0.7);
    const g = boxWithUV(3.2, 0.02, len, 0.25);
    g.translate(0, 0.01, h + 0.7 + len / 2).rotateY(Math.PI / 2 - a);
    walkParts.push(g.toNonIndexed());
  }
  walkParts.push(ringWalk(17.4, 19.6, 0.25));
  const walks = new THREE.Mesh(mergeGeometries(walkParts), walkMat);
  walks.receiveShadow = true;
  scene.add(walks);

  // --- Octagonal wall with gates, lancet windows and banners -------------------------
  const portals: Portal[] = [];
  const wallParts: THREE.BufferGeometry[] = [];
  const crenParts: THREE.BufferGeometry[] = [];
  const windowParts: THREE.BufferGeometry[] = [];
  const bannerParts: THREE.BufferGeometry[] = [];
  const rodParts: THREE.BufferGeometry[] = [];
  const lancet = lancetGeo(0.5, 1.25);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const side = 2 * WALL_R * Math.tan(Math.PI / 8) + 0.6;
    const isGate = k % 2 === 0;
    const segs = isGate ? [[-side / 2, -GATE_W / 2], [GATE_W / 2, side / 2]] : [[-side / 2, side / 2]];
    for (const [s0, s1] of segs) {
      const len = s1 - s0, mid = (s0 + s1) / 2;
      const g = boxWithUV(len, 2.6, 1.6, 0.35);
      g.translate(mid, 1.3, 0);
      wallParts.push(orient(g, a));
      // buttresses + spikes along the wall
      const n = Math.max(1, Math.round(len / 3.6));
      for (let i = 0; i <= n; i++) {
        const u = s0 + (len * i) / n;
        // the gate's own pillars stand at the wall's ends by a gate (a buttress there would narrow the opening)
        if (!isGate || Math.abs(Math.abs(u) - GATE_W / 2) > 0.01) {
          // standing 10cm proud of the wall's face (flush faces z-fight)
          const b = boxWithUV(0.9, 3.6, 2.2, 0.3); b.translate(u, 1.8, 0.2);
          crenParts.push(orient(b, a));
          const cap = new THREE.ConeGeometry(0.62, 1.1, 4).rotateY(Math.PI / 4); cap.translate(u, 4.15, 0.2);
          crenParts.push(orient(cap, a));
        }
        // a window niche in most bays, a banner on every other inner buttress of the solid sides
        if (i < n && rng() < 0.7) {
          const w = lancet.clone().translate(u + len / n / 2, 0.85, -0.83);
          windowParts.push(orient(w, a));
        }
        if (!isGate && i > 0 && i < n && i % 2 === 1) {
          bannerParts.push(orient(bannerGeo(rng).translate(u, 3.35, -0.98), a));
          rodParts.push(orient(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6).rotateZ(Math.PI / 2).translate(u, 3.4, -1.0), a));
        }
      }
    }
    if (isGate) portals.push(buildGate(scene, wall, a, darkStone, iron, updaters));
  }
  const walls = new THREE.Mesh(mergeGeometries(wallParts), wallMat);
  const crens = new THREE.Mesh(mergeGeometries(crenParts), darkStone);
  const banners = new THREE.Mesh(mergeGeometries(bannerParts), banner);
  const rods = new THREE.Mesh(mergeGeometries(rodParts), gold);
  for (const m of [walls, crens, banners, rods]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  scene.add(new THREE.Mesh(mergeGeometries(windowParts), nicheMat));
  for (const part of [...wallParts, ...crenParts]) wall.addGeometry(part, IDENTITY, true);
  // (the banners hang a hand in front of the buttresses, their hems at a head's height)
  for (const part of bannerParts) wall.addGeometry(part, IDENTITY, false);

  // --- Spirit beacons (blue flames) & braziers (orange): 6 of the biome's 10 point lights (and a portal's each) ---
  const beaconSpots = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
  const beaconFlame = beaconFlameMat(updaters);
  for (const [x, z] of beaconSpots) {
    const g = new THREE.Group(), u0 = updaters.length;
    scene.add(g);
    buildBeacon(g, x, z, darkStone, iron, beaconFlame, updaters);
    obstacles.push({ x, z, r: 0.65, h: 2.2 });
    breakable.add(obstacles.length - 1, 20, 0x3a3a48, groupLook(g, updaters, u0));
  }
  // on stepped plinths in the middle of two opposite solid (non-gate) wall sides
  for (const a of [Math.PI / 4, (5 * Math.PI) / 4]) {
    const [x, z] = polar(WALL_R - 2.4, a);
    const g = new THREE.Group(), u0 = updaters.length;
    scene.add(g);
    buildBrazier(g, x, z, a, iron, graniteMat, updaters);
    obstacles.push({ x, z, r: 1.45, h: 1.8 });
    breakable.add(obstacles.length - 1, 30, 0x3a3a48, groupLook(g, updaters, u0));
  }

  // --- Floor obstacles: broken columns, fallen drums, sarcophagi, gravestones -------------
  // (r, angle) spots clear of the gates' lanes, the lights, the grates and the lobby dummies
  const colSpots = [[9.5, 0.4, 3.4], [15, 1.95, 2.2], [22, 0.62, 4.2], [9.5, 3.55, 2.6], [14.5, 4.35, 3.8], [22, 2.72, 1.6], [15, 5.85, 3.0], [21.5, 4.05, 2.4]];
  // (a mesh each, its height and its break rolled anew for every run: `rollColumns`)
  const columns: Column[] = [];
  const candleSpots: [number, number, number][] = [];
  colSpots.forEach(([rr, a]) => {
    const [x, z] = polar(rr, a);
    const mesh = new THREE.Mesh(undefined, carved);
    mesh.position.set(x, 0, z);
    // (the old instances' turn still drawn from the stream: every prop placed after them would move)
    mesh.rotation.y = r(0, TAU);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'column';
    scene.add(mesh);
    const circle: Obstacle = { x, z, r: 0.85, h: 0 };
    obstacles.push(circle);
    breakable.add(obstacles.length - 1, COLUMN_HP, 0x8a8478, meshLook(mesh));
    columns.push({ mesh, circle });
    candleSpots.push([x + 0.9, z + 0.3, 0]);
  });
  rollColumns(columns, BOOT_ROLL);

  // fallen columns: a shaft lying across the floor and a couple of loose drums
  const drumGeo = new THREE.CylinderGeometry(0.44, 0.44, 1, FLUTED_SEGMENTS, 4).rotateZ(Math.PI / 2);
  fluted(drumGeo, 'x');
  const drums = new THREE.InstancedMesh(drumGeo, carved, 8);
  let di = 0;
  for (const [rr, a, rot] of [[22, 1.3, 0.5], [21.5, 5.0, -0.6], [11.5, 2.3, 1.1]]) {
    const [x, z] = polar(rr, a), yaw = a + rot;
    const shaft = di, n0 = obstacles.length;
    setInstance(drums, di++, x, 0.42, z, 0, yaw, 0, 3.2, 1, 1);
    for (const u of [-1.1, 0, 1.1]) obstacles.push({ x: x + Math.cos(yaw) * u, z: z - Math.sin(yaw) * u, r: 0.55, h: 0.9 });
    breakable.add(n0, 14, 0x8a8478, instanceLook(drums, shaft));
    // a drum broken off the end
    const ex = x + Math.cos(yaw) * 2.4, ez = z - Math.sin(yaw) * 2.4;
    setInstance(drums, di, ex, 0.44, ez, 0, yaw + r(0.3, 0.9), r(-0.1, 0.1), 0.9, 1, 1);
    obstacles.push({ x: ex, z: ez, r: 0.6, h: 0.9 });
    breakable.add(obstacles.length - 1, 7, 0x8a8478, instanceLook(drums, di++));
  }
  drums.count = di;
  drums.castShadow = drums.receiveShadow = true;
  scene.add(drums);

  const sarcSpots = [[12.5, 1.05], [12.5, 3.6], [21, 2.2], [21, 5.25]];
  const sarcGeo = buildSarcophagusGeo();
  sarcSpots.forEach(([rr, a], i) => {
    const [x, z] = polar(rr, a), yaw = -a;   // lying along the ring
    const s = new THREE.Mesh(i === 2 ? sarcGeo.open : sarcGeo.body, carved);
    s.position.set(x, 0, z); s.rotation.y = yaw;
    s.castShadow = s.receiveShadow = true;
    scene.add(s);
    const lid = new THREE.Mesh(sarcGeo.lid, carved);
    lid.position.set(x, 1.0, z); lid.rotation.y = yaw;
    // one lid pushed half off, sideways
    // (turned on it, so a wedge of the hollow body shows at one end: pushed straight it hid all but a slot)
    if (i === 2) { lid.position.x += Math.cos(yaw) * 0.5; lid.position.z -= Math.sin(yaw) * 0.5; lid.rotation.y += 0.5; lid.rotation.z = -0.1; }
    lid.castShadow = lid.receiveShadow = true;
    scene.add(lid);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), n0 = obstacles.length;
    for (const u of [-0.65, 0.65]) obstacles.push({ x: x + fx * u, z: z + fz * u, r: 0.8, h: 1.25 });
    breakable.add(n0, 16, 0x8a8478, meshLook(s, lid));
    candleSpots.push([x + fx * 1.55, z + fz * 1.55, 0], [x - fx * 1.55 + fz * 0.4, z - fz * 1.55 - fx * 0.4, 0]);
  });

  // gravestones: short rows of two or three along the wall, like family plots, all facing inwards
  const stoneGeo = buildHeadstoneGeo(), crossGeo = buildCrossGeo();
  const heads = new THREE.InstancedMesh(stoneGeo, carved, 24), crosses = new THREE.InstancedMesh(crossGeo, carved, 8);
  let hi = 0, ci = 0;
  for (const [rr, a] of [[24, 0.3], [23.5, 1.2], [24, 2.0], [23.5, 2.85], [24, 3.45], [23.5, 4.45], [24, 5.3], [24, 6.0]]) {
    const n = rng() < 0.5 ? 2 : 3, tx = -Math.sin(a), tz = Math.cos(a), yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    for (let k = 0; k < n; k++) {
      const u = (k - (n - 1) / 2) * 1.35 + r(-0.1, 0.1), [cx, cz] = polar(rr + r(-0.15, 0.15), a);
      const gx = cx + tx * u, gz = cz + tz * u, s = r(0.85, 1.15);
      // mostly upright; the odd one settled and leaning
      const lean = rng() < 0.3 ? r(-0.2, 0.2) : r(-0.04, 0.04);
      let look: ReturnType<typeof instanceLook>;
      if (k === n - 1 && rng() < 0.4) { setInstance(crosses, ci, gx, 0, gz, lean, yaw + r(-0.08, 0.08), r(-0.05, 0.05), s); look = instanceLook(crosses, ci++); }
      else { setInstance(heads, hi, gx, 0, gz, lean, yaw + r(-0.08, 0.08), r(-0.05, 0.05), s); look = instanceLook(heads, hi++); }
      obstacles.push({ x: gx, z: gz, r: 0.45, h: 1.1 * s });
      breakable.add(obstacles.length - 1, 4, 0x8a8478, look);
      // a few candles left at a grave's foot
      if (rng() < 0.25) candleSpots.push([gx - Math.cos(a) * 0.6, gz - Math.sin(a) * 0.6, 0]);
    }
  }
  heads.count = hi; crosses.count = ci;
  for (const m of [heads, crosses]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  // --- Candles: warm points of light round the props (no lights: emissive tips + bloom) ------
  buildCandles(scene, candleSpots, rng, wax, flameMat, updaters);

  // --- Weeds along the wall and round the props ------------------------------------------
  const free = (x: number, z: number, pad: number) => Math.max(Math.abs(x), Math.abs(z)) > h + 0.9 && obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + pad);
  const weeds = new THREE.InstancedMesh(buildGrassGeo(rng, [0.02, 0.025, 0.018], [0.09, 0.1, 0.05]), weedMat, 700);
  let wi = 0;
  for (let tries = 0; wi < weeds.count && tries < 12000; tries++) {
    const byWall = rng() < 0.55;
    let x: number, z: number;
    // the wall is an octagon: its inner face is furthest out at the corners
    if (byWall) { const a = r(0, TAU); [x, z] = polar((WALL_R - r(0.1, 2.2)) / Math.cos(((a + Math.PI / 8) % (Math.PI / 4)) - Math.PI / 8), a); }
    else { const o = obstacles[Math.floor(rng() * obstacles.length)], a = r(0, TAU), d = o.r + r(0, 0.8); x = o.x + Math.cos(a) * d; z = o.z + Math.sin(a) * d; }
    if (!free(x, z, 0.02)) continue;
    const s = r(0.6, 1.2);
    setInstance(weeds, wi++, x, 0, z, 0, r(0, TAU), 0, s, s * r(0.7, 1.2), s);
  }
  weeds.count = wi;
  weeds.receiveShadow = true;
  weeds.name = 'weeds';
  scene.add(weeds);

  // --- Small dead trees on the floor: wood an arrow goes into -------------------------
  // (after the weeds, which are placed round the obstacles; from streams of their own)
  const smallTreeSpots = treeSpots(mulberry(2718), SMALL_TREES, gateGap, obstacles,
    (x, z) => Math.max(Math.abs(x), Math.abs(z)) < h + 2 || Math.abs(Math.hypot(x, z) - 18.5) < 2);
  const small = growTree(SMALL_DEAD);
  const smallTrees = new THREE.InstancedMesh(small.bark, deadWood, smallTreeSpots.length);
  const treeRng = mulberry(1618);
  // (as tall as the forest's young oaks, to the top of its bark: scaled by its height alone, its limbs as grown stood
  // under 4 m)
  const smallTop = barkTop(small);
  // (each grown from the earth: its foot flared and rooted into it, its own stream's roots, `TREE_FOOT`)
  const feet = new THREE.InstancedMesh(buildTreeFootGeo(mulberry(4402)), deadWood, smallTreeSpots.length);
  smallTreeSpots.forEach(([x, z], i) => {
    const ht = 4.5 + treeRng() * 1.5, s = ht / smallTop, turn = treeRng() * TAU;
    setInstance(smallTrees, i, x, -0.1, z, 0, turn, 0, s);
    setInstance(feet, i, x, 0, z, 0, turn, 0, small.trunkFoot * s);
    // (round its trunk's foot, measured on the grown bark: `trunkFoot`)
    obstacles.push({ x, z, r: small.trunkFoot * s + 0.1, h: ht });
    earth[i].set(x, z, EARTH.reach);
    breakable.add(obstacles.length - 1, 10, 0x4a4038, bothLook(instanceLook(smallTrees, i), instanceLook(feet, i)), 'wood');
  });
  for (const mesh of [smallTrees, feet]) mesh.castShadow = mesh.receiveShadow = true;
  smallTrees.name = 'small dead trees';
  feet.name = 'small dead roots';
  scene.add(smallTrees, feet);
  updaters.push(contactShadows(scene, obstacles));

  // --- Beyond the wall: a ruined necropolis and dead trees ----------------------------
  buildNecropolis(scene, wall, rng, outsideDim(darkStone.clone()), outsideDim(nicheMat.clone()), deadWood);

  // --- Clutter: rubble, bones, grates -------------------------------------------
  scatterClutter(scene, rng, darkStone, boneMat, iron);

  // --- Ambient motes & ground mist -------------------------------------------------
  const due = runPhase({ motes: 0 });
  updaters.push((dt: number) => {
    outside.value = damp(outside.value, viewMode() === 'top' ? 1 : 0, 4, dt);
    due.motes += dt;
    while (due.motes > 0.05) {
      due.motes -= 0.05;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 30;
      particles.glow.spawn({
        x: Math.cos(a) * r, y: rand(0.3, 4), z: Math.sin(a) * r,
        vx: rand(-0.2, 0.2), vy: rand(0.05, 0.3), vz: rand(-0.2, 0.2),
        life: rand(3, 6), size: rand(0.04, 0.09), color: col(0x7fa8ff, 1.2), colorEnd: col(0x3040a0, 0.6), alpha: 0.8,
      });
      if (Math.random() < 0.3) {
        const b = Math.random() * TAU, rr = rand(12, 27);
        particles.smoke.spawn({
          x: Math.cos(b) * rr, y: 0.3, z: Math.sin(b) * rr, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), vy: 0.02,
          life: rand(6, 10), size: rand(5, 8), sizeEnd: 10, color: col(0x46506e), alpha: 0.08,
        });
      }
    }
  });

  return {
    look: {
      background: FOG,
      fog: { color: FOG, near: 42, far: 90 },
      hemi: { sky: 0x8090c8, ground: 0x1c1826, intensity: 1.05 },
      moon: { color: 0xc4d0ff, intensity: 2.7, pos: [-16, 34, 12] },
      env: CRYPT_ENV,
      envIntensity: 0.55,
    },
    obstacles,
    wall,
    props: breakable.list,
    portals,
    setCalm(v: number) { calmTarget = v; },
    update(dt: number, t: number) { for (const u of updaters) u(dt, t); },
    roll(seed: number) { rollColumns(columns, seed); },
  };
};

// ---------------------------------------------------------------------------
// helpers

function orient(geo: THREE.BufferGeometry, angle: number): THREE.BufferGeometry {
  // local -Z faces arena center; place on the octagon side at `angle`
  geo.translate(0, 0, WALL_R + 0.8);
  geo.rotateY(-angle + Math.PI / 2);
  return geo.index ? geo.toNonIndexed() : geo;
}

/** a column's flutes round it, and how deep each is (a share of its radius) */
const FLUTES = 12;
const FLUTE_DEPTH = 0.1;
/** the segments round a fluted shaft: eight a flute, so each groove is drawn round, not a facet */
const FLUTED_SEGMENTS = FLUTES * 8;

/** Flute a column along `axis` ('y' upright, 'x' lying): concave grooves round the shaft with a narrow flat
 *  between them, and its surface worn unevenly (a few cm in and out, as weather takes a soft stone). (12 grooves
 *  5% deep on 24 segments drew no groove at all: the shaft read as a smooth grey tube.) */
function fluted(g: THREE.BufferGeometry, axis: 'x' | 'y'): void {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v, along] = axis === 'y' ? [x, z, y] : [y, z, x];
    if (Math.hypot(u, v) < 0.05) continue;
    const angle = Math.atan2(v, u), phase = (((angle / TAU) * FLUTES) % 1 + 1) % 1;
    // (a groove's arc across 0.85 of its flute, the flat fillet the rest)
    const across = Math.min(1, Math.abs(phase - 0.5) / 0.425);
    const groove = Math.sqrt(Math.max(0, 1 - across * across));
    const wear = 0.012 * Math.sin(angle * 3 + along * 2.1) + 0.008 * Math.sin(angle * 7 - along * 5.3);
    const k = 1 - FLUTE_DEPTH * groove + wear;
    if (axis === 'y') pos.setXYZ(i, x * k, y, z * k); else pos.setXYZ(i, x, y * k, z * k);
  }
  g.computeVertexNormals();
}

/** Flat ring of flagstones between radii r0 and r1, the slabs following the ring. */
function ringWalk(r0: number, r1: number, texel: number): THREE.BufferGeometry {
  const segs = 128, g = new THREE.RingGeometry(r0, r1, segs, 1).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, around = TAU * ((r0 + r1) / 2) * texel;
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= segs; i++) uv.setXY(j * (segs + 1) + i, (i / segs) * Math.round(around), j * (r1 - r0) * texel);
  g.translate(0, 0.012, 0);
  return g.toNonIndexed();
}

/** A pointed-arch window pane (w wide, ht tall), facing -Z. */
function lancetGeo(w: number, ht: number): THREE.BufferGeometry {
  const s = new THREE.Shape(), hw = w / 2, spring = ht - w * 0.8;
  s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, spring);
  s.quadraticCurveTo(hw, ht - w * 0.25, 0, ht);
  s.quadraticCurveTo(-hw, ht - w * 0.25, -hw, spring);
  s.lineTo(-hw, 0);
  return new THREE.ShapeGeometry(s, 6).rotateY(Math.PI);
}

/** how long a banner's cloth is drawn (m: its longest tails' end) */
const BANNER_CLOTH = 2.65;

/** A tattered hanging banner, 1m wide, top edge at y = 0, facing -Z. */
export function bannerGeo(rng: () => number): THREE.BufferGeometry {
  const s = new THREE.Shape(), len = 1.9 + rng() * 0.5;
  s.moveTo(-0.45, 0); s.lineTo(0.45, 0); s.lineTo(0.45, -len + 0.25);
  // ragged tails
  for (let i = 1; i <= 6; i++) { const x = 0.45 - (i * 0.9) / 6; s.lineTo(x + 0.075, -len - rng() * 0.25 + (i % 2) * 0.28); s.lineTo(x, -len + 0.15 + rng() * 0.1); }
  s.lineTo(-0.45, 0);
  const g = new THREE.ShapeGeometry(s, 1);
  // hang slightly away from the wall towards the bottom; its cloth across it and down from its top (`bannerCloth`)
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + 0.45) / 0.9, 1 + pos.getY(i) / BANNER_CLOTH);
    pos.setZ(i, -pos.getY(i) * 0.06);
  }
  g.computeVertexNormals();
  return g.rotateY(Math.PI);
}

function buildObeliskGeo(): THREE.BufferGeometry {
  const base = boxWithUV(1.7, 0.5, 1.7, 0.6); base.translate(0, 0.25, 0);
  const plinth = boxWithUV(1.3, 0.35, 1.3, 0.6); plinth.translate(0, 0.67, 0);
  const shaft = new THREE.CylinderGeometry(0.5, 0.72, 4.2, 4, 1).rotateY(Math.PI / 4); shaft.translate(0, 2.95, 0);
  const cap = new THREE.ConeGeometry(0.55, 0.9, 4).rotateY(Math.PI / 4); cap.translate(0, 5.5, 0);
  return mergeGeometries([base, plinth, shaft, cap].map((g) => g.toNonIndexed()));
}

/** A column's base's mouldings over its plinth, from the plinth's top (m): a torus, a hollow under a fillet, and a
 *  smaller torus up to the shaft's foot. */
function columnBase(): THREE.Vector2[] {
  const points: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.6, 0)];
  const torus = (y: number, height: number, from: number, out: number) => {
    for (let k = 1; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      points.push(new THREE.Vector2(from + out * Math.sin(a), y + height * (1 - Math.cos(a)) / 2));
    }
  };
  torus(0, 0.12, 0.6, 0.05);
  points.push(new THREE.Vector2(0.55, 0.13), new THREE.Vector2(0.5, 0.16), new THREE.Vector2(0.52, 0.18));
  torus(0.18, 0.06, 0.52, 0.03);
  points.push(new THREE.Vector2(0.48, 0.24), new THREE.Vector2(0, 0.24));
  return points;
}

/** the columns' heights to their breaks' middles (m), how far a break slopes across (m), how wavy it is round the rim,
 *  how deep the chips out of its rim go, how rough its face is and how far its middle sinks: each rolled for each
 *  column between these */
const COLUMN_HEIGHT = [1.6, 4.4];
const BREAK_SLOPE = [0.08, 0.45];
const BREAK_WAVE = [0.04, 0.16];
const BREAK_CHIPS = [0.05, 0.16];
const BREAK_ROUGH = [0.03, 0.07];
const BREAK_HOLLOW = [0.04, 0.14];
/** the chips round the rim */
const CHIPS = 10;
/** a column's hit points, whatever its height */
const COLUMN_HP = 28;
/** the roll the columns stand in until a run rolls them (the lobby before the first run) */
const BOOT_ROLL = 1;
/** the shaft's radius at its top, and the rings its fracture's face is laid in */
const SHAFT_TOP = 0.44;
const FACE_RINGS = 8;
/** the shaft's foot over the base's mouldings (m), and how far past its break's highest it's built before it's broken */
const SHAFT_FOOT = 0.54;
const SHAFT_SPARE = 0.3;

/** A column standing in the crypt: its mesh and its circle, both rolled anew for a run. */
interface Column {
  mesh: THREE.Mesh;
  circle: Obstacle;
}

/** How a column's shaft breaks off: its middle's height, its slope and the way it falls, its wave round the rim and
 *  where it turns, the chips out of its rim, its face's roughness and noise, and how far its middle sinks. */
interface Break {
  at: number;
  slope: number;
  facing: number;
  wave: number;
  waveTurn: number;
  chips: number[];
  rough: number;
  salt: number;
  hollow: number;
}

/** A break rolled from `rng`. */
function rollBreak(rng: () => number): Break {
  const between = ([low, high]: number[]) => low + rng() * (high - low);
  return {
    at: between(COLUMN_HEIGHT),
    slope: between(BREAK_SLOPE),
    facing: rng() * TAU,
    wave: between(BREAK_WAVE),
    waveTurn: rng() * TAU,
    chips: Array.from({ length: CHIPS }, () => (rng() - 0.5) * 2 * between(BREAK_CHIPS)),
    rough: between(BREAK_ROUGH),
    salt: Math.floor(rng() * 1000),
    hollow: between(BREAK_HOLLOW),
  };
}

/** Every column built again from `seed`: its height and its break (a run's own, the same on every game in co-op). */
function rollColumns(columns: Column[], seed: number): void {
  const rng = mulberry(seed * 7919 + 17);
  for (const column of columns) {
    const broken = rollBreak(rng);
    column.mesh.geometry.dispose();
    column.mesh.geometry = buildColumnGeo(broken);
    column.circle.h = broken.at;
  }
}

/** How high `broken` is at (x, z) on the shaft's axis: a plane sloping across it, a wave round it and chips out of
 *  its rim, both growing out from the middle, and the middle sunk. Everything that turns with the angle is scaled by
 *  how far out it is: the slope taken round by the angle alone twisted the face about its middle, every point there
 *  at another height, and a vertical slit ran down through it ("still seeing holes in concrete pillars"). The chips
 *  are eased from one to the next round the rim, never a step: each step stood a cliff across the face. */
function breakAt(broken: Break, x: number, z: number): number {
  const a = Math.atan2(z, x), out = Math.min(1, Math.hypot(x, z) / SHAFT_TOP);
  const along = ((a + Math.PI) / TAU) * CHIPS, sector = Math.floor(along) % CHIPS;
  const ease = (1 - Math.cos((along % 1) * Math.PI)) / 2;
  const chip = broken.chips[sector] * (1 - ease) + broken.chips[(sector + 1) % CHIPS] * ease;
  return broken.at + broken.slope * out * Math.sin(a - broken.facing)
    + (broken.wave * Math.sin(2 * a + broken.waveTurn) + chip * out) * out - (1 - out) * broken.hollow;
}

/** The highest `broken` reaches anywhere over the shaft (m). */
const breakTopmost = (broken: Break): number =>
  broken.at + broken.slope + broken.wave + Math.max(0, ...broken.chips);

/**
 * A shaft snapped off as stone breaks: everything above a sloping surface, chipped at its rim, brought down onto it,
 * and the open top closed by the fracture's face (`fractureFace`), laid in from the shaft's own top row as it stands
 * fluted (laid from its round rim before the flutes were cut, the face stood off the grooves and the sky showed between
 * them). Each vertex of its top was raised at random by up to 0.45 m, and its neighbours apart, so it ended in thin
 * spikes, a sheet of paper's edge, not stone's ("difficult to break concrete like it is"); closed by a cylinder's own
 * cap, its face was a clean fan, an umbrella over the stump.
 */
function breakTop(shaft: THREE.BufferGeometry, radial: number, broken: Break): THREE.BufferGeometry {
  const pos = shaft.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = breakAt(broken, pos.getX(i), pos.getZ(i));
    if (pos.getY(i) > top) pos.setY(i, top);
  }
  // (a cylinder's top row of its side is its first: one vertex round it a segment, and the seam's again)
  const rim = Array.from({ length: radial + 1 }, (_, j) => new THREE.Vector2(pos.getX(j), pos.getZ(j)));
  return fractureFace(rim, broken);
}

/** The broken top's face inside its rim (the shaft's top row, as broken): rings in to the middle, each point at the
 *  break's height and roughened as split stone is, but not on the rim, where it meets the shaft. */
function fractureFace(rim: THREE.Vector2[], broken: Break): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (const edge of rim) {
    for (let k = 0; k <= FACE_RINGS; k++) {
      const share = 1 - k / FACE_RINGS, x = edge.x * share, z = edge.y * share;
      const noise = valueNoise3(x * 7, 0, z * 7, broken.salt) - 0.5;
      const rough = noise * 2 * broken.rough * (1 - share ** 3);
      positions.push(x, breakAt(broken, x, z) + rough, z);
      uvs.push(x + 0.5, z + 0.5);
    }
  }
  const row = FACE_RINGS + 1;
  for (let j = 0; j < rim.length - 1; j++) {
    for (let k = 0; k < FACE_RINGS; k++) {
      const a = j * row + k, b = (j + 1) * row + k;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  face.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  face.setIndex(index);
  face.computeVertexNormals();
  return face;
}

/** Two looks hidden, shown and met by a ray as one prop's. */
function bothLook(a: PropLook, b: PropLook): PropLook {
  return {
    hide: () => { a.hide(); b.hide(); },
    show: () => { a.show(); b.show(); },
    raycast: (ray, hits) => { a.raycast(ray, hits); b.raycast(ray, hits); },
    surfaces: (visit) => { a.surfaces(visit); b.surfaces(visit); },
  };
}

/** A dead tree's foot, its trunk's radius 1: the trunk flaring out into the earth, and roots leaving it round the
 *  flare, arching over the ground and sinking into it. Its bark's tiles as square as the trunk's (`DEAD_BARK`). */
function buildTreeFootGeo(rng: () => number): THREE.BufferGeometry {
  const { flare, flareUp, roots, reach, girth } = TREE_FOOT;
  const profile = Array.from({ length: 9 }, (_, k) => {
    const up = k / 8;
    // (wide at the ground, narrowing fast into the trunk, a little under it at the top so the bark covers it)
    return new THREE.Vector2(0.8 + (flare - 0.8) * (1 - up) ** 2.5, -0.15 + up * (flareUp + 0.15));
  });
  const collar = new THREE.LatheGeometry(profile, 16);
  const uv = collar.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (flareUp / TAU));
  const parts: THREE.BufferGeometry[] = [collar];
  for (let k = 0; k < roots; k++) {
    const a = ((k + 0.2 + rng() * 0.6) / roots) * TAU, out = reach[0] + rng() * (reach[1] - reach[0]);
    const at = (r: number, y: number) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const curve = new THREE.CatmullRomCurve3([at(0.6, 0.9), at(1.3, 0.35), at(out * 0.6, 0.12), at(out, -0.25)]);
    const root = taperedTube(curve, girth, 0.08);
    const rootUv = root.attributes.uv;
    // (v along it in turns of its girth, as the bark's is)
    for (let i = 0; i < rootUv.count; i++) rootUv.setY(i, rootUv.getY(i) * (curve.getLength() / (TAU * girth)));
    parts.push(root);
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  merged.computeVertexNormals();
  return merged;
}

/** A fluted column on a square base, snapped off at `broken`'s jagged top. */
function buildColumnGeo(broken: Break): THREE.BufferGeometry {
  const base = boxWithUV(1.3, 0.3, 1.3, 0.6).translate(0, 0.15, 0);
  // its base's mouldings: a torus, a hollow and a smaller torus up to the shaft (a plain drum read as a box)
  const torus = new THREE.LatheGeometry(columnBase(), 48).translate(0, 0.3, 0);
  // (open: its top closed by the fracture's face; fluted before it's broken, so the face meets its grooves)
  const length = breakTopmost(broken) + SHAFT_SPARE - SHAFT_FOOT;
  const rows = Math.max(8, Math.round(length * 7));
  const shaft = new THREE.CylinderGeometry(SHAFT_TOP, 0.48, length, FLUTED_SEGMENTS, rows, true)
    .translate(0, SHAFT_FOOT + length / 2, 0);
  fluted(shaft, 'y');
  const face = breakTop(shaft, FLUTED_SEGMENTS, broken);
  shaft.computeVertexNormals();
  return mergeGeometries([base, torus, shaft, face].map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** A stone coffin on a plinth, and its lid (origin at the lid's centre) with a carved figure. */
/** A sarcophagus: its body (`open`: hollow, for the one whose lid is pushed half off: its walls and floor, the band
 *  round its top a frame round the opening; solid inside, it showed stone where the lid had slid) and its lid. */
function buildSarcophagusGeo(): { body: THREE.BufferGeometry; open: THREE.BufferGeometry; lid: THREE.BufferGeometry } {
  const flat = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));
  const plinth = boxWithUV(1.45, 0.16, 2.65, 0.6).translate(0, 0.08, 0);
  const body = boxWithUV(1.1, 0.76, 2.3, 0.6).translate(0, 0.54, 0);
  const band = boxWithUV(1.18, 0.1, 2.38, 0.6).translate(0, 0.86, 0);
  const slab = boxWithUV(1.25, 0.16, 2.45, 0.6);
  const figure = lumpy(new THREE.CapsuleGeometry(0.24, 1.4, 4, 10).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0.05, 5).translate(0, 0.13, -0.05);
  const head = new THREE.SphereGeometry(0.17, 10, 8).scale(1, 0.8, 1).translate(0, 0.16, 0.92);
  const wall = 0.1, inX = 0.55 - wall, inZ = 1.15 - wall;
  const walls = [
    ...[-1, 1].map((sx) => boxWithUV(wall, 0.76, 2.3, 0.6).translate(sx * (0.55 - wall / 2), 0.54, 0)),
    ...[-1, 1].map((sz) => boxWithUV(2 * inX, 0.76, wall, 0.6).translate(0, 0.54, sz * (1.15 - wall / 2))),
    boxWithUV(2 * inX, 0.1, 2 * inZ, 0.6).translate(0, 0.3, 0),
  ];
  const frame = [
    ...[-1, 1].map((sx) => boxWithUV(1.18 / 2 - inX, 0.1, 2.38, 0.6).translate(sx * (1.18 / 2 + inX) / 2, 0.86, 0)),
    ...[-1, 1].map((sz) => boxWithUV(2 * inX, 0.1, 2.38 / 2 - inZ, 0.6).translate(0, 0.86, sz * (2.38 / 2 + inZ) / 2)),
  ];
  return { body: flat([plinth, body, band]), open: flat([plinth.clone(), ...walls, ...frame]), lid: flat([slab, figure, head]) };
}

function buildHeadstoneGeo(): THREE.BufferGeometry {
  const base = boxWithUV(0.72, 0.12, 0.3, 1).translate(0, 0.06, 0);
  // the slab and its rounded top one outline, its foot sunk in the base: a half disc set on a box split the face where
  // they met, `lumpy` moving the disc's corner in the middle of the box's edge and not the edge (#287)
  const half = 0.275, foot = 0.1, shoulder = 0.82, thick = 0.14;
  const outline = new THREE.Shape().moveTo(-half, foot).lineTo(half, foot).lineTo(half, shoulder)
    .absarc(0, shoulder, half, 0, Math.PI, false).lineTo(-half, foot);
  const slab = new THREE.ExtrudeGeometry(outline, { depth: thick, bevelEnabled: false, curveSegments: 14 });
  return lumpy(mergeGeometries([base.toNonIndexed(), slab.translate(0, 0, -thick / 2)]), 0.015, 9);
}

function buildCrossGeo(): THREE.BufferGeometry {
  const post = boxWithUV(0.14, 1.15, 0.12, 1).translate(0, 0.575, 0);
  const arm = boxWithUV(0.62, 0.13, 0.12, 1).translate(0, 0.82, 0);
  const foot = boxWithUV(0.4, 0.14, 0.3, 1).translate(0, 0.07, 0);
  return mergeGeometries([post, arm, foot].map((g) => g.toNonIndexed()));
}

/** A triangular prism roof, `w` wide and `ht` tall, running `len` along Z. */
function gable(w: number, ht: number, len: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, ht); s.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2);
}

/** Tombs, chapels and towers standing in the fog beyond the wall, with dark window openings,
 * among dead trees. Mostly outside the shadow camera: only the nearest trees cast. */
function buildNecropolis(scene: THREE.Object3D, wall: Wall, rng: () => number, stone: THREE.Material, niche: THREE.Material, wood: THREE.Material): void {
  const r = (a: number, b: number) => a + rng() * (b - a);
  const parts: THREE.BufferGeometry[] = [], holes: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry, x: number, z: number, yaw: number) => g.rotateY(yaw).translate(x, 0, z);
  const pane = (x: number, y: number, face: number, w: number, ht: number) => lancetGeo(w, ht).translate(x, y, face);
  const spots: [number, number][] = [];
  for (let tries = 0; spots.length < 14 && tries < 400; tries++) {
    const a = r(0, TAU), rr = r(37, 62);
    if (gateGap(a) < 0.18) continue;
    const [x, z] = polar(rr, a);
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 11)) continue;
    spots.push([x, z]);
  }
  spots.forEach(([x, z], i) => {
    const yaw = Math.atan2(x, z), kind = i % 3, g: THREE.BufferGeometry[] = [], l: THREE.BufferGeometry[] = [];
    if (kind === 0) {
      // bell tower: a tall shaft, a belfry opening, a steep spire with pinnacles
      const w = r(3, 4.2), H = r(11, 17);
      g.push(boxWithUV(w, H, w, 0.3).translate(0, H / 2, 0), boxWithUV(w + 0.5, 0.5, w + 0.5, 0.3).translate(0, H, 0));
      g.push(new THREE.ConeGeometry(w * 0.72, H * 0.6, 4).rotateY(Math.PI / 4).translate(0, H + H * 0.3, 0));
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.push(new THREE.ConeGeometry(0.28, 1.8, 4).translate(px * w * 0.5, H + 1.1, pz * w * 0.5));
      l.push(pane(0, H * 0.72, -w / 2 - 0.02, w * 0.35, w * 0.6));
      if (rng() < 0.6) l.push(pane(0, H * 0.35, -w / 2 - 0.02, 0.4, 1.0));
    } else if (kind === 1) {
      // chapel: a long nave with a steep gable roof, two tall windows on the end facing the arena
      const w = r(5, 7), L = r(8, 12), H = r(5, 7);
      g.push(boxWithUV(w, H, L, 0.3).translate(0, H / 2, 0));
      g.push(gable(w + 0.6, w * 0.7, L + 0.4).translate(0, H, 0));
      g.push(new THREE.ConeGeometry(0.5, 4, 4).translate(0, H + w * 0.7 + 1.2, -L / 2 + 0.3));
      for (const s of [-1, 1]) l.push(pane(s * w * 0.14, H * 0.3, -L / 2 - 0.02, w * 0.14, H * 0.55));
      for (const s of [-1, 1]) g.push(boxWithUV(0.8, H * 0.9, 1.2, 0.3).translate(s * (w / 2 + 0.3), H * 0.45, -L / 2 + 1));
    } else {
      // mausoleum: a squat tomb with columns, a pediment and a dim doorway
      const w = r(4, 5.5), H = r(3.2, 4.2);
      g.push(boxWithUV(w + 1, 0.5, w + 1.6, 0.3).translate(0, 0.25, 0), boxWithUV(w, H, w, 0.3).translate(0, 0.5 + H / 2, 0.5));
      g.push(boxWithUV(w + 0.6, 0.3, w + 1.2, 0.3).translate(0, 0.65 + H, 0.2), gable(w + 0.6, w * 0.3, w + 1.2).translate(0, 0.8 + H, 0.2));
      for (const s of [-1.5, -0.5, 0.5, 1.5]) g.push(new THREE.CylinderGeometry(0.18, 0.2, H, 8).translate(s * w * 0.28, 0.5 + H / 2, -w / 2));
      l.push(new THREE.PlaneGeometry(w * 0.3, H * 0.6).rotateY(Math.PI).translate(0, 0.5 + H * 0.3, -w / 2 + 0.49));
    }
    // face the arena (local -Z towards the centre)
    for (const p of g) parts.push(place(p.index ? p.toNonIndexed() : p, x, z, yaw));
    // (what an arrow over the wall meets: each tomb a part of its own, its sphere round it alone)
    wall.addGeometry(mergeGeometries(parts.slice(-g.length)), IDENTITY, true, 'beyond');
    for (const p of l) holes.push(place(p.index ? p.toNonIndexed() : p, x, z, yaw));
  });
  scene.add(new THREE.Mesh(mergeGeometries(parts), stone));
  scene.add(new THREE.Mesh(mergeGeometries(holes), niche));

  // dead trees between the wall and the tombs, and a few among them
  const treeN = 46;
  // (grown by ez-tree, a kind or another in turn; the old trees' draws from the stream still drawn: drawn from it,
  // every tree and the clutter placed after it moved)
  for (let i = 0; i < OLD_DEAD_TREE_DRAWS; i++) rng();
  const kinds = DEAD_TREES.map(growTree), tops = kinds.map(barkTop);
  const trees = kinds.map((k) => new THREE.InstancedMesh(k.bark, wood, treeN));
  const used = kinds.map(() => 0);
  const at = new THREE.Matrix4();
  for (let tries = 0, ti = 0; ti < treeN && tries < 2000; tries++) {
    const a = r(0, TAU), rr = 33 + Math.pow(r(0, 1), 1.3) * 26;
    if (rr < 42 && gateGap(a) < 0.12) continue;
    const [x, z] = polar(rr, a);
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 5)) continue;
    // (as tall as the forest's trees round its ring, taller further out, to the top of the bark: 5 to 10 m across the
    // whole tree, they stood under the wall's towers; narrowed by their reach, as the forest's, to keep their limbs
    // outside the wall)
    const k = ti++ % kinds.length, s = Math.min(22, 9 + (rr - 34) * 0.6) * r(0.85, 1.15) / tops[k];
    let w = s;
    for (const reach of kinds[k].reach) if (reach > 0) w = Math.min(w, (rr - WALL_R - 1) / reach);
    // (sunk a little: a trunk is an open tube at its foot)
    setInstance(trees[k], used[k], x, -0.2, z, r(-0.08, 0.08), r(0, TAU), r(-0.08, 0.08), w, s, w);
    // (what an arrow over the wall meets: each tree's trunk, its limbs let go, as the forest's)
    wall.addGeometry(kinds[k].trunk, trees[k].getMatrixAt(used[k]++, at), false, 'beyond');
  }
  trees.forEach((mesh, k) => {
    mesh.count = used[k];
    mesh.castShadow = true;
    mesh.name = `dead trees: ${DEAD_TREES[k].preset}`;
    scene.add(mesh);
  });
}

function buildGate(scene: THREE.Object3D, wall: Wall, angle: number, stone: THREE.Material, iron: THREE.Material, updaters: Updater[]): Portal {
  const g = new THREE.Group();
  const pillarGeo = boxWithUV(1.3, 5.2, 1.9, 0.35);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, stone);
    p.position.set(s * (GATE_W / 2 + 0.5), 2.6, 0);
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4).rotateY(Math.PI / 4), stone);
    spike.position.set(s * (GATE_W / 2 + 0.5), 6.0, 0);
    spike.castShadow = true;
    g.add(spike);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(GATE_W / 2 + 0.2, 0.45, 8, 24, Math.PI), stone);
  arch.position.y = 4.1; arch.castShadow = true;
  g.add(arch);
  const lintel = new THREE.Mesh(boxWithUV(GATE_W + 2.4, 0.6, 2.0, 0.4), stone);
  lintel.position.y = 5.0; lintel.castShadow = true;
  g.add(lintel);
  // a raised portcullis: its teeth hang under the lintel
  const bars = new THREE.Mesh(mergeGeometries(Array.from({ length: 7 }, (_, i) =>
    new THREE.ConeGeometry(0.06, 0.7, 4).rotateX(Math.PI).translate((i - 3) * 0.6, 4.35, 0.9).toNonIndexed())), iron);
  bars.castShadow = true;
  g.add(bars);

  const { portal } = portalMembrane(g, angle, { a: [0.5, 0.05, 0.9], b: [1.0, 0.25, 0.35], core: [1.0, 0.6, 1.0] }, updaters);
  placeGate(g, angle);
  scene.add(g);
  wall.add(g, true);
  return portal;
}

/** A spirit beacon: a carved pedestal whose iron prongs cradle a cold flame (a teardrop with
 * rising noise bands and a bright rim round a white-hot core), circled by two rune rings. */
function buildBeacon(scene: THREE.Object3D, x: number, z: number, stone: THREE.Material, iron: THREE.Material, flameMat: THREE.ShaderMaterial, updaters: Updater[]): void {
  const plinth = new THREE.Mesh(boxWithUV(1.3, 0.14, 1.3, 0.6), stone);
  plinth.position.set(x, 0.07, z); plinth.rotation.y = Math.PI / 4;
  const pts = [[0.6, 0.14], [0.6, 0.22], [0.48, 0.26], [0.48, 0.32], [0.34, 0.38], [0.24, 0.46], [0.2, 0.66], [0.27, 0.7], [0.27, 0.75], [0.2, 0.79],
    [0.18, 0.92], [0.26, 0.97], [0.42, 1.05], [0.5, 1.13], [0.52, 1.18], [0.44, 1.18], [0.3, 1.11], [0, 1.08]].map(([a, b]) => new THREE.Vector2(a, b));
  const ped = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), stone);
  ped.position.set(x, 0, z);
  // four iron prongs rising from the bowl's rim and curling in over the flame
  const prongs = new THREE.Mesh(mergeGeometries([0, 1, 2, 3].map((k) => {
    const a = (k / 4) * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(c * 0.46, 1.16, s * 0.46), new THREE.Vector3(c * 0.62, 1.5, s * 0.62),
      new THREE.Vector3(c * 0.5, 2.0, s * 0.5), new THREE.Vector3(c * 0.2, 2.15, s * 0.2));
    return new THREE.TubeGeometry(curve, 12, 0.03, 5, false).toNonIndexed();
  })), iron);
  prongs.position.set(x, 0, z);
  for (const m of [plinth, ped, prongs]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  const flame = new THREE.Mesh(teardropGeo(), flameMat);
  flame.position.set(x, 1.12, z);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), seeThrough(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8e8ff).multiplyScalar(2.2) }), 'prop'));
  core.position.set(x, 1.42, z);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ab0ff).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings = [0.5, 0.36].map((rad) => {
    const ring = new THREE.Mesh(runeRingGeo(rad), ringMat);
    ring.position.set(x, 1.5, z);
    scene.add(ring);
    return ring;
  });
  scene.add(flame, core);
  const light = new THREE.PointLight(0x5aa8ff, 6, 12, 2);
  light.position.set(x, 2.0, z);
  scene.add(light);
  const due = runPhase({ acc: 0 });
  updaters.push((dt, t) => {
    const f = Math.sin(t * 7 + x) * 0.5 + Math.sin(t * 13 + z) * 0.5;
    light.intensity = 6 + f * 0.9;
    core.scale.setScalar(1 + f * 0.12);
    rings[0].rotation.set(0.35 + Math.sin(t * 0.7 + x) * 0.1, t * 0.8, 0.2);
    rings[1].rotation.set(-0.5, -t * 1.3, Math.sin(t * 0.9 + z) * 0.15);
    rings[0].position.y = 1.5 + Math.sin(t * 1.4 + x) * 0.05;
    due.acc += dt;
    while (due.acc > 0.03) {
      due.acc -= 0.03;
      particles.glow.spawn({
        x: x + rand(-0.12, 0.12), y: 1.5, z: z + rand(-0.12, 0.12), vx: rand(-0.1, 0.1), vy: rand(0.9, 1.7), vz: rand(-0.1, 0.1),
        life: rand(0.4, 0.8), size: rand(0.16, 0.26), sizeEnd: 0.02, color: col(0x6ab8ff, 1.2), colorEnd: col(0x2030ff, 0.5), drag: 1,
      });
      // wisps thrown off the rim, spiralling out and up
      if (Math.random() < 0.3) {
        const a = Math.random() * TAU, c = Math.cos(a), s = Math.sin(a);
        particles.glow.spawn({
          x: x + c * 0.3, y: rand(1.3, 1.8), z: z + s * 0.3, vx: -s * 0.9 + c * 0.25, vy: rand(0.3, 0.7), vz: c * 0.9 + s * 0.25,
          life: rand(0.8, 1.4), size: rand(0.05, 0.09), color: col(0xa8dcff, 2), colorEnd: col(0x3050ff, 0.4), drag: 1.5,
        });
      }
    }
  });
}

/** A unit teardrop (y 0..1) for the beacon flames. */
function teardropGeo(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) { const y = i / 20; pts.push(new THREE.Vector2(0.3 * Math.sin(Math.PI * Math.pow(y, 0.55)) * (1 - y * 0.35), y * 1.05)); }
  return new THREE.LatheGeometry(pts, 20);
}

/** A thin ring studded with small rune blocks. */
function runeRingGeo(rad: number): THREE.BufferGeometry {
  const parts = [new THREE.TorusGeometry(rad, 0.008, 4, 64).rotateX(Math.PI / 2).toNonIndexed()];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, w = i % 3 === 0 ? 0.07 : 0.035;
    parts.push(new THREE.BoxGeometry(w, 0.012, 0.02).rotateY(-a).translate(Math.cos(a) * rad, 0, Math.sin(a) * rad).toNonIndexed());
  }
  return mergeGeometries(parts);
}

/** The beacons' cold flame: a flickering, noise-banded teardrop, brighter at the rim and the base. */
function beaconFlameMat(updaters: Updater[]): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 p = position;
        float w = sin(uTime * 7.0 + p.y * 9.0) * 0.06 + sin(uTime * 11.0 - p.y * 5.0) * 0.04;
        p.xz *= 1.0 + w * p.y;
        p.x += sin(uTime * 3.0 + p.y * 4.0) * 0.05 * p.y * p.y;
        vP = p;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 1.6);
        float bands = n(vec2(vP.x * 6.0 + vP.z * 4.0, vP.y * 5.0 - uTime * 3.2)) * 0.6 + n(vec2(vP.z * 11.0 - vP.x * 3.0, vP.y * 9.0 - uTime * 5.0)) * 0.4;
        float fade = 1.0 - smoothstep(0.45, 1.05, vP.y + bands * 0.25);
        vec3 c = mix(vec3(0.1, 0.35, 1.0), vec3(0.75, 0.9, 1.0), rim * 0.6 + (1.0 - vP.y) * 0.3);
        gl_FragColor = vec4(c * (0.25 + rim * 1.2) * (0.55 + bands * 0.9) * fade * (1.0 - seeFade()), 1.0);
      }`,
  });
  // (it fades as the beacon under it dissolves, not left burning in the air)
  seeThroughFade(mat, 'prop');
  portShader(mat, ({ wgslFn, positionGeometry, normalView, positionViewDirection, varying, vec4 }, u) => {
    const moved = wgslFn(`fn beaconPosition(pos: vec3f, time: f32) -> vec3f {
      var p = pos;
      let w = sin(time * 7.0 + p.y * 9.0) * 0.06 + sin(time * 11.0 - p.y * 5.0) * 0.04;
      p = vec3f(p.x * (1.0 + w * p.y), p.y, p.z * (1.0 + w * p.y));
      p.x += sin(time * 3.0 + p.y * 4.0) * 0.05 * p.y * p.y;
      return p;
    }`)({ pos: positionGeometry, time: u.uTime });
    const kept = seeKept(seeUniforms(mat.uniforms));
    return {
      position: moved,
      fragment: vec4(kept, kept, kept, 1).mul(wgslFn(`fn beaconFlame(p: vec3f, nrm: vec3f, v: vec3f, time: f32) -> vec4f {
        let rim = pow(max(1.0 - abs(dot(normalize(nrm), v)), 0.0), 1.6);
        let bands = noise2(vec2f(p.x * 6.0 + p.z * 4.0, p.y * 5.0 - time * 3.2)) * 0.6
          + noise2(vec2f(p.z * 11.0 - p.x * 3.0, p.y * 9.0 - time * 5.0)) * 0.4;
        let fade = 1.0 - smoothstep(0.45, 1.05, p.y + bands * 0.25);
        let c = mix(vec3f(0.1, 0.35, 1.0), vec3f(0.75, 0.9, 1.0), rim * 0.6 + (1.0 - p.y) * 0.3);
        return vec4f(c * (0.25 + rim * 1.2) * (0.55 + bands * 0.9) * fade, 1.0);
      }`, [wgslNoise().noise2])({ p: varying(moved), nrm: normalView, v: positionViewDirection, time: u.uTime })),
    };
  });
  updaters.push((_dt, t) => { mat.uniforms.uTime.value = t; });
  return mat;
}

/** A brazier on two stepped slabs, its fire's light casting the still shadows; `y0` the floor it stands on (the hall
 *  of heroes' stage: world/heroHall.ts). */
export function buildBrazier(scene: THREE.Object3D, x: number, z: number, a: number, iron: THREE.Material, stone: THREE.Material, updaters: Updater[], y0 = 0, glow = 15, flames = 1): void {
  // two stepped slabs lift the fire
  for (const [w, y] of [[2.4, 0.14], [1.7, 0.4]]) {
    const step = new THREE.Mesh(boxWithUV(w, 0.28, w, 0.5), stone);
    step.position.set(x, y0 + y, z); step.rotation.y = Math.PI / 2 - a;   // square to the wall
    step.castShadow = step.receiveShadow = true;
    scene.add(step);
  }
  const lift = y0 + 0.54;
  const pts = [[0.2, 0], [0.12, 0.1], [0.1, 0.8], [0.25, 0.9], [0.6, 1.1], [0.65, 1.25], [0.5, 1.2], [0, 1.05]].map(([a, b]) => new THREE.Vector2(a, b));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), iron);
  bowl.position.set(x, lift, z); bowl.castShadow = true;
  scene.add(bowl);
  const light = new THREE.PointLight(0xff7a30, glow, 15, 2);
  light.position.set(x, lift + 2.1, z);
  staticShadow(light);
  scene.add(light);
  // a heap of coals in the bowl, burning thin and dark
  buildFire(scene, {
    at: new THREE.Vector3(x, lift + 1.06, z), radius: 0.5, height: 1.05, dish: 0.14, light, intensity: glow,
    // (the bowl's outside from the bed's middle, as its lathe draws it: its foot, its belly and its rim)
    bowl: [[-0.16, 0.25], [0.04, 0.6], [0.19, 0.65]],
    smoke: 2.5, smokeColour: 0x2c2a28, embers: 8, glow: flames,
  }, updaters);
}

/** Clusters of candles of different heights, their flames swaying, now and then giving off a spark. */
function buildCandles(scene: THREE.Object3D, spots: [number, number, number][], rng: () => number, wax: THREE.Material, flame: THREE.Material, updaters: Updater[]): void {
  const n = spots.length * 5;
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0), wax, n);
  const flames = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6).scale(1, 2.2, 1), flame, n);
  const tips: [number, number, number, number][] = [];
  let i = 0;
  for (const [cx, cz, y0] of spots) {
    for (let k = 0; k < 5; k++) {
      const a = rng() * TAU, d = rng() * 0.3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const rad = 0.035 + rng() * 0.035, ht = 0.08 + rng() * 0.3;
      setInstance(sticks, i, x, y0, z, 0, 0, 0, rad, ht, rad);
      setInstance(flames, i, x, y0 + ht + 0.045, z, 0, 0, 0, 0.022);
      tips.push([x, y0 + ht + 0.05, z, rng() * TAU]);
      i++;
    }
  }
  sticks.castShadow = true;
  scene.add(sticks, flames);
  const due = runPhase({ acc: 0 });
  updaters.push((dt, t) => {
    for (let k = 0; k < tips.length; k++) {
      const [x, y, z, ph] = tips[k], f = Math.sin(t * 9 + ph) * 0.5 + Math.sin(t * 17 + ph * 2) * 0.5;
      setInstance(flames, k, x + f * 0.006, y - 0.005, z, f * 0.12, 0, 0, 0.022, 0.022 * (1 + f * 0.15), 0.022);
    }
    flames.instanceMatrix.needsUpdate = true;
    due.acc += dt;
    while (due.acc > 0.15) {
      due.acc -= 0.15;
      const [x, y, z] = tips[Math.floor(Math.random() * tips.length)];
      particles.glow.spawn({
        x, y: y + 0.04, z, vx: rand(-0.05, 0.05), vy: rand(0.3, 0.6), vz: rand(-0.05, 0.05),
        life: rand(0.5, 1), size: rand(0.08, 0.14), sizeEnd: 0.01, color: col(0xffb050, 1.6), colorEnd: col(0xff4000, 0.3),
      });
    }
  });
}

function scatterClutter(scene: THREE.Object3D, rng: () => number, stone: THREE.Material, bone: THREE.Material, iron: THREE.Material): void {
  const r = (a: number, b: number) => a + rng() * (b - a);
  // rubble: on the dais, heaped along the wall, and round the columns' feet
  const rockGeo = new THREE.DodecahedronGeometry(0.2, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, stone, 300);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < rocks.count; i++) {
    let x, z;
    if (i < 60) { x = r(-ARENA.daisHalf + 0.3, ARENA.daisHalf - 0.3); z = r(-ARENA.daisHalf + 0.3, ARENA.daisHalf - 0.3); if (Math.hypot(x, z) < 3.8) { x *= 1.6; z *= 1.6; } }
    else { const a = r(0, TAU), rr = r(24, 28); x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
    const sc = r(0.3, i < 60 ? 0.9 : 1.8);
    e.set(r(0, 3), r(0, 3), r(0, 3)); q.setFromEuler(e); s.set(sc, sc * r(0.5, 1), sc);
    p.set(x, (i < 60 ? ARENA.daisHeight : 0) + 0.02, z);
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // bones (a shaft with knobbed ends) & skulls
  const boneGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6).rotateZ(Math.PI / 2),
    ...[-0.17, 0.17].flatMap((x) => [-0.025, 0.025].map((z) => new THREE.SphereGeometry(0.03, 6, 4).translate(x, 0, z))),
  ].map((g) => g.toNonIndexed()));
  boneGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(boneGeo.attributes.position.count * 3).fill(1), 3));
  const bones = new THREE.InstancedMesh(boneGeo, bone, 70);
  for (let i = 0; i < bones.count; i++) {
    const a = r(0, TAU), rr = i < 12 ? r(1.5, ARENA.daisHalf) : r(6, 27);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    e.set(0, r(0, TAU), r(-0.2, 0.2)); q.setFromEuler(e); s.setScalar(r(0.7, 1.3));
    p.set(x, (Math.max(Math.abs(x), Math.abs(z)) < ARENA.daisHalf ? ARENA.daisHeight : 0) + 0.03, z);
    bones.setMatrixAt(i, m.compose(p, q, s));
  }
  bones.castShadow = true;
  scene.add(bones);
  const skullGeo = skullGeometry();
  const skulls = new THREE.InstancedMesh(skullGeo, bone, 24);
  for (let i = 0; i < skulls.count; i++) {
    const a = r(0, TAU), rr = r(2, 27);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // (some face up or lie on a side, as a skull without its jaw rolls)
    e.set(r(-0.5, 0.15), r(0, TAU), r(0, 1) < 0.3 ? r(-1.3, 1.3) : r(-0.2, 0.2)); q.setFromEuler(e); s.setScalar(r(0.85, 1.15));
    const lift = restingLift(skullGeo, q, s.x) - 0.004;
    p.set(x, (Math.max(Math.abs(x), Math.abs(z)) < ARENA.daisHalf ? ARENA.daisHeight : 0) + lift, z);
    skulls.setMatrixAt(i, m.compose(p, q, s));
  }
  skulls.castShadow = true;
  scene.add(skulls);
}
