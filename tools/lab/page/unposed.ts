// A check run with the hero's body left as it stands (the village's walks that read only where he goes: how far he
// walked, where a wall stopped him, whether he got there). His rig's animation, the gait and its leg IK, was 45% of
// such a check's time (`village --only objectsWalkedShort --profile`: `ranger.animate` 36 s of 80), every frame of
// walks whose pose nothing reads. His place, his facing and what moves him are the game's as ever: the rig's
// `animate` alone is skipped, and put back as the check ends. Never for a check that reads or draws his body (his
// shadow, his feet, his pixels in the frame, the hand he casts from).
import { G } from '../../../src/state';

/** `run` with the local hero's rig left unanimated, put back after. */
export async function unposed<T>(run: () => Promise<T>): Promise<T> {
  const model = G.player.model;
  const animate = model.animate;
  model.animate = () => undefined;
  try {
    return await run();
  } finally {
    model.animate = animate;
  }
}
