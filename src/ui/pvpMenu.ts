// The duel's menu, the weapons rack's page of the village's card (ui/villageCard.ts `#vcard`, `data-page="pvp"`; #406):
// the battleground, how many fight (1 v 1 or 2 v 2), who is on which side or watches, and how many rounds win the match
// (first to 3 unless chosen). The room's host sets it up; a duel is fought within a party, so a player alone is sent to
// the campfire. From play: "a menu where you can select the map, how many players, against which players. And how
// many matches."
import { G } from '../state';
import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { isCoop, isGuest } from '../net/role';
import { sfx } from '../core/audio';
import { nameOf } from './coop';
import type { Player } from '../entities/player';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

/** A player's part in a duel: on the first side, on the second, or watching. */
export type DuelPart = 0 | 1 | 'watch';
/** the rounds a match may be won by, and the one it is unless chosen (#406: "first to 3") */
export const DUEL_WINS = [1, 3, 5] as const;
const WINS_USUAL = 3;

/** The duel as set up at the rack: its battleground, how many a side, the rounds that win it, and each player's part by
 *  its slot (a player with none takes the first free place, else watches). */
export const duel = {
  ground: BIOME_IDS[0] as BiomeId,
  aSide: 1 as 1 | 2,
  wins: WINS_USUAL as number,
  parts: new Map<number, DuelPart>(),
};

let toCampfire: () => void = () => undefined;

/** How many of the room's players stand on `side`. */
const onSide = (side: 0 | 1): number => G.players.filter((p) => duel.parts.get(p.slot) === side).length;

/** Every player given a part: those who left forgotten, a newcomer on the first side with room, else watching; a side
 *  over its size (the fight made smaller) sheds its last to the watchers. */
function settleParts(): void {
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
}

/** What stands in the way of the duel as set up, in the menu's words, or '' when it can be fought. */
export function duelLacks(): string {
  if (!isCoop()) return 'A duel is fought within a party. Gather one at the campfire.';
  const need = duel.aSide * 2;
  if (G.players.length < need) return `A ${duel.aSide} v ${duel.aSide} needs ${need} players in the room.`;
  if (onSide(0) < duel.aSide || onSide(1) < duel.aSide) return `Each side needs ${duel.aSide === 1 ? 'a fighter' : 'two fighters'}.`;
  return '';
}

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

/** The menu drawn as the duel and the room stand. */
export function renderPvp(): void {
  if ($('#vcard').dataset.page !== 'pvp') return;
  settleParts();
  mark($('#pvp-ground'), duel.ground);
  mark($('#pvp-size'), String(duel.aSide));
  mark($('#pvp-wins'), String(duel.wins));
  const sides = $('#pvp-sides');
  sides.classList.toggle('hidden', !isCoop());
  for (const part of [0, 1, 'watch'] as const) {
    const list = $(`[data-part="${part}"] .pvp-list`, sides);
    const players = G.players.filter((p) => duel.parts.get(p.slot) === part).sort((a, b) => a.slot - b.slot);
    list.replaceChildren(...players.map((p) => {
      const b = document.createElement('button');
      b.className = 'pvp-player';
      b.textContent = nameOf(p);
      b.title = isGuest() ? '' : 'Move to the next side';
      b.disabled = isGuest();
      b.onclick = () => { sfx.click(); duel.parts.set(p.slot, nextPart(p)); renderPvp(); };
      return b;
    }));
    if (!players.length) {
      const none = document.createElement('span');
      none.className = 'pvp-none';
      none.textContent = part === 'watch' ? 'no one' : 'empty';
      list.append(none);
    }
  }
  const lacks = duelLacks();
  // (the fight itself is the next step of #406: until it's in, the menu says so in its button's place)
  $('#pvp-note').textContent = lacks || (isGuest() ? 'The host sets up the duel.' : 'No rewards, nothing lost: for the fun of it.');
  $('#pvp-go').classList.toggle('hidden', !isCoop());
  $<HTMLButtonElement>('#pvp-go').disabled = true;
  $('#pvp-party').classList.toggle('hidden', isCoop());
}

/** The menu's controls bound; `campfire` opens Play together (a player alone has no one to fight). */
export function initPvp(campfire: () => void): void {
  toCampfire = campfire;
  $('#pvp-ground').innerHTML = BIOME_IDS.map((id) => `<button data-v="${id}">${BIOMES[id].label}</button>`).join('');
  $('#pvp-wins').innerHTML = DUEL_WINS.map((n) => `<button data-v="${n}">${n}</button>`).join('');
  const pick = (row: string, set: (v: string) => void): void => {
    $(row).querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => {
        if (isGuest()) return;   // the host sets it up
        sfx.click();
        set(b.dataset.v!);
        renderPvp();
      };
    });
  };
  pick('#pvp-ground', (v) => { duel.ground = v as BiomeId; });
  pick('#pvp-size', (v) => { duel.aSide = v === '2' ? 2 : 1; });
  pick('#pvp-wins', (v) => { duel.wins = Number(v); });
  $('#pvp-party').onclick = () => { sfx.click(); toCampfire(); };
}
