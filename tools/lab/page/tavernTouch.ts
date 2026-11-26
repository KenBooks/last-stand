// `lab tavern --parts touch`: tapping a served mug and answering its choice through the real touch controls.
import * as THREE from 'three';
import { KEEPER_TAKE, type TavernKeeper } from '../../../src/world/tavernKeeper';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { BAR } from '../../../src/data/tavern';
import { talkOpen } from '../../../src/ui/screens/talk/talk';
import { middleOf, type Lab, type Report } from './lab';
import { choosingAle, mugOnPage, waitingMug } from './takeAle';

/** Tap the mug, then Put down and Drink. Check the buttons' hit targets and ledger at each transition. */
export async function tavernTouch(lab: Lab, tv: TavernKeeper, canary: boolean): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const leave = document.querySelector<HTMLButtonElement>('#talk .tk-close');
  if (talkOpen() && leave) {
    await lab.tap(middleOf(leave));
    await lab.step(20);
  }
  if (talkOpen()) return { text: 'touch: talk still open', problems: ['touch: could not close the talk before pickup'] };
  const room = G.arena.rooms!.tavern;
  room.serveAle?.(G.player);
  for (let frame = 0; frame < 900 && waitingMug(tv) < 0; frame++) await lab.step(1);
  const id = waitingMug(tv);
  if (id < 0) return { text: 'touch: no ale served', problems: ['touch: no ale served for the tap'] };
  await lab.step(45);

  const tapMug = async (): Promise<boolean | null> => {
    // Keep the mug on the canvas side of the touch stick's pad while staying within reach of the bar.
    if (mugOnPage(tv, id).x < innerWidth * 0.53) {
      const right = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 0).setY(0).normalize();
      G.player.walkTo = null;
      G.player.place(G.player.pos.clone().addScaledVector(right, -0.85), G.player.facing);
      await lab.step(60);
    }
    const at = mugOnPage(tv, id);
    const hit = document.elementFromPoint(at.x, at.y);
    if (hit !== G.renderer.domElement) {
      problems.push(`touch: mug ${id} at ${at.x},${at.y} did not hit the canvas (${hit?.tagName ?? 'off screen'} ${hit?.id ?? ''})`);
      return null;
    }
    await lab.tap(at);
    await lab.step(20);
    if (!input.touchMode) problems.push('touch: the tap did not put the game in touch mode');
    return choosingAle() && tv.mugs.get(id).place.at === 'hero';
  };
  const clickEnabled = KEEPER_TAKE.click;
  if (canary) {
    try {
      KEEPER_TAKE.click = false;
      const took = await tapMug();
      if (took === false) lines.push('touch canary: caught disabled pickup');
      else problems.push('touch canary: disabling pickup did not produce a failed tap on the mug');
    } finally {
      KEEPER_TAKE.click = clickEnabled;
    }
  }
  if (!(await tapMug())) {
    problems.push('touch: tapping the mug did not pick it up and show its choice');
    return { text: lines.join('\n'), problems };
  }
  if (talkOpen()) {
    problems.push('touch: the tap that picked up the mug also opened the keeper’s talk card');
    return { text: lines.join('\n'), problems };
  }

  const tapChoice = async (pick: 'down' | 'drink'): Promise<boolean> => {
    const button = document.querySelector<HTMLButtonElement>(`#drink-choice [data-pick="${pick}"]`);
    if (!button?.checkVisibility()) {
      problems.push(`touch: the ${pick} button was hidden`);
      return false;
    }
    const box = button.getBoundingClientRect();
    const at = middleOf(button);
    const hit = document.elementFromPoint(at.x, at.y);
    if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight
        || box.height < 44 || !button.contains(hit)) {
      const on = button.classList.contains('off') ? 'disabled' : 'enabled';
      const target = hit ? `${hit.tagName}.${hit.className} in #${hit.closest('[id]')?.id}` : 'off screen';
      problems.push(`touch: the ${pick} button was too small or did not take taps `
        + `(${on}, ${Math.round(box.width)}×${Math.round(box.height)}, hit ${target})`);
      return false;
    }
    await lab.tap(at);
    await lab.step(12);
    return true;
  };
  // Stand at the clear front edge of the bar so Put down is offered while carrying the mug.
  G.player.walkTo = null;
  G.player.place(room.group.localToWorld(new THREE.Vector3(BAR.x - BAR.half - 0.4, 0, -1.5)), Math.PI / 2);
  await lab.step(20);
  if (!(await tapChoice('down'))) return { text: lines.join('\n'), problems };
  const down = tv.mugs.get(id);
  if (choosingAle() || down.place.at !== 'bar' || down.full <= 0.5 || down.dirty) {
    problems.push('touch: Put down did not return the same full mug to the bar');
    return { text: lines.join('\n'), problems };
  }
  lines.push(`touch: tapped mug ${id} and put it down full`);
  if (!(await tapMug())) {
    problems.push('touch: the same mug could not be tapped again');
    return { text: lines.join('\n'), problems };
  }
  if (talkOpen()) problems.push('touch: tapping the mug again opened the keeper’s talk card');
  if (!(await tapChoice('drink'))) return { text: lines.join('\n'), problems };
  if (choosingAle() || !G.player.casting?.skill.def.ale) {
    problems.push('touch: Drink did not close the choice and resume the ale cast');
    return { text: lines.join('\n'), problems };
  }
  for (let frame = 0; frame < 330 && G.player.casting?.skill.def.ale; frame++) await lab.step(1);
  const empty = tv.mugs.get(id);
  if (G.player.casting?.skill.def.ale || empty.place.at !== 'bar' || !empty.dirty) {
    problems.push('touch: drinking did not finish with the same dirty mug returned to the bar');
  } else {
    lines.push(`touch: drank mug ${id} and returned it to the bar dirty`);
  }
  await lab.step(1);
  const notice = document.querySelector('#ale-fortified');
  const box = notice?.getBoundingClientRect();
  if (!notice?.checkVisibility() || !box || box.left < 0 || box.top < 0
    || box.right > innerWidth || box.bottom > innerHeight) problems.push('touch: the pending ale notice did not fit');
  return { text: lines.join('\n'), problems };
}
