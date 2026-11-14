// A bug report's text (ui/bugReport.ts shows the form; bugReportSend.ts sends it): what the player wrote under the kind they picked, then what
// the game adds without asking, so a report sorts itself: where the player was, the hero, solo or together, the build,
// how the game draws and on what. The device and the settings are a performance trace's own (perf/upload.ts), gathered
// once. Nothing of the player's goes in but what they typed: no name tag, no room's code, no save, no item (an
// unbanked one's name least of all).
import { G } from '../state';
import { BIOMES } from '../data/biomes';
import type { ReportKind } from '../data/bugReport';
import { VILLAGE } from '../core/beta';
import { lateCompiles, shaderErrors } from '../core/shaders';
import { hallOpen } from '../game/hall';
import { isCoop, isHost } from '../net/role';
import { device, settings } from '../perf/upload';
import { heroSelectOpen } from './heroSelect';
import { savesOpen } from './saves';
import { isTouch } from './touch';

declare const __BUILD__: { ref: string; time: string };

/** What the player filled in. */
export interface ReportDraft {
  kind: ReportKind;
  text: string;
  expected: string;
  /** whether the picture goes with it */
  picture: boolean;
}

/** Where the player is: the screen, and in a run its wave and what the wave is doing. */
function where(): string {
  if (savesOpen()) return 'the save slots screen';
  if (heroSelectOpen() || hallOpen()) return 'the hero selection screen';
  if (G.mode === 'menu') return VILLAGE ? 'the village (lobby)' : 'the lobby';
  const run = G.run;
  if (!run) return 'a run';
  const state = !G.player.inRun ? 'out of it, watching' : run.phase === 'cleared' ? 'choosing after it' : run.phase;
  return `${run.training ? 'a training run' : 'a run'}, wave ${run.wave} (${state}), ${BIOMES[G.arena.biome]?.title ?? G.arena.biome}`;
}

/** Solo, or how large the party is and who simulates the fight (never its room). */
const party = (): string => (isCoop() ? `together, ${G.players.length} players, ${isHost() ? 'hosting' : 'a guest'}` : 'solo');

const yesNo = (v: unknown): string => (v ? 'yes' : 'no');

/** The lines the game adds, a fact a line: read by a person, and each begun by its name so they can be searched. */
export function reportFacts(): string[] {
  const d = device(), s = settings();
  return [
    `Where: ${where()}`,
    `Hero: ${G.player.cls.name}, ${party()}`,
    `Build: ${__BUILD__.ref} (${__BUILD__.time}) at ${location.host}${location.pathname}`,
    `Graphics: ${s.quality}${s.setting === 'auto' ? ' (Auto)' : ''}, ${s.renderer}, drawn at ${s.scene}, view ${s.view}, vsync ${s.vsync}, HDR ${yesNo(s.hdr)}`,
    `Screen: ${d.screen}, window ${d.window} at ${d.dpr}x, ${isTouch() ? 'touch' : 'mouse and keyboard'}`
      + `, full screen ${yesNo(d.fullscreen)}, installed ${yesNo(d.installed)}`,
    `Device: ${d.gpu || 'GPU unknown'}, ${d.cores} cores${d.memoryGb ? `, ${d.memoryGb} GB` : ''}`,
    `Browser: ${d.ua}`,
    `Shaders: ${lateCompiles.length} compiled late, ${shaderErrors.length} failed`,
    `Time: ${new Date().toISOString()}`,
  ];
}

/** The whole report as text: what the form shows whole before it's sent, and what Copy report copies. */
export function reportText(draft: ReportDraft, facts = reportFacts()): string {
  const parts = [`About: ${draft.kind.label}`, '', 'What happened:', draft.text.trim()];
  if (draft.expected.trim()) parts.push('', 'What was expected:', draft.expected.trim());
  parts.push('', '--- added by the game ---', ...facts);
  if (draft.picture) parts.push('Picture: the game as the form opened, goes with it');
  return parts.join('\n');
}
