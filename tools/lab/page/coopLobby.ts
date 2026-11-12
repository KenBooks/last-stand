// `lab coop`'s way back to the lobby after the scenarios, as players take it: each leaves the run from the pause menu
// (Leave the run held, as a player holds it), returns to the lobby from the summary once the run is over, and
// practises there (its panels stowed, in the village's training yard). The lobby's skill bar must then show on every game: after a co-op run, the
// HUD kept the run's "watching" look (its bars and skills hidden) through the lobby, and through the hero selection
// screen after it. Then the host opens the hall of heroes (Change hero) as the others cast in their lobbies: no partner
// may show in it, nor cast there (four in a room stood among the hall's heroes, a warrior's ward glowing over a
// plinth).
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as village_ from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { hallOpen } from '../../../src/game/hall';
import { isCoop } from '../../../src/net/role';
import { project } from '../../../src/ui/floaters';
import * as coopUi from '../../../src/ui/coop';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { ABANDON_HOLD_MS, showPause, toggleMenuStowed } from '../../../src/ui/menus';
import { realWait, type Frame, type Lab } from './lab';

/** how much longer than its hold Leave the run is held (ms): its timer runs on the browser's clock */
const HOLD_SLACK_MS = 300;

/** The middle of `element` on the page (css px). */
function middleOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** This game's player leaves the run from the pause menu, Leave the run held through as a player holds it. */
export async function coopLeaveRun(lab: Lab): Promise<void> {
  showPause(true);
  const button = document.getElementById('btn-abandon')!;
  const at = middleOf(button);
  await lab.mouseDown(at);
  await realWait(ABANDON_HOLD_MS + HOLD_SLACK_MS);
  await lab.mouseUp(at);
  if (!G.player.out) throw new Error('lab: coop: Leave the run held through, the player is still in the run');
}

/** The summary's button clicked as a player clicks it (back to the lobby once the run is over). */
export async function coopSummaryDone(lab: Lab): Promise<void> {
  const button = document.getElementById('btn-summary')!;
  if (document.getElementById('summary')!.classList.contains('hidden')) {
    throw new Error('lab: coop: no summary shown to go back to the lobby from');
  }
  await lab.clickOn(button);
}

/**
 * The lobby stowed into practice, as Space and a phone's Practice stow it, and in the village the hero in its
 * training yard, where the dummies stand (anywhere else a hero isn't armed, and its lobby is never practice).
 */
export function practiseInTheYard(): void {
  toggleMenuStowed(true);
  const village = village_ as { yardToWorld?: (x: number, z: number) => [number, number] };
  if (G.arena.place !== 'village' || !village.yardToWorld) return;
  const [x, z] = village.yardToWorld(0, 0);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
}

/** The lobby practised in again after the run (`practiseInTheYard`). */
export function coopPractiseAgain(): void {
  practiseInTheYard();
}

/** how often a partner casts in its lobby as the host's hall is open (frames) */
const CAST_EVERY = 30;

/** What the host's hall showed of its partners, frame by frame, while it was open. */
export interface HallSeen {
  open: boolean;
  /** the frames the hall was open, and those of them it showed a partner in, or had one casting */
  frames: number;
  shown: number;
  casting: number;
}

const hallSeen: HallSeen = { open: false, frames: 0, shown: 0, casting: 0 };
/** whether this game's hero casts in its lobby (a partner, as the host's hall is open) */
let castingInLobby = false;

/** This game's hero casts its first skill now and then in its lobby (on), or stops (off). */
export function coopCastInLobby(_lab: Lab, { on }: { on: boolean }): void {
  castingInLobby = on;
}

/** The input of lobby frame `frame` (`coopCastInLobby`), or null when this game's hero isn't casting there. */
export function lobbyCastInput(frame: number): Frame | null {
  if (!castingInLobby || G.mode !== 'menu') return null;
  return { keys: frame % CAST_EVERY === 0 ? [SKILL_KEYS[0]] : [] };
}

/** What this game's name tags showed, frame by frame: the heroes shown in the camera's view, and those without their
 *  tag drawn over them (in the lobby and in a run; "name tags sometimes appear, then disappear"). */
export interface TagsSeen {
  /** the frames in the lobby and in a run, and the heroes shown in them (a hero a frame) */
  lobbyFrames: number;
  runFrames: number;
  heroes: number;
  /** the heroes shown without their tag drawn, our own among them, and the first such: who, where and why */
  untagged: number;
  ownUntagged: number;
  first: string;
}

const tagsSeen: TagsSeen = { lobbyFrames: 0, runFrames: 0, heroes: 0, untagged: 0, ownUntagged: 0, first: '' };

/** Whether `player`'s hero is shown in the camera's view this frame (in its room, drawn, standing, ahead). */
function inView(player: (typeof G.players)[number]): boolean {
  if (player.away || !player.obj.visible || !player.alive) return false;
  const at = project(player.pos.x, player.obj.position.y + player.model.height, player.pos.z);
  return !at.behind && at.x >= 0 && at.y >= 0 && at.x <= window.innerWidth && at.y <= window.innerHeight;
}

/** Notes, a frame, each hero shown and whether its name tag is drawn over it. */
export function watchTags(): void {
  // (out of a room no game shows a tag, online only: a third asked to rename, and a fourth joining last, are out of
  // one for a while in their lobbies)
  if (hallOpen() || !isCoop()) return;
  if (G.mode === 'run') tagsSeen.runFrames++;
  else tagsSeen.lobbyFrames++;
  // (a tree with no tags over every hero has none of the game's to read: every hero counts as untagged)
  const labels = 'nameTagLabels' in coopUi ? coopUi.nameTagLabels() : [];
  for (const player of G.players.filter(inView)) {
    tagsSeen.heroes++;
    const tag = labels.find((entry) => entry.player === player)?.label;
    if (tag?.shown && tag.slot) continue;
    tagsSeen.untagged++;
    if (player.local) tagsSeen.ownUntagged++;
    const why = !tag ? 'no tag' : !tag.shown ? 'its tag hidden' : 'its tag with no slot in the atlas';
    tagsSeen.first ||= `${player.local ? 'our own' : `slot ${player.slot}'s`} in the ${G.mode}: ${why}`;
  }
}

/** What this game's name tags showed over the heroes. */
export function coopTagsSeen(): TagsSeen {
  return { ...tagsSeen };
}

/** Notes, a frame, what the hall shows of the partners while it's open. */
export function watchHall(): void {
  if (!hallOpen()) return;
  const partners = G.players.filter((p) => !p.local);
  hallSeen.frames++;
  if (partners.some((p) => p.obj.visible)) hallSeen.shown++;
  if (partners.some((p) => p.casting || p.channel)) hallSeen.casting++;
}

/** The hall of heroes opened as a player opens it (Change hero clicked: in the village, the pause menu's). */
export async function coopOpenHall(lab: Lab): Promise<void> {
  const button = document.getElementById('btn-hero');
  if (button && !button.checkVisibility()) showPause(true);
  if (!button) throw new Error('lab: coop: no Change hero button in the lobby');
  await lab.clickOn(button);
}

/** The hall left by its Back button. */
export async function coopCloseHall(lab: Lab): Promise<void> {
  const back = document.querySelector<HTMLElement>('.hs-back');
  if (!back) throw new Error('lab: coop: no Back button to leave the hall by');
  await lab.clickOn(back);
}

/** What the hall showed of the partners while it was open. */
export function coopHallSeen(): HallSeen {
  return { ...hallSeen, open: hallOpen() };
}

/** Whether `selector`'s element shows on the page (not hidden by itself or what holds it, nor empty). */
function shows(selector: string): boolean {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const box = element.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1;
}

/** What the lobby's practice shows of the run's bottom bar: the bar, and the skills in its hotbar. */
export interface LobbyBar {
  mode: string;
  practising: boolean;
  bar: boolean;
  skills: number;
  /** the HUD's classes, to say why it hid */
  hud: string;
}

/** The lobby's practice as this game shows it. */
export function coopLobbyBar(): LobbyBar {
  const skills = [...document.querySelectorAll('#hotbar > *')].filter((slot) => slot.checkVisibility()).length;
  return {
    mode: G.mode,
    practising: !G.player.sandbox,
    bar: shows('#bottombar'),
    skills,
    hud: document.getElementById('hud')!.className,
  };
}
