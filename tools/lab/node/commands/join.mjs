// `npm run lab -- join`: its command line (help, options) and its run, in the command line's own process
// (node/commands/AGENTS.md).

/** `lab join`, run by the command line itself: no page of the lab's, the owner's live game in its place. */
export default {
  summary: 'joins the game the owner is playing on a PR preview or a dev build, as he invited it (F8, Invite agent, '
    + 'which shows the code; he then lets it in from the game), and runs the lab\'s steps on that live game: '
    + '`join <code>` holds the link in a process of its own (start it as a background task) until the game ends it, '
    + 'and `join look` (the hero, the camera, what\'s under the crosshair, the settings and the panel\'s controls, '
    + 'the frame\'s parts), `join picture` (the player\'s view, or from a camera placed with `--at`, in '
    + '`out/join`), `join set name=value...` (what the developer panel sets; bare, its controls), `join eval '
    + '<code>` (run in the game\'s page, `G`, `THREE` and `dev` in scope), `join status` and `join leave` go through '
    + 'it (never production: the relay opens agent rooms for previews and dev builds alone)',
  help: 'the game the owner is playing on a PR preview or a dev build, joined as he invited it (F8, Invite agent): '
    + 'join <code> holds the link (a background task) until the game ends it; then join look, join picture [--at '
    + 'x,y,z --to x,y,z], join set name=value..., join eval <code>, join status, join leave run on that live game '
    + '(pictures in tools/lab/out/join; tools/lab/commands/join.md)',
  argument: 'code or step',
  options: {
    server: {
      kind: 'text',
      usage: 'url',
      help: 'join <code>: the relay the game invited through, where the invitation names one (wss://ls.wellscoped.dev)',
    },
    at: { kind: 'list', usage: 'x,y,z', help: 'picture: taken from a camera placed here (m), then put back' },
    to: { kind: 'list', usage: 'x,y,z', help: 'picture: the place the camera at --at looks at' },
    yaw: { kind: 'number', usage: 'rad', help: 'picture: the camera at --at turned this far round, without --to' },
    pitch: { kind: 'number', usage: 'rad', help: 'picture: the camera at --at looking this far up, without --to' },
    keep: {
      kind: 'switch',
      help: 'picture: the owner is left looking from the camera at --at, flying and frozen as F9 leaves him',
    },
    side: { kind: 'number', usage: 'px', help: 'picture: its longest side (1280; the frame\'s own if smaller)' },
    png: { kind: 'switch', help: 'picture: a PNG, exact but several times a JPEG\'s size' },
    timeout: { kind: 'number', usage: 's', help: 'how long a step waits for the game\'s answer (30)' },
  },
  async run(options) {
    // (imported as it runs: the command line reads every command's module on each run)
    const { runJoin } = await import('../joinSession.mjs');
    return runJoin(options);
  },
};
