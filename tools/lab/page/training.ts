// Training grounds (#405): exercise the lobby and controller against a real normal-run damage control. The
// village's way in is the archery target by the training yard's gate (`src/world/archeryTarget.ts`): used by E, its
// card picks a battleground (the hour's first) and a wave reached.
import type { Lab, Report, Pictured } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { holdHour } from '../../../src/game/clock';
import { villageObject } from '../../../src/game/village';
import { groundHeight } from '../../../src/world/ground';
import { startRun, abandonRun, updateRun, gainLoot, hostLeft } from '../../../src/game/run';
import { hurtPlayer, hitEnemy } from '../../../src/combat/damage';
import { clearEnemies } from '../../../src/entities/enemy';
import { loadProfile, saveProfile } from '../../../src/loot/profile';
import { renderMenu, renderLobbyOptions, selectedWave, trainingSelected } from '../../../src/ui/menus';
import type { DamageType } from '../../../src/types';
import * as THREE from 'three';

/** The command's deliberate fault must be found without leaving it in the game. */
export interface TrainingOptions {
  canary: boolean;
}

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const profileText = (): string => JSON.stringify(G.profile);
const shown = (selector: string): boolean => !element(selector).classList.contains('hidden');

/** The archery target by the yard's gate, as the village shows it. */
const targetMesh = (): THREE.Object3D | undefined => G.arena.groupOf('village').getObjectByName('archery target');

/** The archery target checked: built, shown with the village, where its object is used, its face toward where he
 *  stands to use it, and no foe of the game's. */
function targetProblems(): string[] {
  const target = targetMesh();
  const object = villageObject('target');
  if (!target || !object) return ['no archery target stands by the yard'];
  const problems: string[] = [];
  let shownAll = true;
  for (let o: THREE.Object3D | null = target; o; o = o.parent) if (!o.visible) shownAll = false;
  if (!shownAll || !G.arena.groupOf('village').visible) problems.push('the archery target is not shown in the village');
  const at = target.getWorldPosition(new THREE.Vector3());
  const [x, z] = object.at;
  if (Math.hypot(at.x - x, at.z - z) > 0.3) problems.push('the archery target stands away from where it is used');
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(target.getWorldQuaternion(new THREE.Quaternion()));
  const [sx, sz] = object.stand;
  if (face.x * (sx - x) + face.z * (sz - z) <= 0) problems.push('the archery target turns its face away from its stand');
  if (G.enemies.some((foe) => foe.model.root === target)) problems.push('the archery target is a foe skills can strike');
  return problems;
}

/** the hours its card is opened at, and the battleground's it must open on then (from play: "for ghost, during
 *  daytime should be a forest mob, during night should be a crypt mob": the training grounds of the hour) */
const TARGET_HOURS: readonly { hour: number; biome: BiomeId }[] = [
  { hour: 12, biome: 'forest' },
  { hour: 0, biome: 'crypt' },
];

/** At each of `TARGET_HOURS`, the target used: its card on the hour's battleground (`canary`: the other battleground
 *  set as the first opens, as a card that ignored the hour would): what's wrong. */
async function targetByTheHour(lab: Lab, canary: boolean): Promise<{ problems: string[]; lines: string[] }> {
  const problems: string[] = [];
  const lines: string[] = [];
  for (const { hour, biome } of TARGET_HOURS) {
    holdHour(hour);
    await useTarget(lab);
    if (canary && hour === TARGET_HOURS[0].hour) G.arena.setBiome(BIOME_IDS.find((id) => id !== biome)!);
    lines.push(`target at ${hour}:00: its card on the ${G.arena.biome}`);
    if (G.arena.biome !== biome) problems.push(`at ${hour}:00 the target's card opened on the ${G.arena.biome}, not the ${biome}`);
    await lab.clickOn(element('#vcard .vc-close'));
    await lab.step(5);
    if (shown('#vcard')) throw new Error('lab: training: the target\'s card never closed');
  }
  holdHour(null);
  await lab.step(2);
  return { problems, lines };
}

/** The target hidden for a moment (`--canary`): whether `targetProblems` says so. */
function targetCanaryCaught(): boolean {
  const target = targetMesh();
  if (!target) return false;
  target.visible = false;
  const caught = targetProblems().length > 0;
  target.visible = true;
  return caught;
}

/** The hero stood before the target: pictured as he sees it there (`picture`), then E pressed: its card, the training
 *  grounds', open. */
async function useTarget(lab: Lab, picture?: Pictured[]): Promise<void> {
  const target = villageObject('target');
  if (!target) throw new Error('lab: training: the village has no archery target');
  const [x, z] = target.stand;
  lab.player.walkTo = null;
  const [tx, tz] = target.at;
  lab.player.place(new lab.THREE.Vector3(x, groundHeight(x, z), z), Math.atan2(tx - x, tz - z));
  await lab.step(15);
  if (picture) picture.push(await lab.screen('training-target'));
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
  problems.push(...targetProblems());
  const hours = await targetByTheHour(lab, false);
  problems.push(...hours.problems);
  lines.push(...hours.lines);
  if (options.canary) {
    const hoursCaught = (await targetByTheHour(lab, true)).problems.length > 0;
    check(hoursCaught, 'target hour canary was missed');
    lines.push(`target hour canary: ${hoursCaught ? 'caught' : 'missed'}`);
    const caught = targetCanaryCaught();
    check(caught, 'target canary was missed');
    lines.push(`target canary: ${caught ? 'caught' : 'missed'}`);
  }
  holdHour(TARGET_HOURS[0].hour);
  await useTarget(lab, moments);
  holdHour(null);
  check(G.arena.biome === TARGET_HOURS[0].biome, 'the target\'s card opened on another battleground than the hour\'s');
  check(shown('#vcard') && shown('#vcard .vc-grounds'), 'the target never opened the training grounds');
  check(trainingSelected(), 'the target left the training grounds unchosen');
  check(shown('#btn-start'), 'the training grounds offered no way in');
  check(element('#btn-start').textContent === 'Enter the Training Grounds', 'the way in is not the training grounds\'');
  // (the other battleground picked, where no wave was reached: its first offered, then back)
  await lab.clickOn(element(`#opt-biome [data-b="${other}"]`));
  check(G.arena.biome === other && selectedWave() === 1, 'the target\'s card never picked the other battleground');
  await lab.clickOn(element(`#opt-biome [data-b="${biome}"]`));
  check(G.arena.biome === biome, 'the target\'s card never picked the battleground back');
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
