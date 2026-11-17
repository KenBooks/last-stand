// The Ossuary Twins' fight (tools/lab `boss --parts twins`, `twinsPictures`; entities/twins.ts): the Crypt's third
// rung, Slab and Reliquary sharing one life.
//
// - `twins`: a hit on either taking the pair's life from both; the chain snapping tight past its reach (the hero stood
//   between them hurt, the two dragged nearer); at half the one that took more collapsing, paying nothing, the other
//   in its phase; Reliquary's mend raising the pair's life once Slab stands hurt and unhit, and a stun in its channel
//   breaking it, healing nothing.
// - `twinsPictures`: the pair in each of their moments, a sheet for the eye.
//
// Its canaries: a pair that shares nothing, a chain that never snaps, no collapse at half, a mend that mends nothing.
// This module reads boss.ts's helpers only inside its functions: boss.ts imports it, and its constants aren't made
// yet as this module loads.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { BossOptions } from './boss';
import { G } from '../../../src/state';
import { ENEMIES, SCALING, TWINS } from '../../../src/data/enemies';
import { WAVES } from '../../../src/data/waves';
import { hooksOf } from '../../../src/entities/bossHooks';
import { setFxSink } from '../../../src/entities/enemyAI';
import { inObstacle } from '../../../src/world/collision';
import { clearSpot, standIn } from './boss';
import { femur, forearm, humerus, jaw, pelvis, scapula, skull, sternum, tibia, twinSkull } from '../../../src/entities/models/ossuary';

/** the wave the Twins come on, the frames each may take to rise, the lab's frames a second */
const WAVE = WAVES.bossEvery * 3;
const RISE_FRAMES = 200;
const FPS = 60;
/** how far apart the pair stands at first (m), well inside the chain's reach */
const ABREAST = 5;
/** the frames a mend may take to begin, and a share of the life it must raise at least (of its `heal`) */
const MEND_WAIT = 15 * FPS;
const MEND_MOST_OFF = 0.1;

const fixed = (value: number, digits = 2): string => value.toFixed(digits);

/** Slab and Reliquary risen abreast `away` m from the hero, dazed (thinking nothing) unless `thinks`. */
async function pairAt(lab: Lab, away: number, thinks: boolean): Promise<{ slab: Enemy; reliquary: Enemy }> {
  const at = clearSpot(away, ENEMIES.twinslab.radius);
  const toHero = new THREE.Vector3(G.player.pos.x - at.x, 0, G.player.pos.z - at.z).normalize();
  const side = new THREE.Vector3(-toHero.z, 0, toHero.x);
  let other = at.clone().addScaledVector(side, ABREAST);
  if (inObstacle(other, ENEMIES.twinreliquary.radius)) other = at.clone().addScaledVector(side, -ABREAST);
  const slab = lab.spawnFoe('twinslab', at, { wave: WAVE });
  const reliquary = lab.spawnFoe('twinreliquary', other, { wave: WAVE });
  await lab.until(() => slab.spawning <= 0 && reliquary.spawning <= 0, RISE_FRAMES, 'the Twins never rose');
  for (const twin of [slab, reliquary]) {
    twin.facing = twin.targetFacing = Math.atan2(G.player.pos.x - twin.pos.x, G.player.pos.z - twin.pos.z);
    twin.dazed = thinks ? 0 : 1e4;
  }
  return { slab, reliquary };
}

/** The hero's life held whole each frame, but where a check reads it. */
const keepWhole = (): Record<string, never> => {
  G.player.life = G.player.stats.maxLife;
  return {};
};

/** A hit on either takes the pair's life from both. */
async function shared(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const def = ENEMIES.twinslab, partner = def.shares;
  if (options.canary) def.shares = undefined;
  try {
    const { slab, reliquary } = await pairAt(lab, 12, false);
    const blow = slab.maxLife * 0.1;
    slab.takeDamage(blow, {});
    reliquary.takeDamage(blow, {});
    await lab.step(2);
    const left = (slab.life / slab.maxLife + reliquary.life / reliquary.maxLife) / 2;
    lines.push(`twins: two hits of a tenth each, one on each: Slab ${fixed(slab.life / slab.maxLife)}, Reliquary `
      + `${fixed(reliquary.life / reliquary.maxLife)} of the pair's life`);
    if (Math.abs(slab.life - reliquary.life) > 1) problems.push(`twins: their lives parted (${fixed(slab.life, 0)} against ${fixed(reliquary.life, 0)})`);
    if (Math.abs(left - 0.8) > 0.01) problems.push(`twins: two tenths taken left ${fixed(left)} of the pair's life, not 0.80`);
  } finally {
    def.shares = partner;
  }
}

/** Past its reach the chain snaps: the hero between them hurt, the pair dragged nearer. */
async function chain(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const reach = TWINS.chain.max;
  if (options.canary) TWINS.chain.max = 1e3;
  try {
    const { slab, reliquary } = await pairAt(lab, 9, false);
    // (Reliquary set past the chain's reach across the hero, so he stands on the line between them)
    const way = new THREE.Vector3(G.player.pos.x - slab.pos.x, 0, G.player.pos.z - slab.pos.z).normalize();
    reliquary.pos.copy(slab.pos).addScaledVector(way, reach + 4);
    const apart = (): number => Math.hypot(reliquary.pos.x - slab.pos.x, reliquary.pos.z - slab.pos.z);
    const was = apart(), hero = G.player, takeDamage = hero.takeDamage;
    let snaps = 0, hurt = 0;
    setFxSink((name) => { if (name === 'chainSnap') snaps++; });
    // (what reaches him counted as it lands: the set-up keeps his life whole)
    hero.takeDamage = (...args) => {
      const result = takeDamage.apply(hero, args);
      hurt += result?.taken ?? 0;
      return result;
    };
    try {
      await lab.step(40);
    } finally {
      setFxSink(null);
      hero.takeDamage = takeDamage;
    }
    const now = apart();
    lines.push(`twins: ${fixed(was, 1)} m apart, the hero between them: ${snaps} snaps, the hero hurt ${fixed(hurt, 0)}, `
      + `${fixed(now, 1)} m apart after`);
    if (snaps === 0) problems.push('twins: the chain never snapped past its reach');
    if (hurt <= 0) problems.push('twins: the chain swept through the hero and hurt him not at all');
    if (now > was - 2) problems.push(`twins: the snap dragged them only from ${fixed(was, 1)} to ${fixed(now, 1)} m apart`);
  } finally {
    TWINS.chain.max = reach;
  }
}

/** At half the one that took more collapses, paying nothing; the other enters its phase. */
async function collapse(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const hooks = hooksOf('twinslab')!, hurt = hooks.hurt;
  if (options.canary) hooks.hurt = undefined;
  try {
    const { slab, reliquary } = await pairAt(lab, 12, false);
    // (Slab struck harder: three hits of a tenth on him, two on Reliquary, the last over half)
    for (const twin of [slab, reliquary, slab, reliquary, slab]) {
      twin.takeDamage(twin.maxLife * 0.105, {});
      await lab.step(1);
    }
    await lab.step(30);
    const fell = [slab, reliquary].filter((twin) => !twin.alive).map((twin) => twin.type);
    lines.push(`twins: Slab took ${fixed(slab.taken / slab.maxLife)}, Reliquary ${fixed(reliquary.taken / reliquary.maxLife)}: `
      + `fallen [${fell.join(', ')}], Reliquary's phase ${reliquary.bossPhase}, its life ${fixed(reliquary.life / reliquary.maxLife)}`);
    if (fell.join() !== 'twinslab') problems.push(`twins: at half [${fell.join(', ')}] fell, not Slab alone (who took more)`);
    else if (!slab.noSpoils) problems.push('twins: the twin that collapsed at half would pay its spoils');
    if (reliquary.alive && reliquary.bossPhase < 1) problems.push('twins: the twin left standing never took its brother\'s power');
  } finally {
    hooks.hurt = hurt;
  }
}

/** Frames until Reliquary begins a mend, the hero kept whole. */
async function untilMend(lab: Lab, reliquary: Enemy): Promise<void> {
  await lab.until(() => reliquary.action?.name === 'mend', MEND_WAIT, 'Reliquary never began a mend', keepWhole);
}

/** Reliquary's mend raises the pair's life; a stun in its channel breaks it. */
async function mend(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const heal = TWINS.mend.heal;
  if (options.canary) TWINS.mend.heal = 0;
  try {
    // (the hero far off, the pair thinking: hurt through Reliquary alone, Slab unhit)
    const { slab, reliquary } = await pairAt(lab, 24, true);
    reliquary.takeDamage(reliquary.maxLife * 0.25, {});
    await untilMend(lab, reliquary);
    const before = reliquary.life;
    await lab.until(() => reliquary.action?.name !== 'mend', 4 * FPS, 'the mend never ended', keepWhole);
    const raised = (reliquary.life - before) / reliquary.maxLife;
    lines.push(`twins: a mend raised the pair's life by ${fixed(raised, 3)} of it (its heal ${heal}); Slab ${fixed(slab.life / slab.maxLife, 3)}`);
    if (raised < heal * (1 - MEND_MOST_OFF)) problems.push(`twins: a mend raised the pair's life by ${fixed(raised, 3)}, not ${heal}`);
    if (Math.abs(slab.life - reliquary.life) > 1) problems.push('twins: the mend healed Reliquary alone, not the pair');
    // the next, stunned a second into its channel
    await untilMend(lab, reliquary);
    await lab.step(FPS, keepWhole);
    const stunned = reliquary.life;
    reliquary.daze(1.5);
    await lab.step(4 * FPS, keepWhole);
    const after = (reliquary.life - stunned) / reliquary.maxLife;
    lines.push(`twins: a mend stunned a second in: the pair's life raised by ${fixed(after, 3)} after`);
    if (after > heal * 0.5) problems.push(`twins: a stunned mend still healed ${fixed(after, 3)} of the pair's life`);
  } finally {
    TWINS.mend.heal = heal;
  }
}

/** `boss --parts twins`: each of the Twins' rules in turn. */
export async function twins(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  for (const check of [shared, chain, collapse, mend]) {
    await standIn(lab, options.fixture, 'crypt');
    await check(lab, options, lines, problems);
  }
}

/** The Twins' time at wave 15 against the Colossus's at 5 and the Cantor's encounter at 10, from `dps`. */
export function twinsTime(dps: number, colossus: number, cantor: number): string {
  const life = ENEMIES.twinslab.life * SCALING.life(WAVE);
  const time = life / dps;
  return `ttk: the Ossuary Twins at wave ${WAVE} (one life of ${fixed(life, 0)} between them): ${fixed(time, 0)} s with no mend `
    + `(${fixed(time / colossus, 2)}x the Colossus's, ${fixed(time / cantor, 2)}x the Cantor's encounter)`;
}

// --- pictures ----------------------------------------------------------------------------------------------

/** `boss --parts twinsPictures`: the pair in each moment, from behind the hero, the side and the game's view. */
export async function twinsPictures(lab: Lab, options: BossOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const moments: Pictured[] = [];
  const { slab, reliquary } = await pairAt(lab, 11, false);
  const middle = (): THREE.Vector3 => slab.pos.clone().add(reliquary.pos).multiplyScalar(0.5).setY(2.8);
  // (each turned as the hero faces: he's turned on them first, so `back` looks at their fronts past him)
  const faceThem = (at: THREE.Vector3): void => {
    G.player.facing = Math.atan2(at.x - G.player.pos.x, at.z - G.player.pos.z);
  };
  const seen = (label: string, note: string): void => {
    faceThem(middle());
    moments.push(lab.picture(label, ['back', 'above'], [note], { at: middle(), distance: 15 }));
  };
  const close = (who: Enemy, label: string, note: string): void => {
    faceThem(who.pos);
    moments.push(lab.picture(label, ['back', 'right'], [note], { at: who.pos.clone().setY(2.8), distance: 10 }));
  };
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(30, keepWhole);
    seen('1 the Ossuary Twins', 'Slab and Reliquary, bound by their chain of bone, one life between them');
    close(slab, '2 Slab (close)', 'broad, a mantle of skulls, a tombstone for a weapon');
    close(reliquary, '3 Reliquary (close)', 'thin and hooded, a casket of floating skulls');
    // the slam's warning, and the volley
    const act = async (who: Enemy, name: string, share: number): Promise<void> => {
      who.dazed = 0;
      who.cd = 0;
      await lab.until(() => who.action?.name === name && who.action.t / who.action.dur >= share, 12 * FPS, `${who.type} never reached its ${name}`, keepWhole);
      who.dazed = 1e4;
    };
    G.player.pos.copy(slab.pos).add(new THREE.Vector3(Math.sin(slab.facing) * 4.5, 0, Math.cos(slab.facing) * 4.5));
    await act(slab, 'slam', 0.3);
    seen('4 grave slam warning', 'the slab lifted over his head a second, its ring before him');
    reliquary.brain.hitAt = G.time;
    await act(reliquary, 'volley', 0.55);
    await lab.step(12, keepWhole);
    seen('5 skull volley', 'three to five skulls curving in on the hero, each on its own arc');
    // the chain taut and snapping
    const way = new THREE.Vector3(reliquary.pos.x - slab.pos.x, 0, reliquary.pos.z - slab.pos.z).normalize();
    reliquary.pos.copy(slab.pos).addScaledVector(way, TWINS.chain.max + 2);
    await lab.step(3, keepWhole);
    seen('6 the chain snaps', 'drifted too far apart: the chain snaps tight, dragging them together, hurting anyone between');
    await lab.step(60, keepWhole);
    // the mend
    slab.takeDamage(slab.maxLife * 0.2, {});
    slab.brain.hitAt = G.time - 10;
    await act(reliquary, 'mend', 0.4);
    seen('7 mend', 'Slab hurt and untouched 5 s: Reliquary raises its casket and mends him (a stun breaks it)');
    reliquary.cancelAction();
    // the collapse at half, and the one left standing
    slab.takeDamage(slab.life - slab.maxLife * 0.45, {});
    await lab.step(50, keepWhole);
    seen('8 Slab collapses', 'at half the one that took more collapses; Reliquary takes up the slab: faster, his brother\'s slam too');
    G.player.pos.copy(reliquary.pos).add(new THREE.Vector3(Math.sin(reliquary.facing) * 4, 0, Math.cos(reliquary.facing) * 4));
    await act(reliquary, 'slam', 0.3);
    close(reliquary, '9 Reliquary\'s slam', 'alone, the thin one brings his brother\'s slam down');
  } finally {
    lab.drawing = drawing;
  }
  lines.push(`twinsPictures: ${moments.length} moments`);
  return moments;
}

// --- their look -------------------------------------------------------------------------------------------

/** the most triangles each twin's model may draw (a phone's budget for one boss, as the Rootmother's) */
const TWIN_TRIANGLES = 45_000;
/** how far off a twin the whole pictures are taken from (m), the height they're framed on; the skull's */
const LOOK_FROM = 12;
/** how far behind the hero the other twin is sent for each one's pictures (m) */
const OTHER_OFF = 30;
const LOOK_Y = 2.8;
const SKULL_FROM = 4;

/** The triangles a model draws, by its meshes' geometries (each drawn once). */
function trianglesOf(root: THREE.Object3D): number {
  const seen = new Set<THREE.BufferGeometry>();
  let count = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const geometry = mesh.geometry;
    count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  return Math.round(count);
}

/** how far below the top of a twin its skull's middle is (m) */
const SKULL_DOWN = 0.6;

/** a foe's own way of finding its target, while `blind` has it find none */
const sight = new WeakMap<Enemy, () => boolean>();
type Seeing = { pickTarget: () => boolean };

/** `foe` finding no target, so thinking nothing (without a daze's stars over it) until `sighted`. */
function blind(foe: Enemy): void {
  const seeing = foe as unknown as Seeing;
  if (!sight.has(foe)) sight.set(foe, seeing.pickTarget);
  seeing.pickTarget = () => false;
}

/** `foe` finding its target again. */
function sighted(foe: Enemy): void {
  const own = sight.get(foe);
  if (own) (foe as unknown as Seeing).pickTarget = own;
  sight.delete(foe);
}

/** The triangles of each of a model's meshes, the most first: its joint's place in the model's tree and its
 *  material's colour, so a budget can be cut where it goes. */
function trianglesByMesh(root: THREE.Object3D, most: number): string {
  const rows: [string, number][] = [];
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const geometry = mesh.geometry;
    const count = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    let depth = 0;
    for (let at: THREE.Object3D | null = mesh.parent; at && at !== root; at = at.parent) depth++;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const colour = material.color ? `#${material.color.getHexString()}` : material.type;
    rows.push([`depth ${depth} ${colour}`, Math.round(count)]);
  });
  rows.sort((a, b) => b[1] - a[1]);
  return rows.slice(0, most).map(([what, count]) => `${what} ${count}`).join(', ');
}

/** The triangles of each sculpted bone as Slab's measures make it (m), meshed alone: what a model's budget is spent on. */
function bonesTriangles(): string {
  const count = (g: THREE.BufferGeometry): number => Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
  const span = 1.85, thick = 0.17, hip = 0.464;
  const bones: [string, THREE.BufferGeometry][] = [
    ['heavy skull', twinSkull(0.0092, 'heavy')], ['long skull', twinSkull(0.0092, 'long')], ['jaw', jaw(0.0082)], ['small skull', skull(0.019)], ['small jaw', jaw(0.016)],
    ['pelvis', pelvis(hip)], ['scapula', scapula(span * 0.44)], ['sternum', sternum(span * 0.38)],
    ['femur', femur(1.05, thick * 0.55)], ['tibia', tibia(0.82, thick * 0.52)], ['humerus', humerus(1.25, thick * 0.48)],
    ['forearm', forearm(1.15, thick * 0.41)],
  ];
  const listed = bones.map(([name, g]) => `${name} ${count(g)}`).join(', ');
  for (const [, g] of bones) g.dispose();
  return listed;
}

/** Where `who`'s skull is drawn, in the world: just under the top of its body as posed. */
function skullOf(who: Enemy): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(who.model.root);
  return who.pos.clone().setY(box.max.y - SKULL_DOWN);
}

/**
 * `boss --parts twinsLook`: each twin alone, standing, from its front, its back and both sides, and its skull close
 * up; its triangles held to `TWIN_TRIANGLES`. Taken without its stars: thinking, its cooldown held, a frame.
 */
export async function twinsLook(lab: Lab, options: BossOptions, lines: string[],
  problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const moments: Pictured[] = [];
  const { slab, reliquary } = await pairAt(lab, 12, false);
  const faceIt = (at: THREE.Vector3): void => {
    G.player.facing = Math.atan2(at.x - G.player.pos.x, at.z - G.player.pos.z);
  };
  // (the chain to his brother hidden: drawn, it glared across every picture of either)
  const lay = slab.model.root.userData.layChain as (to: THREE.Vector3 | null, taut: number) => void;
  slab.model.root.userData.layChain = (_to: THREE.Vector3 | null, taut: number) => lay(null, taut);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (const [who, name, other] of [[slab, 'Slab', reliquary], [reliquary, 'Reliquary', slab]] as const) {
      // (the other one sent well off behind the hero, so each stands alone in its pictures: beside it, the side
      // views' camera stood inside the other's ribs)
      const away = new THREE.Vector3(G.player.pos.x - who.pos.x, 0, G.player.pos.z - who.pos.z).normalize();
      other.pos.copy(G.player.pos).addScaledVector(away, OTHER_OFF);
      // (thinking nothing, but not dazed: its stars stay off, and it stands facing the hero as it's turned)
      const toHero = Math.atan2(G.player.pos.x - who.pos.x, G.player.pos.z - who.pos.z);
      await lab.step(20, () => {
        for (const twin of [who, other]) {
          twin.dazed = 0;
          blind(twin);
        }
        who.facing = who.targetFacing = toHero;
        return keepWhole();
      });
      faceIt(who.pos);
      // (views by the hero: he faces it, so `back` is its front, `front` its back)
      const whole = { at: who.pos.clone().setY(LOOK_Y), distance: LOOK_FROM };
      moments.push(lab.picture(`${name} front and back`, ['back', 'front'], [`${name} from its front and its back`], whole));
      moments.push(lab.picture(`${name} sides`, ['left', 'right'], [`${name} from both sides`], whole));
      moments.push(lab.picture(`${name} skull`, ['back', 'left', 'right'], [`${name}'s skull, its face and both sides`],
        { at: skullOf(who), distance: SKULL_FROM }));
      for (const twin of [who, other]) {
        sighted(twin);
        twin.dazed = 1e4;
      }
      const count = trianglesOf(who.model.root);
      lines.push(`twinsLook: ${name} draws ${count} triangles (at most ${TWIN_TRIANGLES}); the most: ${trianglesByMesh(who.model.root, 10)}`);
      if (count > TWIN_TRIANGLES) problems.push(`twinsLook: ${name}'s model draws ${count} triangles, over ${TWIN_TRIANGLES}`);
    }
  } finally {
    lab.drawing = drawing;
    slab.model.root.userData.layChain = lay;
  }
  lines.push(`twinsLook: each bone at Slab's size: ${bonesTriangles()}`);
  return moments;
}
