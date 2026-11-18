// The tavern's keeper and his ale (tools/lab `tavern`; src/world/tavern.ts, src/entities/models/keeper.ts,
// src/combat/skills/ale.ts, src/entities/models/flask.ts): into the Ember & Oak by its door, the keeper seated behind
// his bar and pictured close at points of his loop; talked to by E, the card within the window and a free beer its
// first reply; asked, he pours a mug under the cask's tap and slides it across, and the hero takes it up as it comes to
// rest and drinks it for its 5 s, standing still through it whatever is pressed (W held), the mug in his hand in the
// flask's place, its rim at his lips through each swallow, the mug gone from the bar once taken; after it he walks
// again. No program may compile from the room's coming in to the drink's end. Pictures: the keeper close, at the bar,
// the talk card, the pour and the slide, and the drink a frame at each of its beats.
// `--canary`: the ale made a cast he may walk through, which must be caught.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { enterRoom } from '../../../src/game/rooms';
import { ALE, ALE_BEATS, KEEPER_SPOT, SERVE } from '../../../src/data/tavern';
import { toVillage } from './village';
import { stand, useByE, viewAs } from './houses';

/** `--canary`: the ale made a cast he may walk through. */
export interface TavernOptions {
  canary: boolean;
}

/** the frames a stand or a press settles for */
const SETTLE = 12;
/** the most frames from the beer asked for to the hero drinking (his serving's time, and a second) */
const SERVED_IN = Math.ceil((SERVE.long + 1) * 60);
/** the drink's beats pictured (shares of its time), and the frames W is held over its start */
const PICTURED = [0.06, 0.15, 0.3, 0.46, 0.62, 0.74, 0.86, 0.95];
const HELD_W = 40;
/** how far the rim may stand from his lips at a swallow's middle (m: its middle 3 cm before them, its edge on them), and
 *  how far he may move while drinking */
const RIM_NEAR = 0.07, STILL_WITHIN = 0.02;
/** the keeper's chest, his close-up framed on it (m), and how far off it's taken */
const KEEPER_CHEST = 1.45, KEEPER_FROM = 2.3, KEEPER_FACE = 1.74;

/** the bar's middle between the hero and the keeper (world), `y` up */
function barMiddle(y = 1.3): THREE.Vector3 {
  const room = G.arena.rooms!.tavern;
  room.group.updateMatrixWorld(true);
  return room.group.localToWorld(new THREE.Vector3((G.player.pos.x + KEEPER_SPOT.x) / 2, y, KEEPER_SPOT.z));
}

const programs = (): number => G.renderer.info.programs?.length ?? 0;
const _lips = new THREE.Vector3(), _rim = new THREE.Vector3(), _foot = new THREE.Vector3();

/** How far into his drink the hero is (0..1), or -1 while he isn't drinking the ale. */
function drinkShare(): number {
  const c = G.player.casting;
  return c?.skill.def.ale ? c.t / c.dur : -1;
}

/** The mug in his hand as drawn: shown in the flask's place, its rim from his lips (m) and how far it's tipped up
 *  (degrees, its foot over its rim). */
function mugInHand(): { shown: boolean; flaskHidden: boolean; rimOff: number; tipped: number } {
  const root = G.player.model.root;
  const flask = root.getObjectByName('flask'), mouth = root.getObjectByName('mouth');
  const mug = flask?.getObjectByName('mug'), lip = flask?.getObjectByName('flaskLip');
  if (!flask || !mouth || !mug || !lip) return { shown: false, flaskHidden: false, rimOff: Infinity, tipped: 0 };
  root.updateWorldMatrix(true, true);
  mouth.getWorldPosition(_lips);
  lip.getWorldPosition(_rim);
  flask.getWorldPosition(_foot);
  const parts = (flask.userData.flaskParts as THREE.Object3D[] | undefined) ?? [];
  const tipped = Math.asin(THREE.MathUtils.clamp(_foot.sub(_rim).normalize().y, -1, 1)) * 180 / Math.PI;
  return {
    shown: flask.visible && mug.visible, flaskHidden: parts.every((o) => !o.visible),
    rimOff: _rim.distanceTo(_lips), tipped,
  };
}

/** The keeper close from before him and his sides, at two points of his loop: wiping a mug, polishing the bar. */
async function keeperPictured(lab: Lab, moments: Pictured[]): Promise<void> {
  const room = G.arena.rooms!.tavern, keeper = room.keeper?.();
  if (!keeper) return;
  room.group.updateMatrixWorld(true);
  const at = room.group.localToWorld(new THREE.Vector3(KEEPER_SPOT.x, KEEPER_CHEST, KEEPER_SPOT.z));
  // (the hero out of the way of the views from his side of the bar)
  G.player.obj.visible = false;
  for (const [loopAt, what] of [[6, 'wiping a mug'], [20, 'polishing the bar']] as const) {
    keeper.loopAt = loopAt;
    await lab.step(SETTLE);
    // (the hero faces the bar, so his 'back' view looks at the keeper's front)
    moments.push(lab.picture(`keeper-${loopAt}`, ['back', 'left', 'right'], [`the keeper, ${what}`], { at, distance: KEEPER_FROM }));
  }
  const face = room.group.localToWorld(new THREE.Vector3(KEEPER_SPOT.x, KEEPER_FACE, KEEPER_SPOT.z));
  moments.push(lab.picture('keeper-face', ['back', 'left', 'right'], ['his face close'], { at: face, distance: 0.9 }));
  moments.push(lab.picture('keeper-tap', ['back', 'left'], ['the cask and its tap on the bar'], { at: barMiddle(1.2), distance: 0.9 }));
  G.player.obj.visible = true;
  // (the hero and the keeper either side of the bar, from its side)
  moments.push(lab.picture('keeper-bar', ['left', 'right'], ['at the bar'], { at: barMiddle(), distance: 3 }));
}

export async function tavern(lab: Lab, options: TavernOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  await viewAs(lab, 'third');
  enterRoom('tavern');
  await lab.until(() => G.arena.room === 'tavern', 600, 'the tavern never opened');
  const room = G.arena.rooms!.tavern;
  const keeper = room.keeper?.();
  if (!keeper) return { text: 'no keeper', problems: ['the tavern has no keeper seated'], moments };
  const him = villageObject('keeper')!;
  const facing = Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]);
  await stand(lab, him.stand, facing);
  const before = programs();
  await keeperPictured(lab, moments);

  // --- talked to by E: the card up within the window, a free beer its first reply ---
  await useByE(lab, him, problems);
  await lab.step(SETTLE);
  const card = document.getElementById('talk')!;
  if (card.classList.contains('hidden')) problems.push('E at the keeper opened no talk');
  const box = card.querySelector('.tk-box')!.getBoundingClientRect();
  if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) problems.push('the talk card leaves the window');
  const first = card.querySelector('.tk-reply')?.textContent ?? '';
  lines.push(`talk: "${card.querySelector('.tk-name')?.textContent}", first reply "${first}"`);
  if (!/beer/i.test(first)) problems.push(`the keeper's first reply offers no beer: "${first}"`);
  moments.push(await lab.screen('tavern-talk'));

  // --- the beer asked for: he pours and slides it across, the hero takes it up ---
  const still = ALE.still;
  if (options.canary) ALE.still = false;
  try {
    await lab.step(1, () => ({ keys: ['1'] }));
    await lab.step(2);
    if (!card.classList.contains('hidden')) problems.push('the beer asked for left the talk open');
    if (keeper.serving < 0) problems.push('the beer asked for, the keeper pours none');
    let frames = 0, pouredShot = false, slidShot = false;
    while (drinkShare() < 0 && frames < SERVED_IN) {
      await lab.step(1);
      frames++;
      const st = keeper.serving;
      if (!pouredShot && st >= (SERVE.fill[0] + SERVE.fill[1]) / 2) {
        pouredShot = true;
        moments.push(lab.picture('tavern-pour', ['back', 'left'], ['he fills the mug under the tap'], { at: barMiddle(1.25), distance: 2.2 }));
      }
      if (!slidShot && room.mugOnBar?.()) {
        slidShot = true;
        moments.push(lab.picture('tavern-slide', ['left'], ['the mug slid across the bar'], { at: barMiddle(), distance: 2.6 }));
      }
    }
    lines.push(`served: the hero drinking ${(frames / 60).toFixed(2)} s after he asked`);
    if (drinkShare() < 0) {
      problems.push(`the hero never drank: ${frames} frames after the beer was asked for`);
      return { text: lines.join('\n'), problems, moments };
    }

    // --- the drink: still whatever's pressed, the mug at his lips through each swallow ---
    const from = G.player.pos.clone(), start = frames;
    let moved = 0, worstRim = 0, notShown = 0, onBarAfter = 0, dur = 0;
    const shots = [...PICTURED], gulps: number[] = [...ALE_BEATS.gulps];
    for (let f = 0; drinkShare() >= 0 && f < 600; f++) {
      await lab.step(1, () => (f < HELD_W ? { keys: ['w'] } : {}));
      dur++;
      const k = drinkShare();
      if (k < 0) break;
      moved = Math.max(moved, G.player.pos.distanceTo(from));
      const mug = mugInHand();
      if (k > 0.12 && k < 0.92 && !(mug.shown && mug.flaskHidden)) notShown++;
      if (k > 0.12 && room.mugOnBar?.()) onBarAfter++;
      if (gulps.length && k >= gulps[0]) {
        gulps.shift();
        worstRim = Math.max(worstRim, mug.rimOff);
        lines.push(`swallow at ${(k * 100).toFixed(0)}%: the rim ${(mug.rimOff * 100).toFixed(1)} cm from the lips, tipped ${mug.tipped.toFixed(0)}°`);
      }
      if (shots.length && k >= shots[0]) {
        const share = shots.shift()!;
        moments.push(lab.picture(`drink-${Math.round(share * 100)}`, ['left', 'front'], [`${Math.round(share * 100)}% of the drink`], { focus: 'head', distance: 2.1 }));
      }
    }
    lines.push(`drink: ${(dur / 60).toFixed(2)} s (from frame ${start}), moved ${(moved * 100).toFixed(1)} cm with W held, the mug not shown in hand ${notShown} frames`);
    if (Math.abs(dur / 60 - ALE.castTime) > 0.1) problems.push(`the drink took ${(dur / 60).toFixed(2)} s, not ${ALE.castTime}`);
    if (moved > STILL_WITHIN) problems.push(`he moved ${(moved * 100).toFixed(1)} cm while drinking, W held`);
    if (worstRim > RIM_NEAR) problems.push(`the rim stood ${(worstRim * 100).toFixed(1)} cm from his lips at a swallow`);
    if (notShown) problems.push(`the mug wasn't in his hand for ${notShown} frames of the drink`);
    if (onBarAfter) problems.push(`the mug stood on the bar ${onBarAfter} frames after his hand took it`);
    // (after it, he walks again)
    const after = G.player.pos.clone();
    await lab.step(20, () => ({ keys: ['s'] }));
    const walked = G.player.pos.distanceTo(after);
    lines.push(`after: walked ${(walked * 100).toFixed(0)} cm in 20 frames`);
    if (walked < 0.1) problems.push('after the drink he doesn\'t walk');
  } finally {
    ALE.still = still;
  }
  const compiled = programs() - before;
  lines.push(`programs compiled from the room to the drink's end: ${compiled}`);
  if (compiled) problems.push(`${compiled} programs compiled meanwhile`);
  if (options.canary) {
    const caught = problems.some((p) => p.includes('while drinking'));
    return { text: lines.join('\n'), problems: caught ? [] : ['canary: walking while drinking went unseen'], moments };
  }
  return { text: lines.join('\n'), problems, moments };
}
