// The tavern's mugs, every one of them somewhere at all times (from play: "All cups should be accounted for... if you
// keep asking for drinks you could run out of cups"): on the back counter clean, in the keeper's hand, on the bar or a
// table (full and waiting for a hero, or empty and dirty, waiting for him), in a hero's hand, or in the wash tub. A
// mug only ever moves from one place to another (`move`), never made or lost; the counts of clean, out and dirty always
// add up to `MUG_COUNT`. In co-op the host's ledger is the one truth (world/tavern.ts sends it as it changes, `snapshot`,
// and a guest's game takes it whole, `restore`): two heroes can't take the same mug.
import { MUG_COUNT, SHELF_SLOTS } from '../data/tavern';

/** Where a mug is: on the back counter in a slot, in the keeper's hand, on the bar or a table at a point (room m), in a
 *  hero's hand (the player's id), or in the tub. */
export type MugPlace =
  | { at: 'shelf'; slot: number }
  | { at: 'keeper' }
  | { at: 'bar'; x: number; z: number }
  | { at: 'table'; x: number; z: number; y: number }
  | { at: 'hero'; who: string }
  | { at: 'tub' };

/** A mug: where it is, how full of ale (0 empty to 1), whether it's dirty, and the hero a full one on the bar waits for. */
/** `held`: in a hero's hand undrunk, his drink held at the lift until he drinks it or puts it down (game/drinkChoice.ts) */
export interface Mug { id: number; place: MugPlace; full: number; dirty: boolean; for?: string; held?: boolean }

/** The counts the ledger keeps: clean on the back counter, out in use (his hand, the bar full, a hero's hand), dirty
 *  (on the bar or a table, or in the tub), and their sum, which is always `MUG_COUNT`. */
export interface MugCounts { clean: number; out: number; dirty: number; total: number }

/** The ledger itself. */
export class MugLedger {
  readonly mugs: Mug[];
  /** bumped at every change (world/tavern.ts sends the ledger as it changes, the lab follows it) */
  rev = 0;

  constructor() {
    this.mugs = SHELF_SLOTS.slice(0, MUG_COUNT).map((_, i) => ({ id: i, place: { at: 'shelf', slot: i }, full: 0, dirty: false }));
  }

  /** a mug by its id */
  get(id: number): Mug { return this.mugs[id]; }

  /** the clean mug on the back counter nearest the row's start, or none */
  clean(): Mug | undefined { return this.mugs.find((m) => m.place.at === 'shelf'); }

  /** the dirty mugs left about (on the bar or a table), the keeper's to clear */
  left(): Mug[] { return this.mugs.filter((m) => m.dirty && (m.place.at === 'bar' || m.place.at === 'table')); }

  /** a free slot on the back counter (the first), or -1 */
  freeSlot(): number {
    const taken = new Set(this.mugs.map((m) => (m.place.at === 'shelf' ? m.place.slot : -1)));
    return SHELF_SLOTS.findIndex((_, i) => i < MUG_COUNT && !taken.has(i));
  }

  /** a mug moved to `place`, its ale and dirt as given (what isn't given kept) */
  move(id: number, place: MugPlace, o: { full?: number; dirty?: boolean; for?: string; held?: boolean } = {}): Mug {
    const m = this.mugs[id];
    m.place = place;
    if (o.held !== undefined) m.held = o.held;
    if (o.full !== undefined) m.full = o.full;
    if (o.dirty !== undefined) m.dirty = o.dirty;
    m.for = o.for;
    this.rev++;
    return m;
  }

  /** its ale changed (pouring, drinking): no move */
  fill(id: number, full: number): void {
    if (this.mugs[id].full === full) return;
    this.mugs[id].full = full;
    this.rev++;
  }

  /** the counts, which must always add up */
  counts(): MugCounts {
    let clean = 0, out = 0, dirty = 0;
    for (const m of this.mugs) {
      if (m.place.at === 'shelf') clean++;
      else if (m.dirty || m.place.at === 'tub') dirty++;
      else out++;
    }
    return { clean, out, dirty, total: clean + out + dirty };
  }

  /** the ledger as sent to a co-op guest */
  snapshot(): Mug[] { return this.mugs.map((m) => ({ ...m, place: { ...m.place } })); }

  /** a host's ledger taken whole (a guest's game) */
  restore(mugs: Mug[]): void {
    if (mugs.length !== this.mugs.length) return;
    mugs.forEach((m, i) => { this.mugs[i] = { ...m, place: { ...m.place } }; });
    this.rev++;
  }
}
