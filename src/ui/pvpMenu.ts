// The duel's menu, the weapons rack's page of the village's card (ui/villageCard.ts `#vcard`, `data-page="pvp"`; #406):
// the battleground, how many fight (1 v 1 or 2 v 2), who is on which side or watches, how many rounds win the match
// (first to 3 unless chosen), and whether the heroes' gear counts. The room's host sets it up and every game shows it
// as he has it (game/duel.ts `duelSetup`, told by net/session.ts); each guest who fights says it's ready, and the
// host begins. A duel is fought within a party, so a player alone is sent to the campfire. From play: "a menu where
// you can select the map, how many players, against which players. And how many matches", "give them the option
// then, No gear at all vs gear that you have currently".
import { G } from '../state';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { DUEL_WINS, duelSetup as duel, type DuelPart } from '../game/duel';
import { isCoop, isGuest } from '../net/role';
import { sendDuelReady, sendDuelSetup } from '../net/session';
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
  const before = JSON.stringify([...duel.parts]);
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
  return JSON.stringify([...duel.parts]) !== before;
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

/** The next part a tap on a player's name gives it: first side, second side, watching, round again, a full side passed
 *  over. */
function nextPart(p: Player): DuelPart {
  const order: DuelPart[] = [0, 1, 'watch'];
  const now = order.indexOf(duel.parts.get(p.slot) ?? 'watch');
  for (let k = 1; k <= order.length; k++) {
    const to = order[(now + k) % order.length];
    if (to === 'watch' || onSide(to) < duel.aSide) return to;
  }
  return 'watch';
}

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

/** The menu's last line and its button, as the duel and the room stand. */
function sayWhatNext(): void {
  const lacks = duelLacks(), waits = duelWaitsFor(), me = G.player;
  const go = $<HTMLButtonElement>('#pvp-go');
  go.classList.toggle('hidden', !isCoop() || (isGuest() && !fights(me)));
  if (!isGuest()) {
    go.textContent = 'Begin the duel';
    go.disabled = !!lacks || waits.length > 0;
    $('#pvp-note').textContent = lacks || (waits.length ? `Waiting for ${waits.map(nameOf).join(' and ')} to ready up at the rack.`
      : 'Tap a name to move it. No rewards, nothing lost.');
    return;
  }
  const mine = duel.ready.has(me.slot);
  go.textContent = mine ? 'Not ready' : 'Ready';
  go.disabled = !!lacks;
  $('#pvp-note').textContent = lacks || (!fights(me) ? 'You watch this one. The host sets the duel up.'
    : mine ? 'Ready. The host begins the duel.' : 'You fight in this one: ready up when you are.');
}

/** The menu drawn as the duel and the room stand. */
export function renderPvp(): void {
  // (the host's parts kept up with the room whether or not his menu is open: a guest's shows them)
  if (settleParts()) sendDuelSetup();
  if ($('#vcard').dataset.page !== 'pvp') return;
  mark($('#pvp-ground'), duel.ground);
  mark($('#pvp-size'), String(duel.aSide));
  mark($('#pvp-wins'), String(duel.wins));
  mark($('#pvp-gear'), duel.gear ? 'own' : 'none');
  const sides = $('#pvp-sides');
  sides.classList.toggle('hidden', !isCoop());
  for (const part of [0, 1, 'watch'] as const) {
    const list = $(`[data-part="${part}"] .pvp-list`, sides);
    const players = G.players.filter((p) => duel.parts.get(p.slot) === part).sort((a, b) => a.slot - b.slot);
    list.replaceChildren(...players.map((p) => {
      const b = document.createElement('button');
      b.className = 'pvp-player';
      b.textContent = nameOf(p);
      b.classList.toggle('ready', fights(p) && ready(p));
      b.title = isGuest() ? '' : 'Move to the next side';
      b.disabled = isGuest();
      b.onclick = () => { sfx.click(); duel.parts.set(p.slot, nextPart(p)); changed(); };
      return b;
    }));
    if (!players.length) {
      const none = document.createElement('span');
      none.className = 'pvp-none';
      none.textContent = part === 'watch' ? 'no one' : 'empty';
      list.append(none);
    }
  }
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
  $('#pvp-go').onclick = () => {
    sfx.click();
    if (isGuest()) { sendDuelReady(!duel.ready.has(G.player.slot)); renderPvp(); return; }
    if (!duelLacks() && !duelWaitsFor().length) begin();
  };
}
