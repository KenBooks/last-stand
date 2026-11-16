// `lab merchant`: Odo's trade as a player makes it (`src/loot/merchant.ts`, its screen `src/ui/merchant.ts`, his shop
// `src/world/shop.ts`). The hero's stash given 25 commons of the first level; walked into the shop and E at the
// counter: the trade screen up within the window, his full stock shown. His epic picked by a click, one common short of
// what he asks given: Trade held off, and the trade asked anyway refused, nothing changed. One more common given: Trade
// clicked, the commons gone, the epic in the stash, the stock one fewer, saved. Then three runs begun: a new stock,
// full again. `--canary` puts the epic back in his stock after the trade, which the check must find.
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import { RESTOCK_RUNS, STOCK_RARITIES } from '../../../src/data/merchant';
import { outsideOf } from '../../../src/data/houses';
import { makeItem } from '../../../src/loot/items';
import { price, stockOf, trade } from '../../../src/loot/merchant';
import { loadProfile } from '../../../src/loot/profile';
import { objectNear, villageObject } from '../../../src/game/village';
import { enterRoom } from '../../../src/game/rooms';
import { CLASSES } from '../../../src/data/classes/index';
import { groundHeight } from '../../../src/world/ground';
import { toVillage } from './village';

/** `--canary`: the piece bought put back in his stock. */
export interface MerchantOptions {
  canary: boolean;
}

/** how many commons the stash is given, and the frames a stand or a click settles for */
const COMMONS = 25;
const SETTLE = 10;

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const tileOf = (box: string, id: string): HTMLElement => element(`#merchant ${box} .mc-item[data-id="${id}"]`);
const stashIds = (): string[] => G.profile.stash.map((it) => it.id);

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

/** `lab merchant`. */
export async function merchant(lab: Lab, options: MerchantOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await toVillage(lab);
  // (a hero of the first wave, 25 commons in his stash, no stock yet)
  const p = G.profile = loadProfile(G.profile.classId);
  const cls = CLASSES[p.classId];
  p.records.bestReached = { crypt: 1 };
  p.records.runs = 0;
  delete p.merchant;
  p.stash = Array.from({ length: COMMONS }, () => makeItem({ rarity: 'common', ilvl: 1, cls }));
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
  if (shownWares !== stock.length) problems.push(`the screen shows ${shownWares} of his ${stock.length} wares`);
  const epic = stock.find((it) => it.rarity === 'epic');
  if (!epic) return { text: lines.join('\n'), problems: [...problems, 'his stock has no epic'], moments };
  const needed = Math.ceil(price(epic) - 1e-6);
  lines.push(`his epic (level ${epic.ilvl}) asks ${price(epic).toFixed(2)}: ${needed} commons of the first level`);
  // (one short: Trade held off, and refused when asked anyway)
  await lab.clickOn(tileOf('.mc-wares', epic.id));
  const commons = stashIds();
  for (const id of commons.slice(0, needed - 1)) await lab.clickOn(tileOf('.mc-stash', id));
  await lab.step(2);
  const go = element('#merchant .mc-trade') as HTMLButtonElement;
  lines.push(`one short: "${element('#merchant .mc-sum').textContent}", Trade ${go.disabled ? 'held off' : 'offered'}`);
  if (!go.disabled) problems.push('Trade was offered one common short of his price');
  const before = stashIds().join();
  if (trade(p, epic.id, commons.slice(0, needed - 1))) problems.push('a trade one common short was made');
  const changed = stashIds().join() !== before || stockOf(p).length !== stock.length;
  if (changed) problems.push('a refused trade changed the stash or the stock');
  // (one more: Trade offered, clicked)
  await lab.clickOn(tileOf('.mc-stash', commons[needed - 1]));
  await lab.step(2);
  lines.push(`enough: "${element('#merchant .mc-sum').textContent}", Trade ${go.disabled ? 'held off' : 'offered'}`);
  moments.push(await lab.screen('merchant-trade'));
  if (go.disabled) problems.push('Trade was held off with enough given');
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
  const caught = problems.some((line) => line.startsWith('his stock holds'));
  lines.push(`canary: ${caught ? 'caught' : 'missed'} (the piece bought put back in his stock)`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: a planted fault went unseen'], moments };
}
