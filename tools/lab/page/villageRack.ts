// `lab village`'s weapons rack (#406; from play: "Item you come up to to interact (open menu), is a weapons rack.
// Should also be added to map and work with self walking feature as well"). `rackOpensDuel`: the rack stands clear
// before the yard's fence, a body kept off it; sent to it from the square as a click on it sends him (`goUse`), he
// walks there and the duel's menu opens, every choice of it found by the mouse and inside the window; the map names
// it, and its name there walks him back to it; walked off, the menu is put away. Pictured from over the shoulder as he
// comes to it, with its menu open, and on the map. `canary` sends him to its stand as a place on the map is walked to
// (`goTo`), which uses nothing: the menu must not open.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { RACK, VILLAGE_OBJECTS, type Spot } from '../../../src/data/village';
import { faceCamera } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { goTo, goUse } from '../../../src/game/village';
import { setVillageMap, villageMapOpen } from '../../../src/ui/villageMap';
import { holdHour } from '../../../src/game/clock';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

const SETTLE = 60;
/** the frames a walk to the rack is given, and the map to unfold */
const WALK_FRAMES = 900;
const MAP_FRAMES = 90;
/** how far before the rack he's stood to be sent to it (m), and how far off it he's walked to leave it */
const SENT_FROM = 5.5;
const WALKED_OFF = 6;

const rack = VILLAGE_OBJECTS.find((object) => object.id === 'rack');
const card = (): HTMLElement | null => document.getElementById('vcard');
const menuOpen = (): boolean => Boolean(card()) && !card()!.classList.contains('hidden') && card()!.dataset.page === 'pvp';
const fromRack = (): number => Math.hypot(G.player.pos.x - RACK.x, G.player.pos.z - RACK.z);
/** a place `out` m before the rack, `aside` m along it */
const before = (out: number, aside = 0): Spot => [
  RACK.x + Math.sin(RACK.facing) * out + Math.cos(RACK.facing) * aside,
  RACK.z + Math.cos(RACK.facing) * out - Math.sin(RACK.facing) * aside,
];

/** The hero put at `spot`, still, looking at the rack, the camera behind him. */
async function standBefore(lab: Lab, spot: Spot): Promise<void> {
  const facing = Math.atan2(RACK.x - spot[0], RACK.z - spot[1]);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(spot[0], groundHeight(spot[0], spot[1]), spot[1]), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** What's wrong with the menu as shown: past the window, or a choice of it the mouse can't find. */
function menuProblems(): string[] {
  const problems: string[] = [];
  const box = card()!.getBoundingClientRect();
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) problems.push('rack: its menu reaches past the window');
  for (const row of ['#pvp-ground', '#pvp-size', '#pvp-wins']) {
    for (const button of document.querySelectorAll<HTMLElement>(`${row} button`)) {
      const at = button.getBoundingClientRect();
      const found = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
      if (found !== button) problems.push(`rack: its menu's ${row} "${button.textContent}" isn't found by the mouse`);
    }
    if (!document.querySelector(`${row} button.active`)) problems.push(`rack: its menu's ${row} has nothing chosen`);
  }
  return problems;
}

/** The rack walked to and used, its menu, its name on the map. */
export async function rackOpensDuel(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (!rack) return { lines: ['rack: the village has no weapons rack'], problems: ['rack: the village has no weapons rack'], caught: canary ? true : null, moments: [] };
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await viewBy(lab, 'third');
  // (by noon's light: pictured at the hour the lab was run, a night's rack was a shape in the dark)
  holdHour(12);
  try {
    return await sentToTheRack(lab, canary, problems, moments);
  } finally {
    holdHour(null);
  }
}

/** `rackOpensDuel`'s steps, at the hour it holds. */
async function sentToTheRack(lab: Lab, canary: boolean, problems: string[], moments: Pictured[]): Promise<LightsChecked> {
  const rack = VILLAGE_OBJECTS.find((object) => object.id === 'rack')!;
  await standBefore(lab, before(SENT_FROM, 1.6));
  if (canary) {
    goTo(rack.stand[0], rack.stand[1]);
    await lab.step(WALK_FRAMES / 2);
    const opened = menuOpen();
    G.player.walkTo = null;
    return { lines: [`rack: walked to as a place, its menu ${opened ? 'opened' : 'stayed shut'}`], problems: [], caught: !opened, moments: [] };
  }
  // (a body kept off it: walked straight at its middle, he stops short of it)
  const kept = G.arena.obstacles.filter((obstacle) => Math.hypot(obstacle.x - RACK.x, obstacle.z - RACK.z) < RACK.half);
  if (!kept.length) problems.push('rack: no obstacle keeps a body off it');
  moments.push(await lab.screen('rack before the yard', []));
  // (and close, from before it and from its side, him stood back out of the frame: its timber and each sword)
  await standBefore(lab, before(9));
  moments.push(lab.picture('rack close', ['back', 'left'], [], { at: new THREE.Vector3(RACK.x, 0.95, RACK.z), distance: 6.2 }));
  await standBefore(lab, before(SENT_FROM, 1.6));
  goUse(rack);
  let frames = 0;
  while (!menuOpen() && frames < WALK_FRAMES) { await lab.step(10); frames += 10; }
  await lab.step(SETTLE);
  const opened = menuOpen();
  const openedAt = fromRack();
  if (!opened) problems.push(`rack: sent to it, its menu never opened (he stands ${fromRack().toFixed(1)} m off it)`);
  else {
    if (fromRack() > rack.reach) problems.push(`rack: its menu opened ${fromRack().toFixed(1)} m off it, past its reach`);
    problems.push(...menuProblems());
    moments.push(await lab.screen('rack used, the duel menu', []));
  }
  // walked off, the menu goes
  const off = before(WALKED_OFF + 2);
  G.player.walkTo = new THREE.Vector3(off[0], 0, off[1]);
  await lab.until(() => fromRack() > WALKED_OFF || !G.player.walkTo, WALK_FRAMES, 'he never walked off from the rack');
  G.player.walkTo = null;
  await lab.step(SETTLE);
  const left = !menuOpen();
  if (!left) problems.push('rack: walked off from it, its menu stayed up');
  // the map names it; its name there walks him to it and uses it
  setVillageMap(true);
  await lab.step(MAP_FRAMES);
  const name = [...document.querySelectorAll<HTMLElement>('.vm-name')].find((button) => button.dataset.use === 'pvp');
  if (!name) problems.push('rack: the map has no name for it');
  moments.push(await lab.screen('rack on the map', []));
  if (name) {
    name.click();
    await lab.step(MAP_FRAMES);
    frames = 0;
    while (!menuOpen() && frames < WALK_FRAMES) { await lab.step(10); frames += 10; }
    if (!menuOpen()) problems.push('rack: its name on the map never brought him to its menu');
  }
  if (villageMapOpen()) setVillageMap(false);
  const leave = card()?.querySelector<HTMLElement>('.vc-close');
  if (menuOpen()) leave?.click();
  await lab.step(SETTLE);
  const line = `rack: ${kept.length} obstacles keep a body off it; sent to it, its menu ${opened ? `opened ${openedAt.toFixed(1)} m off it` : 'never opened'}`
    + `, ${left ? 'gone' : 'still up'} as he walked off; the map ${name ? 'names it and walks him there' : 'has no name for it'}`;
  return { lines: [line], problems, caught: null, moments };
}
