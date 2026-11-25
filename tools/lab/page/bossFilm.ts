// `boss --parts film`: the Bell-Warden guard's toll filmed as a player would see it from low at its side, for the eye
// (from Victor's look at it: "bell is still like a catapult and rotates its axis. It looks unnatural"). The frames are
// the game's own, drawn by its renderer (the engine on main) and taken by the browser (`Lab.screen`), the page's UI
// set aside; the camera stands at a hero's eye height off the bell's side, looking along its crown's axis so the whole
// arc of its swing is seen across the frame, never from above. It's staged in the arena's middle, on the open paving
// round the dais (bossEncounter.ts `film`): a toll from its start, the bell swinging back through its warning,
// striking, swaying out.
// What the movement measures is `swing` (bossSwing.ts): this part judges nothing but that its moments happened.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';

/** The camera's height (m): a hero's eyes. */
export const EYE = 1.7;
/** How far off the bell's side the camera may stand (m), nearest first, the heights on the bell its sight is tried
 *  at (m), and the height on the boss it looks at (m). */
const DISTANCES = [14, 16, 18, 20, 12];
const SIGHT_HEIGHTS = [0.6, 2, 3.5, 5];
/** The ground between the lens and the bell its sight is tried at (shares of the way), and how high there (m). */
const GROUND_SIGHTS = [0.08, 0.15, 0.25, 0.4, 0.6];
const GROUND_SIGHT_HEIGHT = 0.3;
/** A hit lower than this is the floor's (m). */
const FLOOR_SLACK = 0.08;
const LOOK_AT = 3;
/** The toll's frames filmed: every this many frames from its start, this many in all. */
const TOLL_EVERY = 10;
const TOLL_SHOTS = 10;
/** Frames waited for the toll to begin. */
const TOLL_WAIT = 300;
const FPS = 60;

/** What the part is handed: the lab, a Bell-Warden guard risen near the hero and thinking, and where to report. */
export interface FilmMeasure {
  lab: Lab;
  boss: Enemy;
  lines: string[];
  problems: string[];
}

/** The bell's toll filmed from its side at eye height. */
export async function bellFilm({ lab, boss, lines, problems }: FilmMeasure): Promise<Pictured[]> {
  const { offset: side, hidden, tried } = sideOf(boss);
  const rays = SIGHT_HEIGHTS.length + GROUND_SIGHTS.length;
  lines.push(`film: its side ${side.length().toFixed(0)} m off, ${hidden} of ${rays} sight rays met something `
    + `(${tried.join(', ')})`);
  return tollFilm(lab, boss, side, lines, problems);
}

/** The camera's place off the bell's side: along its crown's axis (its facing's right), level, the first of `DISTANCES` on
 *  either side from which the fewest sight rays meet something before the bell (by the lab's spot near the
 *  gravestones, a column and an obelisk stood before the lens). */
function sideOf(boss: Enemy): ClearView {
  const axis = new THREE.Vector3(Math.cos(boss.facing), 0, -Math.sin(boss.facing));
  return clearView(boss, [axis, axis.clone().negate()], DISTANCES);
}

/** A camera's place off a body found by `clearView`: its offset, how many sight rays met something, and each tried. */
export interface ClearView {
  offset: THREE.Vector3;
  hidden: number;
  tried: string[];
}

/** The camera's place off `body` along one of `ways` (level, unit), at the first of `distances` from which the fewest
 *  sight rays meet something before it (the first tried on a tie). */
export function clearView(body: Enemy, ways: THREE.Vector3[], distances: number[], heights = SIGHT_HEIGHTS): ClearView {
  let best = ways[0].clone().multiplyScalar(distances[0]);
  let fewest = Infinity;
  const tried: string[] = [];
  for (const distance of distances) {
    for (const [i, way] of ways.entries()) {
      const offset = way.clone().multiplyScalar(distance);
      const hidden = hiddenFrom(body, offset, heights);
      tried.push(`${i}@${distance} m ${hidden}`);
      if (hidden < fewest) {
        fewest = hidden;
        best = offset;
      }
    }
  }
  return { offset: best, hidden: fewest, tried };
}

/** How many of the sight rays from the camera at `offset` off the boss meet something drawn before the bell: rays to
 *  the bell at each of `heights`, and to the ground between (`GROUND_SIGHTS`: what fills the frame's foot, a
 *  gravestone a step off the lens). The floor and the bell's own body don't count. */
function hiddenFrom(boss: Enemy, offset: THREE.Vector3, heights: number[]): number {
  const eye = boss.pos.clone().add(offset).setY(EYE);
  const targets = heights.map((height) => boss.pos.clone().setY(height));
  for (const share of GROUND_SIGHTS) targets.push(eye.clone().lerp(boss.pos, share).setY(GROUND_SIGHT_HEIGHT));
  return targets.filter((target) => {
    const way = target.clone().sub(eye);
    const ray = new THREE.Raycaster(eye, way.clone().normalize(), 0.3, way.length());
    // (every layer: a prop drawn on a layer of its own hides the bell as well)
    ray.layers.enableAll();
    return ray.intersectObject(G.scene, true).some((hit) => blocks(hit, boss));
  }).length;
}

/** Whether a sight ray's hit hides the bell: something solid and shown, off the floor and off the bell's body. */
function blocks(hit: THREE.Intersection, boss: Enemy): boolean {
  const object = hit.object;
  if (!(object instanceof THREE.Mesh) || hit.point.y < FLOOR_SLACK) return false;
  if (Math.hypot(hit.point.x - boss.pos.x, hit.point.z - boss.pos.z) < boss.radius + 1) return false;
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  const material = object.material as THREE.Material;
  return !material.transparent;
}

/** A toll from its start, a frame every `TOLL_EVERY`. */
async function tollFilm(
  lab: Lab, boss: Enemy, side: THREE.Vector3, lines: string[], problems: string[],
): Promise<Pictured[]> {
  const hero = G.player;
  const keep = (): Record<string, never> => {
    hero.life = hero.stats.maxLife;
    return {};
  };
  boss.cd = 0;
  await lab.until(() => boss.action?.name === 'toll', TOLL_WAIT, 'film: the bell never tolled');
  const moments: Pictured[] = [];
  for (let shot = 0; shot < TOLL_SHOTS; shot++) {
    if (boss.action?.name !== 'toll') break;
    const share = boss.action.t;
    const label = `film toll ${String(shot + 1).padStart(2, '0')}`;
    const seconds = (shot * TOLL_EVERY / FPS).toFixed(2);
    const note = `the toll at ${share.toFixed(2)} of its action, ${seconds} s in, from its side at eye height`;
    moments.push(await filmed(lab, boss, side, label, note));
    await lab.step(TOLL_EVERY, keep);
  }
  lines.push(`film: the toll in ${moments.length} frames, ${TOLL_EVERY} frames apart, `
    + `from ${side.length().toFixed(0)} m off its side at ${EYE} m`);
  if (moments.length < 4) problems.push(`film: the toll lasted ${moments.length} of its frames`);
  return moments;
}

/** This frame as the game draws it from the camera `side` off `boss`, at eye height, the page's UI set aside. */
export async function filmed(
  lab: Lab, boss: Enemy, side: THREE.Vector3, label: string, note: string,
): Promise<Pictured> {
  const at = boss.pos.clone().add(side).setY(EYE);
  return filmedFrom(lab, at, boss.pos.clone().setY(LOOK_AT), label, note);
}

/** This frame as the game draws it from `at` looking at `target`, the page's UI set aside. */
export async function filmedFrom(
  lab: Lab, at: THREE.Vector3, target: THREE.Vector3, label: string, note: string,
): Promise<Pictured> {
  const camera = G.camera;
  camera.position.copy(at);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const shown = gameOnly();
  try {
    return await lab.screen(label, [note]);
  } finally {
    shown();
  }
}

/** The page's UI hidden, the canvases filling the window left shown: what puts it back. */
function gameOnly(): () => void {
  const body = document.body.style.visibility;
  document.body.style.visibility = 'hidden';
  const frames = [...document.querySelectorAll('canvas')].filter((canvas) => canvas.clientWidth >= innerWidth * 0.9);
  const was = frames.map((canvas) => canvas.style.visibility);
  for (const canvas of frames) canvas.style.visibility = 'visible';
  return () => {
    document.body.style.visibility = body;
    frames.forEach((canvas, i) => {
      canvas.style.visibility = was[i];
    });
  };
}
