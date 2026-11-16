// The village's houses walked into (data/houses.ts, world/rooms.ts): a door used takes the hero into its room, shown in
// the village's stead (`Arena.showRoom`), and its door inside back out before the cottage's door; the walls the camera
// stands outside of left out every frame (`Room.cutAway`); the house of records' boards and trophies written from the
// save slot's heroes' records as he comes in. A run or the hall of heroes taking the lobby from under him takes him out.
import * as THREE from 'three';
import { G } from '../state';
import { HOUSES, insideOf, outsideOf, TROPHIES, type RoomId } from '../data/houses';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { RARITIES } from '../data/items';
import { peekProfile } from '../loot/profile';
import { saveSlot } from '../loot/saveSlots';
import { faceCamera, settleCamera } from '../core/renderer';
import { groundHeight } from '../world/ground';
import { particles, col } from '../fx/particles';
import { rand } from '../util';
import { chronicleOf, favouriteSkill } from './chronicle';
import { whenWarm } from './warm';
import type { Board, RecordsShown } from '../world/rooms';
import type { Profile } from '../types';

/** what's told as the hero goes in or out (main.ts: the panels put away, co-op told) */
let told: (room: RoomId | null) => void = () => undefined;
export function onRoomChange(fn: (room: RoomId | null) => void): void { told = fn; }

/** The room the hero stands in, or null: the village. */
export const roomHere = (): RoomId | null => G.arena?.room ?? null;

/** A puff of dust and a glint as a door swings, at (x, z). */
function doorPuff(x: number, z: number): void {
  for (let i = 0; i < 14; i++) {
    particles.smoke.spawn({
      x: x + rand(-0.4, 0.4), y: rand(0.2, 1.6), z: z + rand(-0.4, 0.4), vx: rand(-0.3, 0.3), vy: rand(0.1, 0.5), vz: rand(-0.3, 0.3),
      life: rand(0.6, 1.1), size: rand(0.12, 0.3), sizeEnd: rand(0.4, 0.7), color: col(0x8a7a66, 0.25), colorEnd: col(0x5a4a3a, 0),
    });
  }
}

/** The hero put at `at`, facing `facing`, the camera behind him there at once. */
function placeHero(at: { x: number; z: number; facing: number }): void {
  const p = G.player;
  p.walkTo = null;
  p.place(new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z), at.facing);
  faceCamera(at.facing);
  // (there at once: gliding from the other place, the camera swept through the room's walls)
  settleCamera(p.pos);
}

/** The hero into house `id`'s room (its programs warmed first, under the loading bar if they aren't yet). */
export const enterRoom = whenWarm(['rooms'], (id: RoomId): void => {
  if (G.mode !== 'menu' || roomHere() === id) return;
  G.arena.showRoom(id);
  showFoes(false);
  if (id === 'records') writeRecords();
  placeHero(insideOf(id));
  doorPuff(0, HOUSES[id].half[1] - 0.4);
  told(id);
}, (id: RoomId) => `Opening ${HOUSES[id].name}`);

/** The hero out of the room he's in, before its cottage's door (`quiet`: nothing placed, a run's start takes him on). */
export function leaveRoom(quiet = false): void {
  const id = roomHere();
  if (!id) return;
  G.arena.showRoom(null);
  showFoes(true);
  if (!quiet) {
    const out = outsideOf(id);
    placeHero(out);
    doorPuff(out.x - Math.sin(out.facing) * 0.9, out.z - Math.cos(out.facing) * 0.9);
  }
  told(null);
}

/** The lobby's foes (the yard's dummies) shown, or hidden while he's in a room: they stand in the village's frame, which
 *  the room's floor lies over. */
function showFoes(on: boolean): void {
  // (by its dissolve: a foe drawn in its kind's crowd is drawn whatever its own meshes' visibility, and a dissolved
  // one casts no shadow)
  for (const e of G.enemies) {
    e.obj.visible = on;
    e.model.kit.u.uDissolve.value = on ? 0 : 1;
  }
}

const _eye = new THREE.Vector3();
/** The room's frame: the walls the camera stands outside of left out; out of it if the lobby's gone from under him. */
export function updateRooms(): void {
  const id = roomHere();
  if (!id) return;
  if (G.mode !== 'menu') { leaveRoom(true); return; }
  // (every frame: the dummies' own update shows them again)
  showFoes(false);
  G.arena.rooms![id].cutAway(G.camera.getWorldPosition(_eye));
}

// ---------------------------------------------------------------------------------------------------------------------
// The house of records' boards

/** seconds as h:mm:ss or m:ss */
function clock(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
const num = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Every hero of the save slot in play as stored (the one played from the game: his records are the freshest). */
function heroesOfSlot(): { id: string; p: Profile }[] {
  return CLASS_IDS.flatMap((id) => {
    const p = id === G.profile.classId ? G.profile : peekProfile(id, saveSlot());
    return p ? [{ id, p }] : [];
  });
}

/** The skill named by its `impl` in class `classId`'s data, or the impl itself. */
function skillName(classId: string, impl: string): string {
  return CLASSES[classId].skills.find((s) => s.impl === impl)?.name ?? impl;
}

/** What the house of records shows for the save slot in play and the hero played. */
export function recordsShown(): RecordsShown {
  const heroes = heroesOfSlot(), p = G.profile, r = p.records, c = chronicleOf(p);
  const name = CLASSES[p.classId].name;
  const bests: Board = {
    title: 'Best Waves Banked',
    rows: heroes.flatMap(({ id, p: h }) => BIOME_IDS.map((b) => [`${CLASSES[id].name} · ${BIOMES[b].title.replace(/^The /, '')}`, String(h.records.bestBanked[b] ?? '—')] as const)),
  };
  const fav = favouriteSkill(c);
  const feats: Board = {
    title: `Feats of the ${name}`,
    rows: [
      ['Longest run', c.longestRun ? clock(c.longestRun) : '—'],
      ['Most waves in one run', c.mostWaves ? String(c.mostWaves) : '—'],
      ['Most foes in one run', c.mostKills ? num(c.mostKills) : '—'],
      ['Most damage in one run', c.mostDealt ? num(c.mostDealt) : '—'],
      ['Favourite skill', fav ? skillName(p.classId, fav.impl) : '—'],
      ['Its casts', fav ? num(fav.casts) : '—'],
      ['Falls', String(c.deaths)],
      ['Partners raised', String(c.revives)],
      ['Runs with a party', String(c.coopRuns)],
    ],
  };
  const slain = slainBy(heroes);
  const left: Board = {
    title: 'Runs & Spoils',
    rows: [
      ['Runs begun', num(r.runs)],
      ['Runs banked', num(c.banks)],
      ['Best score', num(r.bestScore)],
      ['Foes slain', num(r.kills ?? 0)],
      ['Time in battle', clock(r.time ?? 0)],
      ['Items banked', num(r.banked)],
      ...RARITIES.map((x) => [`· ${x.name}`, num(c.bankedBy[x.id] ?? 0)] as const),
    ],
  };
  const bosses = [...new Set([...BIOME_IDS.map((b) => BIOMES[b].boss), ...(Object.keys(TROPHIES) as EnemyId[])])];
  const right: Board = {
    title: 'Bosses Slain',
    rows: [
      ...bosses.map((b) => [ENEMIES[b]?.name ?? b, String(slain[b] ?? 0)] as const),
      ['By this hero', String(Object.values(c.bosses).reduce((a, n) => a + n, 0))],
      ['Damage over all runs', num(c.dealt)],
      ['Heroes of this slot', String(heroes.length)],
    ],
  };
  return { bests, feats, left, right, slain };
}

/** How often each boss fell to any hero of the slot (the trophies are the slot's, its records hall the heroes'). */
function slainBy(heroes: { p: Profile }[]): Partial<Record<EnemyId, number>> {
  const slain: Partial<Record<EnemyId, number>> = {};
  for (const { p } of heroes) {
    for (const [boss, n] of Object.entries(p.records.chronicle?.bosses ?? {})) {
      slain[boss as EnemyId] = (slain[boss as EnemyId] ?? 0) + n;
    }
  }
  return slain;
}

/** The house of records' boards and trophies written afresh. */
export function writeRecords(): void {
  G.arena.rooms?.records.showRecords?.(recordsShown());
}
