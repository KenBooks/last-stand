// The bug report's form (ui/bugReport.ts): the kinds of trouble a player picks from, and its limits (the server holds a
// report to the same: server/traces/reports.mjs).

/** A kind of trouble: what the player reads, and what it covers (its id is the server's too: server/traces/reports.mjs
 *  holds the same list, and its tests hold the two alike). */
export interface ReportKind {
  id: string;
  /** on its button */
  label: string;
  /** under the buttons once picked: what belongs here, in the player's words */
  hint: string;
}

/** The kinds, in the order shown: where the trouble shows, as a player would say it, not where its code lies. */
export const REPORT_KINDS: ReportKind[] = [
  { id: 'gameplay', label: 'Gameplay', hint: 'A skill, a foe, loot, a wave or the bank not doing what it should' },
  { id: 'looks', label: 'Looks wrong', hint: 'Something drawn wrong: flickering, a hero or foe bent out of shape, a hole, odd lights' },
  { id: 'slow', label: 'Slow or freezing', hint: 'Low frame rate, stutters, long loading' },
  { id: 'sound', label: 'Sound', hint: 'Music or effects missing, too loud, cut off or out of place' },
  { id: 'controls', label: 'Controls', hint: 'Keys, the mouse, the camera or the touch buttons' },
  { id: 'coop', label: 'Playing together', hint: 'Rooms, joining, partners out of step, the chat' },
  { id: 'menus', label: 'Menus and text', hint: 'A screen, a button, a tooltip or text that overlaps, is cut off or reads wrong' },
  { id: 'saves', label: 'Saves', hint: 'Progress or gear lost, save slots, cloud saves and signing in' },
  { id: 'stuck', label: 'Crash or stuck', hint: 'The game stopped, went black, or left you unable to go on' },
  { id: 'idea', label: 'Idea', hint: 'Not a bug: something you wish the game had or did otherwise' },
  { id: 'other', label: 'Something else', hint: 'Anything the others don\'t cover' },
];

export const BUG_REPORT = {
  /** the most characters of what happened, and of what was expected */
  mostText: 1200,
  mostExpected: 400,
  /** the fewest characters of what happened for a report to say anything */
  leastText: 10,
  /** the picture: its longest side at most (px), as a JPEG of this quality */
  shotSide: 1280,
  shotQuality: 0.8,
  /** the picture's JPEG at most (bytes): over it, it's made again at each lower quality in turn (the server takes
   *  600 KB: server/traces/reports.mjs) */
  mostShotBytes: 600 * 1024,
  lowerQualities: [0.65, 0.5, 0.35],
  /** a line of the game's facts at most (characters: the server's most, a long user agent cut to it) */
  mostFact: 400,
  /** how long a send may take before it's given up (ms) */
  sendTimeoutMs: 20_000,
} as const;
