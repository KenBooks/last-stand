// `lab invite`'s part on the chat between the player and the agent (#923, src/dev/agentChat.ts), after what the owner
// draws and before the kick (inviteCheck.mjs):
//   let in, the chat shows in the solo game (no co-op session), its prompt the agent's, the game's note saying so;
//   a line said by the keyboard (Enter, typed, Enter) reaches the agent's link (`hear`) as it was typed;
//   a line said by touch (a finger's tap turning touch mode on, the chat button, typed, Send) reaches it too;
//   the agent's answer (`say`, `more`) shows under its name with "more in the session"; one over the chat's limit is
//     refused, saying the limit;
//   kicked, the chat is hidden and its lines gone (`chatEnded`, after inviteCheck.mjs's `kicked`).
// The canary types the keyboard's line with the box never opened, and has the answer said as the game's own word in
// place of the agent's: the check must say the first never reached the session and the second isn't the agent's.
import { callPage } from './inviteCheck.mjs';

/** the lines the player says, and the agent's answer */
const KEYED = 'can you see the roof I drew on?';
const TAPPED = 'and this one, from the phone';
const ANSWER = 'Yes: the thatch is thinned there.';
const MORE = 'more in the session';
/** how long a line said is given to reach the agent's link (ms) */
const HEARD_MS = 3000;
/** the game's chat's limit (`CHAT.most` in src/data/balance.ts), and an answer past it */
const CHAT_MOST = 200;
const TOO_LONG = 'x'.repeat(CHAT_MOST + 1);

const page = (game, fn, args) => callPage(game.page, 'inviteChat', fn, args);

/** The lines the agent's link hears within `HEARD_MS`, the game's frames run meanwhile. */
async function heard(game, link) {
  return game.whileStepping(link.hear(HEARD_MS));
}

/** A line said by the keyboard: Enter opening the box (by the game's next frame), the line typed, its form sent as
 *  Enter in it sends it. With `opened` false (the canary) the box is never opened first. */
async function sayByKeys(game, text, opened) {
  if (opened) await page(game, 'chatOpenByKey');
  await page(game, 'chatType', { text });
  await page(game, 'chatSubmit');
  await game.step(2);
}

/** A line said by touch: touch mode on by a tap, the chat button tapped, the line typed (pictured, under `dir`), Send
 *  tapped; then a mouse's click back. Returns the chat's state as touch mode showed it. */
async function sayByTouch(game, text, dir) {
  await page(game, 'chatPointer', { touch: true });
  await game.step(2);
  const touch = await page(game, 'chatState');
  await page(game, 'chatTap', { what: 'button' });
  await game.step(2);
  await page(game, 'chatType', { text });
  await game.picture(dir, '3c-chat-touch');
  await page(game, 'chatTap', { what: 'send' });
  await game.step(2);
  await page(game, 'chatPointer', { touch: false });
  await game.step(2);
  return touch;
}

/** The chat open in the solo game, a line each way by the keyboard and by touch, an answer too long refused. */
export async function chattedWithTheAgent(game, found, link, dir) {
  const open = await page(game, 'chatState');
  const note = open.lines.find((line) => line.kind.includes('note'))?.text ?? 'none';
  found.say(`the chat with the agent: ${open.shown ? 'shown' : 'NOT shown'} in a solo game (co-op ${open.session}), `
    + `its prompt "${open.prompt}", the game's note "${note}"`);
  found.expect(open.shown && open.session === 'off', 'the chat isn\'t shown in the solo game with an agent joined');
  found.expect(open.prompt === 'Say to the agent…', `the chat's prompt is "${open.prompt}"`);

  // (said with the game frozen, as the owner may well freeze it to show a thing: the chat is stepped all the same)
  const wasFrozen = Boolean((await game.whileStepping(link.step('look'))).time?.frozen);
  await game.whileStepping(link.step('set', { values: { freeze: true } }));
  await sayByKeys(game, KEYED, !found.canary);
  const keyed = await heard(game, link);
  await game.whileStepping(link.step('set', { values: { freeze: wasFrozen } }));
  const afterKeys = await page(game, 'chatState');
  const keyedTexts = JSON.stringify(keyed.map((line) => line.text));
  found.say(`a line said by the keyboard, the game frozen: the agent heard ${keyedTexts} `
    + `(the box ${afterKeys.open ? 'open' : 'shut'}, its field ${afterKeys.focused ? '' : 'not '}focused, `
    + `the menu ${afterKeys.menuOpen ? 'up' : 'down'}, ${afterKeys.kept} lines kept)`);
  found.expect(keyed.length === 1 && keyed[0].text === KEYED, 'the line said by the keyboard never reached the agent',
    'unheard');

  const touch = await sayByTouch(game, TAPPED, dir);
  const tapped = await heard(game, link);
  found.say(`by touch: the chat button ${touch.button ? 'shown' : 'NOT shown'} (touch mode ${touch.touch}), the agent `
    + `heard ${JSON.stringify(tapped.map((line) => line.text))}`);
  found.expect(touch.touch && touch.button, 'touch mode showed no chat button');
  found.expect(tapped.length === 1 && tapped[0].text === TAPPED, 'the line said by touch never reached the agent');

  if (found.canary) await page(game, 'chatCanaryNote', { text: ANSWER });
  else await game.whileStepping(link.step('say', { text: ANSWER, more: true }));
  const answered = await page(game, 'chatState');
  const last = answered.lines.at(-1) ?? { kind: '', name: '', text: '', tag: '' };
  found.say(`the agent's answer shows as "${last.name} ${last.text} ${last.tag}" (${last.kind})`);
  const asAgent = last.kind.includes('aside') && last.name === 'Agent:' && last.text === ANSWER;
  found.expect(asAgent, `the agent's answer shows as "${last.name} ${last.text}"`, 'unnamed');
  found.expect(found.canary || last.tag === `(${MORE})`, `the answer's word after it is "${last.tag}"`);
  const mine = answered.lines.filter((line) => line.kind === 'chat-line').map((line) => line.text);
  found.expect(mine.includes(KEYED) || found.canary, 'the player\'s own line isn\'t in his chat');

  const refused = await game.whileStepping(link.step('say', { text: TOO_LONG })).catch((error) => error.message);
  found.say(`an answer of ${TOO_LONG.length} characters: "${refused}"`);
  found.expect(/chat holds 200/.test(String(refused)), 'an answer over the chat\'s limit wasn\'t refused saying it');
  await game.picture(dir, '3c-chat');
}

/** After the kick: the chat hidden, its lines gone. */
export async function chatEnded(game, found) {
  // (the chat is shown or hidden by the game's frame: the kick's link may end before one has run)
  await game.step(2);
  const state = await page(game, 'chatState');
  found.say(`after the kick: the chat ${state.shown ? 'still shown' : 'hidden'}, ${state.kept} lines kept`);
  found.expect(!state.shown && state.kept === 0 && state.lines.length === 0, 'the chat outlived the agent');
}
