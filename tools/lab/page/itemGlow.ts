// tools/lab `glow`: a worn item's glow in its rarity's colour (#404, src/entities/models/itemGlow.ts), read back from
// the frame drawn as the player sees it, close up from his front and his back. The hero wears every item his class
// shows, in a player's colour (green by default: "green on green should work"); each slot's item is given the rarity
// alone, and the frame drawn with its glow and without (`ITEM_GLOW.strength` 0) at the same moment, so what it adds
// is its glow and nothing else (his gear set again between the two could seat his hands anew). From play: "slight
// glow, not much, no light source", "should not make it flat", "subtly animated (slowly)", "make sure glow is
// continuous/looped and not jumping". Then its tendrils over time, the hero held still and the glow's clock alone
// moved on: how far they move between samples, and the glow a whole cycle on against now (a loop draws the same).
// Its canary makes the glow ten times as strong (too bright), nothing (unseen), and is a loop judged a little past
// a cycle (a join).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { ITEM_GLOW, tickItemGlow } from '../../../src/core/materials';
import { RARITIES } from '../../../src/data/items';
import type { HeroColourId } from '../../../src/data/heroColours';
import type { Gear, GlowSlot, RarityId } from '../../../src/types';
import type { Lab, Pictured, Report, ViewName } from './lab';

/** What `lab glow` takes. */
export interface GlowOptions {
  colour: HeroColourId;
  rarity: RarityId;
  pictures: boolean;
  canary?: boolean;
  /** `--tune`'s values, set before the set-up (`itemGlow.strength=0.1`) */
  tune?: Record<string, number[]>;
}

/** every slot a hero shows an item in, and each class's (the ranger has no off-hand) */
const SLOTS: GlowSlot[] = ['weapon', 'offhand', 'head', 'chest', 'hands'];
const SHOWN: Record<string, GlowSlot[]> = { ranger: ['weapon', 'head', 'chest', 'hands'] };
/** the close-ups measured: the hero's front and back fill them */
const VIEWS: ViewName[] = ['front', 'back'];

/** a pixel the glow added this much light to (linear, a share of white) is lit by it */
const LIT = 0.002;
/** the least of the close-ups a slot's glow must light (its item seen glowing) */
const SEEN_LEAST = 0.002;
/** the most light the glow may add to its pixels (their 99th percentile: "slight glow, not much"): its brightest are
 *  the thin edges it rims, a blade's or a glove's outline (0.18 to 0.19 as tuned, its median 0.005 to 0.05) */
const ADDED_MOST = 0.25;
/** the most of the pixels it lights that it may light evenly (within a fifth of their median): a glow all over its
 *  item in one light is the flat tint ruled out ("it cannot be item highlight") */
const EVEN_MOST = 0.5;
/** the least its light's hue may lean the rarity's way (the cosine between their chromas) */
const HUE_LEAST = 0.9;

/** the seconds between the motion's samples and how many; the most its pixels may change between two (their mean
 *  change, a share of its mean light: "slowly") and the least ("animated"); the most a cycle on may differ from now
 *  (a loop: the same pixels but for the GPU's rounding), and where the canary judges it, past a cycle */
const SAMPLE_EVERY = 0.1;
const SAMPLES = 40;
const STEP_MOST = 0.5;
const STEP_LEAST = 0.05;
const LOOP_MOST = 0.01;
const PAST_CYCLE = 0.5;

/** Pixels as linear light, each channel a share of white, 4 a pixel. */
type Light = Float32Array;

/** What a glow added to the close-ups. */
interface Added {
  /** the share of them it lit (`LIT`) */
  lit: number;
  /** its total light, and the 99th percentile and median of what it added to a pixel it lit */
  total: number;
  p99: number;
  median: number;
  /** the share of its lit pixels within a fifth of the median */
  even: number;
  /** its light's colour (linear, summed) */
  colour: THREE.Color;
}

/** The close-ups drawn now, as linear light (8-bit sRGB read through gamma 2.2, as light.ts reads an SDR frame). */
function drawLight(lab: Lab): Light {
  const parts = lab.drawn(VIEWS).map(({ canvas }) => {
    const context = canvas.getContext('2d')!;
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  });
  const light = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) light[at++] = (part[index] / 255) ** 2.2;
  }
  return light;
}

/** The close-ups drawn now with the glow at `strength` and its clock at `time` (its uniforms set at once, the frame
 *  not stepped). */
function drawnAt(lab: Lab, strength: number, time: number): Light {
  ITEM_GLOW.strength = strength;
  tickItemGlow(time);
  return drawLight(lab);
}

/** What `after` adds to `before`, pixel by pixel. */
function addedBy(before: Light, after: Light): Added {
  const pixels = before.length / 4;
  const lights: number[] = [];
  const colour = new THREE.Color(0, 0, 0);
  for (let at = 0; at < before.length; at += 4) {
    const red = after[at] - before[at];
    const green = after[at + 1] - before[at + 1];
    const blue = after[at + 2] - before[at + 2];
    const light = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (light < LIT) continue;
    lights.push(light);
    colour.r += Math.max(0, red);
    colour.g += Math.max(0, green);
    colour.b += Math.max(0, blue);
  }
  lights.sort((a, b) => a - b);
  const total = lights.reduce((sum, light) => sum + light, 0);
  const median = lights[Math.floor(lights.length / 2)] ?? 0;
  const near = lights.filter((light) => Math.abs(light - median) <= median / 5).length;
  const p99 = lights[Math.min(lights.length - 1, Math.floor(lights.length * 0.99))] ?? 0;
  return { lit: lights.length / pixels, total, p99, median, even: near / Math.max(1, lights.length), colour };
}

/** What the glow at `strength` adds now, its clock at `time` (drawn with it and without). */
function glowNow(lab: Lab, strength: number, time = G.time): Added {
  const plain = drawnAt(lab, 0, time);
  return addedBy(plain, drawnAt(lab, strength, time));
}

/** The glow's own light, pixel by pixel (drawn with it, less without), its clock at `time`. */
function glowLight(lab: Lab, strength: number, time: number): Float32Array {
  const plain = drawnAt(lab, 0, time);
  const lit = drawnAt(lab, strength, time);
  const light = new Float32Array(plain.length / 4);
  for (let pixel = 0; pixel < light.length; pixel++) {
    const at = pixel * 4;
    const red = lit[at] - plain[at];
    const green = lit[at + 1] - plain[at + 1];
    const blue = lit[at + 2] - plain[at + 2];
    light[pixel] = Math.max(0, 0.2126 * red + 0.7152 * green + 0.0722 * blue);
  }
  return light;
}

/** How far two of the glow's lights differ: their pixels' mean change, a share of their mean light. */
function apart(one: Float32Array, other: Float32Array): number {
  let change = 0;
  let light = 0;
  for (let pixel = 0; pixel < one.length; pixel++) {
    change += Math.abs(one[pixel] - other[pixel]);
    light += (one[pixel] + other[pixel]) / 2;
  }
  return light > 0 ? change / light : 0;
}

/** A colour's chroma: itself less its grey. */
function chromaOf(colour: THREE.Color): THREE.Vector3 {
  const grey = (colour.r + colour.g + colour.b) / 3;
  return new THREE.Vector3(colour.r - grey, colour.g - grey, colour.b - grey);
}

/** How far `colour`'s hue leans `rarity`'s way: the cosine between their chromas. */
function hueLean(colour: THREE.Color, rarity: RarityId): number {
  const own = chromaOf(colour);
  const wanted = chromaOf(new THREE.Color(RARITIES.find((r) => r.id === rarity)!.color));
  if (!own.length() || !wanted.length()) return 0;
  return own.dot(wanted) / (own.length() * wanted.length());
}

/** The hero's items each at the rarity `rarities` gives its slot (none: no glow). */
function wearRarities(lab: Lab, rarities: Gear['rarity']): void {
  const gear = { ...lab.player.gear, rarity: rarities };
  lab.player.gear = gear;
  lab.model.setGear?.(gear);
}

/** Every one of `slots` at `rarity`. */
function allAt(slots: GlowSlot[], rarity: RarityId): Gear['rarity'] {
  return Object.fromEntries(slots.map((slot) => [slot, rarity]));
}

const pct = (share: number): string => `${(share * 100).toFixed(2)}%`;

/** A slot's glow at `rarity` and `strength`: seen, faint, not flat, in its hue; and a Magic item's none. */
function judgeSlot(lab: Lab, slot: GlowSlot, rarity: RarityId, strength: number, problems: string[]): string {
  wearRarities(lab, { [slot]: rarity });
  const added = glowNow(lab, strength);
  wearRarities(lab, { [slot]: 'magic' });
  const magic = glowNow(lab, strength);
  const lean = hueLean(added.colour, rarity);
  if (added.lit < SEEN_LEAST) problems.push(`${slot}: its glow lit ${pct(added.lit)} of the close-ups, unseen`);
  if (added.p99 > ADDED_MOST) problems.push(`${slot}: its glow added ${added.p99.toFixed(3)} of white, too bright`);
  if (added.even > EVEN_MOST) problems.push(`${slot}: ${pct(added.even)} of its glow in one light, flat`);
  if (lean < HUE_LEAST) problems.push(`${slot}: its glow's hue leans ${lean.toFixed(2)} the rarity's way`);
  if (magic.lit > 0) problems.push(`${slot}: a Magic item glowed (${pct(magic.lit)} of the close-ups)`);
  return `${slot}: lit ${pct(added.lit)} of the close-ups, added p99 ${added.p99.toFixed(4)}, median `
    + `${added.median.toFixed(4)}, ${pct(added.even)} even, hue ${lean.toFixed(2)}`;
}

/** The glow over time, every slot at `rarity`: its pixels' steps between samples. The hero held as he stands and
 *  its clock alone moved on (his idle's sway and glance moved what it lights by more than it changes). */
function judgeMotion(lab: Lab, slots: GlowSlot[], rarity: RarityId, problems: string[]): string {
  const strength = ITEM_GLOW.strength;
  const start = G.time;
  wearRarities(lab, allAt(slots, rarity));
  const steps: number[] = [];
  try {
    let last = glowLight(lab, strength, start);
    for (let sample = 1; sample < SAMPLES; sample++) {
      const now = glowLight(lab, strength, start + sample * SAMPLE_EVERY);
      steps.push(apart(last, now));
      last = now;
    }
  } finally {
    ITEM_GLOW.strength = strength;
    tickItemGlow(start);
  }
  const most = Math.max(...steps);
  const least = Math.min(...steps);
  const seconds = SAMPLES * SAMPLE_EVERY;
  if (most > STEP_MOST) problems.push(`its pixels changed ${pct(most)} in ${SAMPLE_EVERY} s, not slowly`);
  if (least < STEP_LEAST) problems.push(`its pixels changed ${pct(least)} in ${SAMPLE_EVERY} s, still`);
  return `over ${seconds} s: its pixels changed ${pct(least)} to ${pct(most)} each ${SAMPLE_EVERY} s`;
}

/** The glow a cycle on (and `past` s more) against now, every slot at `rarity`: a loop draws the same. */
function loopJoin(lab: Lab, slots: GlowSlot[], rarity: RarityId, past = 0): number {
  const strength = ITEM_GLOW.strength;
  const start = G.time;
  wearRarities(lab, allAt(slots, rarity));
  try {
    const now = glowLight(lab, strength, start);
    return apart(now, glowLight(lab, strength, start + ITEM_GLOW.cycle + past));
  } finally {
    ITEM_GLOW.strength = strength;
    tickItemGlow(start);
  }
}

/** The loop: the glow a cycle on against now. */
function judgeLoop(lab: Lab, slots: GlowSlot[], rarity: RarityId, problems: string[]): string {
  const join = loopJoin(lab, slots, rarity);
  if (join > LOOP_MOST) problems.push(`a cycle on, its pixels are ${pct(join)} apart: a join`);
  return `a cycle (${ITEM_GLOW.cycle} s) on: its pixels ${pct(join)} apart`;
}

/** The hero with no glow and with every item at `rarity`, close up. */
function pictures(lab: Lab, slots: GlowSlot[], rarity: RarityId): Pictured[] {
  wearRarities(lab, {});
  const plain = lab.picture('common', VIEWS, ['every item Common: no glow']);
  wearRarities(lab, allAt(slots, rarity));
  const glowing = lab.picture(rarity, VIEWS, [`every item ${rarity}`]);
  return [plain, glowing];
}

/** A round's lines and pictures. */
interface Judged {
  lines: string[];
  moments: Pictured[];
}

/** Every slot's glow, its motion, the programs it compiled, and pictures. */
async function round(lab: Lab, options: GlowOptions, problems: string[]): Promise<Judged> {
  const slots = SHOWN[lab.player.cls.id] ?? SLOTS;
  const strength = ITEM_GLOW.strength;
  const programs = (G.renderer.info.programs ?? []).length;
  const lines: string[] = [];
  try {
    for (const slot of slots) lines.push(judgeSlot(lab, slot, options.rarity, strength, problems));
  } finally {
    ITEM_GLOW.strength = strength;
  }
  lines.push(judgeMotion(lab, slots, options.rarity, problems));
  lines.push(judgeLoop(lab, slots, options.rarity, problems));
  const moments = options.pictures ? pictures(lab, slots, options.rarity) : [];
  const compiled = (G.renderer.info.programs ?? []).length - programs;
  if (compiled) problems.push(`${compiled} programs compiled as the items glowed`);
  lines.push(`programs compiled: ${compiled}`);
  return { lines, moments };
}

/** The canary: the chest's glow ten times as strong, then none, then the loop judged past a cycle; each must be
 *  caught. */
function canary(lab: Lab, rarity: RarityId): string[] {
  const strength = ITEM_GLOW.strength;
  const missed: string[] = [];
  if (loopJoin(lab, ['chest'], rarity, PAST_CYCLE) <= LOOP_MOST) missed.push('canary missed: a join');
  try {
    for (const [planted, fault] of [[strength * 10, 'too bright'], [0, 'unseen']] as const) {
      const caught: string[] = [];
      judgeSlot(lab, 'chest', rarity, planted, caught);
      if (!caught.some((problem) => problem.includes(fault))) missed.push(`canary missed: the glow ${fault}`);
    }
  } finally {
    ITEM_GLOW.strength = strength;
  }
  return missed;
}

/** `lab glow`. */
export async function itemGlow(lab: Lab, options: GlowOptions): Promise<Report> {
  const isWarrior = lab.player.cls.id === 'warrior';
  const gear = isWarrior ? 'shield' : undefined;
  const setup = await lab.setup({ wear: ['helm', 'chest', 'hands'], gear, tune: options.tune });
  lab.player.setColour(options.colour);
  await lab.step(2);
  const problems: string[] = [];
  const { lines, moments } = await round(lab, options, problems);
  if (options.canary) problems.push(...canary(lab, options.rarity));
  const wears = (setup.wears as string[]).join(', ');
  const head = `the ${setup.class} in ${options.colour}, every item ${options.rarity}, wearing ${wears}`;
  return { text: [head, ...lines].join('\n'), problems, moments };
}
