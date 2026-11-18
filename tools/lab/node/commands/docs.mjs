// `npm run lab -- docs`: its command line (help, options) and its run, in the command line's own process
// (node/commands/AGENTS.md).

/** `lab docs`, run by the command line itself: no page, no server. */
export default {
  summary: 'COMMANDS.md\'s list of every command made again from the commands\' modules (each its `summary`, else '
    + 'its `help`; `npm run lab:test` fails while the list is stale)',
  help: 'COMMANDS.md\'s list of the commands made again from their modules (node/commands/<name>.mjs): each one\'s '
    + 'summary, else its help',
  options: {},
  async run() {
    // (imported as it runs: options.mjs reads this module as it builds the commands)
    const { COMMANDS } = await import('../options.mjs');
    const { writeCommandsDoc } = await import('../commandDocs.mjs');
    console.log(writeCommandsDoc(COMMANDS));
    return 0;
  },
};
