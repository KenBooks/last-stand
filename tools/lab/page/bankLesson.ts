// `lab bank`'s lesson (#347): the choice after a wave taught to a new player until they have banked a few times. Each
// choice the command meets is read before its bank: taught (unfolded, not folding by itself) while fewer than
// `BANKS_TAUGHT` banks were made, compact after. It adds no line: the choice is as tall as ever (from review, "Too tall
// dialog now, change of UX, not desired"), and the check finds none of the lines the first take added. The count lives in local storage alone, read afresh as
// each choice opens, so what a reload reads is what the next choice read; the check reads it back from storage too.
// A canary: the count taken out of storage after the banks (as if it were never kept), which the next read must find.
import { BANKS_TAUGHT, LESSON_KEY, banksMade } from '../../../src/ui/choiceLesson';

/** One choice as the player met it: the banks made before it, and whether it was taught. */
export interface ChoiceMet {
  banksBefore: number;
  taught: boolean;
  /** what the choice shows beyond its title, spoils, party, risk and buttons (the first take's lesson and stakes) */
  extra: string[];
}

/** the choice's own parts, as main had them: anything else shown in it makes it taller */
const OWN_PARTS = ['dc-title', 'dc-bag', 'dc-party', 'dc-risk'];

/** The choice shown now: whether it's taught, and any part shown beyond its own. */
export function choiceNow(banksBefore: number): ChoiceMet {
  const box = document.getElementById('decision');
  const parts = [...(box?.querySelectorAll<HTMLElement>('.dc-details > div > *') ?? [])];
  const extra = parts
    .filter((part) => part.offsetHeight > 0 && !OWN_PARTS.some((own) => part.classList.contains(own)))
    .map((part) => part.className);
  return { banksBefore, taught: Boolean(box?.classList.contains('taught')), extra };
}

/** What is wrong with a choice met after `banksBefore` banks: taught while it should be, compact after. */
export function lessonProblems(met: ChoiceMet, when: string): string[] {
  const shouldTeach = met.banksBefore < BANKS_TAUGHT;
  const problems: string[] = [];
  if (met.taught !== shouldTeach) {
    problems.push(`${when}: after ${met.banksBefore} bank(s) the choice is ${met.taught ? 'taught' : 'compact'}, `
      + `not ${shouldTeach ? 'taught' : 'compact'} (${BANKS_TAUGHT} banks teach it)`);
  }
  if (met.extra.length) problems.push(`${when}: the choice shows more than its own parts: ${met.extra.join(', ')}`);
  return problems;
}

/** A line for the report: each choice met, by the banks before it. */
export function lessonLine(choices: ChoiceMet[]): string {
  const each = choices.map((met) => `${met.banksBefore}:${met.taught ? 'taught' : 'compact'}`);
  return `the choice by banks made before it: ${each.join(' ')}`;
}

/** The count of banks as storage keeps it (what a reload reads), checked against the banks made. */
export function keptProblems(banks: number): string[] {
  const expected = Math.min(banks, BANKS_TAUGHT);
  const stored = localStorage.getItem(LESSON_KEY);
  if (Number(stored) === expected && banksMade() === expected) return [];
  return [`after ${banks} banks local storage keeps ${stored ?? 'nothing'} under ${LESSON_KEY}, not ${expected}`];
}

/** Whether a count lost from storage is found by the same checks (the count put back after). */
export function lessonCanaryCaught(banks: number): boolean {
  const kept = localStorage.getItem(LESSON_KEY);
  localStorage.removeItem(LESSON_KEY);
  const caught = keptProblems(banks).length > 0;
  if (kept !== null) localStorage.setItem(LESSON_KEY, kept);
  return caught;
}
