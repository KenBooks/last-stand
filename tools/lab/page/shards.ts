// A command's checks split into shards, run side by side (`lab village --shard k/n`, `lab check --commands village`):
// one after another on one page, the village's took over half an hour on the 4080. Each shard is a run of checks in
// their own order, as some read what the one before left (the hall's heroes chosen, then built behind the lobby):
// dealt round-robin, three of the village's failed in shards of their own.

/** The names `shard` (`k/n`) takes of `names`: the k-th of n runs of them in their order, each about as long by
 *  `cost` (each name's seconds, 1 for all by default), or all of them without one. A name that `follows` runs in the
 *  run of the name before it. */
export function inShard(names: string[], shard?: string, cost: (name: string) => number = () => 1,
  follows: (name: string) => boolean = () => false): string[] {
  if (!shard) return names;
  const [k, n] = shard.split('/').map(Number);
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 1 || k > n) throw new Error(`lab: shard ${shard}`);
  const costs = names.map(cost);
  const total = costs.reduce((sum, each) => sum + each, 0);
  let before = 0;
  let run = 0;
  return names.filter((name, index) => {
    // (each in the run its middle falls in; one that follows on from the check before it, in that check's)
    const middle = before + costs[index] / 2;
    before += costs[index];
    if (index === 0 || !follows(name)) run = Math.min(n - 1, Math.floor((middle / total) * n));
    return run === k - 1;
  });
}
