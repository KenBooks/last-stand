// tools/lab `talk`: a whole conversation with the library's Brother Hollis, as a player has it (src/ui/talk.ts, what
// he says in src/data/talk.ts). Walked into the library and up to his table, E opens the talk at a first meeting's
// start: his lines must come one at a time by the game's clock, each given its time to read (`readTime`), a nod as
// each shows, his face turned up to the hero, and the replies only once he's done. Then asked through by every way a
// player picks: a number's key, the arrows and Enter, the mouse on a reply and on his lines (to show the rest), a
// finger's tap, and Leave clicked; each node he goes to must be the reply's. Talked to again with the talk's memory
// kept in the profile (read back from storage): a visit after the first starts otherwise, a topic asked before is
// marked asked and answered otherwise, and once the hero has fought he's offered "What do you make of me?", his class
// and records in the answer. Every state's card and replies must lie within the window, each reply its own at its
// middle. And the frame's cost with the card up, against without it (the browser's own clock). `--canary` shows every
// line at once and pushes Leave off the window's foot, each of which must be found.
import * as THREE from 'three';
import { realWait, type Lab, type PagePoint, type Pictured, type Report } from './lab';
import { SCHOLAR_DESK } from '../../../src/data/houses/library';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { scholarTalk } from '../../../src/world/houses/library';
import { READ, readTime, talkAnswerable, talkNode, talkOpen } from '../../../src/ui/screens/talk/talk';
import { peekProfile } from '../../../src/loot/profile';
import { saveSlot } from '../../../src/loot/saveSlots';
import type { Scholar } from '../../../src/entities/models/scholar';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, useByE, viewAs } from './houses';
import { holdThroughDoor } from './housesDoor';
import { LOOKED, offHero, SEEN_FROM } from './scholar';
import { portraitWaited } from './uiTalk';
import { forgetPortrait, portraitPlant, portraitState } from '../../../src/ui/guide/portraits';
import { enterRoom } from '../../../src/game/rooms';
import { faceCanary, faceChecked } from './folkFaces';

export interface TalkOptions { canary: boolean }

/** the most frames a node's lines may take to show (his longest node: three lines of the most `READ` each, and some) */
const REVEAL_MOST = 600;
/** how much sooner than its reading time a line may come (frames: one frame either way, as the clock steps) */
const EARLY_FRAMES = 2;
/** the frames timed for the frame's cost, with the card up and without it */
const COST_FRAMES = 120;
/** the longest his portrait may take to come after a failed try (ms, the browser's: a retry 1.5 s of the game's on,
 *  then his build and the browser's compile of it, which the lab's clock doesn't hurry) */
const PORTRAIT_MS = 30000;
/** the game's reading times as it has them, taken before a canary plants others: a line is judged by these */
const HONEST = { ...READ };
/** The frames line `text` is due to be given, by the game's own reading times (`readTime` with `HONEST`). */
const dueFrames = (text: string): number =>
  Math.round(Math.min(HONEST.most, Math.max(HONEST.least, HONEST.pause + text.length * HONEST.letter)) * 60);

/** What a node's showing did: how many lines, the frames between them, the nods, and how far off the hero his face. */
interface Revealed { node: string; lines: number; gaps: number[]; nods: number; frames: number; facing: number }

/** The talk's card and its replies, as laid out now. */
const card = (): HTMLElement => document.querySelector<HTMLElement>('#talk .tk-box')!;
const replyButtons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('#talk .tk-reply')];
const lineCount = (): number => document.querySelectorAll('#talk .tk-says p').length;
const saysText = (): string => document.querySelector('#talk .tk-says')?.textContent ?? '';
const middle = (e: Element): PagePoint => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

/** A node's lines followed frame by frame as they show, till the replies are offered. */
async function followReveal(lab: Lab, s: Scholar): Promise<Revealed> {
  const node = talkNode(), nodsFrom = scholarTalk.lines;
  const gaps: number[] = [];
  let frames = 0, last = lineCount(), since = 0;
  while (!talkAnswerable() && frames < REVEAL_MOST) {
    await lab.step(1);
    frames++;
    since++;
    const now = lineCount();
    if (now !== last) {
      if (now !== last + 1) gaps.push(-1);   // (more than one line in a frame)
      else if (last > 0) gaps.push(since);
      last = now;
      since = 0;
    }
  }
  return { node, lines: lineCount(), gaps, nods: scholarTalk.lines - nodsFrom, frames, facing: offHero(s) };
}

/** What's wrong with a node's showing: lines at once or early, a nod missed, the replies never offered, his face away. */
function revealProblems(r: Revealed): string[] {
  const problems: string[] = [];
  const said = [...document.querySelectorAll('#talk .tk-says p')].map((p) => p.textContent ?? '');
  if (!talkAnswerable()) problems.push(`talk: "${r.node}"'s lines never all showed in ${REVEAL_MOST} frames`);
  if (r.gaps.includes(-1)) problems.push(`talk: "${r.node}" showed more than one line in a frame`);
  r.gaps.forEach((gap, i) => {
    const due = dueFrames(said[i]);
    if (gap >= 0 && gap < due - EARLY_FRAMES) problems.push(`talk: "${r.node}"'s line ${i + 2} came ${gap} frames after the one before (due ${due})`);
  });
  if (r.nods !== r.lines) problems.push(`talk: "${r.node}": ${r.nods} nods to ${r.lines} lines`);
  if (r.facing > LOOKED.at) problems.push(`talk: at "${r.node}" his face is ${r.facing.toFixed(0)}° off the hero (at most ${LOOKED.at})`);
  return problems;
}

/** A node's showing as a line of the report. */
const revealLine = (r: Revealed): string =>
  `"${r.node}": ${r.lines} lines over ${r.frames} frames (between them ${r.gaps.join(', ') || 'none'}), ${r.nods} nods, his face ${r.facing.toFixed(0)}° off the hero`;

/** The card and each reply within the window, and each reply the element at its middle. */
function layoutProblems(state: string): string[] {
  const problems: string[] = [];
  const within = (r: DOMRect) => r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  const at = (r: DOMRect) => `${r.left.toFixed(0)},${r.top.toFixed(0)} to ${r.right.toFixed(0)},${r.bottom.toFixed(0)}`;
  const box = card().getBoundingClientRect();
  if (!within(box)) problems.push(`talk (${state}): the card leaves the window: ${at(box)}`);
  for (const b of replyButtons()) {
    const r = b.getBoundingClientRect();
    const name = b.querySelector('.tx')?.textContent ?? '';
    if (!within(r)) problems.push(`talk (${state}): the reply "${name}" leaves the window: ${at(r)}`);
    const { x, y } = middle(b);
    if (within(r) && document.elementFromPoint(x, y)?.closest('.tk-reply') !== b) problems.push(`talk (${state}): the reply "${name}" isn't the element at its middle`);
  }
  return problems;
}

/** The replies offered, as the report names them (asked ones marked). */
const offered = (): string => replyButtons().map((b) => `${b.querySelector('.k')?.textContent}. ${b.querySelector('.tx')?.textContent}${b.classList.contains('asked') ? ' (asked)' : ''}`).join(' | ');

/** The reply whose text is `text`, or a problem. */
function replyNamed(text: string, problems: string[]): HTMLButtonElement | null {
  const b = replyButtons().find((r) => r.querySelector('.tx')?.textContent === text) ?? null;
  if (!b) problems.push(`talk: no reply "${text}" offered at "${talkNode()}" (${offered()})`);
  return b;
}

/** Where his face is pictured from close (world): over his table's chair, at a seated man's eye. */
function faceOf(): THREE.Vector3 {
  const { x, z, turn } = SCHOLAR_DESK;
  return new THREE.Vector3(x + Math.sin(turn) * 0.08, 1.2, z + Math.cos(turn) * 0.08);
}

/** The frame's mean and slowest time (ms, the browser's clock), a game frame and a browser frame each. */
async function frameCost(lab: Lab): Promise<{ mean: number; worst: number }> {
  const times: number[] = [];
  for (let i = 0; i < COST_FRAMES; i++) {
    const from = window.__labClock.realNow();
    await lab.step(1);
    await window.__labClock.realFrame();
    times.push(window.__labClock.realNow() - from);
  }
  times.sort((a, b) => a - b);
  return { mean: times.reduce((a, b) => a + b, 0) / times.length, worst: times[times.length - 1] };
}

/** `lab talk`. */
export async function talk(lab: Lab, options: TalkOptions): Promise<Report> {
  await toVillage(lab);
  const room = G.arena.rooms?.library;
  if (!room) return { text: 'no library: the lobby is not the village', problems: ['no rooms built'] };
  lab.drawing = true;
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const read = { ...READ };
  // (the canary: every line at once, and Leave pushed off the window's foot)
  if (options.canary) Object.assign(READ, { pause: 0, letter: 0, least: 0, most: 0 });
  const plant = document.createElement('style');
  plant.textContent = '#talk .tk-reply.leave { position: relative; top: 100vh; }';
  try {
    await viewAs(lab, 'third');
    const door = villageObject('libraryDoor')!;
    await stand(lab, door.stand, 0);
    // (a house's door takes E held, as a player holds it)
    problems.push(...await holdThroughDoor(lab, door, moments, null));
    await lab.until(() => G.arena.room === 'library', DOOR_FRAMES, "the library's door never took him in");
    await lab.step(15);
    const s = room.folk?.();
    // (held at his table: his rounds would take him off it mid-talk-check)
    const rounds = room.rounds?.();
    if (rounds) rounds.hold = true;
    if (!s) return { text: 'the library has no scholar seated', problems: ['no scholar seated'] };
    // (a hero who's never talked to him, and never fought)
    delete G.profile.talk;
    Object.assign(G.profile.records, { runs: 0, bestWave: 0, banked: 0 });
    const him = villageObject('scholar')!;
    await stand(lab, SEEN_FROM, Math.PI);
    await lab.step(240);
    // (his portrait made behind the lobby, as it is long before a player reaches him)
    const waited = await portraitWaited(lab);
    const programs = G.renderer.info.programs!.length;
    const closed = await frameCost(lab);

    // --- a first meeting ---
    await useByE(lab, him, problems);
    if (!talkOpen()) return { text: 'E at his table opened no talk', problems: [...problems, 'talk: E at his table opened no talk'] };
    if (talkNode() !== 'meet') problems.push(`talk: a first meeting began at "${talkNode()}", not "meet"`);
    const meet = await followReveal(lab, s);
    // (the game's reading time read as the measure reads it: else a line judged early or late is the measure's fault)
    const sample = 'Mm? Ah. A visitor.';
    if (!options.canary && Math.round(readTime(sample) * 60) !== dueFrames(sample)) problems.push('talk: the reading time of the game and of the measure disagree');
    lines.push(`first meeting: ${revealLine(meet)}`, `  offered: ${offered()}`);
    problems.push(...revealProblems(meet), ...layoutProblems('first meeting'));
    const photo = document.querySelector<HTMLCanvasElement>('#talk .tk-photo')!;
    const pictured = document.querySelector('#talk .tk-portrait')!.classList.contains('pictured');
    lines.push(`his portrait: made ${waited} frames after he was stood by, ${pictured ? 'shown' : 'not shown'} in the oval, `
      + `${photo.width}x${photo.height} px`);
    if (!pictured || !photo.width) problems.push('talk: his portrait isn\'t shown in the oval at a first meeting');
    if (options.canary) document.head.append(plant);
    if (replyButtons().some((b) => b.querySelector('.tx')?.textContent === 'What do you make of me?')) {
      problems.push('talk: "What do you make of me?" offered to a hero who has never fought');
    }
    const open = await frameCost(lab);
    moments.push(await lab.screen('talk-first-meeting', ['a first meeting: his lines all shown, the replies offered']));
    moments.push(lab.picture('talk-hollis-looks-up', ['back', 'right'], ['talked to: looked up from his book at the hero'], { at: faceOf(), distance: 0.9 }));
    if (options.canary) {
      problems.push(...layoutProblems('canary'));
      plant.remove();
    }

    // --- himself: by the number's key; then the arrows and Enter ---
    await lab.step(1, () => ({ keys: ['1'] }));
    if (talkNode() !== 'self') problems.push(`talk: key 1 went to "${talkNode()}", not "self"`);
    // (Enter while he speaks shows the rest at once)
    await lab.step(3);
    await lab.step(1, () => ({ keys: ['enter'] }));
    if (!talkAnswerable()) problems.push('talk: Enter while he spoke left lines unshown');
    await lab.step(1, () => ({ keys: ['arrowdown'] }));
    await lab.step(12);
    const focused = document.querySelector('#talk .tk-reply.focus .tx')?.textContent ?? 'none';
    if (focused !== 'Why stay here?') problems.push(`talk: the arrow down put the focus on "${focused}", not "Why stay here?"`);
    moments.push(await lab.screen('talk-choice', [`the arrow down: "${focused}" lit, Enter next picks it`]));
    await lab.step(1, () => ({ keys: ['enter'] }));
    if (talkNode() !== 'stay') problems.push(`talk: Enter on "${focused}" went to "${talkNode()}", not "stay"`);
    // (a click on his lines, once the first shows, shows the rest)
    await lab.until(() => lineCount() > 0, 60, 'his first line never showed');
    await lab.click(middle(document.querySelector('#talk .tk-says')!));
    if (!talkAnswerable()) problems.push('talk: a click on his lines left lines unshown');
    lines.push(`asked "Tell me about yourself." by 1, then "${focused}" by the arrow and Enter, his lines shown by Enter and by a click`);

    // --- the rumour: by the mouse; what lies behind the door, by its key ---
    const more = replyNamed('Something else...', problems);
    if (more) await lab.click(middle(more));
    if (talkNode() !== 'more') problems.push(`talk: "Something else..." clicked went to "${talkNode()}"`);
    lines.push(`  ${revealLine(await followReveal(lab, s))}`);
    const strange = replyNamed('Heard anything strange lately?', problems);
    if (strange) await lab.click(middle(strange));
    const rumour = await followReveal(lab, s);
    lines.push(`  ${revealLine(rumour)}`);
    problems.push(...revealProblems(rumour), ...layoutProblems('the rumour'));
    if (!/behind the great hall/.test(saysText())) problems.push(`talk: the rumour spoke of no door behind the great hall: "${saysText().slice(0, 80)}"`);
    moments.push(await lab.screen('talk-rumour', ['the rumour of the door behind the great hall']));
    await lab.step(1, () => ({ keys: ['1'] }));
    await followReveal(lab, s);
    if (talkNode() !== 'behind' || !/page torn out/.test(saysText())) problems.push(`talk: what lies behind the door said "${saysText().slice(0, 80)}"`);
    const leave = replyButtons().at(-1);
    if (!leave?.classList.contains('leave')) problems.push('talk: the last reply is no Leave');
    if (leave) await lab.click(middle(leave));
    await lab.step(5);
    if (talkOpen()) problems.push('talk: Leave clicked left the talk open');
    if (scholarTalk.talking) problems.push('talk: Leave clicked left him talked to');
    await lab.step(240);
    const away = offHero(s);
    moments.push(lab.picture('talk-hollis-reads-again', ['back', 'right'], ['4 s after Leave: back at his book'], { at: faceOf(), distance: 0.9 }));
    lines.push(`left by Leave: closed, and 4 s on his face ${away.toFixed(0)}° off the hero (back to his book)`);
    if (away < LOOKED.away) problems.push(`talk: 4 s after Leave he still looked at the hero (${away.toFixed(0)}°)`);

    // --- remembered: read back from storage ---
    const kept = peekProfile(G.profile.classId, saveSlot())?.talk?.scholar;
    const heardWant = ['meet', 'self', 'stay', 'more', 'rumour', 'behind'];
    lines.push(`kept in the profile: ${kept ? `${kept.visits} visit, heard ${kept.heard.join(', ')}` : 'nothing'}`);
    if (!kept || kept.visits !== 1) problems.push(`talk: the profile kept ${kept?.visits ?? 'no'} visits, not 1`);
    for (const n of heardWant) if (!kept?.heard.includes(n)) problems.push(`talk: the profile forgot "${n}" was heard`);

    // --- a visit after, the hero having fought: by a finger ---
    Object.assign(G.profile.records, { runs: 3, bestWave: 4, banked: 1 });
    await useByE(lab, him, problems);
    if (talkNode() !== 'back') problems.push(`talk: a visit after began at "${talkNode()}", not "back"`);
    const back = await followReveal(lab, s);
    lines.push(`a visit after: ${revealLine(back)}, "${saysText().slice(0, 70)}..."`, `  offered: ${offered()}`);
    problems.push(...revealProblems(back), ...layoutProblems('a visit after'));
    if (!/conspirator/.test(saysText())) problems.push('talk: a visit after hearing of the door wasn\'t greeted as a fellow conspirator');
    const asked = replyNamed('Heard anything strange lately?', problems);
    if (asked && !asked.classList.contains('asked')) problems.push('talk: the rumour, asked before, isn\'t marked asked');
    const me = replyNamed('What do you make of me?', problems);
    moments.push(await lab.screen('talk-visit-after', ['a visit after: greeted again, the rumour marked asked, his take on the hero offered']));
    if (asked) await lab.tap(middle(asked));
    await lab.step(2);
    if (talkNode() !== 'rumour') problems.push(`talk: the rumour tapped went to "${talkNode()}"`);
    await followReveal(lab, s);
    if (!/The door again/.test(saysText())) problems.push(`talk: the rumour asked again wasn't answered otherwise: "${saysText().slice(0, 60)}"`);
    const again = replyNamed('Something else...', problems);
    if (again) await lab.tap(middle(again));
    await lab.step(2);
    await followReveal(lab, s);
    if (me) {
      const key = replyNamed('What do you make of me?', problems)?.querySelector('.k')?.textContent ?? '5';
      await lab.step(1, () => ({ keys: [key] }));
      const mine = await followReveal(lab, s);
      lines.push(`  "What do you make of me?" by its key ${key}: "${saysText()}"`);
      problems.push(...revealProblems(mine));
      if (!/wave 4/.test(saysText())) problems.push('talk: his take on the hero named no best wave');
      moments.push(await lab.screen('talk-of-the-hero', [`what he makes of the ${G.player.cls.name}: his class and records`]));
    }
    await lab.step(1, () => ({ keys: ['escape'] }));
    await lab.step(5);
    if (talkOpen()) problems.push('talk: Esc left the talk open');
    if (G.menuOpen) problems.push('talk: the Esc that ended the talk opened the pause menu');

    // --- talked to before his portrait is made, its first try failing: a spinner in the oval, then his face, and
    // never a drawing (from play: the card showed a cartoon of him where his picture came back empty) ---
    forgetPortrait('scholar');
    portraitPlant.failNext = 'scholar';
    await useByE(lab, him, problems);
    const oval = document.querySelector('#talk .tk-portrait')!;
    const spun = oval.classList.contains('waiting') && getComputedStyle(oval.querySelector('.tk-wait')!).display !== 'none';
    let came = 0, drawing = false;
    const giveUp = window.__labClock.realNow() + PORTRAIT_MS;
    for (; window.__labClock.realNow() < giveUp && !oval.classList.contains('pictured'); came++) {
      await lab.step(1);
      // (the browser's compile given its time, as `portraitWaited` gives it)
      await realWait(5);
      drawing ||= oval.classList.contains('drawn') || Boolean(oval.querySelector('svg'));
    }
    const failedOnce = portraitPlant.failNext === null;
    portraitPlant.failNext = null;
    const faced = oval.classList.contains('pictured');
    lines.push(`talked to before his portrait was made, its first try failing: ${spun ? 'a spinner' : 'no spinner'} in the oval, `
      + `${faced ? `his face after ${came} frames` : `no face in ${PORTRAIT_MS / 1000} s`}${drawing ? ', a drawing shown meanwhile' : ''}`);
    if (!failedOnce) problems.push('talk: the planted failure of his portrait was never tried');
    if (!spun) problems.push('talk: no spinner in the oval while his portrait was made');
    if (drawing) problems.push('talk: a drawing shown in the oval in place of his portrait');
    if (!faced) problems.push(`talk: his portrait never came after a failed try (${PORTRAIT_MS / 1000} s; ${portraitState()})`);
    await lab.step(1, () => ({ keys: ['escape'] }));
    await lab.step(5);

    const compiled = G.renderer.info.programs!.length - programs;
    lines.push(`the game's renderer compiled ${compiled} programs over the talk`);
    if (compiled) problems.push(`talk: the game's renderer compiled ${compiled} programs over the talk (none may be)`);
    const cost = `the frame with the card up: ${open.mean.toFixed(1)} ms mean, ${open.worst.toFixed(1)} slowest; without it `
      + `${closed.mean.toFixed(1)} ms, ${closed.worst.toFixed(1)} (a game frame and a browser frame each, ${COST_FRAMES} of them)`;
    lines.push(cost);
    // (each of the folk's portraits looking into the camera: Brother Hollis's, then Odo's once his shop is built)
    const faces = [faceChecked('scholar', 'Brother Hollis')];
    enterRoom('merchant');
    await lab.until(() => G.arena.room === 'merchant', 600, "Odo's shop never opened");
    await lab.step(15);
    faces.push(faceChecked('odo', 'Odo'));
    enterRoom('tavern');
    await lab.until(() => G.arena.room === 'tavern', 600, 'the tavern never opened');
    await lab.step(15);
    faces.push(faceChecked('bertram', 'Bertram'));
    for (const f of faces) { lines.push(f.line); problems.push(...f.problems); }
    if (options.canary) {
      for (const [id, name] of [['scholar', 'Brother Hollis'], ['odo', 'Odo'], ['bertram', 'Bertram']] as const) {
        const c = faceCanary(id, name);
        lines.push(c.line);
        problems.push(...c.problems);
      }
    }
    if (options.canary) {
      const caught = { once: problems.some((p) => p.includes('more than one line in a frame') || p.includes('frames after the one before')),
        leave: problems.some((p) => p.includes('(canary)') && p.includes('leaves the window')) };
      lines.push(`canary: every line at once ${caught.once ? 'caught' : 'went unseen'}; Leave off the window ${caught.leave ? 'caught' : 'went unseen'}`);
      const missed = [...(caught.once ? [] : ['talk: the canary\'s lines at once went unseen']), ...(caught.leave ? [] : ['talk: the canary\'s Leave off the window went unseen']),
        ...problems.filter((p) => p.startsWith('canary: '))];
      return { text: lines.join('\n'), problems: missed, moments };
    }
    return { text: lines.join('\n'), problems, moments };
  } finally {
    Object.assign(READ, read);
    plant.remove();
  }
}

