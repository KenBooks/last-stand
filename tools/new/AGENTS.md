# `tools/new`

`npm run new -- <kind> <id> [--like <sibling>]`: a new foe, boss, house, place, screen or lab command, started as a
copy of a sibling's files (`README.md`). The rules across the game are the [root AGENTS.md](../../AGENTS.md), the
tools' own [`tools/AGENTS.md`](../AGENTS.md).

- `kinds.mjs`: each kind's files (a path template of `{id}`; one ending in `/` a folder copied whole), its default
  sibling and what is left to do once copied. A kind whose files move (a folder renamed by a refactor) is changed
  here; the test that every kind's default sibling is in the repo fails until it is.
- `scaffold.mjs`: what is written, pure but for the files it's handed: the id renamed as a word of its own (letters
  and digits mark a word's edge, so `_trade.scss` and `trade-ask.html` are renamed, `buildImp` is not), the marker at
  each file's top.
- `new.mjs`: the command line. It refuses an id that isn't camelCase, a sibling that isn't there, and a file already
  there: it never overwrites.
- Copying a sibling was chosen over blank templates: a sibling is always current with its kind's types, a template
  drifts from them unseen. The marker (`NEW_FROM_<sibling>;`, a name nothing declares) is what makes a copy safe:
  the typecheck refuses it until it's rewritten.
