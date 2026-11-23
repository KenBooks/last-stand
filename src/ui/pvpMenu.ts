// The duel's menu, the weapons rack's page of the village's card (ui/villageCard.ts `#vcard`, `data-page="pvp"`; #406):
// the battleground, how many fight (1 v 1 or 2 v 2), who is on which side or watches, how many rounds win the match
// (first to 3 unless chosen), and whether the heroes' gear counts. The room's host sets it up and every game shows it
// as he has it (game/duel.ts `duelSetup`, told by net/session.ts); each guest who fights says it's ready, and the
// host begins. A duel is fought within a party, so a player alone is sent to the campfire. From play: "a menu where
// you can select the map, how many players, against which players. And how many matches", "give them the option
// then, No gear at all vs gear that you have currently".
// Every player picks his own place: a click or a tap on a side's free place moves him there, on Watching to the
// watchers, and on a place someone holds asks that player to give it up and watch (`#duel-ask`, answered on his
// game). From Victor's review: "Click Side Two and end up there, if available. If already taken, it should ask the
// other player to free the spot and spectate instead".
import { G } from '../state';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { DUEL_WINS, duelSetup as duel, settleAsks, type DuelAsk, type DuelPart } from '../game/duel';
import { isCoop, isGuest } from '../net/role';
import { answerAsk, pickPlace, sendDuelReady, sendDuelSetup } from '../net/session';
import { sfx } from '../core/audio';
import { nameOf } from './coop';
import type { Player } from '../entities/player';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

let toCampfire: () => void = () => undefined;
let begin: () => void = () => undefined;

/** How many of the room's players stand on `side`. */
const onSide = (side: 0 | 1): number => G.players.filter((p) => duel.parts.get(p.slot) === side).length;

/** Every player given a part (the host's: a guest shows the host's word): those who left forgotten, a newcomer on the
 *  first side with room, else watching; a side over its size (the fight made smaller) sheds its last to the watchers.
 *  Returns whether anything changed. */
function settleParts(): boolean {
  if (isGuest()) return false;
  const before = JSON.stringify([[...duel.parts], duel.asks]);
  const here = new Set(G.players.map((p) => p.slot));
  for (const slot of [...duel.parts.keys()]) if (!here.has(slot)) duel.parts.delete(slot);
  const bySlot = [...G.players].sort((a, b) => a.slot - b.slot);
  for (const side of [0, 1] as const) {
    const over = bySlot.filter((p) => duel.parts.get(p.slot) === side).slice(duel.aSide);
    for (const p of over) duel.parts.set(p.slot, 'watch');
  }
  for (const p of bySlot) {
    if (duel.parts.has(p.slot)) continue;
    duel.parts.set(p.slot, onSide(0) < duel.aSide ? 0 : onSide(1) < duel.aSide ? 1 : 'watch');
  }
  settleAsks();
  return JSON.stringify([[...duel.parts], duel.asks]) !== before;
}

/** What stands in the way of the duel as set up, in the menu's words, or '' when it can be fought. */
export function duelLacks(): string {
  if (!isCoop()) return 'A duel is fought within a party. Gather one at the campfire.';
  const need = duel.aSide * 2;
  if (G.players.length < need) return `A ${duel.aSide} v ${duel.aSide} needs ${need} players in the room.`;
  if (onSide(0) < duel.aSide || onSide(1) < duel.aSide) return `Each side needs ${duel.aSide === 1 ? 'a fighter' : 'two fighters'}.`;
  return '';
}

/** Whether `p` fights in the duel as set up. */
const fights = (p: Player): boolean => duel.parts.get(p.slot) === 0 || duel.parts.get(p.slot) === 1;
/** Whether `p` is ready for it: the host is as he begins it, a watcher has nothing to be ready for. */
const ready = (p: Player): boolean => p.slot === 0 || !fights(p) || duel.ready.has(p.slot);

/** The fighters the host still waits for. */
export const duelWaitsFor = (): Player[] => G.players.filter((p) => !ready(p));

/** A segmented row's buttons marked: the chosen one lit, all of them dead for a guest (the host sets the duel up). */
function mark(row: HTMLElement, chosen: string): void {
  row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === chosen);
    b.setAttribute('aria-pressed', String(b.dataset.v === chosen));
    b.disabled = isGuest();
  });
}

/** The host changed the duel: told to the room (everyone ready for the last one asked again), and drawn. */
function changed(): void {
  sendDuelSetup();
  renderPvp();
}

/** The player in `slot`, if he's in the room. */
const bySlot = (slot: number): Player | undefined => G.players.find((p) => p.slot === slot);
/** A side as the menu names it. */
const sideLabel = (part: 0 | 1): string => (part === 0 ? 'Side one' : 'Side two');

/** The ask for the local player's place waiting for his answer, and the ask he made himself, if any. */
const askOfMine = (): DuelAsk | undefined => duel.asks.find((ask) => ask.holder === G.player.slot);
const myAsk = (): DuelAsk | undefined => duel.asks.find((ask) => ask.by === G.player.slot);

/** What the local player's own place says in the menu's line: an ask out, an ask refused, or '' for neither. */
function askLine(): string {
  const mine = myAsk();
  const held = mine && bySlot(mine.holder);
  if (mine && held) return `Asked ${nameOf(held)} for the place on ${sideLabel(mine.part)}. Waiting for an answer.`;
  const no = duel.refused;
  const holder = no && bySlot(no.holder);
  if (!no || !holder) return '';
  return no.why === 'busy' ? `Someone else already asked ${nameOf(holder)} for that place.` : `${nameOf(holder)} keeps the place.`;
}

/** The menu's last line and its button, as the duel and the room stand. */
function sayWhatNext(): void {
  const lacks = duelLacks(), waits = duelWaitsFor(), me = G.player, asking = askLine();
  const go = $<HTMLButtonElement>('#pvp-go');
  go.classList.toggle('hidden', !isCoop() || (isGuest() && !fights(me)));
  if (!isGuest()) {
    go.textContent = 'Begin the duel';
    go.disabled = !!lacks || waits.length > 0;
    $('#pvp-note').textContent = asking || lacks || (waits.length ? `Waiting for ${waits.map(nameOf).join(' and ')} to ready up at the rack.`
      : 'Click a place to take it. No rewards, nothing lost.');
    return;
  }
  const mine = duel.ready.has(me.slot);
  go.textContent = mine ? 'Not ready' : 'Ready';
  go.disabled = !!lacks;
  $('#pvp-note').textContent = asking || lacks || (!fights(me) ? 'You watch this one. Click a side\'s place to fight.'
    : mine ? 'Ready. The host begins the duel.' : 'You fight in this one: ready up when you are.');
}

/** A place on a side as a button: its holder's name (a click asks him for it) or free (a click takes it). */
function placeButton(part: 0 | 1, holder: Player | undefined): HTMLButtonElement {
  const b = document.createElement('button');
  const mine = holder?.local === true;
  const asked = holder && myAsk()?.holder === holder.slot;
  b.className = holder ? 'pvp-place pvp-player' : 'pvp-place pvp-open';
  b.dataset.part = String(part);
  if (holder) b.dataset.holder = String(holder.slot);
  b.textContent = holder ? nameOf(holder) : 'Free: take it';
  b.classList.toggle('ready', !!holder && ready(holder));
  b.classList.toggle('mine', mine);
  b.classList.toggle('asked', !!asked);
  b.title = mine ? 'Your place' : holder ? `Ask ${nameOf(holder)} for this place` : `Take this place on ${sideLabel(part)}`;
  b.disabled = mine || !isCoop();
  b.onclick = () => { sfx.click(); pickPlace(part, holder ? holder.slot : null); renderPvp(); };
  return b;
}

/** The watchers' row: their names, and a way to join them for a fighter. */
function watchRow(list: HTMLElement): void {
  const watchers = G.players.filter((p) => duel.parts.get(p.slot) === 'watch').sort((a, b) => a.slot - b.slot);
  const names = watchers.map((p) => {
    const name = document.createElement('span');
    name.className = 'pvp-watcher';
    name.classList.toggle('mine', p.local);
    name.textContent = nameOf(p);
    return name;
  });
  if (!watchers.length) {
    const none = document.createElement('span');
    none.className = 'pvp-none';
    none.textContent = 'no one';
    names.push(none);
  }
  list.replaceChildren(...names);
  if (!isCoop() || duel.parts.get(G.player.slot) === 'watch') return;
  const join = document.createElement('button');
  join.className = 'pvp-place pvp-open';
  join.dataset.part = 'watch';
  join.textContent = 'Watch instead';
  join.onclick = () => { sfx.click(); pickPlace('watch', null); renderPvp(); };
  list.append(join);
}

/** How long an ask for the local player's place waits for his answer before it's kept (s, real time). */
const ASK_SECONDS = 20;
/** the ask the prompt shows, and its timer */
let asked: { key: string; timer: number } | null = null;

/** The prompt for an ask for the local player's place: shown while one waits for his answer, wherever he is in the
 *  lobby (his game kept to itself if he lets it be: kept after `ASK_SECONDS`). */
function showAsk(): void {
  const box = $('#duel-ask');
  const ask = G.mode === 'menu' ? askOfMine() : undefined;
  const by = ask && bySlot(ask.by);
  const key = ask && by ? `${ask.by}:${ask.part}` : '';
  if (asked && asked.key !== key) { clearTimeout(asked.timer); asked = null; }
  box.classList.toggle('hidden', !key);
  placeAsk(box, !!key);
  if (!ask || !by || asked) return;
  $('#duel-ask-text').textContent = `${nameOf(by)} asks for your place on ${sideLabel(ask.part)}.`;
  asked = { key, timer: window.setTimeout(() => answer(false), ASK_SECONDS * 1000) };
}

/** The prompt put where it shows: with the rack's card open, in it in place of the menu's line and button (laid over
 *  the card from the top, it covered the card's sides on a phone held sideways, where the card is nearly the screen's
 *  height); elsewhere at the top's middle of the screen. */
function placeAsk(box: HTMLElement, shown: boolean): void {
  const card = $('#vcard');
  const page = $('.vc-page[data-page="pvp"]', card);
  const inCard = card.dataset.page === 'pvp' && !card.classList.contains('hidden');
  if (inCard && box.parentElement !== page) page.insertBefore(box, $('#pvp-note', page));
  if (!inCard && box.parentElement !== document.body) document.body.append(box);
  box.classList.toggle('inline', inCard);
  page.classList.toggle('asking', inCard && shown);
}

/** The local player's answer to the ask for his place, the prompt put away until the host's word of it. */
function answer(yes: boolean): void {
  if (asked) clearTimeout(asked.timer);
  asked = null;
  $('#duel-ask').classList.add('hidden');
  answerAsk(yes);
}

/** The menu drawn as the duel and the room stand. */
export function renderPvp(): void {
  // (the host's parts kept up with the room whether or not his menu is open: a guest's shows them)
  if (settleParts()) sendDuelSetup();
  showAsk();
  if ($('#vcard').dataset.page !== 'pvp') return;
  mark($('#pvp-ground'), duel.ground);
  mark($('#pvp-size'), String(duel.aSide));
  mark($('#pvp-wins'), String(duel.wins));
  mark($('#pvp-gear'), duel.gear ? 'own' : 'none');
  const sides = $('#pvp-sides');
  sides.classList.toggle('hidden', !isCoop());
  for (const part of [0, 1] as const) {
    const holders = G.players.filter((p) => duel.parts.get(p.slot) === part).sort((a, b) => a.slot - b.slot);
    const places = Array.from({ length: Math.max(duel.aSide, holders.length) }, (_, i) => placeButton(part, holders[i]));
    $(`[data-part="${part}"] .pvp-list`, sides).replaceChildren(...places);
  }
  watchRow($('[data-part="watch"] .pvp-list', sides));
  sayWhatNext();
  $('#pvp-party').classList.toggle('hidden', isCoop());
}

/** The menu's controls bound; `campfire` opens Play together (a player alone has no one to fight), `start` begins the
 *  duel as set up (the host's). */
export function initPvp(campfire: () => void, start: () => void): void {
  toCampfire = campfire;
  begin = start;
  $('#pvp-ground').innerHTML = BIOME_IDS.map((id) => `<button data-v="${id}">${BIOMES[id].label}</button>`).join('');
  $('#pvp-wins').innerHTML = DUEL_WINS.map((n) => `<button data-v="${n}">${n}</button>`).join('');
  const pick = (row: string, set: (v: string) => void): void => {
    $(row).querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        if (isGuest()) return;   // the host sets it up
        sfx.click();
        set(b.dataset.v!);
        changed();
      };
    });
  };
  pick('#pvp-ground', (v) => { duel.ground = v as BiomeId; });
  pick('#pvp-size', (v) => { duel.aSide = v === '2' ? 2 : 1; });
  pick('#pvp-wins', (v) => { duel.wins = Number(v); });
  pick('#pvp-gear', (v) => { duel.gear = v !== 'none'; });
  $('#pvp-party').onclick = () => { sfx.click(); toCampfire(); };
  $('#duel-ask-yes').onclick = () => { sfx.click(); answer(true); };
  $('#duel-ask-no').onclick = () => { sfx.click(); answer(false); };
  $('#pvp-go').onclick = () => {
    sfx.click();
    if (isGuest()) { sendDuelReady(!duel.ready.has(G.player.slot)); renderPvp(); return; }
    if (!duelLacks() && !duelWaitsFor().length) begin();
  };
}
