// Where the dashboard reads the service (same origin, the session cookie a Dokci link set), and what a lost
// session does.
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';

const BASE = '/traces';

/** The list's page from `offset`, filtered by the server (it holds them all). */
export function tracesUrl(offset: number, limit: number, query: string): string {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query) params.set('q', query);
  return `${BASE}?${params}`;
}

export const summaryUrl = `${BASE}/summary`;

/** Where a trace's gzip downloads from. */
export const traceUrl = (code: string): string => `${BASE}/${encodeURIComponent(code)}`;

/** The players' sums over the last `days` days (stats.mjs). */
export const statsUrl = (days: number): string => `${BASE}/stats?days=${days}`;

/** A page of the bug reports from `offset`, newest first. */
export const reportsUrl = (offset: number, limit: number): string =>
  `${BASE}/reports?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`;

/** A bug report whole. */
export const reportUrl = (code: string): string => `${BASE}/reports/${encodeURIComponent(code)}`;

/** Where a bug report's picture is read from. */
export const reportPictureUrl = (code: string): string => `${reportUrl(code)}.jpg`;

/** A 401 means the session ended: reload, and the server answers with its page saying to open it from Dokci. */
export const signedOutInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) location.reload();
      },
    }),
  );

/** What a failed read says on the page. */
export function errorText(error: unknown): string {
  if (error instanceof HttpErrorResponse) return `${error.url ?? 'the service'}: ${error.status || 'unreachable'}`;
  return error instanceof Error ? error.message : String(error);
}
