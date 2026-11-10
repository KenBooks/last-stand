// Co-op pings on screen (game/ping.ts holds them): Left Shift held shows the ping letting go would make, placed as the
// aim moves (on the foe Quarry Mark's aim would take, else the spot; over the minimap, its spot), and let go makes it
// there, as the mage's Veilstep shows its landing while held and goes as it's let go (from play: "while I hold it should
// change the mark placement, ground or mob, then release to commit"); on touch a finger held on the minimap, placed as
// it moves and made as it lifts. Each ping shows in the world (a ring of one size laid on the floor round its spot or
// under its foe, and a pin over it with who pinged and how
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
import { ping, pings, foeAimed, foeAt, foeNear, updatePings, pingShown, type Ping, type PingKind } from '../game/ping';
import { outline } from './overlay/outline';
import { Label, ORDER } from './overlay/layer';
import { drawText, measure, OUTLINE, type TextStyle } from './overlay/paint';
import { onLayout, onScreenOrEdge, project } from './floaters';
import { MINIMAP_METRES, onMinimap } from './hud';
import { nameOf } from './coop';
import { uiScales } from './scale';
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

// --- input: Left Shift held and let go, a finger held on the minimap and lifted

/** where a ping would go: the arena's point, and the foe it would point out */
interface Aim { x: number; z: number; foe: Enemy | null }

/** whether Left Shift is held, a ping shown where letting go would make it */
let held = false;
/** a finger on the minimap: where it went down and is now (css px), and how long it has been there (s); past
 *  `PING.longPress` it shows the ping it would make, placed as it moves, and lifted it makes it */
let press: { id: number; x0: number; y0: number; x: number; y: number; t: number } | null = null;
/** a finger lifted from the minimap after its long press, its ping to make this frame */
let lifted: { x: number; y: number } | null = null;

/** The ping the minimap's point (x, y) of the page (css px) would make: the foe there, else its spot; none off it. */
function onMap(x: number, y: number): Aim | null {
  const m = mapToWorld(x, y);
  return m ? aimAt(m.x, m.z, foeNear(m.x, m.z, PING.mapFoeNear)) : null;
}

/** A ping's place: centred on its foe as it's drawn (`foeAt`), else at (x, z). */
function aimAt(x: number, z: number, foe: Enemy | null): Aim {
  return foe ? { ...foeAt(foe), foe } : { x, z, foe: null };
}

/** What a ping now would point out: the minimap's spot under the pointer (the foe there), else the foe the aim is on,
 *  else the spot it's on. */
function aimNow(): Aim {
  if (!pointerLocked() && !input.centerAim) {
    const m = onMap(input.mouse.x, input.mouse.y);
    if (m) return m;
  }
  return aimAt(input.ground.x, input.ground.z, foeAimed(input.ground));
}

/** The local player's ping where `aim` stands. */
function pingAt(aim: Aim): void {
  ping({ k: aim.foe ? 'foe' : 'spot', x: aim.x, z: aim.z }, aim.foe);
}

function bindMinimap(): void {
  const c = mapCanvas();
  if (!c || c.dataset.pings) return;
  c.dataset.pings = '1';
  c.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: 0 };
    e.preventDefault();
  });
  c.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    press.x = e.clientX; press.y = e.clientY;
    // (moved before its long press, it's no ping; after it, the ping goes where the finger goes)
    if (press.t < PING.longPress && Math.hypot(press.x - press.x0, press.y - press.y0) > PING.pressSlop) press = null;
  });
  c.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.t >= PING.longPress) lifted = { x: e.clientX, y: e.clientY };
    press = null;
  });
  c.addEventListener('pointercancel', (e) => { if (press && e.pointerId === press.id) press = null; });
  // (a long press is the browser's context menu too)
  c.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** the foe this game outlines as the one Left Shift let go would ping (held by us: anything else's outline is its own) */
let outlined = false;
/** the outline's colour on the foe a ping would take */
const PING_OUTLINE = 0xffd04a;

/**
 * Every frame (after the heroes moved, their aim with them): the pings age, and the local player's input: Left Shift held
 * shows the ping letting go would make where the aim is now, and let go makes it there; a finger held on the minimap
 * likewise, made as it lifts. Nothing goes to the party before then. `allowed`: the player is playing (a run, or the
 * lobby's practice), not in a menu.
 */
export function updatePingInput(dt: number, allowed: boolean): void {
  updatePings(dt);
  bindMinimap();
  const can = allowed && isCoop();
  let would: Aim | null = null;
  if (press) press.t += dt;
  if (can && press && press.t >= PING.longPress) would = onMap(press.x, press.y);
  if (lifted) {
    const made = can ? onMap(lifted.x, lifted.y) : null;
    if (made) pingAt(made);
    lifted = null;
  }
  const key = can && !input.touchMode && isDown('shiftleft');
  if (key) {
    held = true;
    would = aimNow();
  } else if (held) {
    if (can) pingAt(aimNow());
    held = false;
  }
  // (Quarry Mark's aim outlines its own foe)
  const foe = would?.foe ?? null;
  if (foe && !G.player.aiming) { outline(foe.obj, PING_OUTLINE); outlined = true; }
  else if (outlined) { if (!G.player.aiming) outline(null); outlined = false; }
  previewing = would;
  hint(would ? (would.foe ? 'foe' : 'spot') : null);
}

/** where the held key (or finger) would ping now, shown as a preview while it's held (placed with the labels) */
let previewing: Aim | null = null;

// --- the hint while Left Shift is held

let hintEl: HTMLElement | null = null;
let hinted: PingKind | null = null;
const HINTS: Record<PingKind, string> = {
  spot: 'Release to ping this spot to everyone',
  foe: 'Release to ping this foe to everyone',
};
function hint(kind: PingKind | null): void {
  if (kind === hinted) return;
  hinted = kind;
  if (!hintEl) {
    hintEl = document.createElement('div');
    hintEl.className = 'pinghint hidden';
    hintEl.innerHTML = '<kbd>Shift</kbd><span></span>';
    document.querySelector('#hud')?.appendChild(hintEl);
  }
  hintEl.classList.toggle('hidden', !kind);
  if (kind) hintEl.querySelector('span')!.textContent = HINTS[kind];
}

// --- the rings on the floor

/** a ring's band across (m) */
const BAND = 0.16;
/** how far over the ground the rings lie (m) */
const LIFT = 0.05;

/** A ring of radius 1 laid by `lay`, its band `BAND` wide at radius `PING.radius`, every ping's. */
const ringGeo = (): THREE.BufferGeometry => floorPatch(1 - BAND / PING.radius, 1, 1, 48);

/** One of the warm-up's samples (game/warmup.ts): a ping's ring, so its program compiles at load. */
export function pingSamples(): THREE.Object3D[] {
  const ring = new THREE.Mesh(ringGeo(), additive(PING_GOLD, 1.4, 0.8));
  ring.name = 'ping ring';
  return [ring];
}

/** A ring on the floor: its mesh, geometry and material, where it was last laid. */
class FloorRing {
  readonly geo: THREE.BufferGeometry;
  readonly mat: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  private laid = '';
  constructor(colour: string) {
    this.geo = ringGeo();
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

// --- the preview while the key is held: the ping letting go would make, its ring and pin shown faint and still

/** how strongly the preview shows, of a ping's */
const PREVIEW = 0.45;
/** the preview's ring and pin */
let previewRing: FloorRing | null = null;
/** a pin: its label, what it last showed (painted again only when it changes), and whether it's held at the edge */
interface Pin { label: Label; look: string; edge?: boolean }
let previewPin: Pin | null = null;

function placePreview(): void {
  const p = previewing;
  if (!p) {
    previewRing?.place(0, 0, PING.radius, 0);
    if (previewPin) previewPin.label.shown = false;
    return;
  }
  const colour = pingColour(G.player);
  previewRing ??= new FloorRing(colour);
  previewRing.place(p.x, p.z, PING.radius, 0.85 * PREVIEW);
  previewPin ??= { label: new Label(ORDER.ping), look: '' };
  placePin(previewPin, p.foe ? 'foe' : 'spot', nameOf(G.player), colour, p.x, p.z, p.foe, PREVIEW, 1);
}

// --- each ping shown: its rings, its pin over it, where the minimap last drew it

interface Shown {
  ring: FloorRing;
  ripple: FloorRing;
  /** its pin, and what it last showed (painted again only when it changes) */
  pin: Pin;
  /** where the minimap last drew it (its canvas's px) and when (G.time) */
  map: { x: number; y: number; t: number } | null;
}
const shown = new Map<Ping, Shown>();

function shownOf(p: Ping): Shown {
  let s = shown.get(p);
  if (s) return s;
  const colour = pingColour(p.by);
  s = {
    ring: new FloorRing(colour),
    ripple: new FloorRing(colour),
    pin: { label: new Label(ORDER.ping), look: '' },
    map: null,
  };
  s.pin.label.shown = false;
  shown.set(p, s);
  return s;
}

function drop(p: Ping, s: Shown): void {
  s.ring.dispose(); s.ripple.dispose();
  s.pin.label.remove();
  shown.delete(p);
}

/** how far in from the screen's sides a pin's head stays (px, at the HUD's scale): off screen it's held near the
 *  edge (in first person most pings are off screen, and its arrow there is the way to turn: from play, "near the edge
 *  of screen is better"), clear of the hotbar; the minimap it's kept off by `offMinimap` */
const EDGE = { side: 44, top: 46, bottom: 150 };
/** how far a pin's head keeps from the minimap's box (px, at the HUD's scale) */
const MINIMAP_ROOM = 48;

/** the minimap's box on the page (css px), read again twice a second or as the window's size changes (reading it
 *  each frame would lay the page out each frame, the HUD's text changed) */
let mapBox: { box: DOMRect | null; t: number; w: number; h: number } = { box: null, t: -Infinity, w: 0, h: 0 };
function minimapBox(): DOMRect | null {
  const w = window.innerWidth, h = window.innerHeight;
  if (G.time - mapBox.t > 0.5 || w !== mapBox.w || h !== mapBox.h) {
    const c = mapCanvas(), box = c?.getBoundingClientRect() ?? null;
    mapBox = { box: box && box.width > 0 ? box : null, t: G.time, w, h };
  }
  return mapBox.box;
}

/** A pin held at the screen's edge moved off the minimap: along the top edge to its left, down the right edge below it. */
function offMinimap(at: { x: number; y: number; top: number }): void {
  const box = minimapBox();
  if (!box) return;
  const room = MINIMAP_ROOM * uiScales.hud;
  if (at.x < box.left - room || at.y > box.bottom + room) return;
  if (at.y <= at.top + 1) at.x = box.left - room;
  else at.y = box.bottom + room;
}
/** how high a pin's point floats over a foe's head (m) */
const OVER_FOE = 0.35;

/**
 * A pin (its label, and the look it last painted) placed over (x, z), or over `foe`'s head: where the view shows it,
 * else at the screen's edge with an arrow the way to it; `alpha` strong and `scale` large.
 */
function placePin(pin: Pin, kind: PingKind, name: string, colour: string, x: number, z: number, foe: Enemy | null, alpha: number, scale: number): void {
  const y = foe ? foe.obj.position.y + foe.overHead + OVER_FOE : groundHeight(x, z);
  const at = onScreenOrEdge(x, y, z, EDGE);
  if (!at.inView) offMinimap(at);
  // (held at the top edge, its words go under it, on the screen)
  const below = !at.inView && at.y <= at.top + 1;
  const far = `${Math.round(Math.hypot(x - G.player.pos.x, z - G.player.pos.z))} m`;
  // (the way to it in steps of 4 degrees: painted again a few times as the view turns, not every frame)
  const turn = at.inView ? 0 : Math.round(at.turn / (Math.PI / 45)) * (Math.PI / 45);
  const look = `${kind}|${name}|${far}|${colour}|${at.inView ? '' : turn}|${below}`;
  if (look !== pin.look) {
    pin.look = look;
    pin.label.show(pinArt({ kind, name, far, colour, edge: !at.inView, turn, below }));
  }
  pin.edge = !at.inView;
  const l = pin.label, art = l.size;
  l.shown = alpha > 0.002;
  l.alpha = alpha;
  l.x = at.x;
  l.y = at.y;
  l.ax = 0.5;
  l.ay = (at.inView ? art.h : below ? PIN_BOX / 2 : art.h - PIN_BOX / 2) / art.h;
  l.scale = scale;
}

/** Every ping's rings and pin where they show now, and the held key's preview (after the camera moved, with the
 *  rest of the labels). */
function placePings(): void {
  for (const [p, s] of shown) if (!pings.includes(p)) drop(p, s);
  for (const p of pings) {
    const s = shownOf(p), k = pingShown(p);
    const ripple = (p.age % PING.ripple) / PING.ripple;
    s.ring.place(p.x, p.z, p.r, 0.85 * k);
    // (a ripple running out from the middle to the ring, fading as it goes; with reduced motion, none)
    s.ripple.place(p.x, p.z, p.r * (0.15 + 0.85 * ripple), still() ? 0 : 0.6 * (1 - ripple) * k);
    // (it drops into place as it comes; with reduced motion, it fades in alone)
    const scale = !still() && p.age < 0.25 ? 1 + (0.25 - p.age) * 1.6 : 1;
    placePin(s.pin, p.kind, nameOf(p.by), pingColour(p.by), p.x, p.z, p.foe, k, scale);
  }
  placePreview();
}
onLayout(placePings);

// --- the pin's art: who and how far over a pin standing on its point, or at the screen's edge an arrow the way to it

const NAME: TextStyle = { face: 'display', size: 16, color: '#fff4dc', spacing: 0.4, shadows: OUTLINE };
const FAR: TextStyle = { face: 'body', size: 13, color: '#e8e0d0', shadows: OUTLINE };
/** the box round the pin's head (px of the UI's reference layout), its head in its middle and its point at its foot */
const PIN_BOX = 84;
const HEAD = 13;

interface PinLook { kind: PingKind; name: string; far: string; colour: string; edge: boolean; turn: number; below?: boolean }

function pinArt(m: PinLook): { w: number; h: number; paint(c: CanvasRenderingContext2D, s: number): void } {
  const name = measure(m.name, NAME), far = measure(m.far, FAR);
  const words = name.h + far.h, pad = 6;
  const w = Math.max(PIN_BOX, name.w + pad * 2, far.w + pad * 2), h = words + PIN_BOX;
  return {
    w, h,
    paint(c, s) {
      const cx = w / 2, cy = m.below ? PIN_BOX / 2 : words + PIN_BOX / 2, top = m.below ? PIN_BOX : 0;
      drawText(c, name, cx - name.w / 2, top, NAME, s);
      drawText(c, far, cx - far.w / 2, top + name.h, FAR, s);
      c.save();
      c.shadowColor = 'rgba(0,0,0,.85)';
      c.shadowBlur = 5 * s;
      c.fillStyle = m.colour;
      if (m.edge) {
        // the arrow out past the head, the way to it (to turn, in first person)
        c.save();
        c.translate(cx, cy);
        c.rotate(m.turn);
        c.beginPath(); c.moveTo(HEAD + 5, -13); c.lineTo(HEAD + 28, 0); c.lineTo(HEAD + 5, 13); c.closePath(); c.fill();
        c.restore();
      } else {
        // the pin's point, down to the foot of its box (on the spot, or over the foe's head)
        c.beginPath(); c.moveTo(cx - HEAD * 0.7, cy + HEAD * 0.6); c.lineTo(cx, cy + PIN_BOX / 2); c.lineTo(cx + HEAD * 0.7, cy + HEAD * 0.6); c.closePath(); c.fill();
      }
      c.beginPath(); c.arc(cx, cy, HEAD, 0, Math.PI * 2); c.fill();
      c.restore();
      // its rim, and what it points out drawn in it: a dot (a spot), a sight (a foe)
      c.strokeStyle = 'rgba(20,12,4,.9)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, HEAD, 0, Math.PI * 2); c.stroke();
      c.fillStyle = c.strokeStyle = '#1a1208';
      if (m.kind === 'spot') { c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill(); }
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

/** The held key's preview as it shows now (tools/lab's co-op judges it): what letting go would ping and where, and
 *  whether its pin and ring show; none while the key isn't held. */
export function pingPreview(): { kind: PingKind; x: number; z: number; pin: boolean; ring: boolean } | null {
  const p = previewing;
  if (!p) return null;
  return { kind: p.foe ? 'foe' : 'spot', x: p.x, z: p.z, pin: !!previewPin?.label.shown, ring: !!previewRing?.mesh.visible };
}

/** Where a foe's middle shows across the screen (css px), at its head's height (the pin's place over it). */
function projectFoe(foe: Enemy): number {
  const at = foe.obj.position;
  return project(at.x, at.y + foe.overHead + OVER_FOE, at.z).x;
}

/** What every ping shown here looks like now (tools/lab's co-op judges it against the game that sent it): who sent
 *  it, what and where, and whether its pin and ring show in the world and where the minimap drew it lately. */
export function pingsOnScreen(): {
  slot: number; kind: PingKind; x: number; z: number; r: number; foe: number | null; age: number;
  pin: boolean; ring: boolean; map: [number, number] | null; edge: boolean; head: [number, number];
  /** a foe's ping in view: how far its pin's point stands across the screen from the foe's middle (css px) */
  offFoe: number | null;
}[] {
  return pings.map((p) => {
    const s = shown.get(p);
    const map = s?.map && G.time - s.map.t < 0.1 ? [s.map.x, s.map.y] as [number, number] : null;
    return {
      slot: p.by.slot, kind: p.kind, x: p.x, z: p.z, r: p.r, foe: p.foe?.id ?? null, age: p.age,
      pin: !!s?.pin.label.shown, ring: !!s?.ring.mesh.visible, map,
      edge: !!s?.pin.edge, head: [s?.pin.label.x ?? 0, s?.pin.label.y ?? 0],
      offFoe: p.foe && s && !s.pin.edge ? Math.abs(s.pin.label.x - projectFoe(p.foe)) : null,
    };
  });
}
