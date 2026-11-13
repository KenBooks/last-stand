// A command's checks split into shards, run side by side (`lab village --shard k/n`, `lab check --commands village`):
// one after another on one page, the village's took over half an hour on the 4080. Each shard is a run of checks in
// their own order, as some read what the one before left (the hall's heroes chosen, then built behind the lobby):
// dealt round-robin, three of the village's failed in shards of their own.

/**
 * The runs `names` are dealt into, `n` of them in their order, each about as long as the others by `costs`: a run
 * ends once it has its share of what's left to deal (what's left over the runs left, taken afresh at each run, so a
 * check longer than a share takes a run to itself and the rest are shared among the others), never empty while there
 * are names for it. A name that `follows` stays in the run of the name before it.
 */
function runsOf(names: string[], n: number, costs: number[], follows: (name: string) => boolean): string[][] {
  const runs: string[][] = [[]];
  let left = costs.reduce((sum, each) => sum + each, 0);
  let share = left / n;
  let taken = 0;
  names.forEach((name, index) => {
    const run = runs[runs.length - 1];
    const runsLeft = n - runs.length;
    // (a run is full once the next name's middle would lie past its share; the names left must fill the runs left)
    const full = run.length > 0 && taken + costs[index] / 2 > share;
    const needed = run.length > 0 && names.length - index <= runsLeft;
    if (runsLeft > 0 && (full || needed) && !follows(name)) {
      share = left / runsLeft;
      taken = 0;
      runs.push([]);
    }
    runs[runs.length - 1].push(name);
    taken += costs[index];
    left -= costs[index];
  });
  return runs;
}

/** The names `shard` (`k/n`) takes of `names`: the k-th of n runs of them in their order, each about as long by
 *  `cost` (each name's seconds, 1 for all by default), or all of them without one. A name that `follows` runs in the
 *  run of the name before it. */
export function inShard(names: string[], shard?: string, cost: (name: string) => number = () => 1,
  follows: (name: string) => boolean = () => false): string[] {
  if (!shard) return names;
  const [k, n] = shard.split('/').map(Number);
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 1 || k > n) throw new Error(`lab: shard ${shard}`);
  return runsOf(names, n, names.map(cost), follows)[k - 1] ?? [];
}
