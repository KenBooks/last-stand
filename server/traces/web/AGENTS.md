# `server/traces/web`

Last Stand's operations dashboard (#543): an Angular 22 app (zoneless, standalone, Vitest) that the traces service
serves under `/traces` to a browser signed in from Dokci. How it's built, served and signed in to is
[`server/traces/AGENTS.md`](../AGENTS.md); the rules across the game are the [root AGENTS.md](../../../AGENTS.md).

- `src/app/app.ts` the frame (the name, a link to each section), `app.routes.ts` the sections, each loaded when first
  opened: `traces/` (the summary and the list), `players/` (the player stats: `players-logic.ts`, pure and spec'd, makes the cards, the charts' points and the table from `/traces/stats`) and `reports/` (the bug reports). `core/` what every section shares:
  the service's addresses and the signed-out interceptor (`api.ts`), its answers' types (`models.ts`), a list read a
  page at a time (`paged.ts`), how sizes and ages are written (`format.ts`, spec'd). `shared/` small components
  (`StatCard`, `Chips`, `When`, and `TimeChart`: one measure over time as a line or bars, a crosshair and tooltip at the point nearest the pointer, the arrow keys stepping through it; its layout is `chart-logic.ts`, pure and spec'd). `src/styles.css` what every table and card shares; each component's own look is in
  its `styles`.
- **A new section** is a folder under `src/app/`, a route in `app.routes.ts`, its link in `app.ts` and its path in
  `PAGES` (`../page.mjs`): the server serves the app only at the paths it knows, the same paths as JSON being the API.
- `npm run build` (`ng build`) writes `../dist`; `npm test` runs the specs once. `npm run traces:demo` from the root
  runs the service on sample data to look at it; `-- --pictures` takes its pictures.

## Idiomatic Angular 22: write it this way

As wellscoped-chat's client (`G:\Git\wellscoped-chat\client\AGENTS.md`) writes it, checked against the installed 22.2
types: remove boilerplate newer versions made default.

- **Components:** standalone only, never `standalone: true` or `changeDetection: OnPush` (both defaults in v22).
  Zoneless: state the view reads is a signal. `input()`, `input.required()`, `output()`, `model()`; queries by
  `viewChild()`; host bindings in `host: {}`. Inline `template` and `styles` for small components. Files named by the
  2025 style guide (`traces-page.ts`, class `TracesPage`, no `.component`). A row of a table is a component on the
  `tr` (`tr[appTraceRow]`).
- **Templates** short (split past ~40 lines into child components and pure `toX(...)` view functions), native control
  flow (`@if`, `@for ... track`, `@let`), `[class.x]` and `[style.x]` bindings, no logic beyond simple expressions:
  derive with `computed()`.
- **State:** `signal()`, `computed()`, `linkedSignal()`; `set()`/`update()`. Data loading by
  `httpResource<T>(() => url | undefined)` (`undefined`: don't fetch yet, as a report's row does until it opens);
  `HttpClient` + `firstValueFrom` where a list grows a page at a time (`PagedList`).
- **Services:** new singletons with v22's `@Service()`, `inject()` only.
- **TypeScript** strict, no `any`. **Accessibility:** a label on every control, visible focus, AA contrast.

## Gotchas

- **A chart has one series and one axis** (the dataviz rules): its colour is `--viz` (checked against the panel: OKLCH L 0.48 to 0.67, 3:1 and more; the UI's own accent is too light for a mark), the mark under the pointer `--viz-on`. Every value in a chart is in a table too (`players-table.ts`). Day bars are UTC days, as the service sums them; the online line's times are the viewer's own.
- **The CSP allows no inline script or style but what carries this response's nonce** (`../page.mjs` fills
  `index.html`'s `{{nonce}}`, which Angular reads from `ngCspNonce` for the `<style>`s its components add). Nothing
  may set a `style` attribute in markup or add an inline handler; `[style.x]` bindings are fine (they set the CSSOM).
  Keep `optimization.styles.inlineCritical` off in `angular.json`: its `onload` handler is refused.
- **Every string a game or player sent is written as text** (`{{ }}`, property bindings), never `[innerHTML]`.
- **The short pages** (`public/note.html`, `note.css`) show before signing in, with no script: they don't use the
  app or its hashed stylesheet.
- **Pinned versions** (exact, each at least two weeks old when taken), the lockfile committed: the image runs
  `npm ci` from it.
