// What `lab tavern` reads of the keeper's body and his mugs each frame, past their counts (page/tavern.ts's `Watch`):
// his hands moving as a hand moves (no jump, no snap of its speed, no elbow flicked round), his body clear of the bar,
// the back counter and the tables (leaning over them, never into them), and every mug held, standing on something or
// in the tub, never left in the air. From play: "Hand glitching when wiping table", "When he leans in to grab the cup,
// he goes through the table", a mug left floating beside his hand.
import * as THREE from 'three';
import { BODY_GROWN, type Keeper } from '../../../src/entities/models/keeper';
import { bodyShape, capsuleDepth, type Solid as BodySolid } from '../../../src/entities/models/anatomy';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import { BACK, BAR, TABLES, TUB } from '../../../src/data/tavern';
import { MUG } from '../../../src/entities/models/flask';

/** the most a hand may move in his body's frame in a frame (m: 3 m/s, a quick hand's), its speed's change a frame
 *  (m a frame: a snap, as a hand thrown to its goal; wiping in circles changes it well under a millimetre), and an
 *  elbow's bend a frame (degrees). Before the keeper's hands followed their goals on a spring and his arms eased in
 *  and out of them, they read 87 cm, 118 cm and 115 degrees ("Hand glitching when wiping table"). */
export const HAND_STEP = 0.05, HAND_SNAP = 0.045, ELBOW_STEP = 15;
/** how far into a counter or a table any part of his body may go (m) */
export const INTO_MOST = 0.02;
/** how near a mug's foot must be to a surface's top to stand on it, and its middle to a hand to be held (m) */
const ON_SURFACE = 0.025, IN_HAND = 0.13;

/** A box his body may not go into: its footprint (room m) and its top. */
interface Solid { name: string; x0: number; x1: number; z0: number; z1: number; top: number; r?: number; table?: boolean; bottom?: number }

/** the bar, the back counter and the tables, as solids from the floor to their tops, each table its top as drawn (a
 *  round one a drum, the long one a box: a square of its `reach` round its middle, the long table's 0.76 m in a top
 *  2.2 m long, he stood in its top from the hips down and nothing read it, Kenneth's round 5) */
const SOLIDS: readonly Solid[] = [
  { name: 'the bar', x0: BAR.x - BAR.half, x1: BAR.x + BAR.half, z0: BAR.from, z1: BAR.to, top: BAR.top },
  { name: 'the back counter', x0: BACK.front, x1: BACK.wall, z0: BACK.from, z1: BACK.to, top: BACK.top },
  ...Object.entries(TABLES).map(([name, t]): Solid => {
    const hx = 'hx' in t ? t.hx : t.r, hz = 'hz' in t ? t.hz : t.r;
    return { name: `the ${name}`, x0: t.x - hx, x1: t.x + hx, z0: t.z - hz, z1: t.z + hz, top: t.top, table: true, ...('r' in t ? { r: t.r } : {}) };
  }),
];

/** a part of his body as a ball round a joint (m): his trunk, his head and his elbows */
const PARTS: readonly { joint: 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'elbowL' | 'elbowR'; r: number }[] = [
  { joint: 'hips', r: 0.12 }, { joint: 'spine', r: 0.11 }, { joint: 'chest', r: 0.12 }, { joint: 'neck', r: 0.06 },
  { joint: 'head', r: 0.1 }, { joint: 'elbowL', r: 0.045 }, { joint: 'elbowR', r: 0.045 },
];
/** a table's top as a slab his thighs meet, its thickness (m), and a thigh's ball's radius there (m): his knees go
 *  under a top as a man's do, his thighs never through it (he stood in the long table from the hips down, Kenneth's
 *  round 5, and his trunk alone was read) */
const TOP_SLAB = 0.06, THIGH_R = 0.08;

/** How far a ball of radius `r` at `c` goes into `solid` (m, 0 clear of it). */
export function depthInto(c: THREE.Vector3, r: number, solid: Solid): number {
  if (solid.r !== undefined) return depthIntoDrum(c, r, solid);
  const bottom = solid.bottom ?? 0;
  const nx = Math.min(Math.max(c.x, solid.x0), solid.x1);
  const ny = Math.min(Math.max(c.y, bottom), solid.top);
  const nz = Math.min(Math.max(c.z, solid.z0), solid.z1);
  const inside = nx === c.x && ny === c.y && nz === c.z;
  if (!inside) return Math.max(0, r - Math.hypot(c.x - nx, c.y - ny, c.z - nz));
  const out = Math.min(c.x - solid.x0, solid.x1 - c.x, c.z - solid.z0, solid.z1 - c.z, solid.top - c.y, c.y - bottom);
  return r + out;
}

/** How far a ball at `c` of radius `r` goes into a round solid (a drum from the floor to its top). */
function depthIntoDrum(c: THREE.Vector3, r: number, solid: Solid): number {
  const mx = (solid.x0 + solid.x1) / 2, mz = (solid.z0 + solid.z1) / 2, across = Math.hypot(c.x - mx, c.z - mz);
  const bottom = solid.bottom ?? 0;
  const outward = across - solid.r!, upward = c.y - solid.top, downward = bottom - c.y;
  if (outward <= 0 && upward <= 0 && downward <= 0) return r + Math.min(-outward, -upward, -downward);
  return Math.max(0, r - Math.hypot(Math.max(outward, 0), Math.max(upward, downward, 0)));
}

/** whether `mesh` hangs from one of his hands (a mug taken up at his arm's length: his grip's point further off) */
function inHandOf(mesh: THREE.Object3D, keeper: Keeper): boolean {
  for (let o: THREE.Object3D | null = mesh.parent; o; o = o.parent) {
    if (o === keeper.joints.handL || o === keeper.joints.handR) return true;
  }
  return false;
}

/** The worst of something seen, and where. */
class Worst {
  value = 0;
  at = '';
  see(value: number, at: () => string): void {
    if (value <= this.value) return;
    this.value = value;
    this.at = at();
  }
}

/** His hands frame to frame: how far each moved, how sharply its speed changed, how far each elbow bent. */
export class HandsSmooth {
  readonly step = new Worst();
  readonly snap = new Worst();
  readonly elbow = new Worst();
  /** the wrists' own moves, apart from the hand's turn about them */
  readonly wrist = new Worst();
  private readonly wristWas: THREE.Vector3[] = [];
  /** the last frames of each hand, said with its worst jump: a goal or none, and the hand's distance from it (cm) */
  private readonly recent: string[][] = [[], []];
  private jumpTrace = '';
  private traceAfter = [0, 0];
  private readonly now: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly was: THREE.Vector3[] = [];
  private readonly moved: THREE.Vector3[] = [];
  private elbowWas: number[] = [];

  /** what it last saw forgotten (frames the lab stepped unread) */
  forget(): void {
    this.was.length = 0;
    this.moved.length = 0;
    this.elbowWas = [];
    this.wristWas.length = 0;
  }

  read(keeper: Keeper, doing: string, asked?: HandsAsked): void {
    keeper.hands(this.now);
    // (in his chest's frame: his walking and his torso's eased lean carry his hands along smoothly, a twitch is a hand
    // against his body)
    const room = keeper.joints.chest;
    const elbows = [keeper.joints.elbowL, keeper.joints.elbowR].map(bendOf);
    const wristAt = (hand: THREE.Object3D) => room.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    const wrists = [keeper.joints.handL, keeper.joints.handR].map(wristAt);
    for (let i = 0; i < 2; i++) {
      const at = room.worldToLocal(this.now[i].clone()), side = i === 0 ? 'left' : 'right';
      if (this.wristWas[i]) this.wrist.see(wrists[i].distanceTo(this.wristWas[i]), () => `${side} wrist, ${doing}`);
      this.wristWas[i] = wrists[i];
      const was = this.was[i];
      if (was) {
        const moved = at.clone().sub(was);
        if (moved.length() > this.step.value) {
          this.jumpTrace = `${this.recent[i].join(' ')} | `;
          this.traceAfter[i] = 3;
        }
        this.step.see(moved.length(), () => `${side} hand, ${doing}`);
        if (this.moved[i]) this.snap.see(moved.distanceTo(this.moved[i]), () => `${side} hand, ${doing}`);
        this.moved[i] = moved;
      }
      this.was[i] = at;
      // (each frame of it, said with its worst jump: with a goal or none, where in his chest's frame, its elbow's bend)
      const goal = asked ? (i === 0 ? asked.left : asked.right) : null;
      this.recent[i].push(`${goal ? 'g' : '-'}(${xyz(at)}) e${elbows[i].toFixed(2)}`);
      if (this.recent[i].length > 8) this.recent[i].shift();
      if (this.traceAfter[i] > 0) {
        this.traceAfter[i]--;
        this.jumpTrace += `${this.recent[i][this.recent[i].length - 1]} `;
      }
      if (this.elbowWas.length) {
        const turned = THREE.MathUtils.radToDeg(Math.abs(elbows[i] - this.elbowWas[i]));
        this.elbow.see(turned, () => `${side} elbow, ${doing}`);
      }
    }
    this.elbowWas = elbows;
  }

  problems(): string[] {
    const out: string[] = [];
    const { step, snap, elbow } = this;
    if (step.value > HAND_STEP) out.push(`a hand jumped ${cm(step.value)} in a frame (${step.at})`);
    if (snap.value > HAND_SNAP) out.push(`a hand's speed snapped by ${cm(snap.value)} a frame (${snap.at})`);
    if (elbow.value > ELBOW_STEP) out.push(`an elbow flicked ${elbow.value.toFixed(0)}° in a frame (${elbow.at})`);
    return out;
  }

  said(): string {
    const { step, snap, elbow, wrist } = this;
    return `his hands: the most one moved in a frame ${cm(step.value)} (${step.at}), `
      + `its speed's sharpest change ${cm(snap.value)} a frame (${snap.at}), `
      + `an elbow's most a frame ${elbow.value.toFixed(1)}° (${elbow.at}), `
      + `a wrist's most a frame ${cm(wrist.value)} (${wrist.at}); the frames to the worst jump: ${this.jumpTrace}`;
  }
}

/** His body against the bar, the back counter and the tables: how far any part of it went into one. */
export class BodyClear {
  readonly into = new Worst();
  private readonly at = new THREE.Vector3();

  read(keeper: Keeper, doing: string): void {
    const room = keeper.root.parent!;
    for (const part of PARTS) {
      room.worldToLocal(keeper.joints[part.joint].getWorldPosition(this.at));
      for (const solid of SOLIDS) {
        const where = () => `his ${part.joint} into ${solid.name} at ${xyz(this.at)}, his root at ${xyz(room.worldToLocal(keeper.root.getWorldPosition(new THREE.Vector3())))} facing ${keeper.root.rotation.y.toFixed(2)}, ${doing}`;
        this.into.see(depthInto(this.at, part.r, solid), where);
      }
    }
    // (each thigh at its middle against the tables' tops)
    for (const [thigh, knee] of [[keeper.joints.thighL, keeper.joints.kneeL], [keeper.joints.thighR, keeper.joints.kneeR]] as const) {
      room.worldToLocal(thigh.getWorldPosition(this.at));
      const k = room.worldToLocal(knee.getWorldPosition(new THREE.Vector3()));
      this.at.lerp(k, 0.5);
      for (const solid of SOLIDS) {
        if (!solid.table) continue;
        const slab = { ...solid, bottom: solid.top - TOP_SLAB };
        const where = () => `his thigh into ${solid.name}'s top at ${xyz(this.at)}, his root at ${xyz(room.worldToLocal(keeper.root.getWorldPosition(new THREE.Vector3())))}, ${doing}`;
        this.into.see(depthInto(this.at, THIGH_R, slab), where);
      }
    }
  }

  problems(): string[] {
    return this.into.value > INTO_MOST ? [`his body went ${cm(this.into.value)} into a counter (${this.into.at})`] : [];
  }

  said(): string {
    const where = this.into.at ? ` (${this.into.at})` : '';
    return `his body: the most into a counter or table ${cm(this.into.value)}${where}`;
  }
}

/** Every mug as it's drawn: in his hand, standing on the bar, the back counter or a table, or in the tub (a hero's
 *  hand is the hero's: left to the drink's own checks). */
export class MugsHeld {
  /** mug-frames seen in the air, and the first */
  inAir = 0;
  first = '';
  private readonly hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];

  read(tv: TavernKeeper, keeper: Keeper, doing: string): void {
    const room = keeper.root.parent!;
    keeper.hands(this.hands);
    for (const m of tv.mugs.mugs) {
      if (m.place.at === 'hero' || tv.settles(m.id)) continue;
      const world = tv.mugAt(m.id);
      const held = this.hands.some((hand) => hand.distanceTo(world) < IN_HAND) || inHandOf(tv.mugMesh(m.id), keeper);
      const at = room.worldToLocal(world.clone()), foot = at.y - MUG.foot;
      const onTop = SOLIDS.some((s) => Math.abs(foot - s.top) < ON_SURFACE
        && at.x > s.x0 - 0.02 && at.x < s.x1 + 0.02 && at.z > s.z0 - 0.02 && at.z < s.z1 + 0.02);
      const tubX = (BACK.front + BACK.wall) / 2;
      const inTub = Math.hypot(at.x - tubX, at.z - TUB.z) < TUB.r + 0.03 && at.y < BACK.top + 0.2;
      if (held || onTop || inTub) continue;
      this.inAir++;
      this.first ||= `mug ${m.id} (${m.place.at}) at ${xyz(at)}, root y ${keeper.root.position.y.toFixed(2)}, body y ${keeper.joints.body.position.y.toFixed(2)} rot ${keeper.joints.body.rotation.x.toFixed(2)}, hips y ${keeper.joints.hips.position.y.toFixed(2)}, chest at ${xyz(room.worldToLocal(keeper.joints.chest.getWorldPosition(new THREE.Vector3())))}, his hands at ${xyz(room.worldToLocal(this.hands[0].clone()))} and ${xyz(room.worldToLocal(this.hands[1].clone()))}, the mug's parent ${this.parentOf(tv, m.id)}, ${doing}`;
    }
  }

  private parentOf(tv: TavernKeeper, id: number): string {
    const parent = tv.mugMesh(id).parent;
    if (!parent) return '?';
    const w = parent.getWorldPosition(new THREE.Vector3()), sc = parent.getWorldScale(new THREE.Vector3());
    const vis = parent.children.find((c) => c.userData.drawnHand) ?? parent.children[0];
    const vw = vis?.getWorldPosition(new THREE.Vector3()), vs = vis?.getWorldScale(new THREE.Vector3());
    return `${parent.name} at ${xyz(w)} scale ${xyz(sc)}, its ${vis?.name || 'first child'} at ${vw ? xyz(vw) : '-'} scale ${vs ? xyz(vs) : '-'} (${parent.children.map((c) => c.name || c.type).join('/')})`;
  }

  problems(): string[] {
    return this.inAir ? [`a mug was left in the air for ${this.inAir} mug-frames (first: ${this.first})`] : [];
  }

  said(): string {
    return `mugs in the air: ${this.inAir ? `${this.inAir} mug-frames (first: ${this.first})` : 'none'}`;
  }
}

/** how far a forearm, a hand or a tool he holds may go into his body (m: a sleeve's brush, never through) */
export const LIMB_INTO_MOST = 0.02;
/** his tools as they're built (world/tavernKeeper.ts): along their +y from their grip, from where to where (m), and how
 *  thick round */
const TOOLS: readonly { name: string; from: number; to: number; r: number }[] = [
  { name: 'broom', from: -0.2, to: 1.36, r: 0.018 }, { name: 'poker', from: 0, to: 0.78, r: 0.008 },
];

/** His arms and the tools he holds against his own body, every frame: each forearm and hand against his trunk, neck
 *  and head, each tool against his trunk and thighs (the heroes' solids, anatomy.ts, grown by his clothes as his body
 *  keeps them, keeper.ts `BODY_GROWN`). From play: "in many many animations his arm goes through his body", the poker
 *  "goes through his body again", the broom's stick through his legs. */
export class LimbsClear {
  readonly into = new Worst();
  readonly tool = new Worst();
  private solids: BodySolid[] | null = null;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();

  read(keeper: Keeper, room: THREE.Object3D, doing: string): void {
    const j = keeper.joints;
    if (!this.solids) {
      this.solids = bodyShape(j).solids;
      for (const solid of this.solids) {
        const grown = solid.name === 'chest' ? BODY_GROWN.chest : solid.name === 'belly' ? BODY_GROWN.belly : null;
        if (grown) solid.r.add(new THREE.Vector3(...grown));
      }
    }
    j.root.updateMatrixWorld(true);
    const trunk = this.solids.filter((solid) => ['chest', 'belly', 'neck', 'head'].includes(solid.name));
    for (const side of ['L', 'R'] as const) {
      j[`elbow${side}`].getWorldPosition(this.a);
      j[`hand${side}`].getWorldPosition(this.b);
      this.c.subVectors(this.b, this.a).setLength(0.1).add(this.b);
      for (const solid of trunk) {
        const fore = capsuleDepth(this.a, this.b, j.P.foreR, solid), hand = capsuleDepth(this.b, this.c, 0.035, solid);
        this.into.see(Math.max(fore, hand), () => {
          const inHim = (at: THREE.Vector3) => xyz(j.root.worldToLocal(at.clone()));
          return `his ${fore > hand ? 'forearm' : 'hand'} ${side} into his ${solid.name} (in his own frame, x to his left: `
            + `his elbow at ${inHim(this.a)}, his hand at ${inHim(this.b)}; his root at `
            + `${xyz(room.worldToLocal(j.root.getWorldPosition(new THREE.Vector3())))} facing ${j.root.rotation.y.toFixed(2)}), ${doing}`;
        });
      }
    }
    for (const tool of TOOLS) {
      const thing = room.getObjectByName(tool.name);
      if (!thing || !isHeldBy(thing, j.root)) continue;
      thing.localToWorld(this.a.set(0, tool.from, 0));
      thing.localToWorld(this.b.set(0, tool.to, 0));
      for (const solid of this.solids.filter((s) => s.name !== 'neck')) {
        this.tool.see(capsuleDepth(this.a, this.b, tool.r, solid), () => `the ${tool.name} into his ${solid.name} (its grip at ${xyz(room.worldToLocal(this.a.clone()))}, its far end at ${xyz(room.worldToLocal(this.b.clone()))}, his root at ${xyz(room.worldToLocal(keeper.root.getWorldPosition(new THREE.Vector3())))} facing ${keeper.root.rotation.y.toFixed(2)}), ${doing}`);
      }
    }
  }

  problems(): string[] {
    const out: string[] = [];
    if (this.into.value > LIMB_INTO_MOST) out.push(`his arm went ${cm(this.into.value)} into his body (${this.into.at})`);
    if (this.tool.value > LIMB_INTO_MOST) out.push(`a tool went ${cm(this.tool.value)} into his body (${this.tool.at})`);
    return out;
  }

  said(): string {
    return `his arms against his body: the deepest ${cm(this.into.value)}${this.into.at ? ` (${this.into.at})` : ''}; `
      + `his tools: the deepest ${cm(this.tool.value)}${this.tool.at ? ` (${this.tool.at})` : ''}`;
  }
}

/** whether `thing` hangs under `root` (in his hand) */
function isHeldBy(thing: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = thing.parent; o; o = o.parent) if (o === root) return true;
  return false;
}

const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;
const xyz = (v: THREE.Vector3) => `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
/** a hinge joint's bend (rad), from its turn */
const bendOf = (joint: THREE.Object3D) => 2 * Math.acos(Math.min(1, Math.abs(joint.quaternion.w)));

/** each hand's goal this frame, as the keeper's body was asked (`TavernKeeper.body`) */
interface HandsAsked { left: { at: THREE.Vector3 } | null; right: { at: THREE.Vector3 } | null }
