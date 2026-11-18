// The Ember & Oak's keeper at work (world/rooms.ts builds the tavern and calls this; data/tavern.ts has where and how
// long): Bertram Tunwell behind his bar (entities/models/keeper.ts), a cask lying on the bar with its brass tap before
// him, and his ale served: asked for in a talk, he fills a mug under the tap (the ale running from it), sets it down
// and slides it across, and it glides on to the bar's front before the hero, who takes it up and drinks it
// (`Player.drinkAle`, its look the hero's model's: models/flask.ts). The mug on the bar goes as his hand takes it.
// Everything that comes and goes is drawn at no size when it isn't there, never hidden: the room's warm-up draws it.
import * as THREE from 'three';
import { G } from '../state';
import { createKit } from '../core/materials';
import { sfx } from '../core/audio';
import { buildKeeper, type Keeper, type KeeperBar } from '../entities/models/keeper';
import { buildMug, MUG } from '../entities/models/flask';
import { BAR, KEEPER_SPOT, SERVE } from '../data/tavern';
import { drum, type Build } from './rooms';
import type { Player } from '../entities/player';

/** the keeper talked to: he holds the hero in his eye (main.ts sets it as the talk card opens and closes) */
export const keeperTalk = { talking: false };

/** how long the mug glides on across the bar after his hand lets it go (s) */
const GLIDE = 0.45;
/** how far in from the bar's front edge the mug comes to rest (m) */
const REST_IN = 0.09;
/** the share of the hero's drink at which his hand has the mug (models/flask.ts `ALE_KEYS.out`) */
const TAKEN = 0.085;

/** The tavern's keeper as the room holds him: seated once the heroes' heads and hands are made, his ale served. */
export interface TavernKeeper {
  /** him built and stood behind the bar (once) */
  seat(): void;
  /** the keeper, once seated (tools/lab `tavern`) */
  keeper(): Keeper | undefined;
  /** ale asked for by `hero`: he pours a mug and slides it across, and the hero drinks it as it reaches him (or at once,
   *  a mug already waiting on the bar); false if he's busy pouring or isn't seated */
  serve(hero: Player): boolean;
  /** where the mug stands on the bar now (world), or null when there's none there */
  mugOnBar(): THREE.Vector3 | null;
}

/** The keeper, his cask and his mug added to the tavern being built (`b`); `talking` says when the hero talks to him. */
export function tavernKeeper(b: Build, talking: () => boolean): TavernKeeper {
  const { g, M } = b;
  const kit = createKit(0xffc27a);
  // (his frame: stood behind the bar, facing west across it, his left to the room's +z)
  const frame = new THREE.Group();
  frame.position.set(KEEPER_SPOT.x, 0, KEEPER_SPOT.z);
  frame.rotation.y = -Math.PI / 2;
  g.add(frame);
  frame.updateMatrixWorld(true);
  const near = KEEPER_SPOT.x - (BAR.x + BAR.half), far = KEEPER_SPOT.x - (BAR.x - BAR.half);
  const bar: KeeperBar = { top: BAR.top, near, far, tap: new THREE.Vector3(0.34, BAR.top + 0.22, near + 0.12) };
  // --- the cask on the bar at his left: lying along his way, iron-hooped, its brass tap at his end ---
  {
    const cask = drum(frame, 0.15, 0.15, 0.4, 0, 0, 0, M.oak, 16);
    cask.rotation.x = Math.PI / 2;
    cask.position.set(bar.tap.x, BAR.top + 0.17, near + 0.38);
    for (const z of [0.25, 0.38, 0.51]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.153, 0.006, 5, 24), M.iron);
      hoop.position.set(bar.tap.x, BAR.top + 0.17, near + z);
      frame.add(hoop);
    }
    // (its cradle: two chocks under it)
    for (const z of [0.26, 0.5]) {
      const chock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), M.timber);
      chock.position.set(bar.tap.x, BAR.top + 0.025, near + z);
      chock.castShadow = true;
      frame.add(chock);
    }
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.08, 10).rotateX(Math.PI / 2), M.brass);
    spout.position.set(bar.tap.x, bar.tap.y + 0.012, near + 0.16);
    frame.add(spout);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.04, 8), M.brass);
    nozzle.position.set(bar.tap.x, bar.tap.y - 0.008, bar.tap.z);
    frame.add(nozzle);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.016), M.brass);
    handle.position.set(bar.tap.x, bar.tap.y + 0.05, bar.tap.z + 0.01);
    frame.add(handle);
    b.obstacles.push({ ...worldOf(frame, bar.tap.x, near + 0.38), r: 0.2, h: BAR.top + 0.33 });
  }
  // --- the ale running from the tap as he fills a mug: a thin amber stream ---
  const ale = kit.std({ color: 0xc07a18, emissive: 0x3a1c00, emissiveIntensity: 0.4, roughness: 0.2 });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.12, 8).translate(0, -0.06, 0), ale);
  stream.position.set(bar.tap.x, bar.tap.y - 0.025, bar.tap.z);
  stream.scale.setScalar(0.001);
  // --- the mug he slides, on the bar from his hand's letting go till the hero's hand takes it ---
  const slid = buildMug(kit);
  slid.scale.setScalar(0.001);
  const restAt = new THREE.Vector3(0.02, BAR.top + MUG.foot, far - REST_IN);

  let keeper: Keeper | undefined;
  let waiting: Player | null = null, glideT = -1, onBar = false, from = new THREE.Vector3();
  const heroAt = new THREE.Vector3(), mugWorld = new THREE.Vector3();
  let wasPouring = false, released = false;

  /** the hero takes the mug off the bar and drinks, facing it */
  const handOver = (hero: Player): boolean => hero.drinkAle(frame.localToWorld(mugWorld.copy(restAt)));

  b.updaters.push((dt) => {
    if (!keeper) return;
    const me = G.player;
    keeper.update(dt, me ? heroAt.copy(me.pos) : null, talking());
    const st = keeper.serving;
    // (the tap's ale running while he fills, its sound as it starts)
    const pouring = st >= SERVE.fill[0] && st < SERVE.fill[1];
    stream.scale.setScalar(pouring ? 1 : 0.001);
    if (pouring && !wasPouring) sfx.alePour(SERVE.fill[1] - SERVE.fill[0]);
    wasPouring = pouring;
    // (his hand lets the mug go on the bar: it glides on to the bar's front, scraping)
    // (once a serving: the mug let go, glided and taken, it isn't let go again before his next)
    if (st < 0) released = false;
    const letGo = keeper.served();
    if (letGo && !released) {
      released = true;
      glideT = 0;
      onBar = true;
      from.copy(letGo).setY(BAR.top + MUG.foot);
      sfx.mugSlide(GLIDE);
    }
    if (glideT >= 0) {
      glideT += dt;
      const k = Math.min(1, glideT / GLIDE), eased = 1 - (1 - k) ** 2;
      slid.position.lerpVectors(from, restAt, eased);
      if (k >= 1) {
        glideT = -1;
        // (come to rest before him: he takes it up)
        if (waiting && handOver(waiting)) waiting = null;
      }
    }
    // (the mug on the bar till the hero's hand has it)
    const drink = me?.casting;
    if (onBar && glideT < 0 && drink?.skill.def.ale && drink.t / drink.dur >= TAKEN) onBar = false;
    slid.scale.setScalar(onBar ? 1 : 0.001);
  });

  return {
    seat() {
      if (keeper) return;
      keeper = buildKeeper(bar);
      frame.add(keeper.root);
      // (what comes and goes, added with him once the room is built: out of its baked shadows and still meshes)
      frame.add(stream, slid);
    },
    keeper: () => keeper,
    serve(hero) {
      if (!keeper) return false;
      // (a mug already waiting before him: taken up now)
      if (onBar && glideT < 0) return handOver(hero);
      if (!keeper.serve()) return false;
      waiting = hero;
      return true;
    },
    mugOnBar: () => (onBar ? slid.getWorldPosition(new THREE.Vector3()) : null),
  };
}

/** (x, z) of his frame's floor in the room's own (the obstacles' frame): turned a quarter to face west, his left the
 *  room's +z */
function worldOf(_frame: THREE.Object3D, x: number, z: number): { x: number; z: number } {
  return { x: KEEPER_SPOT.x - z, z: KEEPER_SPOT.z + x };
}
