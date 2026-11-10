// tools/lab's cloud saves (`npm run lab -- cloud`): a device's side of the check, in its page. Its save slots seeded as
// the game keeps them (src/loot/slotData.ts: a slot's every entry written as one), each hero told apart by the ids of
// the items in his stash (a tag each, `A2-mage`), a hero's stash added to as play does (`saveProfile`, which touches
// the cloud's sync), the cloud's state and the dialog as the player sees them, and the bar and the dialog held to the
// window (src/ui/AGENTS.md: nothing past its edges, nothing over another). The node side drives the screens
// (tools/lab/node/cloud.mjs).
import { CLASS_IDS } from '../../../src/data/classes/index';
import { CLASS_ENTRY, readHero, writeSlot, type Entries } from '../../../src/loot/slotData';
import { loadProfile, peekProfile, saveProfile } from '../../../src/loot/profile';
import { SAVE_SLOTS } from '../../../src/loot/saveSlots';
import * as cloud from '../../../src/loot/cloud';
import { G } from '../../../src/state';
import type { Item, Profile } from '../../../src/types';

/** a slot's heroes, by class: the tag of each item in his stash */
export type SlotHeroes = Record<string, string[]>;

/** each slot's heroes, by its number */
export type Slots = Record<number, SlotHeroes>;

/** the profile's entry, as slot 1 names it (slotData.ts names every entry so) */
const profileEntry = (classId: string): string => `last-stand.profile.${classId}.v1`;

/** A hero's profile as a fresh one is made, with his stash holding `tags` alone (each a copy of an item he wears). */
function heroWith(classId: string, tags: string[]): Profile {
  const profile = structuredClone(loadProfile(classId));
  const worn = Object.values(profile.equipped).find((item): item is Item => Boolean(item));
  if (!worn) throw new Error(`lab: cloud: a fresh ${classId} wears nothing to copy into his stash`);
  profile.stash = tags.map((tag) => ({ ...structuredClone(worn), id: tag }));
  return profile;
}

/** Every slot written as `slots` gives it (a slot not given left empty), its class the first hero's. */
export function cloudSeed(slots: Slots): void {
  for (const slot of SAVE_SLOTS) {
    const heroes = slots[slot] ?? {};
    const entries: Entries = {};
    for (const [classId, tags] of Object.entries(heroes)) {
      entries[profileEntry(classId)] = JSON.stringify(heroWith(classId, tags));
    }
    const first = Object.keys(heroes)[0];
    if (first) entries[CLASS_ENTRY] = first;
    writeSlot(slot, entries);
  }
}

/** A slot's heroes, from what it holds now. */
function heroesIn(slot: number): SlotHeroes {
  const heroes: SlotHeroes = {};
  for (const classId of CLASS_IDS) {
    const profile = peekProfile(classId, slot);
    if (profile) heroes[classId] = profile.stash.map((item) => item.id);
  }
  return heroes;
}

/** Every slot's heroes, from what this device holds now. */
export function cloudSlots(): Slots {
  const slots: Slots = {};
  for (const slot of SAVE_SLOTS) slots[slot] = heroesIn(slot);
  return slots;
}

/** An item tagged `tag` added to slot 1's hero of `classId`, saved as play saves it (the cloud's sync touched). */
export function cloudAddItem({ classId, tag }: { classId: string; tag: string }): void {
  const entries = readHero(classId, 1);
  const stored = entries[profileEntry(classId)];
  if (!stored) throw new Error(`lab: cloud: slot 1 has no ${classId} to add ${tag} to`);
  const profile = JSON.parse(stored) as Profile;
  const worn = Object.values(profile.equipped).find((item): item is Item => Boolean(item));
  if (!worn) throw new Error(`lab: cloud: slot 1's ${classId} wears nothing to copy`);
  profile.stash.push({ ...structuredClone(worn), id: tag });
  // (saveProfile writes the slot in play's: slot 1, which the lab's boot plays)
  saveProfile({ ...profile, classId });
}

/** What the device shows of the cloud: its state, the dialog's, and the game's mode (a download waits for the
 *  lobby). */
export interface CloudState {
  status: string;
  message: string;
  accountId: string;
  lastSync: number;
  linked: boolean;
  pending: number;
  token: string;
  dialog: { open: boolean; title: string; text: string; buttons: string[] };
  savesOpen: boolean;
  /** the bar's Account dropdown is open */
  menuOpen: boolean;
  mode: string;
}

export function cloudState(): CloudState {
  const shown = cloud.cloudStatus();
  const box = document.getElementById('cloud-dialog')!;
  const buttons = [...box.querySelectorAll<HTMLElement>('.dc-buttons button')].map(textOf);
  return {
    ...shown,
    linked: cloud.linked(),
    pending: cloud.pendingConflicts().length,
    token: keptToken(),
    dialog: {
      open: !box.classList.contains('hidden'),
      title: box.querySelector('.sm-title')?.textContent ?? '',
      text: (box.querySelector('.cd-body') as HTMLElement | null)?.innerText ?? '',
      buttons,
    },
    savesOpen: !document.getElementById('saves')!.classList.contains('hidden'),
    menuOpen: document.querySelector('#saves .sc-more[open]') !== null,
    mode: G.mode,
  };
}

const textOf = (element: Element): string => element.textContent ?? '';

/** the session's token the device keeps (src/loot/cloud.ts's `last-stand.cloud.v1`), '' while signed out */
function keptToken(): string {
  try {
    const kept = JSON.parse(localStorage.getItem('last-stand.cloud.v1') ?? 'null') as { token?: string } | null;
    return kept?.token ?? '';
  } catch {
    return '';
  }
}

/** A sign-in code made by this device's session, as Sign in elsewhere makes it (that button shows on production
 *  alone, `onProduction` in src/ui/cloudSaves.ts, and the lab's page is localhost). */
export async function cloudMakeCode(): Promise<string> {
  const { code } = await cloud.makeLinkCode();
  return code;
}

/** the parts of the screen a box of the bar or the dialog may not lie over, beside its own siblings */
const BAR_NEIGHBOURS = ['#saves .sv-back', '#saves .sv-title', '#saves .sv-panes'];

/** A shown element's box, or null if it shows nothing. */
function boxOf(element: Element): DOMRect | null {
  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  if (getComputedStyle(element).visibility === 'hidden') return null;
  return box;
}

const overlap = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** How far a box lies past the window's edges, css px (0: within it). */
function pastWindow(box: DOMRect): number {
  return Math.max(0, -box.left, -box.top, box.right - innerWidth, box.bottom - innerHeight);
}

/** A short name for an element in a report. */
function nameOf(element: Element): string {
  const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const kind = element.className ? `.${String(element.className).split(' ').filter(Boolean).join('.')}` : '';
  return `${element.tagName.toLowerCase()}${kind}${text ? ` "${text}"` : ''}`;
}

/** Each of `elements` within the window and over none of the others: the problems found. */
function fitOf(where: string, elements: Element[]): string[] {
  const problems: string[] = [];
  const shown = elements.map((element) => ({ element, box: boxOf(element) }))
    .filter((entry): entry is { element: Element; box: DOMRect } => entry.box !== null);
  for (const { element, box } of shown) {
    const past = pastWindow(box);
    if (past > 0.5) problems.push(`${where}: ${nameOf(element)} reaches ${past.toFixed(0)} px past the window`);
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      if (!overlap(shown[i].box, shown[j].box)) continue;
      problems.push(`${where}: ${nameOf(shown[i].element)} lies over ${nameOf(shown[j].element)}`);
    }
  }
  return problems;
}

/** The bar and, if open, the dialog held to the window: each part within it and over no other. */
export function cloudFit(): { lines: string[]; problems: string[] } {
  const bar = document.querySelector('#saves .sv-cloud')!;
  const row = [...bar.querySelectorAll('.sc-row > *')];
  const neighbours = BAR_NEIGHBOURS.flatMap((selector) => [...document.querySelectorAll(selector)]);
  const problems = [...fitOf('the bar', row), ...fitOf('the bar among the screen', [bar, ...neighbours])];
  const box = document.getElementById('cloud-dialog')!;
  const lines = [`bar ${boxText(bar)}`];
  const menu = document.querySelector('#saves .sc-more[open] .sc-menu');
  if (menu) {
    problems.push(...fitOf('the Account menu', [menu]), ...fitOf('the Account menu\'s buttons', [...menu.children]));
    lines.push(`Account menu ${boxText(menu)}`);
  }
  if (!box.classList.contains('hidden')) {
    const panel = box.querySelector('.modal-box')!;
    const parts = [...panel.children];
    const inner = [...panel.querySelectorAll('.dc-buttons button, .cd-slot, .cd-side, .cd-code')];
    const buttons = [...panel.querySelectorAll('.dc-buttons button')];
    problems.push(...fitOf('the dialog', [panel]), ...fitOf('the dialog\'s parts', parts));
    problems.push(...fitOf('the dialog\'s controls', inner), ...fitOf('the dialog\'s buttons', buttons));
    lines.push(`dialog ${boxText(panel)}`);
  }
  return { lines, problems };
}

/** A box as a share of the window: where it starts and how large it is, in %. */
function boxText(element: Element): string {
  const box = element.getBoundingClientRect();
  const share = (value: number, of: number): string => `${Math.round((value / of) * 100)}%`;
  return `at ${share(box.left, innerWidth)},${share(box.top, innerHeight)} `
    + `${share(box.width, innerWidth)}x${share(box.height, innerHeight)}`;
}
