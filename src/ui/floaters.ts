// World-anchored overlays: damage numbers and floating words, and labels over a point of the world (foes' bars, the
// props' gauges, the dummies' meters, the partners' tags), drawn over the frame by the renderer (ui/overlay).
import * as THREE from 'three';
import { G } from '../state';
import { Label, ORDER, layoutLabels } from './overlay/layer';
import { drawText, measure, roundRect, type Shadow, type TextStyle } from './overlay/paint';
import { uiScales } from './scale';
import { groundHeight } from '../world/ground';
import type { Player } from '../entities/player';

type WorldPos = { x: number; y: number; z: number };
export type FloatKind = 'dmg' | 'crit' | 'heal' | 'player' | 'info';

interface Floater { label: Label; x: number; y: number; z: number; t: number; life: number; vx: number }
interface Anchored { label: Label; at: () => WorldPos | null; clamp: boolean; hides: boolean; underHeroes: boolean }

const floats: Floater[] = [];
/** the most floating texts shown at once: past it, the oldest goes to make room (each takes a slot of the label
 *  atlas, which grows with the canvas's ratio: 250 of a heavy fight's take a third to a half of it at any ratio) */
const MAX_FLOATS = 250;
const anchored = new Map<Label, Anchored>();
const v = new THREE.Vector3();

export function project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
  v.set(x, y, z).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 };
}

/** A margin kept from the screen's sides (px of the UI's reference layout, at the HUD's scale). */
export interface ScreenEdge { side: number; top: number; bottom: number }

/**
 * Where a marker for a point of the world goes (css px): over the point where the view shows it within `edge` of the
 * screen's sides, else on that margin on the way from the screen's middle to it, `turn` the way there (rad, as
 * `atan2` of the screen's down and right); `top` and `bottom` are the margin's lines. (A downed partner's marker, a ping.)
 */
export function onScreenOrEdge(x: number, y: number, z: number, edge: ScreenEdge): { x: number; y: number; inView: boolean; turn: number; top: number; bottom: number } {
  const ui = uiScales.hud, w = window.innerWidth, h = window.innerHeight;
  const p = project(x, y, z);
  const left = edge.side * ui, right = w - edge.side * ui, top = edge.top * ui, bottom = h - edge.bottom * ui;
  const inView = !p.behind && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inView) return { x: p.x, y: p.y, inView, turn: 0, top, bottom };
  // (behind the camera, the projection points the other way)
  const cx = w / 2, cy = (top + bottom) / 2;
  const dx = (p.x - cx) * (p.behind ? -1 : 1);
  let dy = (p.y - cy) * (p.behind ? -1 : 1);
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
  const reach = Math.min(Math.abs(dx) > 1e-3 ? (right - cx) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-3 ? (bottom - cy) / Math.abs(dy) : Infinity);
  return { x: cx + dx * reach, y: cy + dy * reach, inView, turn: Math.atan2(dy, dx), top, bottom };
}

/** a damage number's shadows: a dark rim and a soft glow round it */
const FLOAT_SHADOWS: Shadow[] = [
  { x: 0, y: 0, blur: 3, color: '#000' }, { x: 0, y: 2, blur: 3, color: '#000' }, { x: 0, y: 0, blur: 8, color: 'rgba(0,0,0,.8)' },
];
/** each kind of floating text's look (its colour is the caller's: a crit's its damage's, as a plain hit's) */
const FLOAT_STYLE: Record<FloatKind, Omit<TextStyle, 'color'>> = {
  dmg: { face: 'display', weight: 700, size: 17, shadows: FLOAT_SHADOWS },
  crit: { face: 'display', weight: 700, size: 26, shadows: FLOAT_SHADOWS },
  player: { face: 'display', weight: 700, size: 20, shadows: FLOAT_SHADOWS },
  heal: { face: 'display', weight: 700, size: 18, shadows: FLOAT_SHADOWS },
  info: { face: 'body', weight: 500, size: 16, shadows: FLOAT_SHADOWS },
};

/** Art for a line of text in style `s`, with room round it for its shadows. */
export function textArt(text: string, s: TextStyle): { w: number; h: number; paint(c: CanvasRenderingContext2D, scale: number): void } {
  const t = measure(text, s), pad = Math.ceil(Math.max(...(s.shadows ?? []).map((sh) => sh.blur + Math.abs(sh.y)), 0));
  return { w: t.w + pad * 2, h: t.h + pad * 2, paint: (c, scale) => drawText(c, t, pad, pad, s, scale) };
}

/** a prompt's plate (px): round its words, its key's square, and the room left round it for its drop shadow */
const PROMPT = { side: 7, high: 3, key: 19, gap: 6, shade: 9, corner: 5 };

/**
 * Art for what using a thing takes: `key`'s square and `text` on a dark plate with a drop shadow, to read over whatever
 * lies behind it (from play, "need to make hint more stand out": bare words read as part of a notice board's papers).
 */
export function promptArt(key: string, text: string, s: TextStyle): { w: number; h: number; paint(c: CanvasRenderingContext2D, scale: number): void } {
  const plain = { ...s, shadows: [] };
  const words = measure(text, plain), letter = measure(key, plain);
  const inside = Math.max(PROMPT.key, words.h);
  const w = PROMPT.side * 2 + PROMPT.key + PROMPT.gap + words.w, h = inside + PROMPT.high * 2;
  const paint = (c: CanvasRenderingContext2D, scale: number): void => {
    const x = PROMPT.shade, y = PROMPT.shade;
    roundRect(c, x, y, w, h, PROMPT.corner);
    c.fillStyle = 'rgba(14,10,7,.88)';
    c.shadowColor = 'rgba(0,0,0,.9)';
    c.shadowBlur = 7 * scale;
    c.shadowOffsetY = 2 * scale;
    c.fill();
    c.shadowColor = 'transparent';
    c.shadowBlur = c.shadowOffsetY = 0;
    c.strokeStyle = 'rgba(214,170,92,.8)';
    c.lineWidth = 1;
    c.stroke();
    const keyX = x + PROMPT.side, keyY = y + (h - PROMPT.key) / 2;
    roundRect(c, keyX, keyY, PROMPT.key, PROMPT.key, 3);
    c.fillStyle = '#e6c06a';
    c.fill();
    drawText(c, letter, keyX + (PROMPT.key - letter.w) / 2, keyY + (PROMPT.key - letter.h) / 2, { ...plain, color: '#20140a' }, scale);
    drawText(c, words, keyX + PROMPT.key + PROMPT.gap, y + (h - words.h) / 2, plain, scale);
  };
  return { w: w + PROMPT.shade * 2, h: h + PROMPT.shade * 2, paint };
}

export function floatText(x: number, y: number, z: number, text: string | number, kind: FloatKind = 'dmg', color: number | string = 0xffffff): void {
  const col = typeof color === 'number' ? '#' + new THREE.Color(color).getHexString() : color;
  const label = new Label(ORDER.float);
  label.show(textArt(kind === 'crit' ? `${text}!` : String(text), { ...FLOAT_STYLE[kind], color: col }));
  label.ax = label.ay = 0.5;
  if (floats.length >= MAX_FLOATS) floats.shift()!.label.remove();
  floats.push({ label, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, t: 0, life: kind === 'crit' ? 1.1 : 0.85, vx: (Math.random() - 0.5) * 40 });
}

/** how far a clamped label keeps from the screen's edges (px of the UI's reference layout, at the HUD's scale) */
const CLAMP = { side: 40, top: 40, bottom: 110 };

/** A label over a point of the world (`at` gives it each frame; null hides it): `clamp` keeps it on screen, above the
 *  hotbar and below the top (a tall prop seen from close by reaches past the frame); `hides` hides it behind a prop
 *  (`behindProp`: a foe's bar, a dummy's name; a partner's tag shows through, to find them by); `underHeroes` hides
 *  it where a hero nearer the camera covers it on the screen (`behindHero`: a dummy's meter; not a foe's bar, which a
 *  foe ahead of him would lose over his head in a fight). */
export function anchorLabel(order: number, at: () => WorldPos | null, clamp = false, hides = false, underHeroes = false): Label {
  const label = new Label(order);
  anchored.set(label, { label, at, clamp, hides, underHeroes });
  return label;
}

/** how far round a thing a prop is taken as its own (its stand, the dummy's own post), past the prop's circle (m) */
export const OWN_PROP = 0.4;

/**
 * Whether a prop stands between the camera and `to`: the line to it passes through a prop's column (its circle, from
 * the floor under it up its height). The props round `to` (its own) and round the camera (dissolved round the hero,
 * `seeThrough`) don't hide it. Labels are drawn over the frame, so nothing in the scene hides them by itself.
 */
export function behindProp(to: WorldPos): boolean {
  const from = G.camera.position;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, a = dx * dx + dz * dz;
  if (a < 1e-6) return false;
  for (const o of G.arena.obstacles) {
    if (Math.hypot(to.x - o.x, to.z - o.z) < o.r + OWN_PROP || Math.hypot(from.x - o.x, from.z - o.z) < o.r) continue;
    const ox = from.x - o.x, oz = from.z - o.z, b = ox * dx + oz * dz, c = ox * ox + oz * oz - o.r * o.r;
    const disc = b * b - a * c;
    if (disc <= 0) continue;
    const t0 = Math.max(0, (-b - Math.sqrt(disc)) / a), t1 = Math.min(1, (-b + Math.sqrt(disc)) / a);
    if (t0 >= t1) continue;
    const top = groundHeight(o.x, o.z) + o.h;
    if (Math.min(from.y + dy * t0, from.y + dy * t1) < top) return true;
  }
  return false;
}

/** a hero's body on the screen as a label hides behind it: his joints' outline (`BODY_JOINTS`), each this far round
 *  (m: a sleeve, a robe, the flesh round a bone), and the top of his head this far over its joint (a hood, a helm) */
const BODY_ROUND = 0.15;
const HEAD_TOP = 0.3;
/** the joints his outline is taken from */
const BODY_JOINTS = ['head', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR', 'hips', 'kneeL',
  'kneeR', 'ankleL', 'ankleR'] as const;
const jointAt = new THREE.Vector3();

/** A box on the screen (css px). */
interface ScreenBox { left: number; top: number; right: number; bottom: number }

/** A label's box on the screen were it placed at `x`, `y` (css px), as the overlay draws it (`layoutLabels`). */
function labelBox(label: Label, x: number, y: number): ScreenBox {
  const k = uiScales[label.sizedBy] * label.scale, { w, h } = label.size, a = label.anchorAt;
  const left = x - a.x * k, top = y - a.y * k;
  return { left, top, right: left + w * k, bottom: top + h * k };
}

/** `hero`'s outline on the screen from his joints, each `BODY_ROUND` round and his head's top over it (null: none
 *  of it before the camera). What he holds, a staff's crystal over his head, isn't him. */
function heroOutline(hero: Player, camera: THREE.PerspectiveCamera): ScreenBox | null {
  const joints = hero.model.joints;
  if (!joints) return null;
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const add = (point: THREE.Vector3, round: number) => {
    const distance = point.distanceTo(camera.position);
    const p = project(point.x, point.y, point.z);
    if (p.behind || distance < 1e-3) return;
    const r = round * window.innerHeight / (2 * distance * tan);
    box.left = Math.min(box.left, p.x - r);
    box.right = Math.max(box.right, p.x + r);
    box.top = Math.min(box.top, p.y - r);
    box.bottom = Math.max(box.bottom, p.y + r);
  };
  for (const name of BODY_JOINTS) add(joints[name].getWorldPosition(jointAt), BODY_ROUND);
  add(joints.head.getWorldPosition(jointAt).setY(jointAt.y + HEAD_TOP), BODY_ROUND);
  return Number.isFinite(box.top) ? box : null;
}

/**
 * Whether a hero nearer the camera than `to` covers `label` on the screen there: its box over his outline (his
 * joints'). From play: "dummy labels appear on top of the character, they should hide" (a dummy's meter hung down
 * over the mage's hood). A hero hidden, fallen or round the camera (his own eyes) doesn't.
 */
export function behindHero(label: Label, to: WorldPos, x: number, y: number): boolean {
  const camera = G.camera as THREE.PerspectiveCamera, from = camera.position;
  const far = Math.hypot(to.x - from.x, to.z - from.z);
  const box = labelBox(label, x, y);
  for (const hero of G.players) {
    if (!hero.alive || !hero.obj.visible) continue;
    const near = Math.hypot(hero.pos.x - from.x, hero.pos.z - from.z);
    if (near < BODY_ROUND * 3 || near >= far) continue;
    const outline = heroOutline(hero, camera);
    if (!outline) continue;
    const covered = box.right > outline.left && box.left < outline.right
      && box.bottom > outline.top && box.top < outline.bottom;
    if (covered) return true;
  }
  return false;
}

/** The labels anchored to the world, each with where it's anchored now and whether it's held on the screen
 *  (tools/lab measures them against the camera). */
export function anchoredLabels(): { label: Label; at: WorldPos | null; clamp: boolean }[] {
  return [...anchored.values()].map((a) => ({ label: a.label, at: a.at(), clamp: a.clamp }));
}

/** Takes an anchored label off the screen for good. */
export function removeLabel(label: Label | null | undefined): void {
  if (!label) return;
  anchored.delete(label);
  label.remove();
}

/** Every label where it shows now (run after the camera has moved), and the frame's draw of them laid out. */
export function updateFloaters(dt: number): void {
  // (a float's rise and drift are px of the UI's reference layout, as its text is)
  const u = uiScales.hud;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { f.label.remove(); floats.splice(i, 1); continue; }
    const p = project(f.x, f.y, f.z);
    const rise = 60 * (1 - (1 - k) ** 2);
    f.label.shown = !p.behind;
    f.label.x = p.x + f.vx * k * u;
    f.label.y = p.y - rise * u;
    f.label.scale = f.t < 0.12 ? 1 + (0.12 - f.t) * 6 : 1;
    f.label.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  }
  for (const a of anchored.values()) {
    const w = a.at();
    const p = w ? project(w.x, w.y, w.z) : null;
    a.label.shown = !!p && !p.behind && !(a.hides && behindProp(w!));
    if (!a.label.shown || !p) continue;
    a.label.x = a.clamp ? Math.min(window.innerWidth - CLAMP.side * u, Math.max(CLAMP.side * u, p.x)) : p.x;
    a.label.y = a.clamp ? Math.min(window.innerHeight - CLAMP.bottom * u, Math.max(CLAMP.top * u, p.y)) : p.y;
    if (a.underHeroes && behindHero(a.label, w!, a.label.x, a.label.y)) a.label.shown = false;
  }
  layoutHooks.forEach((hook) => hook());
  layoutLabels();
}

/** what places labels of its own each frame (the floor's names, stacked; a downed partner's marker), after the camera */
const layoutHooks: (() => void)[] = [];
/** Runs `hook` every frame where the labels are placed: after the camera, before they're drawn. */
export function onLayout(hook: () => void): void { layoutHooks.push(hook); }

export function clearFloaters(): void {
  for (const f of floats) f.label.remove();
  floats.length = 0;
}
