// `lab village`'s hall of heroes opened at its dais by E (from play, "choose hero in hall freezes for like 10sec", its
// report's one frame of 7.3 s with 8 programs compiled, numPointLightShadows 2 -> 4): E is heard in the village's own
// update, after the lamps have been placed for the frame, so that frame was drawn with the room's two casting lights
// and the two pooled ones casting at the dais's. The pause menu's Change hero opens it between frames, and never showed
// it. Then, in the hall, a piece of the hero in focus hidden and the shadow map drawn once, which makes his shadow cast
// as one again round its draw: from play, "as I enter hall of heroes ... it lags", its trace's one program compiled
// late the mage's shadow cast as one in its own basic material, left shown by the draw that made it and drawn in the
// frame. Read on one draw, as the lab's frame draws the shadow map again for each of its renders, and the next one hid
// it before the frame's own pass (the owner's didn't). `canary` leaves another pooled light casting as it opens, and
// his shadow cast as one shown after the draw, both of which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { hallFocus, hallHeroes, hallOpen } from '../../../src/game/hall';
import type { Player } from '../../../src/entities/player';
import { closeHeroSelect, heroSelectOpen } from '../../../src/ui/heroSelect';
import { isWarm } from '../../../src/game/warm';
import { objectNear, villageObject } from '../../../src/game/village';
import { pooledLights } from '../../../src/fx/lights';
import { groundHeight } from '../../../src/world/ground';
import { drawnInShadowsOnly } from '../../../src/world/culling';
import type { LightsChecked } from './villageLights';
import { untilInRealTime } from './villageWaits';

/** the frames given to the lobby and to the hero at the dais, the most for the heroes to warm as he nears them, and
 *  the frames read from the press */
const SETTLE = 120;
const WARM_FRAMES = 6000;
const READ_FRAMES = 60;
/** the frames the hall is given to open after E */
const OPEN_FRAMES = 600;
/** the point lights casting that every lit program is made for (`src/world/AGENTS.md`), and the pool's spare the canary
 *  leaves casting */
const CASTING = 2;
const CANARY_LIGHT = 7;

/** How many meshes the shadow map alone draws stand shown in the scene, out of its draw. */
function shadowOnlyShown(): number {
  let shown = 0;
  G.scene.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh && drawnInShadowsOnly(object as THREE.Mesh)) shown++;
  });
  return shown;
}

/** The hero in focus in the hall. */
function inFocus(): Player {
  const hero = hallHeroes()[hallFocus()]?.player;
  if (!hero) throw new Error('lab: village: no hero in focus in the hall');
  return hero;
}

/** A piece of the hall's hero in focus hidden, the shadow map drawn once (no lights: its work round the draw alone),
 *  and how many meshes it alone draws it left shown; how many times his shadow cast as one was made meanwhile too. */
function remadeInOneDraw(canary: boolean): { remade: number; leftShown: number } {
  const hero = inFocus();
  const piece = hero.shadow.pieces[0];
  if (!piece) throw new Error('lab: village: the hero in focus casts no piece as one');
  const madeBefore = hero.shadow.made;
  const shadows = G.renderer.shadowMap;
  piece.visible = false;
  try {
    shadows.render([], G.scene, G.camera);
    if (canary && hero.shadow.mesh) hero.shadow.mesh.visible = true;
    return { remade: hero.shadow.made - madeBefore, leftShown: shadowOnlyShown() };
  } finally {
    piece.visible = true;
    shadows.render([], G.scene, G.camera);
  }
}

/** The point lights in the scene that three counts as casting: on, and shown all the way up. */
function castingNow(): number {
  let casting = 0;
  G.scene.traverseVisible((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && light.castShadow) casting++;
  });
  return casting;
}

/** E at the dais compiles no program, and no frame is drawn with more lights casting than the programs are made for. */
export async function daisOpensCompileNothing(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await lab.step(SETTLE);
  const stand = villageObject('hall')?.stand;
  if (!stand) throw new Error('lab: village: no hall of heroes to stand at');
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand[0], groundHeight(stand[0], stand[1]), stand[1]), Math.PI);
  await lab.until(() => isWarm('heroes'), WARM_FRAMES, 'village: the heroes warming as he nears them');
  await lab.step(SETTLE);
  const spare = pooledLights()[CANARY_LIGHT];
  if (canary) spare.castShadow = true;
  const before = G.renderer.info.programs?.length ?? 0;
  let most = 0;
  lab.drawing = true;
  try {
    const read = (): void => {
      most = Math.max(most, castingNow());
    };
    await lab.step(1, () => ({ keys: ['e'] }), read);
    // (the hall opens once its heroes are prepared, by the page's own time: `villageWaits.ts`)
    await untilInRealTime(lab, hallOpen, OPEN_FRAMES, read);
    await lab.step(READ_FRAMES, undefined, read);
  } finally {
    lab.drawing = false;
    spare.castShadow = false;
  }
  if (!hallOpen()) {
    const nearNow = objectNear()?.id ?? 'nothing';
    throw new Error(`lab: village: E at the dais never opened the hall (near ${nearNow}, mode ${G.mode})`);
  }
  const compiled = (G.renderer.info.programs?.length ?? 0) - before;
  const { remade, leftShown } = remadeInOneDraw(canary);
  if (remade < 1) throw new Error('lab: village: his shadow cast as one was never made again in the hall');
  // (left open, the screen's menu held V from every check after this one)
  if (heroSelectOpen()) closeHeroSelect();
  await lab.until(() => !hallOpen() && !G.menuOpen, 600, 'the hall never closed after the dais opened it');
  const line = `the hall opened by E at its dais: ${compiled} programs compiled, at most ${most} point lights casting `
    + `(its programs are made for ${CASTING}); his shadow cast as one made again in a shadow map's draw, ${leftShown} `
    + `meshes it alone draws left shown after it (none)`;
  const wrong = compiled > 0 || most > CASTING || leftShown > 0;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}
