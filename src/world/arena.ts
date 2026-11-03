// The arena: every biome is built once at boot into its own group, and switching
// shows one and hides the others (instant, and no shader compiles). The hemisphere
// light and the shadow-casting moon are shared; the active biome sets their look. The hall of heroes' room
// (`heroHall.ts`) is built beside them and shown in their place while the hero selection screen is up.
import * as THREE from 'three';
import { ARENA } from '../data/balance';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { groundHeight, setRelief } from './ground';
import { setAdaptScale } from '../core/renderer';
import { oneEnvironment, rigPointLights, stillForMeshlets } from '../core/webgpu';
import { castBreakablesAsOne, type BreakableShadows } from './breakableShadows';
import { bakeStaticShadows, compileEnvMaps as compileEach, drawStillShadows, envMap, type Biome, type BiomeBuilder, type BiomeLook } from './props';
import { cullWhileDrawn, trimShadowCasters } from './culling';
import { buildCrypt, CRYPT_ENV } from './crypt';
import { buildForest, FOREST_ENV } from './forest';
import { buildHeroHall } from './heroHall';
import { restoreProps, state as propState } from './destructible';
import { emit } from '../events';
import { G } from '../state';
import { stumpPreloaded } from './stump';

export { groundHeight };
export type { Portal } from './props';

const BUILDERS: Record<BiomeId, BiomeBuilder> = { crypt: buildCrypt, forest: buildForest };

export type Arena = Awaited<ReturnType<typeof buildArena>>;

/** Every biome's environment's programs compiled ahead of the biomes, linked as they're built (`compileEnvMaps`). */
export const compileEnvMaps = (renderer: THREE.WebGLRenderer): void => compileEach(renderer, [CRYPT_ENV, FOREST_ENV]);

/** The moon's shadow camera as it's placed for a biome's `look` (the box it draws round the middle). */
function shadowCameraFor(moon: THREE.DirectionalLight, look: BiomeLook): THREE.OrthographicCamera {
  const camera = moon.shadow.camera.clone();
  camera.position.set(...look.moon.pos);
  camera.lookAt(moon.target.position);
  camera.updateProjectionMatrix();
  return camera;
}

export async function buildArena(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const hemi = new THREE.HemisphereLight();
  const moon = new THREE.DirectionalLight();
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(4096, 4096);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -34; sc.right = sc.top = 34; sc.near = 1; sc.far = 90;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  scene.add(hemi, moon, moon.target);
  cullWhileDrawn(scene, renderer);
  const fog = scene.fog = new THREE.Fog(0);

  const biomes = {} as Record<BiomeId, { group: THREE.Group; b: Biome; breakables: BreakableShadows }>;
  // (what a worker sculpts for a biome meanwhile: the forest's stump)
  await stumpPreloaded();
  for (const id of BIOME_IDS) {
    // one biome at a time, letting the page paint between them (a window moved to another
    // monitor stays black until the main thread is free)
    await new Promise((r) => setTimeout(r));
    const group = new THREE.Group();
    group.name = id;
    const b = BUILDERS[id](group);
    b.wall.seal();
    bakeStaticShadows(group);
    const breakables = castBreakablesAsOne(group);
    trimShadowCasters(group, shadowCameraFor(moon, b.look));
    group.visible = false;
    scene.add(group);
    biomes[id] = { group, b, breakables };
  }
  // (the hall of heroes' room, shown in the biomes' place while the hero selection screen is up: `showHall`)
  const hallGroup = new THREE.Group();
  hallGroup.name = 'hall';
  const hall = buildHeroHall(hallGroup);
  bakeStaticShadows(hallGroup);
  trimShadowCasters(hallGroup, shadowCameraFor(moon, hall.look));
  hallGroup.visible = false;
  scene.add(hallGroup);
  // (on WebGPU their point lights are drawn by one rig: its lit pipelines are keyed by its lights' ids)
  rigPointLights(scene, [...BIOME_IDS.map((id) => biomes[id].group), hallGroup]);
  stillForMeshlets(...BIOME_IDS.map((id) => biomes[id].group), hallGroup);
  if (import.meta.env.DEV) {
    const groups = [...BIOME_IDS.map((id) => biomes[id].group), hallGroup];
    const lights = groups.map((g) => { let n = 0; g.traverse((o) => { if ((o as THREE.PointLight).isPointLight) n++; }); return n; });
    if (new Set(lights).size > 1) console.error(`Biomes must have the same number of point lights (switching recompiles every shader): ${lights}`);
    // (and as many casting: each is written out in every lit program, `loopPointLights`)
    const casting = groups.map((g) => {
      let n = 0;
      g.traverse((o) => { if ((o as THREE.PointLight).isPointLight && o.castShadow) n++; });
      return n;
    });
    if (new Set(casting).size > 1) console.error(`Biomes must have as many point lights casting shadows: ${casting}`);
  }

  let biome: BiomeId = BIOME_IDS[0];
  let active = biomes[biome].b;
  /** the biome and the props' revision its still shadows were last drawn for (`drawStillShadows`) */
  const stillDrawn = { biome: null as BiomeId | 'hall' | null, rev: -1 };
  /** whether the hall of heroes stands in the biomes' place */
  let hallShown = false;

  function setBiome(id: BiomeId): void {
    const changed = id !== biome;
    biome = id;
    active = biomes[id].b;
    // (chosen while the hall is up, a co-op host's pick: shown as it's taken down)
    if (!hallShown) showBiome();
    if (changed) emit('biomeChanged', id);
  }
  function showBiome(): void {
    setRelief(active.relief ?? null);
    for (const k of BIOME_IDS) biomes[k].group.visible = k === biome;
    hallGroup.visible = false;
    setLook(active.look);
  }
  function setLook(L: BiomeLook): void {
    (scene.background as THREE.Color).set(L.background);
    fog.color.set(L.fog.color); fog.near = L.fog.near; fog.far = L.fog.far;
    hemi.color.set(L.hemi.sky); hemi.groundColor.set(L.hemi.ground); hemi.intensity = L.hemi.intensity;
    moon.color.set(L.moon.color); moon.intensity = L.moon.intensity; moon.position.set(...L.moon.pos);
    scene.environment = envMap(renderer, L.env);
    oneEnvironment(scene);
    scene.environmentIntensity = L.envIntensity;
    setAdaptScale(L.adapt ?? 1);
  }
  setBiome(biome);

  return {
    get biome() { return biome; },
    /** whether the hall of heroes is shown in the biomes' place (its stage has no props; `obstacles` stay the biome's) */
    get hallShown() { return hallShown; },
    get obstacles() { return active.obstacles; },
    /** the breakable ones (`world/destructible.ts`) */
    get props() { return active.props; },
    /** every biome's props whole again (a new run, the lobby) */
    restoreProps() { for (const id of BIOME_IDS) restoreProps(biomes[id].b.props); },
    /** every biome's run-shaped props built again from a run's seed (`Biome.roll`) */
    rollProps(seed: number) {
      for (const id of BIOME_IDS) biomes[id].b.roll?.(seed);
      // (their circles' heights and girths: the navigation's grid made again)
      propState.rev++;
    },
    /** spawn gates: {pos, dir (into the arena), pulse()} */
    get portals() { return active.portals; },
    /** the wall as drawn, which bodies walk up to and what flies meets (`world/wall.ts`) */
    get wall() { return active.wall; },
    moon,
    radius: ARENA.radius,
    groundHeight,
    setBiome,
    /** The hall of heroes shown in the biomes' place (`on`), or the biome back: its plinths the floor's relief, its
     *  look the scene's. Its lights are as many as a biome's, so the switch compiles nothing. */
    showHall(on: boolean) {
      hallShown = on;
      if (!on) { showBiome(); return; }
      for (const k of BIOME_IDS) biomes[k].group.visible = false;
      hallGroup.visible = true;
      setRelief(hall.relief);
      setLook(hall.look);
    },
    /** the hall of heroes' room (hidden but while it's shown): what the heroes' warm-up shows */
    hallGroup,
    /** a biome's own pieces (hidden while another is shown): what the warm-up leaves out or shows */
    groupOf(id: BiomeId): THREE.Group { return biomes[id].group; },
    setCalm(v: number) { for (const id of BIOME_IDS) biomes[id].b.setCalm(v); },
    update(dt: number, t: number) {
      const shown = hallShown ? 'hall' : biome;
      if (hallShown) hall.update(dt, t); else active.update(dt, t);
      // (the still shadows of its warmest lights, drawn again when what stands in it changed: shown, broken, rolled)
      if (stillDrawn.biome !== shown || stillDrawn.rev !== propState.rev) {
        // (and its breakables' shadows cast as one, each standing prop's: `world/breakableShadows.ts`)
        if (!hallShown) biomes[biome].breakables.refresh();
        drawStillShadows(renderer, scene, G.camera, hallShown ? hallGroup : biomes[biome].group, moon.shadow);
        stillDrawn.biome = shown;
        stillDrawn.rev = propState.rev;
      }
    },
  };
}
