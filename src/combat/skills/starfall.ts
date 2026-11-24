// Starfall: arcane crystal meteors plunge from the heavens onto the target area.
// Visual beats: rune glyph marks the spot -> meteor with comet streak -> impact
// (light pillar, erupting crystals that later shatter, glowing cracks, debris).
// Held, the area its first crystal strikes is shown on the floor where it would fall (red while letting go would cast
// nothing, its cooldown counting down in it), and it's called down as the key is let go.
import * as THREE from 'three';
import { additive, nearGlow } from '../../core/materials';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { evades, type Threat } from '../../entities/evade';
import type { Enemy } from '../../entities/enemy';
import { blastCorpses } from '../../entities/corpse';
import { addEffect, shockwave, decal, glyphMarker, lightPillar, crackDecal, crystalBurst } from '../../fx/effects';
import { burst, particles, col, smokePuff, debris } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { floorPatch, lay } from '../../fx/floorPatch';
import { Readiness } from './readiness';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'shards' | 'radius' | 'edge' | 'scatter' | 'chill'>;
import type { SkillDef } from '../../types';
import { rand } from '../../util';

const COLOR = 0x5dffa8, CORE = 0xd8fff0, ICE = 0x9fe6ff;
const FALL_TIME = 0.38;
const meteorGeo = new THREE.OctahedronGeometry(0.32, 0).scale(0.7, 1.9, 0.7);
// comet streak: wide end at the meteor (origin), tapering tail along +Y (= behind, see orientation below)
const streakGeo = new THREE.ConeGeometry(0.28, 1, 12, 1, true).translate(0, 0.5, 0);
let meteorMat: THREE.MeshStandardMaterial | null = null;
const _up = new THREE.Vector3(0, 1, 0);

const getMeteorMat = () => meteorMat ??= new THREE.MeshStandardMaterial({ color: 0x0b2a1c, emissive: new THREE.Color(COLOR), emissiveIntensity: 4, roughness: 0.2, flatShading: true });
const streakMaterial = () => nearGlow(new THREE.MeshBasicMaterial({ color: new THREE.Color(COLOR).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));

/** A cast's crystals together: the bodies they've thrown already (each thrown once a cast), and the foes that have seen
 *  the cast coming (each judged once: entities/evade.ts) and where it's coming down, the whole of it. */
interface Fall { blasted: Set<object>; judged: Set<Enemy>; area: Threat }

function dropMeteor(player: Player, def: Def, landing: THREE.Vector3, delay: number, fall: Fall): void {
  const streakMat = streakMaterial();
  const meteor = new THREE.Mesh(meteorGeo, getMeteorMat());
  const streak = new THREE.Mesh(streakGeo, streakMat);
  const group = new THREE.Group();
  meteor.name = 'Starfall: crystal';
  streak.name = 'Starfall: streak';
  group.add(meteor, streak);
  group.visible = false;
  G.scene.add(group);

  const start = new THREE.Vector3(landing.x - 6, 22, landing.z - 4);
  const dir = new THREE.Vector3().subVectors(landing, start).normalize();
  // orient: group's -Y points along the fall direction, streak trails behind (towards +Y)
  group.quaternion.setFromUnitVectors(_up, dir.clone().negate());
  const marker = glyphMarker(landing, { radius: def.radius * 0.55, color: COLOR, intensity: 0.9, life: delay + FALL_TIME });

  let t = -delay, landed = false;
  addEffect({
    update(dt) {
      t += dt;
      if (t < 0) return true;
      if (landed) return false;
      group.visible = true;
      const k = Math.min(1, t / FALL_TIME);
      group.position.lerpVectors(start, landing, k * k);
      meteor.rotation.y += dt * 14;
      // streak grows as it accelerates
      streak.scale.set(1, 1.5 + k * 5, 1);
      // a thin trail of sparks: a dense stream of soft particles smears into a pale column from above
      for (let i = 0; i < 3; i++) particles.glow.spawn({
        x: group.position.x + rand(-0.25, 0.25), y: group.position.y + rand(-0.25, 0.25), z: group.position.z + rand(-0.25, 0.25),
        vx: -dir.x * 3 + rand(-0.6, 0.6), vy: -dir.y * 3 + rand(-0.6, 0.6), vz: -dir.z * 3 + rand(-0.6, 0.6),
        life: 0.45, size: rand(0.12, 0.3), sizeEnd: 0.02, color: col(i % 2 ? COLOR : CORE, 2.4), colorEnd: col(0x1040ff, 0.4), drag: 2,
      });
      if (k >= 1) { landed = true; marker.cancel(); impact(player, def, landing, fall); }
      return true;
    },
    dispose() { G.scene.remove(group); streakMat.dispose(); },
  });
}

/** A crystal's impact at `p`, one of its cast's (`fall`). */
function impact(player: Player, def: Def, p: THREE.Vector3, fall: Fall): void {
  const { blasted, judged } = fall;
  const at = new THREE.Vector3(p.x, p.y + 0.3, p.z);
  // a slim pillar: a wide pale one blooms into a haze over the whole impact. Its top stays as it fades, long enough
  // that the next crystal's comes while it's lit: sinking and gone in 0.3 s, each pillar's top lit the top of the
  // over-the-shoulder view and left it before the next landed 0.14 s on, 3 flashes a second, `lab cast starfall`
  lightPillar(p, { color: CORE, intensity: 1.8, radius: 0.25, height: 7, life: 0.5, sink: 0 });
  shockwave(p, { color: COLOR, intensity: 1.3, from: 0.4, to: def.radius * 1.25, life: 0.35, y: p.y + 0.06 });
  crackDecal(p, { size: def.radius * 0.95, color: COLOR, intensity: 2.2, life: 3.5 });
  decal(p, { type: 'scorch', size: def.radius * 0.8, life: 7 });
  decal(p, { type: 'frost', size: def.radius * 1.0, life: 4, opacity: 0.35 });
  crystalBurst(p, {
    count: 7, radius: def.radius * 0.55, color: COLOR, life: 1.0, scale: 1.1,
    onShatter: (c) => burst(c, { count: 8, color: COLOR, colorEnd: 0x1040ff, speed: 3, up: 3, life: 0.5, size: 0.2, gravity: 10 }),
  });
  burst(at, { count: 30, color: COLOR, colorEnd: 0x1040ff, speed: 8, up: 5, life: 0.6, size: 0.26, gravity: 14 });
  burst(at, { count: 14, color: ICE, speed: 5, up: 7, life: 0.8, size: 0.15, gravity: 18 });
  debris(p, { count: 12, speed: 5, size: 0.14 });
  // low dust ring rolling outwards
  const dust = col(0x1c2226);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    particles.smoke.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * 4, vy: 0.3, vz: Math.sin(a) * 4, life: 1.2, size: 0.9, sizeEnd: 2.6, color: dust, alpha: 0.45, drag: 2.5 });
  }
  smokePuff(p, { count: 4, color: 0x20303a, alpha: 0.3, size: 1, sizeEnd: 2.5 });
  // lights the impact, not the whole area (several land at once)
  flash({ color: COLOR, intensity: 14, distance: 5, life: 0.3, pos: { x: p.x, y: p.y + 1.5, z: p.z } });
  addShake(0.16);
  sfx.starfallImpact();
  hurtPropsIn(player, p.x, p.z, def.radius * 0.8, PROP_DAMAGE.blast);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.radius * 0.5;
    if (d < def.radius) {
      if (!judged.has(e) && judged.add(e) && evades(e, player, fall.area)) continue;
      // a direct hit takes full damage, easing down to the edge's share (smoothstep: no kinks)
      const x = Math.max(0, d) / def.radius, k = 1 - (1 - def.edge) * x * x * (3 - 2 * x);
      // (struck from above: what it kills is thrown out and high)
      hitEnemy(e, def.damage * k, { by: player, skill: def, tags: def.tags, type: 'arcane', chill: def.chill, knock: 4 * k, from: p, blow: { lift: 0.7 } });
      if (e.corpse) blasted.add(e.corpse);
    }
  }
  // (the bodies lying round thrown up, each once a cast: its crystals land one after another, and thrown by each, a
  // body flew 17 m)
  blastCorpses(p, def.radius * 1.2, 6, { lift: 0.9, once: blasted });
}

/** The point `p` kept inside the arena as far as its crystals may land (`R` in from its edge), in `out`. */
function inArena(p: { x: number; z: number }, out: THREE.Vector3): THREE.Vector3 {
  const R = G.arena.radius - 1, len = Math.hypot(p.x, p.z);
  out.set(p.x, 0, p.z);
  if (len > R) out.multiplyScalar(R / len);
  return out;
}

/** the preview's glow: a ring round what its first crystal strikes, landing on the aim (`radius` round it: the others
 *  land up to `scatter` from it and may strike further, but shown round all they may strike, `scatter` + `radius`, the
 *  ring took in foes no crystal struck), and a faint disc in it; and how high over the floor its cooldown counts down (m) */
const ringGeo = () => floorPatch(0.95, 1, 1, 72);
const discGeo = () => floorPatch(0, 1, 1, 72);
const COUNT_Y = 1.1;

/** The preview's meshes, its glows each with its brightness, and its readiness. */
interface Preview {
  ring: THREE.Mesh; ringG: THREE.BufferGeometry; disc: THREE.Mesh; discG: THREE.BufferGeometry;
  glows: [THREE.MeshBasicMaterial, number][]; ready: Readiness;
}
let preview: Preview | null = null;
const _colour = new THREE.Color(COLOR), _at = new THREE.Vector3();

function previewFor(): Preview {
  if (preview) return preview;
  const ringG = ringGeo(), discG = discGeo();
  const ringMat = additive(COLOR, 1.5, 0.8), discMat = additive(COLOR, 1, 0.12);
  const ring = new THREE.Mesh(ringG, ringMat), disc = new THREE.Mesh(discG, discMat);
  ring.frustumCulled = disc.frustumCulled = false;
  ring.name = 'starfall-preview'; disc.name = 'starfall-preview-disc';
  G.scene.add(ring, disc);
  preview = { ring, ringG, disc, discG, glows: [[ringMat, 1.5], [discMat, 1]], ready: new Readiness('starfall') };
  return preview;
}

/** Shows the area its crystals would strike for `target` (null: nothing shown). */
function showArea(player: Player, def: Def, target: THREE.Vector3 | null, dt: number): void {
  if (!target) {
    if (!preview) return;
    preview.ring.visible = preview.disc.visible = false;
    preview.ready.hide(dt);
    return;
  }
  const p = previewFor(), at = inArena(target, _at), r = def.radius;
  p.ring.visible = p.disc.visible = true;
  p.ready.show(player, def, { x: at.x, y: groundHeight(at.x, at.z) + COUNT_Y, z: at.z }, dt);
  for (const [glow, bright] of p.glows) p.ready.tint(glow.color, _colour, bright);
  for (const [mesh, g] of [[p.ring, p.ringG], [p.disc, p.discG]] as const) {
    mesh.position.set(at.x, 0, at.z);
    mesh.scale.set(r, 1, r);
    lay(g, at.x, at.z, 0.05, r);
  }
}

const skill: InstantSkill = {
  anim: 'summon',
  hits(rawDef) {
    const def = rawDef as Def;
    const edge = `${Math.round(def.edge * 100)}%`;
    return [{ per: 'crystal', base: def.damage, least: def.edge, type: 'arcane', note: `${def.shards} crystals, each full on the foe it lands on, ${edge} at its edge` }];
  },
  warm: () => [new THREE.Mesh(meteorGeo, getMeteorMat()), new THREE.Mesh(streakGeo, streakMaterial()), new THREE.Mesh(ringGeo(), additive(COLOR, 1.5, 0.8))],
  aim: (player, def, target, dt) => showArea(player, def as Def, target, dt),
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    sfx.starfallCall();
    const area: Threat = { kind: 'area', x: target.x, z: target.z, half: def.scatter + def.radius };
    const fall: Fall = { blasted: new Set(), judged: new Set(), area };
    for (let i = 0; i < def.shards; i++) {
      const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : rand(0.6, def.scatter);
      const land = inArena({ x: target.x + Math.cos(a) * r, z: target.z + Math.sin(a) * r }, new THREE.Vector3());
      land.y = groundHeight(land.x, land.z);
      dropMeteor(player, def, land, i * 0.14, fall);
    }
  },
};

export default skill;
