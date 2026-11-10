// tools/lab sheet: the hero in the states the player sees him in (standing, both ends of a stride's arm swing, at full
// draw, through a skill's cast), each moment pictured from the game's own views and close up, with how hard the pose is
// to hold beside it.
// A pose is judged here first, as a person would hold it, and only then measured (src/entities/models/AGENTS.md).
import * as THREE from 'three';
import type { Lab, Fixture, ViewName, Tile } from './lab';
import type { Joints } from '../../../src/entities/models/rig';
import { HELD, armComfort, describeArm } from './comfort';
import { bowOf, describeBow } from './ranger';
import { bindKnown, holdFor, holdingAll, pressing, skillNamed } from './cast';
import type { SkillDef } from '../../../src/types';
import { groundHeight } from '../../../src/world/ground';
import { describeParts, type Look } from './looks';
import { viewMode } from '../../../src/core/renderer';
import { describeFramed, framed, type Framed } from './inFrame';
import { describeDrink } from './drink';

/** One pictured moment: its tiles and the notes read beside them. */
export interface Moment {
  state: string;
  label: string;
  tiles: Tile[];
  notes: string[];
  /** through the eyes, the weapon as framed (`lab match` compares it with a reference's) */
  framed?: Framed;
}

export interface SheetOptions {
  states: string[];
  views: ViewName[];
  fixture: Fixture;
  focus?: keyof Joints;
  /** how the pictures are drawn (looks.ts; as the player sees them by default) */
  look?: Look;
  /** the `cast` state's skill (its key, its behaviour or its name), and the shares of its cast pictured */
  skill?: string;
  shares?: number[];
}

export interface Sheet {
  setup: Record<string, unknown>;
  moments: Moment[];
}

/** Pictures the moment as `label`, with `notes` of its own beside the arms'. */
type Snap = (label: string, notes?: string[]) => Promise<void>;

/** A state's script: it runs the game into the state and calls `snap` at each moment to picture. */
type State = (lab: Lab, snap: Snap, options: SheetOptions) => Promise<void>;

const walking = () => ({ keys: ['w'] });
const drawing = () => ({ m0: true });

const ARM_FORWARD = 'walking, arm forward';
const ARM_BACK = 'walking, arm back';
/** the `cast` state: the shares of the cast pictured unless `--shares` says, how far ahead of the hero it's aimed (m),
 *  and the most frames it's followed */
const CAST_SHARES = [0.3, 0.55, 0.8];
const CAST_AIM = 6;
const CAST_FRAMES = 600;

/** how far the left hand leads the hips along the way the hero faces (m) */
function handLead(lab: Lab): number {
  const hand = lab.joints.handL.getWorldPosition(new THREE.Vector3());
  const hips = lab.joints.hips.getWorldPosition(new THREE.Vector3());
  const facing = lab.player.facing;
  return hand.sub(hips).dot(new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)));
}

/** How far through its cast the hero is (0..1, the share the model is given), or null when he isn't casting. */
function castShare(lab: Lab): number | null {
  const cast = lab.player.casting;
  return cast && Number.isFinite(cast.dur) ? cast.t / cast.dur : null;
}

/** A channel's keys are held this long (`holdFor`), and pictured at shares of that. */
async function channelled(lab: Lab, snap: Snap, keys: Parameters<typeof pressing>[0][], aim: THREE.Vector3,
  def: SkillDef, wanted: number[]): Promise<void> {
  const name = def.name;
  const frames = Math.round(holdFor(def) / (window.__labClock.frame / 1000));
  for (let f = 0; f < frames && wanted.length > 0; f++) {
    await lab.step(1, () => holdingAll(keys, aim));
    if (!lab.player.channel) throw new Error(`lab: sheet: ${name}'s channel ended after ${f + 1} frames of ${frames}`);
    while (wanted.length > 0 && (f + 1) / frames >= wanted[0]) {
      await snap(`${name}, ${wanted.shift()} of its channel`, [castPointNote(lab)]);
    }
  }
}

/** the frames after a charged skill's key is let go it's pictured at: its strike on its way, landed, and what it
 *  leaves */
const LOOSED_FRAMES = [4, 14, 34];

/** A skill charged while its key is held (`SkillDef.draw`: the lightning staff's) is held to its full charge,
 *  pictured at shares of that, then let go and pictured as it strikes. */
async function charged(lab: Lab, snap: Snap, key: Parameters<typeof pressing>[0], aim: THREE.Vector3,
  def: SkillDef, wanted: number[]): Promise<void> {
  const name = def.name;
  for (let f = 0; f < CAST_FRAMES * 4 && wanted.length > 0; f++) {
    await lab.step(1, () => pressing(key, aim, true));
    const cast = lab.player.casting;
    if (!cast?.drawT) throw new Error(`lab: sheet: ${name}'s charge ended after ${f + 1} frames, its key still held`);
    const share = Math.min(1, cast.t / cast.drawT);
    while (wanted.length > 0 && share >= wanted[0]) {
      await snap(`${name}, ${wanted.shift()} of its charge`, [castPointNote(lab)]);
    }
  }
  if (wanted.length > 0) throw new Error(`lab: sheet: ${name} never charged to ${wanted.join(', ')} of its charge`);
  let stepped = 0;
  for (const frames of LOOSED_FRAMES) {
    await lab.step(frames - stepped, () => ({ aim }));
    stepped = frames;
    await snap(`${name}, ${frames} frames after it's let go`, [castPointNote(lab)]);
  }
}

/** Where the cast point (the weapon's tip, the staff's head) is: how high over the floor under it, how far ahead. */
function castPointNote(lab: Lab): string {
  // (the world's matrices are brought up to date by a draw, and a step draws nothing)
  lab.model.root.updateWorldMatrix(true, true);
  const tip = lab.player.castPoint;
  const hero = lab.player.pos;
  const facing = lab.player.facing;
  const ahead = (tip.x - hero.x) * Math.sin(facing) + (tip.z - hero.z) * Math.cos(facing);
  const over = tip.y - groundHeight(tip.x, tip.z);
  return `the cast point ${(over * 100).toFixed(0)} cm over the floor, ${ahead.toFixed(2)} m ahead of him`;
}

/** how far the current shot is drawn (0..1), 0 when none is */
function drawn(lab: Lab): number {
  const cast = lab.player.casting;
  if (!cast?.drawT) return 0;
  return Math.max(0, cast.t - (cast.nockT ?? 0)) / cast.drawT;
}

export const STATES: Record<string, State> = {
  async stand(lab, snap) {
    await lab.step(70);
    await snap('standing');
  },

  /** both ends of the left arm's swing, each pictured as the hand turns back */
  async walk(lab, snap) {
    await lab.step(50, walking);
    const start = lab.player.pos.clone();
    const wanted = new Set([ARM_FORWARD, ARM_BACK]);
    let previous = handLead(lab);
    let moving = 0;
    for (let f = 0; f < 150 && wanted.size > 0; f++) {
      await lab.step(1, walking);
      const lead = handLead(lab);
      const direction = Math.sign(lead - previous);
      if (moving !== 0 && direction !== 0 && direction !== moving) {
        const label = moving > 0 ? ARM_FORWARD : ARM_BACK;
        if (wanted.delete(label)) await snap(label);
      }
      if (direction !== 0) moving = direction;
      previous = lead;
    }
    if (wanted.size > 0) throw new Error(`lab: walk: the arm's swing never turned (${[...wanted].join(', ')})`);
    if (lab.player.pos.distanceTo(start) < 1) throw new Error('lab: walk: the hero never walked');
  },

  async full(lab, snap) {
    await lab.until(() => drawn(lab) >= 1, 240, 'full: the shot never came to full draw', drawing);
    await lab.step(10, drawing);
    await snap('at full draw');
    await lab.step(4);
  },

  /** a skill (`--skill`) cast once ahead of him, pictured at shares of its cast (`--shares`), with its cast point; a
   *  channel held, at shares of its hold */
  async cast(lab, snap, options) {
    if (!options.skill) throw new Error('lab: sheet: the cast state needs --skill');
    // (`a+b`: a channel held on both keys at once, the mage's lance from both hands with no staff)
    const [named, ...alsoHeld] = options.skill.split('+');
    bindKnown(named);
    const { key, def } = skillNamed(named);
    const facing = lab.player.facing;
    const way = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const aim = lab.player.pos.clone().addScaledVector(way, CAST_AIM);
    const wanted = [...(options.shares ?? CAST_SHARES)].sort((a, b) => a - b);
    if (def.channel) return channelled(lab, snap, [key, ...alsoHeld.map((other) => skillNamed(other).key)], aim, def, wanted);
    if (def.draw) return charged(lab, snap, key, aim, def, wanted);
    await lab.step(1, () => pressing(key, aim, true));
    for (let f = 0; f < CAST_FRAMES && wanted.length > 0; f++) {
      const share = castShare(lab);
      if (share === null) break;
      while (wanted.length > 0 && share >= wanted[0]) {
        await snap(`${def.name}, ${wanted.shift()} of its cast`, [castPointNote(lab)]);
      }
      await lab.step(1, () => ({ aim }));
    }
    if (wanted.length > 0) throw new Error(`lab: sheet: ${def.name}'s cast ended before ${wanted.join(', ')} of it`);
  },
};

/** The moments of each state, pictured from `views`, with the fixture set up afresh before each state. */
export async function sheet(lab: Lab, options: SheetOptions): Promise<Sheet> {
  for (const name of options.states) {
    if (!STATES[name]) throw new Error(`lab: no state ${name} (the states: ${Object.keys(STATES).join(', ')})`);
  }
  lab.checkCapture(options.views, options.fixture.view ?? 'top', options.focus);
  const moments: Moment[] = [];
  let setup: Record<string, unknown> = {};
  const fixture = { nocked: !!lab.player.cls.quiver, ...options.fixture };
  for (const name of options.states) {
    const state = STATES[name];
    setup = await lab.setup(fixture);
    await state(lab, async (label, own = []) => {
      lab.model.root.updateMatrixWorld(true);
      const tiles = lab.capture(options.views, { focus: options.focus, look: options.look });
      const seen = viewMode() === 'first' ? framed(lab) ?? undefined : undefined;
      const parts = tiles.filter((tile) => tile.parts).map((tile) => `${tile.view}: ${describeParts(tile.parts!)}`);
      moments.push({ state: name, label, tiles, notes: [...own, ...notesOn(lab, seen), ...parts], framed: seen });
    }, options);
  }
  return { setup, moments };
}

/** What to read beside the pictures: each arm's load and posture, how the bow is carried, the draught's flask at the
 *  lips, and through the eyes how the weapon is framed. */
function notesOn(lab: Lab, seen?: Framed): string[] {
  const held = HELD[lab.player.cls.id] ?? {};
  const notes: string[] = [];
  for (const side of ['L', 'R'] as const) {
    const kg = held[side] ?? 0;
    const name = side === 'L' ? 'left arm' : 'right arm';
    const holding = kg ? ` (${kg} kg in hand)` : '';
    notes.push(`${name}${holding}: ${describeArm(armComfort(lab.joints, side, kg))}`);
  }
  const bow = bowOf(lab);
  if (bow) notes.push(describeBow(lab, bow));
  const weapon = describeWeapon(lab);
  if (weapon) notes.push(weapon);
  const drink = describeDrink(lab);
  if (drink) notes.push(drink);
  // (through the eyes, the weapon as the frame shows it: what a rest is matched to a reference's screenshots by)
  if (seen) notes.push(describeFramed(seen));
  return notes;
}

const degreesOf = (radians: number) => (radians * 180 / Math.PI).toFixed(0);

/**
 * The weapon in the right hand, from its grip to its tip (`Model.tip`, a joint on the grip): how far up it points and
 * which way across the floor from the way he faces (0 ahead, 90 to his left, 180 behind), and its way in the chest's
 * frame, as the models' carries are written. None for a model whose tip isn't on a grip.
 */
function describeWeapon(lab: Lab): string | null {
  const tip = lab.model.tip;
  const grip = tip?.parent;
  if (!tip || !grip || grip === lab.model.root) return null;
  const way = tip.getWorldPosition(new THREE.Vector3()).sub(grip.getWorldPosition(new THREE.Vector3())).normalize();
  const inRoot = way.clone().transformDirection(lab.model.root.matrixWorld.clone().invert());
  const inChest = way.clone().transformDirection(lab.joints.chest.matrixWorld.clone().invert());
  const up = degreesOf(Math.asin(THREE.MathUtils.clamp(inRoot.y, -1, 1)));
  const across = degreesOf(Math.atan2(inRoot.x, inRoot.z));
  const chest = inChest.toArray().map((value) => value.toFixed(2)).join(', ');
  return `the weapon: ${up}° up, ${across}° from ahead (in the chest's frame ${chest})`;
}
