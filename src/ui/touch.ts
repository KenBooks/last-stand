// Touch controls for phones and tablets: a floating move stick on the left half of the screen, the
// skill buttons in an arc at the bottom right, pinch to zoom, two fingers twisted to turn the camera (as the middle
// drag turns it with the mouse) and a pause button. It drives
// core/input like the keyboard and mouse do.
//
// Skill buttons: the basic attack, channelled skills and drawn bows act while held, aimed at the nearest foe (a bow looses as it's let go).
// A skill aimed by holding (`SkillDef.aimed`) is held as its key is on the desktop, its own preview showing where it
// would land, and cast as the finger lifts. Other skills cast on release. Either goes where the finger dragged to (a
// plain ring shows the spot for one with no preview of its own), or after a tap at the nearest foe; a movement skill
// (Veilstep) tapped goes the way the move stick points, or the way the hero faces. The mode follows the last input
// used, so touch laptops work too.
import * as THREE from 'three';
import { G } from '../state';
import { input } from '../core/input';
import { cameraYaw, zoomBy } from '../core/renderer';
import { CAMERA } from '../data/balance';
import { additive } from '../core/materials';
import { groundHeight } from '../world/ground';
import { SKILL_KEYS } from '../loot/loadout';
import { makeSkillSlot } from './hud';
import { hideTooltip } from './tooltip';
import { uiScales } from './scale';
import { fullScreenChosen, leaveFullScreen } from './autoFullScreen';
import type { SkillDef, SkillKey } from '../types';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

/** stick travel in px of the stick as drawn (on the screen, that times the touch controls' scale), and how far a skill
 *  drag must go before it aims by hand */
/** which way the camera turns for a twist: the world turning with the fingers, as a map under them would */
const TWIST_WAY = -1;
const STICK_R = 56, DRAG_MIN = 16;
/** px of skill drag per metre of aim distance, and the aim range */
const DRAG_PX_PER_M = 9, AIM_MIN = 2, AIM_MAX = 14;
/** foes this close are aimed at automatically, and how far ahead a tap aims with none (m) */
const AUTO_RANGE = 22, AHEAD = 6;
/** a released cast keeps its key down this long, in case the character is still busy */
const RELEASE_HOLD = 0.35;

interface Stick { id: number; x0: number; y0: number }
interface Press {
  id: number; key: SkillKey; x0: number; y0: number; dx: number; dy: number; dragged: boolean; release: boolean;
  /** held as its key is, the hero showing its own preview (`SkillDef.aimed`) */
  aimed: boolean;
  /** a drag shows where it aims with the plain ring */
  ring: boolean;
  /** the aim the last frame showed, which letting go casts at */
  shown: THREE.Vector3 | null;
}
/** a press let go: its aim, kept until the hero takes the cast up, and whether its key is held down meanwhile (a cast on release) */
interface Released { key: SkillKey; aim: THREE.Vector3; t: number; held: boolean }

let stick: Stick | null = null;
let press: Press | null = null;
let released: Released | null = null;
/** two fingers down: their spread at the last zoom notch, their angle on the screen at the last frame's turn and the
 *  twist since they came down, which turns nothing under `TWIST_START` (a pinch's own wobble) */
let pinch: { d: number; a: number; twist: number } | null = null;
/** how far two fingers twist before the camera turns with them (rad) */
const TWIST_START = 0.14;
let buttons: { key: SkillKey; el: HTMLElement; cd: HTMLElement; cdt: HTMLElement }[] = [];
let ring: THREE.Mesh;
const _aim = new THREE.Vector3();
const listeners: ((touch: boolean) => void)[] = [];

/** Touch mode on/off (a body class that the stylesheet keys off). */
function setTouchMode(on: boolean): void {
  if (input.touchMode === on) return;
  input.touchMode = on;
  document.body.classList.toggle('touch', on);
  if (on) hideTooltip();
  for (const f of listeners) f(on);
}
export const isTouch = (): boolean => input.touchMode;
export function onTouchMode(f: (touch: boolean) => void): void { listeners.push(f); }

export function initTouch(): void {
  // start in touch mode on a device whose main pointer is a finger
  setTouchMode(matchMedia('(pointer: coarse)').matches);
  window.addEventListener('pointerdown', (e) => setTouchMode(e.pointerType !== 'mouse'), true);
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); }, true);

  // move stick: anywhere on the left pad
  const pad = $('#touch-pad'), base = $('#touch-stick'), knob = base.querySelector<HTMLElement>('.knob')!;
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stick) return;
    pad.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    base.style.left = `${e.clientX}px`; base.style.top = `${e.clientY}px`;
    base.classList.add('on');
    knob.style.transform = '';
  });
  pad.addEventListener('pointermove', (e) => {
    if (stick?.id !== e.pointerId) return;
    const dx = e.clientX - stick.x0, dy = e.clientY - stick.y0;
    const d = Math.hypot(dx, dy);
    // (the way the finger points, before the knob is held to the stick's travel: divided by the finger's distance once
    // held, a finger far past the edge pushed less the further it went, half a screen out a slow walk)
    const ux = d ? dx / d : 0, uy = d ? dy / d : 0;
    // (the stick is drawn at the touch controls' scale, its knob moved in the stick's own px: in the finger's, the knob
    // ran 20% ahead of the finger on a large screen and fell behind it on a phone)
    const k = Math.min(1, d / (STICK_R * uiScales.touch));
    knob.style.transform = `translate(${ux * k * STICK_R}px, ${uy * k * STICK_R}px)`;
    // a small dead zone, then full speed from 0.6 of the travel
    const m = k < 0.15 ? 0 : Math.min(1, (k - 0.15) / 0.45);
    input.stick.x = ux * m;
    input.stick.y = uy * m;
  });
  const endStick = (e: PointerEvent) => {
    if (stick?.id !== e.pointerId) return;
    stick = null;
    input.stick.x = input.stick.y = 0;
    base.classList.remove('on');
  };
  pad.addEventListener('pointerup', endStick);
  pad.addEventListener('pointercancel', endStick);
  // the pad hides when the hero falls: the finger's release never reaches it, only the capture is lost
  pad.addEventListener('lostpointercapture', endStick);

  // pinch to zoom and twist to turn, with two fingers anywhere but the buttons
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const angle = (t: TouchList) => Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX);
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2 || press) return;
    pinch = { d: dist(e.touches), a: angle(e.touches), twist: 0 };
    // (a second finger makes it a gesture: the first, on the stick's pad, walks the hero no further)
    if (stick) { stick = null; input.stick.x = input.stick.y = 0; base.classList.remove('on'); }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    const d = dist(e.touches);
    // one zoom notch per 12% change in finger spread
    const n = Math.log(pinch.d / d) / Math.log(1.12);
    if (Math.abs(n) >= 1) { zoomBy(Math.trunc(n)); pinch.d = d; }
    // the world turns with the fingers, a radian of theirs a radian of the camera's (`input.orbit` is in the middle
    // drag's px)
    const a = angle(e.touches);
    const by = Math.atan2(Math.sin(a - pinch.a), Math.cos(a - pinch.a));
    pinch.a = a;
    const before = pinch.twist;
    pinch.twist += by;
    if (Math.abs(pinch.twist) >= TWIST_START) {
      const past = Math.abs(before) >= TWIST_START ? by : pinch.twist - Math.sign(pinch.twist) * TWIST_START;
      input.orbit += (TWIST_WAY * past) / CAMERA.orbitSpeed;
    }
  }, { passive: true });
  window.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  $('#btn-pause').addEventListener('click', () => input.pressed.add('escape'));
  initFullScreen();

  ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2), additive(0xffe0a0, 1.6, 0.9));
  ring.name = 'touch-aim-ring';
  ring.visible = false;
  ring.renderOrder = 5;
  G.scene.add(ring);
}

/**
 * The full screen icon under the pause button, as the pause menu's Fullscreen: the browser's bars take a lot of a
 * phone's screen (from play, "lets also add full screen button near bag, just the icon"). Its arrows say which way it
 * goes, and it's left out where the page can't go full screen (an iPhone's).
 */
function initFullScreen(): void {
  const full = $('#btn-full');
  full.classList.toggle('cant', !document.fullscreenEnabled);
  const syncFull = (): void => { full.classList.toggle('on', !!document.fullscreenElement); };
  full.addEventListener('click', () => {
    if (!document.fullscreenElement) fullScreenChosen();
    if (document.fullscreenElement) leaveFullScreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  });
  document.addEventListener('fullscreenchange', syncFull);
  syncFull();
}

/** Rebuild the skill buttons from the player's loadout (and gear, which can change a key's skill). */
export function buildTouchSkills(): void {
  const box = $('#touch-skills');
  box.innerHTML = '';
  buttons = SKILL_KEYS.map((key) => {
    // (no tooltip: a tap is a cast, and its click opened the skill's card pinned over the buttons, the next tap there
    // landing on the card)
    const el = makeSkillSlot(G.player.skillAt(key)?.def ?? null, key, 'none');
    el.classList.add(`tk-${key}`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (press || !G.player.skillAt(key)) return;
      el.setPointerCapture(e.pointerId);
      const def = G.player.skillAt(key)!.def;
      // the basic attack, channels, drawn bows and skills aimed by holding act while held; the rest wait for the release
      const aimed = !!def.aimed && !def.channel, release = key !== 'mouse0' && !def.channel && !def.draw && !aimed;
      press = { id: e.pointerId, key, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, dragged: false, release, aimed, ring: release || !!def.draw, shown: null };
      // (a press while the hero is busy queues a drawn shot, as a click does)
      if (!release) { input.touch.add(key); input.pressed.add(key); }
      el.classList.add('pressed');
    });
    el.addEventListener('pointermove', (e) => {
      if (press?.id !== e.pointerId) return;
      press.dx = e.clientX - press.x0; press.dy = e.clientY - press.y0;
      if (!press.dragged && Math.hypot(press.dx, press.dy) > DRAG_MIN) press.dragged = true;
    });
    const end = (e: PointerEvent) => {
      if (press?.id !== e.pointerId) return;
      const p = press, lifted = e.type === 'pointerup';
      press = null;
      el.classList.remove('pressed');
      // (cancelled, a skill aimed by holding is given up: its key going up alone casts it)
      if (!lifted) giveUp(p);
      input.touch.delete(p.key);
      if (!lifted || !(p.release || p.aimed)) return;
      // cast where the aim last showed (a tap between two frames: as the press aims now); a cast on release keeps its
      // key down a moment, in case the hero is busy, and an aimed skill's goes up, which casts it
      released = { key: p.key, aim: (p.shown ?? aimFor(p, _aim)).clone(), t: 0, held: p.release };
      if (p.release) input.touch.add(p.key);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    box.appendChild(el);
    return { key, el, cd: el.querySelector<HTMLElement>('.cd')!, cdt: el.querySelector<HTMLElement>('.cdt')! };
  });
}

/** The nearest foe in reach, or a spot a few metres ahead. */
function autoAim(out: THREE.Vector3): THREE.Vector3 {
  const p = G.player.pos;
  let best = AUTO_RANGE;
  let found = false;
  for (const e of G.enemies) {
    if (!e.alive || e.spawning > 0) continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
    if (d < best) { best = d; out.set(e.pos.x, 0, e.pos.z); found = true; }
  }
  if (!found) out.set(p.x + Math.sin(G.player.facing) * AHEAD, 0, p.z + Math.cos(G.player.facing) * AHEAD);
  return out;
}

/** The way on the ground a way across the screen points (`x` right, `y` down, of unit length), as the move keys map it. */
function screenWay(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return out.set(x * cy + y * sy, 0, y * cy - x * sy);
}

/**
 * A movement skill's tap (Veilstep): as far as it reaches the way the move stick points, or the way the hero faces
 * with the stick let go. (At the nearest foe, a tapped blink landed the mage among the foes.)
 */
function moveAim(def: SkillDef, out: THREE.Vector3): THREE.Vector3 {
  const pl = G.player, reach = def.range ?? AHEAD, s = input.stick, len = Math.hypot(s.x, s.y);
  if (len) screenWay(s.x / len, s.y / len, out);
  else out.set(Math.sin(pl.facing), 0, Math.cos(pl.facing));
  return out.set(pl.pos.x + out.x * reach, 0, pl.pos.z + out.z * reach);
}

/** Where a press aims: dragged by hand (screen direction turned into the camera's frame), or as a tap aims its skill. */
function aimFor(p: Press, out: THREE.Vector3): THREE.Vector3 {
  if (!p.dragged) {
    const def = G.player.skillAt(p.key)?.def;
    return def?.tags.includes('movement') ? moveAim(def, out) : autoAim(out);
  }
  const d = Math.hypot(p.dx, p.dy), m = Math.min(AIM_MAX, Math.max(AIM_MIN, d / DRAG_PX_PER_M));
  screenWay(p.dx / d, p.dy / d, out);
  const pl = G.player.pos;
  return out.set(pl.x + out.x * m, 0, pl.z + out.z * m);
}

/** A press of a skill aimed by holding given up (cancelled, the controls hidden): not cast, its preview gone. */
function giveUp(p: Press): void {
  if (p.aimed && G.player.aiming?.key === p.key) G.player.endAim();
}

/** Per frame, before the player updates: the aim point, and whether the controls show at all. */
export function updateTouch(dt: number): void {
  const menu = $('#menu');
  const show = input.touchMode && !G.menuOpen && (G.mode === 'run'
    ? !!G.run && G.player.active
    : menu.classList.contains('stowed'));

  $('#touch').classList.toggle('hidden', !show);
  if (!show && (press || stick)) {
    if (press) giveUp(press);
    press = null; stick = null; input.stick.x = input.stick.y = 0; input.touch.clear();
  }

  input.aim = null;
  ring.visible = false;
  if (released) {
    released.t += dt;
    const sk = G.player.skillAt(released.key);
    // held until the character takes it up (or gives up)
    const started = !sk || G.player.casting?.skill === sk || G.player.cooldownLeft(sk.def.impl) > 0;
    if (started || released.t > RELEASE_HOLD) {
      if (released.held) input.touch.delete(released.key);
      released = null;
    } else input.aim = released.aim;
  }
  if (press) {
    input.aim = aimFor(press, _aim);
    (press.shown ??= new THREE.Vector3()).copy(_aim);
    if (press.dragged && press.ring) {
      ring.visible = true;
      ring.position.set(_aim.x, groundHeight(_aim.x, _aim.z) + 0.06, _aim.z);
    }
  }
  if (!show) return;

  // cooldowns and energy on the buttons, as the hotbar shows them
  const pl = G.player;
  for (const b of buttons) {
    const sk = pl.skillAt(b.key);
    if (!sk) continue;
    const left = pl.cooldownLeft(sk.def.impl), full = pl.cooldownOf(sk.def);
    b.cd.style.setProperty('--p', `${full > 0 ? (left / full) * 100 : 0}%`);
    b.cdt.textContent = left > 0.05 ? (left < 1 ? left.toFixed(1) : String(Math.ceil(left))) : '';
    b.el.classList.toggle('nomana', !pl.sandbox && pl.energy < (sk.def.channel ? sk.def.cost * 0.2 : sk.def.cost));
    b.el.classList.toggle('active', pl.channel?.key === b.key || pl.casting?.skill === sk);
    b.el.classList.toggle('busy', pl.heldUp(sk));
  }
}
