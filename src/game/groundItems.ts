// Items on the lobby floor. Gear thrown out of the stash lands here instead of vanishing, so it can be
// picked up again (click its name) or, in co-op, by a partner. Whatever is left there is lost when a run
// starts. In co-op every game shows every drop, and the host says who got one first (net/session).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../state';
import { additive } from '../core/materials';
import { radialDecal } from '../core/textures';
import { sfx } from '../core/audio';
import { ARENA, RUN } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { basesFor, newItemId, rarityOf } from '../loot/items';
import { groundHeight } from '../world/ground';
import { project, floatText, onLayout } from '../ui/floaters';
import { hideTooltip, itemTooltip, itemTooltipHTML, moveTooltip, showTooltipAt, type TooltipContent } from '../ui/tooltip';
import { input } from '../core/input';
import { itemIconImage } from '../ui/itemIcons';
import { Label, ORDER, labelAt, type LabelArt } from '../ui/overlay/layer';
import { drawText, measure, OUTLINE, roundRect, svgImage, type TextStyle } from '../ui/overlay/paint';
import { uiScales } from '../ui/scale';
import type { Item } from '../types';
import { hallOpen } from './hall';

/** The floor is on show: in the lobby, and not while the hall of heroes stands in its place (a Greataxe thrown there
 *  showed its shaft and name among the heroes). */
const floorShown = (): boolean => G.mode === 'menu' && !hallOpen();

/** A drop as the games tell each other about it: the item, where it lies and where it was thrown from. */
export interface GroundDrop { id: string; item: Item; x: number; z: number; fx: number; fz: number }

/** How a drop reaches the other games (set by net/session while in a room). */
export interface GroundNet {
  /** tell the others about a drop */
  dropped(d: GroundDrop): void;
  /** a guest asks the host for a drop (true); solo or on the host there's nobody to ask (false) */
  ask(id: string): boolean;
  /** the local player took a drop: the others remove it */
  taken(id: string): void;
}

/** metres: the farthest an item is thrown (dragged farther, it lands this far out that way) */
const THROW_MAX = 9;
/** seconds in the air */
const TOSS = 0.55;
/** a guest's request to the host: tried again after this long without an answer */
const ASK_AGAIN = 2;
/** drops the floor's meshes have room for at first (they double when it fills) */
const ROOM = 32;

interface Drop extends GroundDrop {
  /** its name over it, with its icon, in its rarity's colour (pickable: a click, or a tap and another) */
  label: Label;
  /** age (s): the toss, then the beam growing */
  t: number;
  /** when a guest last asked the host for it */
  asked: number;
  /** the canvas's pixels per px of its label its icon was made for (`iconRatio`) */
  ratio: number;
}

const drops = new Map<string, Drop>();
let net: GroundNet | null = null;
let picked: (item: Item) => boolean = () => false;
/** drop ids: unique between games (a page tag) and within one */
const TAG = Math.random().toString(36).slice(2, 7);
let seq = 0;

/** A drop's pieces: the shard, the glow on the floor under it and the soft shaft of light (two crossed cards). */
type Part = 'shard' | 'glow' | 'beam';
const PARTS: Part[] = ['shard', 'glow', 'beam'];

/**
 * Every drop on the floor is drawn at once, one instanced mesh a piece, each drop coloured by its rarity. As meshes
 * of its own, each drop cost 8 draw calls (additive and double-sided, each piece was drawn twice), and 120 drops
 * added 10 to 14 ms to a frame; their light adds up in any order, so one pass a piece draws the same picture.
 */
let looks: { geo: Record<Part, THREE.BufferGeometry>; mat: Record<Part, THREE.MeshBasicMaterial> } | null = null;
let meshes: Record<Part, THREE.InstancedMesh> | null = null;
/** the drops' colours are written again (one came or went) */
let recolour = false;

/** `pick` puts a picked-up item in the stash; false when there's no room. */
export function initGround(pick: (item: Item) => boolean): void {
  picked = pick;
  bindPicking();
  onLayout(placeLabels);
}
export function setGroundNet(n: GroundNet | null): void { net = n; }

// the pieces' shapes and materials (white, all additive: the effects' own shader programs, coloured per drop)
function looksFor() {
  if (looks) return looks;
  const card = new THREE.PlaneGeometry(1, 1);
  const geo = {
    shard: new THREE.OctahedronGeometry(0.09, 0).scale(1, 1.8, 1),
    glow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    beam: mergeGeometries([card, card.clone().rotateY(Math.PI / 2)])!,
  };
  const soft = radialDecal('rgba(255,255,255,1)', 'rgba(255,255,255,0)', false);
  const mat = { shard: additive(0xffffff, 2.2), glow: additive(0xffffff, 1, 0.55), beam: additive(0xffffff, 0.9, 0.5) };
  mat.beam.map = mat.glow.map = soft;
  for (const m of Object.values(mat)) m.forceSinglePass = true;
  looks = { geo, mat };
  return looks;
}

/** A piece's instanced mesh with room for `room` drops, each coloured on its own. */
function instanced(part: Part, room: number): THREE.InstancedMesh {
  const { geo, mat } = looksFor();
  const mesh = new THREE.InstancedMesh(geo[part], mat[part], room);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  // (the drops move every frame: drawn whatever the view rather than bounded afresh each time)
  mesh.frustumCulled = false;
  return mesh;
}

/** The pieces' meshes, with room for `count` drops (made afresh, twice as roomy, when they run out of it). */
function meshesFor(count: number): Record<Part, THREE.InstancedMesh> {
  if (meshes && count <= meshes.shard.instanceMatrix.count) return meshes;
  let room = meshes?.shard.instanceMatrix.count ?? ROOM;
  while (room < count) room *= 2;
  for (const part of PARTS) {
    if (!meshes) break;
    G.scene.remove(meshes[part]);
    meshes[part].dispose();
  }
  meshes = { shard: instanced('shard', room), glow: instanced('glow', room), beam: instanced('beam', room) };
  for (const part of PARTS) G.scene.add(meshes[part]);
  recolour = true;
  return meshes;
}

/** Sample meshes for the load-time shader warm-up. */
export function groundSamples(): THREE.Object3D[] {
  return PARTS.map((part) => instanced(part, 1));
}

/** The classes that can use an item (its base is one of theirs). */
const usersOf = (it: Item) => Object.values(CLASSES).filter((c) => basesFor(it.slot, c).includes(it.base));

/** Throw an item from the local player's stash onto the floor, a couple of metres ahead. */
export function throwItem(item: Item, at?: { x: number; z: number }): void {
  const p = G.player;
  // towards `at` (where it was dragged to, within a throw), else a few metres ahead
  let f = p.facing, reach = 2.4;
  if (at) { f = Math.atan2(at.x - p.pos.x, at.z - p.pos.z); reach = Math.min(THROW_MAX, Math.max(1.5, Math.hypot(at.x - p.pos.x, at.z - p.pos.z))); }
  const sx = Math.sin(f), sz = Math.cos(f);
  // a little to either side, clear of the other drops
  let x = 0, z = 0;
  for (let i = 0; i < 8; i++) {
    const ahead = at ? reach + (i ? (Math.random() - 0.5) * 0.8 : 0) : reach + Math.random() * 0.8;
    const side = at ? (i ? (Math.random() - 0.5) * 0.8 : 0) : (Math.random() - 0.5) * 1.6;
    x = p.pos.x + sx * ahead + sz * side;
    z = p.pos.z + sz * ahead - sx * side;
    const r = Math.hypot(x, z), max = ARENA.radius - 1;
    if (r > max) { x *= max / r; z *= max / r; }
    if (![...drops.values()].some((d) => Math.hypot(d.x - x, d.z - z) < 0.7)) break;
  }
  const d: GroundDrop = { id: `${TAG}.${seq++}`, item, x, z, fx: p.pos.x, fz: p.pos.z };
  addDrop(d);
  net?.dropped(d);
}

const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
/** The floor under a point of the screen (client px), or null when it points above the horizon. */
export function floorAt(cx: number, cy: number): { x: number; z: number } | null {
  const r = G.renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  return ray.ray.intersectPlane(floorPlane, hit) ? { x: hit.x, z: hit.z } : null;
}

/** The canvas's pixels per px of a drop's label (the labels are drawn at the lobby's UI scale): its icon is made for
 *  it, so it's drawn at its own size. */
const iconRatio = (): number => G.renderer.getPixelRatio() * uiScales.ui;

/** A drop's label, its icon made for `ratio` canvas pixels per px: its icon and name in its rarity's colour on a dark
 *  plate edged in it. */
function dropArt(d: Drop, ratio: number): LabelArt {
  const color = rarityOf(d.item.rarity).color;
  const style: TextStyle = { face: 'display', size: 13, color, shadows: OUTLINE };
  const name = measure(d.item.name, style), icon = 20, gap = 5;
  const pad = { top: 2, right: 8, bottom: 2, left: 4 };
  const inner = Math.max(icon, name.h);
  const w = 2 + pad.left + icon + gap + name.w + pad.right, h = 2 + pad.top + inner + pad.bottom;
  const img = svgImage(itemIconImage(d.item, Math.ceil(icon * ratio)), () => d.label.show(dropArt(d, d.ratio)));
  return {
    w, h,
    paint(c, s) {
      roundRect(c, 0.5, 0.5, w - 1, h - 1, 3);
      c.fillStyle = 'rgba(12,11,14,.8)';
      c.fill();
      c.globalAlpha = 0.55;
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
      const x = 1 + pad.left, y = 1 + pad.top;
      if (img) c.drawImage(img, x, y + (inner - icon) / 2, icon, icon);
      drawText(c, name, x + icon + gap, y + (inner - name.h) / 2, style, s);
    },
  };
}

/** A drop appears: thrown from where it was thrown from, or already lying there (`toss` false). */
export function addDrop(g: GroundDrop, toss = true): void {
  if (drops.has(g.id)) return;
  const label = new Label(ORDER.floor);
  label.pickable = true;
  label.ax = label.ay = 0;
  label.sizedBy = 'ui';
  label.shown = false;
  const d: Drop = { ...g, label, t: toss ? 0 : TOSS + 1, asked: -Infinity, ratio: iconRatio() };
  label.show(dropArt(d, d.ratio));
  drops.set(d.id, d);
  recolour = true;
  drawDrops();
}

/** A drop's card: the item, and what picking it up does (or who can). */
function cardOf(d: Drop): TooltipContent {
  const own = usersOf(d.item).some((c) => c.id === G.player.cls.id);
  const how = own ? (input.touchMode ? 'Tap again to pick it up' : 'Click to pick it up') : `Only a ${usersOf(d.item).map((c) => c.name).join(' or ') || 'nobody'} can use it`;
  return { ...(own ? itemTooltip(d.item)() : itemTooltipHTML(d.item)), foot: `${how}<br>Left on the floor, it's lost when a run starts` };
}

/** The drop whose label is under a point of the page, in the lobby. */
function dropAt(x: number, y: number): Drop | null {
  if (G.mode !== 'menu') return null;
  const l = labelAt(x, y);
  if (!l) return null;
  for (const d of drops.values()) if (d.label === l) return d;
  return null;
}

/** the drop the mouse is over (its card shows), and the one a press began on */
let hovered: Drop | null = null, pressed: Drop | null = null;

/** The pointer over the floor's names: the mouse's card and cursor, a click to pick one up, a tap to show its card and
 *  another to take it. Their labels are drawn on the canvas, so they take the pointer before the game does (a press
 *  on one doesn't attack). */
function bindPicking(): void {
  const canvas = G.renderer.domElement;
  // (only where the game field itself is under the pointer: a panel or the touch controls over a name keep it)
  const over = (e: MouseEvent): Drop | null => (e.target === canvas ? dropAt(e.clientX, e.clientY) : null);
  window.addEventListener('mousemove', (e) => {
    if (input.touchMode) return;
    const d = over(e);
    // (over a name the hero doesn't aim there, as over the page's own)
    if (d) input.mouse.overUI = true;
    canvas.style.cursor = d ? 'var(--cursor-hand)' : '';
    if (d !== hovered) {
      hovered = d;
      if (d) showTooltipAt(cardOf(d), e);
      else hideTooltip();
    } else if (d) moveTooltip(e);
  });
  window.addEventListener('pointerdown', (e) => {
    // (a pick is the left button's or a finger's: the middle button's drag turns the camera from anywhere, and taken
    // here, a press on a name the camera's drag began on turned nothing)
    if (e.button !== 0) return;
    const d = over(e);
    pressed = d;
    if (!d) return;
    // (the game never sees it: no attack, no move stick, no closing of the card it shows)
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === 'mouse') return;
    if (tapped !== d.id) {
      tapped = d.id;
      showTooltipAt(cardOf(d), { clientX: d.label.box.x + d.label.box.w - 6, clientY: d.label.box.y }, true);
      return;
    }
    tapped = null;
    pickUp(d);
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !pressed) return;
    const d = over(e);
    if (d === pressed) pickUp(d);
    pressed = null;
  }, true);
}

/** Take a drop off the floor (it's gone, or someone took it). Returns it, if it was there. */
export function removeDrop(id: string): GroundDrop | null {
  const d = drops.get(id);
  if (!d) return null;
  drops.delete(id);
  recolour = true;
  drawDrops();
  d.label.remove();
  if (hovered === d) hovered = null;
  hideTooltip();
  return { id: d.id, item: d.item, x: d.x, z: d.z, fx: d.fx, fz: d.fz };
}

/** The host gave us a drop: into the stash, or back on the floor at our feet if it has filled up meanwhile. */
export function receiveItem(item: Item): void {
  const it = { ...item, id: newItemId() };
  if (picked(it)) { sfx.pickup(); return; }
  floatText(G.player.pos.x, 2.6, G.player.pos.z, 'Stash full', 'info', '#ffcf70');
  throwItem(it);
}

/** Everything on the floor, as the games tell each other about it (for a guest joining). */
export const groundDrops = (): GroundDrop[] => [...drops.values()].map((d) => ({ id: d.id, item: d.item, x: d.x, z: d.z, fx: d.fx, fz: d.fz }));

/** Whatever is left on the floor is lost (a run starts, or a guest leaves the host's lobby). */
export function clearGround(): void { for (const id of [...drops.keys()]) removeDrop(id); }

const at = new THREE.Vector3(), turn = new THREE.Quaternion(), spin = new THREE.Euler(), size = new THREE.Vector3();
const placed = new THREE.Matrix4(), unturned = new THREE.Quaternion();
/** a piece not shown yet: drawn as nothing */
const NONE = new THREE.Matrix4().makeScale(0, 0, 0);
const tint = new THREE.Color();

/** Puts drop `i`'s piece where it is now (`turn` as `spin`, or not turned without it). */
function place(mesh: THREE.InstancedMesh, i: number, sx: number, sy: number, sz: number, by?: THREE.Euler): void {
  mesh.setMatrixAt(i, placed.compose(at, by ? turn.setFromEuler(by) : unturned, size.set(sx, sy, sz)));
}

/** Drop `i`'s pieces: tossed through the air, then lying with its light growing over it. */
function pose(d: Drop, i: number, m: Record<Part, THREE.InstancedMesh>): void {
  const t = d.t, y0 = groundHeight(d.x, d.z);
  if (t < TOSS) {
    // an arc from the thrower's hand to the floor, the shard tumbling
    const k = t / TOSS;
    const y = (groundHeight(d.fx, d.fz) + 1.2) * (1 - k) + y0 * k + 1.6 * k * (1 - k) + 0.18;
    at.set(d.fx + (d.x - d.fx) * k, y, d.fz + (d.z - d.fz) * k);
    place(m.shard, i, 1, 1, 1, spin.set(t * 11, t * 7, 0));
    m.glow.setMatrixAt(i, NONE);
    m.beam.setMatrixAt(i, NONE);
    return;
  }
  const s = Math.min(1, (t - TOSS) / 0.4);   // the light grows once it lands
  at.set(d.x, y0 + 1.1 * s, d.z);
  place(m.beam, i, 0.45, 2.2 * s, 1);
  at.set(d.x, y0 + 0.04, d.z);   // clear of the floor: level with it, the two flicker in and out
  place(m.glow, i, 0.9 * s, 0.9 * s, 0.9 * s);
  at.set(d.x, y0 + 0.3 + Math.sin(t * 2.2) * 0.04, d.z);
  place(m.shard, i, 1, 1, 1, spin.set(0, t * 1.4, 0));
}

/** Every drop's pieces where they are now (and in its colour, once one came or went), shown in the lobby only. */
function drawDrops(): void {
  if (!meshes && drops.size === 0) return;
  const m = meshesFor(drops.size);
  let i = 0;
  for (const d of drops.values()) {
    pose(d, i, m);
    if (recolour) for (const part of PARTS) m[part].setColorAt(i, tint.set(rarityOf(d.item.rarity).color));
    i++;
  }
  for (const part of PARTS) {
    const mesh = m[part];
    mesh.count = drops.size;
    mesh.visible = floorShown() && drops.size > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (recolour) mesh.instanceColor!.needsUpdate = true;
  }
  recolour = false;
}

/** The labels over the drops, stacked upwards where they would overlap (the nearest keep their place); placed with
 *  the other labels, after the camera has moved. */
function placeLabels(): void {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const shown = [...drops.values()].filter((d) => {
    const on = d.t >= TOSS && floorShown();
    if (!on) d.label.shown = false;
    return on;
  }).map((d) => ({ d, s: project(d.x, groundHeight(d.x, d.z) + 0.5, d.z) })).filter(({ d, s }) => {
    if (s.behind) d.label.shown = false;
    return !s.behind;
  }).sort((a, b) => b.s.y - a.s.y);
  const u = uiScales.ui, ratio = iconRatio();
  for (const { d, s } of shown) {
    const el = d.label;
    el.shown = true;
    // (its icon made again for the canvas's new pixels: another screen, or the lobby's new scale)
    if (d.ratio !== ratio) { d.ratio = ratio; el.show(dropArt(d, ratio)); }
    // (stacked on the page, css px: the art's px at the lobby's scale)
    const w = el.size.w * u, h = el.size.h * u;
    const r = { x: s.x - w / 2, y: s.y - h, w, h };
    for (let i = 0; i < 20; i++) {
      const hit = placed.find((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
      if (!hit) break;
      r.y = hit.y - h - 2 * u;
    }
    placed.push(r);
    el.x = r.x;
    el.y = r.y;
  }
}

/** the label a touch tapped last: the next tap on it picks the item up */
let tapped: string | null = null;

/** The local player picks a drop up: into the stash, if the class can use it and there's room. */
function pickUp(d: Drop): void {
  const p = G.player;
  if (G.mode !== 'menu' || d.t < TOSS || G.time - d.asked < ASK_AGAIN) return;
  const own = usersOf(d.item).some((c) => c.id === p.cls.id);
  if (!own || G.profile.stash.length >= RUN.bagLimit) {
    floatText(d.x, 1.6, d.z, own ? 'Stash full' : `Not for a ${p.cls.name}`, 'info', '#ffcf70');
    return;
  }
  hideTooltip();
  // a guest asks the host, who may have given it to someone else already
  if (net?.ask(d.id)) { d.asked = G.time; return; }
  const g = removeDrop(d.id);
  if (!g) return;
  net?.taken(g.id);
  if (picked({ ...g.item, id: newItemId() })) sfx.pickup();
}

/** Every frame: the drops' motion and labels. */
export function updateGround(dt: number): void {
  for (const d of drops.values()) {
    d.t += dt;
    // the class on show can change (a class or save slot switch in the lobby): another class's drop dimmed
    d.label.alpha = usersOf(d.item).some((c) => c.id === G.player.cls.id) ? 1 : 0.6;
  }
  drawDrops();
}
