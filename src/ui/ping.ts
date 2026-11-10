// Co-op pings on screen (game/ping.ts holds them): Ctrl held, a hint says the party will be pinged, and let go pings
// what the aim is on (the foe Quarry Mark's aim would take, else the spot; dragged with Ctrl held, the area from where
// it was pressed), or the minimap's spot under the pointer; on touch a long press on the minimap. Each ping shows in
// the world (a ring laid on the floor round its spot, its foe or its area, and a pin over it with who pinged and how
// far, held at the screen's edge pointing the way when it's off screen: a label of the overlay, ui/overlay) and on the
// minimap (drawn with it, hud.ts). The rings' material is the effects' additive one, warmed with them (game/warmup.ts).
import * as THREE from 'three';
import { G } from '../state';
import { PING } from '../data/balance';
import { input, isDown, pointerLocked } from '../core/input';
import { cameraYaw } from '../core/renderer';
import { additive } from '../core/materials';
import { floorPatch, lay } from '../fx/floorPatch';
import { groundHeight } from '../world/ground';
import { heroColour } from '../data/heroColours';
import { isCoop } from '../net/role';
import { ping, pings, foeAimed, foeNear, updatePings, pingShown, type Ping, type PingKind } from '../game/ping';
import { outline } from './overlay/outline';
import { Label, ORDER } from './overlay/layer';
import { drawText, measure, OUTLINE, type TextStyle } from './overlay/paint';
import { onLayout, onScreenOrEdge } from './floaters';
import { MINIMAP_METRES, onMinimap } from './hud';
import { nameOf } from './coop';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';

const reduceMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const still = (): boolean => !!reduceMotion?.matches;

// --- the colour a player's pings are shown in: its hero's colour, lit up to read on the dark floor and minimap

/** a ping's colour where its hero wears none of the room's (solo never pings) */
const PING_GOLD = '#ffd04a';
const _c = new THREE.Color();
function pingColour(p: Player): string {
  const c = heroColour(p.colour);
  if (!c) return PING_GOLD;
  const [h, s] = c.hsl;
  return '#' + _c.setHSL(h, Math.min(1, s + 0.2), 0.62, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
}

// --- the minimap's points (as hud.ts draws it: its middle the arena's, turned by the camera's yaw)

let minimap: HTMLCanvasElement | null = null;
const mapCanvas = (): HTMLCanvasElement | null => (minimap ??= document.querySelector<HTMLCanvasElement>('#minimap'));

/** The arena's point under (x, y) of the page (css px) on the minimap, none off its round or with it hidden. */
export function mapToWorld(x: number, y: number): { x: number; z: number } | null {
  const c = mapCanvas();
  if (!c) return null;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || !c.offsetWidth) return null;
  // (its border is in its box, and the page scales the whole of it: `--hud`)
  const border = c.clientLeft * (rect.width / c.offsetWidth);
  const inner = rect.width - 2 * border, W = c.width, S = W / MINIMAP_METRES;
  const px = ((x - rect.left - border) / inner - 0.5) * W, py = ((y - rect.top - border) / inner - 0.5) * W;
  if (Math.hypot(px, py) > W / 2) return null;
  const yaw = -cameraYaw(), cos = Math.cos(yaw), sin = Math.sin(yaw);
  return { x: (px * cos - py * sin) / S, z: (px * sin + py * cos) / S };
}

// --- input: Ctrl held and let go, a long press on the minimap

/** where a ping would go: the arena's point, whether it was found on the minimap, and the foe it would point out */
interface Aim { x: number; z: number; map: boolean; foe: Enemy | null }

/** what the aim was on as Ctrl went down (an area is dragged from there) */
let held: Aim | null = null;
/** a finger on the minimap: where it went down and is now (css px), how long it has been there (s), and whether it
 *  has pinged already (it waits to be lifted) */
let press: { id: number; x0: number; y0: number; x: number; y: number; t: number; done: boolean } | null = null;

/** What a ping now would point out: the minimap's spot under the pointer, else the foe the aim is on or its spot. */
function aimNow(): Aim {
  if (!pointerLocked() && !input.centerAim) {
    const m = mapToWorld(input.mouse.x, input.mouse.y);
    if (m) return { ...m, map: true, foe: foeNear(m.x, m.z, PING.mapFoeNear) };
  }
  return { x: input.ground.x, z: input.ground.z, map: false, foe: foeAimed(input.ground) };
}

/** The ping Ctrl let go makes, pressed with the aim on `from`, let go on `to`: an area if dragged far enough on the
 *  same view of the arena (the world's or the minimap's), else the foe it's on, else the spot. */
function pingFor(from: Aim, to: Aim): { k: PingKind; x: number; z: number; r?: number; foe?: Enemy } {
  const far = Math.hypot(to.x - from.x, to.z - from.z);
  if (from.map === to.map && far >= PING.areaFrom) return { k: 'area', x: from.x, z: from.z, r: Math.min(PING.areaMost, far) };
  if (to.foe) return { k: 'foe', x: to.foe.pos.x, z: to.foe.pos.z, foe: to.foe };
  return { k: 'spot', x: to.x, z: to.z };
}

function bindMinimap(): void {
  const c = mapCanvas();
  if (!c || c.dataset.pings) return;
  c.dataset.pings = '1';
  c.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: 0, done: false };
    e.preventDefault();
  });
  c.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    press.x = e.clientX; press.y = e.clientY;
    if (Math.hypot(press.x - press.x0, press.y - press.y0) > PING.pressSlop) press = null;
  });
  const lift = (e: PointerEvent) => { if (press && e.pointerId === press.id) press = null; };
  c.addEventListener('pointerup', lift);
  c.addEventListener('pointercancel', lift);
  // (a long press is the browser's context menu too)
  c.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** A finger held on the minimap long enough pings the spot under it (the foe there, if one is). */
function pressed(dt: number, can: boolean): void {
  if (!press || press.done) return;
  press.t += dt;
  if (press.t < PING.longPress) return;
  press.done = true;
  const m = can ? mapToWorld(press.x, press.y) : null;
  if (!m) return;
  const foe = foeNear(m.x, m.z, PING.mapFoeNear);
  ping(foe ? { k: 'foe', x: foe.pos.x, z: foe.pos.z } : { k: 'spot', x: m.x, z: m.z }, foe);
}

/** the foe this game outlines as the one Ctrl let go would ping (held by us: anything else's outline is its own) */
let outlined = false;
/** the outline's colour on the foe a ping would take */
const PING_OUTLINE = 0xffd04a;

/**
 * Every frame (after the heroes moved, their aim with them): the pings age, and the local player's input: Ctrl held
 * shows the hint, the foe or the area it would ping, and let go pings; a finger held on the minimap pings there.
 * `allowed`: the player is playing (a run, or the lobby's practice), not in a menu.
 */
export function updatePingInput(dt: number, allowed: boolean): void {
  updatePings(dt);
  bindMinimap();
  const can = allowed && isCoop();
  pressed(dt, can);
  const ctrl = can && !input.touchMode && (isDown('controlleft') || isDown('controlright'));
  let would: ReturnType<typeof pingFor> | null = null;
  if (ctrl) {
    const now = aimNow();
    held ??= now;
    would = pingFor(held, now);
  } else if (held) {
    if (can) {
      const made = pingFor(held, aimNow());
      ping(made, made.foe ?? null);
    }
    held = null;
  }
  // (Quarry Mark's aim outlines its own foe)
  const foe = would?.foe ?? null;
  if (foe && !G.player.aiming) { outline(foe.obj, PING_OUTLINE); outlined = true; }
  else if (outlined) { if (!G.player.aiming) outline(null); outlined = false; }
  areaPreview(would?.k === 'area' ? would : null);
  hint(would?.k ?? null);
}

// --- the hint while Ctrl is held

let hintEl: HTMLElement | null = null;
let hinted: PingKind | null = null;
const HINTS: Record<PingKind, string> = {
  spot: 'Release to ping this spot to everyone',
  foe: 'Release to ping this foe to everyone',
  area: 'Release to ping this area to everyone',
};
function hint(kind: PingKind | null): void {
  if (kind === hinted) return;
  hinted = kind;
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.className = 'pinghint hidden';
    hintEl.innerHTML = '<kbd>Ctrl</kbd><span></span>';
    document.querySelector('#hud')?.appendChild(hintEl);
  }
  hintEl.classList.toggle('hidden', !kind);
  if (kind) hintEl.querySelector('span')!.textContent = HINTS[kind];
}

// --- the rings on the floor

/** a ring's band across (m): a spot's, a foe's, an area's edge alike */
const BAND = 0.16;
/** how far over the ground the rings lie (m) */
const LIFT = 0.05;

/** A ring of radius 1 laid by `lay`, its band `BAND` wide at radius `r` (a disc with `fill`). */
const ringGeo = (r: number, fill = false): THREE.BufferGeometry =>
  floorPatch(fill ? 0 : Math.max(0.5, 1 - BAND / Math.max(r, 0.3)), 1, 1, 48);

/** One of the warm-up's samples (game/warmup.ts): a ping's ring, so its program compiles at load. */
export function pingSamples(): THREE.Object3D[] {
  const ring = new THREE.Mesh(ringGeo(1), additive(PING_GOLD, 1.4, 0.8));
  ring.name = 'ping ring';
  return [ring];
}

/** A ring on the floor: its mesh, geometry and material, where it was last laid. */
class FloorRing {
  readonly geo: THREE.BufferGeometry;
  readonly mat: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  private laid = '';
  constructor(colour: string, r: number, fill = false) {
    this.geo = ringGeo(r, fill);
    this.mat = additive(colour, 1.4, 0);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'ping ring';
    G.scene.add(this.mesh);
  }
  /** Laid round (x, z) at radius `r`, `opacity` strong (laid again only where it moved). */
  place(x: number, z: number, r: number, opacity: number): void {
    this.mesh.visible = opacity > 0.002;
    this.mat.opacity = opacity;
    if (!this.mesh.visible) return;
    const at = `${x.toFixed(2)},${z.toFixed(2)},${r.toFixed(3)}`;
    if (at === this.laid) return;
    this.laid = at;
    this.mesh.position.set(x, 0, z);
    this.mesh.scale.set(r, 1, r);
    lay(this.geo, x, z, LIFT, r);
  }
  dispose(): void {
    G.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** the area Ctrl dragged would ping, shown faintly as it's dragged */
let preview: FloorRing | null = null;
function areaPreview(area: { x: number; z: number; r?: number } | null): void {
  if (!area) { preview?.place(0, 0, 1, 0); return; }
  preview ??= new FloorRing(pingColour(G.player), PING.areaMost);
  preview.place(area.x, area.z, area.r ?? PING.areaFrom, 0.35);
}

// --- each ping shown: its rings, its pin over it, where the minimap last drew it

interface Shown {
  ring: FloorRing;
  ripple: FloorRing;
  fill: FloorRing | null;
  pin: Label;
  /** what the pin last showed (painted again only when it changes) */
  look: string;
  /** where the minimap last drew it (its canvas's px) and when (G.time) */
  map: { x: number; y: number; t: number } | null;
}
const shown = new Map<Ping, Shown>();

function shownOf(p: Ping): Shown {
  let s = shown.get(p);
  if (s) return s;
  const colour = pingColour(p.by);
  s = {
    ring: new FloorRing(colour, p.r),
    ripple: new FloorRing(colour, p.r),
    fill: p.kind === 'area' ? new FloorRing(colour, p.r, true) : null,
    pin: new Label(ORDER.ping),
    look: '',
    map: null,
  };
  s.pin.shown = false;
  shown.set(p, s);
  return s;
}

function drop(p: Ping, s: Shown): void {
  s.ring.dispose(); s.ripple.dispose(); s.fill?.dispose();
  s.pin.remove();
  shown.delete(p);
}

/** how far in from the screen's sides a pin stays (px, at the HUD's scale): clear of the hotbar and the minimap */
const EDGE = { side: 90, top: 130, bottom: 190 };
/** how high a pin's point floats over a foe's head (m) */
const OVER_FOE = 0.35;

/** Every ping's rings and pin where they show now (after the camera moved, with the rest of the labels). */
function placePings(): void {
  for (const [p, s] of shown) if (!pings.includes(p)) drop(p, s);
  const me = G.player;
  for (const p of pings) {
    const s = shownOf(p), k = pingShown(p);
    const ripple = (p.age % PING.ripple) / PING.ripple;
    s.ring.place(p.x, p.z, p.r, 0.85 * k);
    s.fill?.place(p.x, p.z, p.r, 0.12 * k);
    // (a ripple running out from the middle to the ring, fading as it goes; with reduced motion, none)
    s.ripple.place(p.x, p.z, p.r * (0.15 + 0.85 * ripple), still() ? 0 : 0.6 * (1 - ripple) * k);
    const y = p.foe ? p.foe.obj.position.y + p.foe.overHead + OVER_FOE : groundHeight(p.x, p.z);
    const at = onScreenOrEdge(p.x, y, p.z, EDGE);
    const colour = pingColour(p.by);
    const far = `${Math.round(Math.hypot(p.x - me.pos.x, p.z - me.pos.z))} m`;
    // (the way to it in steps of 4 degrees: painted again a few times as the view turns, not every frame)
    const turn = at.inView ? 0 : Math.round(at.turn / (Math.PI / 45)) * (Math.PI / 45);
    const look = `${p.kind}|${nameOf(p.by)}|${far}|${colour}|${at.inView ? '' : turn}`;
    if (look !== s.look) {
      s.look = look;
      s.pin.show(pinArt({ kind: p.kind, name: nameOf(p.by), far, colour, edge: !at.inView, turn }));
    }
    const art = s.pin.size;
    s.pin.shown = k > 0.002;
    s.pin.alpha = k;
    s.pin.x = at.x;
    s.pin.y = at.y;
    s.pin.ax = 0.5;
    s.pin.ay = (at.inView ? art.h : art.h - PIN_BOX / 2) / art.h;
    // (it drops into place as it comes; with reduced motion, it fades in alone)
    s.pin.scale = !still() && p.age < 0.25 ? 1 + (0.25 - p.age) * 1.6 : 1;
  }
}
onLayout(placePings);

// --- the pin's art: who and how far over a pin standing on its point, or at the screen's edge an arrow the way to it

const NAME: TextStyle = { face: 'display', size: 16, color: '#fff4dc', spacing: 0.4, shadows: OUTLINE };
const FAR: TextStyle = { face: 'body', size: 13, color: '#e8e0d0', shadows: OUTLINE };
/** the box round the pin's head (px of the UI's reference layout), its head in its middle and its point at its foot */
const PIN_BOX = 84;
const HEAD = 13;

interface PinLook { kind: PingKind; name: string; far: string; colour: string; edge: boolean; turn: number }

function pinArt(m: PinLook): { w: number; h: number; paint(c: CanvasRenderingContext2D, s: number): void } {
  const name = measure(m.name, NAME), far = measure(m.far, FAR);
  const words = name.h + far.h, pad = 6;
  const w = Math.max(PIN_BOX, name.w + pad * 2, far.w + pad * 2), h = words + PIN_BOX;
  return {
    w, h,
    paint(c, s) {
      const cx = w / 2, cy = words + PIN_BOX / 2;
      drawText(c, name, cx - name.w / 2, 0, NAME, s);
      drawText(c, far, cx - far.w / 2, name.h, FAR, s);
      c.save();
      c.shadowColor = 'rgba(0,0,0,.85)';
      c.shadowBlur = 5 * s;
      c.fillStyle = m.colour;
      if (m.edge) {
        // the arrow out past the head, the way to it
        c.save();
        c.translate(cx, cy);
        c.rotate(m.turn);
        c.beginPath(); c.moveTo(HEAD + 8, -10); c.lineTo(HEAD + 24, 0); c.lineTo(HEAD + 8, 10); c.closePath(); c.fill();
        c.restore();
      } else {
        // the pin's point, down to the foot of its box (on the spot, or over the foe's head)
        c.beginPath(); c.moveTo(cx - HEAD * 0.7, cy + HEAD * 0.6); c.lineTo(cx, cy + PIN_BOX / 2); c.lineTo(cx + HEAD * 0.7, cy + HEAD * 0.6); c.closePath(); c.fill();
      }
      c.beginPath(); c.arc(cx, cy, HEAD, 0, Math.PI * 2); c.fill();
      c.restore();
      // its rim, and what it points out drawn in it: a dot (a spot), a sight (a foe), a ring (an area)
      c.strokeStyle = 'rgba(20,12,4,.9)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, HEAD, 0, Math.PI * 2); c.stroke();
      c.fillStyle = c.strokeStyle = '#1a1208';
      if (m.kind === 'spot') { c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill(); }
      else if (m.kind === 'area') { c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, 6.5, 0, Math.PI * 2); c.stroke(); }
      else {
        c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.stroke();
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          c.beginPath(); c.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4); c.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); c.stroke();
        }
      }
    },
  };
}

// --- the minimap's pings, drawn with it (in its turned frame: `S` px a metre)

function drawOnMap(c: CanvasRenderingContext2D, S: number): void {
  for (const p of pings) {
    const s = shown.get(p), k = pingShown(p);
    if (!s || k <= 0) continue;
    const x = p.x * S, z = p.z * S, colour = pingColour(p.by);
    c.save();
    c.globalAlpha = k;
    c.strokeStyle = c.fillStyle = colour;
    c.shadowColor = '#000';
    c.shadowBlur = 3;
    c.lineWidth = 2;
    if (p.kind === 'area') {
      c.globalAlpha = k * 0.18;
      c.beginPath(); c.arc(x, z, p.r * S, 0, Math.PI * 2); c.fill();
      c.globalAlpha = k;
      c.stroke();
    }
    c.beginPath(); c.arc(x, z, p.kind === 'foe' ? 6 : 3.5, 0, Math.PI * 2);
    if (p.kind === 'foe') c.stroke(); else c.fill();
    // (a ripple running out from it, as on the floor; with reduced motion, none)
    if (!still()) {
      const ripple = (p.age % PING.ripple) / PING.ripple;
      c.globalAlpha = k * (1 - ripple);
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, z, 4 + 12 * ripple, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    const on = c.getTransform().transformPoint(new DOMPoint(x, z));
    s.map = { x: on.x, y: on.y, t: G.time };
  }
}
onMinimap(drawOnMap);

/** What every ping shown here looks like now (tools/lab's co-op judges it against the game that sent it): who sent
 *  it, what and where, and whether its pin and ring show in the world and where the minimap drew it lately. */
export function pingsOnScreen(): {
  slot: number; kind: PingKind; x: number; z: number; r: number; foe: number | null; age: number;
  pin: boolean; ring: boolean; map: [number, number] | null;
}[] {
  return pings.map((p) => {
    const s = shown.get(p);
    const map = s?.map && G.time - s.map.t < 0.1 ? [s.map.x, s.map.y] as [number, number] : null;
    return {
      slot: p.by.slot, kind: p.kind, x: p.x, z: p.z, r: p.r, foe: p.foe?.id ?? null, age: p.age,
      pin: !!s?.pin.shown, ring: !!s?.ring.mesh.visible, map,
    };
  });
}
