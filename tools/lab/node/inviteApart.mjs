// `lab invite`'s part on a picture from a camera of the agent's own (src/dev/agentSteps.ts, `frameApart` in
// src/core/renderer.ts): it is drawn beside the player's frame, which must not change. Flown there by the free
// camera for three frames, as it first was, the player saw each picture as a flicker (#529, from play: "I also saw
// flicker in the scene... think we have a bug").
//   the picture asked for from a camera far from the player's; the game frozen, the frame before it and the frame
//   it is drawn in read as the player is shown them: the same, while the picture itself is of somewhere else.
// The canary leaves the game's camera where the agent's stood as the picture is handed over, as a draw that put
// nothing back would: the player's frame must be seen to change.
import { callPage } from './inviteCheck.mjs';

/** a picture's side (px) */
const SIDE = 480;
/** where the camera stands from the hero (m): behind and above, looking back at him */
const FROM = [-9, 7, -9];
/** the most of the player's frame that may change between two frames of a frozen game (what moves by the browser's
 *  own clock), and the least the canary's must */
const SAME_MOST = 0.01;
/** how long the picture's step is given to reach the game (ms), and how often that's read */
const ASKED_MS = 10_000;
const READ_MS = 50;

/** Waits until the game holds a picture asked for from a camera of the agent's own: no frame is run meanwhile. */
async function askedFor(game) {
  const start = Date.now();
  while (!await callPage(game.page, 'invite', 'inviteApartAsked')) {
    if (Date.now() - start > ASKED_MS) throw new Error('invite: the picture from a placed camera never reached the game');
    await new Promise((resolve) => setTimeout(resolve, READ_MS));
  }
}

/** A picture from a camera of the agent's own, and the player's frame beside it, which must be as it was. */
export async function picturedBesideTheFrame(game, found, link) {
  const view = await game.whileStepping(link.step('picture', { side: SIDE, format: 'png' }), true);
  const hero = (await game.whileStepping(link.step('look'))).hero.at;
  const camera = { at: hero.map((n, i) => n + FROM[i]), to: [hero[0], hero[1] + 1, hero[2]] };
  const asked = link.step('picture', { side: SIDE, camera, format: 'png' });
  asked.catch(() => {});
  await askedFor(game);
  const beside = await callPage(game.page, 'invite', 'inviteFrameBeside', { leak: found.canary });
  const placed = await game.whileStepping(asked, true);
  const apart = await callPage(game.page, 'invite', 'invitePictureDiff', { type: view.type, a: view.data, b: placed.data });
  found.say(`a picture from a camera of its own: ${(beside.changed * 100).toFixed(2)}% of the player's frame changed `
    + `as it was drawn (the picture's middle is ${(apart * 100).toFixed(0)}% another than his view's)`);
  found.expect(beside.taken && placed.view === 'placed', 'the picture from a placed camera wasn\'t drawn in the frame read');
  found.expect(apart > 0.2, `the placed camera's picture is the player's view (${(apart * 100).toFixed(0)}% of its middle differs)`);
  found.expect(beside.changed <= SAME_MOST,
    `the player's frame changed as an agent's picture was drawn: ${(beside.changed * 100).toFixed(1)}% of it`, 'leak');
}
