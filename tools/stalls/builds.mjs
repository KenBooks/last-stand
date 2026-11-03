// The WebGPU node builds of a boot (tools/stalls `--builds`): the game records each build three makes behind
// `?builds` (`recordNodeBuilds` in src/core/webgpu.ts), and here they're read off the page and shared out among the
// boot's steps. Each new WGSL shader is a compile of Chrome's on every visit (its cache keeps about 6 MB of a page's),
// so a step's new shaders are what it waits for: the lobby's warm-up on a return compiled 66 again.

/** the most kinds of build a step lists, the most new WGSL first */
const KINDS_SHOWN = 8;

/** `url` asking the game to record its node builds (`?builds`). */
export function withBuilds(url) {
  const asked = new URL(url);
  asked.searchParams.set('builds', '');
  return asked.href;
}

/** What the page recorded of its node builds (run in the page): its list, or null where it kept none (WebGL, or a
 *  build without the recorder). */
export function readBuilds() {
  return window.__webgpuBuilds ?? null;
}

/** A kind of build as a step lists it: what it was for, and whether it was a shadow's. */
const kindOf = (build) => `${build.object} / ${build.material}${build.shadow ? ' (shadow)' : ''}`;

/** `builds` (in the order they were made) with each one's shaders first made by it counted (`fresh`: 0 to 2). */
function withFresh(builds) {
  const seen = new Set();
  return builds.map((build) => {
    let fresh = 0;
    for (const shader of [build.vertex, build.fragment]) {
      if (seen.has(shader)) continue;
      seen.add(shader);
      fresh++;
    }
    return { ...build, fresh };
  });
}

/** The builds of one step: how many, how many reused another's shaders, how many a draw made (not a compile), the
 *  new shaders and their WGSL, the JS they took, and the kinds with the most new WGSL. */
function summaryOf(builds) {
  const kinds = new Map();
  for (const build of builds) {
    const kind = kinds.get(kindOf(build)) ?? { name: kindOf(build), count: 0, shaders: 0, kb: 0 };
    kind.count++;
    kind.shaders += build.fresh;
    kind.kb += build.newBytes / 1024;
    kinds.set(kind.name, kind);
  }
  const sum = (pick) => builds.reduce((total, build) => total + pick(build), 0);
  return {
    count: builds.length,
    reused: builds.filter((build) => build.reused).length,
    byDraw: builds.filter((build) => build.by === 'draw').length,
    shaders: sum((build) => build.fresh),
    kb: sum((build) => build.newBytes) / 1024,
    ms: sum((build) => build.ms),
    kinds: [...kinds.values()].sort((a, b) => b.kb - a.kb || b.count - a.count).slice(0, KINDS_SHOWN),
  };
}

/** `builds` (the page's record, `readBuilds`) shared out among `steps` (`analyze.mjs` `analyzeBoot`'s: each from
 *  `from` for `ms`, on the page's clock), each step's summed (`summaryOf`); null for a step with none. */
export function buildsBySteps(builds, steps) {
  const counted = withFresh(builds);
  return steps.map(({ from, ms }) => {
    const inStep = counted.filter((build) => build.at >= from && build.at < from + ms);
    return inStep.length ? summaryOf(inStep) : null;
  });
}
