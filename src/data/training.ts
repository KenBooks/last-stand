// The first visit's training (game/training.ts keeps it, ui/training.ts shows it): the steps a new player takes round
// the village before its portals open, each done as the player does it, in any order.

/** A step of the training. */
export type TrainingStep = 'view' | 'turn' | 'zoom' | 'yard' | 'dummy' | 'map' | 'stash' | 'notice';

/** The training's steps, in the order the tracker lists them: what each asks, the key that does it with a keyboard and
 *  mouse (said beside it then; on touch, its button shows), what it asks on touch where that differs, and whether a
 *  touch screen has it at all (it has one view, turned with the hero: from play, "add to village training list about V
 *  and camera controls, how to rotate the camera in top down etc"). */
export const TRAINING: readonly { id: TrainingStep; text: string; key?: string; touchText?: string; mouseOnly?: boolean }[] = [
  { id: 'view', text: 'Change the view', key: 'V', mouseOnly: true },
  { id: 'turn', text: 'Turn the view from above', key: 'hold the middle mouse button and drag', mouseOnly: true },
  { id: 'zoom', text: 'Zoom the view', key: 'mouse wheel', touchText: 'Pinch to zoom the view' },
  { id: 'yard', text: 'Walk into the training yard' },
  { id: 'dummy', text: 'Strike a training dummy' },
  { id: 'map', text: 'Open the map', key: 'M' },
  { id: 'stash', text: 'Open the stash at the chest' },
  { id: 'notice', text: 'Read the notice board' },
];
