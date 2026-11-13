// A bank's wave kept and offered (#558, from play: "after banking the wave you banked on does not always save"): in
// the panels' lobby on Random, a hero with nothing banked enters by the lobby's own button, clears two waves and banks
// by the choice's own. The wave must be in the save as stored, under the battleground the dice rolled, and the lobby
// must offer it as the starting wave, before and after the hero is read back from the save (a reload's). Random then
// rolls only where that wave is unlocked, the other battleground shown out of the roll, and picked by itself the
// other still starts at its own first wave (a wave is unlocked where it was banked).
// A canary: the bank's record taken out of the save, which the same checks must find.
import type { Lab, Report, Pictured } from './lab';
import { G } from '../../../src/state';
import { VILLAGE } from '../../../src/core/beta';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { biomeSetting } from '../../../src/game/biome';
import { updateRun } from '../../../src/game/run';
import { clearEnemies } from '../../../src/entities/enemy';
import { loadProfile, peekProfile, saveProfile } from '../../../src/loot/profile';
import { saveSlot } from '../../../src/loot/saveSlots';
import { renderMenu, selectedWave } from '../../../src/ui/menus';

/** `--canary`: the record of the bank taken out of the save, which must be found. */
export interface BankOptions {
  canary: boolean;
}

/** the wave the run is banked at, from the first */
const BANKED_AT = 2;
/** how many runs Random starts at the banked wave: each must be in the battleground it was banked in */
const ROLLS = 6;

const element = (selector: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`lab: bank: the page has no ${selector}`);
  return found;
};

/** The wave fought to its end at once: no foes left and none to come, as its last falling leaves it. */
async function clearWave(lab: Lab): Promise<void> {
  const run = G.run!;
  clearEnemies();
  run.phase = 'fighting';
  run.queue = [];
  run.boss = null;
  run.pending = 0;
  updateRun(0.1);
  if (String(run.phase) !== 'cleared') throw new Error(`lab: bank: wave ${run.wave} never cleared`);
  // (its rewards counted into the bag, the choice grown out of the wave's badge)
  await lab.step(40);
}

/** A run entered by the lobby's button at the wave it offers: the battleground it is in. */
async function enter(lab: Lab): Promise<BiomeId> {
  await lab.clickOn(element('#btn-start'));
  await lab.until(() => G.mode === 'run' && G.run !== null, 900, 'the run never started');
  return G.arena.biome;
}

/** The run banked by the choice's button, and its summary closed (`summarized` first, on it): the lobby again. */
async function bankAndLeave(lab: Lab, summarized?: () => Promise<void>): Promise<void> {
  await lab.clickOn(element('#decision .bank'));
  await lab.until(() => !element('#summary').classList.contains('hidden'), 300, 'the bank showed no summary');
  await summarized?.();
  await lab.clickOn(element('#btn-summary'));
  await lab.until(() => G.mode === 'menu', 300, 'the summary never led back to the lobby');
  await lab.step(5);
}

/** What is wrong with the bank at `wave` in `biome` as the save and the lobby have it now. */
function bankProblems(biome: BiomeId, wave: number, when: string): string[] {
  const problems: string[] = [];
  const stored = peekProfile(G.profile.classId, saveSlot())?.records;
  if (stored?.bestBanked[biome] !== wave) {
    problems.push(`${when}: the save has wave ${stored?.bestBanked[biome] ?? 'none'} banked in the ${biome}, not ${wave}`);
  }
  if ((stored?.bestWave ?? 0) < wave) problems.push(`${when}: the save's best wave is ${stored?.bestWave}, under the ${wave} banked`);
  if (selectedWave() !== wave) problems.push(`${when}: the lobby offers wave ${selectedWave()} to start at, not the ${wave} banked`);
  const shown = element('#opt-wave .wv-val').textContent ?? '';
  if (!shown.includes(`Wave ${wave}`)) problems.push(`${when}: the starting wave reads "${shown}", not Wave ${wave}`);
  return problems;
}

/** The hero read back from the save, as a reload reads him, and the lobby drawn for him. */
function readBack(): void {
  G.profile = loadProfile(G.profile.classId);
  renderMenu();
}

/** Whether the checks find a bank whose record never reached the save (put back after). */
function canaryCaught(biome: BiomeId): boolean {
  const kept = JSON.stringify(G.profile);
  delete G.profile.records.bestBanked[biome];
  saveProfile(G.profile);
  readBack();
  const caught = bankProblems(biome, BANKED_AT, 'canary').length > 0;
  G.profile = JSON.parse(kept);
  saveProfile(G.profile);
  readBack();
  return caught;
}

/** A bank on Random: its wave in the save, offered by the lobby, and where the dice may land for it. */
export async function bank(lab: Lab, options: BankOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [];
  const moments: Pictured[] = [];
  if (G.mode !== 'menu') throw new Error('lab: bank: the fresh page must begin in the lobby');
  if (VILLAGE) throw new Error('lab: bank: Random is the panels\' lobby\'s (the command boots it: --panels)');

  // a hero with nothing banked anywhere, on Random
  G.profile.records.bestBanked = {};
  G.profile.records.bestReached = {};
  G.profile.records.bestWave = 0;
  saveProfile(G.profile);
  await lab.clickOn(element('#opt-biome [data-b="random"]'));
  await lab.until(() => biomeSetting() === 'random', 900, 'Random was never picked');
  renderMenu();
  if (selectedWave() !== 1) throw new Error(`lab: bank: a hero with nothing banked is offered wave ${selectedWave()}`);

  const biome = await enter(lab);
  const other = BIOME_IDS.find((id) => id !== biome)!;
  await clearWave(lab);
  await lab.clickOn(element('#decision .cont'));
  await lab.until(() => G.run!.wave === BANKED_AT && G.run!.phase === 'countdown', 300, 'Continue never led to the next wave');
  await clearWave(lab);
  moments.push(await lab.screen('bank-choice', [`wave ${BANKED_AT} cleared in the ${biome}: the choice`]));
  await bankAndLeave(lab, async () => { moments.push(await lab.screen('bank-summary', ['banked: the summary'])); });
  lines.push(`banked at wave ${BANKED_AT} in the ${biome} (Random's roll), nothing banked in the ${other}`);

  problems.push(...bankProblems(biome, BANKED_AT, 'back in the lobby'));
  moments.push(await lab.screen('bank-lobby', [`after banking wave ${BANKED_AT} in the ${biome} on Random: the starting wave offered`]));
  readBack();
  problems.push(...bankProblems(biome, BANKED_AT, 'read back from the save'));
  moments.push(await lab.screen('bank-read-back', ['the hero read back from the save, as a reload reads him']));
  lines.push(`the lobby offers wave ${selectedWave()} to start at ("${element('#opt-wave .wv-val').textContent}")`);

  if (options.canary) {
    const caught = canaryCaught(biome);
    if (!caught) problems.push('canary: a bank missing from the save was not found');
    lines.push(`canary (the bank's record out of the save): ${caught ? 'caught' : 'missed'}`);
  }

  // the dice at the banked wave: only where it is unlocked, the other shown out of the roll
  const faint = (id: BiomeId): boolean => element(`#opt-biome [data-b="${id}"]`).classList.contains('unrolled');
  if (!faint(other)) problems.push(`at wave ${BANKED_AT} the ${other} is not shown out of the dice's roll`);
  if (faint(biome)) problems.push(`at wave ${BANKED_AT} the ${biome} is shown out of the dice's roll`);
  const rolled: BiomeId[] = [];
  for (let i = 0; i < ROLLS; i++) {
    rolled.push(await enter(lab));
    if (G.run!.wave !== BANKED_AT) problems.push(`a run offered wave ${BANKED_AT} started at wave ${G.run!.wave}`);
    await clearWave(lab);
    await bankAndLeave(lab);
  }
  if (rolled.some((id) => id !== biome)) {
    problems.push(`starting at wave ${BANKED_AT}, Random rolled ${rolled.join(', ')}: the wave is unlocked in the ${biome} alone`);
  }
  lines.push(`${ROLLS} runs started at wave ${BANKED_AT} on Random: ${rolled.join(', ')}`);

  // a step down to the first wave: every battleground in the roll again
  await lab.clickOn(element('#opt-wave [data-d="-1"]'));
  if (selectedWave() !== 1) problems.push(`a step down from wave ${BANKED_AT} offers wave ${selectedWave()}`);
  if (BIOME_IDS.some(faint)) problems.push('at wave 1 a battleground is shown out of the dice\'s roll');

  // the other battleground picked by itself: nothing banked there, so its first wave (a wave is unlocked where banked)
  await lab.clickOn(element(`#opt-biome [data-b="${other}"]`));
  await lab.until(() => biomeSetting() === other, 900, `the ${other} was never picked`);
  if (selectedWave() !== 1) problems.push(`the ${other}, with nothing banked there, offers wave ${selectedWave()}`);
  await lab.clickOn(element(`#opt-biome [data-b="${biome}"]`));
  await lab.until(() => biomeSetting() === biome, 900, `the ${biome} was never picked`);
  if (selectedWave() !== BANKED_AT) problems.push(`the ${biome} picked by itself offers wave ${selectedWave()}, not the ${BANKED_AT} banked`);
  lines.push(`picked by itself: the ${other} starts at wave 1, the ${biome} at wave ${selectedWave()}`);
  return { text: lines.join('\n'), problems, moments };
}
