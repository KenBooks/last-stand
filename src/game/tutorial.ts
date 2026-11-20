// The village's tutorial (data/tutorial.ts lists its stations and steps; ui/training.ts shows the one under way in the
// training's tracker; the notice board starts it, ui/menus.ts): a station's steps taken in order, each ticked as the
// player does it, the next station following on. It's the player's own: nothing of it is sent, and in co-op it moves
// and holds nobody else. Kept in a cookie as the steps ever done, so the board says what's been walked; a station can
// be walked again from there. The sparring shade is its own too: a harmless foe of a first wave, in the training
// grounds' look, come up in the yard for the steps that need a foe that strikes, and gone with them.
import * as THREE from 'three';
import { G } from '../state';
import { emit, on } from '../events';
import { readCookie, writeCookie } from '../core/cookies';
import { SHADE, TUTORIAL, type Station, type StationId, type TutorialPlace, type TutorialStep, type TutorialStepId } from '../data/tutorial';
import type { VillageUse } from '../data/village';
import { YARD, yardToWorld } from '../data/village';
import { SKILL_KEYS } from '../loot/loadout';
import { setSparSink } from '../combat/damage';
import { spawnEnemy } from '../entities/spawner';
import type { Enemy } from '../entities/enemy';
import type { KnownSkill, Player } from '../entities/player';
import { groundHeight } from '../world/ground';
import { anchorLabel, floatText, textArt } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { OUTLINE } from '../ui/overlay/paint';
import { inYard, villageObject } from './village';
import { groundDrops } from './groundItems';
import { isWarm, want } from './warm';

const COOKIE = 'last-stand-tutorial';

/** the steps ever done (the board's ticks), and the station under way with how often its counted step was done */
const done = new Set<TutorialStepId>();
let station: Station | null = null;
let counted = 0;
/** the skills used for the step that counts them (each once) */
const used = new Set<string>();
/** whether the walk just ended: said by the tracker a moment (`tutorialFinished`) */
let finished = false;

const allSteps = TUTORIAL.flatMap((s) => s.steps);
const isStep = (s: string): s is TutorialStepId => allSteps.some((t) => t.id === s);

/** The skills on the hero's keys, as the gear held gives them. */
export const boundSkills = (p: Player = G.player): KnownSkill[] =>
  SKILL_KEYS.map((k) => p.skillAt(k)).filter((s): s is KnownSkill => !!s);

/** Whether `step` is this hero's to take: it teaches no skill, or one he has on a key. */
const forHero = (step: TutorialStep): boolean =>
  !step.skills || boundSkills().some((s) => step.skills!.includes(s.def.impl));

/** The steps of `s` this hero takes. */
export const stationSteps = (s: Station): TutorialStep[] => s.steps.filter(forHero);

/** Whether step `id` was ever done. */
export const tutorialStepDone = (id: TutorialStepId): boolean => done.has(id);

/** Whether every step of station `id` this hero takes was done. */
export const stationDone = (id: StationId): boolean =>
  stationSteps(TUTORIAL.find((s) => s.id === id)!).every((t) => done.has(t.id));

/** The station under way, or null. */
export const tutorialStation = (): Station | null => station;

/** The step to take now: the station's first not done. */
export function tutorialStep(): TutorialStep | null {
  return station ? stationSteps(station).find((t) => !done.has(t.id)) ?? null : null;
}

/** How far the step that counts has come (`TutorialStep.count`). */
export const tutorialCount = (): number => counted;

/** Whether the walk has just ended (until the tracker has said so: `tutorialSaid`). */
export const tutorialFinished = (): boolean => finished;
export function tutorialSaid(): void { finished = false; }

/** The tutorial as it was left: what was done before. No station is under way after a reload. */
export function initTutorial(): void {
  for (const s of (readCookie(COOKIE) ?? '').split(',')) if (isStep(s)) done.add(s);
  on('dummyHit', () => tutorialDid('strike'));
  on('itemThrown', () => tutorialDid('throw'));
  on('itemTaken', () => tutorialDid('take'));
  on('itemEquipped', () => tutorialDid('wear'));
  on('skillUsed', (impl) => skillUsed(impl));
  on('skillKeyPicked', () => tutorialDid('pick'));
  // (a skill dragged straight onto a key picks the key and binds it at once)
  on('skillBound', () => { tutorialDid('pick'); tutorialDid('bind'); });
  on('hallShown', () => tutorialDid('hall'));
  on('spoilsBanked', () => tutorialDid('bank'));
  setSparSink(sparred);
  marker = anchorLabel(ORDER.marker, markerAt, true);
  marker.ay = 1;
}

/** Station `id` begun, afresh: its steps to take again. */
export function startStation(id: StationId): void {
  station = TUTORIAL.find((s) => s.id === id)!;
  for (const t of station.steps) done.delete(t.id);
  finished = false;
  stepBegun();
  save();
  emit('tutorialChanged');
}

/** The whole walk begun again from its first station, every step to take afresh (the board's Walk it again). */
export function restartTutorial(): void {
  done.clear();
  startStation(TUTORIAL[0].id);
}

/** The tutorial left where it stands: what was done stays done. */
export function leaveTutorial(): void {
  if (!station) return;
  station = null;
  dismissShade();
  emit('tutorialChanged');
}

/** Step `id` done by the player: ticked if it's the one to take now (they're taken in order). */
export function tutorialDid(id: TutorialStepId): void {
  const step = tutorialStep();
  if (!step || step.id !== id) return;
  if (++counted < (step.count ?? 1)) { emit('tutorialChanged'); return; }
  done.add(id);
  stepBegun();
  if (!tutorialStep()) nextStation();
  save();
  emit('tutorialChanged');
}

/** The station's steps all taken: on to the next one not walked yet, or the walk's end. */
function nextStation(): void {
  const next = TUTORIAL.slice(TUTORIAL.indexOf(station!) + 1).find((s) => !stationDone(s.id));
  station = next ?? null;
  if (!station) { finished = true; dismissShade(); }
}

function stepBegun(): void {
  counted = 0;
  used.clear();
}

/** A skill cast by the hero: the draught's step, or one more of the other skills'. */
function skillUsed(impl: string): void {
  const step = tutorialStep();
  if (step?.id === 'draught' && impl === 'potion') tutorialDid('draught');
  if (step?.id !== 'skills' || impl === 'potion' || G.player.skillAt('mouse0')?.def.impl === impl || used.has(impl)) return;
  used.add(impl);
  tutorialDid('skills');
}

function save(): void { writeCookie(COOKIE, [...done].join(',')); }

/** What a village object the hero used has open now (its card or its dialog): the steps that ask for one, done. */
export function tutorialOpened(use: VillageUse): void {
  if (use === 'portal') tutorialDid('portal');
  if (use === 'chronicle') tutorialDid('chronicle');
  if (use === 'coop') tutorialDid('campfire');
}

// --- the sparring shade -------------------------------------------------------------------------------------------
let shade: Enemy | null = null;

/** The sparring shade, if it's up (the lab). */
export const sparringShade = (): Enemy | null => (shade && G.enemies.includes(shade) ? shade : null);

function dismissShade(): void {
  const e = sparringShade();
  shade = null;
  if (!e) return;
  G.enemies.splice(G.enemies.indexOf(e), 1);
  e.dispose();
}

/** The shade up while the step needs it and the hero is in the yard, the fight's programs warm (a foe drawn before
 *  them would compile in the frame: asked for meanwhile, they're warmed behind the village). */
function keepShade(active: boolean): void {
  const p = G.player;
  const wanted = active && !!tutorialStep()?.shade && inYard(p.pos.x, p.pos.z);
  if (!wanted) { dismissShade(); return; }
  if (sparringShade()) { shade!.target = p; return; }
  if (!isWarm('fight')) { want('fight'); return; }
  const [x, z] = yardToWorld(SHADE.at[0], SHADE.at[1]);
  // (never worn down: it's there to be struck at, and to strike)
  shade = spawnEnemy(SHADE.foe, new THREE.Vector3(x, 0, z), { training: true, name: SHADE.name, maxLife: 1e9 });
}

/** Whether the shade is on its way (the fight's programs not warm yet): the tracker says so. */
export const shadeComing = (): boolean => !!tutorialStep()?.shade && !sparringShade() && !isWarm('fight');

/** A harmless foe's blow at the hero (combat/damage.ts `hurtPlayer`): the shade's is taken on his shield as a real
 *  one would be, with no health lost, light for the block's step and too heavy to hold for the guard's. */
function sparred(p: Player, from: THREE.Vector3 | null, foe: Enemy | null): void {
  const step = tutorialStep();
  if (!foe || foe !== sparringShade() || (step?.id !== 'block' && step?.id !== 'break')) return;
  const raise = boundSkills(p).find((s) => s.def.block);
  const holds = p.stats.blockAmount * (raise?.def.block ?? 1);
  const raised = !!p.channel?.skill.def.block;
  const r = p.spar(holds * (step.id === 'break' ? SHADE.heavy : SHADE.blow), from);
  if (!r) return;
  if (!r.blocked) floatText(p.pos.x, 2.5, p.pos.z, 'Not blocked', 'info', '#ff9a80');
  if (step.id === 'block' && raised && r.blocked > 0) tutorialDid('block');
  if (step.id === 'break' && r.broke) tutorialDid('break');
}

// --- the marker over the step's place -------------------------------------------------------------------------------
let marker: Label;
let markerSaid = '';
let shown = false;
/** how far over an object's own height its marker stands, and the most of that height counted (a portal's arch is
 *  tall: its marker stands where the hero's eye is) (m) */
const MARKER_OVER = 0.6, MARKER_MOST = 2.4;
/** the yard's and the shade's markers: what each says, and how high it stands (m) */
const MARKER = { yard: { says: 'Training yard', high: 2.8 }, shade: { says: SHADE.name, high: 2.6 }, drop: { says: 'Your item', high: 1.4 } };

/** What the marker over `at` says: the place's name. */
const markerSays = (at: TutorialPlace): string =>
  (at === 'yard' || at === 'shade' || at === 'drop' ? MARKER[at].says : villageObject(at)?.name ?? '');

/** Where the marker stands: over the step's place, while the tutorial shows and he isn't there yet. */
function markerAt(): { x: number; y: number; z: number } | null {
  const at = shown ? tutorialStep()?.at : undefined;
  if (!at) return null;
  if (at === 'shade') {
    const e = sparringShade();
    return e ? { x: e.pos.x, y: e.obj.position.y + MARKER.shade.high, z: e.pos.z } : null;
  }
  if (at === 'drop') {
    const d = groundDrops()[0];
    return d ? { x: d.x, y: groundHeight(d.x, d.z) + MARKER.drop.high, z: d.z } : null;
  }
  if (at === 'yard') return { x: YARD.x, y: groundHeight(YARD.x, YARD.z) + MARKER.yard.high, z: YARD.z };
  const o = villageObject(at);
  if (!o) return null;
  return { x: o.at[0], y: groundHeight(o.at[0], o.at[1]) + Math.min(o.tall, MARKER_MOST) + MARKER_OVER, z: o.at[1] };
}

/** The tutorial's frame: its steps done by where the hero is and what's open (`bag`: the inventory or the stash up,
 *  `stash`: the stash), the shade kept, the marker painted. `active`: the village takes the hero's input, or his bag
 *  is open over it. */
export function updateTutorial(active: boolean, bag: boolean, stash: boolean): void {
  shown = active && !!station;
  if (shown) {
    const p = G.player;
    if (bag) tutorialDid('bag');
    if (stash) tutorialDid('stash');
    if (inYard(p.pos.x, p.pos.z)) tutorialDid('yard');
    const e = sparringShade();
    if (e && (e.dazed > 0 || e.frozen > 0)) tutorialDid('daze');
    if (e?.lure) tutorialDid('lure');
  }
  keepShade(shown);
  const at = shown ? tutorialStep()?.at : undefined;
  const says = at ? `${markerSays(at)} ▼` : '';
  if (says === markerSaid) return;
  markerSaid = says;
  if (says) marker.show(textArt(says, { face: 'display', size: 15, weight: 700, spacing: 0.5, color: '#ffd166', shadows: OUTLINE }));
}
