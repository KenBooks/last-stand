// `lab coop --scenarios duel` on a page (node/coopDuel.mjs plays and judges it): a duel set up in the weapons rack's
// menu as a player sets it up (its own buttons), readied by the guest and begun by the host, then fought: each round
// the two heroes stand a few strides apart, one of them down to a little life (its own game's to say) and the other
// striking at it with its first skill, aimed where its own screen shows its rival.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { VILLAGE_OBJECTS } from '../../../src/data/village';
import { showVillageCard } from '../../../src/ui/villageCard';
import { nameOf } from '../../../src/ui/coop';
import * as balance from '../../../src/data/balance';
import { mine } from '../../../src/game/stats';
import type { Frame, Lab } from './lab';

/** the game's duel, where the tree has one (an older tree has none) */
type DuelModule = typeof import('../../../src/game/duel');
const duels = Object.values(import.meta.glob<DuelModule>('../../../src/game/duel.ts', { eager: true }))[0];
/** the game's co-op session, for the host's word of the duel (`sendDuelSetup`, a tree with duels alone has it) */
type SessionModule = typeof import('../../../src/net/session');
const sessions = Object.values(import.meta.glob<SessionModule>('../../../src/net/session.ts', { eager: true }))[0];

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);

/** A segmented row's button of the duel's menu pressed, by its value. */
function press(row: string, value: string): void {
  $<HTMLButtonElement>(`${row} button[data-v="${value}"]`)?.click();
}

/** The rack's menu opened on this page, as walking up to the rack opens it (`lab village --only rackOpensDuel` walks). */
function openMenu(): void {
  const rack = VILLAGE_OBJECTS.find((object) => object.id === 'rack');
  if (rack) showVillageCard(rack);
}

/** The duel's menu as this page shows it: what each row has chosen, who stands where, its line and its button, the
 *  part this page's player and its partner hold there, and the prompt asking for this player's place ('' hidden). */
export interface DuelMenu {
  ground: string; size: string; wins: string; gear: string;
  sides: string[][];
  note: string; button: string; disabled: boolean;
  mine: string; partner: string;
  prompt: string;
}

/** Where a player stands in the menu as drawn: the part of the place or row his name is in ('none' if nowhere). */
function partShown(name: string): string {
  const named = [...document.querySelectorAll<HTMLElement>('#pvp-sides .pvp-player, #pvp-sides .pvp-watcher')]
    .find((element) => element.textContent === name);
  return named?.closest<HTMLElement>('.pvp-side')?.dataset.part ?? 'none';
}

export function coopDuelMenu(): DuelMenu {
  openMenu();
  const chosen = (row: string): string => $(`${row} button.active`)?.dataset.v ?? '';
  const names = (part: string): string[] =>
    [...document.querySelectorAll<HTMLElement>(`#pvp-sides [data-part="${part}"] :is(.pvp-player, .pvp-watcher)`)]
      .map((button) => `${button.textContent}${button.classList.contains('ready') ? ' (ready)' : ''}`);
  const go = $<HTMLButtonElement>('#pvp-go');
  const partner = G.players.find((player) => !player.local);
  const ask = $('#duel-ask');
  return {
    ground: chosen('#pvp-ground'), size: chosen('#pvp-size'), wins: chosen('#pvp-wins'), gear: chosen('#pvp-gear'),
    sides: ['0', '1', 'watch'].map(names),
    note: $('#pvp-note')?.textContent ?? '', button: go?.textContent ?? '', disabled: go?.disabled ?? true,
    mine: partShown(nameOf(G.player)),
    partner: partner ? partShown(nameOf(partner)) : 'none',
    prompt: ask && !ask.classList.contains('hidden') ? $('#duel-ask-text')?.textContent ?? '' : '',
  };
}

/** A part as the lab names it: a side's number, or the watchers. */
type PartName = '0' | '1' | 'watch';

/** The host puts each player in a part, as the game's own ruling would (`duelSetup.parts`), and tells the room:
 *  each step of the places' check starts from parts of its own. */
export function coopDuelParts(_lab: Lab, set: { host: PartName; guest: PartName }): void {
  const partOf = (name: PartName) => (name === 'watch' ? 'watch' : Number(name) as 0 | 1);
  const guest = G.players.find((player) => !player.local);
  if (!duels || !sessions || !guest) return;
  duels.duelSetup.asks = [];
  duels.duelSetup.parts.set(G.player.slot, partOf(set.host));
  duels.duelSetup.parts.set(guest.slot, partOf(set.guest));
  sessions.sendDuelSetup(true);
  openMenu();
}

/** The menu's place `part` clicked by the mouse or tapped by a finger, as a player does: the partner's place on that
 *  side (`whose: 'partner'`), a free one (`'free'`), or the watchers' Watch instead. Returns whether it was there. */
export async function coopDuelPlace(lab: Lab, set: { part: PartName; whose: 'free' | 'partner'; by: 'click' | 'tap' }):
  Promise<boolean> {
  openMenu();
  const partner = G.players.find((player) => !player.local);
  const places = [...document.querySelectorAll<HTMLButtonElement>(`#pvp-sides .pvp-place[data-part="${set.part}"]`)];
  const place = places.find((button) => (set.whose === 'partner'
    ? button.dataset.holder === String(partner?.slot) : button.dataset.holder === undefined));
  if (!place) return false;
  await pressAs(lab, place, set.by);
  return true;
}

/** The prompt asking for this player's place answered: given up (`yes`) or kept, by the mouse or a finger. Returns
 *  whether the prompt was there to answer. */
export async function coopDuelAnswer(lab: Lab, set: { yes: boolean; by: 'click' | 'tap' }): Promise<boolean> {
  const ask = $('#duel-ask');
  const button = $(set.yes ? '#duel-ask-yes' : '#duel-ask-no');
  if (!ask || ask.classList.contains('hidden') || !button) return false;
  await pressAs(lab, button, set.by);
  return true;
}

/** An element pressed as a player does: the mouse's click at its middle, or a finger's tap there. A tap puts the
 *  page in touch mode, so the mouse is moved after it, as the rest of the duel is played by the mouse. */
async function pressAs(lab: Lab, element: HTMLElement, by: 'click' | 'tap'): Promise<void> {
  if (by === 'click') {
    await lab.clickOn(element);
    return;
  }
  const box = element.getBoundingClientRect();
  await lab.tap({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  touched = true;
}

/** whether a finger has put the page in touch mode since the mouse last moved */
let touched = false;

/** The mouse moved over the game after a step's taps, as the player takes it up again: the page back in mouse mode
 *  (touch mode follows the last pointer used). Returns whether the page was in touch mode as the step ended. */
export async function coopDuelMouseBack(lab: Lab): Promise<boolean> {
  const wasTouch = document.body.classList.contains('touch');
  if (!touched) return wasTouch;
  touched = false;
  await lab.mouseTo({ x: Math.round(window.innerWidth * 0.31), y: Math.round(window.innerHeight * 0.27) });
  await lab.mouseTo({ x: Math.round(window.innerWidth * 0.33), y: Math.round(window.innerHeight * 0.29) });
  return wasTouch;
}

/** the messages the canary keeps from the host: a guest's picks of a place and its answers to an ask */
const LOST_ON_CANARY = new Set(['dpick', 'danswer']);
/** whether this page loses them (the host's, with `--canary`) */
let losingPicks = false;

/** The canary of the places' check: this page (the host's) loses every pick and answer a guest sends it. */
export function coopDuelLosePicks(_lab: Lab, set: { on: boolean }): void {
  losingPicks = set.on;
}

/** Whether a message arriving on this page is one the canary loses (page/coop.ts asks of each it delivers). */
export function pickLost(data: unknown): boolean {
  const packet = data as { ch?: string; data?: { t?: unknown } } | null;
  return losingPicks && packet?.ch === 'ctl' && LOST_ON_CANARY.has(String(packet.data?.t));
}

/** A screen the menu is fitted on (css px), as `--screen` names one. */
export interface DuelScreen { width: number; height: number; ratio: number }

/** The rack's card and the ask's prompt on this page's screen: the problems with them, and their boxes in a line. */
export interface DuelFit { line: string; problems: string[] }

/** a name long enough to wrap the prompt where a short one wouldn't, as a 16-letter tag can */
const LONG_NAME = 'Wwwwwwwwwwwwwwww';

/**
 * The menu and a prompt asking for this player's place fitted on `screen` (the page put on it and back after): an
 * ask of his place by his partner put in the game's state as the host's word puts it there, and the menu drawn as
 * the game draws it, with the rack's card open (the prompt in it) and shut (the prompt at the screen's top). With
 * `canary` the prompt is pushed a window down, which must be found.
 */
export async function coopDuelFit(lab: Lab, set: { screen: DuelScreen; canary?: boolean }): Promise<DuelFit> {
  const own = { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio };
  const ask = $('#duel-ask'), card = $('#vcard');
  const partner = G.players.find((player) => !player.local);
  if (!ask || !card || !partner || !duels) {
    return { line: 'no menu', problems: ['the duel\'s menu or prompt is missing'] };
  }
  const was = { asks: duels.duelSetup.asks, tag: partner.tag };
  try {
    partner.tag = LONG_NAME;
    duels.duelSetup.asks = [{ holder: G.player.slot, by: partner.slot, part: 1 }];
    if (set.canary) ask.style.marginTop = '400vh';
    await lab.showOn(set.screen);
    openMenu();
    await lab.step(2);
    const open = fitHere(ask, card, true);
    showVillageCard(null);
    await lab.step(2);
    const shut = fitHere(ask, card, false);
    return { line: `${open.line}; shut: ${shut.line}`, problems: [...open.problems, ...shut.problems] };
  } finally {
    ask.style.marginTop = '';
    partner.tag = was.tag;
    duels.duelSetup.asks = was.asks;
    openMenu();
    await lab.showOn(own);
  }
}

/** Whether a box lies within another (the window if none), a pixel's rounding allowed. */
function within(box: DOMRect, outer?: DOMRect): boolean {
  const edges = outer ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  return box.left >= edges.left - 1 && box.top >= edges.top - 1
    && box.right <= edges.right + 1 && box.bottom <= edges.bottom + 1;
}

/** The card's and the prompt's fit on the screen the page is on now, the card open or shut. */
function fitHere(ask: HTMLElement, card: HTMLElement, open: boolean): DuelFit {
  const size = `${window.innerWidth}x${window.innerHeight}`;
  const screen = `${size}, the card ${open ? 'open' : 'shut'}`;
  const problems: string[] = [];
  const askBox = ask.getBoundingClientRect(), cardBox = card.getBoundingClientRect();
  if (ask.classList.contains('hidden') || !askBox.height) problems.push(`${screen}: the ask's prompt isn't shown`);
  if (!within(askBox)) problems.push(`${screen}: the ask's prompt runs past the window`);
  if (open) {
    if (!within(cardBox)) problems.push(`${screen}: the rack's card runs past the window`);
    if (!within(askBox, cardBox)) problems.push(`${screen}: the ask's prompt isn't within the open card`);
    for (const place of card.querySelectorAll<HTMLElement>('.pvp-place')) {
      if (!within(place.getBoundingClientRect(), cardBox)) problems.push(`${screen}: a place runs out of the card`);
    }
  }
  const touch = document.body.classList.contains('touch');
  const boxOf = (box: DOMRect) => `${Math.round(box.width)}x${Math.round(box.height)}`;
  const boxes = open ? `the card ${boxOf(cardBox)}, the prompt ${boxOf(askBox)} in it` : `the prompt ${boxOf(askBox)}`;
  return { line: `${size}${touch ? ' (touch)' : ''}: ${boxes}`, problems };
}

/** The host sets the duel up in its menu: the battleground, the rounds that win it and whether gear counts. */
export function coopDuelSetUp(_lab: Lab, set: { ground: string; wins: number; gear: boolean; size?: 1 | 2 }): void {
  openMenu();
  if (set.size) press('#pvp-size', String(set.size));
  press('#pvp-ground', set.ground);
  press('#pvp-wins', String(set.wins));
  press('#pvp-gear', set.gear ? 'own' : 'none');
}

/** This game's player's part in the duel as set up ('0', '1' or 'watch'; '' with none). */
export function coopDuelPart(): string {
  const part = duels?.duelSetup.parts.get(G.player.slot);
  return part === undefined ? '' : String(part);
}

/** The menu's button pressed: the guest's Ready, the host's Begin. */
export function coopDuelGo(): void {
  openMenu();
  $<HTMLButtonElement>('#pvp-go')?.click();
}

/** The duel as this game has it this frame (null: none): its turn and score, its own hero and its rival as its screen
 *  shows him, and what its HUD says. */
export interface DuelNow {
  round: number; phase: string; score: [number, number]; winner: number | null;
  side: number | null;
  life: number; maxLife: number; alive: boolean; truce: boolean;
  rivalLife: number; rivalAlive: boolean;
  /** the rivals standing among this game's foes, and every other foe (a duel has none) */
  rivals: number; foes: number;
  scoreShown: string; resultShown: string;
  /** whether this game's own hero is drawn (a watcher's isn't), and the hero its camera follows while it watches */
  heroShown: boolean; watching: string;
}

export function duelNow(): DuelNow | null {
  const duel = duels?.duelOn();
  if (!duel) return null;
  const rival = G.players.find((player) => !player.local);
  const standIns = G.enemies.filter((foe) => (foe as { standIn?: boolean }).standIn);
  const result = $('#duel-result');
  return {
    round: duel.round, phase: duel.phase, score: [...duel.score], winner: duel.winner,
    side: duels!.sideOf(G.player, duel),
    life: G.player.life, maxLife: G.player.stats.maxLife, alive: G.player.alive, truce: G.player.truce,
    rivalLife: rival?.life ?? 0, rivalAlive: rival?.alive ?? false,
    rivals: standIns.length, foes: G.enemies.length - standIns.length,
    heroShown: G.player.obj.visible,
    watching: $('#spectate') && !$('#spectate')!.classList.contains('hidden') ? ($('#spectate')!.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) : '',
    scoreShown: $('#duel-score .ds-points')?.textContent ?? '',
    resultShown: result && !result.classList.contains('hidden') ? $('#duel-result .dr-title')?.textContent ?? '' : '',
  };
}

/** What this game's hero does in the round: nothing, or strikes at its rival. */
const play = { strikes: false, heldWhole: false };

/** where the heroes stand for a round's blows: a few strides apart in the open (the lab's own spot, clear of props) */
const SPOTS: Record<'host' | 'guest', [number, number]> = { host: [10.5, 22], guest: [13.5, 22] };
/** the life the round's loser is down to as it's struck (its own game's to say) */
const LITTLE_LIFE = 12;
/** the frames between the striker's blows, and how many of them the button is held */
const STRIKE_EVERY = 30;
const STRIKE_HELD = 3;

/**
 * A round's blows set up on this page, once the round is being fought: its hero on his spot facing his rival, down to
 * a little life if he's to lose it (`weak`), striking if he's to win it (`strikes`). `heldWhole` is the canary: the
 * weak hero's life put back every frame, so no blow ever shows.
 */
export function coopDuelRound(lab: Lab, set: {
  role: 'host' | 'guest'; strikes: boolean; weak: boolean; heldWhole?: boolean;
  faceAway?: boolean;
  /** a party's: where this hero stands and the spot he faces, in place of the pair's two spots */
  spot?: [number, number]; faces?: [number, number];
}): void {
  const [x, z] = set.spot ?? SPOTS[set.role], [rx, rz] = set.faces ?? SPOTS[set.role === 'host' ? 'guest' : 'host'];
  const facing = Math.atan2(rx - x, rz - z) + (set.faceAway ? Math.PI : 0);
  G.player.place(new THREE.Vector3(x, 0, z), facing);
  if (set.weak) G.player.life = LITTLE_LIFE;
  play.strikes = set.strikes;
  play.heldWhole = !!set.heldWhole;
  if (set.heldWhole && !lab.beforeFrame.includes(holdWhole)) lab.beforeFrame.push(holdWhole);
}

function holdWhole(): void {
  if (play.heldWhole && duels?.duelOn()) G.player.life = G.player.stats.maxLife;
}

/** A fixed, non-critical arcane hit on the actual rival. The usual duel transport carries the hit. */
export function coopDuelDeal(_lab: Lab, set: { amount: number; oldRate?: boolean }): void {
  const rival = G.enemies.find((foe) => foe.standIn && foe.alive && !foe.invulnerable);
  if (duels?.duelOn()?.phase !== 'fight' || !rival) throw new Error('lab: no targetable rival in the duel');
  const { PVP } = balance;
  const rate = PVP.damage;
  try {
    if (set.oldRate) PVP.damage = 0.25;
    rival.takeDamage(set.amount, { type: 'arcane', by: G.player });
  } finally {
    PVP.damage = rate;
  }
}

/** Read damage applied on this page after mitigation. The total excludes passive health regeneration. */
export function coopDuelTaken() {
  const hero = G.player;
  const shieldCanBlock = hero.gear.shield && hero.stats.blockAmount > 0;
  if (!hero.gearless || hero.ward || hero.frenzy || shieldCanBlock) {
    throw new Error('lab: unexpected mitigation in the gearless duel');
  }
  return { taken: mine.taken, maxLife: hero.stats.maxLife, resist: hero.stats.resist, alive: hero.alive };
}

/** This game's hero's input in a duel's round (null: no duel being fought, or he only stands): a tap of his first
 *  skill every so often, aimed at his rival where this screen shows him. */
export function duelInput(frame: number): Frame | null {
  const duel = duels?.duelOn();
  if (!duel) return null;
  if (!play.strikes || duel.phase !== 'fight' || !G.player.alive) return {};
  // (the nearest rival still standing, as this game has them among its foes: in a party the others are not all rivals)
  const far = (foe: { pos: THREE.Vector3 }): number => foe.pos.distanceTo(G.player.pos);
  const rival = G.enemies.filter((foe) => (foe as { standIn?: boolean }).standIn && foe.alive).sort((a, b) => far(a) - far(b))[0];
  if (!rival) return {};
  const aim = rival.pos.clone();
  aim.y = rival.height * 0.6;
  return { aim, m0: frame % STRIKE_EVERY < STRIKE_HELD };
}
