// The traces service's page (traces.mjs serves it to a browser at GET /traces): the summary of what's kept and the
// list, read from the service's own JSON with the session cookie a Dokci link set. One self-contained document, no
// assets of its own, so the CSP can allow nothing but itself; every string a game sent goes in as text, never HTML.

const STYLE = `
:root { color-scheme: dark; --bg: #0f1115; --panel: #171a21; --line: #262b36; --text: #dfe3ea; --dim: #8b93a3;
  --accent: #e0a24a; --good: #6fbf73; --warn: #e07b4a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, "Segoe UI",
  Roboto, sans-serif; }
main { max-width: 1240px; margin: 0 auto; padding: 24px 20px 48px; }
h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
h1 span { color: var(--accent); }
.sub { color: var(--dim); margin: 0 0 20px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; min-width: 0; }
.card b { display: block; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.card small { color: var(--dim); display: block; overflow-wrap: anywhere; }
.meter { height: 6px; background: var(--line); border-radius: 3px; margin-top: 8px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--good); }
.meter i.full { background: var(--warn); }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 20px; }
.split h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); margin: 0 0 6px;
  font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #1e222b; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px;
  font-variant-numeric: tabular-nums; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip em { font-style: normal; color: var(--dim); margin-left: 6px; }
.bar { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.bar input { flex: 1 1 260px; min-width: 0; background: var(--panel); color: var(--text); border: 1px solid var(--line);
  border-radius: 6px; padding: 8px 10px; font: inherit; }
.bar input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
.bar span { color: var(--dim); font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line);
  border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--dim); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
  background: #1a1e26; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.code { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
td.gpu { max-width: 260px; overflow-wrap: anywhere; color: var(--dim); }
td .dim { color: var(--dim); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button { background: #232834; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 8px 16px;
  font: inherit; cursor: pointer; margin-top: 12px; }
button:hover { border-color: var(--accent); }
.empty { color: var(--dim); padding: 24px; text-align: center; }
.note { max-width: 520px; margin: 18vh auto 0; background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 24px 28px; }
.note h1 { margin-bottom: 10px; }
.note p { color: var(--dim); margin: 0; }
@media (max-width: 760px) {
  main { padding: 16px 12px 40px; }
  .note { margin: 14vh 12px 0; }
  .cards { grid-template-columns: 1fr 1fr; }
  .cards .card:last-child:nth-child(odd) { grid-column: 1 / -1; }
  table, tbody, tr, td { display: block; width: 100%; }
  table { background: none; border: 0; }
  thead { display: none; }
  tr { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; padding: 8px 10px;
    display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; }
  td { border: 0; padding: 0; text-align: left; }
  td.num { text-align: left; }
  td[data-k]::before { content: attr(data-k) " "; color: var(--dim); }
  td.code { font-size: 15px; }
  td.when { text-align: right; }
  td.gpu { max-width: none; grid-column: 1 / -1; }
  td.build, td.dl { grid-column: 1 / -1; }
  td.facts { grid-column: 1 / -1; }
}
`;

/** The page's script: the summary, then the list a page at a time, filtered by the server (it holds them all). */
const SCRIPT = `
const PAGE = 100;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of kids) node.append(kid);
  return node;
};
const bytes = (n) => n < 1024 ? n + ' B' : n < 1 << 20 ? (n / 1024).toFixed(1) + ' KB' : (n / (1 << 20)).toFixed(1) + ' MB';
const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  const steps = [[60, 'min'], [24, 'h'], [30, 'd'], [12, 'mo']];
  let v = s / 60, unit = 'min';
  for (let i = 1; i < steps.length && v >= steps[i - 1][0]; i++) { v /= steps[i - 1][0]; unit = steps[i][1]; }
  return Math.floor(v) + ' ' + unit + ' ago';
};
const percent = (f) => f > 0 && f < 0.1 ? (f * 100).toFixed(1) + '%' : Math.round(f * 100) + '%';
const when = (iso) => iso ? el('span', { textContent: ago(iso), title: new Date(iso).toLocaleString() }) : '-';
async function json(path) {
  const r = await fetch(path, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
  if (r.status === 401) { location.reload(); throw new Error('signed out'); }
  if (!r.ok) throw new Error(path + ': ' + r.status);
  return r.json();
}
function card(label, value, note, meter) {
  const c = el('div', { className: 'card' }, el('small', { textContent: label }), el('b'));
  c.querySelector('b').append(value);
  if (note) c.append(el('small', { textContent: note }));
  if (meter !== undefined) {
    const fill = el('i', { className: meter > 0.9 ? 'full' : '' });
    fill.style.width = Math.min(100, meter * 100).toFixed(1) + '%';
    fill.style.minWidth = meter > 0 ? '2px' : '0';
    c.append(el('div', { className: 'meter' }, fill));
  }
  return c;
}
function chips(target, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) target.append(el('span', { className: 'chip', textContent: 'none' }));
  for (const [name, n] of entries) target.append(el('span', { className: 'chip', textContent: name || '(none)' },
    el('em', { textContent: String(n) })));
}
async function summary() {
  const s = await json('/traces/summary');
  const cards = $('cards');
  cards.append(
    card('Traces kept', String(s.count), s.count ? s.prs + ' PRs, ' + s.builds + ' builds' : ''),
    card('Size', bytes(s.bytes), bytes(s.diskBytes) + ' on disk with their lines'),
    card('Oldest', when(s.oldest), s.oldest ? new Date(s.oldest).toLocaleDateString() : ''),
    card('Newest', when(s.newest), s.newest ? new Date(s.newest).toLocaleDateString() : ''),
    card('Disk budget', percent(s.diskFull), 'of ' + bytes(s.diskMax) + ', kept ' + s.keepDays + ' days',
      s.diskFull));
  chips($('scenes'), s.scenes);
  chips($('whys'), s.whys);
}
let shown = 0, total = 0, query = '', asked = 0;
function row(t) {
  const build = el('td', { className: 'build' });
  build.append(el('span', { textContent: t.commit ? t.commit.slice(0, 7) : '-' }));
  if (t.pr) build.append(' ', el('a', { textContent: '#' + t.pr, href: 'https://github.com/VictorZakharov/last-stand/pull/' + t.pr,
    rel: 'noreferrer', target: '_blank' }));
  if (t.bundle) build.append(' ', el('span', { className: 'dim', textContent: t.bundle }));
  const cell = (text, className = '', k = '') => {
    const td = el('td', { className, textContent: text });
    if (k) td.dataset.k = k;
    return td;
  };
  const whenCell = el('td', { className: 'when' });
  whenCell.append(when(t.at));
  return el('tr', {},
    cell(t.code, 'code'), whenCell, build, cell(t.scene || '-', '', 'scene'), cell(t.why || '-', '', 'why'),
    cell(String(t.frames), 'num', 'frames'), cell(t.quality || '-', '', 'quality'), cell(t.gpu || '-', 'gpu'),
    cell(bytes(t.bytes), 'num', 'size'),
    el('td', { className: 'dl' }, el('a', { href: '/traces/' + t.code, textContent: 'download', download: t.code + '.lspt.gz' })));
}
async function more(reset) {
  const ask = ++asked;
  const offset = reset ? 0 : shown;
  const q = encodeURIComponent(query);
  const r = await json('/traces?limit=' + PAGE + '&offset=' + offset + (q ? '&q=' + q : ''));
  if (ask !== asked) return;
  const body = $('rows');
  if (reset) { body.replaceChildren(); shown = 0; }
  for (const t of r.traces) body.append(row(t));
  shown += r.traces.length;
  total = r.total;
  $('count').textContent = total ? shown + ' of ' + total : '';
  $('more').hidden = shown >= total;
  $('empty').hidden = total > 0;
}
let typing;
$('filter').addEventListener('input', (e) => {
  clearTimeout(typing);
  typing = setTimeout(() => { query = e.target.value.trim(); void more(true); }, 200);
});
$('more').addEventListener('click', () => void more(false));
summary().catch((e) => $('cards').append(card('Summary', 'unavailable', e.message)));
more(true).catch((e) => { $('empty').hidden = false; $('empty').textContent = e.message; });
`;

const shell = (title, body, nonce, next = '') => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">${next ? `<meta http-equiv="refresh" content="0; url=${next}">` : ''}
<title>${title}</title><style nonce="${nonce}">${STYLE}</style></head>
<body>${body}</body></html>`;

/** The viewer: the summary and the list, filled by its script. */
export function viewerPage(nonce) {
  return shell('Last Stand traces', `<main>
<h1>Last Stand <span>traces</span></h1>
<p class="sub">Performance traces slow games sent, with their player's consent. Read one with <code>npm run lab -- trace CODE</code>.</p>
<section class="cards" id="cards"></section>
<section class="split">
  <div class="card"><h2>By scene</h2><div class="chips" id="scenes"></div></div>
  <div class="card"><h2>By why</h2><div class="chips" id="whys"></div></div>
</section>
<div class="bar"><input id="filter" type="search" placeholder="Filter by build, PR, scene, why, GPU..." autocomplete="off"><span id="count"></span></div>
<table><thead><tr><th>Code</th><th>When</th><th>Build</th><th>Scene</th><th>Why</th><th>Frames</th><th>Quality</th><th>GPU</th><th>Size</th><th></th></tr></thead>
<tbody id="rows"></tbody></table>
<p class="empty" id="empty" hidden>No traces.</p>
<button id="more" hidden>Show more</button>
</main>
<script nonce="${nonce}">${SCRIPT}</script>`, nonce);
}

/** A short page for a browser that isn't signed in, or whose link didn't hold; or, with `next`, one that has just
 *  signed in and moves on there at once (its own navigation, so it carries the new cookie). */
export function notePage(nonce, heading, text, next = '') {
  const link = next ? ` <a href="${next}">Open</a>` : '';
  return shell(heading, `<div class="note"><h1>${heading}</h1><p>${text}${link}</p></div>`, nonce, next);
}
