// Floating damage readout for training dummies: DPS and total for the current burst
// of hits. A burst ends after a short lull; its result stays up (dimmed) until the next.
import { G } from '../state';
import { anchorLabel, removeLabel } from './floaters';
import { ORDER, type Label } from './overlay/layer';
import { drawText, measure, type Shadow, type TextStyle } from './overlay/paint';

const BURST_GAP = 3; // seconds without hits that end a burst
/** how quickly a finished burst's readout dims (s) */
const DIM_TIME = 0.4;

/** how long a readout takes to fade in or out as he crosses into or out of its area (s) */
export const METER_FADE = { time: 0.35 };

type WorldPos = { x: number; y: number; z: number };

const SHADOWS: Shadow[] = [{ x: 0, y: 1, blur: 3, color: '#000' }, { x: 0, y: 0, blur: 8, color: 'rgba(0,0,0,.8)' }];
const INK_DIM = '#9a8f7c';
const NAME: TextStyle = { face: 'body', size: 11, spacing: 1.5, upper: true, color: INK_DIM, shadows: SHADOWS };
const DPS_VALUE: TextStyle = { face: 'display', weight: 700, size: 22, color: '#f3e1b0', shadows: SHADOWS };
const DPS_UNIT: TextStyle = { face: 'display', size: 15, color: INK_DIM, shadows: SHADOWS };
const SUB: TextStyle = { face: 'body', size: 12, color: INK_DIM, shadows: SHADOWS };
/** room round the text for its shadows (px) */
const PAD = 9;

export class DamageMeter {
  private readonly label: Label;
  private total = 0;
  private hits = 0;
  private first = 0;
  private last = -Infinity;
  private nextDraw = 0;
  private updated = 0;
  /** how much of it shows by his being in its area, and how far a finished burst has dimmed it (each 0..1) */
  private fade = 0;
  private dim = 1;
  private wasIn = false;

  /** `inArea`: whether he's where the readout shows; it fades as he crosses, and counts afresh as he comes back. */
  constructor(
    private readonly name: string,
    getPos: () => WorldPos | null,
    private readonly inArea: () => boolean = () => true,
  ) {
    this.label = anchorLabel(ORDER.bar, () => (this.fade > 0 ? getPos() : null), false, true, true);
    this.paint();
  }

  /** The label it paints (tools/lab reads it against the screen). */
  get readout(): Label { return this.label; }
  /** What's counted now. */
  get burst(): { hits: number; total: number } { return { hits: this.hits, total: this.total }; }

  record(amount: number): void {
    const now = G.time;
    if (now - this.last > BURST_GAP) { this.total = 0; this.hits = 0; this.first = now; }
    this.total += amount;
    this.hits++;
    this.last = now;
    this.nextDraw = 0;
  }

  update(): void {
    // a finished burst's readout dims (as its fade did, over DIM_TIME)
    const dt = Math.max(0, G.time - this.updated);
    this.updated = G.time;
    const inArea = this.inArea();
    if (inArea && !this.wasIn) this.reset();
    this.wasIn = inArea;
    this.fade = Math.max(0, Math.min(1, this.fade + (inArea ? dt : -dt) / METER_FADE.time));
    const target = this.hits > 0 && G.time - this.last > BURST_GAP ? 0.55 : 1, gap = target - this.dim;
    this.dim += Math.sign(gap) * Math.min(Math.abs(gap), (0.45 / DIM_TIME) * dt);
    this.label.alpha = this.dim * this.fade;
    if (this.hits === 0 || G.time < this.nextDraw) return;
    this.nextDraw = G.time + 0.1;
    this.paint();
  }

  /** Nothing counted: the name alone again. */
  private reset(): void {
    if (this.hits === 0) return;
    this.total = 0;
    this.hits = 0;
    this.last = -Infinity;
    this.paint();
  }

  /** The readout as it stands: the name, and with hits counted the DPS and the burst's total under it. */
  private paint(): void {
    const name = measure(this.name, NAME);
    if (this.hits === 0) {
      const w = name.w + PAD * 2, h = name.h + PAD * 2;
      this.label.show({ w, h, anchor: { x: w / 2, y: h - PAD }, paint: (c, s) => drawText(c, name, PAD, PAD, NAME, s) });
      return;
    }
    const active = G.time - this.last <= BURST_GAP;
    const span = Math.max(1, (active ? G.time : this.last) - this.first);
    const value = measure(Math.round(this.total / span).toLocaleString(), DPS_VALUE), unit = measure(' DPS', DPS_UNIT);
    const sub = measure(`${Math.round(this.total).toLocaleString()} total · ${this.hits} hit${this.hits === 1 ? '' : 's'}`, SUB);
    const dpsW = value.w + unit.w, dpsH = Math.max(value.h, unit.h);
    const w = Math.max(name.w, dpsW, sub.w) + PAD * 2, h = name.h + dpsH + sub.h + PAD * 2;
    this.label.show({
      w, h,
      // (hung from the bottom of its last line, as the page's box was, its shadows' room aside)
      anchor: { x: w / 2, y: h - PAD },
      paint: (c, s) => {
        drawText(c, name, (w - name.w) / 2, PAD, NAME, s);
        // (the value and its unit on one baseline, as the page set them)
        const x = (w - dpsW) / 2, base = PAD + name.h + value.ascent;
        drawText(c, value, x, base - value.ascent, DPS_VALUE, s);
        drawText(c, unit, x + value.w, base - unit.ascent, DPS_UNIT, s);
        drawText(c, sub, (w - sub.w) / 2, PAD + name.h + dpsH, SUB, s);
      },
    });
  }

  dispose(): void { removeLabel(this.label); }
}
