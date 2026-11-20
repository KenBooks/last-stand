// What the traces service answers (traces.mjs `list`, `summary`; reports.mjs `list`, `whole`).

/** A trace's line in the list. */
export interface Trace {
  code: string;
  at: string;
  bytes: number;
  commit: string;
  pr: number | null;
  bundle: string;
  scene: string;
  why: string;
  frames: number;
  gpu: string;
  ua: string;
  quality: string;
}

/** A page of the list, newest first, and how many match in all. */
export interface TraceList {
  traces: Trace[];
  total: number;
}

/** What's kept, in sum. */
export interface Summary {
  count: number;
  bytes: number;
  diskBytes: number;
  oldest: string | null;
  newest: string | null;
  builds: number;
  prs: number;
  scenes: Record<string, number>;
  whys: Record<string, number>;
  keepDays: number;
  diskMax: number;
  diskFull: number;
}

/** A bug report's line in its list: what happened cut to 200 characters. */
export interface ReportLine {
  code: string;
  at: string;
  kind: string;
  text: string;
  picture: boolean;
  bytes: number;
}

/** A page of the reports, newest first, how many in all and their disk's use. */
export interface ReportList {
  reports: ReportLine[];
  total: number;
  diskBytes: number;
  diskMax: number;
  keepDays: number;
}

/** A report whole. */
export interface Report {
  code: string;
  at: string;
  kind: string;
  text: string;
  expected: string;
  facts: string[];
  picture: boolean;
  pictureBytes: number;
}
