// Talking to the village's folk (`#talk`, opened by using one: data/talk.ts has what each says): a card at the foot of
// the screen with his emblem, his name and what he is, what he says, and the replies to pick, each a button (a click, a
// tap, or its number's key). A reply leads on to what he says next, or ends the talk; Escape ends it too (main.ts).
import { SPEAKERS, type Speaker } from '../data/talk';
import { sfx } from '../core/audio';
import { wasPressed } from '../core/input';
import { dialog } from './dialogs';
import { villageUse } from '../game/villageUses';
import { showVillageCard } from './villageCard';
import { openPanels } from './menus';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

let speaker: Speaker | null = null;
let node = 'start';
/** told as the talk opens (true) and ends (false) */
let changed: (on: boolean) => void = () => undefined;

/** The card's handlers bound: `onChange` told as a talk opens and ends. */
export function initTalk(onChange: (on: boolean) => void): void {
  changed = onChange;
  $('#talk .tk-replies').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-reply]');
    if (b) pick(Number(b.dataset.reply));
  });
  $('#talk .tk-close').onclick = () => { sfx.click(); closeTalk(); };
}

/** Whether a talk is up. */
export const talkOpen = (): boolean => !$('#talk').classList.contains('hidden');

/** A talk with `id` (data/talk.ts `SPEAKERS`) begun at its start. */
export function openTalk(id: string): void {
  speaker = SPEAKERS[id] ?? null;
  if (!speaker) return;
  node = 'start';
  render();
  $('#talk').classList.remove('hidden');
  changed(true);
}

/** The talk ended. */
export function closeTalk(): void {
  if (!talkOpen()) return;
  $('#talk').classList.add('hidden');
  speaker = null;
  changed(false);
}

/** The keys while it's up: a reply's number picks it. */
dialog({ open: () => talkOpen(), close: () => closeTalk(), keys: () => talkKeys() });
// (a talk opened by using one of the village's folk: game/villageUses.ts)
villageUse('talk', {
  use(o) { showVillageCard(null); openPanels(null); openTalk(o.id); },
  leave() { closeTalk(); },
  shows: () => talkOpen(),
});

export function talkKeys(): void {
  if (!talkOpen() || !speaker) return;
  const replies = speaker.nodes[node].replies;
  for (let i = 0; i < replies.length && i < 9; i++) if (wasPressed(String(i + 1))) { pick(i); return; }
}

function pick(i: number): void {
  const r = speaker?.nodes[node].replies[i];
  if (!r) return;
  sfx.click();
  if (!r.to) { closeTalk(); return; }
  node = r.to;
  render();
}

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function render(): void {
  if (!speaker) return;
  const n = speaker.nodes[node];
  $('#talk .tk-name').textContent = speaker.name;
  $('#talk .tk-title').textContent = speaker.title;
  // (each line fades in after the last: data-i staggers it)
  const says = $('#talk .tk-says');
  says.innerHTML = n.says.map((l, i) => `<p style="--i:${i}">${escape(l)}</p>`).join('');
  says.scrollTop = 0;
  $('#talk .tk-replies').innerHTML = n.replies.map((r, i) =>
    `<button class="tk-reply" data-reply="${i}" style="--i:${n.says.length + i}"><span class="k">${i + 1}</span>${escape(r.text)}</button>`).join('');
}
