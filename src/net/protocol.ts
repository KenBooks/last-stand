// Co-op's protocol: which messages and roster a game speaks, so incompatible games don't play together. It is made
// of parts, one line each, kept sorted: a PR whose messages change adds its own line (or bumps its own `-N`), so two
// PRs that both change messages touch different lines instead of fighting over one number (the number it was, bumped
// by every co-op PR, conflicted in 7 of the PRs that rebased in Oct-Nov 2026 and in 5 PRs open at once).

/** what this game's messages are, a part a line, sorted (`scripts/sorted.mjs` checks): `<feature>-<n>: what` */
// sorted
const PARTS = [
  'base-41: every message as of PROTOCOL 41, the last number bumped by hand (net/AGENTS.md tells their history)',
  'houses-1: a house said by its index in ROOM_IDS, now in the order of its file in data/houses/',
];

/** FNV-1a of the parts, as a number the relay keeps on a room's card (it reads `v` as a count under a million) */
function protocolOf(parts: readonly string[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('\n')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

/** the protocol two games must share to play together */
export const PROTOCOL = protocolOf(PARTS);
