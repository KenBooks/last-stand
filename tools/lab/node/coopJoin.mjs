// A co-op guest joining the run its host started (#561: party members "may see none while waiting for the battle to
// begin"), judged from what each game showed (page/coopJoin.ts `JoinState`, `JoinSeen`): the guest's joining bar up,
// on top and saying so while it readies, drawn in the frame before its run began and gone once it's in; the host's
// countdown line naming the guest it waits for, and the guest's party frame there saying how far along it is.

/** what every problem with the guest's own bar says (the canary, which hides it, must be caught by these) */
export const JOIN_CANARY = 'the guest\'s joining bar';
/** the words the guest's bar says as it joins (ui/readying.ts `READYING.join`) */
export const JOIN_LABEL = 'Joining the fight';

/** How a game's `JoinState` reads in a report line. */
function describeBar(join) {
  if (!join.shown) return 'no bar';
  const top = join.onTop ? 'on top' : 'under something';
  return `"${join.label}" ${Math.round(join.share * 100)}%, ${top}`;
}

/**
 * The guest still readying the run (`share` its warm-up's, as the lab set it): its bar must show, on top, saying it
 * joins; the host's party frame must say the guest readies at that share, and its held countdown name the guest.
 * Returns `{ lines, problems }`.
 */
export function judgeReadying({ host, guest, guestTag, share }) {
  const card = host.join.cards[guestTag];
  const lines = [
    `the guest readying: its screen ${describeBar(guest.join)}; the host's line "${host.join.line}", `
      + `its frame of ${guestTag} "${card ?? 'missing'}"`,
  ];
  const problems = [];
  if (!guest.join.shown) problems.push(`coop: ${JOIN_CANARY} wasn't shown while it readied the run`);
  else {
    if (!guest.join.onTop) problems.push(`coop: ${JOIN_CANARY} was under something at the screen's middle`);
    if (guest.join.label !== JOIN_LABEL) problems.push(`coop: ${JOIN_CANARY} said "${guest.join.label}"`);
    if (Math.abs(guest.join.share - share) > 0.01) {
      problems.push(`coop: ${JOIN_CANARY} was filled ${guest.join.share}, its warm-up ${share}`);
    }
  }
  const readyingCard = `Readying ${Math.round(share * 100)}%`;
  if (card !== readyingCard) {
    problems.push(`coop: the host's frame of the guest said "${card ?? 'nothing'}" as it readied (${readyingCard})`);
  }
  // (the countdown's line only while it's held: the canary's host, told no guest readies, holds nothing)
  if (host.held && host.join.line !== `Waiting for ${guestTag}…`) {
    problems.push(`coop: the host's held countdown said "${host.join.line}", not the guest it waits for`);
  }
  return { lines, problems };
}

/**
 * The guest in the run: its bar drawn in the frame before its run began (`seen`) and gone now, the host's frame of it
 * and its line no longer saying it readies. `what` names the start ("cold", "warm"). Returns `{ lines, problems }`.
 */
export function judgeJoined({ host, guest, guestTag, seen, what }) {
  const card = host.join.cards[guestTag] ?? 'missing';
  const asBegan = seen.asRunBegan === null ? 'no run began' : seen.asRunBegan ? 'shown' : 'not shown';
  const lines = [
    `the guest in (${what}): its bar shown ${seen.frames} frames, as its run began ${asBegan}, now ${describeBar(guest.join)}; `
      + `the host's frame of ${guestTag} "${card}"`,
  ];
  const problems = [];
  if (seen.frames === 0) problems.push(`coop: ${JOIN_CANARY} never showed for a ${what} start`);
  else if (seen.asRunBegan !== true) {
    problems.push(`coop: ${JOIN_CANARY} wasn't drawn as its run began, a ${what} start`);
  }
  if (guest.join.shown) problems.push(`coop: ${JOIN_CANARY} stayed up in the run, a ${what} start`);
  if (card.startsWith('Readying')) problems.push(`coop: the host's frame of the guest still said "${card}" in the run`);
  if (host.join.line.startsWith('Waiting for')) {
    problems.push(`coop: the host's line still said "${host.join.line}" with the guest in`);
  }
  return { lines, problems };
}
