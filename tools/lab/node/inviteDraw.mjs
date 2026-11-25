// `lab invite`'s part on what the owner draws for the agent (src/dev/agentDraw.ts), between what the agent makes and
// its kick (inviteCheck.mjs):
//   the badge's Draw turns drawing on: the canvas takes the pointer, the button says so;
//   a stroke drawn by the mouse, held and moved across the screen: `look` lists it, its box where it was drawn and
//     what of the scene is under it;
//   a picture of his view has the stroke on it (its red along the line drawn), and a picture asked for plain hasn't;
//   Clear wipes it: `look` lists nothing; F6 turns drawing off and on;
//   a stroke left through the kick: drawing ends with the agent, nothing left on screen (inviteCheck.mjs's `kicked`).
// The canary asks for the picture plain: the check must say the drawing isn't on it.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callPage } from './inviteCheck.mjs';

/** a picture's side (px) */
const SIDE = 480;
/** where the stroke runs, as shares of the window across and down */
const FROM = [0.3, 0.35];
const TO = [0.62, 0.6];
/** how far from the line drawn its red is counted in a picture (px of the picture), and the least of it there */
const REACH = 4;
const RED_LEAST = 60;
/** how far a stroke's box in `look` may be from where the mouse drew it (css px) */
const BOX_SLACK = 3;

const page = (game, fn, args) => callPage(game.page, 'inviteDraw', fn, args);

/** A picture's count of the drawing's red along the line drawn. */
async function redOf(game, shot) {
  return page(game, 'redAlong', { type: shot.type, data: shot.data, from: FROM, to: TO, reach: REACH });
}

/** Drawing turned on, a stroke drawn, read by `look` and seen in a picture; cleared; one more left for the kick. */
export async function drawnForTheAgent(game, found, link, dir) {
  await game.press('draw');
  const on = await page(game, 'drawState');
  found.say(`draw: the badge's button reads "${on.button}", the canvas ${on.on ? 'takes the pointer' : 'does NOT take the pointer'}`);
  found.expect(on.on && on.button === 'Drawing', 'the badge\'s Draw didn\'t turn drawing on');

  const [width, height] = on.screen;
  const from = [Math.round(FROM[0] * width), Math.round(FROM[1] * height)];
  const to = [Math.round(TO[0] * width), Math.round(TO[1] * height)];
  await page(game, 'drawStroke', { from, to });
  const seen = await game.whileStepping(link.step('look'));
  const stroke = seen.drawn?.[0];
  found.say(`look: ${seen.drawn?.length ?? 'no'} stroke(s), the first's box ${JSON.stringify(stroke?.box)} of ${stroke?.points} points, `
    + `drawn from ${from} to ${to}; under its end ${stroke?.end ? stroke.end.object : 'nothing'}`);
  found.expect(seen.drawn?.length === 1, `look lists ${seen.drawn?.length} strokes after one was drawn`);
  const wanted = [from[0], from[1], to[0], to[1]];
  const boxed = stroke && stroke.box.every((edge, i) => Math.abs(edge - wanted[i]) <= BOX_SLACK);
  found.expect(Boolean(boxed), `the stroke's box in look is ${JSON.stringify(stroke?.box)}, drawn at ${JSON.stringify(wanted)}`);
  found.expect(Boolean(stroke && 'middle' in stroke && 'end' in stroke), 'look says nothing of what is under the stroke');

  // (the canary: the picture asked for plain, which the check must catch)
  const shown = await game.whileStepping(link.step('picture', { side: SIDE, format: 'png', plain: found.canary }), true);
  const plain = await game.whileStepping(link.step('picture', { side: SIDE, format: 'png', plain: true }), true);
  writeFileSync(join(dir, '3b-drawn.png'), Buffer.from(shown.data, 'base64'));
  const red = { shown: await redOf(game, shown), plain: await redOf(game, plain) };
  found.say(`picture: ${red.shown} of the drawing's red pixels along the stroke (it says ${shown.drawn} drawn), `
    + `${red.plain} asked for plain (it says ${plain.drawn})`);
  found.expect(red.shown >= RED_LEAST && shown.drawn === 1, `the picture of his view has ${red.shown} red pixels along the stroke`, 'plain');
  found.expect(red.plain < RED_LEAST / 4 && plain.drawn === 0, `a picture asked for plain has ${red.plain} red pixels along the stroke`);

  await game.press('clear');
  const cleared = await game.whileStepping(link.step('look'));
  const afterClear = await page(game, 'drawState');
  found.say(`clear: look lists ${cleared.drawn?.length} strokes, Clear ${afterClear.clear ? 'still offered' : 'gone'}, drawing ${afterClear.on ? 'on' : 'off'}`);
  found.expect(cleared.drawn?.length === 0 && !afterClear.clear, 'Clear left a stroke, or its button');

  await page(game, 'drawKey', { code: 'F6' });
  await game.step(2);
  const keyedOff = await page(game, 'drawState');
  await page(game, 'drawKey', { code: 'F6' });
  await game.step(2);
  const keyedOn = await page(game, 'drawState');
  found.say(`F6: drawing ${keyedOff.on ? 'on' : 'off'}, then ${keyedOn.on ? 'on' : 'off'}`);
  found.expect(!keyedOff.on && keyedOn.on, 'F6 didn\'t turn drawing off and on');

  // (left through the kick: drawing ends with the agent)
  await page(game, 'drawStroke', { from, to });
  // (the badge is written as a frame runs)
  await game.step(2);
  found.expect((await page(game, 'drawState')).clear, 'a second stroke offered no Clear');
}

/** After the kick: drawing off, nothing of it left on screen. */
export async function drawingEnded(game, found) {
  const state = await page(game, 'drawState');
  found.say(`after the kick: drawing ${state.on ? 'still on' : 'off'}, its canvas ${state.shown ? 'still shown' : 'hidden'}`);
  found.expect(!state.on && !state.shown, 'the drawing outlived the agent');
}
