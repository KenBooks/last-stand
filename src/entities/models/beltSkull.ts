// The Ossuary Twins' belt skulls (models/twins.ts, entities/twinSkulls.ts): one small skull, the same object on the
// rope, in the hand, in flight and lying where it landed (from Kenneth: "I expect the skull after being thrown to be
// visible on the ground before/while the effect lasts"). It's the crypt's skull with the twins' jaw (models/ossuary.ts,
// the house style of Reliquary's own small skulls): the cranium's dome, the brow, hollow sockets with a glow set deep
// in each, the nose's hole, the cheekbones, the upper and lower teeth, the temples drawn in. An iron ring through its
// crown hangs it on its cord.
//
// From Kenneth's look at the first ("Those skulls need work, improve model": a lumpy dome with two flat glows stuck on
// it): meshed on a grid of 4.5 cm, a man's skull is four cells across, and every part of its face fell between them.
// It's meshed fine (`FINE`) and simplified as every bone of the twins' is (`fewer` in ossuary.ts): the edge collapse
// keeps the vertices it leaves on the field's surface with its normals and hollows' shading, so the sockets, the nose
// and the teeth hold at a fraction of the triangles. The simplifier loads with the Twins' file (`readyBeltSkulls`,
// which `loadFoe` waits for), so a skull is never made before it's ready.
//
// Its materials are a kit of its own, made once and never disposed: a skull thrown keeps lying after its thrower has
// fallen and gone, and its pipelines are made with the Twins' warm-up, as their ropes wear the same skulls.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { jaw, readyOssuary, skull, SKULL_EYE, SKULL_NECK } from './ossuary';

export type SkullKind = 'bomb' | 'poison';
/** each kind's light: the bomb's hot orange, the poison's sickly green */
export const SKULL_LIGHT: Record<SkullKind, number> = { bomb: 0xff7a1a, poison: 0x8cff3a };
/** its size against a man's skull: large enough to read from the run's camera on the floor */
export const BELT_K = 2.4;
/** the grids its skull and jaw are meshed on, and how far a simplified surface may lie from the net's (m, a man's
 *  skull's units: 1 mm, 2.4 at its size: on a grid this fine a share of its cell kept 4.8k triangles) */
const FINE = { skull: 0.0055, jaw: 0.005, error: 0.001 };
/** where the skull's middle is in the sculpt's space (m): the group is centred on it */
const MIDDLE = new THREE.Vector3(SKULL_NECK[0], SKULL_NECK[1] + 0.06, SKULL_NECK[2]);
/** the ring through its crown: its middle in the sculpt's space, its radius and its tube's (m) */
const RING = { at: new THREE.Vector3(0, 0.166, -0.012), r: 0.014, tube: 0.0034 };
/** each socket's glow: small and deep in the hollow (as large as the socket, a glow filled it, a disc where the
 *  hollow should read: the twins' own eyes), its radius and how far behind the socket's mouth (m) */
const EYE = { r: 0.0052, back: 0.024 };
/** how far its jaw is raised from where the twins' head hinges it (m): shut, its teeth on the upper ones (as the
 *  twins' it hung open a finger's width, and read as a jaw dropped off its skull) */
const BITE = 0.011;
/** how far over its middle the top of its ring is (m, at its size): where the cord from the rope's knot ties on */
export const HOOK_TOP = (RING.at.y + RING.r + RING.tube - MIDDLE.y) * BELT_K;
/** the cord from the knot to the ring (m), and how far below its knot a skull's middle hangs (m) */
const CORD = 0.08;
export const SKULL_DROP = HOOK_TOP + CORD;

let ready: Promise<void> | null = null;

/** The simplifier loaded and the skull's geometries made, once: the Twins' file waits for it as it loads. */
export function readyBeltSkulls(): Promise<void> {
  ready ??= readyOssuary().then(() => {
    parts();
  });
  return ready;
}

/** A geometry's every vertex shaded `shade` (the kit's materials take their shading from vertex colours). */
function shaded(g: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const colours = new Float32Array(g.getAttribute('position').count * 3).fill(shade);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

interface Parts {
  bone: THREE.Material;
  iron: THREE.Material;
  eyes: Record<SkullKind, THREE.Material>;
  skull: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
}
let made: Parts | null = null;

/** The belt skulls' shared materials and geometries, made the first time one is asked for. */
function parts(): Parts {
  if (made) return made;
  const kit = createKit(0xc0a070);
  const skullGeo = skull(FINE.skull, FINE.error);
  const jawGeo = jaw(FINE.jaw, FINE.error);
  const ring = shaded(new THREE.TorusGeometry(RING.r, RING.tube, 6, 14).rotateY(Math.PI / 2)
    .translate(RING.at.x, RING.at.y, RING.at.z), 1);
  made = {
    // (the twins' bone: shaded by the sculpt's vertex colours, its hollows dark)
    bone: kit.std({ color: 0xe0d4b2, roughness: 0.78, vertexColors: true }),
    // (the ring's iron in the same kind of material: no pipeline of its own)
    iron: kit.std({ color: 0x5a5248, roughness: 0.55, metalness: 0.5, vertexColors: true }),
    eyes: { bomb: kit.glow(SKULL_LIGHT.bomb, 6), poison: kit.glow(SKULL_LIGHT.poison, 6) },
    skull: skullGeo,
    jaw: jawGeo,
    eye: new THREE.SphereGeometry(EYE.r, 8, 6),
    ring,
  };
  // (kept by every twin's dispose, as a sculpt's are: every skull shares them)
  for (const g of [made.skull, made.jaw, made.eye, made.ring]) g.userData.shared = true;
  return made;
}

/** How far over the floor a skull lying on it has its middle (m, at its size): its jaw's foot under its middle. */
export function skullRest(): number {
  const { jaw: jawGeo } = parts();
  jawGeo.computeBoundingBox();
  return (MIDDLE.y - BITE - jawGeo.boundingBox!.min.y) * BELT_K * 0.92;
}

/** The skull's triangles as drawn (its skull, jaw, eyes and ring), for the lab's budget. */
export function beltSkullTriangles(): number {
  const p = parts();
  const count = (g: THREE.BufferGeometry): number => (g.getIndex()?.count ?? g.getAttribute('position').count) / 3;
  return count(p.skull) + count(p.jaw) + 2 * count(p.eye) + count(p.ring);
}

/**
 * A belt skull of `kind`, its middle at its group's origin, facing +z, its ring's top `HOOK_TOP` over it: a skull at
 * `BELT_K` times a man's, its sockets lit. Its own group, to place, turn and hide; its geometry and materials shared
 * by every one.
 */
export function beltSkullMesh(kind: SkullKind): THREE.Group {
  const p = parts();
  const g = new THREE.Group();
  g.name = `belt skull ${kind}`;
  const head = new THREE.Group();
  head.position.copy(MIDDLE).negate();
  for (const [geo, mat] of [[p.skull, p.bone], [p.jaw, p.bone], [p.ring, p.iron]] as const) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = geo !== p.ring;
    if (geo === p.jaw) mesh.position.y = BITE;
    head.add(mesh);
  }
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(p.eye, p.eyes[kind]);
    e.position.set(s * SKULL_EYE[0], SKULL_EYE[1], SKULL_EYE[2] - EYE.back);
    head.add(e);
  }
  g.add(head);
  g.scale.setScalar(BELT_K);
  return g;
}
