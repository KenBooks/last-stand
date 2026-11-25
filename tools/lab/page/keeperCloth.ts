// What `lab tavern` reads of the keeper's rag and broom (Kenneth's round 4): the rag laid flat on the top he wipes,
// on it (its height over the top) and inside its edge (its corners) every frame of every wipe, the bar's and each
// table's, and how much of it the run's camera sees round his hand and arm; the rag's turn in his hand frame to frame
// (it spun round in his fist as he finished wiping); the broom's bristles against the floor as he sweeps (touching it,
// never into it) and as he carries it (never into it).
import * as THREE from 'three';
import { G } from '../../../src/state';
import { BAR, TABLES } from '../../../src/data/tavern';
import type { Keeper } from '../../../src/entities/models/keeper';

/** the most the flat rag may stand off or sink into a top (m), and lie past its edge (m) */
export const CLOTH_OFF_MOST = 0.006, CLOTH_PAST_MOST = 0.005;
/** the least share of the rag the camera must see past his hand and arm as he wipes */
export const CLOTH_SEEN_LEAST = 0.4;
/** the most the rag may turn in his hand in a frame (rad) */
export const RAG_TURN_MOST = 0.3;
/** the broom's lowest point against the floor: sweeping, at most this deep into it and no higher than this over it
 *  (m: its tips touching); carried, never into it */
export const BROOM_INTO_MOST = 0.006, BROOM_OFF_MOST = 0.01;

/** the flat rag's half sizes (m) */
const PAD = { x: 0.15, z: 0.11 };
/** how often its seen share is read (frames), and its grid of points */
const SEEN_EVERY = 10, GRID = [6, 5] as const;

/** The worst of something, and where. */
class Worst {
  value = -Infinity;
  at = '';
  see(value: number, at: () => string): void {
    if (value <= this.value) return;
    this.value = value;
    this.at = at();
  }
}

export class ClothAndBroom {
  readonly off = new Worst();
  readonly past = new Worst();
  readonly unseen = new Worst();
  readonly turn = new Worst();
  readonly into = new Worst();
  readonly floating = new Worst();
  readonly carriedInto = new Worst();
  wipeFrames = 0;
  sweepFrames = 0;
  seenSum = 0;
  seenReads = 0;
  /** the canary's: the rag spun in his hand */
  spin = false;
  private spun = 0;
  private frame = 0;
  private ragWas: THREE.Quaternion | null = null;
  private heldBefore = '';
  private handWas: THREE.Quaternion | null = null;
  private inHandWas: THREE.Quaternion | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly v = new THREE.Vector3();

  read(keeper: Keeper, room: THREE.Object3D, step: string, doing: string, broomSaid = ''): void {
    this.frame++;
    room.updateMatrixWorld(true);
    const pad = room.getObjectByName('keeper rag flat') as THREE.Mesh | undefined;
    if (pad && pad.scale.x > 0.5 && /wipe/.test(step)) this.readCloth(pad, keeper, room, step, doing);
    this.readRag(keeper, doing);
    const broom = room.getObjectByName('broom');
    if (broom) this.readBroom(broom, room, step, `${doing} (${broomSaid})`);
  }

  private readCloth(pad: THREE.Mesh, keeper: Keeper, room: THREE.Object3D, step: string, doing: string): void {
    this.wipeFrames++;
    const at = pad.position, top = step === 'wipe bar' ? barTop() : nearestTable(at);
    const off = Math.abs(at.y - top.y - 0.003);
    this.off.see(off, () => `${(off * 1000).toFixed(1)} mm off the ${top.name}'s top, ${doing}`);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const corner = new THREE.Vector3(sx * PAD.x, 0, sz * PAD.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), pad.rotation.y).add(at);
      const past = pastEdge(corner, top);
      this.past.see(past, () => `a corner ${(past * 100).toFixed(1)} cm past the ${top.name}'s edge, ${doing}`);
    }
    if (this.frame % SEEN_EVERY) return;
    const seen = seenShare(pad, keeper, this.ray, this.v);
    this.seenSum += seen;
    this.seenReads++;
    this.unseen.see(1 - seen, () => `${(seen * 100).toFixed(0)}% of it seen past his hand and arm, ${doing}`);
    void room;
  }

  private readRag(keeper: Keeper, doing: string): void {
    const rag = keeper.rag;
    const inHand = rag.visible && rag.parent === keeper.joints.handR;
    // (where it was the frame before, said with its worst turn: what moved it)
    const before = this.heldBefore;
    this.heldBefore = `${rag.parent?.name || rag.parent?.type || '-'}${rag.visible ? '' : ' (hidden)'}${keeper.ragTucked ? ' (tucked)' : ''}`;
    if (!inHand) {
      this.ragWas = null;
      return;
    }
    // (the canary's: turned on further each frame, as the fault's turns added up)
    if (this.spin) rag.rotateY(this.spun += 0.6);
    // (in the world, as the player sees it turn: its turn in his hand counts his wrist's own)
    const now = rag.getWorldQuaternion(new THREE.Quaternion());
    const hand = keeper.joints.handR.getWorldQuaternion(new THREE.Quaternion()), inIt = rag.quaternion.clone();
    if (this.ragWas && this.handWas && this.inHandWas) {
      const turned = this.ragWas.angleTo(now), handTurned = this.handWas.angleTo(hand), inTurned = this.inHandWas.angleTo(inIt);
      const deg = (a: number) => (a * 180 / Math.PI).toFixed(0);
      this.turn.see(turned, () => `${deg(turned)}° in a frame (his hand ${deg(handTurned)}°, the rag in it ${deg(inTurned)}°; the frame before in ${before}), ${doing}`);
    }
    this.ragWas = now;
    this.handWas = hand;
    this.inHandWas = inIt;
  }

  private readBroom(broom: THREE.Object3D, room: THREE.Object3D, step: string, doing: string): void {
    // (the broom within the holder his hand holds, `broom grip`: carried while that's in a hand)
    const grip = broom.parent, sweeping = step === 'sweep', carried = !!grip?.parent && grip !== room && grip.parent !== room;
    if (!sweeping && !carried) return;
    const lowest = lowestOf(broom, room);
    if (sweeping) {
      this.sweepFrames++;
      this.into.see(-lowest, () => `${(-lowest * 1000).toFixed(1)} mm into the floor, ${doing}`);
      this.floating.see(lowest, () => `${(lowest * 1000).toFixed(1)} mm over the floor at its lowest, ${doing}`);
    } else this.carriedInto.see(-lowest, () => `${(-lowest * 1000).toFixed(1)} mm into the floor carried, ${doing}`);
  }

  problems(): string[] {
    const out: string[] = [];
    if (!this.wipeFrames) out.push('his rag was never seen laid on a top as he wiped');
    if (this.off.value > CLOTH_OFF_MOST) out.push(`his rag stood off or sank into the top it wiped: ${this.off.at}`);
    if (this.past.value > CLOTH_PAST_MOST) out.push(`his rag went off its top: ${this.past.at}`);
    if (this.seenReads && 1 - this.unseen.value < CLOTH_SEEN_LEAST) out.push(`his rag was hidden by his hand: ${this.unseen.at}`);
    if (this.turn.value > RAG_TURN_MOST) out.push(`his rag spun in his hand: ${this.turn.at}`);
    if (!this.sweepFrames) out.push('his broom was never read sweeping');
    if (this.into.value > BROOM_INTO_MOST) out.push(`his broom went into the floor sweeping: ${this.into.at}`);
    if (this.floating.value > BROOM_OFF_MOST) out.push(`his broom swept the air: ${this.floating.at}`);
    if (this.carriedInto.value > BROOM_INTO_MOST) out.push(`his broom went into the floor carried: ${this.carriedInto.at}`);
    return out;
  }

  said(): string {
    const cm = (w: Worst, k = 100) => (w.value === -Infinity ? '-' : (w.value * k).toFixed(1));
    return `his rag on the tops (${this.wipeFrames} frames): at most ${cm(this.off, 1000)} mm off them (${this.off.at}), `
      + `at most ${cm(this.past)} cm past an edge (${this.past.at}), ${this.seenReads ? (this.seenSum / this.seenReads * 100).toFixed(0) : '-'}% `
      + `of it seen on average (the least: ${this.unseen.at}); turned at most ${this.turn.value === -Infinity ? '-' : (this.turn.value * 180 / Math.PI).toFixed(0)}° `
      + `in his hand in a frame (${this.turn.at}); his broom sweeping (${this.sweepFrames} frames): at most ${cm(this.into, 1000)} mm into the `
      + `floor (${this.into.at}), at most ${cm(this.floating, 1000)} mm over it at its lowest (${this.floating.at}); carried, at most `
      + `${cm(this.carriedInto, 1000)} mm into it`;
  }
}

/** a top he wipes, in the room */
interface Top { name: string; x: number; z: number; y: number; r?: number; hx?: number; hz?: number }

function barTop(): Top {
  return { name: 'bar', x: BAR.x, z: (BAR.from + BAR.to) / 2, y: BAR.top, hx: BAR.half, hz: (BAR.to - BAR.from) / 2 };
}

function nearestTable(at: THREE.Vector3): Top {
  const tops = Object.entries(TABLES).map(([name, t]) => ({ name, ...t, y: t.top }) as Top);
  return tops.sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
}

/** how far `point` (room) lies past `top`'s edge (m; 0 or less on it) */
function pastEdge(point: THREE.Vector3, top: Top): number {
  if (top.r !== undefined) return Math.hypot(point.x - top.x, point.z - top.z) - top.r;
  return Math.max(Math.abs(point.x - top.x) - top.hx!, Math.abs(point.z - top.z) - top.hz!);
}

/** the share of the rag's grid of points the camera sees, his own parts alone in the way */
function seenShare(pad: THREE.Mesh, keeper: Keeper, ray: THREE.Raycaster, v: THREE.Vector3): number {
  const camera = G.camera as THREE.Camera, from = camera.getWorldPosition(new THREE.Vector3());
  let seen = 0, all = 0;
  for (let i = 0; i < GRID[0]; i++) {
    for (let k = 0; k < GRID[1]; k++) {
      v.set((i / (GRID[0] - 1) - 0.5) * PAD.x * 1.8, 0.002, (k / (GRID[1] - 1) - 0.5) * PAD.z * 1.8);
      pad.localToWorld(v);
      const far = from.distanceTo(v);
      ray.set(from, v.clone().sub(from).normalize());
      ray.far = far - 0.01;
      all++;
      if (!ray.intersectObjects(keeper.parts.filter((p) => p.visible), false).length) seen++;
    }
  }
  return seen / all;
}

/** the lowest of the broom's points over the room's floor (m) */
function lowestOf(broom: THREE.Object3D, room: THREE.Object3D): number {
  let lowest = Infinity;
  const v = new THREE.Vector3();
  broom.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      room.worldToLocal(v);
      if (v.y < lowest) lowest = v.y;
    }
  });
  return lowest;
}
