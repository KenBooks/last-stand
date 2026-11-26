// What `lab tavern` reads of the wash tub's water as the player sees it (Kenneth's round 5: "He also does not remove
// the lid still, cant see the water"): the frame drawn from above with the hero at the bar's front by the tub and the
// keeper away from it, the water's mean brightness against the wood round it (the tub's rim and the counter's top), and
// the share of its surface the suds' pale heaps cover. The dark water it was (`KEEPER_WAYS5.darkWater`, the canary)
// read as the tub's lid, and must fail it.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { BACK, BAR, TUB } from '../../../src/data/tavern';
import { KEEPER_WAYS5, type TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Lab, Pictured } from './lab';
import { drawFrame } from './light';
import type { Stepper } from './takeAle';

/** the water at least this many times as bright as the wood round it, and the suds at least this share of it */
export const WATER_OVER_WOOD_LEAST = 1.6, SUDS_LEAST = 0.05;
/** how far the keeper must be from the tub for it to be read (m), and how long he's waited for (frames) */
const KEEPER_AWAY = 0.8, AWAY_IN = 1800;
/** the water's disc read (a share of the tub's radius), and the ring of wood round it read (shares) */
const WATER_READ = 0.65, WOOD_RING = [1.05, 1.4] as const;
/** a pixel of the water is a sud's where it's this many times the water's own darkest third's brightness */
const SUD_OVER = 1.25;

/** What it gives `lab tavern`. */
export interface TubSeen { lines: string[]; problems: string[]; moments: Pictured[] }

/** The tub read from above (the view must already be the top's), the hero stood at the bar's front by it. */
export async function tubSeen(lab: Lab, tv: TavernKeeper, run: Stepper, dark: boolean): Promise<TubSeen> {
  const lines: string[] = [], problems: string[] = [], moments: Pictured[] = [];
  const room = tv.keeper()!.root.parent!;
  const tub = room.localToWorld(new THREE.Vector3((BACK.front + BACK.wall) / 2, BACK.top + TUB.water, TUB.z));
  G.player.walkTo = null;
  G.player.place(room.localToWorld(new THREE.Vector3(BAR.x - BAR.half - 0.45, 0, TUB.z)), Math.PI / 2);
  let waited = 0;
  while (waited++ < AWAY_IN && tv.keeper()!.root.getWorldPosition(new THREE.Vector3()).setY(tub.y).distanceTo(tub) < KEEPER_AWAY) {
    await run(1, () => ({}));
  }
  KEEPER_WAYS5.darkWater = dark;
  try {
    await run(3, () => ({}));
    const read = readTub(lab, tub, TUB.r * room.getWorldScale(new THREE.Vector3()).x);
    moments.push(await lab.screen('tub-from-above', [`the tub's water from above${dark ? ' (the canary: dark)' : ''}: `
      + `${read.ratio.toFixed(2)} times as bright as the wood round it, suds ${(read.suds * 100).toFixed(0)}% of it`]));
    lines.push(`round 5: the tub from above${dark ? ' (dark, the canary)' : ''}: its water ${read.ratio.toFixed(2)} times as bright `
      + `as the wood round it (${read.water.toFixed(3)} against ${read.wood.toFixed(3)}), suds ${(read.suds * 100).toFixed(0)}% `
      + `of it, ${read.count} pixels of water read`);
    if (read.count < 20) problems.push(`round 5: the tub's water was hardly on the screen (${read.count} pixels)`);
    if (read.ratio < WATER_OVER_WOOD_LEAST) problems.push(`round 5: the tub's water reads dark from above: ${read.ratio.toFixed(2)} times the wood round it`);
    if (read.suds < SUDS_LEAST) problems.push(`round 5: the tub's suds hardly seen from above: ${(read.suds * 100).toFixed(0)}% of its water`);
  } finally {
    KEEPER_WAYS5.darkWater = false;
  }
  return { lines, problems, moments };
}

/** The frame drawn and its water and the wood round it read: their mean brightness, and the suds' share. */
function readTub(lab: Lab, middle: THREE.Vector3, radius: number): { water: number; wood: number; ratio: number; suds: number; count: number } {
  const frame = drawFrame(lab);
  const camera = G.camera as THREE.PerspectiveCamera;
  camera.updateMatrixWorld();
  const toPixel = (p: THREE.Vector3) => {
    const ndc = p.clone().project(camera);
    return { x: (ndc.x + 1) / 2 * frame.width, y: (ndc.y + 1) / 2 * frame.height };
  };
  const c = toPixel(middle), edge = toPixel(middle.clone().add(new THREE.Vector3(radius, 0, 0)));
  const r = Math.hypot(edge.x - c.x, edge.y - c.y);
  const water: number[] = [], wood: number[] = [];
  const reach = Math.ceil(r * WOOD_RING[1]);
  for (let y = Math.floor(c.y - reach); y <= c.y + reach; y++) {
    for (let x = Math.floor(c.x - reach); x <= c.x + reach; x++) {
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      const out = Math.hypot(x - c.x, y - c.y) / r;
      const at = (y * frame.width + x) * 4, p = frame.pixels;
      const light = 0.2126 * p[at] + 0.7152 * p[at + 1] + 0.0722 * p[at + 2];
      if (out <= WATER_READ) water.push(light);
      else if (out >= WOOD_RING[0] && out <= WOOD_RING[1]) wood.push(light);
    }
  }
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  const sorted = [...water].sort((a, b) => a - b), low = sorted[Math.floor(sorted.length / 3)] ?? 0;
  const suds = water.filter((v) => v > low * SUD_OVER).length / Math.max(1, water.length);
  const w = mean(water), d = mean(wood);
  return { water: w, wood: d, ratio: w / Math.max(1e-4, d), suds, count: water.length };
}
