// `lab tavern --looks`: the tavern's keeper pictured from the angles Kenneth's screenshots of round 3 took him from
// (#704: his boots from above, his walk from the side, his legs from behind as he turns, his apron bent over a table,
// his broom, the hearth, the counter wiped, the ale poured, his shoulders' tops, his neck from behind as he looks down),
// each at the moment of the task it shows, the hero hidden while it's taken. Pictures alone, for a look before and
// after a change (the measure in full is `page/tavern.ts`).
import * as THREE from 'three';
import type { Lab, Pictured, ViewName } from './lab';
import { G } from '../../../src/state';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Keeper } from '../../../src/entities/models/keeper';
import { villageObject } from '../../../src/game/village';
import { stand } from './houses';

/** A look: when it's taken (the task set and the step he must be on, how many frames into it, or a test of the frame),
 *  and how (the views by his own facing, the point it's framed on over his feet, and how far off). */
interface Look {
  label: string;
  note: string;
  task?: string;
  step: string;
  after: number;
  when?: (tv: TavernKeeper, keeper: Keeper) => boolean;
  views: ViewName[];
  y: number;
  distance: number;
  /** framed on a joint of his instead of a height over his feet */
  joint?: keyof Keeper['joints'];
}

/** the looks, in the order his day comes to them (the hero by the door until the pour, then at the bar) */
const LOOKS: readonly Look[] = [
  { label: '01-boots', note: 'his boots and trouser hems (89)', task: 'sweep', step: 'sweep', after: 70, views: ['front', 'left'], y: 0.15, distance: 1.0 },
  { label: '02-neck-behind', note: 'his neck from behind, looking down (101)', task: 'sweep', step: 'sweep', after: 20, views: ['back', 'left'], y: 0, distance: 0.8, joint: 'neck' },
  { label: '03-wipe-counter', note: 'wiping the counter (98, 12)', task: 'wipeBar', step: 'wipe bar', after: 150, views: ['front', 'left'], y: 1.15, distance: 1.4 },
  { label: '04-sweep', note: 'sweeping (91, 8)', task: 'sweep', step: 'sweep', after: 40, views: ['front', 'left'], y: 0.6, distance: 1.9 },
  {
    label: '05-walk-side', note: 'walking, from the side (95, 96, 1)', step: 'walk', after: 25, views: ['left', 'front'], y: 0.55, distance: 2.0,
    when: (tv) => tv.body().speed > 0.6,
  },
  { label: '06-hearth', note: 'at the hearth with the poker (97, 10)', task: 'stoke', step: 'stoke fire', after: 60, views: ['left', 'right'], y: 0.85, distance: 2.8 },
  { label: '07-apron-bent', note: 'bent over a table wiping (90, 6)', task: 'smallTable', step: 'wipe table', after: 70, views: ['left', 'right'], y: 0.7, distance: 1.6 },
  {
    label: '08-turn-behind', note: 'turning, from behind (92, 4)', step: '', after: 0, views: ['back', 'left'], y: 0.45, distance: 1.6,
    when: (tv) => turning(tv) && tv.body().speed < 0.35,
  },
  { label: '12-fetch-broom', note: 'taking up the broom (7)', task: 'sweep', step: 'fetch broom', after: 40, views: ['left', 'front', 'right'], y: 0.6, distance: 2.0 },
  { label: '10-stripes', note: 'his shirt stripes, front, back and sides (102, 22)', task: 'sweep', step: 'sweep', after: 50, views: ['back', 'front', 'left', 'right'], y: 0, distance: 1.1, joint: 'chest' },
  { label: '10-stripes-hanging', note: 'his shirt stripes with his arms hanging as he walks, front, back and sides (22)', task: 'smallTable', step: 'walk', after: 40, views: ['back', 'front', 'left', 'right'], y: 0, distance: 1.1, joint: 'chest' },
  { label: '13-elbow', note: 'his elbow bent, from behind and beside: no hole at the cuff (118, 119)', task: 'smallTable', step: 'wipe table', after: 60, views: ['back', 'left', 'right'], y: 0, distance: 0.8, joint: 'chest' },
  { label: '14-cask', note: 'wiping the cask with the rag, palm down, his other hand steadying it (120)', task: 'cask', step: 'check cask', after: 170, views: ['front', 'left', 'above'], y: 0, distance: 2.2, joint: 'chest' },
  { label: '15-long-table', note: 'wiping the long table from its end, the rag on its top (116, 117)', task: 'longTable', step: 'wipe table', after: 80, views: ['left', 'above', 'front'], y: 0, distance: 2.6, joint: 'chest' },
  { label: '16-broom-carried', note: 'the broom taken up and carried at his side (115)', task: 'sweep', step: 'fetch broom', after: 45, views: ['front', 'left', 'right'], y: 0, distance: 3.0, joint: 'chest' },
  { label: '17-broom-swept', note: 'sweeping, the bristles just touching the floor (round 4, note 2)', task: 'sweep', step: 'sweep', after: 30, views: ['left', 'front'], y: 0, distance: 3.0, joint: 'chest' },
  { label: '11-stripes-bent', note: 'his shirt stripes bent over a table, from behind (102, 22)', task: 'smallTable', step: 'wipe table', after: 70, views: ['back', 'left'], y: 0, distance: 1.1, joint: 'chest' },
];

/** how long a look waits for its moment (frames) */
const WAIT = 1800;
/** the hero's places: by the door while he works, at the bar to be served */
const BY_DOOR: [number, number] = [0.3, 2.9];

/** his turn a frame (rad), read off his root as the brain turns it */
let yawWas = 0;
let turnRate = 0;
const turning = (tv: TavernKeeper): boolean => tv.keeper() !== undefined && Math.abs(turnRate) > 0.7;

/** The keeper's looks, each from its angles: the moments pictured, and what couldn't be taken. */
export async function keeperLooks(lab: Lab, tv: TavernKeeper, keeper: Keeper): Promise<{ moments: Pictured[]; problems: string[] }> {
  const moments: Pictured[] = [], problems: string[] = [];
  await stand(lab, BY_DOOR, Math.PI / 2);
  for (const look of LOOKS) {
    if (look.task) tv.setTask(look.task);
    let on = 0, took = false;
    for (let f = 0; f < WAIT && !took; f++) {
      await lab.step(1);
      const yaw = keeper.root.rotation.y;
      turnRate = Math.atan2(Math.sin(yaw - yawWas), Math.cos(yaw - yawWas)) * 60;
      yawWas = yaw;
      const step = tv.doing().step;
      on = !look.step || step === look.step ? on + 1 : 0;
      if (on < look.after || (look.when && !look.when(tv, keeper))) continue;
      moments.push(shoot(lab, keeper, look));
      took = true;
    }
    if (!took) problems.push(`looks: ${look.label} never came (doing ${tv.doing().job}: ${tv.doing().step})`);
  }
  // --- at the bar: the ale poured, his shoulders' tops from above (99, 100, 20) ---
  const him = villageObject('keeper')!;
  await stand(lab, him.stand, Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]));
  tv.serve(G.player);
  const pour: Look = { label: '09-pour', note: 'pouring the ale (100)', step: 'pour', after: 40, views: ['front', 'above'], y: 0, distance: 1.1, joint: 'chest' };
  let on = 0, took = false;
  for (let f = 0; f < WAIT && !took; f++) {
    await lab.step(1);
    on = tv.doing().step === pour.step ? on + 1 : 0;
    if (on >= pour.after) { moments.push(shoot(lab, keeper, pour)); took = true; }
  }
  if (!took) problems.push(`looks: ${pour.label} never came (doing ${tv.doing().job}: ${tv.doing().step})`);
  return { moments, problems };
}

/** `look` taken now: framed on his body, from his own facing's sides, the hero hidden and turned back after. */
function shoot(lab: Lab, keeper: Keeper, look: Look): Pictured {
  const at = look.joint
    ? keeper.joints[look.joint as 'neck'].getWorldPosition(new THREE.Vector3())
    : keeper.root.getWorldPosition(new THREE.Vector3()).setY(look.y);
  const facing = G.player.facing;
  G.player.facing = keeper.root.rotation.y;
  lab.model.root.visible = false;
  const pictured = lab.picture(look.label, look.views, [look.note], { at, distance: look.distance });
  lab.model.root.visible = true;
  G.player.facing = facing;
  return pictured;
}
