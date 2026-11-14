// `lab coop --scenarios duel` on a page (node/coopDuel.mjs plays and judges it): a duel set up in the weapons rack's
// menu as a player sets it up (its own buttons), readied by the guest and begun by the host, then fought: each round
// the two heroes stand a few strides apart, one of them down to a little life (its own game's to say) and the other
// striking at it with its first skill, aimed where its own screen shows its rival.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { VILLAGE_OBJECTS } from '../../../src/data/village';
import { showVillageCard } from '../../../src/ui/villageCard';
import type { Frame, Lab } from './lab';

/** the game's duel, where the tree has one (an older tree has none) */
type DuelModule = typeof import('../../../src/game/duel');
const duels = Object.values(import.meta.glob<DuelModule>('../../../src/game/duel.ts', { eager: true }))[0];

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

/** The duel's menu as this page shows it: what each row has chosen, who stands where, its line and its button. */
export interface DuelMenu {
  ground: string; size: string; wins: string; gear: string;
  sides: string[][];
  note: string; button: string; disabled: boolean;
}

export function coopDuelMenu(): DuelMenu {
  openMenu();
  const chosen = (row: string): string => $(`${row} button.active`)?.dataset.v ?? '';
  const names = (part: string): string[] =>
    [...document.querySelectorAll<HTMLElement>(`#pvp-sides [data-part="${part}"] .pvp-player`)]
      .map((button) => `${button.textContent}${button.classList.contains('ready') ? ' (ready)' : ''}`);
  const go = $<HTMLButtonElement>('#pvp-go');
  return {
    ground: chosen('#pvp-ground'), size: chosen('#pvp-size'), wins: chosen('#pvp-wins'), gear: chosen('#pvp-gear'),
    sides: ['0', '1', 'watch'].map(names),
    note: $('#pvp-note')?.textContent ?? '', button: go?.textContent ?? '', disabled: go?.disabled ?? true,
  };
}

/** The host sets the duel up in its menu: the battleground, the rounds that win it and whether gear counts. */
export function coopDuelSetUp(_lab: Lab, set: { ground: string; wins: number; gear: boolean }): void {
  openMenu();
  press('#pvp-ground', set.ground);
  press('#pvp-wins', String(set.wins));
  press('#pvp-gear', set.gear ? 'own' : 'none');
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
export function coopDuelRound(lab: Lab, set: { role: 'host' | 'guest'; strikes: boolean; weak: boolean; heldWhole?: boolean }): void {
  const [x, z] = SPOTS[set.role], [rx, rz] = SPOTS[set.role === 'host' ? 'guest' : 'host'];
  G.player.place(new THREE.Vector3(x, 0, z), Math.atan2(rx - x, rz - z));
  if (set.weak) G.player.life = LITTLE_LIFE;
  play.strikes = set.strikes;
  play.heldWhole = !!set.heldWhole;
  if (set.heldWhole && !lab.beforeFrame.includes(holdWhole)) lab.beforeFrame.push(holdWhole);
}

function holdWhole(): void {
  if (play.heldWhole && duels?.duelOn()) G.player.life = G.player.stats.maxLife;
}

/** This game's hero's input in a duel's round (null: no duel being fought, or he only stands): a tap of his first
 *  skill every so often, aimed at his rival where this screen shows him. */
export function duelInput(frame: number): Frame | null {
  const duel = duels?.duelOn();
  if (!duel) return null;
  if (!play.strikes || duel.phase !== 'fight' || !G.player.alive) return {};
  const rival = G.players.find((player) => !player.local);
  if (!rival) return {};
  const aim = rival.pos.clone();
  aim.y = rival.model.height * 0.6;
  return { aim, m0: frame % STRIKE_EVERY < STRIKE_HELD };
}
