// Training grounds (#405): exercise the lobby and controller against a real normal-run damage control. The
// village's way in is the ghost by the training yard's gate (`src/game/ghost.ts`): talked to by E, its card picks
// a battleground and a wave reached.
import type { Lab, Report, Pictured } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { holdHour } from '../../../src/game/clock';
import { villageObject } from '../../../src/game/village';
import { ghostShown } from '../../../src/game/ghost';
import { groundHeight } from '../../../src/world/ground';
import { startRun, abandonRun, updateRun, gainLoot, hostLeft } from '../../../src/game/run';
import { hurtPlayer, hitEnemy } from '../../../src/combat/damage';
import { clearEnemies } from '../../../src/entities/enemy';
import { loadProfile, saveProfile } from '../../../src/loot/profile';
import { renderMenu, renderLobbyOptions, selectedWave, trainingSelected } from '../../../src/ui/menus';
import type { DamageType } from '../../../src/types';

/** The command's deliberate fault must be found without leaving it in the game. */
export interface TrainingOptions {
  canary: boolean;
}

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const profileText = (): string => JSON.stringify(G.profile);
const shown = (selector: string): boolean => !element(selector).classList.contains('hidden');

/** The ghost by the yard's gate checked as the training grounds show a foe, and no foe of the game's. */
function ghostProblems(): string[] {
  const ghost = ghostShown();
  if (!ghost) return ['no ghost stands by the yard'];
  const problems: string[] = [];
  const u = ghost.model.kit.u;
  if (u.uDissolve.value < 0.28 || u.uFrozen.value < 0.3) problems.push(`the ghost (${ghost.kind}) looks solid`);
  if (Math.max(u.uEdge.value.r, u.uEdge.value.g, u.uEdge.value.b) >= 0.2) problems.push('the ghost glows too bright');
  if (!ghost.root.parent?.visible) problems.push('the ghost is not in the village shown');
  if (G.enemies.some((foe) => foe.model === ghost.model)) problems.push('the ghost is a foe skills can strike');
  return problems;
}

/** the hours the ghost is checked at, and the battleground's it must be then (from play: "for ghost, during daytime
 *  should be a forest mob, during night should be a crypt mob") */
const GHOST_HOURS: readonly { hour: number; biome: BiomeId }[] = [
  { hour: 12, biome: 'forest' },
  { hour: 0, biome: 'crypt' },
];

/** At each of `GHOST_HOURS`, the hour's ghost shown alone (`canary`: the other shown too at the first): what's
 *  wrong. */
async function ghostByTheHour(lab: Lab, canary: boolean): Promise<{ problems: string[]; lines: string[] }> {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const { hour, biome } of GHOST_HOURS) {
    holdHour(hour);
    await lab.step(2);
    const other = BIOME_IDS.find((id) => id !== biome)!;
    if (canary && hour === GHOST_HOURS[0].hour) ghostShown(other)!.root.visible = true;
    const shownNow = BIOME_IDS.filter((id) => ghostShown(id)?.root.visible);
    lines.push(`ghost at ${hour}:00: ${shownNow.map((id) => `${id} (${ghostShown(id)!.kind})`).join(', ') || 'none'}`);
    if (shownNow.length !== 1 || shownNow[0] !== biome) {
      problems.push(`at ${hour}:00 the ghost shown is ${shownNow.join(' and ') || 'none'}, not the ${biome}'s alone`);
    }
  }
  holdHour(null);
  await lab.step(2);
  return { problems, lines };
}

/** The ghost made solid for a moment (`--canary`): whether `ghostProblems` says so. */
function ghostCanaryCaught(): boolean {
  const u = ghostShown()?.model.kit.u;
  if (!u) return false;
  const dissolve = u.uDissolve.value;
  u.uDissolve.value = 0;
  const caught = ghostProblems().length > 0;
  u.uDissolve.value = dissolve;
  return caught;
}

/** The hero stood before the ghost and E pressed: its card, the training grounds', open. */
async function talkToGhost(lab: Lab): Promise<void> {
  const ghost = villageObject('ghost');
  if (!ghost) throw new Error('lab: training: the village has no ghost');
  const [x, z] = ghost.stand;
  lab.player.walkTo = null;
  lab.player.place(new lab.THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(15);
  await lab.step(1, () => ({ keys: ['e'] }));
  await lab.step(15);
}

/** Verify saved progression, mode controls and reward isolation on a fresh lab page. */
export async function training(lab: Lab, options: TrainingOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [];
  const moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  if (G.mode !== 'menu') throw new Error('training: the fresh page must begin in the lobby');

  // Seed the old shape, then load through the real migration. A global clear cannot unlock another biome.
  const biome = BIOME_IDS[0];
  const other = BIOME_IDS[1];
  G.profile.records.bestBanked = { [biome]: 2 };
  delete (G.profile.records as Partial<typeof G.profile.records>).bestReached;
  saveProfile(G.profile);
  G.profile = loadProfile(G.profile.classId);
  check(G.profile.records.bestReached[biome] === 2, 'migration lost the known banked wave');
  check(!G.profile.records.bestReached[other], 'migration invented progression in another biome');

  G.arena.setBiome(biome);
  startRun(4);
  check(G.profile.records.bestReached[biome] === 4, 'attempting a wave did not save it immediately');
  // A lethal normal blow is the control: training's later immunity cannot pass because damage is broken.
  lab.player.guardUntil = 0;
  const normalLife = lab.player.life;
  hurtPlayer(lab.player, 1e9);
  check(lab.player.life < normalLife, 'normal-run control took no damage');
  abandonRun();
  G.profile = loadProfile(G.profile.classId);
  check(G.profile.records.bestReached[biome] === 4, 'a failed wave was lost on profile reload');
  check(G.profile.records.bestBanked[biome] === 2, 'dying unlocked an ordinary arena start');
  lab.player.reset();
  lab.player.sandbox = true;
  renderMenu();
  check(selectedWave() === 2, 'Arena offered an unbanked wave');
  problems.push(...ghostProblems());
  const hours = await ghostByTheHour(lab, false);
  problems.push(...hours.problems);
  lines.push(...hours.lines);
  if (options.canary) {
    const hoursCaught = (await ghostByTheHour(lab, true)).problems.length > 0;
    check(hoursCaught, 'ghost hour canary was missed');
    lines.push(`ghost hour canary: ${hoursCaught ? 'caught' : 'missed'}`);
    const caught = ghostCanaryCaught();
    check(caught, 'ghost canary was missed');
    lines.push(`ghost canary: ${caught ? 'caught' : 'missed'}`);
  }
  holdHour(GHOST_HOURS[0].hour);
  await talkToGhost(lab);
  holdHour(null);
  check(G.arena.biome === GHOST_HOURS[0].biome, 'the ghost\'s card opened on another battleground than its own');
  check(shown('#vcard') && shown('#vcard .vc-grounds'), 'the ghost never opened the training grounds');
  check(trainingSelected(), 'the ghost left the training grounds unchosen');
  check(shown('#btn-start'), 'the training grounds offered no way in');
  check(element('#btn-start').textContent === 'Enter the Training Grounds', 'the way in is not the training grounds\'');
  // (the other battleground picked, where no wave was reached: its first offered, then back)
  await lab.clickOn(element(`#opt-biome [data-b="${other}"]`));
  check(G.arena.biome === other && selectedWave() === 1, 'the ghost\'s card never picked the other battleground');
  await lab.clickOn(element(`#opt-biome [data-b="${biome}"]`));
  check(G.arena.biome === biome, 'the ghost\'s card never picked the battleground back');
  check(selectedWave() === 4, 'Training did not offer the failed wave');
  moments.push(await lab.screen('training-lobby'));
  const before = profileText();
  await lab.clickOn(element('#btn-start'));
  await lab.until(() => G.mode === 'run' && Boolean(G.run?.training), 600, 'training never started');
  check(!lab.player.sandbox, 'training incorrectly granted free casts');
  const run = G.run!;
  check(run.wave === 4, 'training started a different wave');
  check(profileText() === before, 'starting training changed the saved profile');

  const damageTypes: DamageType[] = ['physical', 'arcane', 'fire', 'cold', 'lightning', 'vitality'];
  for (const type of damageTypes) {
    lab.player.guardUntil = 0;
    const life = lab.player.life;
    const ward = lab.player.ward;
    const dealt = hurtPlayer(lab.player, 100, type);
    check(dealt === 0 && lab.player.life === life && lab.player.ward === ward, `${type} hurt the training hero`);
  }
  if (options.canary) {
    run.training = false;
    lab.player.guardUntil = 0;
    const life = lab.player.life;
    hurtPlayer(lab.player, 100);
    const caught = lab.player.life < life;
    check(caught, 'damage canary was missed');
    lines.push(`damage canary: ${caught ? 'caught' : 'missed'}`);
    run.training = true;
    lab.player.life = lab.player.stats.maxLife;
  }

  // Real enemy spawn/kill events exercise both loot paths and the crowd uniforms.
  const foe = lab.spawnFoe('husk', new lab.THREE.Vector3(4, 0, 4));
  const isProjection = (): boolean => foe.model.kit.u.uDissolve.value >= 0.28
    && foe.model.kit.u.uFrozen.value > 0.3;
  check(isProjection(), 'newly spawned enemy appeared normal before its first update');
  let risingFrames = 0;
  let normalRisingFrames = 0;
  await lab.step(1);
  moments.push(await lab.screen('training-projection-spawning'));
  await lab.step(119, undefined, () => {
    if (foe.spawning <= 0) return;
    risingFrames++;
    if (!isProjection()) normalRisingFrames++;
  });
  check(risingFrames > 0, 'the projection spawn animation was never checked');
  check(normalRisingFrames === 0, 'enemy appeared normal during its spawn animation');
  check(foe.model.kit.u.uDissolve.value >= 0.28, 'projection has no screen-door dissolve');
  check(foe.model.kit.u.uFrozen.value > 0.3 && !foe.castsShadow, 'projection has an ordinary solid look');
  const edge = foe.model.kit.u.uEdge.value;
  check(Math.max(edge.r, edge.g, edge.b) < 0.2, 'projection glow is too bright');
  moments.push(await lab.screen('training-projection'));
  foe.invulnerable = false;
  hitEnemy(foe, 1e9, { by: lab.player, skill: lab.player.cls.skills[0] });
  check(!foe.alive, 'the projection could not be killed');
  check(run.score === 0 && run.bag.length === 0, 'a projection kill awarded score or loot');
  const item = Object.values(G.profile.equipped).find(Boolean)!;
  gainLoot(item);
  check(run.bag.length === 0, 'training accepted a late loot report');
  clearEnemies();
  run.phase = 'fighting';
  run.queue = [];
  run.boss = null;
  run.pending = 0;
  updateRun(0.1);
  check(String(run.phase) === 'cleared', 'training wave never cleared');
  await lab.step(35);
  check(run.bag.length === 0, 'training received scheduled wave rewards');
  check(element('.cont-label').textContent === 'Repeat wave 4', 'training offered an unreached next wave');
  check(element('.bank-label').textContent === 'Leave training', 'training offered banking rewards');
  moments.push(await lab.screen('training-cleared'));
  element('#decision .cont').click();
  updateRun(0.1);
  check(run.wave === 4 && String(run.phase) === 'countdown', 'repeat advanced beyond the selected wave');
  hostLeft();
  check(profileText() === before, 'training/disconnect changed the saved profile');
  const summaryTitle = element('#summary .sm-title').textContent;
  check(summaryTitle === 'Training Complete', 'training showed an ordinary reward summary');
  abandonRun();
  check(profileText() === before, 'abandoning training changed the saved profile');
  renderLobbyOptions();
  lines.push('migration, failed-wave reload, banked-only Arena and reached-wave Training: checked');
  lines.push('normal damage control, training damage types, projection kill, late loot and wave rewards: checked');
  lines.push('repeat, host disconnect and abandon: no score, loot or profile changes');
  return { text: lines.join('\n'), problems, moments };
}
