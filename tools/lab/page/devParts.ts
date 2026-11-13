// The developer panel's frame parts, each unchecked and checked again through its real checkbox, in the village (the
// lobby), the Thornwood and the crypt: the frame's draws and triangles with the part and without, a picture each way
// from the same free-camera spot, the draws of a part's own objects (none without it), and no program made. From the
// owner: "trees 1 check, grass 1 more checkbox ... should work in all environments, village, forest and crypt".
import * as THREE from 'three';
import { G } from '../../../src/state';
import { panelParts, refreshPanel, togglePanel } from '../../../src/dev/panel';
import { freeCamOn, placeFreeCam, setFreeCam } from '../../../src/dev/freeCam';
import { realWait, type Lab, type Pictured, type Report } from './lab';

const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`devparts: missing ${selector}`);
  return found;
};

/** the parts that must have objects drawn in every place, and none drawn without them */
const EVERYWHERE = ['the trees', 'the grass', 'the hero'];
/** where the free camera looks from, over the hero (m): high and behind, the ground, the trees and him in the frame */
const OVER = new THREE.Vector3(0, 16, 26);
const PITCH = -0.42;

/** A part's name without its count, as the panel keys it. */
const keyOf = (name: string): string => name.replace(/ \(\d+\)$/, '');

export async function devParts(lab: Lab, options: { canary: boolean }): Promise<Report> {
  const problems: string[] = [], lines: string[] = [], moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) problems.push(message); };
  if (G.mode !== 'menu') throw new Error('devparts: must boot in the lobby');
  for (let i = 0; !document.getElementById('dev-panel') && i < 100; i++) await realWait(20);
  const click = async (selector: string): Promise<void> => {
    const control = element(selector);
    control.scrollIntoView({ block: 'nearest' });
    await lab.clickOn(control);
    await lab.step(2);
    refreshPanel();
  };
  // (the panels' lobby docks it under a Dev tab; the village's floats it, opened as F8 opens it)
  if (document.querySelector('[data-dev-tab=dev]')) await click('[data-dev-tab=dev]');
  else { togglePanel(true); await lab.step(2); refreshPanel(); }
  if (element('#dev-panel').classList.contains('hidden')) throw new Error('devparts: the panel never opened');
  await lab.showOn({ width: 1280, height: 720, ratio: 1 });
  const programs = (): number => G.renderer.info.programs?.length ?? 0;
  const programsAtFirst = programs();

  /** The screen pictured as `label` (kept with the moments where it's given): its frame's draws and triangles
   *  (shadow maps and post passes too), and how many draws `watched`'s meshes made in it (a mesh's hooks run as it's
   *  drawn, its own hooks still run). The lab's stepped frames draw nothing; a picture's frame does. */
  const drawn = async (watched: THREE.Object3D[], label?: string): Promise<{ calls: number; tris: number; own: number }> => {
    let own = 0;
    const meshes: THREE.Object3D[] = [];
    for (const object of watched) object.traverse((part) => { if ((part as THREE.Mesh).isMesh) meshes.push(part); });
    const kept = meshes.map((mesh) => [mesh.onBeforeRender, mesh.onBeforeShadow] as const);
    meshes.forEach((mesh, i) => {
      const [before, shadow] = kept[i];
      mesh.onBeforeRender = function (...args) { own++; before.apply(this, args); };
      mesh.onBeforeShadow = function (...args) { own++; shadow.apply(this, args); };
    });
    const info = G.renderer.info;
    info.reset();
    let calls = 0, tris = 0;
    try {
      const picture = await lab.screen(label ?? 'devparts-count');
      calls = info.render.calls; tris = info.render.triangles;
      if (label) moments.push(picture);
    } finally {
      meshes.forEach((mesh, i) => { [mesh.onBeforeRender, mesh.onBeforeShadow] = kept[i]; });
    }
    return { calls, tris, own };
  };
  const kilo = (n: number): string => `${(n / 1000).toFixed(1)}k`;

  /** Every part's checkbox unchecked and checked again where the hero stands now, `place` naming it. */
  const throwEach = async (place: string): Promise<void> => {
    const at = G.player.pos;
    placeFreeCam(new THREE.Vector3(at.x + OVER.x, OVER.y, at.z + OVER.z), 0, PITCH);
    await lab.step(3);
    const boxes = [...document.querySelectorAll<HTMLInputElement>('#dev-panel [data-part]')];
    check(boxes.some((box) => box.dataset.part === 'the trees') && boxes.some((box) => box.dataset.part === 'the grass'),
      `${place}: the panel has no Trees or no Grass checkbox`);
    check(!boxes.some((box) => box.dataset.part?.startsWith("what's cut out")), `${place}: Leaves & grass is still there`);
    const whole = await drawn([], `devparts-${place}-all`);
    lines.push(`${place}: every part in, ${whole.calls} draws, ${kilo(whole.tris)} triangles`);
    for (const box of boxes) {
      const key = box.dataset.part!;
      const part = panelParts().find((p) => keyOf(p.name) === key);
      const objects = part?.objects ?? [];
      const had = programs();
      const withIt = await drawn(objects);
      await click(`#dev-panel [data-part="${key}"]`);
      await lab.step(2);
      check(!box.checked, `${place}: ${key} stayed checked`);
      if (options.canary && key === 'the trees') {
        // (a tree put back behind the panel's back: its draws must be caught)
        for (const object of objects) object.traverse((o) => o.layers.set(0));
      }
      const without = await drawn(objects, `devparts-${place}-${key.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-off`);
      await click(`#dev-panel [data-part="${key}"]`);
      await lab.step(2);
      const back = await drawn(objects);
      check(box.checked, `${place}: ${key} didn't check again`);
      check(programs() === had, `${place}: ${key} made programs (${had} to ${programs()})`);
      if (part?.objects) {
        const needed = EVERYWHERE.includes(key);
        if (needed) check(withIt.own > 0, `${place}: ${key} had nothing drawn to take out`);
        check(without.own === 0, `${place}: ${key} unchecked, ${without.own} of its draws were still made`);
        check(back.own === withIt.own, `${place}: ${key} put back drew ${back.own} of its draws, not ${withIt.own}`);
      }
      // (the whole frame's draws move by two or three from one picture to the next with nothing changed: a pooled
      // effect's, the point lights' row read 683 then 686; a part's own are counted exactly above)
      check(Math.abs(back.calls - withIt.calls) <= Math.max(4, withIt.calls * 0.01),
        `${place}: ${key} put back drew ${back.calls} draws, not ${withIt.calls}`);
      const own = part?.objects ? `, its own ${withIt.own} to ${without.own}` : '';
      lines.push(`  ${key}: ${withIt.calls} to ${without.calls} draws, ${kilo(withIt.tris)} to ${kilo(without.tris)} triangles${own}`);
    }
    // every part out at once (the panel's Uncheck all), the picture, then all back
    await click('#dev-panel [data-act=parts]');
    await lab.step(2);
    const none = await drawn([], `devparts-${place}-none`);
    lines.push(`  every part out: ${none.calls} draws, ${kilo(none.tris)} triangles`);
    await click('#dev-panel [data-act=parts]');
    check(boxes.every((box) => box.checked), `${place}: Check all left a part out`);
  };

  // The village (the lobby), from the free camera over the hero.
  setFreeCam(true);
  if (!freeCamOn()) throw new Error('devparts: the free camera never came on');
  await throwEach(G.arena.village ? 'village' : 'lobby');
  setFreeCam(false);

  // A training run in the Thornwood, then the crypt chosen mid-run (the panel's own controls).
  const select = element<HTMLSelectElement>('[data-in=biome]');
  select.value = 'forest'; select.dispatchEvent(new Event('change', { bubbles: true }));
  const training = element<HTMLInputElement>('[data-in=training]');
  if (!training.checked) await click('[data-in=training]');
  await click('#dev-panel [data-act=start]');
  const running = (): boolean => G.mode === 'run';
  for (let i = 0; !running() && i < 6000; i++) { await lab.step(1); await realWait(10); }
  if (!running()) throw new Error('devparts: the run never started');
  for (const biome of ['forest', 'crypt'] as const) {
    if (G.arena.biome !== biome) {
      select.value = biome; select.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; G.arena.biome !== biome && i < 6000; i++) { await lab.step(1); await realWait(10); }
      if (G.arena.biome !== biome) throw new Error(`devparts: the ${biome} never came`);
    }
    setFreeCam(true);
    await throwEach(biome);
    setFreeCam(false);
  }
  lines.push(`programs: ${programsAtFirst} at first, ${programs()} at the end (the fight's warmed by its start), none made by a part`);
  await click('#dev-panel [data-act=lobby]');
  return { text: lines.join('\n'), problems, moments };
}
