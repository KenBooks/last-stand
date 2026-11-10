// Where a performance report was taken and what the hero was doing, in a line (`recorder.ts` keeps it with each
// snapshot): where he stood and which way he faced, whether he walked, cast or lay dead, and how the camera had the
// scene. A report said the biome and the view alone, and a picture of "this spot" had to be guessed (from the owner:
// "can you include sending scene detail in the report? so you know where exactly it was taken? angle of the character,
// what they were doing"). Nothing about the player: places and angles in the arena's own metres.
import { G } from '../state';
import { cameraYaw, cameraZoom, viewMode } from '../core/renderer';

/** the speed (m/s) from which the hero is said to walk */
const WALKING = 0.3;

const degrees = (rad: number): number => Math.round(((rad * 180 / Math.PI) % 360 + 360) % 360);

/** What the hero is doing, in a word or two. */
function doing(): string {
  const hero = G.player;
  if (hero.deadT >= 0) return 'down';
  if (hero.dash) return 'dashing';
  if (hero.channel) return `channelling ${hero.channel.skill.def.impl}`;
  if (hero.casting) return `casting ${hero.casting.skill.def.impl}`;
  const speed = Math.hypot(hero.vel.x, hero.vel.z);
  return speed > WALKING ? `walking ${speed.toFixed(1)} m/s` : 'standing';
}

/** The scene as a line: the hero's place (x, z), his facing, what he does, and the camera's view, zoom and turn. */
export function sceneNote(): string {
  const hero = G.player;
  if (!hero) return '';
  const at = `${hero.pos.x.toFixed(1)},${hero.pos.z.toFixed(1)}`;
  return `at ${at} facing ${degrees(hero.facing)}° | ${doing()} | camera ${viewMode()}, zoom ${cameraZoom().toFixed(2)}, `
    + `turned ${degrees(cameraYaw())}°`;
}
