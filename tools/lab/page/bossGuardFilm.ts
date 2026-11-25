// `boss --parts film`'s guards: the Ossuary Cantor's two Bell-Wardens as the Crypt's wave 10 sends them, filmed as a
// player would see them, for the eye (from play: "They stay stationary", two whole Bell-Wardens beside the Cantor
// were "too big (almost like main boss)", "the bells should spawn in the same spots, across from each other on the
// map"). The wave is set off from its countdown as the game sets one off; each guard is filmed from low at a hero's eye
// height as it stands through a few seconds (`bossFilm.ts`'s camera, its place the clearest of eight ways round it),
// then the two with the Cantor from the arena's middle. What they do is measured by `encounter`
// (bossGuardSpots.ts, boss.ts): this part judges nothing but that its moments happened.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { WAVES } from '../../../src/data/waves';
import { startNextWave } from '../../../src/game/run';
import { EYE, clearView, filmedFrom } from './bossFilm';

/** Frames for the wave to start from its countdown, and for its guards and Cantor to rise after. */
const START_FRAMES = 30;
const RISE_FRAMES = 400;
/** Each guard's frames: this many, this many frames apart (it stands; its bell swings as it tolls). */
const GUARD_SHOTS = 3;
const GUARD_EVERY = 90;
/** How far off a guard the camera may stand (m), nearest first, and the heights on it its sight is tried at (m). */
const GUARD_DISTANCES = [7, 9, 11];
const GUARD_SIGHTS = [0.4, 1, 1.6];
/** The height on a guard the camera looks at (m): a lesser bell's middle. */
const GUARD_LOOK_AT = 1;
/** The ways round a guard tried for the camera: eight, a turn's eighth apart. */
const WAYS = Array.from({ length: 8 }, (_, k) => {
  const angle = k * Math.PI / 4;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});
/** Where the wide frame of the encounter is taken from (m: the arena's middle at eye height) and how high it looks. */
const WIDE_AT = new THREE.Vector3(0, EYE, 0);
const WIDE_LOOK_AT = 2;
const FPS = 60;

/** What the part is handed: the lab, its set-up (stood in the crypt), and where to report. */
export interface GuardFilmMeasure {
  lab: Lab;
  stand: () => Promise<void>;
  lines: string[];
  problems: string[];
}

/** The Crypt's wave 10 set off, its guards filmed each where it stands, then the encounter from the middle. */
export async function guardFilm({ lab, stand, lines, problems }: GuardFilmMeasure): Promise<Pictured[]> {
  await stand();
  const guards = await encounterRisen(lab);
  if (guards.length < 2) {
    problems.push(`film: ${guards.length} guards rose on the Crypt's wave 10, not 2`);
    return [];
  }
  const moments: Pictured[] = [];
  const rose = guards.map((guard) => guard.pos.clone());
  const views = guards.map((guard) => clearView(guard, WAYS, GUARD_DISTANCES, GUARD_SIGHTS));
  views.forEach((view, i) => {
    const off = view.offset.length().toFixed(0);
    lines.push(`film: guard ${i + 1} from ${off} m off, ${view.hidden} sight rays met something`);
  });
  for (let shot = 0; shot < GUARD_SHOTS; shot++) {
    for (const [i, guard] of guards.entries()) {
      const eye = guard.pos.clone().add(views[i].offset).setY(EYE);
      const label = `film guard ${i + 1} ${shot + 1}`;
      const note = `guard ${i + 1}, ${(shot * GUARD_EVERY / FPS).toFixed(1)} s on: standing where it rose`;
      moments.push(await filmedFrom(lab, eye, guard.pos.clone().setY(GUARD_LOOK_AT), label, note));
    }
    await lab.step(GUARD_EVERY, keepHero);
  }
  moments.push(await wide(lab, guards));
  const moved = Math.max(...guards.map((guard, i) => guard.pos.distanceTo(rose[i])));
  lines.push(`film: the guards in ${GUARD_SHOTS} frames each, ${GUARD_EVERY} frames apart, moved ${moved.toFixed(2)} m `
    + 'at most, and the encounter from the middle');
  return moments;
}

/** The hero kept alive through the film (the encounter's casts land on him). */
function keepHero(): Record<string, never> {
  G.player.life = G.player.stats.maxLife;
  return {};
}

/** The Crypt's wave 10 from its countdown until its Cantor and guards have risen: its guards, where each rose. */
export async function encounterRisen(lab: Lab): Promise<Enemy[]> {
  lab.letWavesCome();
  const run = G.run!;
  run.wave = WAVES.bossEvery * 2;
  startNextWave();
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', START_FRAMES, 'film: the encounter\'s wave never started');
  const risen = (foe: Enemy): boolean => foe.alive && foe.spawning <= 0;
  const ready = (): boolean => G.enemies.filter((foe) => foe.guard && risen(foe)).length >= 2
    && G.enemies.some((foe) => foe.type === 'cantor' && risen(foe));
  await lab.until(ready, RISE_FRAMES, 'film: the encounter\'s Cantor and guards never rose');
  return G.enemies.filter((foe) => foe.guard && risen(foe));
}

/** The encounter from the arena's middle at eye height, looking between the two guards towards the Cantor. */
async function wide(lab: Lab, guards: Enemy[]): Promise<Pictured> {
  const cantor = G.enemies.find((foe) => foe.type === 'cantor');
  const target = (cantor ?? guards[0]).pos.clone().setY(WIDE_LOOK_AT);
  const eye = WIDE_AT.clone();
  // (stood back 10 m from the middle, away from the Cantor, so it and the guards either side are in one frame)
  eye.addScaledVector(target.clone().setY(EYE).sub(eye).normalize(), -10);
  return filmedFrom(lab, eye, target, 'film encounter', 'the Cantor and its two guards, from low');
}
