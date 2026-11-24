// A thing an invited agent makes in the owner's live game (`npm run lab -- join make beacon --file
// tools/lab/examples/beacon.ts`, tools/lab/commands/join.md): the shape every made thing takes, and the one `lab
// invite` builds to check that a made thing is drawn. A module that exports `build(kit)`: what it adds to
// `kit.group` (or returns) stands in the scene, at the group's place on the ground; `kit.each` moves it by the game's
// step. It imports three alone (the game answers that with its own); the game's state is `kit.G`.
import * as THREE from 'three';
import type { MakeKit } from '../../../src/dev/agentMakes';

/** the post's height and the stone's size (m) */
const POST = 1.6;
const STONE = 0.35;
/** how fast the stone turns (rad/s), and how far it bobs (m) */
const TURN = 1.2;
const BOB = 0.08;

/** A post with a glowing stone turning over it. */
export function build(kit: MakeKit): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, POST, 10), wood);
  post.position.y = POST / 2;
  post.castShadow = true;

  const glow = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa030, emissiveIntensity: 2.5 });
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(STONE), glow);
  stone.name = 'stone';
  stone.position.y = POST + STONE;

  kit.group.add(post, stone);
  kit.each((dt, t) => {
    stone.rotation.y += TURN * dt;
    stone.position.y = POST + STONE + Math.sin(t * 2) * BOB;
  });
}
