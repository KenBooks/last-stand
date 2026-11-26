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
import { BACK, BAR, BAR_STOOL_X, BAR_STOOLS, TUB } from '../../../src/data/tavern';
import { KEEPER_TAKE, KEEPER_WAYS5 } from '../../../src/world/tavernKeeper';
import { drinkChoice } from '../../../src/game/drinkChoice';
import { tavernLink } from '../../../src/net/tavernLink';
import { stand, viewAs } from './houses';
import { lookAlong } from './light';

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
const WAIT = 3000;
/** the hero's places: by the door while he works, at the bar to be served */
const BY_DOOR: [number, number] = [0.3, 2.9];

/** his turn a frame (rad), read off his root as the brain turns it */
let yawWas = 0;
let turnRate = 0;
const turning = (tv: TavernKeeper): boolean => tv.keeper() !== undefined && Math.abs(turnRate) > 0.7;

/** The keeper's looks, each from its angles: the moments pictured, and what couldn't be taken. */
export async function keeperLooks(lab: Lab, tv: TavernKeeper, keeper: Keeper, only5 = false, before = false): Promise<{ moments: Pictured[]; problems: string[] }> {
  const moments: Pictured[] = [], problems: string[] = [];
  await stand(lab, BY_DOOR, Math.PI / 2);
  if (only5) {
    // (round 5's moments alone, as the player sees them; `before`, as they were: the canary's switches put back)
    setBefore(before);
    try {
      for (const seen of SEEN5) await asSeen(lab, tv, keeper, seen, moments, problems);
      moments.push(...await heroMoments(lab, tv, problems, before));
    } finally {
      setBefore(false);
    }
    return { moments, problems };
  }
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
  // (before he's serving: while a mug waits for the hero he attends him, and takes no task)
  for (const seen of SEEN) await asSeen(lab, tv, keeper, seen, moments, problems);
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

/** A moment of his day as the player sees it, the whole screen in the game's own views (from above, over the
 *  shoulder): when it comes (the task set, the step he must be on and how many frames into it, a mug left dirty for
 *  him first), and where the hero stands to see it (by the keeper, `from` him in his own facing's frame, or at a place
 *  of the room). */
interface Seen {
  label: string;
  note: string;
  task?: string;
  step: string;
  after: number;
  dirty?: boolean;
  /** besides its step, what the moment must show (the broom in his hand...) */
  when?: (tv: TavernKeeper, keeper: Keeper) => boolean;
  /** a mug left dirty for him at this place of a table's top (room m: x, z, the top's height) */
  mugAt?: () => [number, number, number];
  /** the hero at the bar before the tap, as he comes to be served, the moment taken from there */
  atBar?: boolean;
  /** a close picture of him besides, in the room's light, framed on his chest from his front and sides, the hero hidden */
  closeOn?: boolean;
  /** the hero's place off the keeper (m: across his right, ahead of him), facing him */
  from?: [number, number];
  /** the hero's place in the room (its own x, z) and his facing */
  at?: () => [number, number, number];
  /** a close picture besides, framed on this point and from this far, the hero hidden */
  close?: () => { at: THREE.Vector3; distance: number };
}

/** the moments seen as the player sees them */
const SEEN: readonly Seen[] = [
  // (the elbow's patch after its fix: Kenneth's round 4, note 5, "hole at the elbow")
  {
    label: '18-elbow-as-seen', note: 'his elbow bent as he wipes the small table, as the player sees it (round 4, note 5)',
    task: 'smallTable', step: 'wipe table', after: 40, from: [0.9, -0.9],
  },
  // (the tub's water in the bar's light: round 4, note 13, read as a dark disc after it)
  {
    label: '19-tub-as-seen', note: 'the tub as he washes a mug in it, from the bar\'s front: its water seen (round 4, note 13)',
    step: 'wash', after: 30, dirty: true, at: () => [BAR.x - BAR.half - 0.45, TUB.z, Math.PI / 2],
    close: () => ({ at: tubAt(), distance: 1.1 }),
  },
];

/** `seen` waited for and taken from above and over the shoulder, the hero stood where the player would see it from. */
// (each view switched first and the moment waited for in it: switched after, the view's settling took the second
// that the moment lasted, and he was pictured walking away from the table)
async function asSeen(lab: Lab, tv: TavernKeeper, keeper: Keeper, seen: Seen, moments: Pictured[], problems: string[]) {
  for (const view of ['top', 'third'] as const) {
    // (by the door while the moment comes: stood by him, he turns to attend the hero and takes no task; at the bar
    // for his waiting there)
    if (seen.atBar) standAtBar();
    else await stand(lab, BY_DOOR, Math.PI / 2);
    await viewAs(lab, view);
    if (!await momentOf(lab, tv, seen)) {
      problems.push(`looks: ${seen.label} never came ${view === 'top' ? 'from above' : 'over the shoulder'} `
        + `(doing ${tv.doing().job}: ${tv.doing().step})`);
      continue;
    }
    // (over the shoulder the camera looks where the mouse turned it, not where he faces: turned his way)
    const facing = seen.atBar && !seen.at ? standAtBar() : standToSee(keeper, seen);
    if (view === 'third') await lookAlong(lab, facing);
    await lab.step(SEEN_SETTLE);
    moments.push(await lab.screen(`${seen.label}-${view}`, [`${seen.note}: ${view === 'top' ? 'from above' : 'over the shoulder'}`]));
    if (seen.close && view === 'top') moments.push(closeUp(lab, keeper, seen));
    if (seen.closeOn && view === 'top') {
      moments.push(shoot(lab, keeper, { label: `${seen.label}-close`, note: `${seen.note}: close`, step: seen.step, after: 0,
        views: ['front', 'left', 'right'], y: 0, distance: 2.3, joint: 'chest' }));
    }
  }
  await viewAs(lab, 'top');
}

/** `seen`'s close picture, the keeper and the hero hidden: leant over the tub, his body hid it from every side. */
function closeUp(lab: Lab, keeper: Keeper, seen: Seen): Pictured {
  keeper.root.visible = false;
  lab.model.root.visible = false;
  const pictured = lab.picture(`${seen.label}-close`, ['above', 'right', 'front'],
    [`${seen.note}: close, in the room's light, him and the hero hidden`], seen.close!());
  lab.model.root.visible = true;
  keeper.root.visible = true;
  return pictured;
}

/** `seen`'s moment come: its mug left dirty and its task set, then `after` frames of its step; whether it came. */
async function momentOf(lab: Lab, tv: TavernKeeper, seen: Seen): Promise<boolean> {
  if (seen.dirty) tv.mugs.move(0, { at: 'bar', x: 4.0, z: BAR.from + 0.3 }, { full: 0.03, dirty: true });
  if (seen.mugAt) {
    const [x, z, y] = seen.mugAt();
    const id = tv.mugs.mugs.find((m) => m.place.at === 'shelf')?.id ?? 1;
    tv.mugs.move(id, { at: 'table', x, z, y }, { full: 0.03, dirty: true });
  }
  if (seen.task) tv.setTask(seen.task);
  const keeper = tv.keeper()!;
  let on = 0;
  for (let f = 0; f < WAIT && on < seen.after; f++) {
    await lab.step(1);
    on = (!seen.step || tv.doing().step === seen.step) && (!seen.when || seen.when(tv, keeper)) ? on + 1 : 0;
  }
  return on >= seen.after;
}

/** whether his broom is in his hand (however he holds it: before round 5, the sweep's hold on his way to sweep) */
function broomInHand(_tv: TavernKeeper, keeper: Keeper): boolean {
  const holder = keeper.root.parent!.getObjectByName('broom')?.parent;
  return !!holder && holder.parent !== keeper.root.parent;
}

/** round 5's moments of his, each as the player sees it (from above and over the shoulder) */
const SEEN5: readonly Seen[] = [
  // (the broom last, the carry to his first stroke before the sweep: set after his sweep, a task waited on the broom
  // put back and never came)
  {
    label: '22-rag-laid', note: 'his rag being laid on the small table by his hand (round 5, note 3)',
    task: 'smallTable', step: 'wipe table', after: 45, from: [1.0, -1.0], closeOn: true,
  },
  {
    label: '23-cask', note: 'wiping the cask, his free hand at his side (round 5, note 4)',
    task: 'cask', step: 'check cask', after: 160, at: () => [BAR.x - BAR.half - 0.6, -0.3, Math.PI / 2], closeOn: true,
  },
  {
    label: '24-at-the-bar', note: 'waiting at the bar for the hero, from the hero\'s side of it: his rag (round 5, note 5)',
    step: 'attend', after: 60, atBar: true, closeOn: true,
  },
  {
    label: '25-collect-long-table', note: 'collecting a mug from the long table\'s side (round 5, note 6)',
    step: 'collect', after: 15, from: [1.3, -1.1], mugAt: () => [-3.8 + 0.35, 1.4, 0.76], closeOn: true,
  },
  {
    label: '26-tub', note: 'the tub\'s water from the bar\'s front (round 5, note 7)', step: '', after: 30,
    at: () => [BAR.x - BAR.half - 0.45, TUB.z, Math.PI / 2], atBar: true,
  },
  {
    label: '21-broom-carried', note: 'the broom carried from its corner to his first stroke (round 5, note 2)',
    task: 'sweep', step: 'walk', after: 25, from: [1.3, 1.4], when: broomInHand, closeOn: true,
  },
  {
    label: '20-sweep', note: 'sweeping (round 5, note 1)', task: 'sweep', step: 'sweep', after: 90, from: [1.4, 1.2], closeOn: true,
  },
];

/** The canary's switches set as they were before round 5 (`before`), or as they are. */
function setBefore(before: boolean): void {
  KEEPER_WAYS5.sweepTogether = before;
  KEEPER_WAYS5.carrySweeping = before;
  KEEPER_WAYS5.padEarly = before;
  KEEPER_WAYS5.caskSteady = before;
  KEEPER_WAYS5.attendBunched = before;
  KEEPER_WAYS5.intoTable = before;
  KEEPER_WAYS5.darkWater = before;
  KEEPER_TAKE.bothE = before;
  KEEPER_TAKE.toCounter = before;
}

/** The hero's own moments of round 5 as the player sees them from above: his mug put down by the small table (note 8),
 *  and with his mug in hand the pointer on a bar stool, E on offer for the stool alone (note 9). */
async function heroMoments(lab: Lab, tv: TavernKeeper, problems: string[], before: boolean): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const room = G.arena.rooms!.tavern.group, myId = tavernLink.self() || 'me';
  await viewAs(lab, 'top');
  const give = async () => {
    const id = tv.mugs.mugs.find((m) => m.place.at === 'shelf')?.id;
    if (id === undefined) return -1;
    tv.mugs.move(id, { at: 'hero', who: myId }, { full: 1, dirty: false, held: true });
    for (let f = 0; f < 60 && !drinkChoice.shown; f++) await lab.step(1);
    return id;
  };
  // (by the small table: F, the mug on its way down, then down)
  G.player.walkTo = null;
  G.player.place(room.localToWorld(new THREE.Vector3(0.3 + 0.95, 0, -0.2 + 0.2)), -Math.PI / 2);
  await lab.step(20);
  const id = await give();
  if (id < 0) problems.push('looks: no mug to put down');
  else {
    const table = room.localToWorld(new THREE.Vector3(0.3 + 0.35, 0.76, -0.2 + 0.1));
    await lab.step(1, () => ({ keys: ['f'] }));
    await lab.step(6);
    moments.push(lab.picture('27-put-down', ['above', 'left'], [`his mug put down by the small table, on its way from his hand (round 5, note 8)${before ? ', as it was' : ''}`], { at: table, distance: 2.4 }));
    await lab.step(40);
    moments.push(lab.picture('27-put-down-after', ['above', 'left'], [`and where it went${before ? ', as it was' : ''}`], { at: table, distance: 2.4 }));
    tv.mugs.move(id, { at: 'shelf', slot: id }, { full: 0, dirty: false, held: false });
  }
  // (a mug in hand, the pointer on a bar stool)
  G.player.place(room.localToWorld(new THREE.Vector3(BAR_STOOL_X - 0.9, 0, BAR_STOOLS[3] + 0.6)), Math.PI / 2);
  await lab.step(20);
  const held = await give();
  const stool = room.localToWorld(new THREE.Vector3(BAR_STOOL_X, 0.72, BAR_STOOLS[3]));
  for (let f = 0; f < 40; f++) await lab.step(1, () => ({ aim: stool }));
  moments.push(await lab.screen('28-e-on-a-stool', [`a mug in hand, the pointer on a bar stool: one E (round 5, note 9)${before ? ', as it was' : ''}`]));
  if (held >= 0) {
    G.player.standDown();
    await lab.step(10);
    tv.mugs.move(held, { at: 'shelf', slot: held }, { full: 0, dirty: false, held: false });
  }
  return moments;
}

/** the tub's middle in the world, on its water */
function tubAt(): THREE.Vector3 {
  const room = G.arena.rooms!.tavern;
  return room.group.localToWorld(new THREE.Vector3((BACK.front + BACK.wall) / 2, BACK.top + TUB.water, TUB.z));
}

/** The hero stood before the tap at the bar, facing the keeper's stand there: his facing. */
function standAtBar(): number {
  const him = villageObject('keeper')!;
  const facing = Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(him.stand[0], 0, him.stand[1]), facing);
  return facing;
}

/** the frames the camera is given to come round before a moment is taken */
const SEEN_SETTLE = 12;

/** The hero stood for `seen`, off the keeper and facing him or at its place of the room: his facing. */
function standToSee(keeper: Keeper, seen: Seen): number {
  G.player.walkTo = null;
  if (seen.at) {
    const [x, z, facing] = seen.at();
    const room = G.arena.rooms!.tavern;
    G.player.place(room.group.localToWorld(new THREE.Vector3(x, 0, z)), facing);
    return facing;
  }
  const [across, ahead] = seen.from!;
  const him = keeper.root.getWorldPosition(new THREE.Vector3());
  const yaw = keeper.root.rotation.y;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const at = him.clone().addScaledVector(right, across).addScaledVector(forward, ahead);
  const facing = Math.atan2(him.x - at.x, him.z - at.z);
  G.player.place(at, facing);
  return facing;
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
