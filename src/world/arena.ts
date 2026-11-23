// The arena: every place is built once into its own group, and switching shows one and hides the others (instant,
// and no shader compiles): the village the lobby stands in (`village.ts`), and each biome a run is fought in. The
// village is built at boot, a fight's biome as a run first needs it,
// under the fight's loading bar (`buildBiome`, game/biomeReady.ts: on a phone the two fight biomes' builds and seals
// were tasks of 2 to 5 s each before the lobby showed, traces S307-J274, HHKG-FKD9).
// The hall of heroes' room (`heroHall.ts`) is built beside them and shown in the village's place while the hero
// selection screen is up (the hall on the village's terrace is its door).
// The hemisphere light and the shadow-casting moon are shared; the place shown sets their look, the village's by the
// hour (`setHour`).
import * as THREE from 'three';
import { ARENA } from '../data/balance';
import { BIOME_IDS, type BiomeId, type PlaceId } from '../data/biomes';
import { groundHeight, setRelief } from './ground';
import { setAdaptScale } from '../core/renderer';
import { rigMorePointLights, rigPointLights } from '../core/webgpu';
import { castBreakablesAsOne, type BreakableShadows } from './breakableShadows';
import { bakeStaticShadows, compileEnvMaps as compileEach, drawStillShadows, envMap, lampFaceDrawn, lampShadowsAsked, mergeStill, nextLampFace, type Biome, type BiomeBuilder, type BiomeLook } from './props';
import { countGhosts, depthOfWhatStaysWhole } from '../core/seeThrough';
import { GHOST_COUNT_LAYER } from '../core/layers';
import { cullWhileDrawn, trimShadowCasters } from './culling';
import { packWhileDrawn } from '../core/lightBounds';
import { holdMoonShadow } from './moonShadow';
import { hallDoorway } from './hallPortal';
import { addDoorway, cullByDoorways } from './doorways';
import { buildCrypt, CRYPT_ENV } from './crypt';
import { buildForest, FOREST_ENV } from './forest';
import { villageSteps, VILLAGE_ENV, type Village } from './village';
import { builtInSlices } from '../entities/models/steps';
import { buildHeroHall } from './heroHall';
import { buildRooms } from './houses';
import { mergeRoom } from './rooms';
import type { RoomId } from '../data/houses';
import { restoreProps, state as propState } from './destructible';
import { emit } from '../events';
import { G } from '../state';
import { stumpPreloaded } from './stump';
import type { Seat } from './seats';

export { groundHeight };
export type { Portal } from './props';

const BUILDERS: Record<BiomeId, BiomeBuilder> = { crypt: buildCrypt, forest: buildForest };

/** A biome's build told how far along it will be once the step about to run is done (0 to 1), and how long that step
 *  is guessed to take (ms): game/biomeReady.ts glides the fight's bar through it. */
export type BuildStep = (share: number, glideMs: number) => void;
/** how far a biome's build is once each step is done: the builder, the wall's seal, the shadows' bake */
/** A biome's build against the village's, and its seal and its bake against its build, from the arena's measures
 *  (`arena <place> <step>`, `tools/stalls/walks/barClimb.js`: the crypt's build 182 ms against the village's 414, its
 *  seal 21 and its bake 8; the forest's seal reads its thicket's rocks and bushes by their hulls, about 8 times the
 *  crypt's, `src/world/AGENTS.md`'s wall). */
const BIOME_OF_VILLAGE = 0.45;
const SEAL_OF_BUILD: Record<BiomeId, number> = { crypt: 0.12, forest: 0.5 };
const BAKE_OF_BUILD = 0.05;
/** How far biome `id`'s build is once each step is done (0 to 1): the builder, the wall's seal, the shadows' bake. */
function buildSteps(id: BiomeId): { build: number; seal: number; bake: number } {
  const whole = 1 + SEAL_OF_BUILD[id] + BAKE_OF_BUILD;
  return { build: 1 / whole, seal: (1 + SEAL_OF_BUILD[id]) / whole, bake: 1 };
}

export type Arena = Awaited<ReturnType<typeof buildArena>>;

/** Every place's environment's programs compiled ahead of the places, linked as they're built (`compileEnvMaps`). */
export const compileEnvMaps = (renderer: THREE.WebGLRenderer): void => compileEach(renderer, [VILLAGE_ENV, CRYPT_ENV, FOREST_ENV]);

/** how finely the sun's place is read for its kept shadow to be drawn again (a step's 1/n m, of its 60 m off or so) */
const SUN_STEPS = 8;

/** The moon's shadow camera as it's placed for a biome's `look` (the box it draws round the middle). */
function shadowCameraFor(moon: THREE.DirectionalLight, look: BiomeLook): THREE.OrthographicCamera {
  const camera = moon.shadow.camera.clone();
  camera.position.set(...look.moon.pos);
  camera.lookAt(moon.target.position);
  camera.updateProjectionMatrix();
  return camera;
}

/** The hour the village is lit for before anyone sets it (a dusk) */
const FIRST_HOUR = 18.5;

/** The next task once the browser has painted a frame (or 50 ms on, where it paints none: a hidden tab). */
export const painted = (): Promise<void> => new Promise((resolve) => {
  const fallback = setTimeout(resolve, 50);
  requestAnimationFrame(() => {
    clearTimeout(fallback);
    setTimeout(resolve);
  });
});

/** the most of the village's build run in one task before the boot paints a frame (ms) */
const VILLAGE_SLICE_MS = 40;

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
  // (each point light's reach packed for the shaders' loop, before each render: `core/lightBounds.ts`)
  packWhileDrawn(scene);
  const fog = scene.fog = new THREE.Fog(0);

  /** the places built (a fight's biome once a run first needs it: `buildBiome`) */
  const places = {} as Partial<Record<PlaceId, { group: THREE.Group; b: Biome; breakables?: BreakableShadows }>>;
  /** place `id`, which must be built */
  const placeOf = (id: PlaceId) => {
    const place = places[id];
    if (!place) throw new Error(`arena: ${id} wanted before it was built (game/biomeReady.ts readies it)`);
    return place;
  };
  /** the fight's biomes built so far */
  const builtBiomes = (): BiomeId[] => BIOME_IDS.filter((id) => places[id]);
  /** Biome `id` built into its group and put in the scene, hidden. */
  async function buildPlace(id: BiomeId, step: BuildStep = () => undefined): Promise<void> {
    // (what a worker sculpts for a biome meanwhile: the forest's stump)
    await stumpPreloaded();
    // one place at a time, letting the page paint between them (a window moved to another monitor stays black until
    // the main thread is free), and between its build and its wall's seal (on a phone the arena's build froze the
    // loading screen 1 s at a time: on a CPU slowed six times the crypt's build was 3 s, the walls' seals 3.7); each
    // step told before it, with its guessed time, so the fight's bar glides through it (game/biomeReady.ts)
    const steps = buildSteps(id);
    step(steps.build, guessMs());
    await painted();
    const group = new THREE.Group();
    group.name = id;
    let at = performance.now();
    const b = BUILDERS[id](group);
    // (the seal and the bake guessed from the build's own time on this device)
    const buildMs = performance.now() - at;
    performance.measure(`arena ${id} build`, { start: at });
    step(steps.seal, buildMs * SEAL_OF_BUILD[id]);
    await painted();
    at = performance.now();
    b.wall.seal();
    performance.measure(`arena ${id} seal`, { start: at });
    step(steps.bake, buildMs * BAKE_OF_BUILD);
    await painted();
    at = performance.now();
    bakeStaticShadows(group);
    const breakables = castBreakablesAsOne(group);
    trimShadowCasters(group, shadowCameraFor(moon, b.look));
    performance.measure(`arena ${id} bake`, { start: at });
    group.visible = false;
    group.matrixAutoUpdate = false;
    b.setCalm(calm);
    scene.add(group);
    places[id] = { group, b, breakables };
  }
  /** the village's build on this device (ms), the guess at a biome's before one is built (`guessMs`) */
  let villageBuildMs = 0;
  /** How long a biome's builder is guessed to take (ms), from the village's build on this device. */
  const guessMs = (): number => villageBuildMs * BIOME_OF_VILLAGE;
  /** how calm the biomes are (`setCalm`): one built later takes it */
  let calm = 1;
  // (the village is built at boot; a fight's biome as a run first needs it, `buildBiome`)
  await painted();
  const villageGroup = new THREE.Group();
  villageGroup.name = 'village';
  const villageAt = performance.now();
  // (its pieces in tasks of their own, a frame painted between once a slice has gone: `villageSteps`; its build's
  // time the pieces' alone, the guess at a biome's built from it, `guessMs`)
  let paused = 0;
  const pause = async (): Promise<void> => {
    const from = performance.now();
    await painted();
    paused += performance.now() - from;
  };
  const village: Village = await builtInSlices(villageSteps(villageGroup), pause, VILLAGE_SLICE_MS);
  villageBuildMs = performance.now() - villageAt - paused;
  performance.measure('arena village build', { start: villageAt });
  await painted();
  village.wall.seal();
  await painted();
  // (its casters aren't trimmed to a shadow camera: the sun goes round it with the hour)
  bakeStaticShadows(villageGroup);
  mergeStill(villageGroup);
  depthOfWhatStaysWhole(villageGroup);
  countGhosts(villageGroup, GHOST_COUNT_LAYER);
  villageGroup.visible = false;
  villageGroup.matrixAutoUpdate = false;
  scene.add(villageGroup);
  addDoorway(hallDoorway(village.hallCutaway));
  cullByDoorways(scene, villageGroup);
  places.village = { group: villageGroup, b: village };
  // (the hall of heroes' room, shown in the village's place while the hero selection screen is up: `showHall`)
  const hallGroup = new THREE.Group();
  hallGroup.name = 'hall';
  const hall = buildHeroHall(hallGroup);
  bakeStaticShadows(hallGroup);
  trimShadowCasters(hallGroup, shadowCameraFor(moon, hall.look));
  hallGroup.visible = false;
  // (none of the places moves: a matrix made again each frame marks all under it changed, `standStill` in props.ts)
  hallGroup.matrixAutoUpdate = false;
  scene.add(hallGroup);
  // (the village's houses walked into, each a room shown in its place: `showRoom`)
  const rooms = await buildRooms(painted);
  for (const r of Object.values(rooms)) {
    await painted();
    bakeStaticShadows(r.group);
    trimShadowCasters(r.group, shadowCameraFor(moon, r.look));
    mergeRoom(r.group);
    r.group.visible = false;
    r.group.matrixAutoUpdate = false;
    r.group.updateMatrixWorld(true);
    scene.add(r.group);
  }
  const roomGroups = Object.values(rooms).map((r) => r.group);
  // (on WebGPU their point lights are drawn by one rig: its lit pipelines are keyed by its lights' ids)
  const groups = [...Object.values(places).map((place) => place.group), hallGroup, ...roomGroups];
  rigPointLights(scene, groups);
  /** Whether `groups` have as many point lights each, and as many casting (dev builds: a mismatch says so). */
  function checkLights(groups: THREE.Group[]): void {
    const lights = groups.map((g) => { let n = 0; g.traverse((o) => { if ((o as THREE.PointLight).isPointLight) n++; }); return n; });
    if (new Set(lights).size > 1) console.error(`Places must have the same number of point lights (switching recompiles every shader): ${lights}`);
    // (and as many casting: each is written out in every lit program, `loopPointLights`; the village's own two count
    // by night too, when they hand their shadows to the pool's lights lit at the lamps, outside its group, and the
    // scene casts as many: `castFromLamps` in game/village.ts. Counted as they stood, a run's biome built at night
    // said they differed, and every lab command that set a run up in the evening failed on it)
    const handed = new Set<THREE.Object3D>(village.stillLights);
    const casting = groups.map((g) => {
      let n = 0;
      g.traverse((o) => { if ((o as THREE.PointLight).isPointLight && (o.castShadow || handed.has(o))) n++; });
      return n;
    });
    if (new Set(casting).size > 1) console.error(`Places must have as many point lights casting shadows: ${casting}`);
  }
  if (import.meta.env.DEV) checkLights(groups);

  /** the biomes being built, each its build (`buildBiome`) */
  const building = new Map<BiomeId, Promise<void>>();
  /** Biome `id` built, as a run first needs it (game/biomeReady.ts), its place rigged and checked as the boot's are. */
  function buildBiome(id: BiomeId, step?: BuildStep): Promise<void> {
    if (places[id]) return Promise.resolve();
    let build = building.get(id);
    if (!build) {
      build = buildPlace(id, step).then(() => {
        const group = placeOf(id).group;
        rigMorePointLights(group);
        if (import.meta.env.DEV) checkLights([placeOf('village').group, group]);
      }).finally(() => building.delete(id));
      building.set(id, build);
    }
    return build;
  }

  /** the run's biome (the one a portal or a co-op host chose), and the place shown */
  let biome: BiomeId = BIOME_IDS[0];
  let shown: PlaceId = 'village';
  let active = placeOf(shown).b;
  /** the place and the props' revision its still shadows were last drawn for (`drawStillShadows`) */
  const stillDrawn = { place: null as PlaceId | 'hall' | RoomId | null, rev: -1, lamps: 0, sun: '' };
  /** the props' revision each place's breakables' shadows were last made at: in a frame's update they're made in one
   *  frame and the still shadows drawn in the next (in one, a run's start held its frame up 24 ms for both) */
  const breakablesAt = new Map<PlaceId, number>();
  /** whether the hall of heroes' room stands in the place's stead */
  let hallShown = false;
  /** the house's room standing in the village's stead, if one does (`showRoom`) */
  let room: RoomId | null = null;
  /** what's drawn now in the place's stead, or the place */
  const shownGroup = (): THREE.Group => (room ? rooms[room].group : hallShown ? hallGroup : placeOf(shown).group);
  /** Every place's group built, the hall's room and the houses' rooms: what may stand where the player is. */
  const everyPlace = (): THREE.Group[] => [
    ...Object.values(places).map((place) => place!.group), hallGroup, ...Object.values(rooms).map((r) => r.group),
  ];
  /**
   * What's wrong with what the frame is about to draw where the player stands: every place but the one shown
   * (`shownGroup`) hidden, and that one shown. A warm-up drawing another place in its stead put back what it never
   * found (#746: the village drawn under Odo's shop, its fountain in the room, the shop's own furniture gone).
   */
  function placesWrong(): string[] {
    const want = shownGroup();
    const wrong = everyPlace().filter((group) => group.visible !== (group === want));
    return wrong.map((group) => `${group.name || 'a room'} ${group.visible ? 'shown' : 'hidden'}`);
  }
  /** the last wrong state said (dev builds: each said once, as it comes) */
  let saidWrong = '';
  /** Dev builds: what the frame will draw checked to be the shown place alone, an error logged as it goes wrong (every
   *  lab command fails on one, so each of them checks it). */
  function checkPlaces(): void {
    const wrong = placesWrong().join(', ');
    if (wrong && wrong !== saidWrong) {
      console.error(`arena: ${wrong} where ${shownGroup().name || 'a room'} alone should show (a place put back wrong)`);
    }
    saidWrong = wrong;
  }
  /** the village's look now (`setHour`: it changes with the hour, applied every frame while it's shown) */
  const villageLook: BiomeLook = { ...village.look };
  let hour = FIRST_HOUR;

  /** `id` the run's biome (shown if a run is on: the lobby stands in the village). */
  function setBiome(id: BiomeId): void {
    const changed = id !== biome;
    biome = id;
    if (shown !== 'village') show(id);
    if (changed) emit('biomeChanged', id);
  }
  function show(place: PlaceId): void {
    shown = place;
    active = placeOf(place).b;
    // (chosen while the hall is up, a co-op host's pick: shown as it's taken down)
    if (hallShown || room) return;
    setRelief(active.relief ?? null);
    for (const k of Object.keys(places) as PlaceId[]) placeOf(k).group.visible = k === place;
    hallGroup.visible = false;
    if (place === 'village') village.daylight(hour, villageLook);
    setLook(place === 'village' ? villageLook : active.look);
  }
  function setLook(L: BiomeLook): void {
    setColours(L);
    scene.environment = envMap(renderer, L.env);
  }
  /** what of a look changes with the hour: everything but its environment's map */
  function setColours(L: BiomeLook): void {
    (scene.background as THREE.Color).set(L.background);
    fog.color.set(L.fog.color); fog.near = L.fog.near; fog.far = L.fog.far;
    hemi.color.set(L.hemi.sky); hemi.groundColor.set(L.hemi.ground); hemi.intensity = L.hemi.intensity;
    moon.color.set(L.moon.color); moon.intensity = L.moon.intensity; moon.position.set(...L.moon.pos);
    scene.environmentIntensity = L.envIntensity;
    setAdaptScale(L.adapt ?? 1);
  }
  show(shown);

  return {
    /** the run's biome */
    get biome() { return biome; },
    /** the place shown: the village (the lobby), or the run's biome */
    get place(): PlaceId { return shown; },
    get obstacles() { return room ? rooms[room].obstacles : active.obstacles; },
    /** what a hero sits on (a house's room's while it's shown, none while the hall is) */
    get seats(): readonly Seat[] { return hallShown ? [] : room ? rooms[room].seats : active.seats ?? []; },
    /** every place's and room's seats, shown or not (their outlines warmed at load) */
    allSeats(): Seat[] {
      const inPlaces = (Object.values(places) as { b: Biome }[]).flatMap((p) => p.b.seats ?? []);
      return [...inPlaces, ...Object.values(rooms).flatMap((r) => r.seats)];
    },
    /** what an idle hero sits on in place `id`, shown or not */
    seatsOf(id: PlaceId): readonly Seat[] { return places[id]?.b.seats ?? []; },
    /** the breakable ones (`world/destructible.ts`) */
    get props() { return active.props; },
    /** every biome's props whole again (a new run, the lobby) */
    restoreProps() { for (const id of builtBiomes()) restoreProps(placeOf(id).b.props); },
    /** One more piece of every biome's run-shaped props for `seed` built ahead (`Biome.rollAhead`): true once all
     *  are. */
    rollAhead(seed: number): boolean {
      return builtBiomes().every((id) => placeOf(id).b.rollAhead?.(seed) ?? true);
    },
    /** every biome's run-shaped props built again from a run's seed (`Biome.roll`) */
    rollProps(seed: number) {
      for (const id of builtBiomes()) placeOf(id).b.roll?.(seed);
      // (their circles' heights and girths: the navigation's grid made again)
      propState.rev++;
    },
    /** spawn gates: {pos, dir (into the arena), pulse()} */
    get portals() { return active.portals; },
    /** the wall as drawn, which bodies walk up to and what flies meets (`world/wall.ts`) */
    get wall() { return room ? rooms[room].wall : active.wall; },
    moon,
    radius: ARENA.radius,
    groundHeight,
    setBiome,
    /** The village shown (the lobby), or the run's biome (`on` false). Each has as many lights, so it compiles nothing. */
    showVillage(on: boolean) {
      // (a run's start takes the hero out of a house's room: the run's biome shown in its stead at once)
      if (!on && room) {
        rooms[room].group.visible = false;
        room = null;
        emit('roomShown', null);
      }
      show(on ? 'village' : biome);
    },
    /** whether the hall of heroes' room is shown in the place's stead (its stage has no props; `obstacles` stay the
     *  place's) */
    get hallShown() { return hallShown; },
    /** The hall of heroes' room shown in the place's stead (`on`), or the place back: its plinths the floor's relief,
     *  its look the scene's. Its lights are as many as a place's, so the switch compiles nothing. */
    showHall(on: boolean) {
      hallShown = on;
      if (!on) { show(shown); return; }
      for (const k of Object.keys(places) as PlaceId[]) placeOf(k).group.visible = false;
      hallGroup.visible = true;
      setRelief(hall.relief);
      setLook(hall.look);
      emit('hallShown');
    },
    /** the hall of heroes' room (hidden but while it's shown): what the heroes' warm-up shows */
    hallGroup,
    /** the house's room shown in the village's stead (null: none) */
    get room(): RoomId | null { return room; },
    /** The house's room `id` shown in the village's stead, or the village back (null): its floor the relief, its look
     *  the scene's, its wall and circles what bodies meet. Its lights are as many as a place's, so it compiles nothing. */
    showRoom(id: RoomId | null) {
      if (id === room) return;
      if (room) rooms[room].group.visible = false;
      room = id;
      if (!id) { show(shown); emit('roomShown', null); return; }
      for (const k of Object.keys(places) as PlaceId[]) placeOf(k).group.visible = false;
      hallGroup.visible = false;
      rooms[id].group.visible = true;
      setRelief(rooms[id].relief);
      setLook(rooms[id].look);
      emit('roomShown', id);
    },
    /** the houses' rooms as built */
    rooms,
    /** the village as built: its portals' ways out, its chest */
    village,
    /** The hour the village is lit for (0-24: the player's clock, or a co-op host's). */
    setHour(h: number) { hour = h; },
    /** a place's own pieces (hidden while another is shown): what the warm-up leaves out or shows */
    groupOf(id: PlaceId): THREE.Group { return placeOf(id).group; },
    /** what stands where the player is now: a house's room, the hall of heroes' room or the place shown */
    shownGroup,
    /** what's wrong with which places are shown, read as the frame would draw them (none: the shown one alone) */
    placesWrong,
    /** whether biome `id` is built (a run's biome is built as a run first needs it) */
    biomeBuilt(id: BiomeId): boolean { return Boolean(places[id]); },
    buildBiome,
    setCalm(v: number) {
      calm = v;
      for (const id of builtBiomes()) placeOf(id).b.setCalm(v);
    },
    update(dt: number, t: number) {
      if (import.meta.env.DEV) checkPlaces();
      if (room) rooms[room].update(dt, t);
      else if (hallShown) hall.update(dt, t); else active.update(dt, t);
      if (shown === 'village' && !hallShown && !room) {
        village.daylight(hour, villageLook);
        setColours(villageLook);
      }
      // (the still shadows of its warmest lights, drawn again when what stands in it changed: shown, broken, rolled)
      const now = room ?? (hallShown ? 'hall' : shown);
      // (and a lamp's, as it takes a casting light: `lampShadow`)
      const lamps = lampShadowsAsked();
      // (and the sun's where it's kept: as it goes round, a redraw every 20 s or so)
      const held = holdMoonShadow(moon, now === 'village');
      const sun = now === 'village' ? moon.position.toArray().map((v) => Math.round(v * SUN_STEPS)).join() : '';
      // (each drawn again only when it changed: the sun's step drew the lights' twelve to twenty-four cube faces
      // with its own map, and a lamp's hand-over the sun's 4 million triangles, a hitch every 20 s and at every lamp
      // he walked past by night, from play "FPS is not stable, even on high end hardware")
      const all = held || stillDrawn.place !== now || stillDrawn.rev !== propState.rev;
      const lampsMoved = stillDrawn.lamps !== lamps, sunMoved = stillDrawn.sun !== sun;
      if (all || lampsMoved || sunMoved) {
        // (and its breakables' shadows cast as one, each standing prop's, a frame before: `world/breakableShadows.ts`)
        if (!hallShown && !room && breakablesAt.get(shown) !== propState.rev) {
          placeOf(shown).breakables?.refresh();
          breakablesAt.set(shown, propState.rev);
          return;
        }
        drawStillShadows(renderer, scene, G.camera, shownGroup(), moon.shadow,
          { lights: all || lampsMoved, sun: all || sunMoved });
        stillDrawn.place = now;
        stillDrawn.rev = propState.rev;
        stillDrawn.lamps = lamps;
        stillDrawn.sun = sun;
        return;
      }
      // (a lamp's cube at the lamp its light moved to, a face a frame: `drawLampShadows`)
      const next = nextLampFace();
      if (next) {
        drawStillShadows(renderer, scene, G.camera, shownGroup(), moon.shadow,
          { lights: [next.light], sun: false, face: next.face });
        lampFaceDrawn(next.light, next.face);
      }
    },
    /** The sun's still shadow drawn again at the next frame: its map was made anew, or it's the still world's now. */
    sunShadowChanged(): void {
      stillDrawn.sun = 'changed';
    },
    /** The still shadows drawn again by the next update, the sun's too where it's the still world's: what casts them
     *  changed with no prop broken or rolled (the developer mode's trees taken out of what's drawn,
     *  `src/dev/trees.ts`). */
    stillShadowsChanged(): void {
      stillDrawn.place = null;
    },
  };
}
