// A bug report sent to our own server (ui/bugReport.ts's Send): the traces service beside the co-op relay takes it at
// /traces/reports (server/traces/reports.mjs, where every limit it holds a report to is listed), and to no
// other host. What goes is what the form showed whole: the kind's id, what the player wrote, the facts the game added
// (bugReportText.ts: no name tag, no room's code, no save) and the picture if they left it ticked, as JSON in a plain
// request (a string body: no preflight, no cookies). The service worker never sees it: it answers GETs alone.
import { BUG_REPORT } from '../data/bugReport';
import { serverHttp } from '../net/transport';
import type { ReportDraft } from './bugReportText';

/** What a send came to: the report's code, or why it failed (to say, and to try again). */
export type ReportSent = { code: string } | { error: string };

/** `blob`'s bytes as base64. */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The report's JSON, as the server takes it. */
export async function reportBody(draft: ReportDraft, facts: string[], picture: Blob | null): Promise<string> {
  return JSON.stringify({
    kind: draft.kind.id,
    text: draft.text.trim(),
    expected: draft.expected.trim(),
    facts: facts.map((fact) => fact.slice(0, BUG_REPORT.mostFact)),
    picture: draft.picture && picture ? await base64Of(picture) : null,
  });
}

/** How long `seconds` is, as a player reads it. */
function wait(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) return 'a minute';
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.ceil(minutes / 60)} hours`;
}

/** Why the server turned a report away, in the player's words. */
function refusal(status: number, retryAfter: string | null, said: string): string {
  if (status === 429) {
    const seconds = Number(retryAfter);
    const when = Number.isFinite(seconds) && seconds > 0 ? ` Try again in ${wait(seconds)}.` : ' Try again later.';
    return said.includes('today') ? `The server has taken all the reports it can for today.${when}`
      : `That's as many reports as the server takes from here for now.${when}`;
  }
  if (status === 503) return 'The server is busy. Try again in a moment.';
  if (status === 413 || status === 400) return `The server couldn't take this report (${said || status}).`;
  return `The server answered ${status}. Try again in a while.`;
}

/** The report's JSON posted to the server (`base`: another's, the lab's own); its code back, or why not. */
export async function sendReport(body: string, base = serverHttp()): Promise<ReportSent> {
  try {
    const response = await fetch(`${base}/traces/reports`, {
      method: 'POST', body, cache: 'no-store', credentials: 'omit',
      signal: AbortSignal.timeout(BUG_REPORT.sendTimeoutMs),
    });
    if (!response.ok) {
      const said = (await response.text().catch(() => '')).slice(0, 120);
      return { error: refusal(response.status, response.headers.get('retry-after'), said) };
    }
    const { code } = (await response.json()) as { code: string };
    return { code };
  } catch {
    return { error: 'The server couldn\'t be reached. Check your connection and try again.' };
  }
}
