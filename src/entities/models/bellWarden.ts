// The Bell-Warden (entities/bellWarden.ts), the Ossuary Cantor's guard: a cracked bronze bell floating in the air,
// held up by what haunts it: its ghost about it (models/bellGhosts.ts), a pale light hanging under its mouth and a glow
// on the floor beneath. No frame, no yoke, no bearers (from Victor's review: "It's not natural to have small people
// carry such a big bell, and it looks lame when they turn... make a floating bell", "For the final time, can you make
// bells float? Their catapult harness looks very lame"). Built at a whole bell's size and scaled down whole by `Enemy`
// as a guard (`asGuard.size`).
//
// - **It floats** heavily where it rose: a slow bob and sway, never moved or turned (a guard stands).
// - **Its toll**: the bell swings about its own crown as a pendulum, its mouth back, through and out to its forward end
//   as the warning ends (`ActionState.hit`), wider each swing, then dying away (`tollSwing`, `BELL_WARDEN.swing`),
//   shuddering as it rings; its bronze's veins and its clapper glowing over the warning.
// - **As it falls** its haunting fails and it sinks to the floor, tipped on its lip, its ghost scattered.
// Drawn in its crowd (models/crowd.ts): every change is a joint's place or a glow's strength, nothing hidden.
import * as THREE from 'three';
import { additive, createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, radialDecal, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, lathe, organic, skipping } from './shapes';
import { mulberry } from '../../util';
import { bellGhosts, type GhostCue } from './bellGhosts';
import { BELL_WARDEN } from '../../data/foes/bellwarden';
import type { AnimState, Model } from '../../types';

const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** the bell: its lip's radius and its height; how high its crown floats (m: its lip at a hero's waist) */
const LIP = 1.62, BELL_H = 4.6, CROWN_Y = 5.5;
/** how far it sinks as it falls, its haunting failing (its lip on the floor) */
const SINK_DOWN = CROWN_Y - BELL_H - 0.05;

export function buildBellWarden(): Model {
  // (its edge as it dissolves a deep blue: the pale toll's light at three times strength blew its fall out white)
  const kit = createKit(0x3a5cff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // cast bronze gone brown and green, its veins glowing pale from within (bright as it tolls)
  const bronze = kit.std({
    color: 0xa0702e, metalness: 0.5, roughness: 0.5, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9), emissive: new THREE.Color(0xc8d8ff), emissiveMap: veins(23, 6), emissiveIntensity: 0.12,
  });
  const verdigris = kit.std({ color: 0x2f5446, metalness: 0.3, roughness: 0.7, map: g.map, normalMap: g.normalMap });
  const iron = kit.std({ color: 0x3e3b38, metalness: 0.85, roughness: 0.55, roughnessMap: g.roughnessMap, normalMap: g.normalMap });
  const clapper = kit.glow(0xdce8ff, 5);

  const root = new THREE.Group();
  const S = new Sculpt('bellwarden').glow(clapper);
  const r = mulberry(31);

  // --- the bell hung from its crown in the air ---------------------------------------------------------------
  // (`hover` bobs and sways; `swing` at the crown swings the bell as a pendulum for a toll)
  const hover = joint(root, 0, 0, 0);
  const swing = joint(hover, 0, CROWN_Y, 0);
  // its profile bottom to top (faces out): the lip's flare, the sound bow, the waist, the shoulder, the crown
  // (a bell's: the lip flared out over a thick sound bow, a long narrow waist, a rounded shoulder; as shares of the
  // lip's radius and the bell's height, from the lip up)
  const shape: [number, number][] = [
    [0.93, 0], [1, 0.015], [0.99, 0.05], [0.9, 0.1], [0.76, 0.17], [0.64, 0.27], [0.57, 0.42], [0.54, 0.6],
    [0.53, 0.76], [0.52, 0.84], [0.47, 0.9], [0.35, 0.95], [0.18, 0.98], [0.01, 0.99],
  ];
  const profile = shape.map(([rr, h]) => [LIP * rr, -BELL_H + BELL_H * h] as [number, number]);
  /** the bell's outside radius `h` of its height up from the lip */
  const radiusAt = (h: number): number => {
    for (let i = 1; i < shape.length; i++) {
      if (shape[i][1] >= h) {
        const [r0, h0] = shape[i - 1], [r1, h1] = shape[i];
        return LIP * (r0 + (r1 - r0) * (h - h0) / (h1 - h0));
      }
    }
    return 0;
  };
  S.add(made(() => organic(lathe(profile, 40), 0.012, 3, 5)), bronze, swing);
  // its inside, a little in from the outside (top to bottom: its faces point in, where they're seen from)
  S.add(made(() => lathe(profile.map(([rr, y]) => [Math.max(0.01, rr - 0.1), y] as [number, number]).reverse(), 32)), bronze, swing);
  // bands round the sound bow and the shoulder, a verdigris crust under them, the crown's canons (its loops)
  for (const [y, rr] of [0.07, 0.8, 0.84].map((h) => [-BELL_H + BELL_H * h, radiusAt(h) + 0.02] as const)) {
    S.add(made(() => new THREE.TorusGeometry(rr, 0.045, 6, 48).rotateX(Math.PI / 2)), bronze, swing, [0, y, 0]);
  }
  S.add(made(() => new THREE.TorusGeometry(radiusAt(0.14), 0.05, 6, 40).rotateX(Math.PI / 2)), verdigris, swing, [0, -BELL_H + BELL_H * 0.14, 0], [0, 0, 0], [1, 1, 0.6]);
  for (let i = 0; i < 9; i++) {
    // (streaks of verdigris run down from the shoulder's band: thin, where the rain ran off it)
    const a = r() * Math.PI * 2, h = 0.55 + r() * 0.25, y = -BELL_H + BELL_H * h, rr = radiusAt(h) - 0.005;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.25, 3, i)), verdigris, swing, [Math.sin(a) * rr, y, Math.cos(a) * rr], [0, a, 0], [0.07 + r() * 0.06, 0.25 + r() * 0.35, 0.025]);
  }
  for (const x of [-0.35, 0, 0.35]) S.add(made(() => new THREE.TorusGeometry(0.16, 0.05, 6, 12)), bronze, swing, [x, 0.02, 0], [0, Math.PI / 2, 0]);
  // a broken iron ring on the crown, where a headstock once held it: nothing holds it now
  S.add(made(() => new THREE.TorusGeometry(0.34, 0.06, 6, 18, Math.PI * 1.4)), iron, swing, [0, 0.12, 0], [Math.PI / 2, 0, 0.6]);

  // the clapper: an iron rod hung from the crown inside, a pale light at its foot (it hangs below the lip)
  const clap = joint(swing, 0, -0.3, 0);
  S.add(made(() => new THREE.CylinderGeometry(0.05, 0.05, BELL_H - 0.3, 6).translate(0, -(BELL_H - 0.3) / 2, 0)), iron, clap);
  S.add(made(() => new THREE.SphereGeometry(0.3, 16, 12)), clapper, clap, [0, -(BELL_H - 0.1), 0]);
  S.build();

  // the glow on the floor under it: the haunting holding it up (its own mesh, added light: the ground flash's program)
  const pool = additive(0xb8ccff, 0.8, 0.45);
  pool.map = floorGlow();
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), pool);
  under.name = 'bell\'s glow under it';
  under.scale.setScalar(LIP * 1.9);
  under.position.y = 0.06;
  root.add(under);
  // the ghosts haunting it (models/bellGhosts.ts): its own meshes, not its crowd's
  const ghosts = bellGhosts(root);
  // (where the game finds them: a ghost seizes a hero who comes too near, entities/bellWarden.ts)
  root.userData.ghosts = ghosts.seen;
  // (its bell and what it hangs from, where `lab boss --parts swing` reads its swing about its crown and its lag)
  root.userData.bell = swing;
  root.userData.hover = hover;
  const cue: GhostCue = { rush: 0, burst: 0, scatter: 0, bell: new THREE.Vector3() };

  // what it eases through: its sinking as it falls, its shudder as it rings
  let down = 0, shudder = 0;

  function animate(st: AnimState): void {
    const { t, dt } = st, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    // (eased: it sinks as it falls, its haunting failing)
    down += ((dead > 0 ? 1 : 0) - down) * (1 - Math.exp(-dt * 2.2));
    const sink = down * SINK_DOWN;
    const held = 1 - down;
    // floating: a slow bob and drift, the bob its weight's (slower and smaller as it sinks)
    hover.position.y = -sink + (Math.sin(t * 0.85) * 0.14 + Math.sin(t * 0.37 + 1) * 0.06) * held;
    hover.position.x = Math.sin(t * 0.29) * 0.08 * held;
    hover.rotation.set(Math.sin(t * 0.61) * 0.02 * held + down * 0.35, 0, Math.sin(t * 0.47) * 0.02 * held);

    // the bell: swaying a little about its crown; for a toll swung as a pendulum (`tollSwing`)
    const sw = BELL_WARDEN.swing;
    let swingX = Math.sin(t * 0.9) * 0.025 * held, glow = 0.12;
    cue.rush = 0;
    cue.burst = 0;
    if (a?.name === 'toll') {
      const h = a.hit ?? 0.5, back = ramp(a.t, 0, h * 0.85), after = ramp(a.t, h, 1);
      // (the ghosts drawn into the bell over the warning's second half, thrown out of it as it tolls)
      cue.rush = ramp(a.t, h * 0.35, h * 0.95) * (a.t < h ? 1 : 0);
      cue.burst = a.t >= h ? Math.min(1, ramp(a.t, h, Math.min(1, h + 0.3)) + 1e-3) : 0;
      swingX += tollSwing(a.t, h, sw.amp, sw.after);
      // (it shudders as it rings: a small quick tremor dying away after the strike)
      // (eased in over its first moments: begun at full it jolted the bell as a catapult's arm does)
      const u = a.t >= h ? Math.min(1, (a.t - h) / Math.max(0.05, (1 - h) * 0.6)) : 1;
      shudder = (1 - u) ** 2 * Math.min(1, u * 6);
      // (its veins brighten over the warning and fade after: once a toll, no faster than the root's flash rule)
      glow = 0.12 + 3.2 * back * (1 - after) ** 2;
    } else shudder = 0;
    // (its shudder about the crown's own axis, as its swing is: a bell rings in the plane it swings in)
    swing.rotation.x = (swingX + Math.sin(t * 22) * 0.008 * shudder) * held;
    bronze.emissiveIntensity = glow;
    // the clapper hangs behind the bell's swing, its light brighter as it tolls
    clap.rotation.x = -swingX * 0.6 + Math.sin(t * 1.7) * 0.08;
    clap.rotation.z = Math.sin(t * 1.3) * 0.06;
    clapper.emissiveIntensity = 3 + glow * 1.4;
    // the glow under it: its haunting, faint as it fails
    pool.opacity = (0.45 + 0.15 * Math.sin(t * 1.1) + glow * 0.08) * (1 - down * 0.8);
    under.scale.setScalar(LIP * (1.9 - sink * 0.15));

    // its ghost: round the bell, into it for a toll, scattered as it falls
    cue.scatter = Math.max(down, dead);
    cue.bell.set(0, hover.position.y + CROWN_Y - BELL_H * 0.6, 0);
    ghosts.update(t, cue);
  }

  return {
    root, kit, animate, height: CROWN_Y - 1.2,
    reset() {
      down = shudder = 0;
      ghosts.reset();
    },
    dispose() {
      kit.dispose();
      ghosts.dispose();
      pool.dispose();
      under.geometry.dispose();
    },
  };
}

/** the floor glow's picture, made once: a soft round light fading to nothing (its colour fading to black: added
 *  light reads the colour, not the alpha, and a white faded by its alpha alone drew a flat disc with a hard edge) */
let floorGlowMap: THREE.Texture | null = null;
const floorGlow = (): THREE.Texture => (floorGlowMap ??= radialDecal('rgba(255,255,255,1)', 'rgba(0,0,0,1)', false));

/**
 * The bell's turn about its crown through a toll at share `s` of its action, its strike at `h` (rad, forward positive):
 * a pendulum set swinging from rest, back, through and to its forward end `amp` as the warning ends, each swing wider
 * than the last (`width`), the clapper striking at that end; then dying away from rest there by `after` over the rest
 * of the action, as a damped pendulum let go at the top of its swing. Smooth through the strike (no change of speed):
 * swung back and flung through on straight ramps, it jolted 350 rad/s², a catapult's arm.
 */
function tollSwing(s: number, h: number, amp: number, after: number): number {
  if (s < h) {
    const u = s / h;
    // (wider with each swing, full at the strike, where it stops widening)
    const width = amp * (1 - 0.55 * (1 - u) ** 2);
    return -width * Math.sin(1.5 * Math.PI * u);
  }
  const u = (s - h) / Math.max(1e-6, 1 - h), turn = 1.5 * Math.PI;
  return amp * Math.exp(-after * u) * (Math.cos(turn * u) + (after / turn) * Math.sin(turn * u));
}
