// Where the over-the-shoulder camera frames a seated hero (tools/lab `sit`): zoomed in all the way, his neck's height
// on the screen sat against standing. From play: "zoom in/out with mouse wheel in 3rd person should zoom in on the
// seated character, not the standing one (if seated)": the camera closed on where a standing hero's shoulders would
// be, over a seated one's head.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { saveCamera, setView, updateCamera, viewMode, zoomBy } from '../../../src/core/renderer';
import type { Lab } from './lab';

/** the mouse wheel's notches in, past the closest the view goes */
const ALL_THE_WAY_IN = -40;
/** the camera's updates of a long step each, to glide to the view and come to rest (as the lab's own pictures in
 *  the game's views: the game puts its own view back every frame) */
const SETTLE = 3;
/** how far his neck may sit on the screen from where it is standing, as a share of the screen's half height */
export const FRAMED_MOST = 0.15;

/** In the third-person view zoomed in all the way: his neck's height on the screen (-1 its bottom, 1 its top), and
 *  its and the camera's over his feet (m). The game's own camera is put back as it was after. */
export interface Framed {
  onScreen: number;
  neck: number;
  camera: number;
}

/** How the third-person view frames him zoomed in all the way, now (`Framed`). */
export function neckOnScreen(lab: Lab): Framed {
  const restore = saveCamera();
  const was = viewMode();
  setView('third');
  zoomBy(ALL_THE_WAY_IN);
  for (let i = 0; i < SETTLE; i++) updateCamera(10, lab.player.pos, lab.framedHeight());
  G.camera.updateMatrixWorld();
  const world = lab.joints.neck.getWorldPosition(new THREE.Vector3());
  const feet = lab.player.pos.y;
  const onScreen = world.clone().project(G.camera).y;
  const framed = { onScreen, neck: world.y - feet, camera: G.camera.position.y - feet };
  setView(was);
  restore();
  return framed;
}
