// What the traces service answers (traces.mjs: `list`, `summary`).

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
