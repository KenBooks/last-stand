// Hedgeward: a wall of sharpened stakes and bramble driven up out of the ground across the aim, facing away from the
// ranger, so it shelters him from what's beyond it. Held, its glowing outline shows where and which way it would
// stand (within reach, clear of the props, inside the arena, laid over the dais's steps); let go, it rises there.
// It is an ordinary breakable prop for as long as it stands (world/destructible.ts `raiseProp`, world/wards.ts), with
// no time of its own (a `duration` would give it one): bodies and the foes' paths keep off it, a shot flies over it
// or into it by its height as over any low prop, and every hit that wears a prop wears it, the heroes' arrows,
// blows and spells and the foes' bolts and slams, with the props' own gauge over it; a big foe walking into it
// breaks it (`trampleProps`). From the owner: "its just another prop, lets not introduce new game mechanics per
// object", "if you can destroy a marble pillar with arrows, you for sure should be able to destroy a wooden wall with
// them": no rules of its own, no life grown with the wave. As many stand as he raises ("dont see why we need a limit"),
// every one coming apart where it stands as its wave is cleared (from play: "make disappear after each wave"; every
// game hears `waveCleared`).
// Every game raises it where it was let go (the cast's point, `settle`), and its health as the fight's owner deals it
// is told to every game by where it stands (enemyAI's `ward` fx).
// In the village, where the others can't cast to break it, a partner walking into it breaks it (`touchedByPartner`,
// told to every game: net/wardTouch.ts); its caster's own touch and a fight leave it standing.
// The wall itself is entities/models/hedgeward.ts.
import * as THREE from 'three';
import { G } from '../../state';
import { on } from '../../events';
import { addEffect, shockwave } from '../../fx/effects';
import { debris, smokePuff } from '../../fx/particles';
import { rubble } from '../../fx/rubble';
import { sfx } from '../../core/audio';
import { addShake } from '../../core/renderer';
import { additive } from '../../core/materials';
import { groundHeight } from '../../world/arena';
import { floorPatch, lay } from '../../fx/floorPatch';
import { addWard, circlesAlong, nearestOnWard, removeWard, wardAt, type Ward } from '../../world/wards';
import { breakProp, lowerProp, raiseProp } from '../../world/destructible';
import { onMessages } from '../../net/messages';
import { tellWardTouched } from '../../net/wardTouch';
import { fx } from '../../entities/enemyAI';
import {
  buildHedgeward, disposeHedgeward, hedgewardOutline, steppedOver, HEDGE_HEIGHT, HEDGE_WIDTH,
} from '../../entities/models/hedgeward';
import { Readiness } from './readiness';
import { entry } from '../strikes';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';
import type { SkillDef } from '../../types';
import type { Obstacle } from '../../types';

type Def = Needs<'range' | 'wall'>;

const BRAMBLE = 0xa6c464;
/** the nearest it's raised to him (m: its line well clear of his body) */
const NEAREST = 1.6;
/** the step back towards him a spot something takes is given up for (m) */
const BACK_STEP = 0.25;
/** the least height of a prop that stands in the way between him and the wall (m: a stone on the floor he steps over
 *  doesn't) */
const IN_THE_WAY = 0.5;
/** half its thickness (m: the stakes, the weave either side and the bramble), and how far its line stands out from
 *  its foot towards the foes (its stakes lean out) */
const HALF = 0.25, LINE_OUT = 0.08;
/** how near a partner's body must come to its circles to break it by touch in the village (m: kept off them, his
 *  body stops a hair from them) */
const TOUCH = 0.08;
/** how far inside the arena's edge its ends are kept (m) */
const EDGE_IN = 1;
/** rising out of the ground (s), coming apart as its time runs out and as it breaks (s), and how far it sinks as it
 *  breaks (m) */
const RISE = 0.35, FADE = 0.8, BREAK = 0.45, SLUMP = 0.35;
/** its hit flash at its height (the kit's `uHit`: at a foe's full flash the whole wall went white in daylight) and its
 *  fade (1/s) */
const FLASH = 0.3, FLASH_FADE = 5;
/** the splinters its rubble is drawn in, as a wooden prop's */
const WOOD = 0x6a5238;

/** The wall's place for an aim: its middle on the floor, the way it faces (rad: its front, +z, away from him) and its
 *  ends. */
export interface Placement { x: number; z: number; yaw: number; ax: number; az: number; bx: number; bz: number }

/** Its circles for a middle at (x, z) facing `yaw`, and its ends. */
function lineAt(x: number, z: number, yaw: number, width: number): Placement {
  const along = { x: Math.cos(yaw), z: -Math.sin(yaw) }, out = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const mx = x + out.x * LINE_OUT, mz = z + out.z * LINE_OUT;
  return {
    x, z, yaw,
    ax: mx - along.x * width / 2, az: mz - along.z * width / 2, bx: mx + along.x * width / 2, bz: mz + along.z * width / 2,
  };
}

/** Whether a wall placed so stands clear of the props, the walls standing, the foes and the arena's edge. */
function clearAt(p: Placement, height: number): boolean {
  const R = G.arena.radius - EDGE_IN;
  const circles = circlesAlong(p.ax, p.az, p.bx, p.bz, HALF, height);
  const meets = (o: { x: number; z: number; r: number }, c: Obstacle) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + c.r;
  const foes = G.enemies.filter((e) => e.alive).map((e) => ({ x: e.pos.x, z: e.pos.z, r: e.radius }));
  return circles.every((c) => Math.hypot(c.x, c.z) < R - c.r && !G.arena.obstacles.some((o) => meets(o, c))
    && !foes.some((o) => meets(o, c)));
}

/** Whether a prop he can't see over stands between him and the wall's middle. */
function propBetween(player: { pos: THREE.Vector3 }, p: Placement): boolean {
  const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
  return G.arena.obstacles.some((o) => o.h >= IN_THE_WAY && entry(player.pos.x, player.pos.z, dx, dz, o.x, o.z, o.r) >= 0);
}

/** Whether the wall can rise where it's placed: clear of everything, nothing tall between him and it. */
export const placeable = (player: { pos: THREE.Vector3 }, def: Def, p: Placement): boolean =>
  clearAt(p, def.wall.height) && !propBetween(player, p);

/**
 * Where it stands for an aim at `target`: across the line from him to the aim, at the aim within his reach (and no
 * nearer than `NEAREST`), its middle kept inside the arena; where a foe, a prop, another wall or the edge takes that
 * spot, or a tall prop stands between him and it, stepped back towards him to the first clear one (aimed at a foe, as a
 * tap on touch aims, it rises before the foe; aimed past a rock, before the rock). Where none is clear (a rock right
 * before him), it isn't raised at all (`placeable`): its
 * outline shows red and letting go casts nothing (from play: "should not be able to cast it that far out... blocked
 * if enemies or props in the way"; it reached 10 m, and was raised somewhere wherever it was aimed).
 */
export function placeFor(player: { pos: THREE.Vector3; facing: number }, def: Def, target: THREE.Vector3): Placement {
  const dx = target.x - player.pos.x, dz = target.z - player.pos.z, d = Math.hypot(dx, dz);
  const ux = d > 1e-3 ? dx / d : Math.sin(player.facing), uz = d > 1e-3 ? dz / d : Math.cos(player.facing);
  const yaw = Math.atan2(ux, uz), reach = THREE.MathUtils.clamp(d, NEAREST, def.range);
  // (its middle far enough in that its ends are inside too, whichever way it lies: near the edge it slides in)
  const R = G.arena.radius - EDGE_IN - def.wall.width / 2 - HALF - 0.1;
  const at = (k: number): Placement => {
    const p = lineAt(player.pos.x + ux * k, player.pos.z + uz * k, yaw, def.wall.width), r = Math.hypot(p.x, p.z);
    return r > R ? lineAt(p.x * R / r, p.z * R / r, yaw, def.wall.width) : p;
  };
  for (let k = reach; k >= NEAREST; k -= BACK_STEP) {
    const p = at(k);
    if (placeable(player, def, p)) return p;
  }
  // (nowhere clear: where it was aimed, refused there by `placeable`)
  return at(reach);
}

/** The floor's height under its foot: the lowest along it (over a step, the stakes on the upper level are driven in
 *  the deeper), and how far each point along it (`x` from its middle) stands over that. */
function footOf(p: Placement, width: number): { floor: number; lift: (x: number) => number } {
  const along = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  const ground = (x: number) => groundHeight(p.x + along.x * x, p.z + along.z * x);
  let floor = Infinity;
  for (let k = -4; k <= 4; k++) floor = Math.min(floor, ground(k / 8 * width));
  return { floor, lift: (x: number) => ground(x * width / HEDGE_WIDTH) - floor };
}

// --- the preview -------------------------------------------------------------------
/** the preview's glows: the wall's outline where it would stand, and a ring at each end of its foot */
const ghostMat = () => additive(BRAMBLE, 0.55, 0.3);
const endGeo = () => floorPatch(0.75, 1, 1, 32);
/** a ring's radius at its ends (m) */
const END_R = 0.4;
/** how high in its glow the seconds of its cooldown count down (m) */
const COUNT_Y = 1.2;

interface Preview {
  ghost: THREE.Mesh; ghostGeo: THREE.BufferGeometry; ends: [THREE.Mesh, THREE.Mesh]; endGeos: THREE.BufferGeometry[];
  glows: [THREE.MeshBasicMaterial, number][]; ready: Readiness; laid: string;
}
let preview: Preview | null = null;
const _bramble = new THREE.Color(BRAMBLE);

function previewFor(): Preview {
  if (preview) return preview;
  const ghostMaterial = ghostMat(), endMaterial = additive(BRAMBLE, 1.5, 0.8);
  // (a copy of the outline of its own, lifted over a step in place as the aim moves)
  const ghostGeo = hedgewardOutline().clone(), ghost = new THREE.Mesh(ghostGeo, ghostMaterial);
  const endGeos = [endGeo(), endGeo()];
  const ends: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(endGeos[0], endMaterial), new THREE.Mesh(endGeos[1], endMaterial)];
  ghost.name = 'hedgeward-preview';
  ends.forEach((m, i) => { m.name = `hedgeward-preview-end${i}`; });
  for (const m of [ghost, ...ends]) { m.frustumCulled = false; G.scene.add(m); }
  const glows: [THREE.MeshBasicMaterial, number][] = [[ghostMaterial, 0.55], [endMaterial, 1.5]];
  preview = { ghost, ghostGeo, ends, endGeos, glows, ready: new Readiness('hedgeward'), laid: '' };
  return preview;
}

/** The preview's outline lifted over the floor under it (its points as the shared outline has them, each raised by
 *  the floor under it), only when where it stands has changed. */
function layGhost(p: Preview, at: Placement, lift: (x: number) => number): void {
  const key = `${at.x.toFixed(3)},${at.z.toFixed(3)},${at.yaw.toFixed(4)}`;
  if (p.laid === key) return;
  p.laid = key;
  const base = hedgewardOutline().attributes.position, out = p.ghostGeo.attributes.position;
  for (let i = 0; i < base.count; i++) out.setY(i, base.getY(i) + lift(base.getX(i)));
  out.needsUpdate = true;
}

/** Shows where it would stand for `target` (null: nothing shown). */
function showPlace(player: Player, def: Def, target: THREE.Vector3 | null, dt: number): void {
  if (!target) {
    if (!preview) return;
    preview.ghost.visible = preview.ends[0].visible = preview.ends[1].visible = false;
    preview.ready.hide(dt);
    return;
  }
  const p = previewFor(), at = placeFor(player, def, target), { floor, lift } = footOf(at, def.wall.width);
  p.ghost.visible = p.ends[0].visible = p.ends[1].visible = true;
  p.ready.show(player, def, { x: at.x, y: floor + COUNT_Y, z: at.z }, dt, !placeable(player, def, at));
  for (const [glow, bright] of p.glows) p.ready.tint(glow.color, _bramble, bright);
  layGhost(p, at, lift);
  p.ghost.position.set(at.x, floor, at.z);
  p.ghost.rotation.set(0, at.yaw, 0);
  p.ghost.scale.set(def.wall.width / HEDGE_WIDTH, def.wall.height / HEDGE_HEIGHT, 1);
  [[at.ax, at.az], [at.bx, at.bz]].forEach(([x, z], i) => {
    p.ends[i].position.set(x, 0, z);
    p.ends[i].scale.set(END_R, 1, END_R);
    lay(p.endGeos[i], x, z, 0.05, END_R);
  });
}

// --- what a shot meets ------------------------------------------------------------------
/** how deep the wall's solid is, across its line (m, in its own space): its stakes and the weave between them */
const SOLID_DEPTH = 0.3;
/** the solid's look: never drawn, only met (`raycastWall`) */
const SOLID_LOOK = new THREE.MeshBasicMaterial({ visible: false });
/** whether a shot meets the wall as drawn alone, through the gaps in its weave (the lab's canary, `holdWallSolid`) */
let drawnOnly = false;

/** The lab's canary: shots meet the wall as drawn alone, as before its solid (`lab hedgeward --canary`). */
export function holdWallSolid(off: boolean): void {
  drawnOnly = off;
}

/**
 * A box filling the wall's outline in its own space, never drawn, standing `lifted` higher where it's laid over a
 * step: what a shot meets where it finds a gap. An arrow meets a prop where a ray along it meets what's drawn
 * (`propSurface`), and between the wall's stakes and the courses of its weave it met nothing and flew on as past it,
 * dealing nothing (from Victor's review of #647: "Sometimes arrow can fly through without dealing damage, I get it
 * more than half the time").
 */
function solidOf(root: THREE.Object3D, lifted: number): THREE.Mesh {
  const tall = HEDGE_HEIGHT + lifted;
  const box = new THREE.BoxGeometry(HEDGE_WIDTH, tall, SOLID_DEPTH).translate(0, tall / 2, 0);
  const solid = new THREE.Mesh(box, SOLID_LOOK);
  solid.name = 'hedgeward-solid';
  solid.visible = false;
  root.add(solid);
  return solid;
}

/** What a ray meets of the wall: what's drawn, else its solid, where the ray found a gap in the weave. */
function raycastWall(root: THREE.Object3D, solid: THREE.Mesh, ray: THREE.Raycaster, hits: THREE.Intersection[]): void {
  const found = hits.length;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) (o as THREE.Mesh).raycast(ray, hits); });
  if (hits.length > found || drawnOnly) return;
  // (its matrix as it stands: a place's hidden parts aren't made each frame, `matricesOfShownOnly`)
  solid.updateWorldMatrix(true, false);
  solid.raycast(ray, hits);
}

// --- broken by a partner's touch -------------------------------------------------------------
const _nearest = { x: 0, z: 0 };
/** the lab's canary (`lab coop --scenarios wall-touch --canary`): a touch breaks this game's copy alone, never told */
let touchUntold = false;

/** The lab's canary: a wall broken by touch is never told to the other games while `hold`. */
export function holdTouchWord(hold: boolean): void {
  touchUntold = hold;
}

/**
 * Whether this game's own hero, not the wall's caster, touches `ward` in the village: there he can't cast to break it,
 * so a wall raised across a way, a door or a portal shut him out for good (from the owner: "its currently possible to
 * troll other players in coop by denying them entry with ranger's vines skill that cannot be destroyed... lets make it
 * possiible to destroy the vines for other players by touching them"). In a fight it stays an ordinary prop, broken by
 * hits alone: a partner brushing it there would take the ranger's shelter away.
 */
function touchedByPartner(caster: Player, ward: Ward): boolean {
  const hero = G.player;
  if (G.mode !== 'menu' || caster.local || !hero.local) return false;
  return nearestOnWard(ward, hero.pos.x, hero.pos.z, _nearest) <= HALF + hero.radius + TOUCH;
}

// (a partner's game broke its copy by its hero's touch, and says where it stood: this game's copy breaks too)
onMessages(['wardTouch'], (m) => {
  const x = Number(m.x), z = Number(m.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || G.mode !== 'menu') return;
  const ward = wardAt(x, z);
  if (ward) breakProp(ward.prop);
});

// --- the wall standing ------------------------------------------------------------------
/** every wall standing, whoever's: how each is taken down as its wave is cleared */
const everyWall = new Set<() => void>();
on('waveCleared', () => { for (const takeDown of [...everyWall]) takeDown(); });

/** A wall raised by `player` where `at` says: its look, and the breakable prop it is to its end. */
function raise(player: Player, def: Def, at: Placement): void {
  const { floor, lift } = footOf(at, def.wall.width);
  const wall = buildHedgeward();
  wall.wood.geometry = steppedOver(wall.wood.geometry, lift);
  wall.growth.geometry = steppedOver(wall.growth.geometry, lift);
  wall.root.scale.set(def.wall.width / HEDGE_WIDTH, def.wall.height / HEDGE_HEIGHT, 1);
  wall.root.rotation.set(0, at.yaw, 0);
  G.scene.add(wall.root);
  const top = floor + def.wall.height;
  const middle = new THREE.Vector3((at.ax + at.bx) / 2, floor, (at.az + at.bz) / 2);
  let t = 0, endedAt = -1, broke = false, flash = 0, life = def.wall.life;
  // (the prop it is: broken as any prop is, its rubble thrown by `breakProp`, its look then coming apart here; a hit
  // flashes it, as a hit chips a prop)
  const solid = solidOf(wall.root, Math.max(lift(-HEDGE_WIDTH / 2), lift(0), lift(HEDGE_WIDTH / 2)));
  const prop = raiseProp(circlesAlong(at.ax, at.az, at.bx, at.bz, HALF, top), def.wall.life, WOOD, {
    hide: () => end(true),
    show: () => undefined,
    raycast: (ray, hits) => raycastWall(wall.root, solid, ray, hits),
    surfaces: (visit) => {
      wall.root.updateWorldMatrix(true, true);
      wall.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) visit(o as THREE.Mesh); });
    },
  }, 'sticks', (left) => fx('ward', middle.x, middle.z, left));
  const ward: Ward = { ax: at.ax, az: at.az, bx: at.bx, bz: at.bz, prop };
  addWard(ward);
  const takeDown = (): void => end(false);
  everyWall.add(takeDown);
  /** its end: broken (it slumps as it comes apart, the prop's rubble flying), or its wave cleared (coming apart where
   *  it stands, its prop lowered) */
  function end(broken: boolean): void {
    if (endedAt >= 0) return;
    endedAt = t; broke = broken;
    everyWall.delete(takeDown);
    removeWard(ward);
    if (broken) sfx.hedgeBreak();
    else lowerProp(prop);
  }
  // its rising: earth thrown out along its foot
  for (const k of [-0.4, 0, 0.4]) {
    debris({ x: middle.x + (at.bx - at.ax) * k, y: floor, z: middle.z + (at.bz - at.az) * k }, { count: 8, color: 0x4a3a28, speed: 3.5, size: 0.12, life: 0.9 });
  }
  shockwave(middle, { color: BRAMBLE, intensity: 0.5, from: 0.5, to: def.wall.width * 0.6, life: 0.5 });
  addShake(0.12);
  sfx.hedgeRise();
  addEffect({
    update(dt) {
      t += dt;
      if (endedAt < 0 && def.duration && t >= def.duration) end(false);
      // (walked into in the village by a partner: broken here, every other game told where it stood)
      if (endedAt < 0 && touchedByPartner(player, ward)) {
        breakProp(prop);
        if (!touchUntold) tellWardTouched(middle.x, middle.z);
      }
      // (a hit taken: it flashes, and knocks as wood does)
      if (endedAt < 0 && prop.life < life) {
        life = prop.life;
        flash = 1;
        sfx.hedgeHit();
      }
      flash = Math.max(0, flash - FLASH_FADE * dt);
      wall.kit.u.uHit.value = flash * FLASH;
      // (up quickly, overshooting a little and settling; slumping as it breaks)
      const up = Math.min(1, t / RISE), rise = -(def.wall.height + 0.2) * (1 - up) ** 3 + Math.sin(up * Math.PI) * 0.05;
      const gone = endedAt < 0 ? 0 : Math.min(1, (t - endedAt) / (broke ? BREAK : FADE));
      wall.root.position.set(at.x, floor + rise - (broke ? SLUMP * gone : 0), at.z);
      wall.kit.u.uDissolve.value = gone;
      return gone < 1;
    },
    dispose() {
      everyWall.delete(takeDown);
      removeWard(ward);
      if (!prop.broken) lowerProp(prop);
      G.scene.remove(wall.root);
      disposeHedgeward(wall);
    },
  });
}

/** each hero's wall as it was let go: where `settle` placed it, and whether it could rise there then (`canCast`) */
const settled = new WeakMap<Player, { x: number; z: number; at: Placement; ok: boolean }>();

const skill: InstantSkill = {
  anim: 'cast',
  warm: () => {
    const wall = buildHedgeward();
    wall.kit.u.uDissolve.value = 0.3;
    return [wall.root, new THREE.Mesh(hedgewardOutline(), ghostMat()), new THREE.Mesh(endGeo(), additive(BRAMBLE, 1.5, 0.8))];
  },
  aim: (player, def, target, dt) => showPlace(player, def as Def, target, dt),
  // (nothing raised where something's in the way: the press costs nothing. Judged now, or as it was let go where
  // `settle` placed it: a tap on touch casts a few frames later, and walking on he passed a rock that then stood
  // between him and it)
  canCast: (player, def, target) => {
    const d = def as Def, was = settled.get(player);
    if (placeable(player, d, placeFor(player, d, target))) return true;
    return !!was && Math.hypot(was.x - target.x, was.z - target.z) < 1e-3 && was.ok && clearAt(was.at, d.wall.height);
  },
  // (the point every game is given: the middle of where its preview stood, so each raises it there)
  settle: (player, def, target) => {
    const at = placeFor(player, def as Def, target);
    settled.set(player, { x: at.x, z: at.z, at, ok: placeable(player, def as Def, at) });
    return new THREE.Vector3(at.x, 0, at.z);
  },
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    raise(player, def, placeFor(player, def, target));
  },
};

export default skill;
