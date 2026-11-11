// Aggregate input arrival, not key values: native queues can delay events before their DOM timestamp exists.
export class InputDelivery {
  private downs = 0;
  private ups = 0;
  private handled = 0;
  private editing = 0;
  private pointers = 0;
  private moves = 0;
  private moveDelay = 0;
  private delay = 0;
  private since: number | null = null;

  capture(down: boolean): void { if (down) this.downs++; else this.ups++; }
  accept(editing: boolean, delay: number): void {
    this.handled++;
    if (editing) this.editing++;
    this.delay = Math.max(this.delay, delay);
  }
  pointer(): void { this.pointers++; }
  move(delay: number): void { this.moves++; this.moveDelay = Math.max(this.moveDelay, delay); }

  /** At most one compact row a second, including quiet seconds while the game keeps drawing. */
  sample(now: number, recording: boolean, force = false): string | null {
    if (this.since === null || !recording) { this.reset(now); return null; }
    if (!force && now - this.since < 1000) return null;
    const row = `input ${Math.round(now - this.since)} ms: down ${this.downs}, up ${this.ups}, handled ${this.handled}, editing ${this.editing}, pointer ${this.pointers}, delay ${Math.round(this.delay)} ms, moves ${this.moves}, move delay ${Math.round(this.moveDelay)} ms`;
    this.reset(now);
    return row;
  }

  private reset(now: number): void {
    this.downs = this.ups = this.handled = this.editing = this.pointers = this.delay = 0;
    this.moves = this.moveDelay = 0;
    this.since = now;
  }
}
