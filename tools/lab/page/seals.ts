// `lab seals`: what the village's walls cost to seal as the boot seals them (src/world/wall.ts `seal`), each timed by
// the browser's own clock, and what each bounds, so a faster seal is held to the same answers. A seal casts rays out
// from the middle at a body's heights, one every quarter of a degree, to the nearest surface: the houses' rooms' were
// 2 to 5 s of a village boot on a CPU slowed four times (`npm run stalls -- --scenario boot --url "this?village=1"
// --cpu-slowdown 4 --js`), on every visit, first or not. Each wall is sealed again here, and what it bounds read before
// and after (its reach and what it met, slice by slice, as a digest), which must agree; an A/B's digests say whether
// main's seal bounds the same. `--canary` stands a box a metre from the first room's middle before its seal: its
// digest must change.
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Wall } from '../../../src/world/wall';
import type { Lab, Report } from './lab';

/** The options `lab seals` takes. */
export interface SealsOptions {
  canary: boolean;
}

/** the slices read round each wall (the seal's own) */
const SLICES = 1440;
/** the size of the canary's box (m), and how far from the middle it stands */
const CANARY_SIZE = 0.5;
const CANARY_AT = 1;

/** A wall the boot sealed, by name. */
interface NamedWall {
  name: string;
  wall: Wall;
}

/** The village's wall and each room's, as the boot built them; without the village (`--panels`), the biome shown. */
function wallsBuilt(): NamedWall[] {
  const village = G.arena.village as typeof G.arena.village | null;
  if (!village) return [{ name: G.arena.biome, wall: G.arena.wall }];
  const walls: NamedWall[] = [{ name: 'village', wall: village.wall }];
  for (const [id, room] of Object.entries(G.arena.rooms ?? {})) walls.push({ name: id, wall: room.wall });
  return walls;
}

/** FNV-1a over `text`, as 8 hex digits. */
function digestOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** What `wall` bounds, slice by slice: how far out, and what it met at which height, as a digest. */
function boundsOf(wall: Wall): string {
  const parts: string[] = [];
  for (let slice = 0; slice < SLICES; slice++) {
    const angle = ((slice + 0.5) / SLICES) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const bound = wall.boundAt(x, z);
    parts.push(`${wall.reachAt(x, z).toFixed(4)}:${bound ? `${bound.name}@${bound.y}` : '-'}`);
  }
  parts.push(`near ${wall.near.toFixed(4)}`, `most ${wall.most.toFixed(4)}`);
  return digestOf(parts.join('|'));
}

/** The canary's box stood a metre from `wall`'s middle, at a body's height. */
function standCanary(wall: Wall): void {
  const box = new THREE.BoxGeometry(CANARY_SIZE, CANARY_SIZE, CANARY_SIZE);
  const at = new THREE.Matrix4().makeTranslation(CANARY_AT, 1, 0);
  wall.addGeometry(box, at, false);
}

/** `lab seals`: each wall sealed again on the browser's clock, its bounds before and after. */
export function sealsTimed(lab: Lab, options: SealsOptions): Report {
  const problems: string[] = [];
  const lines: string[] = [];
  const now = window.__labClock.realNow;
  let total = 0;
  const walls = wallsBuilt();
  for (const [index, { name, wall }] of walls.entries()) {
    const before = boundsOf(wall);
    if (options.canary && index === Math.min(1, walls.length - 1)) standCanary(wall);
    const start = now();
    wall.seal();
    const took = now() - start;
    total += took;
    const after = boundsOf(wall);
    lines.push(`${name}: bounds ${after}`);
    lines.push(`  sealed in ${took.toFixed(1)} ms (a time, this run's)`);
    if (after !== before) problems.push(`${name}'s bounds sealed again (${after}) aren't the boot's (${before})`);
  }
  lines.push(`every wall sealed in ${total.toFixed(1)} ms (a time, this run's)`);
  if (options.canary && !problems.some((problem) => problem.startsWith(walls[Math.min(1, walls.length - 1)].name))) {
    problems.push('the canary\'s box stood in a room changed nothing its seal bounds');
  }
  void lab;
  return { text: lines.join('\n'), problems };
}
