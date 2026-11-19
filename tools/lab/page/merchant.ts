// `lab merchant`: Odo's trade as a player makes it (`src/loot/merchant.ts`, its screen `src/ui/merchant.ts`, his shop
// `src/world/houses/merchant.ts`), and his prices against the drop rates. First the rates: for each rarity he sells, from the wave
// he sells it, a run's lesser gear must be worth no more than he asks for each piece of it the run drops (else trading
// beats playing), and no stock at any level holds anything above epic or a rarity before its wave. Then the trade: a
// hero of wave 6 given 40 commons, 6 rares and a legendary walks into the shop and presses E at the counter. The screen
// is up within the window, his full stock shown, the legendary not offered. His epic picked, one common short given:
// Trade held off, and the trade asked anyway refused, nothing changed. One more: Trade clicked, the commons gone, the
// epic in the stash, the stock one fewer, saved. His other epic: Auto-fill cheapest pays with a few rares, no epic, enough.
// Then three runs begun: a new stock, full again. `--canary` puts the epic back in his stock after the trade, which
// must be caught.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { RESTOCK_RUNS, STOCK_RARITIES, STOCKED_FROM, TRADED, type TradedRarity } from '../../../src/data/merchant';
import { HOUSES, outsideOf } from '../../../src/data/houses';
import { makeItem } from '../../../src/loot/items';
import { fewestFor, offer, price, stockedAs, stockOf, takes, trade, worth } from '../../../src/loot/merchant';
import { loadProfile } from '../../../src/loot/profile';
import { objectNear, villageObject } from '../../../src/game/village';
import { enterRoom } from '../../../src/game/rooms';
import { CLASSES } from '../../../src/data/classes/index';
import { groundHeight } from '../../../src/world/ground';
import type { BiomeId } from '../../../src/data/biomes';
import type { Item } from '../../../src/types';
import { roadTo, runDrops } from './merchantRates';
import { toVillage } from './village';

/** `--canary`: the piece bought put back in his stock. */
export interface MerchantOptions {
  canary: boolean;
}

/** the hero's best wave, and what his stash is given: commons, rares and a legendary of that level */
const WAVE = 6;
const COMMONS = 40;
const RARES = 6;
/** the frames a stand or a click settles for */
const SETTLE = 10;
/** the most pieces of one level the dearest ware may cost, against the stash's 60 places */
const MOST_PIECES = 30;
/** the runs whose drops are reported, and the biomes they're worked out in */
const RUNS_REPORTED = [1, 3, 5, 6, 8, 10, 15];
const BIOMES_RATED: BiomeId[] = ['crypt', 'forest'];
/** the rarities he sells above magic, whose road is checked */
const SOLD: TradedRarity[] = ['rare', 'epic'];

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const tileOf = (box: string, id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`#merchant ${box} .mc-item[data-id="${id}"]`);
const stashIds = (): string[] => G.profile.stash.map((it) => it.id);
const rankOf = (item: Item): number => TRADED.indexOf(item.rarity as TradedRarity);

/** The hero put at (x, z), facing `facing`, and let settle. */
async function stand(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  await lab.step(SETTLE);
}

/** Whether the trade screen's box lies within the window. */
function withinWindow(): boolean {
  const box = element('#merchant .mc-box').getBoundingClientRect();
  return box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
}

/** His prices against the drop rates: lines for the report, and a problem for any rarity he sells sooner than fair. */
function checkRates(lines: string[], problems: string[]): void {
  for (const biome of BIOMES_RATED) {
    for (const rarity of SOLD) {
      const perPiece = (last: number): string => roadTo(rarity, runDrops(biome, last)).lesserPerPiece.toFixed(1);
      const row = RUNS_REPORTED.map((last) => `${last}: ${perPiece(last)}`);
      const asks = roadTo(rarity, runDrops(biome, 1)).asks;
      lines.push(`${biome}, gear below ${rarity} a run drops for each ${rarity} (run to wave N), he asks ${asks}: `
        + row.join(', '));
      const from = STOCKED_FROM[rarity];
      const road = roadTo(rarity, runDrops(biome, from));
      if (road.lesserPerPiece > road.asks) {
        problems.push(`${biome}: from wave ${from} a ${rarity} asks ${road.asks}, but a run there drops `
          + `${road.lesserPerPiece.toFixed(1)} of lesser gear for each: trading is faster than playing`);
      }
    }
  }
  for (let level = 1; level <= 20; level++) {
    const sold = STOCK_RARITIES.map((rarity) => stockedAs(rarity, level));
    const early = sold.filter((rarity) => STOCKED_FROM[rarity] > level);
    if (early.length) problems.push(`at wave ${level} he sells ${early.join(', ')} before its wave`);
  }
}

/** The stash he's met with: commons and rares of the hero's level, and a legendary he mustn't take. */
function stashOf(): Item[] {
  const cls = CLASSES[G.profile.classId];
  const of = (rarity: Item['rarity'], count: number): Item[] =>
    Array.from({ length: count }, () => makeItem({ rarity, ilvl: WAVE, cls }));
  return [...of('common', COMMONS), ...of('rare', RARES), ...of('legendary', 1)];
}

/** `lab merchant`. */
/**
 * The trade screen's steps as they stand: `now` must be the one lit, those before it ticked, and the stash dimmed and
 * waiting while no ware is chosen (`waiting`), its hint saying so. `when` names the moment in the lines.
 */
function stepsAre(now: number, waiting: boolean, when: string, lines: string[], problems: string[]): void {
  if (!document.querySelector('#merchant .mc-give')) {
    problems.push(`${when}: the trade screen has no steps`);
    return;
  }
  const steps = [...document.querySelectorAll<HTMLElement>('#merchant .mc-step')];
  const lit = steps.filter((step) => step.classList.contains('now')).map((step) => Number(step.dataset.step));
  const done = steps.filter((step) => step.classList.contains('done')).map((step) => Number(step.dataset.step));
  const stashWaits = element('#merchant .mc-give').classList.contains('waiting');
  const hint = element('#merchant .mc-hint').textContent ?? '';
  lines.push(`${when}: step ${lit.join(',') || 'none'} lit, ${done.join(',') || 'none'} done, the stash `
    + `${stashWaits ? 'waiting' : 'open'} ("${hint}")`);
  if (lit.length !== 1 || lit[0] !== now) problems.push(`${when}: step ${lit.join(',') || 'none'} lit, not ${now}`);
  const doneWanted = Array.from({ length: now - 1 }, (_, i) => i + 1).join(',');
  if (done.join(',') !== doneWanted) problems.push(`${when}: steps ${done.join(',') || 'none'} ticked, not ${doneWanted || 'none'}`);
  if (stashWaits && !waiting) problems.push(`${when}: the stash still waits, dimmed`);
  if (!stashWaits && waiting) problems.push(`${when}: the stash is open with no ware chosen`);
}

/** Whether Odo stands at his desk serving (none in a commit without his day: then he always stands there). */
function odoAtDesk(): boolean {
  const odo = G.arena.rooms?.merchant?.odo?.();
  if (!odo?.life) return true;
  const { walker, shop } = odo.life;
  return odo.life.serving && walker.arrived && Math.hypot(walker.x - shop.desk.x, walker.z - shop.desk.z) < 0.05;
}

/** where Odo stands in the shop's room (its frame: shop.ts stands him there), and the height his face is pictured at */
const ODO_AT = { x: 0.1, fromBack: 0.85, face: 1.5 };

/**
 * Odo close, from his front, both sides and behind (each from 1.3 m, at his face's height), and the counter over the
 * shoulder as the player stands at it. Read by where shop.ts stands him, not by his parts, so a commit with another
 * Odo is pictured the same.
 */
function odoPictured(lab: Lab): Pictured[] {
  const room = G.arena.rooms?.merchant;
  if (!room) return [];
  const [, hz] = HOUSES.merchant.half;
  room.group.updateMatrixWorld(true);
  const at = room.group.localToWorld(new THREE.Vector3(ODO_AT.x, ODO_AT.face, -hz + ODO_AT.fromBack));
  // (the hero faces the counter, so his 'back' view looks at Odo's front)
  // (behind him stands the shop's back wall: a view from there sees the wall alone)
  const close = lab.picture('odo-close', ['back', 'left', 'right'], ['Odo from 1.3 m: his front and his sides'],
    { at, distance: 1.3 });
  const shoulder = lab.picture('odo-counter', ['third'], ['at the counter, over the shoulder']);
  return [close, shoulder];
}

export async function merchant(lab: Lab, options: MerchantOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  checkRates(lines, problems);
  await toVillage(lab);
  // (a hero of wave 1 meets no rare or epic)
  const p = G.profile = loadProfile(G.profile.classId);
  p.records.bestReached = { crypt: 1 };
  p.records.runs = 0;
  delete p.merchant;
  const first = stockOf(p).map((it) => it.rarity);
  lines.push(`a hero of wave 1 meets: ${first.join(', ')}`);
  if (first.some((rarity) => rarity !== 'magic')) problems.push(`a hero of wave 1 meets ${first.join(', ')}`);
  // (a hero of wave 6, his stash as `stashOf` gives it, no stock yet)
  p.records.bestReached = { crypt: WAVE };
  delete p.merchant;
  p.stash = stashOf();
  const legendary = p.stash.find((it) => it.rarity === 'legendary')!;
  // (into his shop by its door, to his counter)
  const out = outsideOf('merchant');
  await stand(lab, out.x, out.z, out.facing + Math.PI);
  const atDoor = objectNear()?.id ?? 'none';
  if (atDoor !== 'merchantDoor') problems.push(`at the shop's door the object near is ${atDoor}`);
  enterRoom('merchant');
  await lab.until(() => G.arena.room === 'merchant', 600, 'the shop never opened');
  const counter = villageObject('shopCounter')!;
  await stand(lab, counter.stand[0], counter.stand[1], Math.PI);
  moments.push(await lab.screen('merchant-shop'));
  if (objectNear() !== counter) problems.push(`at the counter the object near is ${objectNear()?.id ?? 'none'}`);
  // (Odo comes to his desk to serve the hero at his counter, finishing what he was doing first: his pictures once he's
  // there, the trade as the player meets it; taken at once they were of his empty desk)
  await lab.until(() => odoAtDesk(), 900, 'Odo never came to his desk for the hero at his counter');
  moments.push(...odoPictured(lab));
  await lab.step(1, () => ({ keys: ['e'] }));
  await lab.step(SETTLE);
  if (element('#merchant').classList.contains('hidden')) problems.push('E at the counter opened no trade screen');
  if (!withinWindow()) problems.push('the trade screen leaves the window');
  const stock = stockOf(p);
  const shownWares = document.querySelectorAll('#merchant .mc-wares .mc-item').length;
  lines.push(`stock: ${stock.map((it) => `${it.rarity} ${it.slot} lvl ${it.ilvl}`).join(', ')}`);
  if (stock.length !== STOCK_RARITIES.length) {
    problems.push(`his stock holds ${stock.length} pieces, not ${STOCK_RARITIES.length}`);
  }
  if (stock.some((it) => !takes(it))) problems.push('his stock holds a piece above epic');
  if (shownWares !== stock.length) problems.push(`the screen shows ${shownWares} of his ${stock.length} wares`);
  stepsAre(1, true, 'opened', lines, problems);
  await lab.mouseTo({ x: 2, y: 2 });
  await lab.step(2);
  moments.push(await lab.screen('merchant-step1', ['opened: step 1, choose one of his wares']));
  if (tileOf('.mc-stash', legendary.id)) problems.push('the stash offers him a legendary');
  const epics = stock.filter((it) => it.rarity === 'epic');
  if (epics.length < 2) {
    return { text: lines.join('\n'), problems: [...problems, 'his stock has no two epics'], moments };
  }
  const [epic, other] = epics;
  const common = p.stash.find((it) => it.rarity === 'common')!;
  const needed = Math.ceil(price(epic) / worth(common) - 1e-6);
  lines.push(`his epic (level ${epic.ilvl}) asks ${price(epic).toFixed(2)}: ${needed} commons of level ${WAVE}`);
  if (needed > MOST_PIECES) problems.push(`an epic costs ${needed} commons of its level, over ${MOST_PIECES}`);
  if (offer(p, epic, [legendary.id]).worth !== 0) problems.push('a legendary counts toward a trade');
  // (one short: Trade held off, and refused when asked anyway)
  await lab.clickOn(tileOf('.mc-wares', epic.id)!);
  await lab.step(2);
  // (the canary's plant: the stash left waiting, dimmed, once a ware is chosen)
  if (options.canary) document.querySelector('#merchant .mc-give')?.classList.add('waiting');
  stepsAre(2, false, 'a ware chosen', lines, problems);
  await lab.mouseTo({ x: 2, y: 2 });
  await lab.step(2);
  moments.push(await lab.screen('merchant-step2', ['a ware chosen: step 2, offer gear for it']));
  if (options.canary) document.querySelector('#merchant .mc-give')?.classList.remove('waiting');
  const commons = p.stash.filter((it) => it.rarity === 'common').map((it) => it.id);
  for (const id of commons.slice(0, needed - 1)) await lab.clickOn(tileOf('.mc-stash', id)!);
  await lab.step(2);
  const go = element('#merchant .mc-trade') as HTMLButtonElement;
  lines.push(`one short: "${element('#merchant .mc-sum').textContent}", Trade ${go.disabled ? 'held off' : 'offered'}`);
  if (!go.disabled) problems.push('Trade was offered one common short of his price');
  const short = document.querySelector('#merchant .mc-need')?.textContent ?? '';
  lines.push(`one short, the deal says: "${short}"`);
  if (!/more value needed/.test(short)) problems.push(`one short, the deal doesn't say what's missing: "${short}"`);
  const before = stashIds().join();
  if (trade(p, epic.id, commons.slice(0, needed - 1))) problems.push('a trade one common short was made');
  const changed = stashIds().join() !== before || stockOf(p).length !== stock.length;
  if (changed) problems.push('a refused trade changed the stash or the stock');
  // (one more: Trade offered, clicked)
  await lab.clickOn(tileOf('.mc-stash', commons[needed - 1])!);
  await lab.step(2);
  lines.push(`enough: "${element('#merchant .mc-sum').textContent}", Trade ${go.disabled ? 'held off' : 'offered'}`);
  moments.push(await lab.screen('merchant-trade'));
  if (go.disabled) problems.push('Trade was held off with enough given');
  stepsAre(3, false, 'enough given', lines, problems);
  await lab.clickOn(go);
  await lab.step(SETTLE);
  if (options.canary) G.profile.merchant!.stock.push(epic);
  const gone = commons.slice(0, needed).filter((id) => stashIds().includes(id)).length;
  const got = stashIds().includes(epic.id);
  const left = stockOf(G.profile).length;
  lines.push(`after the trade: ${gone} of the ${needed} given still in the stash, the epic ${got ? 'in' : 'not in'} it, `
    + `${left} wares left; the stash ${G.profile.stash.length}`);
  if (gone) problems.push(`${gone} of the commons given are still in the stash`);
  if (!got) problems.push('the epic bought is not in the stash');
  if (left !== stock.length - 1) {
    problems.push(`his stock holds ${left} after the trade, not ${stock.length - 1}`);
  }
  const saved = loadProfile(G.profile.classId);
  if (!saved.stash.some((it) => it.id === epic.id)) problems.push('the trade was not saved');
  // (his other epic: Auto-fill cheapest pays with the best of the lesser pieces, never the epic just bought)
  await lab.clickOn(tileOf('.mc-wares', other.id)!);
  await lab.clickOn(element('#merchant .mc-fill-best'));
  await lab.step(2);
  const picked = [...document.querySelectorAll<HTMLElement>('#merchant .mc-stash .mc-item.picked')]
    .map((tile) => G.profile.stash.find((it) => it.id === tile.dataset.id)!);
  const fewest = fewestFor(G.profile, other);
  const pickedRarities = picked.map((it) => it.rarity).join(', ');
  lines.push(`Auto-fill cheapest for his other epic (asks ${price(other).toFixed(2)}): `
    + `${picked.length} pieces (${pickedRarities}), "${element('#merchant .mc-sum').textContent}"`);
  moments.push(await lab.screen('merchant-fewest'));
  if (picked.length !== fewest.length) problems.push(`Auto-fill cheapest picked ${picked.length} tiles, not ${fewest.length}`);
  if (picked.some((it) => rankOf(it) >= rankOf(other))) problems.push('Auto-fill cheapest offered an epic for an epic');
  if (!offer(G.profile, other, fewest).enough) problems.push('Auto-fill cheapest gave less than he asks');
  if (picked.length > RARES + 1) {
    problems.push(`Auto-fill cheapest gave ${picked.length} pieces with ${RARES} rares at hand`);
  }
  // (three runs begun: he restocks, full again)
  const ids = stockOf(G.profile).map((it) => it.id).join();
  G.profile.records.runs += RESTOCK_RUNS;
  const fresh = stockOf(G.profile);
  const same = fresh.map((it) => it.id).join() === ids;
  lines.push(`after ${RESTOCK_RUNS} runs: ${fresh.length} wares, ${same ? 'the same' : 'new'}`);
  if (fresh.length !== STOCK_RARITIES.length) problems.push(`restocked, he holds ${fresh.length}`);
  if (fresh.some((it) => ids.split(',').includes(it.id))) problems.push('the restock kept old wares');
  await lab.step(1, () => ({ keys: ['e'] }));
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  const caughtStock = problems.some((line) => line.startsWith('his stock holds'));
  const caughtWaiting = problems.some((line) => line.includes('the stash still waits'));
  const caught = caughtStock && caughtWaiting;
  lines.push(`canary: ${caught ? 'caught' : 'missed'} (the piece bought put back in his stock: `
    + `${caughtStock ? 'found' : 'unseen'}; the stash left waiting with a ware chosen: ${caughtWaiting ? 'found' : 'unseen'})`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: a planted fault went unseen'], moments };
}
