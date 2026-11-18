// Says which shared files ("hubs") a PR touches and how much of each, for the PR checks' summary: a hub edited by
// many PRs is where rebases conflict (counted over 300 merged PRs, Oct-Nov 2026). A warning, never a failure: shared
// work goes through hubs as it must, and a feature that adds its content as files of its own (a foe in data/foes and
// entities/foes, a lab command in its own module, a panel in src/ui/html, a sound in core/sounds, a message in its
// feature's module) touches none. `node scripts/hubs.mjs [base]` (base: origin/main by default).
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** the hubs, each with the way a feature adds to it without editing it */
// sorted
export const HUBS = {
  'index.html': 'a panel is a part of its own, src/ui/html/<id>.html',
  'src/core/audio.ts': 'a foe\'s or a skill\'s sounds go in core/sounds/<name>.ts',
  'src/core/renderer.ts': 'shared rendering: edit only for rendering work',
  'src/data/enemies.ts': 'a foe is data/foes/<foe>.ts',
  'src/data/guide.ts': 'a foe\'s note is in its data/foes file',
  'src/data/quality.ts': 'a setting is one block, in its alphabetical place',
  'src/entities/enemyAI.ts': 'a foe\'s fx and way of fighting register from entities/foes/<foe>.ts',
  'src/entities/models/index.ts': 'a foe\'s model registers from entities/foes/<foe>.ts',
  'src/game/warmup.ts': 'shared warm-up: edit only for warm-up work',
  'src/main.ts': 'a dialog registers in ui/dialogs.ts, a village object\'s use in game/villageUses.ts',
  'src/net/session.ts': 'a feature\'s messages register in net/messages.ts; its protocol part is a line of net/protocol.ts',
  'src/types.ts': 'a foe\'s ai kind is declared from its own file (`declare module`)',
  'src/ui/menus.ts': 'a panel of its own is a module of its own',
  'tools/lab/COMMANDS.md': 'generated from each command\'s own module',
  'tools/lab/node/commands.mjs': 'a lab command is a module of its own',
  'tools/lab/node/options.mjs': 'a lab command\'s options are in its own module',
  'tools/lab/page/commands.ts': 'a lab command\'s page side is a module of its own',
};

/** The files changed since `base` (the merge base), each with its lines added and removed. */
function changes(base) {
  const since = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
  const rows = execFileSync('git', ['diff', '--numstat', since, 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
  return rows.filter(Boolean).map((row) => {
    const [added, removed, path] = row.split('\t');
    return { path, added: Number(added) || 0, removed: Number(removed) || 0 };
  });
}

/** The report's lines: each hub touched, how much, and how a feature avoids it. */
export function hubReport(changed) {
  const touched = changed.filter((change) => HUBS[change.path] || change.path === 'AGENTS.md');
  if (!touched.length) return ['No shared file touched.'];
  const lines = [`This PR touches ${touched.length} shared file${touched.length === 1 ? '' : 's'}, where rebases conflict:`];
  for (const { path, added, removed } of touched) {
    const way = HUBS[path] ?? 'rules across the game: a feature\'s notes go in its directory\'s AGENTS.md or a note';
    lines.push(`- \`${path}\` (+${added} -${removed}): ${way}`);
  }
  lines.push('', 'Fine for shared work; a feature should add files instead (root AGENTS.md, Workflow).');
  return lines;
}

function main() {
  const base = process.argv[2] ?? 'origin/main';
  const report = hubReport(changes(base)).join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Shared files\n\n${report}\n`);
  for (const line of report.split('\n').filter((l) => l.startsWith('- '))) {
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Shared file::${line.slice(2)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
