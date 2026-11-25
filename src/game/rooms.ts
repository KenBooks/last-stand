// The village's houses walked into (data/houses.ts, world/rooms.ts): a door used takes the hero into its room, shown in
// the village's stead (`Arena.showRoom`), and its door inside back out before the cottage's door; the walls the camera
// stands outside of left out every frame (`Room.cutAway`); the house of records' boards and trophies written from the
// save slot's heroes' records as he comes in. A run or the hall of heroes taking the lobby from under him takes him out.
import * as THREE from 'three';
import { G } from '../state';
import { HOUSES, insideOf, outsideOf, ROOM_IDS, TROPHIES, type RoomId } from '../data/houses';
import { BIOMES, BIOME_IDS, bossesOf, rungBoss } from '../data/biomes';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { RARITIES } from '../data/items';
import { peekProfile } from '../loot/profile';
import { saveSlot } from '../loot/saveSlots';
import { faceCamera, holdZoom, settleCamera } from '../core/renderer';
import { HERO_RADIUS } from '../entities/player';
import { resolveWorld } from '../world/collision';
import { groundHeight } from '../world/ground';
import { particles, col } from '../fx/particles';
import { clearEffects } from '../fx/effects';
import { clearProjectiles } from '../combat/projectiles';
import { clearFloaters } from '../ui/floaters';
import { rand } from '../util';
import { chronicleOf, favouriteSkill } from './chronicle';
import { readyingWhile, whenWarm } from './warm';
import { builtInSlices } from '../entities/models/steps';
import { painted } from '../world/arena';
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

/** the top view's zoom inside a room (game's zoom: 1 the run's, the lobby 0.45): near enough that the room fills the
 *  screen, never out to where it stood small amid the black past its cut away walls (from play) */
export const ROOM_ZOOM = { least: 0.24, most: 0.36 };

/** The hero put at `at`, facing `facing`, the camera behind him there at once. */
function placeHero(at: { x: number; z: number; facing: number }): void {
  const p = G.player;
  p.walkTo = null;
  p.place(new THREE.Vector3(at.x, groundHeight(at.x, at.z), at.z), at.facing);
  faceCamera(at.facing);
  // (there at once: gliding from the other place, the camera swept through the room's walls)
  settleCamera(p.pos);
}

/** offsets from a room's entry spot (`insideOf`) by guest slot (1..3), offset from `(0, 0)` so guests never stack
 *  on a host at the doorway or on each other, compact enough for every house and kept clear by `resolveWorld` */
const JOIN_SPOTS: readonly [number, number][] = [[-0.85, 0.25], [0.85, 0.25], [0, -0.85]];

/** A house entry deferred while the hall of heroes is open (e.g. a first-visit invitee picking a hero): applied once
 *  the hall closes (`enterPendingRoom`). */
let pendingJoin: { id: RoomId; slot: number; still: () => boolean } | null = null;

/** the most of a villager's build run in one task before a frame is painted (ms): the bar keeps moving, and a frame
 *  waited for after each costs the build a third of its time at most */
const FOLK_SLICE_MS = 50;
/** the houses whose folk are seated, and those being seated now */
const seated = new Set<RoomId>();
const seating = new Map<RoomId, Promise<void>>();

/**
 * House `id`'s folk (the library's scholar, the merchant's Odo) built, the first time it's walked into, a piece at a
 * time under the fight's loading bar; null where there's none to build. Nothing shows a room but the hero inside it,
 * and the engine makes a room's pipelines as it's first drawn, so nothing of a villager is needed before: built at
 * the boot, each whole, they were two tasks of 2.7 and 4.1 s of a player's laptop's loading screen, for houses that
 * visit may never open (#838; from the owner: "we dont need to build villagers, they are inside houses").
 */
function folkComing(id: RoomId, bar = true): Promise<void> | null {
  const room = G.arena.rooms[id];
  if (!room.seatFolk || seated.has(id)) return null;
  let coming = seating.get(id);
  if (!coming) {
    const build = async (): Promise<void> => {
      await builtInSlices(room.seatFolk!(), painted, FOLK_SLICE_MS);
      seated.add(id);
    };
    coming = (bar ? readyingWhile(`Opening ${HOUSES[id].name}`, build) : build()).finally(() => seating.delete(id));
    seating.set(id, coming);
  }
  return coming;
}

/** `go` once house `id`'s folk are seated: at once where they are (or it has none). */
function withFolk(id: RoomId, go: () => void): void {
  const coming = folkComing(id);
  if (coming) void coming.then(go);
  else go();
}

/** Every house's folk seated, no bar (the lab's boot, which readies everything at once: its commands walk in and
 *  read a villager in the same task). */
export function seatEveryFolk(): Promise<void> {
  return Promise.all(ROOM_IDS.map((id) => folkComing(id, false))).then(() => undefined);
}

/** Whether every house's folk are seated (the lab's boot waits for it with every need). */
export const everyFolkSeated = (): boolean => ROOM_IDS.every((id) => !G.arena.rooms[id].seatFolk || seated.has(id));

/** Put the hero inside house `id` immediately (`rooms` must already be warm). `slot`: party slot (0 for solo entry). */
function goIntoRoom(id: RoomId, slot = 0): void {
  if (G.mode !== 'menu' || roomHere() === id) return;
  leaveTheVillageBehind();
  G.arena.showRoom(id);
  showFoes(false);
  if (id === 'records') writeRecords();
  holdZoom(ROOM_ZOOM);
  const at = insideOf(id);
  if (slot > 0) {
    const [ox, oz] = JOIN_SPOTS[(slot - 1) % JOIN_SPOTS.length];
    const pos = { x: at.x + ox, z: at.z + oz };
    resolveWorld(pos, HERO_RADIUS);
    at.x = pos.x;
    at.z = pos.z;
  }
  placeHero(at);
  doorPuff(0, HOUSES[id].half[1] - 0.4);
  told(id);
}

/** whether a harness keeps what the village has going as a room is shown, as it was */
let villageKept = false;

/** For a harness (tools/lab): what the village has going kept as a room is shown, as it was (a canary's). */
export function holdVillageKept(kept: boolean): void {
  villageKept = kept;
}

/** What the village has going let go as a room is shown in its stead, as the hall of heroes' opening does: the room
 *  stands at the world's middle and the training yard is a few metres off it, so a skill left going there (a partner's
 *  held channel or a draw, whose end never comes while he's away, or his own) drew its projectiles, beams, ground marks,
 *  particles, lights and numbers over the room's frame, and its hum played on (from play, "make sure you cant see any
 *  casts while inside the village houses"; `lab coop --scenarios houses`). A partner out in the village is away while
 *  he's inside (`syncAway` in net/session.ts), so nothing he casts there is played here after. */
function leaveTheVillageBehind(): void {
  if (villageKept) return;
  for (const p of G.players) p.standDown();
  clearProjectiles();
  clearEffects();
  particles.clear();
  clearFloaters();
}

/** The hero into house `id`'s room (its programs warmed first, under the loading bar if they aren't yet). */
export const enterRoom = whenWarm(['rooms'], (id: RoomId): void => {
  pendingJoin = null;
  withFolk(id, () => goIntoRoom(id));
}, (id: RoomId) => `Opening ${HOUSES[id].name}`);

const enterJoined = whenWarm(['rooms'], (id: RoomId, slot: number, still: () => boolean): void => {
  withFolk(id, () => {
    if (!still() || G.mode !== 'menu') return;
    if (G.arena.hallShown) { pendingJoin = { id, slot, still }; return; }
    pendingJoin = null;
    goIntoRoom(id, slot);
  });
}, (id: RoomId) => `Opening ${HOUSES[id].name}`);

/**
 * A guest welcomed into a party whose host stands in house `id` (null: outside in the village): put in the same place
 * so the party starts together (the entire village is already loaded and warmed at boot, so leaving the house after
 * does not lag). Already in that house, stay where they stand; in another or outside, enter once `rooms` is warm (or
 * once the hall of heroes closes if it's up). `still`: whether the guest is still in the same party.
 */
export function joinInRoom(id: RoomId | null, slot: number, still: () => boolean): void {
  pendingJoin = null;
  if (G.mode !== 'menu') return;
  if (id) {
    if (roomHere() === id) return;
    if (G.arena.hallShown) { pendingJoin = { id, slot, still }; return; }
    enterJoined(id, slot, still);
    return;
  }
  const wasIn = roomHere();
  if (wasIn) leaveRoom(true, true);
  G.player.walkTo = null;
  G.player.place(G.player.spawn, G.player.facing);
  if (wasIn) settleCamera(G.player.pos);
}

/** Drop any deferred party house entry (leaving the room or starting a run). */
export function clearPendingRoom(): void { pendingJoin = null; }

/** If a guest joined a host inside a house while the hall of heroes was open, enter it now that the hall closed. */
export function enterPendingRoom(): void {
  const next = pendingJoin;
  pendingJoin = null;
  if (!next || !next.still() || G.mode !== 'menu' || G.arena.hallShown) return;
  enterJoined(next.id, next.slot, next.still);
}

/** The hero out of the room he's in, before its cottage's door (`quiet`: nothing placed, a run's start or party spawn
 *  places him; `giveBackZoom`: restore the outside zoom held when entering, true unless a run sets its own). */
export function leaveRoom(quiet = false, giveBackZoom = !quiet): void {
  const id = roomHere();
  if (!id) return;
  G.arena.showRoom(null);
  showFoes(true);
  // (his own zoom given back as it was, but as a run takes him out: it sets its own)
  holdZoom(null, giveBackZoom);
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
  G.arena.rooms[id].cutAway(G.camera.getWorldPosition(_eye));
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
    rows: heroes.flatMap(({ id, p: h }) => BIOME_IDS.map((b) => [`${CLASSES[id].name} · ${BIOMES[b].title}`, String(h.records.bestBanked[b] ?? '—')] as const)),
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
      ['Times cast', fav ? num(fav.casts) : '—'],
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
  // (every boss a battleground can bring, its ladder's and its exceptions', a pair under its first by its pair's name)
  const bosses = [...new Set([...BIOME_IDS.flatMap((b) => bossesOf(b)), ...(Object.keys(TROPHIES) as EnemyId[])])]
    .filter((b) => rungBoss(b) === b);
  const right: Board = {
    title: 'Bosses Slain',
    rows: [
      ...bosses.map((b) => [ENEMIES[b]?.pair ?? ENEMIES[b]?.name ?? b, String(slain[b] ?? 0)] as const),
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
  G.arena.rooms.records.showRecords?.(recordsShown());
}
