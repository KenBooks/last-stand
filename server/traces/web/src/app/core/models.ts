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

/** A day's player sums for one kind of site (stats.mjs): production's (`live`) or the test builds'. */
export interface KindSums {
  players: number;
  minutes: number;
  fight: number;
  coop: number;
  sessions: number;
  newPlayers: number;
  /** how many were online in each 5-minute slot of the day (UTC) */
  online: number[];
}

/** A day's sums (`day` as 2026-11-20, UTC). */
export interface DaySums {
  day: string;
  live: KindSums;
  test: KindSums;
}

/** Active players over a day, a week and a month. */
export interface Active {
  day: number;
  week: number;
  month: number;
}

/** The players' sums (GET /traces/stats). */
export interface Stats {
  now: string;
  slotMinutes: number;
  online: { live: number; test: number };
  active: { live: Active; test: Active };
  days: DaySums[];
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
