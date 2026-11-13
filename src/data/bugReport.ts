// The bug report's form (ui/bugReport.ts): the kinds of trouble a player picks from, and its limits.

/** A kind of trouble: what the player reads, and the labels an issue made of the report takes (the repo's own). */
export interface ReportKind {
  id: string;
  /** on its button */
  label: string;
  /** under the buttons once picked: what belongs here, in the player's words */
  hint: string;
  /** the GitHub labels of an issue made of it */
  labels: string[];
}

/** every report comes from play */
const FROM_PLAY = 'player feedback';

/** The kinds, in the order shown: where the trouble shows, as a player would say it, not where its code lies. */
export const REPORT_KINDS: ReportKind[] = [
  { id: 'gameplay', label: 'Gameplay', hint: 'A skill, a foe, loot, a wave or the bank not doing what it should', labels: ['bug', FROM_PLAY] },
  { id: 'looks', label: 'Looks wrong', hint: 'Something drawn wrong: flickering, a hero or foe bent out of shape, a hole, odd lights', labels: ['bug', FROM_PLAY] },
  { id: 'slow', label: 'Slow or freezing', hint: 'Low frame rate, stutters, long loading', labels: ['performance', FROM_PLAY] },
  { id: 'sound', label: 'Sound', hint: 'Music or effects missing, too loud, cut off or out of place', labels: ['bug', FROM_PLAY] },
  { id: 'controls', label: 'Controls', hint: 'Keys, the mouse, the camera or the touch buttons', labels: ['bug', FROM_PLAY] },
  { id: 'coop', label: 'Playing together', hint: 'Rooms, joining, partners out of step, the chat', labels: ['bug', FROM_PLAY] },
  { id: 'menus', label: 'Menus and text', hint: 'A screen, a button, a tooltip or text that overlaps, is cut off or reads wrong', labels: ['bug', FROM_PLAY] },
  { id: 'saves', label: 'Saves', hint: 'Progress or gear lost, save slots, cloud saves and signing in', labels: ['bug', FROM_PLAY] },
  { id: 'stuck', label: 'Crash or stuck', hint: 'The game stopped, went black, or left you unable to go on', labels: ['bug', FROM_PLAY] },
  { id: 'idea', label: 'Idea', hint: 'Not a bug: something you wish the game had or did otherwise', labels: ['enhancement', FROM_PLAY] },
  { id: 'other', label: 'Something else', hint: 'Anything the others don\'t cover', labels: [FROM_PLAY] },
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
  /** an issue's title: the kind, then this many characters of what happened at most */
  titleText: 70,
  /** where an issue is opened, filled in (the game's own repository) */
  issues: 'https://github.com/VictorZakharov/last-stand/issues/new',
  /** the longest address an issue is opened with: past it the text is cut, and said to be */
  mostUrl: 6000,
} as const;
