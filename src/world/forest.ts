// The Thornwood: a sunlit clearing walled in by thickets, boulders and old trees, ancient giants
// standing over the forest beyond, with four root-arch spawn gates, a mossy stone dais ringed by
// standing stones, glowcap mushroom clusters and two bonfires. Stumps, logs and boulders break up the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeThrough } from '../core/seeThrough';
import { ARENA } from '../data/balance';
import { forestFloor, bark, flagstone, moss, rock, wood, pbrMaterialMaps, runeCircle, type Repeat } from '../core/textures';
import { particles, col } from '../fx/particles';
import { makeFbm, mulberry, rand, TAU } from '../util';
import { boulderGeo, boxUVs, buildDaySky, boxWithUV, buildGrassTuft, lumpy, placeGate, portalMembrane, setInstance, taperedTube, treeSpots, contactShadows, staticShadow, WALL_R, GATE_W, type BiomeBuilder, type EnvColours, type Portal, type TuftColours, type Updater } from './props';

/** the forest's environment's colours (compiled ahead: `compileEnvMaps`) */
export const FOREST_ENV: EnvColours = { sky: [0.55, 0.7, 0.8], panel: [1.3, 1.25, 1.1] };
import { cullInCells, eachInstance, gridCell, ringSector } from './culling';
import { growTree, REACH_BANDS, type Grow } from './ezTrees';
import { canopyGeo, fernClumpGeo, fernTexture, leafClusterTexture, leafTexture, lightShafts, litterGeo } from './foliage';
import { bend, rag, taperTube } from '../entities/models/shapes';
import { PropSet, instanceLook, meshLook, groupLook } from './destructible';
import { buildFire, emberMat, type FireLog } from './fire';
import { floorRelief, reliefContext } from '../core/parallax';
import { tsl, WEBGPU, stillNodes } from '../core/webgpu';
import { grassWindNode, mossColorNode } from './forestNodes';
import { valueNoise3 } from '../core/patterns';
import { tubesRelief } from './ground';
import type { Obstacle } from '../types';
import { Wall } from './wall';
import { buildStumpGeos } from './stump';
import { runPhase } from './runPhase';

const GATES = [0, 1, 2, 3].map((k) => (k / 4) * TAU);
/** daylight haze: the fog, and the sky at the horizon */
const FOG = 0x9ab4a6;
const SUN = new THREE.Vector3(-18, 40, 14);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** angular distance from `a` to the nearest spawn gate */
const gateGap = (a: number) => Math.min(...GATES.map((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g)))));

/** the cells the instanced meshes are culled by (`world/culling.ts`): the thicket's slices of the ring, and the squares
 *  the grass and ferns are spread over (each cell a sphere tested a frame; the trees are culled one by one) */
const THICKET_CELLS = ringSector(48), FLOOR_CELLS = gridCell(8);

/** the forest floor's maps' repeat over the ground (110 m round): its photo 3 m a tile, where it covers 1.26 m (its
 *  leaves, as big as they are, were a brown blur from the camera) */
const FLOOR_REPEAT = 220 / 3;
/** its relief: the soil this far under the pebbles' and leaves' tops (m), and gone this far off (m: past the top-down view's 30 to 51) */
const FLOOR_RELIEF = { depth: 0.045, perMetre: FLOOR_REPEAT / 220, fade: 70 };

/** grass sways this far at its tips (m), slowly (rad/s), each tuft a little after the one upwind of it */
const SWAY = 0.05, SWAY_RATE = 1.3;
/** the bonfires' places, by the wall on the diagonal */
const BONFIRES = [Math.PI / 4, (5 * Math.PI) / 4].map((a) => [Math.cos(a) * (WALL_R - 2.4), Math.sin(a) * (WALL_R - 2.4)]);
/** a fire clears the ground round it (m): nothing lies within its ring of stones, and a fern's roots stand clear of
 *  its flames by its fronds' reach (a share of its scale) besides: grown beside a bonfire, ferns spread over the flames
 *  and hid them from the top-down view (`npm run lab -- fire`) */
const FIRE_RING = 1.0, FIRE_FERN_CLEAR = 0.7, FROND_REACH = 0.9;
/** how far past a fire's clearing what stood in it is moved (m, at most) */
const FIRE_SPREAD = 0.8;

/** (`x`, `z`) moved out of every bonfire's clearing `reach` (m) round its middle, away from it and up to `FIRE_SPREAD`
 *  past its edge by its own place (moved rather than left out: a spot drawn again draws more random numbers, and every
 *  prop placed after it moves). */
function clearOfFires(x: number, z: number, reach: number): [number, number] {
  for (const [fx, fz] of BONFIRES) {
    const dx = x - fx, dz = z - fz, d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    const spread = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const out = reach + spread * FIRE_SPREAD;
    const [ux, uz] = d > 1e-4 ? [dx / d, dz / d] : [1, 0];
    return [fx + ux * out, fz + uz * out];
  }
  return [x, z];
}

/**
 * Wind in the grass: each blade's points swayed by the square of their height (a blade bends from its root), the tufts
 * along a wave that crosses the clearing, on the game's clock (an updater keeps the time).
 */
function windInGrass(m: THREE.MeshStandardMaterial, updaters: Updater[]): THREE.MeshStandardMaterial {
  if (WEBGPU) {
    // (in the render's group: the grass stands still, and a still material's refresh sends nothing of the object's)
    const clock = tsl.uniform(0).setGroup(tsl.renderGroup);
    updaters.push((_dt, t) => { clock.value = t; });
    m.positionNode = grassWindNode(clock, { rate: SWAY_RATE, reach: SWAY });
    stillNodes.add(m);
    return m;
  }
  const time = { value: 0 };
  updaters.push((_dt, t) => { time.value = t; });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 tuftAt = instanceMatrix[3].xz;
        #else
          vec2 tuftAt = vec2(0.0);
        #endif
        float bend = transformed.y * transformed.y * 4.0;
        float gust = sin(uWind * ${SWAY_RATE.toFixed(2)} + tuftAt.x * 0.35 + tuftAt.y * 0.22) * 0.75
          + sin(uWind * ${(SWAY_RATE * 2.3).toFixed(2)} + tuftAt.x * 0.9 - tuftAt.y * 0.6) * 0.25;
        transformed.xz += vec2(0.8, 0.6) * gust * ${SWAY.toFixed(3)} * bend;`);
  };
  m.customProgramCacheKey = () => 'windgrass';
  return m;
}

/** Large moss patches tinted over the floor in world space (a texture this big would tile visibly). The pebbles and
 *  leaves stand up out of the soil (core/parallax.ts). */
function mossyGround<M extends THREE.Material>(m: M): M {
  if (WEBGPU) {
    (m as M & { colorNode: unknown }).colorNode = mossColorNode();
    reliefContext(m as unknown as THREE.MeshStandardMaterial, FLOOR_RELIEF);
    return m;
  }
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMossXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMossXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMossXZ;
        float mossH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mossN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mossH(i), mossH(i+vec2(1,0)), f.x), mix(mossH(i+vec2(0,1)), mossH(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mossV = mossN(vMossXZ * 0.11) * 0.6 + mossN(vMossXZ * 0.37 + 7.0) * 0.3 + mossN(vMossXZ * 1.3) * 0.1;
        float moss = smoothstep(0.4, 0.7, mossV);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.09, 0.025) * (0.7 + mossN(vMossXZ * 3.1) * 0.6), moss * 0.75);`);
    floorRelief(shader, FLOOR_RELIEF);
  };
  m.customProgramCacheKey = () => 'mossyground';
  return m;
}

export const buildForest: BiomeBuilder = (scene) => {
  const rng = mulberry(4242);
  const r = (a: number, b: number) => a + rng() * (b - a);
  const obstacles: Obstacle[] = [];
  const breakable = new PropSet(obstacles);
  const updaters: Updater[] = [];
  const wall = new Wall('forest');
  const h = ARENA.daisHalf;

  // --- Materials ------------------------------------------------------------
  const groundMat = mossyGround(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(forestFloor(), FLOOR_REPEAT, 1.2), color: 0xffffff }));
  const daisMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(flagstone(47, 5), 1, 1.2), color: 0x94a488 });
  // weathered rock, a tile a metre on the rocks' box-mapped faces; its own moss and lichen, so the mossy stone is only
  // greener than the bare (its colours brighter than they were on grunge, whose mean was 0.78 to the rock's 0.58)
  const stoneMaps = pbrMaterialMaps(rock(17), 1, 1.6);
  const stone = new THREE.MeshStandardMaterial({ ...stoneMaps, color: 0x989e90, roughness: 0.9 });
  const mossStone = new THREE.MeshStandardMaterial({ ...stoneMaps, color: 0x8a967a, roughness: 0.95 });
  /** bark repeated as a surface needs it (`BARK_REPEATS`, a tree kind's `bark`): copies of the one map */
  const barkAt = (repeat: Repeat): THREE.MeshStandardMaterial =>
    seeThrough(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(bark(), repeat, 1.6), color: 0xd8c8b0 }), 'prop');
  // foliage: leaf cards cut out of painted textures round darker cores; instance colours set each plant's hue
  const clusterTex = leafClusterTexture();
  const canopyMat = seeThrough(new THREE.MeshStandardMaterial({ map: clusterTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 'foliage');
  // (a plain colour read as a bare green ball under the cards: the moss's relief alone, its colour the instance's)
  const { map: _mossColour, ...mossRelief } = pbrMaterialMaps(moss(5), [8, 4], 1.5);
  const coreMat = seeThrough(new THREE.MeshStandardMaterial({ ...mossRelief, color: 0x8a9a80, roughness: 0.95 }), 'foliage');
  // the same for single meshes, which have no instance colour: the tint is in the material
  const archCanopy = seeThrough(new THREE.MeshStandardMaterial({ map: clusterTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: 0x5e8048 }), 'foliage');
  const archCore = seeThrough(new THREE.MeshStandardMaterial({ color: 0x2c3c22, roughness: 0.95 }), 'foliage');
  // (low, beside the hero: a hole as narrow as a prop's, or the ferns round him went wherever he stood)
  const fernMat = seeThrough(new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 'prop');
  const oneLeaf = leafTexture();
  const litterMat = new THREE.MeshStandardMaterial({ map: oneLeaf, alphaTest: 0.5, roughness: 0.9 });
  const ivyMat = new THREE.MeshStandardMaterial({ map: oneLeaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: 0x3e6a2a });
  // moss: cushions and tufts, a tile half a metre (a grunge tinted green read as a flat painted top), and a sheen,
  // sdf-harness's substrate layer for fuzz, pale at grazing angles as moss's fronds catch the light
  const mossLayer = { sheen: 1, sheenColor: new THREE.Color(0x5a7040), sheenRoughness: 0.6, roughness: 1 };
  const mossMat = new THREE.MeshPhysicalMaterial({ ...pbrMaterialMaps(moss(5), [7, 1.5], 1.5), ...mossLayer });
  const logMoss = new THREE.MeshPhysicalMaterial({ ...pbrMaterialMaps(moss(5), [4, 6], 1.5), ...mossLayer });
  const hangMat = new THREE.MeshStandardMaterial({ color: 0x2c4424, roughness: 1, side: THREE.DoubleSide });
  // (a hollow log's inside and its ends: bare wood gone grey and dark, its grain along the log, both sides drawn as
  // an end's wood is wound either way; in the bark's maps the hollow read as bark inside out)
  const heartwood = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), [4, 9], 1.4), color: 0x8a7a68, roughness: 0.95, side: THREE.DoubleSide });
  const grassMat = windInGrass(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), updaters);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0c2a24, emissive: 0x2affc8, emissiveIntensity: 0.75, roughness: 0.5 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.8 });
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6aff7a, emissiveIntensity: 2.0 });
  // the props dissolve between the camera and the player in the close views (the camera never pulls in)
  for (const m of [stone, mossStone, ivyMat, mossMat, logMoss, hangMat, heartwood, capMat, stemMat, glyphMat]) seeThrough(m, 'prop');

  // --- Sky: a summer sky with slow clouds above the canopy -----------------------------
  const sky = buildDaySky(FOG, [0.2, 0.4, 0.75], SUN);
  scene.add(sky.mesh);

  // --- Ground ---------------------------------------------------------------
  // it reaches past the fog's far end, so its edge melts into the sky's horizon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 128).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Central dais: old mossy flagstones with a green rune circle ------------
  const lowerM = new THREE.Mesh(boxWithUV(2 * (h + 0.7), 0.18, 2 * (h + 0.7), 2.4), daisMat); lowerM.position.y = 0.09;
  const upperM = new THREE.Mesh(boxWithUV(2 * h, 0.35, 2 * h, 2), daisMat); upperM.position.y = 0.175;
  for (const m of [lowerM, upperM]) { m.receiveShadow = m.castShadow = true; scene.add(m); }
  const runeMat = new THREE.MeshBasicMaterial({ map: runeCircle(11), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), runeMat);
  rune.position.y = ARENA.daisHeight + 0.02;
  scene.add(rune);
  const eased = runPhase({ calm: 0 });
  let calmTarget = 0;
  updaters.push((dt, t) => {
    eased.calm += (calmTarget - eased.calm) * Math.min(1, dt * 2);
    const calm = eased.calm;
    const pulse = 0.55 + Math.sin(t * 1.3) * 0.15;
    runeMat.color.setRGB(0.35, 1.0, 0.45).multiplyScalar(pulse * (0.5 + calm * 0.8));
    rune.rotation.y = -t * 0.025;
  });

  // standing stones at the dais corners, each with a glowing rune strip facing out
  const menhirGeo = buildMenhirGeo(rng);
  // (box-mapped in metres, as the boulders are: a tile a metre. A cylinder's own UVs ran a tile round each part and
  // up its whole height, the 0.35 m plinth's 18 times as long round as up: `lab tiles`)
  const standing = seeThrough(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(rock(17), 1, 1.6), color: 0x989e90, roughness: 0.9 }), 'prop');
  const menhirProbe = new THREE.Mesh(menhirGeo);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // (its plinth reaches 1.16 m from its middle: 0.5 m in, it hung 0.66 m over the dais's edge, standing on air)
    const x = sx * (h - 1.3), z = sz * (h - 1.3), g = new THREE.Group();
    scene.add(g);
    const mh = new THREE.Mesh(menhirGeo, standing);
    mh.name = 'standing stone';
    mh.position.set(x, ARENA.daisHeight, z);
    mh.rotation.y = Math.atan2(sx, sz);
    mh.updateMatrix();
    mh.castShadow = mh.receiveShadow = true;
    g.add(mh);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.02), glyphMat);
    strip.position.set(x + sx * 0.4, ARENA.daisHeight + 1.9, z + sz * 0.4);
    strip.rotation.set(0, Math.atan2(sx, sz), 0);
    strip.rotateX(-0.08);
    g.add(strip);
    // moss on its shoulders and ivy climbing the side away from the glyphs
    // (a coat on its faces round its shoulders: a dome round where its middle would be unleaned, wider than its faces,
    // stood off them in a ring under the pyramidion, #287)
    const moss = new THREE.Mesh(mossCoat(menhirProbe, sx + sz * 3).applyMatrix4(mh.matrix), mossMat);
    moss.receiveShadow = true;
    g.add(moss);
    // (each point of it on the stone's face where it climbs: wound round at 0.62 m, near the top it stood off the
    // tapering faces in a band, #287)
    const ivy: THREE.BufferGeometry[] = [], onStone = mh.matrix.clone();
    for (let k = 0; k < 3; k++) {
      // (drawn as they were, wound the other way round the stone from its glyphs: a half turn on)
      const len = r(2.2, 3.6), ph = r(0, TAU) + Math.PI, climb = (t: number) => ph + t * 0.35 * TAU;
      const stem = Array.from({ length: IVY_POINTS + 1 }, (_, i) => {
        const t = i / IVY_POINTS;
        return onFace(menhirProbe, IVY_FOOT + len * (1 - t), climb(t), IVY_STEM);
      });
      ivy.push(taperTube(stem, (t) => 0.035 * (1 - t * 0.5), 12, 4).applyMatrix4(onStone));
      for (let i = 0; i < 14; i++) {
        const t = i / 14, a = climb(t), at = onFace(menhirProbe, IVY_FOOT + len * (1 - t), a, IVY_LEAF);
        ivy.push(new THREE.PlaneGeometry(0.2, 0.26).rotateY(Math.atan2(at.x, at.z)).rotateZ(r(-0.6, 0.6)).translate(at.x, at.y, at.z).applyMatrix4(onStone));
      }
    }
    const ivyM = new THREE.Mesh(mergeAll(ivy), ivyMat);
    ivyM.receiveShadow = true;
    g.add(ivyM);
    obstacles.push({ x, z, r: 0.95, h: 4 });
    breakable.add(obstacles.length - 1, 60, 0x7a8070, groupLook(g, updaters, updaters.length));
  }

  // --- Boundary: a wall of thicket and boulders, trees beyond --------------------
  const edgeN = 150;
  const bush = canopyGeo(rng, [[0, 0, 0, 1], [0.55, -0.2, 0.25, 0.72], [-0.5, -0.15, -0.3, 0.75]], 14, 1.0);
  const bushes = new THREE.InstancedMesh(bush.core, coreMat, edgeN * 2);
  const bushCards = new THREE.InstancedMesh(bush.cards, canopyMat, edgeN * 2);
  const rocks = new THREE.InstancedMesh(boulderGeo(31), mossStone, edgeN);
  const plantCol = new THREE.Color(), _mx = new THREE.Matrix4();
  let bi = 0, ri = 0;
  for (let i = 0; i < edgeN; i++) {
    const a = (i / edgeN) * TAU + r(-0.01, 0.01);
    if (gateGap(a) < 0.12) continue;
    const rr = WALL_R + r(0.6, 2.2);
    if (i % 3 === 0) setInstance(rocks, ri++, Math.cos(a) * rr, r(0, 0.4), Math.sin(a) * rr, r(-0.3, 0.3), r(0, TAU), r(-0.3, 0.3), r(1.1, 2.1), r(0.9, 1.9), r(1.1, 2.1));
    for (let k = 0; k < 2; k++) {
      const br = rr + r(-0.3, 2.5), ba = a + r(-0.02, 0.02), s = r(1.2, 2.2);
      setInstance(bushes, bi, Math.cos(ba) * br, s * r(0.3, 0.8), Math.sin(ba) * br, 0, r(0, TAU), 0, s, s * r(0.7, 1.1), s);
      bushes.getMatrixAt(bi, _mx); bushCards.setMatrixAt(bi, _mx);
      plantCol.setRGB(r(0.09, 0.14), r(0.17, 0.26), r(0.07, 0.11));
      bushes.setColorAt(bi, plantCol); bushCards.setColorAt(bi++, plantCol);
    }
  }
  bushes.count = bushCards.count = bi; rocks.count = ri;
  bushes.receiveShadow = bushCards.castShadow = bushCards.receiveShadow = rocks.castShadow = rocks.receiveShadow = true;
  bushes.name = 'thicket'; bushCards.name = 'thicket leaves'; rocks.name = 'thicket rocks';
  // (the thicket's leaves walked up to, its bushes' cores and rocks flown into: an arrow goes through the leaves)
  wall.add(bushes, false, 'wall', bush.lumps);
  // (walked up to, its lumps swollen partway into their leaves: they give, brushed through. A hull round a lump's cards
  // spanned the air between them, and he stopped a third of a metre short of them; the cards as drawn let him in
  // through their gaps, the line he's kept behind as ragged as they are, his legs past their ranges stood against it)
  wall.add(bushes, false, 'foliage', bush.leafLumps);
  wall.add(rocks, true, 'wall', true);
  for (const mesh of [bushes, bushCards, rocks]) scene.add(...cullInCells(mesh, THICKET_CELLS));

  // trees: short near the clearing (they'd hide the player at the edge), taller further out; a few kinds grown by
  // ez-tree, each instanced, and the ancient giants among them
  const treeN = 120, kinds = TREE_KINDS.map(growTree);
  const barks = kinds.map((k, i) => new THREE.InstancedMesh(k.bark, barkAt(TREE_KINDS[i].bark), treeN));
  const leaves = kinds.map((k) => new THREE.InstancedMesh(k.leaves, canopyMat, treeN));
  const used = kinds.map(() => 0);
  const place = (kind: number, x: number, z: number, h: number, colour: THREE.Color) => {
    const i = used[kind]++;
    // narrowed so nothing under CANOPY_Y comes within 2 m of the wall, and nothing over it more than 2 m past it, as
    // the old giants' crowns did: grown as ez-tree grows them, a giant's low limbs reached 17 m out over the clearing
    // and hid the hero from above, and kept outside the wall at every height the forest had no roof for the sunrays
    const rr = Math.hypot(x, z);
    let w = h;
    kinds[kind].reach.forEach((k, b) => {
      const room = rr - WALL_R + ((b + 1) / REACH_BANDS * h > CANOPY_Y ? 2 : -2);
      if (k > 0) w = Math.min(w, room / k);
    });
    // (sunk a little: a trunk is an open tube at its foot)
    setInstance(barks[kind], i, x, -0.25, z, r(-0.04, 0.04), r(0, TAU), r(-0.04, 0.04), w, h, w);
    barks[kind].getMatrixAt(i, _mx); leaves[kind].setMatrixAt(i, _mx);
    leaves[kind].setColorAt(i, colour);
  };
  for (let ti = 0, tries = 0; ti < treeN && tries < treeN * 20; tries++) {
    const a = r(0, TAU), rr = 34 + Math.pow(r(0, 1), 1.4) * 26;
    if (rr < 42 && gateGap(a) < 0.1) continue;   // keep a path open behind each gate
    // (to the top of the crown: the old trunks' heights and their crowns on top)
    const th = Math.min(22, 9 + (rr - 34) * 0.6) * r(0.85, 1.15);
    plantCol.setRGB(r(0.08, 0.15), r(0.16, 0.26), r(0.06, 0.1)).multiplyScalar(2.2);
    place(Math.floor(r(0, TREE_KINDS.length - 1)), Math.cos(a) * rr, Math.sin(a) * rr, th, plantCol);
    ti++;
  }
  // a ring of ancient giants beyond the thicket, standing over the forest the way the crypt's towers do, clear of the
  // gates: their crowns a roof 35 to 50 m up over the ring, which the sunrays come down through
  for (let i = 0; i < GIANTS; i++) {
    const a = ((i + 0.5) / GIANTS) * TAU + r(-0.05, 0.05), rr = 39 + r(0, 7);
    if (gateGap(a) <= 0.25) continue;
    plantCol.setRGB(r(0.08, 0.14), r(0.16, 0.25), r(0.05, 0.09)).multiplyScalar(2.2);
    place(TREE_KINDS.length - 1, Math.cos(a) * rr, Math.sin(a) * rr, r(44, 52), plantCol);
  }
  kinds.forEach((_, k) => {
    barks[k].count = leaves[k].count = used[k];
    barks[k].castShadow = barks[k].receiveShadow = leaves[k].castShadow = leaves[k].receiveShadow = true;
    barks[k].name = `trees' bark: ${TREE_KINDS[k].preset}`;
    leaves[k].name = `trees' leaves: ${TREE_KINDS[k].preset}`;
    // (what an arrow over the thicket meets: each tree's trunk, its limbs let go)
    for (let i = 0; i < used[k]; i++) wall.addGeometry(kinds[k].trunk, barks[k].getMatrixAt(i, _mx), false, 'beyond');
    for (const mesh of [barks[k], leaves[k]]) scene.add(...cullInCells(mesh, eachInstance));
  });

  // --- Gates: arches of twisted roots around a green portal -----------------------
  const gateMats: GateMats = {
    canopyMat: archCanopy, coreMat: archCore, hangMat, ivyMat,
    archMat: barkAt(BARK_REPEATS.gateArch), vineMat: barkAt(BARK_REPEATS.gateVine), rootMat: barkAt(BARK_REPEATS.gateRoots),
  };
  const portals: Portal[] = GATES.map((a) => buildRootGate(scene, wall, a, mossStone, gateMats, rng, updaters));

  // --- Glowcap clusters (teal) and bonfires (orange): 6 of the biome's 10 point lights (and a portal's each) --
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
    const g = new THREE.Group(), u0 = updaters.length;
    scene.add(g);
    buildGlowcaps(g, x, z, rng, capMat, stemMat, updaters);
    obstacles.push({ x, z, r: 0.75, h: 1.7 });
    breakable.add(obstacles.length - 1, 9, 0x40b090, groupLook(g, updaters, u0), 'shroom');
  }
  const bonfireBark = barkAt(BARK_REPEATS.bonfire);
  for (const [x, z] of BONFIRES) {
    const g = new THREE.Group(), u0 = updaters.length;
    scene.add(g);
    buildBonfire(g, x, z, stone, bonfireBark, updaters);
    obstacles.push({ x, z, r: 0.9, h: 1 });
    breakable.add(obstacles.length - 1, 12, 0x5a4a38, groupLook(g, updaters, u0), 'ember');
  }

  // --- Floor obstacles: stumps, fallen logs, boulders -------------------------------
  // (r, angle) spots clear of the gates' spawn areas, the lights and the lobby dummies
  const stumpSpots = [[15, 0.4], [19, 2.0], [14, 3.45], [20, 4.35], [18, 5.85], [9, 1.2]];
  // (the broken top's oak weathered grey, its rings round its middle: `world/stump.ts`)
  const stumpWood = seeThrough(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1.4), color: 0xb4a898 }), 'prop');
  // (sculpted from a stream of its own; the old stump's draws from the biome's are still drawn: drawn from it, every
  // prop placed after the stumps moved)
  for (let i = 0; i < OLD_STUMP_DRAWS; i++) rng();
  // (a mesh each, dealt one of the pool's sculpts, its size and its turn anew for every run: `rollStumps`)
  const pool = stumpPool(buildStumpGeos());
  const stumpMats = [stumpWood, barkAt(BARK_REPEATS.stumps)];
  const stumps: Stump[] = stumpSpots.map(([rr, a]) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // (the old instances' size and turn still drawn from the stream: every prop placed after them would move)
    r(0.8, 1.15); r(0, TAU); r(0.8, 1.4);
    const mesh = new THREE.Mesh(pool[0].geometry, stumpMats);
    mesh.position.set(x, 0, z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'stump';
    scene.add(mesh);
    const circle: Obstacle = { x, z, r: 0, h: 0 };
    obstacles.push(circle);
    breakable.add(obstacles.length - 1, 6, 0x4a3520, meshLook(mesh), 'wood');
    return { mesh, circle };
  });
  rollStumps(stumps, pool, BOOT_ROLL);

  const logSpots = [[21, 1.15, 0.9], [11, 4.75, -0.4], [22, 3.0, 0.3]];
  // (the bark alone casts: the heartwood's ends and the moss lie within its shadow, and each cast a draw a log)
  // (both sides: past the heartwood's rim, 0.2 m in, an end is the bark's shell alone, and from outside only it
  // showed the floor through the log's wall)
  const log = buildLogGeo(rng), logBark = barkAt(BARK_REPEATS.log);
  logBark.side = THREE.DoubleSide;
  for (const [rr, a, rot] of logSpots) {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, yaw = a + rot, parts: THREE.Mesh[] = [], n0 = obstacles.length;
    for (const [geo, mat] of [[log.bark, logBark], [log.inner, heartwood], [log.moss, logMoss], [log.fungus, capMat]] as const) {
      const m = new THREE.Mesh(geo, mat);
      m.name = 'fallen log';
      m.position.set(x, 0.38, z);
      m.rotation.y = yaw;
      m.castShadow = mat === logBark; m.receiveShadow = true;
      scene.add(m);
      parts.push(m);
    }
    // collision: circles along the log
    for (const u of [-1.6, 0, 1.6]) obstacles.push({ x: x + Math.cos(yaw) * u, z: z - Math.sin(yaw) * u, r: 0.55, h: 0.9 });
    breakable.add(n0, 10, 0x4a3520, meshLook(...parts), 'wood');
  }

  const boulderSpots = [[24, 0.75, 1.1], [16, 2.75, 0.8], [23, 3.6, 1.2], [13, 5.2, 0.7], [24, 5.2, 1.0], [8, 3.9, 0.6], [17, 1.55, 0.7]];
  const boulders = new THREE.InstancedMesh(boulderGeo(37), mossStone, boulderSpots.length);
  boulderSpots.forEach(([rr, a, s], i) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // (turned about the vertical and tilted a little: a rock's foot is flattened to sit on the ground)
    setInstance(boulders, i, x, s * 0.25, z, r(-0.3, 0.3), r(0, TAU), r(-0.3, 0.3), s, s * 0.8, s);
    obstacles.push({ x, z, r: s * 0.95, h: s * 1.05 });
    breakable.add(obstacles.length - 1, 6 + s * 4, 0x6a7060, instanceLook(boulders, i));
  });
  boulders.castShadow = boulders.receiveShadow = true;
  boulders.name = 'boulders';
  scene.add(boulders);

  // --- Undergrowth: grass tufts, small glowing mushrooms, pebbles ---------------------
  const clump = makeFbm(5, 6, 3);
  const free = (x: number, z: number, pad: number) => Math.max(Math.abs(x), Math.abs(z)) > h + 0.9 && obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + pad);
  // tufts of three shapes, so no two neighbours are one tuft turned
  // (each shape from a stream of its own: drawn from the biome's, every prop placed after them moved)
  const tuftColours: TuftColours = { root: [0.015, 0.035, 0.01], mid: [0.07, 0.15, 0.03], tip: [0.2, 0.32, 0.07], dry: [0.32, 0.3, 0.1], dryShare: 0.18 };
  const tufts = [0, 1, 2].map((kind) => new THREE.InstancedMesh(buildGrassTuft(mulberry(71 + kind), 16, tuftColours), grassMat, 534));
  // (the one tuft there was drew 35 numbers from the biome's stream here: drawn still, so every prop placed after the
  // grass stands where it stood)
  for (let i = 0; i < 35; i++) rng();
  const placed = tufts.map(() => 0);
  for (let tries = 0, gi = 0; gi < 1600 && tries < 20000; tries++) {
    const a = r(0, TAU), rr = Math.sqrt(r(0.02, 1)) * (WALL_R + 1.5);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (clump(x / 130 + 0.5, z / 130 + 0.5) < 0.44 || !free(x, z, 0.1)) continue;
    const s = r(0.7, 1.4), kind = gi++ % tufts.length;
    setInstance(tufts[kind], placed[kind]++, x, 0, z, 0, r(0, TAU), 0, s, s * r(0.8, 1.3), s);
  }
  tufts.forEach((tuft, kind) => {
    tuft.count = placed[kind];
    tuft.receiveShadow = true;
    tuft.name = `grass ${kind + 1}`;
    scene.add(...cullInCells(tuft, FLOOR_CELLS));
  });

  const shroomN = 70;
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1), capMat, shroomN);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 6).translate(0, 0.5, 0), stemMat, shroomN);
  let si = 0;
  for (let tries = 0; si < shroomN && tries < 4000; tries++) {
    // cluster around stumps, logs and the edge
    const o = obstacles[Math.floor(rng() * obstacles.length)];
    const edge = rng() < 0.35;
    const a = r(0, TAU), rr = edge ? WALL_R - r(0, 1.5) : 0;
    const x = edge ? Math.cos(a) * rr : o.x + Math.cos(a) * (o.r + r(0.1, 0.6));
    const z = edge ? Math.sin(a) * rr : o.z + Math.sin(a) * (o.r + r(0.1, 0.6));
    if (!edge && !free(x, z, 0.05)) continue;
    const s = r(0.06, 0.16), sh = s * r(1.5, 2.6);
    setInstance(stems, si, x, 0, z, r(-0.2, 0.2), 0, r(-0.2, 0.2), s * 0.5, sh, s * 0.5);
    setInstance(caps, si, x, sh, z, r(-0.2, 0.2), 0, r(-0.2, 0.2), s * 1.1);
    si++;
  }
  caps.count = stems.count = si;
  scene.add(caps, stems);

  // ferns: banks of them along the thicket, clumps round the stumps, logs and boulders
  const fernN = 300;
  const ferns = new THREE.InstancedMesh(fernClumpGeo(rng), fernMat, fernN);
  let fi = 0;
  for (let tries = 0; fi < fernN && tries < 8000; tries++) {
    let x: number, z: number;
    if (rng() < 0.6) {
      const a = r(0, TAU), rr = WALL_R - r(-0.5, 3.5);
      if (gateGap(a) < 0.16) continue;
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
    } else {
      const o = obstacles[Math.floor(rng() * obstacles.length)], a = r(0, TAU);
      x = o.x + Math.cos(a) * (o.r + r(0.1, 0.9)); z = o.z + Math.sin(a) * (o.r + r(0.1, 0.9));
      if (!free(x, z, 0.05)) continue;
    }
    const s = r(0.9, 1.7);
    [x, z] = clearOfFires(x, z, FIRE_FERN_CLEAR + FROND_REACH * s);
    setInstance(ferns, fi, x, 0, z, 0, r(0, TAU), 0, s, s * r(0.8, 1.2), s);
    ferns.setColorAt(fi++, plantCol.setRGB(r(0.16, 0.26), r(0.26, 0.38), r(0.1, 0.16)));
  }
  ferns.count = fi;
  ferns.receiveShadow = true;
  ferns.name = 'ferns';
  scene.add(...cullInCells(ferns, FLOOR_CELLS));

  // roots snaking out of the thicket across the floor, half sunk in it
  // (each a tube's samples as well, the floor's relief: feet step onto them, `world/ground.ts`)
  const roots: THREE.BufferGeometry[] = [], rootTops: [number, number, number, number][][] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + r(-0.1, 0.1);
    if (gateGap(a) < 0.25) continue;
    const pts: THREE.Vector3[] = [], len = r(3.5, 7), bendA = r(-0.4, 0.4);
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, rr = WALL_R + 1.5 - t * len, aa = a + bendA * t * t + Math.sin(t * 7 + i) * 0.03;
      pts.push(V(Math.cos(aa) * rr, 0.06 - t * 0.1 + Math.sin(t * 9 + i) * 0.05, Math.sin(aa) * rr));
    }
    const radius = (t: number) => 0.28 * (1 - t * 0.85);
    roots.push(taperTube(pts, radius, 24, 7));
    rootTops.push(tubeSamples(pts, radius, 48));
  }
  const rootMesh = new THREE.Mesh(mergeAll(roots), barkAt(BARK_REPEATS.roots));
  rootMesh.name = 'roots';
  rootMesh.castShadow = rootMesh.receiveShadow = true;
  scene.add(rootMesh);

  // leaf litter: fallen leaves in drifts, thickest under the trees and against the thicket
  const litterN = 3000;
  const litter = new THREE.InstancedMesh(litterGeo(), litterMat, litterN);
  const litterCols: [number, number, number][] = [[0.62, 0.28, 0.08], [0.45, 0.32, 0.1], [0.7, 0.48, 0.12], [0.28, 0.36, 0.1], [0.4, 0.18, 0.07]];
  let li = 0;
  for (let tries = 0; li < litterN && tries < 20000; tries++) {
    const a = r(0, TAU), rr = Math.pow(r(0, 1), 0.45) * (WALL_R + 1);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.max(Math.abs(x), Math.abs(z)) < h + 0.8) continue;
    if (clump(x / 90 + 0.3, z / 90 + 0.7) < 0.38 + (rr < 16 ? 0.12 : 0)) continue;
    const s = r(0.7, 1.4);
    const [lx, lz] = clearOfFires(x, z, FIRE_RING);
    setInstance(litter, li, lx, 0.002 * (li % 7), lz, r(-0.1, 0.1), r(0, TAU), r(-0.1, 0.1), s);
    const c = litterCols[Math.floor(rng() * litterCols.length)], v = r(0.7, 1.2);
    litter.setColorAt(li++, plantCol.setRGB(c[0] * v, c[1] * v, c[2] * v));
  }
  litter.count = li;
  litter.receiveShadow = true;
  scene.add(litter);

  // sunbeams slanting down through gaps in the canopy onto the edges of the clearing
  const beams = lightShafts([[16, 1.0, 1.8], [21, 2.3, 2.2], [14, 4.0, 1.6], [20, 5.1, 2.0], [23, 3.3, 1.5]].map(([rr, a, rad]) => [Math.cos(a) * rr, Math.sin(a) * rr, rad]), SUN, new THREE.Color(0.075, 0.065, 0.035));
  scene.add(beams.group);

  const pebbles = new THREE.InstancedMesh(boulderGeo(43, 0.2, 1), stone, 160);
  for (let i = 0; i < pebbles.count; i++) {
    const a = r(0, TAU), rr = r(6, WALL_R);
    const s = r(0.3, 1.2);
    // (kept out of the fires as the litter is: wherever the stream put one, it lay in a bonfire)
    const [px, pz] = clearOfFires(Math.cos(a) * rr, Math.sin(a) * rr, FIRE_RING + s * 0.2);
    setInstance(pebbles, i, px, 0.03, pz, r(-0.3, 0.3), r(0, TAU), r(-0.3, 0.3), s, s * r(0.4, 0.8), s);
  }
  pebbles.receiveShadow = true;
  pebbles.name = 'pebbles';
  scene.add(pebbles);

  // --- Young trees in the clearing: wood an arrow goes into ----------------------------
  // (last, from streams of their own: placed before, they'd move what's placed round the obstacles; their bark and
  // leaves the trees' programs)
  const young = growTree(SAPLING);
  const sapSpots = treeSpots(mulberry(2718), SAPLINGS, gateGap, obstacles,
    (x, z) => Math.max(Math.abs(x), Math.abs(z)) < h + 2 || BONFIRES.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 4));
  const sapBark = new THREE.InstancedMesh(young.bark, barkAt(SAPLING.bark), sapSpots.length);
  const sapLeaves = new THREE.InstancedMesh(young.leaves, canopyMat, sapSpots.length);
  const sapRng = mulberry(1618);
  sapSpots.forEach(([x, z], i) => {
    const ht = 4.5 + sapRng() * 1.5;
    setInstance(sapBark, i, x, -0.1, z, 0, sapRng() * TAU, 0, ht);
    sapBark.getMatrixAt(i, _mx); sapLeaves.setMatrixAt(i, _mx);
    sapLeaves.setColorAt(i, plantCol.setRGB(0.1 + sapRng() * 0.06, 0.2 + sapRng() * 0.1, 0.07 + sapRng() * 0.03).multiplyScalar(2.2));
    // (round its trunk's foot, measured on the grown bark: `trunkFoot`)
    obstacles.push({ x, z, r: young.trunkFoot * ht + 0.1, h: ht });
    // (an arrow goes into the bark; the leaves let it through)
    const bark = instanceLook(sapBark, i), leaves = instanceLook(sapLeaves, i);
    const look = { hide() { bark.hide(); leaves.hide(); }, show() { bark.show(); leaves.show(); }, raycast: bark.raycast, surfaces: bark.surfaces };
    breakable.add(obstacles.length - 1, 10, 0x4a3520, look, 'wood');
  });
  for (const m of [sapBark, sapLeaves]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  sapBark.name = 'young trees\' bark';
  sapLeaves.name = 'young trees\' leaves';
  updaters.push(contactShadows(scene, obstacles));

  // --- Ambient: drifting pollen and a light haze ---------------------------------------
  const due = runPhase({ motes: 0 });
  updaters.push((dt, t) => {
    beams.update(t); sky.update(t);
    due.motes += dt;
    while (due.motes > 0.06) {
      due.motes -= 0.06;
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 29;
      particles.glow.spawn({
        x: Math.cos(a) * rr, y: rand(0.3, 3), z: Math.sin(a) * rr,
        vx: rand(-0.25, 0.25), vy: rand(-0.08, 0.12), vz: rand(-0.25, 0.25),
        life: rand(3, 5), size: rand(0.035, 0.06), color: col(0xfff2c0, 0.45), colorEnd: col(0xd8c890, 0.1), alpha: 0.7,
      });
      if (Math.random() < 0.25) {
        const b = Math.random() * TAU, br = rand(10, 28);
        particles.smoke.spawn({
          x: Math.cos(b) * br, y: 0.3, z: Math.sin(b) * br, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), vy: 0.02,
          life: rand(6, 10), size: rand(5, 8), sizeEnd: 10, color: col(0xb8ccc0), alpha: 0.05,
        });
      }
    }
  });

  return {
    relief: tubesRelief(rootTops, WALL_R + 3),
    look: {
      // daylight: its ordinary scenes are about 2.3 times as bright as the night crypt's
      adapt: 2.3,
      background: FOG,
      fog: { color: FOG, near: 42, far: 95 },
      hemi: { sky: 0xcfe4ff, ground: 0x4a5a2c, intensity: 1.4 },
      // the sun: the shared key light
      moon: { color: 0xfff0d6, intensity: 4.0, pos: [SUN.x, SUN.y, SUN.z] },
      env: FOREST_ENV,
      envIntensity: 0.6,
    },
    obstacles,
    wall,
    props: breakable.list,
    portals,
    setCalm(v: number) { calmTarget = v; },
    update(dt: number, t: number) { for (const u of updaters) u(dt, t); },
    roll(seed: number) { rollStumps(stumps, pool, seed); },
  };
};

// ---------------------------------------------------------------------------
// helpers

/** the points along an ivy's stem, how high its foot is up the stone, and how far its stem and leaves stand off the
 *  stone's face (m) */
const IVY_POINTS = 16;
const IVY_FOOT = 0.2;
const IVY_STEM = 0.03;
const IVY_LEAF = 0.07;
const _ray = new THREE.Raycaster();

/** The point `off` out from `stone`'s face (in its frame) at height `y`, out from its axis toward angle `a`: a ray in
 *  from outside it. */
function onFace(stone: THREE.Mesh, y: number, a: number, off: number): THREE.Vector3 {
  const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  _ray.set(out.clone().multiplyScalar(3).setY(y), out.clone().negate());
  const [hit] = _ray.intersectObject(stone, false);
  const at = hit ? 3 - hit.distance : 0.62;
  return out.multiplyScalar(at + off).setY(y);
}

/** the moss round a standing stone's shoulders: from how high up it, to how high (m: the shaft meets its pyramidion at
 *  4.3), its rings and its sides round, how thick it is in its middle, and how ragged its edges are (m) */
const MOSS_FROM = 3.95;
const MOSS_TO = 4.6;
const MOSS_RINGS = 6;
const MOSS_SIDES = 36;
const MOSS_THICK = 0.025;
const MOSS_RAGGED = 0.18;

/** Moss on `stone`'s shoulders (in its frame): a coat cast onto its faces, thickest in its middle and coming down to
 *  them at its ragged edges, `salt` its own. */
function mossCoat(stone: THREE.Mesh, salt: number): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let j = 0; j <= MOSS_SIDES; j++) {
    const a = (j / MOSS_SIDES) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const lower = MOSS_FROM + MOSS_RAGGED * valueNoise3(ca * 2, sa * 2, 0, salt);
    const upper = MOSS_TO - MOSS_RAGGED * valueNoise3(ca * 2, sa * 2, 5, salt);
    for (let i = 0; i <= MOSS_RINGS; i++) {
      const s = i / MOSS_RINGS, y = lower + (upper - lower) * s;
      const thick = MOSS_THICK * Math.sin(s * Math.PI) * (0.6 + 0.8 * valueNoise3(ca * 3, y * 6, sa * 3, salt));
      positions.push(...onFace(stone, y, a, 0.008 + thick).toArray());
      uvs.push(j / MOSS_SIDES, y - MOSS_FROM);
    }
  }
  const row = MOSS_RINGS + 1;
  for (let j = 0; j < MOSS_SIDES; j++) for (let i = 0; i < MOSS_RINGS; i++) {
    const a = j * row + i, b = a + row;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function buildMenhirGeo(rng: () => number): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.95, 1.05, 0.35, 7).translate(0, 0.17, 0);
  const shaft = new THREE.CylinderGeometry(0.42, 0.7, 4.0, 6, 3).translate(0, 2.3, 0);
  const tip = new THREE.ConeGeometry(0.42, 0.7, 6).translate(0, 4.65, 0);
  const g = mergeGeometries([base, shaft, tip].map((x) => x.toNonIndexed()));
  // weathered: squash the cross-section a little and lean the top
  const pos = g.attributes.position;
  const lean = (rng() - 0.5) * 0.15;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * 1.1 + y * lean);
    pos.setZ(i, pos.getZ(i) * 0.85);
  }
  boxUVs(g);
  return lumpy(g, 0.04, 3);
}

/** Merge geometries that may differ in indexing and attributes: keeps position, normal and uv. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => {
    const n = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    return n;
  }))!;
}

/** A log's sweep of moss (a part of a cylinder up y) sunk into the bark towards its sides and ends, by a wandering
 *  amount: it ends raggedly where it meets the bark (laid over it whole, it ended in a straight step, a carpet). */
function raggedMoss(g: THREE.BufferGeometry, rng: () => number): THREE.BufferGeometry {
  const p = g.attributes.position, box = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
  const half = (box.max.y - box.min.y) / 2, mid = Math.PI * 0.5, span = Math.PI * 0.35, ph = rng() * TAU;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const edge = Math.max(Math.abs(a - mid) / span, Math.abs(y) / half);
    const wander = 0.14 * Math.sin(y * 5.3 + ph) + 0.1 * Math.sin(a * 17 + y * 3 + ph * 2);
    const sink = 1 - 0.14 * THREE.MathUtils.smoothstep(edge, 0.55 + wander, 0.95);
    p.setXYZ(i, x * sink, y, z * sink);
  }
  g.computeVertexNormals();
  return g;
}

/** A log's end: the wood between its bark's ring of vertices (from `outer` in `bark`) and its hollow's (from `hollow`
 *  in `inner`), the grain's rings round it (u across the wood, v round it, in the heartwood's tiles). */
function logEnd(bark: THREE.BufferGeometry, inner: THREE.BufferGeometry, outer: number, hollow: number): THREE.BufferGeometry {
  const b = bark.attributes.position, h = inner.attributes.position, sides = 16, positions: number[] = [], uvs: number[] = [];
  const corner = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, across: number, k: number) => {
    positions.push(p.getX(i), p.getY(i), p.getZ(i));
    uvs.push(across * 0.06, (k / sides) * 0.3);
  };
  for (let k = 0; k < sides; k++) {
    corner(b, outer + k, 1, k); corner(h, hollow + k, 0, k); corner(h, hollow + k + 1, 0, k + 1);
    corner(b, outer + k, 1, k); corner(h, hollow + k + 1, 0, k + 1); corner(b, outer + k + 1, 1, k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** A fallen hollow log along x (4.6 long, centred): splintered open ends showing the heartwood,
 * moss along its back, a stair of shelf fungus on one side. */
function buildLogGeo(rng: () => number): { bark: THREE.BufferGeometry; inner: THREE.BufferGeometry; moss: THREE.BufferGeometry; fungus: THREE.BufferGeometry } {
  const L = 4.6, SIDES = 16;
  // splinter both ends: every vertex on an end ring pulls back along the log by its own amount, the bark and the
  // hollow by the same (each splintered its own way, 0.45 m deep, the bark's shell stood out past the hollow in
  // spikes as thin as paper)
  const cuts = [0, 1].map(() => Array.from({ length: SIDES + 1 }, () => rng()));
  const jag = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (Math.abs(y) > L / 2 - 0.02) {
        const k = Math.round(((Math.atan2(p.getZ(i), p.getX(i)) / TAU) + 1) % 1 * SIDES), cut = cuts[y > 0 ? 0 : 1][k];
        p.setY(i, y - Math.sign(y) * cut * cut * 0.22);
      }
    }
    g.computeVertexNormals();
    return g;
  };
  const bark = lumpy(jag(new THREE.CylinderGeometry(0.42, 0.5, L, SIDES, 6, true)), 0.035, 5).rotateZ(Math.PI / 2);
  const inner = jag(new THREE.CylinderGeometry(0.28, 0.33, L, SIDES, 1, true)).rotateZ(Math.PI / 2);
  // the hollow faces inwards
  const ix = inner.index!.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  inner.computeVertexNormals();
  // each end's wood, from the bark's ring to the hollow's (their first and last rows of vertices)
  const row = SIDES + 1;
  const inside = mergeAll([inner, logEnd(bark, inner, 0, 0), logEnd(bark, inner, 6 * row, row)]);
  // a sweep of moss along the top (the cylinder's +x before it's laid along x becomes +y)
  const moss = raggedMoss(new THREE.CylinderGeometry(0.47, 0.53, L * 0.7, 28, 14, true, Math.PI * 0.15, Math.PI * 0.7), rng);
  lumpy(moss, 0.1, 9).rotateZ(Math.PI / 2).translate(0.2, 0.02, 0);
  const caps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) caps.push(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.05, 0.06, 12, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).translate(-0.6 + i * 0.35, 0.05 - i * 0.12, 0.45));
  return { bark, inner: inside, moss, fungus: mergeAll(caps) };
}


/** the trees round the clearing, grown by ez-tree (the last: the ancient giants), each capped to a few thousand
 *  triangles: sections and segments per level from the trunk, and fewer, bigger leaf cards */
/** the young trees standing in the clearing among the props (`treeSpots`): small oaks as round the ring, their trunks
 *  thicker (grown as those are, a trunk at a man's chest was 6 cm across, and an arrow at it slipped past) */
const SAPLINGS = { n: 6, near: 8, far: 23, apart: 7 };
const SAPLING: TreeGrow = {
  preset: 'Oak Small', seed: 99, sections: [7, 4, 3], segments: [7, 4, 3], leaves: 0.6, leafSize: 1.5, levels: 2, girth: 1.8,
  bark: 5,
};
/** the draws the old stump took from the biome's stream */
const OLD_STUMP_DRAWS = 21;
/** the roll the stumps stand in until a run rolls them (the lobby before the first run) */
const BOOT_ROLL = 1;
/** a stump's size across and its height, each rolled between these (its girth and its break are its sculpt's) */
const STUMP_SIZE = [0.85, 1.15];
const STUMP_HEIGHT = [0.85, 1.25];
/** the heights a sculpt's trunk is measured between for its girth (m: over its foot's flare, under its break) */
const STUMP_GIRTH_AT = [0.3, 0.5];

/** A stump standing in the forest: its mesh and its circle, both rolled anew for a run. */
interface Stump {
  mesh: THREE.Mesh;
  circle: Obstacle;
}

/** One of the pool's sculpts, with its trunk's girth and its height (m, at a scale of 1). */
interface Sculpt {
  geometry: THREE.BufferGeometry;
  girth: number;
  height: number;
}

/** The pool's sculpts, each measured: its trunk's farthest out between STUMP_GIRTH_AT, its top. */
function stumpPool(geometries: THREE.BufferGeometry[]): Sculpt[] {
  return geometries.map((geometry) => {
    const pos = geometry.attributes.position;
    let girth = 0;
    let height = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      height = Math.max(height, y);
      if (y > STUMP_GIRTH_AT[0] && y < STUMP_GIRTH_AT[1]) girth = Math.max(girth, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    return { geometry, girth, height };
  });
}

/** Every stump dealt a sculpt of the pool from `seed` (none twice), its size and turn: a run's own, the same on every
 *  game in co-op. */
function rollStumps(stumps: Stump[], pool: Sculpt[], seed: number): void {
  const rng = mulberry(seed * 104729 + 31);
  const between = ([low, high]: number[]) => low + rng() * (high - low);
  const order = pool.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  stumps.forEach((stump, i) => {
    const sculpt = pool[order[i % order.length]];
    const size = between(STUMP_SIZE);
    const height = between(STUMP_HEIGHT);
    stump.mesh.geometry = sculpt.geometry;
    stump.mesh.scale.set(size, height, size);
    stump.mesh.rotation.y = rng() * TAU;
    stump.circle.r = sculpt.girth * size;
    stump.circle.h = sculpt.height * height;
  });
}
/** the ancient giants' places round the ring (those clear of the gates) */
const GIANTS = 20;
/** over this height a crown may reach over the wall (the top-down camera sits 26 m over the hero, and the old giants'
 *  crowns reached over it 40 m up) */
const CANOPY_Y = 24;
/**
 * A tree kind: how ez-tree grows it, and how often its bark repeats round it (and along it as often: its tiles are
 * square, `growTree`). A tile runs once round each branch (`lab tiles`: at a trunk's foot 2.2 to 2.7 m, a giant's
 * 8.5), so the repeat makes it about 0.4 m at the foot, the oak photo's plates their own size (a giant's 0.6 m: old
 * bark's plates are coarser), and narrower round thinner branches.
 */
interface TreeGrow extends Grow {
  bark: number;
}

const TREE_KINDS: TreeGrow[] = [
  { preset: 'Oak Medium', seed: 4021, sections: [7, 4, 3], segments: [7, 4, 3], leaves: 0.4, leafSize: 1.6, levels: 2, bark: 6 },
  { preset: 'Ash Medium', seed: 717, sections: [7, 4, 3], segments: [7, 4, 3], leaves: 0.4, leafSize: 1.6, levels: 2, bark: 7 },
  { preset: 'Oak Small', seed: 99, sections: [7, 4, 3], segments: [7, 4, 3], leaves: 0.6, leafSize: 1.5, levels: 2, bark: 5 },
  { preset: 'Aspen Large', seed: 1312, sections: [7, 4, 3], segments: [6, 4, 3], leaves: 0.25, leafSize: 1.8, levels: 2, bark: 4 },
  // (its crown high on a tall bare bole, from half its height up: as grown, an oak's limbs start low and spread 0.6 of
  // its height, and narrowed to keep its low limbs outside the wall it stood as a column with no roof over the wall)
  { preset: 'Oak Large', seed: 23399, sections: [10, 5, 3], segments: [8, 4, 3], leaves: 0.7, leafSize: 2.2, trunk: 3.2, crownStart: 0.85, girth: 2.4, levels: 2, bark: 14 },
];

/** each bark prop's repeat [round, along]: its tile about 0.4 m on it, as on the trees (`lab tiles`: at 1, from 0.3 m
 *  round a bonfire's logs to 9 m along a root) */
const BARK_REPEATS = {
  stumps: [4, 3], log: [7, 11], roots: [3, 22], gateArch: [8, 17], gateVine: [3, 17], gateRoots: [3, 4], bonfire: [1, 2],
} as const satisfies Record<string, Repeat>;

/** Points along the curve `taperTube` lays a tube round (by its length, `steps` of them), each with its radius. */
function tubeSamples(pts: THREE.Vector3[], radius: (t: number) => number, steps: number): [number, number, number, number][] {
  const curve = new THREE.CatmullRomCurve3(pts), at = new THREE.Vector3();
  return Array.from({ length: steps + 1 }, (_, i) => {
    curve.getPointAt(i / steps, at);
    return [at.x, at.y, at.z, radius(i / steps)];
  });
}

interface GateMats {
  canopyMat: THREE.Material; coreMat: THREE.Material; hangMat: THREE.Material; ivyMat: THREE.Material;
  /** the bark of its arch's roots, of the vines round them and of the roots splaying from their feet */
  archMat: THREE.Material; vineMat: THREE.Material; rootMat: THREE.Material;
}

function buildRootGate(scene: THREE.Object3D, wall: Wall, angle: number, rockMat: THREE.Material, M: GateMats, rng: () => number, updaters: Updater[]): Portal {
  const g = new THREE.Group();
  const half = GATE_W / 2 + 0.45;
  const hang: THREE.BufferGeometry[] = [], ivy: THREE.BufferGeometry[] = [];
  // two twisted roots rising from each side and meeting overhead
  for (const s of [-1, 1]) {
    const pts = [[s * (half + 0.5), 0, 0.3], [s * half, 1.6, 0], [s * (half - 0.1), 3.4, -0.1], [s * (half - 0.9), 4.8, 0], [s * 0.2, 5.3, 0.05]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const tube = new THREE.Mesh(taperedTube(curve, 0.7, 0.28), M.archMat);
    tube.name = 'gate arch';
    tube.castShadow = tube.receiveShadow = true;
    g.add(tube);
    // a thinner root twisting around it
    const vine = new THREE.CatmullRomCurve3(pts.map(([x, y, z], i) => new THREE.Vector3(x + Math.sin(i * 1.9) * 0.45 * s, y, z + Math.cos(i * 1.9) * 0.45)));
    const v = new THREE.Mesh(taperedTube(vine, 0.26, 0.1), M.vineMat);
    v.name = 'gate vine';
    v.castShadow = true;
    g.add(v);
    // roots splaying from its foot into the ground
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.7 + (s < 0 ? Math.PI : 0), c = Math.cos(a), sn = Math.sin(a), x0 = s * (half + 0.5);
      const root = new THREE.Mesh(taperTube([V(x0, 0.4, 0.3), V(x0 + c * 0.8, 0.12, 0.3 + sn * 0.8), V(x0 + c * 1.6, -0.05, 0.3 + sn * 1.5)], (t) => 0.3 * (1 - t * 0.8), 10, 7), M.rootMat);
      root.castShadow = root.receiveShadow = true;
      root.name = 'gate roots';
      g.add(root);
    }
    // boulder at the foot
    const boulder = new THREE.Mesh(boulderGeo(Math.round(angle * 10) + s, 0.9), rockMat);
    boulder.name = 'gate boulder';
    boulder.position.set(s * (half + 1.3), 0.3, 0.2);
    boulder.scale.set(1.1, 0.9, 1.3);
    boulder.castShadow = boulder.receiveShadow = true;
    g.add(boulder);
    // moss hanging in beards from the arch, ivy climbing it
    for (let k = 0; k < 5; k++) {
      const p = curve.getPointAt(0.45 + k * 0.12);
      hang.push(bend(rag(0.35 + rng() * 0.2, 0.7 + rng() * 1.1, k * 7 + s * 3 + angle, 3), -0.08).translate(p.x, p.y - 0.25, p.z + 0.1 + rng() * 0.3));
    }
    for (let k = 0; k < 40; k++) {
      const t = rng() * 0.8, p = curve.getPointAt(t), a = rng() * TAU, w = 0.5 * (1 - t * 0.5);
      ivy.push(new THREE.PlaneGeometry(0.22, 0.3).rotateX(-0.4).rotateY(a).translate(p.x + Math.cos(a) * w, p.y + 0.1, p.z + Math.sin(a) * w));
    }
  }
  const hangM = new THREE.Mesh(mergeAll(hang), M.hangMat);
  const ivyM = new THREE.Mesh(mergeAll(ivy), M.ivyMat);
  hangM.receiveShadow = ivyM.receiveShadow = true;
  g.add(hangM, ivyM);
  // a crown of leaves on the arch (the cards cast no shadow here: the shadow bake would make them solid)
  const crown = canopyGeo(rng, [[0, 0, 0, 1], [1.1, -0.3, 0.1, 0.7], [-1.1, -0.25, -0.1, 0.72]], 16, 0.9);
  for (const [geo, mat, cast] of [[crown.core, M.coreMat, true], [crown.cards, M.canopyMat, false]] as const) {
    geo.scale(1.5, 0.9, 1.1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 5.6, -0.3);
    m.castShadow = cast; m.receiveShadow = true;
    g.add(m);
  }

  const { portal } = portalMembrane(g, angle, { a: [0.04, 0.45, 0.2], b: [0.45, 0.9, 0.15], core: [0.7, 1.0, 0.55] }, updaters, true);
  placeGate(g, angle);
  scene.add(g);
  wall.add(g, false);
  return portal;
}

/** A mushroom cap of radius 1 (height ~0.55): a dome whose rim waves and curls under, its gills below. */
function glowcapGeo(): { cap: THREE.BufferGeometry; gills: THREE.BufferGeometry } {
  const prof: [number, number][] = [[0.88, -0.02], [1, 0.05]];
  for (let i = 9; i >= 0; i--) { const rr = (i / 10) * 0.97; prof.push([rr, 0.55 - Math.pow(rr, 2.2) * 0.5]); }
  const cap = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y)), 28);
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
    if (rr > 0.6) p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 6) * 0.06 * (rr - 0.6) / 0.4);
  }
  cap.computeVertexNormals();
  const gills = new THREE.LatheGeometry([new THREE.Vector2(0.9, 0.0), new THREE.Vector2(0.12, 0.12)], 28);
  return { cap, gills };
}

function buildGlowcaps(scene: THREE.Object3D, x: number, z: number, rng: () => number, cap: THREE.Material, stem: THREE.Material, updaters: Updater[]): void {
  const { cap: capGeo, gills: gillGeo } = glowcapGeo();
  // stems bow a little (0.8 y^2 along x) and swell at the foot
  const stemGeo = new THREE.CylinderGeometry(0.7, 1, 1, 10, 4).translate(0, 0.5, 0);
  const sp = stemGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const y = sp.getY(i), k = 1 + (1 - y) ** 3 * 0.5; sp.setXYZ(i, sp.getX(i) * k + y * y * 0.8, y, sp.getZ(i) * k); }
  stemGeo.computeVertexNormals();
  const shrooms: [number, number, number, number][] = [[0, 0, 1.5, 0.55], [0.55, 0.25, 0.95, 0.38], [-0.4, 0.45, 0.7, 0.3], [0.1, -0.55, 0.55, 0.26], [-0.55, -0.3, 0.35, 0.18], [0.3, 0.65, 0.3, 0.15]];
  // (each part of the cluster's mushrooms merged into one mesh, placed: a mesh a stem, cap and gills, the four
  // clusters were 46 of the lobby's shadow draws a frame, and on WebGPU each draw is about 20 µs of its JS)
  const placed = { stems: [] as THREE.BufferGeometry[], caps: [] as THREE.BufferGeometry[], gills: [] as THREE.BufferGeometry[] };
  const at = new THREE.Object3D();
  const place = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    at.updateMatrix();
    return geo.clone().applyMatrix4(at.matrix);
  };
  for (const [dx, dz, ht, cr] of shrooms) {
    const lean = (rng() - 0.5) * 0.3, yaw = rng() * TAU;
    at.position.set(x + dx, 0, z + dz);
    at.scale.set(cr * 0.22, ht, cr * 0.22);
    at.rotation.set(0, yaw, lean);
    placed.stems.push(place(stemGeo));
    // the cap sits on the top of the bowed stem
    const top = new THREE.Vector3(0.8 * cr * 0.22, ht, 0).applyEuler(at.rotation);
    at.position.set(x + dx + top.x, top.y, z + dz + top.z);
    at.scale.setScalar(cr);
    placed.caps.push(place(capGeo));
    placed.gills.push(place(gillGeo));
  }
  for (const [geos, mat, cast] of [[placed.stems, stem, true], [placed.caps, cap, true], [placed.gills, stem, false]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = cast;
    scene.add(mesh);
    for (const geo of geos) geo.dispose();
  }
  for (const geo of [stemGeo, capGeo, gillGeo]) geo.dispose();
  const light = new THREE.PointLight(0x40ffc8, 5, 10, 2);
  light.position.set(x, 1.9, z);
  scene.add(light);
  const due = runPhase({ acc: 0 });
  updaters.push((dt, t) => {
    light.intensity = 4.2 + Math.sin(t * 1.7 + x) * 0.8;
    due.acc += dt;
    while (due.acc > 0.12) {
      due.acc -= 0.12;
      particles.glow.spawn({
        x: x + rand(-0.6, 0.6), y: rand(0.6, 1.4), z: z + rand(-0.6, 0.6), vx: rand(-0.1, 0.1), vy: rand(0.2, 0.5), vz: rand(-0.1, 0.1),
        life: rand(1.5, 2.5), size: rand(0.06, 0.12), color: col(0x60ffd0, 1.4), colorEnd: col(0x106050, 0.3),
      });
    }
  });
}

function buildBonfire(scene: THREE.Object3D, x: number, z: number, stone: THREE.Material, wood: THREE.Material, updaters: Updater[]): void {
  // (the ring's stones merged: a mesh a stone, a bonfire's ring was 9 draws, and 9 more in the sun's shadow)
  const ringGeo = boulderGeo(47, 0.2, 1), at = new THREE.Object3D(), stones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    at.position.set(x + Math.cos(a) * 0.75, 0.08, z + Math.sin(a) * 0.75);
    at.scale.set(1.2, 0.8, 1);
    at.rotation.set(0.25 * Math.sin(3 * a), a * 2, 0);
    at.updateMatrix();
    stones.push(ringGeo.clone().applyMatrix4(at.matrix));
  }
  const ring = new THREE.Mesh(mergeGeometries(stones), stone);
  ring.name = 'bonfire stones';
  ring.castShadow = true;
  scene.add(ring);
  // a teepee of logs leaning in over the bed, two more lying across it; where the flames lick them, charred and
  // glowing through their char
  // (each log's bark and char merged: drawn a mesh a part, its charred end apart, a bonfire's logs were 22 draws)
  const logs: LogParts = { bark: [], char: [], ends: [] };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    const foot = new THREE.Vector3(x + Math.cos(a) * 0.48, 0, z + Math.sin(a) * 0.48);
    const top = new THREE.Vector3(x + Math.cos(a + 2.4) * 0.06, 0.6 + (i % 2) * 0.07, z + Math.sin(a + 2.4) * 0.06);
    leanLog(logs, foot, top, 0.055, true);
  }
  for (const a of [0.5, 2.2]) {
    const across = new THREE.Vector3(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    const from = new THREE.Vector3(x, 0.07, z).sub(across);
    const to = new THREE.Vector3(x, 0.09, z).add(across);
    leanLog(logs, from, to, 0.07, false);
  }
  const char = emberMat(new THREE.Vector3(x, 0.25, z), 0.6);
  for (const [parts, mat] of [[logs.bark, wood], [logs.char, char]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.name = 'bonfire logs';
    mesh.castShadow = true;
    scene.add(mesh);
  }
  const light = new THREE.PointLight(0xff7a30, 12, 13, 2);
  light.position.set(x, 1.3, z);
  staticShadow(light);
  scene.add(light);
  buildFire(scene, {
    at: new THREE.Vector3(x, 0.03, z), radius: 0.5, height: 1.5, dish: 0, light, intensity: 12,
    smoke: 6, smokeColour: 0x8a8580, embers: 10, logs: logs.ends,
  }, updaters);
}

/** A bonfire's logs, their bark's geometry and their char's, in the world's frame. */
interface LogParts {
  bark: THREE.BufferGeometry[];
  char: THREE.BufferGeometry[];
  /** each log as the flames know it, to hide what's behind it */
  ends: FireLog[];
}

/** A log from `from` to `to` (m), `radius` thick, into `logs`: bark with its upper 60% and its end sheathed in char
 *  (a bare end showed its pale grain at the teepee's top, in the flames), or with `barked` false charred throughout. */
function leanLog(logs: LogParts, from: THREE.Vector3, to: THREE.Vector3, radius: number, barked: boolean): void {
  const along = to.clone().sub(from);
  const length = along.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
  const at = (share: number) => new THREE.Matrix4().compose(
    from.clone().addScaledVector(along, share), turn, new THREE.Vector3(1, 1, 1));
  const side = new THREE.CylinderGeometry(radius * 0.85, radius, length, 7, 1, true).applyMatrix4(at(0.5));
  // (an end facing `up` (1) or down (-1), its corners turned onto the side's)
  const end = (r: number, share: number, up: number) =>
    new THREE.CircleGeometry(r, 7, -up * Math.PI / 2).rotateX(-up * Math.PI / 2).applyMatrix4(at(share));
  const foot = end(radius, 0, -1);
  const top = end(radius * 0.85, 1, 1);
  // (as thin as its top's seven sides are at their middles: thicker, the flames were cut short of its edges there,
  // the ground showing through)
  logs.ends.push({ from: from.clone(), to: to.clone(), radius: radius * 0.85 * Math.cos(Math.PI / 7) });
  if (!barked) {
    logs.char.push(side, foot, top);
    return;
  }
  const sheath = new THREE.CylinderGeometry(radius * 0.9, radius * 1.02, length * 0.6, 7, 1, true);
  logs.bark.push(side, foot);
  logs.char.push(top, sheath.applyMatrix4(at(0.68)));
}
