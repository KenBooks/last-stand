// The Rootmother's two pods for the eye (tools/lab `boss --parts podPictures`; entities/rootmother.ts `seedPodAI`,
// models/seedpod.ts): from Kenneth, "Can you have stronger mobs come from larger cacoons for the mother". A small pod
// and a great one side by side before the hero, as the player sees them from the top-down camera, then a great pod
// left to ripen and burst into its Mossback, pictured every few frames through its last second and after. No verdict:
// the `pods` part judges what each hatches and when.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { ROOTMOTHER } from '../../../src/data/foes/rootmother';
import { fixed, standIn, type BossOptions } from './boss';

/** frames a second, the frames a pod takes to rise, and the hatch's pictures: how many and the frames between */
const FPS = 60;
const RISE_FRAMES = 3 * FPS;
const HATCH_SHOTS = 8;
const HATCH_EVERY = 10;
/** how far before the hero the pods stand (m), and how far apart */
const AHEAD = 5;
const APART = 3;
/** how long before its burst the hatch's first picture is taken (s) */
const BEFORE_BURST = 0.6;

/** A pod of `kind` risen at `at`, holding still, its ripening let run. */
async function podAt(lab: Lab, kind: 'seedpod' | 'bigpod', at: THREE.Vector3): Promise<Enemy> {
  const pod = lab.spawnFoe(kind, at);
  await lab.until(() => pod.spawning <= 0, RISE_FRAMES, `the ${kind} never rose`);
  return pod;
}

/** `podPictures` (by name): both sizes side by side as the player sees them, and a great pod bursting. */
export async function podPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  await standIn(lab, options.fixture, 'forest');
  lab.letWavesCome();
  const hero = G.player;
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const across = new THREE.Vector3(ahead.z, 0, -ahead.x);
  const middle = hero.pos.clone().addScaledVector(ahead, AHEAD).setY(0);
  const small = await podAt(lab, 'seedpod', middle.clone().addScaledVector(across, -APART / 2));
  const great = await podAt(lab, 'bigpod', middle.clone().addScaledVector(across, APART / 2));
  await lab.step(30);
  moments.push(await lab.screen('pods side by side', ['a small seed pod (left) and a great pod (right), as the player sees them']));
  small.die();
  // (the great pod brought to a moment before its burst: its ripening's own wait is too long for a picture)
  great.brain.ripe = ROOTMOTHER.seeds.great.hatch - BEFORE_BURST;
  for (let shot = 0; shot < HATCH_SHOTS; shot++) {
    await lab.step(HATCH_EVERY);
    const t = shot * HATCH_EVERY / FPS - BEFORE_BURST + HATCH_EVERY / FPS;
    const note = t < 0 ? `a great pod ripening, ${fixed(-t, 2)} s before it bursts` : `${fixed(t, 2)} s after it burst`;
    moments.push(await lab.screen(`great pod hatching ${shot + 1}`, [note]));
  }
  lines.push(`podPictures: ${moments.length} moments`);
  return moments;
}
