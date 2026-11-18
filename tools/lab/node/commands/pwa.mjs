// `npm run lab -- pwa`: its command line (help, options) (node/commands/AGENTS.md).

/** `lab pwa`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a deploy as a returning player meets it (main\'s production build loaded until its offline worker has the '
    + 'page and the fonts, this tree\'s served in its place and reloaded under the old worker, the new one and '
    + 'offline: the game\'s fonts on every load, this tree\'s build on every one after the swap), and the installed '
    + 'app after a PR\'s previews were visited (opened offline, at a pruned preview build and at a closed PR\'s: the '
    + 'game every time)',
  help: 'a deploy as a returning player meets it, the offline worker and all: another commit\'s production build '
    + 'served as Pages serves the game and loaded in a fresh browser until its worker has the page and its fonts, '
    + 'then this tree\'s served in its place and the page reloaded under the old worker, under the new one and '
    + 'offline; every load must show the game\'s fonts, and every one after the swap this tree\'s build (runs in '
    + 'this process, not the server)',
  options: {
    from: {
      kind: 'ref',
      usage: '[=ref]',
      help: 'the commit deployed before (origin/main by default)',
    },
    canary: {
      kind: 'switch',
      help: 'a stale page served on the first reload after the swap, the font stylesheet\'s address broken after '
        + 'it: both must be found',
    },
  },
};
