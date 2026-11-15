// Reading the service with the session cookie a Dokci link set (traces.mjs).
import type { Report, ReportList, Summary, TraceList } from './types';

/** The service's JSON at `path`; a lost session reloads the page, which then says to open it from Dokci. */
async function json<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
  if (response.status === 401) {
    location.reload();
    throw new Error('signed out');
  }
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

export const readSummary = (): Promise<Summary> => json<Summary>('/traces/summary');

/** A page of the list from `offset`, filtered by the server (it holds them all). */
export function readTraces(offset: number, limit: number, query: string): Promise<TraceList> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query) params.set('q', query);
  return json<TraceList>(`/traces?${params}`);
}

/** A page of the bug reports from `offset`, newest first, of one `kind` if given. */
export function readReports(offset: number, limit: number, kind: string): Promise<ReportList> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (kind) params.set('kind', kind);
  return json<ReportList>(`/traces/reports?${params}`);
}

/** A bug report whole. */
export const readReport = (code: string): Promise<Report> => json<Report>(`/traces/reports/${encodeURIComponent(code)}`);

/** Where a bug report's picture is served from (to the session's cookie, as the page is). */
export const reportPictureUrl = (code: string): string => `/traces/reports/${encodeURIComponent(code)}.jpg`;

/** Where a trace's gzip downloads from. */
export const traceUrl = (code: string): string => `/traces/${encodeURIComponent(code)}`;
