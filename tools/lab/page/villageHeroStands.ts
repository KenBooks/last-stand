// `lab village`'s heroes standing on the hall's dais after another hero was chosen (from play, "after picking warrior
// then ranger, warrior is dancing on one leg like irish dancer"): the hall of heroes opened, another hero chosen, him
// walked into the village's hall, and each hero standing there read over some seconds: both ankles on his plinth,
// within a step's height. `heroLeftStands` reads the hero left in the hall's own row as another is picked (from play,
// "when picking hero, the previous hero starts irish dancing for a few sec"). `canary` lifts a foot, which must be
// found.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import { focusHall, hallFocus, hallHeroes, hallShot, heroesStanding, hallOpen } from '../../../src/game/hall';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewSettled } from '../../../src/core/renderer';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { villageObject } from '../../../src/game/village';
import { isWarm } from '../../../src/game/warm';
import { openHall, toLobby } from './hallMoves';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to the hall as it opens and after each key, the rounds read and the frames between them */
const SETTLE = 120;
/** how long the hall stands open before he's chosen, on the warrior as his showcase runs, and for the first choice */
const WAITS = [70, 130];
/** who's chosen, then chosen away from: each hero left to stand as his showcase runs */
const CHOICES = [['warrior', 'ranger'], ['ranger', 'mage'], ['mage', 'warrior']];
const WAIT_FIRST = 5;
const SETTLE_LOBBY = 30;
const ROUNDS = 12;
/** how far up the stair he stands to look at the door (m), how far out past its foot to look away (the camera behind
 *  him higher up stands in the doorway), and the most frames for the heroes to warm */
const STAIR_UP = 2;
const SQUARE_OUT = 4;
/** where he stands before the fountain with the hall beyond it (x, z: `data/village.ts`'s place of that name) */
const FROM_FOUNTAIN = [-0.6, 7.2];
const WARM_FRAMES = 6000;
const FRAMES_A_ROUND = 30;
/** the frames a hero left in the row is read over */
const READ_LEFT = 120;
/** the frames read back from a cancelled hall, the most he may be off his floor there (m), and the canary's drop */
const READ_BACK = 30;
const MOST_OFF_FLOOR = 0.01;
const CANARY_DROP = 0.5;
/** the frames a hero long at rest is read over, an ankle's height past its rest that counts as a foot up (m), and the
 *  frames one may be up as he's left: a step, not a dance */
const READ_STANDING = 300;
const FOOT_UP = 0.03;
const MOST_FRAMES_UP = 25;
/** how far off its shot the camera may stand a frame after a cut (m): the shot's own drift round him */
const MOST_OFF_SHOT = 0.1;
/** how long a hero is in focus before he's left, as his showcase runs */
const LEFT_WAITS = [70, 110];
/** how far before the dais he stands (m), an ankle's height over the plinth at rest (m), and the most it may rise
 *  past it */
const BEFORE_DAIS = 3;
const ANKLE_REST = 0.12;
const MOST_RISE = 0.1;
/** how far the canary lifts a foot (m) */
const CANARY_LIFT = 0.3;

const _ankle = new THREE.Vector3();

/** The highest either ankle stands over the plinth under him, past its height at rest (m). */
function riseOfAnkles(hero: Player): number {
  const joints = hero.model.joints;
  if (!joints) throw new Error('lab: village: a standing hero has no joints');
  const floor = groundHeight(hero.pos.x, hero.pos.z);
  const left = joints.ankleL.getWorldPosition(_ankle).y;
  const right = joints.ankleR.getWorldPosition(_ankle).y;
  return Math.max(left, right) - floor - ANKLE_REST;
}

/** The heroes stand on the dais as he comes up the stair with the door in view, and not with it behind him (from play,
 *  "on approach heroes are not there, they should be"). `canary` reads the look away as the look at the door. */
export async function heroesSeenOnApproach(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const x = TERRACE.x;
  await viewBy(lab, 'third');
  const looking = async (z: number, facing: number, at = x): Promise<number> => {
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(at, groundHeight(at, z), z), facing);
    faceCamera(facing);
    await lab.until(() => isWarm('heroes'), WARM_FRAMES, 'village: the heroes warming as he nears them');
    await lab.step(SETTLE);
    return heroesStanding().length;
  };
  // (held still: no object of theirs has its matrix made each frame)
  const still = (): boolean => heroesStanding().every((hero) => !hero.obj.matrixAutoUpdate);
  const away = await looking(TERRACE.stairFoot + SQUARE_OUT, 0);
  const atDoor = canary ? away : await looking(TERRACE.stairFoot - STAIR_UP, Math.PI);
  const stillAtDoor = atDoor > 0 && still();
  // (and from across the square, the door small in the view: from play, "why heroes disappear at this distance, then
  // appear when I step in, should always be there")
  const [farX, farZ] = FROM_FOUNTAIN;
  const fromAfar = canary ? away : await looking(farZ, Math.PI, farX);
  const stillAfar = fromAfar > 0 && still();
  const off = Math.hypot(farX - x, farZ - HALL.door).toFixed(0);
  await viewBy(lab, 'top');
  const line = `${atDoor} heroes stand on the dais looking at the door from the stair, ${fromAfar} from ${off} m off `
    + `it (held still there: ${stillAfar}; at the door: ${stillAtDoor}), ${away} looking away from it`;
  const all = CLASS_IDS.length - 1;
  const wrong = atDoor < all || fromAfar < all || away > 0 || !stillAfar || stillAtDoor;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}

/** The hero of class `id` chosen in the hall, `waiting` frames after it opened on the one he is. */
async function choose(lab: Lab, id: string, waiting: number): Promise<void> {
  await openHall(lab);
  await lab.step(waiting);
  for (let press = 0; hallHeroes()[hallFocus()].id !== id; press++) {
    if (press > hallHeroes().length) throw new Error(`lab: village: no ${id} in the hall`);
    await lab.step(1, () => ({ keys: ['arrowright'] }));
    await lab.step(2);
  }
  await lab.step(3, (frame) => ({ keys: frame === 0 ? ['enter'] : [] }));
  if (hallOpen()) throw new Error('lab: village: Enter never chose a hero');
  await lab.step(SETTLE_LOBBY);
}

/** Each hero standing on the dais read every frame for some seconds, him stood before it, into `worst` by class. */
async function readDais(lab: Lab, worst: Map<string, number>, canary: boolean): Promise<void> {
  const x = TERRACE.x;
  const z = HALL.daisZ + BEFORE_DAIS;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  // (read from the first frame he stands: read after a settling, a few seconds' dance as he came went unseen)
  await lab.until(() => heroesStanding().length > 0, WARM_FRAMES, 'village: a hero coming to stand on the dais');
  await lab.step(ROUNDS * FRAMES_A_ROUND, undefined, () => {
    for (const hero of heroesStanding()) {
      const rise = riseOfAnkles(hero) + (canary ? CANARY_LIFT : 0);
      worst.set(hero.cls.id, Math.max(worst.get(hero.cls.id) ?? -Infinity, rise));
    }
  });
  // (back out of the hall: he's sent away to open it from anywhere)
  G.player.place(new THREE.Vector3(0, 0, 0), 0);
  await lab.step(SETTLE_LOBBY);
}

/** The hero in focus left by a press of the arrow `waiting` frames after he came into focus: his ankles' highest past
 *  their rest (m) over the seconds after it, and the frames each way of it, at most `READ_LEFT`. */
async function riseOfOneLeft(lab: Lab, waiting: number, canary: boolean): Promise<LeftRise> {
  await lab.step(waiting);
  const left = hallHeroes()[hallFocus()].player;
  await lab.step(1, () => ({ keys: ['arrowright'] }));
  const rises: number[] = [];
  await lab.step(READ_LEFT, undefined, () => {
    rises.push(riseOfAnkles(left) + (canary ? CANARY_LIFT : 0));
  });
  const most = Math.max(...rises);
  return { most, at: rises.indexOf(most), frames: rises.filter((rise) => rise > FOOT_UP).length };
}

/** What a hero left in the row did. */
interface LeftRise {
  most: number;
  /** the frame of it, after he was left */
  at: number;
  /** the frames a foot was up, of `READ_LEFT` */
  frames: number;
}

/** The warrior left alone in the row, out of focus and long at rest: his ankles' highest past their rest (m), what a
 *  hero does standing, against which what one does as he's left is judged. */
async function riseOfStanding(lab: Lab): Promise<number> {
  const heroes = hallHeroes();
  const warrior = heroes.find((hero) => hero.id === 'warrior');
  if (!warrior) throw new Error('lab: village: no warrior in the hall');
  while (heroes[hallFocus()] === warrior) await lab.step(1, () => ({ keys: ['arrowright'] }));
  await lab.step(READ_LEFT);
  let most = -Infinity;
  await lab.step(READ_STANDING, undefined, () => {
    most = Math.max(most, riseOfAnkles(warrior.player));
  });
  return most;
}

/** The hero left in the hall's row as another is picked stands on both feet at once, at any moment of his showcase. */
export async function heroLeftStands(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  await lab.step(SETTLE);
  await openHall(lab);
  const worst = new Map<string, LeftRise>();
  for (const waiting of LEFT_WAITS) {
    for (let turn = 0; turn < CLASS_IDS.length; turn++) {
      const id = hallHeroes()[hallFocus()].id;
      const rise = await riseOfOneLeft(lab, waiting, canary);
      if (rise.frames > (worst.get(id)?.frames ?? -Infinity)) worst.set(id, rise);
    }
  }
  const line = `each hero left in the row as his showcase ran, the frames a foot was up, of ${READ_LEFT}: `
    + [...worst].map(([who, rise]) => `${who} ${rise.frames} (${(rise.most * 100).toFixed(0)} cm at frame ${rise.at})`)
      .join(', ')
    + ` (at most ${MOST_FRAMES_UP})`;
  const standing = await riseOfStanding(lab);
  // (left open, V did nothing in every check after it: `lab village` whole stopped at the next change of view)
  await leaveHall(lab);
  const lifted = [...worst.values()].some((rise) => rise.frames > MOST_FRAMES_UP);
  const standingCm = (standing * 100).toFixed(0);
  const atRest = `the warrior long at rest in the row, an ankle's highest past its rest: ${standingCm} cm`;
  const lines = [line, atRest];
  if (canary) return { lines, problems: [], caught: lifted, moments: [] };
  return { lines, problems: lifted ? [line] : [], caught: null, moments: [] };
}

/** The hall cancelled from its dais, up on the terrace: he's on the floor he stood on from the first frame back (from
 *  play, "when hero is not picked/cancelled, he rises from ground"). `canary` drops him as the hall closes. */
export async function cancelledOnHisFloor(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  await lab.step(SETTLE);
  const stand = villageObject('hall')?.stand;
  if (!stand) throw new Error('lab: village: no hall of heroes to stand at');
  const [x, z] = stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  await lab.step(SETTLE);
  const floor = G.player.obj.position.y;
  await openHall(lab);
  await lab.step(SETTLE);
  await leaveHall(lab);
  if (canary) G.player.obj.position.y = floor - CANARY_DROP;
  let most = 0;
  await lab.step(READ_BACK, undefined, () => {
    most = Math.max(most, Math.abs(G.player.obj.position.y - floor));
  });
  const off = (most * 100).toFixed(0);
  const line = `the hall cancelled on the terrace, ${floor.toFixed(2)} m up: his body at most ${off} cm off that floor `
    + `over the ${READ_BACK} frames back (at most ${MOST_OFF_FLOOR * 100} cm)`;
  const wrong = most > MOST_OFF_FLOOR;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}

/** The hall left without choosing, by its Back (Esc opens the pause menu over it, as main has it since #454's
 *  screen: left by Esc, the hall stayed up and every check after it stood in it). */
async function leaveHall(lab: Lab): Promise<void> {
  const back = document.querySelector<HTMLElement>('#heroes .hs-back');
  if (!back) throw new Error('lab: village: the hall has no Back to leave it by');
  await lab.clickOn(back);
  await lab.step(1);
  if (hallOpen()) throw new Error('lab: village: Back never left the hall');
}

/** the frames a glide to the hero picked is read after (3 s), and the most of its way left by then */
const GLIDE_FRAMES = 180;
const GLIDE_LEFT = 0.5;

/** How far the camera stands from the shot on the hero in focus (m). */
const offShot = (): number => G.camera.position.distanceTo(hallShot().pos);

/** The hall opened and left with the camera there at once, no flight or zoom (from play, "just show heroes
 *  immediately"), and another hero picked with the camera gliding along the row to him (from play, "we lost camera
 *  animation when selecting characters": cut there at once, as it was for a while). `canary` cuts to the hero picked,
 *  which must be found. */
export async function hallShownAtOnce(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  await lab.step(SETTLE);
  // (every page opens with reduced motion, under which the camera always cut: read so, this passed on a flight in)
  await lab.reduceMotion(false);
  await openHall(lab);
  await lab.step(1);
  const opened = offShot();
  if (canary) {
    focusHall(hallFocus() + 1, true);
    await lab.step(1);
  } else {
    await lab.step(1, () => ({ keys: ['arrowright'] }));
    await lab.step(1);
  }
  const picked = offShot();
  await lab.step(GLIDE_FRAMES);
  const landed = offShot();
  await leaveHall(lab);
  await lab.step(1);
  const settled = viewSettled();
  await lab.reduceMotion(true);
  const line = `the camera off its shot as the hall opens ${(opened * 100).toFixed(0)} cm, a frame after a hero is `
    + `picked ${(picked * 100).toFixed(0)} cm (gliding to him), ${(landed * 100).toFixed(0)} cm `
    + `${GLIDE_FRAMES} frames on; the view ${settled ? 'settled' : 'still gliding'} as it's left`;
  // (the glide eases in on him, its last of the way slow, and his showcase moves the shot: well on its way by then)
  const gliding = picked > MOST_OFF_SHOT && landed < picked * GLIDE_LEFT;
  const wrong = opened > MOST_OFF_SHOT || !gliding || !settled;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}

/** The heroes on the dais keep both feet on their plinths after another was chosen, at any moment of a showcase. */
export async function heroesStandOnBothFeet(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  await lab.step(SETTLE);
  const worst = new Map<string, number>();
  for (const [first, then] of CHOICES) {
    for (const waiting of WAITS) {
      await choose(lab, first, WAIT_FIRST);
      await choose(lab, then, waiting);
      await readDais(lab, worst, canary);
    }
  }
  const line = 'each hero left as his showcase ran, on the dais, an ankle\'s highest past its rest: '
    + [...worst].map(([who, rise]) => `${who} ${(rise * 100).toFixed(0)} cm`).join(', ')
    + ` (at most ${MOST_RISE * 100} cm)`;
  const lifted = [...worst.values()].some((rise) => rise > MOST_RISE);
  if (canary) return { lines: [line], problems: [], caught: lifted, moments: [] };
  return { lines: [line], problems: lifted ? [line] : [], caught: null, moments: [] };
}
