// `lab coop`'s `chat` scenario judged (page/coopChat.ts plays it): every line said must show on the sayer's screen
// and its partner's, under the sayer's name, as typed (markup shown as text, never read as markup), one too long cut
// to the most a message holds; a burst past the limit held back on both (the sayer told it's too fast); the partner's
// within a second; and Esc in the open box shuts it without opening the pause menu.

/** how late a line may come to the partner's screen (ms: the link's round trip is 300 by default) */
const CHAT_LATE = 1000;
/** the most characters a message holds (the game's `CHAT.most`) and the burst a player may say (`CHAT.burst`) */
const MOST = 200;
const BURST = 5;
/** the frames Esc has to shut the box */
const ESC_FRAMES = 5;

/** the names each role's lines show under (the lab's name tags, node/coop.mjs `PARTY_TAGS`) */
const NAMES = { host: 'Host', guest: 'Guest' };

/** The first frame `samples` show a line under `name` reading `text`, its `nth` such line (0 the first), or -1. */
export function firstShown(samples, name, text, nth = 0) {
  for (let frame = 0; frame < samples.length; frame++) {
    const lines = samples[frame].chat?.lines ?? [];
    if (lines.filter((line) => line.name === name && line.text === text).length > nth) return frame;
  }
  return -1;
}

/** The most lines under `name` starting with `start` a screen showed at once. */
function mostShown(samples, name, start) {
  return Math.max(0, ...samples.map((sample) => (sample.chat?.lines ?? []).filter((line) => line.name === name && line.text.startsWith(start)).length));
}

/** The scenario's chat judged: `host` and `guest` are the two games' samples, frame for frame. */
export function judgeChat({ host, guest, frameMs }) {
  const said = guest[0]?.said ?? host[0]?.said;
  const escAt = guest[0]?.escAt ?? host[0]?.escAt;
  const quiet = guest[0]?.quiet ?? host[0]?.quiet;
  if (!said) return { lines: ['no chat in this tree'], problems: [] };
  const screens = { host, guest };
  const lines = [];
  const problems = [];
  const late = CHAT_LATE / frameMs;
  // each line said once (the burst's are judged by count): as typed, or cut to the most a message holds
  for (const one of said.filter((s) => !s.text.startsWith('quick '))) {
    const other = one.by === 'host' ? 'guest' : 'host';
    const shown = one.text.length > MOST ? one.text.slice(0, MOST) : one.text;
    const what = `the ${one.by}'s line "${one.text.length > 40 ? `${one.text.slice(0, 20)}... (${one.text.length} characters)` : one.text}"`;
    const own = firstShown(screens[one.by], NAMES[one.by], shown);
    const there = firstShown(screens[other], NAMES[one.by], shown);
    if (own < 0) problems.push(`${what}: never on its own screen as ${shown.length < one.text.length ? `cut to ${MOST}` : 'typed'}`);
    if (there < 0) problems.push(`${what}: never on the ${other}'s screen as ${shown.length < one.text.length ? `cut to ${MOST}` : 'typed'}`);
    else if (own >= 0 && there - own > late) problems.push(`${what}: on the ${other}'s screen ${Math.round((there - own) * frameMs)} ms later`);
    if (own >= 0 && there >= 0) lines.push(`${what}: on the ${other}'s screen ${Math.round((there - own) * frameMs)} ms later, as ${shown.length < one.text.length ? `cut to ${MOST}` : 'typed'}`);
  }
  // the burst: as many as it lets through, on both, the sayer told
  const quick = said.filter((s) => s.text.startsWith('quick ')).length;
  if (quick) {
    const ownQuick = mostShown(guest, NAMES.guest, 'quick ');
    const hostQuick = mostShown(host, NAMES.guest, 'quick ');
    const told = Math.max(0, ...guest.map((sample) => (sample.chat?.lines ?? []).filter((line) => !line.name && line.text.startsWith('Too fast')).length));
    lines.push(`${quick} lines in a breath: ${ownQuick} on the guest's screen, ${hostQuick} on the host's, the guest told ${told} times it's too fast`);
    if (ownQuick !== BURST || hostQuick !== BURST) problems.push(`a burst of ${quick} let ${ownQuick} through on the guest's screen and ${hostQuick} on the host's, not ${BURST}`);
    if (told < quick - BURST) problems.push(`the guest was told it's too fast ${told} times, not ${quick - BURST}`);
  }
  // Esc: the box shut, the pause menu not opened
  if (escAt) {
    const opened = guest.slice(escAt.open, escAt.esc).some((sample) => sample.chat?.open && sample.chat?.focused);
    const after = guest.slice(escAt.esc + 1, escAt.esc + 1 + ESC_FRAMES);
    const shut = after.length > 0 && after.every((sample) => !sample.chat?.open);
    const paused = after.some((sample) => sample.chat?.menuOpen);
    const altHeld = escAt.alt === undefined ? null : guest.slice(escAt.alt, escAt.alt + 3).some((sample) => sample.chat?.alt === true);
    if (altHeld !== null) {
      lines.push(`Alt pressed in the guest's open box: ${altHeld ? 'held in the game (its cursor over mouse look)' : 'never reached the game'}`);
      if (!altHeld) problems.push('Alt pressed while typing in the chat never reached the game: no cursor over mouse look');
    }
    lines.push(`Enter opened the guest's box ${opened ? 'focused' : 'not focused'}; Esc in it ${shut ? 'shut it' : 'left it open'}, the pause menu ${paused ? 'opened' : 'shut'}`);
    if (!opened) problems.push('Enter never opened the guest\'s chat box with its field focused');
    if (!shut) problems.push('Esc in the chat box left it open');
    if (paused) problems.push('Esc in the chat box opened the pause menu');
  }
  // quiet: still shown a while after the last line, faded once quiet long enough, back as the next comes
  if (quiet && guest[quiet.faded]?.chat?.idle !== undefined) {
    const at = (frame) => guest[frame]?.chat;
    const still = at(quiet.shown)?.idle === false, faded = at(quiet.faded)?.idle === true;
    const back = at(quiet.back)?.idle === false && (at(quiet.back)?.lines ?? []).some((line) => line.text === 'still there?');
    lines.push(`quiet: the guest's chat ${still ? 'still shown' : 'faded'} 7.5 s after its last line, ${faded ? 'faded' : 'still shown'} after 11 s, ${back ? 'back' : 'not back'} with the host's next line`);
    if (!still) problems.push('the guest\'s chat faded before it had been quiet long enough');
    if (!faded) problems.push('the guest\'s chat never faded, quiet for 11 s');
    if (!back) problems.push('the host\'s next line didn\'t bring the guest\'s faded chat back');
  }
  return { lines, problems };
}

/** The scenario's chat in a line each and its problems, for `judgeScenario`. */
export function describeChat(host, guest, frameMs) {
  const { lines, problems } = judgeChat({ host, guest, frameMs });
  return { line: `chat:\n    ${lines.join('\n    ')}`, problems };
}
