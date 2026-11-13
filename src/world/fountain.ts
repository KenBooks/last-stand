// The fountain in the middle of the village's square (world/village.ts), in three tiers: an octagonal basin, a pilaster
// and a finial at each of its corners; a pedestal rising out of it, four spouts on it arcing water into the basin; a
// scalloped bowl on the pedestal spilling a curtain into the basin, and a small bowl over that under a carved finial,
// spilling into the bowl below, a jet rising from its tip. The water is see-through, clearer looked down into and
// more of a mirror at a glancing angle, its normal bent by rings running out from where water falls on it; the basin's
// floor under it is lit by caustics drifting over it. The falling water is a streaked picture scrolled along thin
// shells and tubes, the foam a picture turning where it lands: their textures' offsets and the game's clock are all
// that move, so nothing compiles after the village's warm-up. What of its light is the sky's (the caustics, the falling
// water's glow) follows the hour (`FountainLight`): by night it's lit by the lamps alone.
import { WEBGPU } from '../core/webgpu';
import type { OwnLooks } from '../core/shaderPorts';
import { causticNodes, fallingNodes, waterLooks, waterNodes } from './villageNodes';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasOf, ctx2d } from '../core/textures';
import { seeThrough } from '../core/seeThrough';
import { mulberry } from '../util';
import type { Obstacle } from '../types';
import type { Updater } from './props';

/** the basin: its outer radius (to its corners), its rim's thickness, its wall's height, the water's level in it, and
 *  its floor's (m) */
export const FOUNTAIN = { r: 2.2, rim: 0.3, high: 0.6, water: 0.46, floor: 0.08 };
/** Whether (x, z) lies over the basin's water, inside its octagon's faces. */
export const inBasin = (x: number, z: number): boolean => Math.hypot(x, z)
  < (FOUNTAIN.r - FOUNTAIN.rim) * Math.cos(Math.PI / 8);

/** What an arrow lying at (x, z) lies on over the village's ground (m): the basin's floor, its rim's top; nothing elsewhere. */
export function basinTop(x: number, z: number): number {
  if (inBasin(x, z)) return FOUNTAIN.floor;
  return Math.hypot(x, z) < FOUNTAIN.r ? FOUNTAIN.high : 0;
}

/** the middle bowl on the pedestal: its foot, its radius, its water's level (m) */
const BOWL = { foot: 1.25, r: 0.85, water: 1.52 };
/** the top bowl: its foot, its radius, its water's level, and the finial's tip over it (m) */
const TOP = { foot: 2.0, r: 0.42, water: 2.18, tip: 2.62 };
/** how far past the middle bowl's radius its scallops can reach (m) */
const TIERS_PAST = 0.2;
/** the spouts on the pedestal: their height and how far out their water lands (m) */
const SPOUT = { y: 0.78, at: 0.3, lands: 1.5 };
/** the corners of the basin: an octagon's, its faces square to x and z */
const CORNERS = 8, FIRST_CORNER = Math.PI / CORNERS;
/** how long a tile of the stone's picture is on the turned parts (m) */
const STONE_TILE = 0.6;

/** what the fountain is built of: the village's own stone */
export interface FountainMats { stone: THREE.Material; coping: THREE.Material }

/** the falling water's and the foam's glow at full day (the sky's light scattered through them), and the least of
 *  their glow and of the caustics by night (a share of the day's): from play, "I dont think water reflects light
 *  correctly", its curtains and its floor's web shone cyan at midnight */
const FALLING_GLOW = 0x2a3c42;
const NIGHT_LEAST = 0.06;
/** the share of the falling water's and the foam's whiteness left by night: a sheet of water scatters little of a
 *  light that isn't the sky's, and near white it took the moon and the lamps as paint does (at 0.3, lit by every
 *  street lamp at once, `core/lamps.ts`, the sheets shone a warm brown: "fountain reflections messed up") */
const NIGHT_WHITE = 0.25;
/** the share of the falling water's cover left by night: a sheet's streaks laid dark over what's behind it read as a
 *  brown cone, painted and opaque (a review), where a curtain of water by night is seen through, its streaks caught by
 *  the lamps */
const NIGHT_COVER = 0.3;
/** the share of the water's tint and its pale floor's colour left by night: lit by the night's blue sky light, the
 *  basin read as a lit cyan disc (a review: "bright, opaque cyan that looks lit from inside") */
const NIGHT_POOL = 0.25;

/** the share of the sky's light the water mirrors (`mirroredSky`): the environment is the day's sky whatever the hour,
 *  and the scene's intensity for it, which three sets on every material taking it, is the village's at night too, so
 *  by night its mirror of it shone cyan, the lamps' glints lost in it */
let skyLight = { value: 1 };

/** `shader`'s light from the environment (what it mirrors and what it's lit by from round it) scaled by `skyLight`. */
function mirroredSky(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uSkyLight = skyLight;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uSkyLight;')
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= uSkyLight;\n'
      + 'iblIrradiance *= uSkyLight;');
}

/** the water's roughness for the lights round it alone (its mirror of the sky keeps its own): a lamp is a point to
 *  three, and on the near mirror its glint was a spot past white the bloom spread into an orb on the water ("fountain
 *  reflections messed up"), where a lantern's panes, a hand across, glint as a softer streak; rougher for the lights
 *  as a renderer's lights with a size are (their source's size widening the lobe) */
const WATER_LIT_ROUGH = 0.12;
/** the share of the water's highlights the lights round it give (its mirror of the sky keeps its own): at full, a
 *  street lamp's glints 3 m off bloomed into a puddle of light (a review) */
const WATER_LIT_SHINE = 0.3;
/** the most light a glint on the water gives, just under the bloom's threshold (`renderer.ts`, 0.9): over it, the bloom
 *  spread each glint into a soft ball, the lamp's path a cloud of fireflies (a review), and uncapped by day the sun's
 *  lay a white blot across the basin to anyone looking at it from the sun's far side */
const GLINT_MOST = 0.8;

/** The fountain's light set for how much of the day's there is (0 by night, 1 by full day). */
export type FountainLight = (day: number) => void;

/** The fountain at (0, 0) of `scene`, an obstacle round its basin; its water moving by `updaters`. */
export function buildFountain(scene: THREE.Object3D, M: FountainMats, obstacles: Obstacle[],
  updaters: Updater[]): FountainLight {
  const g = new THREE.Group();
  g.name = 'fountain';
  scene.add(g);
  const time = { value: 0 };
  const { r, rim, high, water, floor } = FOUNTAIN;
  // the basin: an octagonal wall, its coping rolled over at the top; a pilaster and a ball at each corner
  lathe(g, [[r, 0], [r, high - 0.1], [r + 0.08, high - 0.06], [r + 0.08, high], [r - rim - 0.05, high],
    [r - rim - 0.05, high - 0.07], [r - rim, high - 0.1], [r - rim, floor]], M.coping, CORNERS, FIRST_CORNER);
  for (let k = 0; k < CORNERS; k++) {
    const a = FIRST_CORNER + k * Math.PI * 2 / CORNERS, out = r + 0.02;
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.26, high + 0.08, 0.26), M.coping);
    pilaster.position.set(Math.sin(a) * out, (high + 0.08) / 2, Math.cos(a) * out);
    pilaster.rotation.y = a;
    g.add(pilaster);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), M.coping);
    ball.position.set(Math.sin(a) * out, high + 0.19, Math.cos(a) * out);
    g.add(ball);
  }
  // (what an arrow meets, as drawn: the basin's wall from outside, the tiers over it)
  const walls = [...g.children];
  // the floor under the water, its caustics, and the water
  const inside = r - rim;
  const sunlit = { value: 1 };
  skyLight = sunlit;
  const floorMat = causticFloor(time, sunlit);
  flat(g, octagon(inside), floor, floorMat);
  const pools = [waterMaterial(time, 0x3d6f78), waterMaterial(time, 0x3d6f78), waterMaterial(time, 0x3d6f78)];
  flat(g, octagon(inside), water, pools[0]);
  // the pedestal, its four spouts
  lathe(g, [[0.55, floor], [0.42, 0.22], [0.26, 0.34], [0.22, 0.9], [0.3, 1.0], [0.24, 1.08], [0.2, BOWL.foot]], M.stone, 32);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, 0.1), M.coping);
    spout.position.set(Math.sin(a) * (SPOUT.at - 0.08), SPOUT.y, Math.cos(a) * (SPOUT.at - 0.08));
    spout.rotation.y = a;
    g.add(spout);
  }
  // the middle bowl, scalloped round its rim, and its water
  scallop(lathe(g, [[0.2, BOWL.foot], [0.5, BOWL.foot + 0.06], [BOWL.r - 0.05, BOWL.water - 0.02], [BOWL.r, BOWL.water + 0.06],
    [BOWL.r - 0.07, BOWL.water + 0.06], [BOWL.r - 0.1, BOWL.water - 0.04], [0, BOWL.water - 0.04]], M.coping, 64), 0.35);
  flat(g, circle(BOWL.r - 0.1), BOWL.water, pools[1]);
  // the top bowl on its stem, its water, the finial over it
  lathe(g, [[0.14, BOWL.water - 0.04], [0.1, BOWL.water + 0.2], [0.09, TOP.foot - 0.1], [0.16, TOP.foot]], M.stone, 16);
  scallop(lathe(g, [[0.16, TOP.foot], [0.3, TOP.foot + 0.05], [TOP.r - 0.03, TOP.water - 0.01], [TOP.r, TOP.water + 0.04],
    [TOP.r - 0.05, TOP.water + 0.04], [TOP.r - 0.07, TOP.water - 0.03], [0, TOP.water - 0.03]], M.coping, 48), 0.2);
  flat(g, circle(TOP.r - 0.07), TOP.water, pools[2]);
  lathe(g, [[0.09, TOP.water - 0.03], [0.07, TOP.water + 0.08], [0.12, TOP.water + 0.18], [0.13, TOP.water + 0.26],
    [0.08, TOP.tip - 0.08], [0.04, TOP.tip - 0.02], [0, TOP.tip]], M.coping, 16);
  // the falling water: curtains over each bowl's rim, the jet from the finial's tip, the spouts' arcs
  const streaks = streakTexture();
  const curtain = fallingWater(streaks, 8, 0.6), jetMat = fallingWater(streaks, 1, 0.5);
  shell(g, BOWL.r + 0.04, BOWL.r + 0.38, water, BOWL.water + 0.06, curtain);
  shell(g, TOP.r + 0.03, TOP.r + 0.2, BOWL.water, TOP.water + 0.04, curtain);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.4, 8, 1, true), jetMat);
  jet.position.y = TOP.tip + 0.2;
  g.add(jet);
  for (let k = 0; k < 4; k++) g.add(arc(k * Math.PI / 2, jetMat));
  // the foam where the curtain strikes the basin, and where each arc lands, turning slowly
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0xeef6f8, emissive: FALLING_GLOW, roughness: 0.3, alphaMap: foamTexture(), transparent: true, opacity: 0.6,
    depthWrite: false, side: THREE.DoubleSide,
  });
  seeThrough(foamMat, 'prop');
  const foam = new THREE.Mesh(new THREE.RingGeometry(BOWL.r + 0.12, BOWL.r + 0.75, 48, 1).rotateX(-Math.PI / 2), foamMat);
  foam.position.y = water + 0.006;
  g.add(foam);
  const splashes: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const splash = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20).rotateX(-Math.PI / 2), foamMat);
    splash.position.set(Math.sin(a) * SPOUT.lands, water + 0.008, Math.cos(a) * SPOUT.lands);
    g.add(splash);
    splashes.push(splash);
  }
  const falling = new Set<THREE.Material>([curtain, jetMat, foamMat]);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !falling.has(o.material as THREE.Material) && !o.userData.water) {
      o.castShadow = o.receiveShadow = true;
    }
  });
  const tiers = g.children.filter((o): o is THREE.Mesh => !walls.includes(o) && o instanceof THREE.Mesh
    && (o.material === M.stone || o.material === M.coping));
  // (its stone drawn as one a material: the basin's wall, the tiers' coping and their stone)
  const wall = asOne(g, walls as THREE.Mesh[]);
  const tiersAsOne = [M.coping, M.stone].map((m) => asOne(g, tiers.filter((o) => o.material === m)));
  obstacles.push({ x: 0, z: 0, r: r + 0.1, h: high, sight: { r: BOWL.r + 0.4, h: TOP.tip }, drawn: [wall] });
  // (the tiers stand taller than the basin stops a body: from play, "fountain should be a valid obstacle for arrows")
  obstacles.push({ x: 0, z: 0, r: BOWL.r + TIERS_PAST, h: TOP.tip, drawn: tiersAsOne });
  const curtainMap = curtain.alphaMap!, jetMap = jetMat.alphaMap!;
  updaters.push((_dt, t) => {
    time.value = t;
    curtainMap.offset.y = (t * 1.6) % 1;
    jetMap.offset.y = (-t * 2.4) % 1;
    foam.rotation.y = t * 0.15;
    splashes.forEach((s, k) => { s.rotation.y = -t * 0.6 + k; });
  });
  const whites = [curtain, jetMat, foamMat].map((m) => m.color.clone());
  const covers = [curtain, jetMat].map((m) => m.opacity);
  const tints = [...pools, floorMat].map((m) => m.color.clone());
  return (day) => {
    const lit = NIGHT_LEAST + (1 - NIGHT_LEAST) * day;
    const white = NIGHT_WHITE + (1 - NIGHT_WHITE) * day;
    const tint = NIGHT_POOL + (1 - NIGHT_POOL) * day;
    [curtain, jetMat, foamMat].forEach((m, k) => m.color.copy(whites[k]).multiplyScalar(white));
    [curtain, jetMat].forEach((m, k) => { m.opacity = covers[k] * (NIGHT_COVER + (1 - NIGHT_COVER) * day); });
    [...pools, floorMat].forEach((m, k) => m.color.copy(tints[k]).multiplyScalar(tint));
    sunlit.value = lit;
    for (const m of [curtain, jetMat, foamMat]) m.emissiveIntensity = lit;
  };
}

/** the attributes every piece of the fountain's stone has, all that a merge of them keeps */
const STONE_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Pieces of `g` of one material drawn as one, in `g`'s space: a draw each, the fountain was 42 of the 220 draws of an
 * S25 Edge's frame by it at night, and three's work for each draw (its program, its uniforms) most of the render's CPU,
 * 10 of the frame's 33 ms (from play, "ok but I want 60 fps"). Only its stone: what falls and the foam blend, and three
 * sorts what blends by its object.
 */
function asOne(g: THREE.Group, meshes: THREE.Mesh[]): THREE.Mesh {
  const parts = meshes.map((mesh) => {
    mesh.updateMatrix();
    const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(part.attributes)) if (!STONE_ATTRIBUTES.includes(name)) part.deleteAttribute(name);
    return part.applyMatrix4(mesh.matrix);
  });
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('fountain: its stone wouldn\'t merge');
  const one = new THREE.Mesh(merged, meshes[0].material);
  one.castShadow = meshes[0].castShadow;
  one.receiveShadow = meshes[0].receiveShadow;
  g.add(one);
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  return one;
}

/** A solid turned about y from its profile's points (radius, height), from `start` round. */
function lathe(g: THREE.Object3D, profile: readonly [number, number][], m: THREE.Material, segments: number,
  start = 0): THREE.Mesh {
  const points = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(points, segments, start);
  // (its stone laid in metres, round its widest and up its profile: a lathe's own UVs stretch a tile round it whole)
  const round = Math.PI * 2 * Math.max(...profile.map(([x]) => x)) / STONE_TILE;
  const along = [0];
  for (let k = 1; k < points.length; k++) along.push(along[k - 1] + points[k].distanceTo(points[k - 1]) / STONE_TILE);
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * round, along[k % points.length]);
  const mesh = new THREE.Mesh(geometry, m);
  g.add(mesh);
  return mesh;
}

/** A turned bowl's rim scalloped: eight lobes round it, pushed out by `lobe` of its radius past `from` m out. */
function scallop(mesh: THREE.Mesh, from: number): void {
  const p = mesh.geometry.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k), out = Math.hypot(x, z);
    if (out <= from) continue;
    const lobe = 1 + 0.07 * Math.cos(8 * Math.atan2(x, z)) * (out - from) / out;
    p.setXYZ(k, x * lobe, p.getY(k), z * lobe);
  }
  mesh.geometry.computeVertexNormals();
}

/** The basin's octagon inside its rim, `radius` to its corners, as a shape laid flat (its corners the basin's). */
function octagon(radius: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let k = 0; k <= CORNERS; k++) {
    const a = FIRST_CORNER + k * Math.PI * 2 / CORNERS;
    if (k === 0) s.moveTo(Math.sin(a) * radius, -Math.cos(a) * radius);
    else s.lineTo(Math.sin(a) * radius, -Math.cos(a) * radius);
  }
  return s;
}

/** A circle as a shape laid flat. */
function circle(radius: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return s;
}

/** A flat surface of `shape` at height `y` (water, or the floor under it). */
function flat(g: THREE.Object3D, shape: THREE.Shape, y: number, m: THREE.Material): void {
  const geometry = new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2);
  const uv = geometry.attributes.uv, p = geometry.attributes.position;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k), p.getZ(k));
  const mesh = new THREE.Mesh(geometry, m);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  mesh.userData.water = true;
  g.add(mesh);
}

/** A curtain of falling water: an open shell from `top` (its radius `r0`) down to `bottom` (`r1`). */
function shell(g: THREE.Object3D, r0: number, r1: number, bottom: number, top: number, m: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, top - bottom, 48, 1, true), m);
  mesh.position.y = (top + bottom) / 2;
  g.add(mesh);
}

/** A spout's arc of water (the spout facing `a` rad round), out and down into the basin, its streaks along it. */
function arc(a: number, m: THREE.Material): THREE.Mesh {
  const dir = (out: number, y: number): THREE.Vector3 => new THREE.Vector3(Math.sin(a) * out, y, Math.cos(a) * out);
  const turned = a + Math.PI / 4;
  const landing = new THREE.Vector3(Math.sin(turned) * SPOUT.lands, FOUNTAIN.water, Math.cos(turned) * SPOUT.lands);
  const curve = new THREE.QuadraticBezierCurve3(dir(SPOUT.at + 0.02, SPOUT.y), dir(SPOUT.at + 0.7, SPOUT.y + 0.45), landing);
  const geometry = new THREE.TubeGeometry(curve, 24, 0.016, 6, false);
  // (along the tube as v, so the streaks run down it as they do the curtains)
  const uv = geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k) * 2);
  return new THREE.Mesh(geometry, m);
}

/**
 * Water: see-through and tinted, the sky in it, clearer looked down into and more of a mirror at a glancing angle; its
 * normal bent by rings running out from the middle (where the water falls) and two slow crossing swells, all on the
 * game's clock (`time`).
 */
function waterMaterial(time: { value: number }, colour: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: colour, roughness: 0.1, metalness: 0.1, transparent: true, depthWrite: false,
  });
  if (WEBGPU) {
    waterNodes(m, time);
    const sky = skyLight;
    const lit = { rough: WATER_LIT_ROUGH, shine: WATER_LIT_SHINE, glintMost: GLINT_MOST };
    (m as typeof m & OwnLooks).webgpuLooks = (converted) => waterLooks(converted, sky, lit);
    return seeThrough(m, 'prop');
  }
  m.onBeforeCompile = (shader) => {
    mirroredSky(shader);
    shader.uniforms.uRippleTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRipple;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRipple = (modelMatrix * vec4(position, 1.0)).xz - modelMatrix[3].xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRipple;\nuniform float uRippleTime;')
      .replace('#include <lights_fragment_begin>', 'float ownRough = material.roughness;\n'
        + 'vec3 ownSpecular = material.specularColor;\nfloat ownF90 = material.specularF90;\n'
        + `material.roughness = max(ownRough, ${WATER_LIT_ROUGH.toFixed(2)});\n`
        + `material.specularColor *= ${WATER_LIT_SHINE.toFixed(2)};\n`
        + `material.specularF90 *= ${WATER_LIT_SHINE.toFixed(2)};\n#include <lights_fragment_begin>\n`
        + 'material.roughness = ownRough;\nmaterial.specularColor = ownSpecular;\nmaterial.specularF90 = ownF90;\n'
        + `reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(${GLINT_MOST.toFixed(2)}));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float d = length(vRipple) + 1e-4;
          vec2 out_ = vRipple / d;
          float rings = cos(d * 11.0 - uRippleTime * 4.0) * 0.16 * exp(-d * 0.35);
          vec2 slope = out_ * rings;
          slope += vec2(sin(vRipple.y * 2.3 + uRippleTime * 0.9), cos(vRipple.x * 1.9 - uRippleTime * 0.7)) * 0.05;
          // (fine wavelets crossing three ways: a lamp across the water glints in many small breaks, as a path,
          // where the rings alone laid its light as a smooth band and in arcs round the middle, a review)
          for (int w = 0; w < 3; w++) {
            float turn = float(w) * 2.1 + 0.4;
            vec2 way = vec2(cos(turn), sin(turn));
            slope += way * sin(dot(vRipple, way) * (17.0 + float(w) * 6.0) + uRippleTime * (2.3 + float(w))) * 0.08;
          }
          normal = normalize(normal + (viewMatrix * vec4(slope.x, 0.0, slope.y, 0.0)).xyz);
          float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          diffuseColor.a = mix(0.45, 0.92, pow(1.0 - facing, 3.0));
        }`);
  };
  m.customProgramCacheKey = () => 'fountain-water';
  return seeThrough(m, 'prop');
}

/**
 * The basin's floor: pale stone with the light the water above focuses drifting over it, a web of bright lines that
 * shifts as the ripples do (two warped grids of waves, their troughs' meeting lit), on the game's clock.
 */
function causticFloor(time: { value: number }, sunlit: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x8f9a92, roughness: 0.85 });
  if (WEBGPU) {
    causticNodes(m, time, sunlit);
    return seeThrough(m, 'propFoot');
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCausticTime = time;
    shader.uniforms.uCausticLight = sunlit;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloor;\nuniform float uCausticTime;\n'
        + 'uniform float uCausticLight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float t = uCausticTime;
          vec2 p = vFloor * 2.6;
          float light = 0.0;
          for (int k = 0; k < 2; k++) {
            vec2 q = p + 0.7 * vec2(sin(p.y * 1.3 + t * 0.9), cos(p.x * 1.1 - t * 0.7));
            float web = abs(sin(q.x * 2.2 + sin(q.y * 1.7 + t)) * sin(q.y * 2.4 + sin(q.x * 1.5 - t * 0.8)));
            light += pow(1.0 - web, 7.0);
            p = p * 1.6 + vec2(1.7, 9.2);
            t *= 1.3;
          }
          totalEmissiveRadiance += diffuseColor.rgb * light * 0.35 * uCausticLight;
        }`);
  };
  m.customProgramCacheKey = () => 'fountain-caustics';
  return seeThrough(m, 'propFoot');
}

/** Falling water: white streaks of a picture, see-through between them, scrolled along a shell (`around` times round),
 *  `opacity` at its whitest. */
function fallingWater(streaks: THREE.Texture, around: number, opacity: number): THREE.MeshStandardMaterial {
  const map = streaks.clone();
  map.repeat.set(around, 1);
  map.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    color: 0xdfeef2, emissive: FALLING_GLOW, roughness: 0.85, alphaMap: map, transparent: true, opacity, depthWrite: false,
    side: THREE.DoubleSide,
  });
  if (WEBGPU) {
    const sky = skyLight;
    (m as typeof m & OwnLooks).webgpuLooks = (converted) => fallingNodes(converted, sky);
    return seeThrough(m, 'prop');
  }
  m.onBeforeCompile = mirroredSky;
  m.customProgramCacheKey = () => 'fountain-falling';
  // (a hero behind the fountain showed through its stone, its water left whole over him)
  return seeThrough(m, 'prop');
}

/** The falling water's streaks: thin threads down a tile, feathered across, each broken into runs that fade in and out
 *  along it, of its own strength; dark (see-through) between them. */
function streakTexture(): THREE.Texture {
  // (at half this, threads two to four texels wide, the curtains read as smeared white over the bowls)
  const width = 256, height = 512;
  const c = canvasOf(width, height), x = ctx2d(c);
  const rng = mulberry(77);
  x.fillStyle = '#000';
  x.fillRect(0, 0, width, height);
  for (let k = 0; k < 150; k++) {
    const at = rng() * width, wide = 0.8 + rng() * 1.8, bright = 40 + rng() * 170;
    for (let from = rng() * height, runs = 0; runs < 3; runs++) {
      const long = 60 + rng() * 220;
      for (const shift of [-height, 0, height]) streak(x, at, from + shift, wide, long, bright);
      from += long + 20 + rng() * 120;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The foam's picture, laid flat over the ring round the falling water: soft white flecks, thickest at the ring's inner
 *  edge (the middle of the picture), thinning out. */
function foamTexture(): THREE.Texture {
  const size = 256, c = canvasOf(size), x = ctx2d(c);
  const rng = mulberry(91);
  x.fillStyle = '#000';
  x.fillRect(0, 0, size, size);
  const inner = size / 2 * (BOWL.r + 0.12) / (BOWL.r + 0.75);
  // (a haze where the curtain strikes, thinning out: flecks alone, up to 5 px, read as a ring of white dots)
  const haze = x.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
  haze.addColorStop(0, 'rgba(200, 200, 200, 0.55)');
  haze.addColorStop(0.35, 'rgba(120, 120, 120, 0.2)');
  haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
  x.fillStyle = haze;
  x.fillRect(0, 0, size, size);
  for (let k = 0; k < 1400; k++) {
    const a = rng() * Math.PI * 2, out = Math.pow(rng(), 2.2), d = inner + out * (size / 2 - inner);
    const r = 0.8 + rng() * 1.8 * (1 - out), bright = Math.round(255 * (1 - out * 0.8));
    const fleck = x.createRadialGradient(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, 0,
      size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, r);
    fleck.addColorStop(0, `rgba(${bright}, ${bright}, ${bright}, 0.6)`);
    fleck.addColorStop(1, `rgba(${bright}, ${bright}, ${bright}, 0)`);
    x.fillStyle = fleck;
    x.fillRect(size / 2 + Math.cos(a) * d - r, size / 2 + Math.sin(a) * d - r, r * 2, r * 2);
  }
  return new THREE.CanvasTexture(c);
}

/** One run of a thread of water: `wide` px across at `at`, from `from` down `long` px, fading in and out at its ends. */
function streak(x: CanvasRenderingContext2D, at: number, from: number, wide: number, long: number, bright: number): void {
  const along = x.createLinearGradient(0, from, 0, from + long);
  const lit = `rgba(${bright}, ${bright}, ${bright}`;
  along.addColorStop(0, `${lit}, 0)`);
  along.addColorStop(0.25, `${lit}, 1)`);
  along.addColorStop(0.75, `${lit}, 1)`);
  along.addColorStop(1, `${lit}, 0)`);
  x.fillStyle = along;
  x.fillRect(at, from, wide, long);
  x.fillStyle = `${lit}, 0.35)`;
  x.fillRect(at - 1, from + long * 0.2, wide + 2, long * 0.6);
}
