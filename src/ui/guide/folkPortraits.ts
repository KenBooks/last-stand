// The village folk's portraits, for their cards (the talk's, the trade's): another of each built on his own model, a
// slice at a time behind the lobby as the guide's pictures are (ui/guide/portraits.ts makes and keeps them), posed
// looking at the camera: his head turned square to it, his eyes on it, head and shoulders in the oval, lit from high in
// front so his face reads and his glasses don't flash (from play: "Have him look straight", of Brother Hollis's, which
// looked off at the one he talked to; "Also add this for the other character npc's in the game ... Real picture of
// their face, looking at camera"). One of the folk is pictured with an entry in `FOLK`: how his model is built, its
// head and eyes, how it's posed looking at a place, and the room behind him.
import * as THREE from 'three';
import { scholarBook, scholarSteps } from '../../entities/models/scholar';
import { odoShop, odoSteps } from '../../entities/models/merchant';
import { keeperSteps, KEEPER_MADE } from '../../entities/models/keeper';
import { KEEPER_PORTRAIT } from '../../data/tavern';

/** The folk pictured: the library's Brother Hollis, Odo the merchant, Bertram the tavern's keeper. */
export type FolkId = 'scholar' | 'odo' | 'bertram';

/** One of the folk, built for his picture: his root, his head's joint and his eyes, and his pose for a step of `dt`
 *  looking at `at` (his root's parent's frame: the picture's scene). */
export interface Sitter {
  root: THREE.Object3D;
  head: THREE.Object3D;
  eyes: readonly THREE.Object3D[];
  look(dt: number, at: THREE.Vector3): void;
}

/** How each is pictured: his model built a slice at a time (null where it can't be yet: the room he's built from never
 *  built), and the room behind him. */
export interface Folk {
  sitter(): Generator<void, Sitter, undefined> | null;
  backdrop: Backdrop;
}

/** the room behind one of the folk: its glow's colours (inner, middle, outer) and its shelves' (a book's or a jar's) */
interface Backdrop { glow: [string, string, string]; shelf: (x: number) => string }

export const FOLK: Record<FolkId, Folk> = {
  // (his model built on the library's book, posed as he's talked to)
  scholar: {
    sitter() {
      const book = scholarBook();
      if (!book) return null;
      return (function* () {
        const s = yield* scholarSteps(book);
        return { root: s.root, head: joint(s.root, 'scholar head'), eyes: eyesOf(s.root), look: (dt, at) => s.update(dt, at, true, 0) };
      })();
    },
    backdrop: { glow: ['#6a4220', '#2a180c', '#0c0806'], shelf: (x) => `rgba(${90 + ((x * 13) % 60)}, ${40 + ((x * 7) % 30)}, 20, .16)` },
  },
  // (his model built on his shop's plan, posed with no time passing: a step of his day would move the shop's own
  // things, which his plan shares)
  odo: {
    sitter() {
      const shop = odoShop();
      if (!shop) return null;
      return (function* () {
        const o = yield* odoSteps(shop);
        return { root: o.root, head: o.joints.head, eyes: eyesOf(o.root), look: (_dt, at) => o.update(0, { customers: [at], trading: true, t: 0 }) };
      })();
    },
    backdrop: { glow: ['#5a4a26', '#22180c', '#0a0806'], shelf: (x) => `rgba(${120 + ((x * 11) % 70)}, ${90 + ((x * 5) % 50)}, ${50 + ((x * 3) % 40)}, .14)` },
  },
  // (built once his room has made his head and face, posed stood at rest looking at the camera: his neck and head as
  // `KEEPER_PORTRAIT` holds them, the staging squaring them to it; the bar's bottles behind him, green and amber)
  bertram: {
    sitter() {
      if (!KEEPER_MADE.head) return null;
      return (function* () {
        const b = yield* keeperSteps();
        b.placed();
        const look = (dt: number, at: THREE.Vector3) => {
          b.pose(Math.max(dt, 1e-3), { speed: 0, bend: 0, crouch: 0, look: at, left: null, right: null });
          b.joints.neck.rotation.x += KEEPER_PORTRAIT.neck.pitch;
          b.joints.head.rotation.x += KEEPER_PORTRAIT.head.pitch;
        };
        return { root: b.root, head: b.joints.head, eyes: eyesOf(b.root), look };
      })();
    },
    backdrop: { glow: ['#6a4a1c', '#26180a', '#0a0705'], shelf: (x) => (x % 3 ? `rgba(${40 + ((x * 7) % 30)}, ${80 + ((x * 11) % 50)}, 40, .16)` : `rgba(${140 + ((x * 13) % 60)}, ${90 + ((x * 5) % 40)}, 30, .16)`) },
  },
};

/** Whether `id` is one of the folk. */
export const isFolk = (id: string): id is FolkId => id in FOLK;

/** The picture: how far the camera stands from his face (m), its field of view, how far below his eyes it aims (m:
 *  his face, beard and shoulders in the frame's 0.5 m; from the top of his head, Odo's hat was all of it), how much
 *  higher than that it stands (m), how long he's
 *  posed for his look to settle (s, in steps), and where the key light is from the camera (m: right, up, ahead of it:
 *  high, so his glasses throw it down and away from the lens). */
export const FOLK_SHOT = { distance: 0.95, fov: 30, below: 0.035, above: 0.06, settle: 2, step: 0.05, key: new THREE.Vector3(0.9, 1.6, -0.2) };

/** `name`'s joint in `root` (a joint, not a mesh: a mesh may share its joint's name). */
function joint(root: THREE.Object3D, name: string): THREE.Object3D {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => { if (!found && o.name === name && !(o as THREE.Mesh).isMesh) found = o; });
  if (!found) throw new Error(`no ${name} to picture`);
  return found;
}

/** His eyes (the head's eye meshes: models/head.ts names them). */
function eyesOf(root: THREE.Object3D): THREE.Object3D[] {
  const eyes: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name === 'eye') eyes.push(o); });
  return eyes;
}

/** `sitter` in a scene of his own, posed looking at the camera, and the camera: in front of him (the way his root
 *  faces), level with his face, and his head then turned square to it and his eyes set straight in his head. */
export function folkStaged(sitter: Sitter, backdrop: Backdrop): { root: THREE.Object3D; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = backdropTexture(backdrop);
  scene.add(sitter.root);
  const camera = new THREE.PerspectiveCamera(FOLK_SHOT.fov, 1, 0.05, 20);
  const place = () => {
    sitter.root.updateMatrixWorld(true);
    const eyes = sitter.eyes.reduce((sum, e) => sum.add(e.getWorldPosition(new THREE.Vector3())), new THREE.Vector3()).divideScalar(sitter.eyes.length);
    const ahead = new THREE.Vector3(0, 0, 1).transformDirection(sitter.root.matrixWorld).setY(0).normalize();
    const aim = sitter.head.getWorldPosition(new THREE.Vector3()).setY(eyes.y - FOLK_SHOT.below);
    camera.position.copy(aim).addScaledVector(ahead, FOLK_SHOT.distance).setY(aim.y + FOLK_SHOT.above);
    camera.lookAt(aim);
  };
  // (posed looking where the camera will be, then the camera set by where his head came to)
  place();
  for (let t = 0; t < FOLK_SHOT.settle; t += FOLK_SHOT.step) sitter.look(FOLK_SHOT.step, camera.position);
  place();
  squareTo(sitter, camera.position);
  sitter.root.updateMatrixWorld(true);
  scene.add(new THREE.HemisphereLight(0xffd8b0, 0x1a1008, 0.55));
  const key = new THREE.DirectionalLight(0xffc890, 2.8);
  key.position.copy(FOLK_SHOT.key).applyQuaternion(camera.quaternion).add(camera.position);
  key.target.position.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.4);
  rim.position.copy(camera.position).negate().setY(2.2);
  scene.add(rim);
  return { root: sitter.root, scene, camera };
}

/** His head turned to face `at` square (its +z on it, its up as near the world's as it goes) and his eyes on it:
 *  whatever his model's own look reaches, he looks into the camera. */
export function squareTo(sitter: Sitter, at: THREE.Vector3): void {
  const head = sitter.head;
  head.updateWorldMatrix(true, false);
  const from = head.getWorldPosition(new THREE.Vector3());
  // (its +z from its place to `at`, as an object's lookAt has it)
  const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(at, from, new THREE.Vector3(0, 1, 0)));
  const parent = head.parent!.getWorldQuaternion(new THREE.Quaternion());
  head.quaternion.copy(parent.invert().multiply(want));
  head.updateWorldMatrix(false, true);
  // (each eye's own +z on it: they sit in the face's frame, turned from the head's joint)
  for (const eye of sitter.eyes) { eye.updateWorldMatrix(true, false); eye.lookAt(at); eye.updateWorldMatrix(false, true); }
}

/** The room behind him, dim: a warm glow up to his left, its shelves' rows dark across it. */
function backdropTexture(b: Backdrop): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(40, 36, 4, 56, 56, 110);
  glow.addColorStop(0, b.glow[0]);
  glow.addColorStop(0.45, b.glow[1]);
  glow.addColorStop(1, b.glow[2]);
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  // (the shelves: their boards, and what stands on them between, faint)
  for (const y of [30, 62, 94]) {
    g.fillStyle = 'rgba(0, 0, 0, .45)';
    g.fillRect(0, y, 128, 3);
    for (let x = 0; x < 128; x += 5 + ((x * 7) % 4)) {
      g.fillStyle = b.shelf(x);
      g.fillRect(x, y - 22 + ((x * 3) % 5), 3 + ((x * 5) % 3), 22 - ((x * 3) % 5));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
