// A list read a page at a time ("Show more"), as the traces and the reports are: newest first from the server.
import { HttpClient } from '@angular/common/http';
import { computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorText } from './api';

/** One page as the server answers it: its items and how many there are in all. */
export interface Page<T, R> {
  items: T[];
  total: number;
  /** The whole answer, for what else it says (a disk's sum...). */
  raw: R;
}

/**
 * A list's rows so far, of how many, and the last answer; `reset` starts again from the top (a new filter),
 * `more` adds the next page. An answer to an ask a newer one replaced is dropped.
 */
export class PagedList<T, R> {
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly last = signal<R | undefined>(undefined);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasMore = computed(() => this.items().length < this.total());
  private asked = 0;

  constructor(
    private readonly http: HttpClient,
    private readonly url: (offset: number) => string,
    private readonly pageOf: (answer: R) => Page<T, R>,
  ) {}

  reset(): Promise<void> {
    return this.read(true);
  }

  more(): Promise<void> {
    return this.read(false);
  }

  private async read(reset: boolean): Promise<void> {
    const ask = ++this.asked;
    this.loading.set(true);
    try {
      const answer = await firstValueFrom(this.http.get<R>(this.url(reset ? 0 : this.items().length)));
      if (ask !== this.asked) return;
      const page = this.pageOf(answer);
      this.items.update((items) => (reset ? page.items : [...items, ...page.items]));
      this.total.set(page.total);
      this.last.set(page.raw);
      this.error.set('');
    } catch (error) {
      if (ask === this.asked) this.error.set(errorText(error));
    } finally {
      if (ask === this.asked) this.loading.set(false);
    }
  }
}
