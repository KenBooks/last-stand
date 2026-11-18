// Talking to the village's folk (`#talk`, opened by using one: data/talk.ts has what each says): a card at the foot of
// the screen, his portrait and name plate beside what he says and the replies to pick. His lines come one after
// another, each given the time to read it (`READ`), a click, Space or Enter showing the rest at once; then the replies,
// each a button: a click, a tap, its number's key, or the arrows and Enter. Leave is always the last, and a reply
// already asked is marked. A reply leads on to what he says next, or ends the talk; Escape ends it too (main.ts). What
// was asked, and how many times they've talked, is kept in the hero's profile (`Profile.talk`): a first meeting and
// a visit after start differently, and a node asked again may be answered otherwise. It's stepped by the game's frame
// (`stepTalk`), so a harness's fixed clock reveals it as a player's does.
import { said, SPEAKERS, type Speaker, type TalkContext, type TalkReply } from '../../../data/talk';
import { sfx } from '../../../core/audio';
import { wasPressed } from '../../../core/input';
import { G } from '../../../state';
import { saveProfile } from '../../../loot/profile';
import { scholarTalk } from '../../../world/houses/library';
import { closedFrom, villageObject } from '../../../game/village';
import { screen } from '../../screenKit';
import { dialog } from '../../dialogs';
import { villageUse } from '../../../game/villageUses';
import { showVillageCard } from '../../villageCard';
import { openPanels } from '../../menus';
import { drawPortrait, hurryPortrait, portrait, portraitMade } from '../../guide/portraits';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

/** how long a line is given before the next (s): a pause, and a share of a second a letter, from `least` to `most` */
export const READ = { pause: 0.45, letter: 0.022, least: 0.9, most: 2.6 };
/** how long before his first line shows (s): the card's own fade in */
const FIRST_LINE = 0.25;

let speaker: Speaker | null = null;
let context: TalkContext | null = null;
/** what this hero has heard of the speaker's talk, as kept in his profile */
let memory: { visits: number; heard: string[] } | null = null;
let node = '';
/** the node's lines as said now, how many show, and the time till the next */
let lines: string[] = [];
let shown = 0;
let wait = 0;
/** the node's replies offered now, and which has the keys' focus */
let replies: TalkReply[] = [];
let focus = 0;
/** told as the talk opens (true) and ends (false) */
let changed: (on: boolean) => void = () => undefined;
/** told as each of his lines shows (the speaker's model nods to it) */
let spoke: () => void = () => undefined;

/** The card's handlers bound: `onChange` told as a talk opens and ends, `onLine` as each line he says shows. */
function initTalk(onChange: (on: boolean) => void, onLine: () => void = () => undefined): void {
  changed = onChange;
  spoke = onLine;
  const list = $('#talk .tk-replies');
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-reply]');
    if (b) pick(Number(b.dataset.reply));
  });
  list.addEventListener('pointerover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-reply]');
    if (b && e.pointerType === 'mouse') setFocus(Number(b.dataset.reply));
  });
  // (a click on what he says, or the hint under it, shows the rest of it)
  for (const s of ['#talk .tk-says', '#talk .tk-more']) $(s).addEventListener('click', () => revealAll());
  $('#talk .tk-close').onclick = () => { sfx.click(); closeTalk(); };
}

/** Whether a talk is up. */
export const talkOpen = (): boolean => !$('#talk').classList.contains('hidden');
/** Whether his lines are all shown and the replies offered (a harness reads it). */
export const talkAnswerable = (): boolean => talkOpen() && shown >= lines.length;
/** The node the talk is at (a harness reads it). */
export const talkNode = (): string => node;

/** A talk with `id` (data/talk.ts `SPEAKERS`) begun: a first meeting's start, or a later visit's. */
export function openTalk(id: string): void {
  speaker = SPEAKERS[id] ?? null;
  if (!speaker) return;
  const kept = (G.profile.talk ??= {});
  memory = (kept[id] ??= { visits: 0, heard: [] });
  const heard = memory.heard;
  context = {
    first: memory.visits === 0, visits: memory.visits, heard: (n) => heard.includes(n),
    cls: G.player.cls, records: G.profile.records,
  };
  memory.visits++;
  saveProfile(G.profile);
  const card = $('#talk');
  $('.tk-name', card).textContent = speaker.name;
  $('.tk-title', card).textContent = speaker.title;
  showPortrait(speaker);
  card.classList.remove('hidden');
  go(speaker.start(context));
  changed(true);
}

/** His portrait in the oval: the picture of his model, made behind the lobby long before (shown as it comes if it
 *  isn't yet: never made in the opening's frame), or the drawing where none can be made. */
function showPortrait(who: Speaker): void {
  const frame = $('#talk .tk-portrait'), photo = $<HTMLCanvasElement>('.tk-photo', frame);
  const show = (pic: HTMLCanvasElement | null): void => {
    if (speaker !== who) return;
    if (!pic) { frame.classList.add('drawn'); return; }
    // (a canvas already drawn: copied in, nothing to decode)
    drawPortrait(photo, pic);
    frame.classList.add('pictured');
  };
  frame.classList.remove('drawn', 'pictured');
  if (!who.portrait) { show(null); return; }
  const made = portraitMade(who.portrait);
  if (made) { show(made); return; }
  hurryPortrait(who.portrait);
  void portrait(who.portrait).then(show);
}

/** The talk ended. */
export function closeTalk(): void {
  if (!talkOpen()) return;
  $('#talk').classList.add('hidden');
  speaker = null;
  context = null;
  memory = null;
  changed(false);
}

/** The talk's frame: his next line shown once the last has had its time. */
export function stepTalk(dt: number): void {
  if (!talkOpen() || shown >= lines.length) return;
  wait -= dt;
  if (wait > 0) return;
  show(shown + 1);
}

/** The keys while it's up: Space or Enter shows the rest of what he says, then picks the reply in focus; a reply's
 *  number picks it; the arrows move the focus. */
export function talkKeys(): void {
  if (!talkOpen() || !speaker) return;
  const enter = wasPressed('enter') || wasPressed('numpadenter') || wasPressed('space');
  if (shown < lines.length) {
    if (enter || replies.some((_, i) => wasPressed(String(i + 1)))) revealAll();
    return;
  }
  for (let i = 0; i < replies.length && i < 9; i++) if (wasPressed(String(i + 1))) { pick(i); return; }
  if (wasPressed('arrowdown') || wasPressed('arrowright')) setFocus((focus + 1) % replies.length);
  else if (wasPressed('arrowup') || wasPressed('arrowleft')) setFocus((focus + replies.length - 1) % replies.length);
  else if (enter) pick(focus);
}

/** The talk at node `to`: its lines (again's, where it was heard before) to show one by one, its replies after. */
function go(to: string): void {
  if (!speaker || !context || !memory) return;
  const n = speaker.nodes[to];
  if (!n) { closeTalk(); return; }
  node = to;
  const before = context.heard(to);
  lines = (before && n.again ? n.again : n.says).map((s) => said(s, context!));
  replies = n.replies.filter((r) => !r.when || r.when(context!));
  if (!before) {
    memory.heard.push(to);
    saveProfile(G.profile);
  }
  shown = 0;
  wait = FIRST_LINE;
  focus = 0;
  $('#talk .tk-says').innerHTML = '';
  $('#talk .tk-replies').innerHTML = '';
  $('#talk .tk-box').classList.add('revealing');
}

/** The time line `text` is given before the next shows (s). */
export const readTime = (text: string): number =>
  Math.min(READ.most, Math.max(READ.least, READ.pause + text.length * READ.letter));

/** His lines shown up to the `n`th; with all of them, the replies offered. */
function show(n: number): void {
  const says = $('#talk .tk-says');
  for (; shown < Math.min(n, lines.length); shown++) {
    const p = document.createElement('p');
    p.textContent = lines[shown];
    says.append(p);
    wait = readTime(lines[shown]);
  }
  spoke();
  says.scrollTop = says.scrollHeight;
  if (shown >= lines.length) offer();
}

/** All of what he says shown at once (a click, Space or Enter while he speaks). */
function revealAll(): void {
  if (shown >= lines.length) return;
  show(lines.length);
}

const LEAVE_MARK = '↩';

/** The replies laid out as buttons: each with its number's key, one asked before marked, Leave last. */
function offer(): void {
  if (!context) return;
  $('#talk .tk-box').classList.remove('revealing');
  const list = $('#talk .tk-replies');
  list.innerHTML = '';
  replies.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'tk-reply';
    b.dataset.reply = String(i);
    b.style.setProperty('--i', String(i));
    const leave = r.to === null;
    const asked = !leave && r.to !== 'more' && context!.heard(r.to!);
    b.classList.toggle('leave', leave);
    b.classList.toggle('asked', asked);
    const key = document.createElement('span');
    key.className = 'k';
    key.textContent = String(i + 1);
    const text = document.createElement('span');
    text.className = 'tx';
    text.textContent = said(r.text, context!);
    b.append(key, text);
    if (leave) b.insertAdjacentHTML('beforeend', `<span class="mark" aria-hidden="true">${LEAVE_MARK}</span>`);
    if (asked) b.insertAdjacentHTML('beforeend', '<span class="mark asked-mark">asked</span>');
    list.append(b);
  });
  setFocus(0);
}

/** The keys' focus on reply `i`, shown as a hover is. */
function setFocus(i: number): void {
  focus = i;
  document.querySelectorAll<HTMLElement>('#talk .tk-reply').forEach((b, j) => b.classList.toggle('focus', j === i));
}

function pick(i: number): void {
  const r = replies[i];
  if (!r || shown < lines.length) return;
  sfx.click();
  if (!r.to) { closeTalk(); return; }
  go(r.to);
}

// (the keys while it's up, and Escape ending it: ui/dialogs.ts)
dialog({ open: () => talkOpen(), close: () => closeTalk(), keys: () => talkKeys() });
// (a talk opened by using one of the village's folk: game/villageUses.ts)
villageUse('talk', {
  use(o) { showVillageCard(null); openPanels(null); openTalk(o.id); },
  leave() { closeTalk(); },
  shows: () => talkOpen(),
});

/** A talk opened or ended: the scholar looks up from his book while it's on, and his use is put away as it ends. */
function talkChanged(on: boolean): void {
  scholarTalk.talking = on;
  if (!on) closedFrom(villageObject('scholar'));
}

// (a screen of its own, started in the village by ui/screens.ts; each line he says shown, a nod to it)
screen({ village: true, init: () => initTalk(talkChanged, () => { scholarTalk.lines++; }) });
