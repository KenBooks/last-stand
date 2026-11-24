// One of the village folk's face in a card's oval (Brother Hollis's talk, Odo's trade): the picture of his own model
// (ui/guide/folkPortraits.ts, made by ui/guide/portraits.ts behind the lobby), a spinner in the oval while it isn't made
// yet (never made in the card's opening frame), tried again if it came back empty, and never the drawing that once
// stood in for it (from play: the card showed a cartoon of him instead of his face). The oval keeps its place and size
// whatever it shows, so nothing round it moves as the picture comes.
// One more of the folk gets his face on a card with an entry in `FOLK` (folkPortraits.ts) and a `FolkFace` on his
// card's oval: `new FolkFace(oval).show(id)` as it opens, `.show(null)` as it closes.
import { drawPortrait, hurryPortrait, portrait, portraitMade, retryPortrait } from './guide/portraits';
import type { FolkId } from './guide/folkPortraits';

/** how long a picture that came back empty waits before it's tried again (s, the game's): each try builds his model */
const RETRY = 1.5;

/** every face on a card, open or not */
const faces = new Set<FolkFace>();

/** A face in an oval (`.folk-face`, a canvas `.folk-photo` and a spinner `.folk-wait` in it). */
export class FolkFace {
  private readonly photo: HTMLCanvasElement;
  /** the picture it shows or waits for */
  private id: FolkId | null = null;
  /** whether it waits for its picture now */
  waiting = false;
  /** a try that came back empty: how long till the next (s), and what's done then */
  private retry: { in: number; then: () => void } | null = null;

  constructor(readonly oval: HTMLElement) {
    this.photo = oval.querySelector<HTMLCanvasElement>('.folk-photo')!;
    faces.add(this);
  }

  /** `id`'s face shown (null: none, the card closed): at once where it's made, else a spinner till it is. */
  show(id: FolkId | null): void {
    this.id = id;
    this.oval.classList.remove('pictured', 'waiting');
    this.waiting = false;
    this.retry = null;
    if (!id) return;
    const shown = (pic: HTMLCanvasElement | null): void => {
      if (this.id !== id) return;
      if (!pic) {
        this.retry = { in: RETRY, then: () => { retryPortrait(id); void portrait(id).then(shown); } };
        return;
      }
      // (a canvas already drawn: copied in, nothing to decode)
      drawPortrait(this.photo, pic);
      this.oval.classList.remove('waiting');
      this.oval.classList.add('pictured');
      this.waiting = false;
    };
    const made = portraitMade(id);
    if (made) { shown(made); return; }
    this.oval.classList.add('waiting');
    this.waiting = true;
    hurryPortrait(id);
    void portrait(id).then(shown);
  }

  /** A frame: a try that came back empty tried again on time. */
  step(dt: number): void {
    if (!this.retry || (this.retry.in -= dt) > 0) return;
    const { then } = this.retry;
    this.retry = null;
    then();
  }
}

/** Whether a face on an open card waits for its picture: it's made then, whatever else holds the build behind the
 *  lobby (main.ts). */
export const facesWaiting = (): boolean => [...faces].some((f) => f.waiting && !f.oval.closest('.hidden'));

/** Every face's frame (main.ts). */
export function stepFaces(dt: number): void {
  for (const f of faces) if (!f.oval.closest('.hidden')) f.step(dt);
}
