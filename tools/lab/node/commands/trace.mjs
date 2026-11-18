// `npm run lab -- trace`: its command line (help, options) (node/commands/AGENTS.md).

/** `lab trace`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a performance trace a slow game sent (`src/perf`), fetched from the traces service with the token in '
    + '`tools/lab/traces.env` and read as the perf overlay\'s report reads (why it was sent, the boot\'s steps, the '
    + 'frame rate, timings, device and settings, the histories a second at a time, the worst stretches with what '
    + 'happened before each, the worst and long frames, the stages, and the `perf` command that plays it again on its '
    + 'settings); `--latest`, `--build <sha>`, `--list`, `--file` (runs in its own process, no browser)',
  help: 'a performance trace a slow game sent (src/perf/AGENTS.md), fetched from the traces service with the '
    + 'token in tools/lab/traces.env and read as the perf overlay\'s report reads: why it was sent, the frame '
    + 'rate and timings, the device and settings, the histories a second at a time, the worst stretches with what '
    + 'happened before each, the worst frames, the long frames, the stages, and the lab perf command that plays '
    + 'it again on its settings (runs in this process, not the server)',
  argument: 'code',
  mayOmit: true,
  options: {
    latest: { kind: 'switch', help: 'the newest trace sent' },
    build: {
      kind: 'text',
      usage: 'sha',
      help: 'the newest from this commit (or a PR\'s number, or a bundle\'s name)',
    },
    list: { kind: 'switch', help: 'list the traces kept (newest first; with --build, that build\'s alone)' },
    sizes: {
      kind: 'switch',
      help: 'what each part of the trace weighs gzipped (its header, each column by kind), for tuning its format',
    },
    file: {
      kind: 'text',
      usage: 'path',
      help: 'a trace saved before (.lspt.gz, .lspt, or the JSON a stalls --read "window.__traceNow()" writes), '
        + 'read without the server',
    },
    server: {
      kind: 'text',
      usage: 'url',
      help: 'the traces service (TRACES_SERVER in traces.env, else https://ls.wellscoped.dev)',
    },
  },
};
