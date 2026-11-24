// `lab coop --scenarios houses`: a partner gone into one of the village's houses is shown to the others outside
// (`src/ui/houseMarks.ts`, read from the room each game's state already says), and joining a party whose host stands
// inside a house spawns every joiner in that same house (`welcome.rm`, `game/rooms.ts` `joinInRoom`, #740) with zero
// late compiles when leaving back to the village (and joining an outside host from inside a house brings the joiner
// out to the village).
// `--canary`: takes the host's door marker off screen once drawn AND moves the guest out of the tavern after joining,
// both of which must be caught.

/** the house the guest goes into and the host creates a party in */
const HOUSE = 'tavern';
/** frames for a move across the link to be heard and drawn, and for the map to unfold flat */
const HEARD_FRAMES = 90;
const MAP_FRAMES = 90;
const JOIN_WAIT = 600;
/** minimum spacing between guests spawned in the same house (m) */
const MIN_GUEST_APART = 0.7;

/**
 * Plays it on `pair` (its room open already). Returns the problems found, its lines added to `lines`.
 */
export async function partnerInHouse(pair, callPage, lines, { tags, canary = false, pictures = false }) {
  const problems = [];
  const [host, guest] = pair.pages;
  const guests = pair.pages.slice(1);
  const guestTag = tags[1];
  const picture = async (name) => { if (pictures) lines.push(`pictured ${(await pair.picture(`houses-${name}`)).join(', ')}`); };
  await callPage(host, 'coopFaceHouse', { id: HOUSE });
  await pair.run(HEARD_FRAMES);
  const before = await callPage(host, 'coopHouseSeen', { id: HOUSE });
  if (before.drawn || before.minimap.length) problems.push(`houses: the ${HOUSE}'s marker shows with no one inside`);
  await callPage(guest, 'coopEnterHouse', { id: HOUSE });
  await pair.run(HEARD_FRAMES);
  if (canary) {
    await callPage(host, 'coopHouseMarkLost', { id: HOUSE });
    await pair.run(2);
  }
  const inside = await callPage(host, 'coopHouseSeen', { id: HOUSE });
  const found = [];
  if (!inside.drawn) found.push(`the ${HOUSE}'s door shows no marker with ${guestTag} inside`);
  else if (!inside.says.includes(guestTag)) found.push(`the ${HOUSE}'s marker says "${inside.says}", not ${guestTag}`);
  if (!inside.minimap.includes(guestTag)) found.push(`the minimap has no dot for ${guestTag} in the ${HOUSE}`);
  lines.push(`${guestTag} in the ${HOUSE}: its door's marker ${inside.drawn ? `"${inside.says}"` : 'not drawn'}, `
    + `the minimap's dot for ${inside.minimap.join(', ') || 'no one'}`);
  await picture('marker');
  await callPage(host, 'coopVillageMap', { on: true });
  await pair.run(MAP_FRAMES);
  const mapped = await callPage(host, 'coopHouseSeen', { id: HOUSE });
  if (!mapped.map.includes(guestTag)) found.push(`the village's map names no one inside the ${HOUSE} ("${mapped.map}")`);
  lines.push(`the host's village map under the ${HOUSE}: "${mapped.map}"`);
  await picture('map');
  await callPage(host, 'coopVillageMap', { on: false });
  await callPage(guest, 'coopLeaveHouse');
  await pair.run(HEARD_FRAMES);
  const after = await callPage(host, 'coopHouseSeen', { id: HOUSE });
  if (after.drawn || after.minimap.length) found.push(`the ${HOUSE}'s marker stays after ${guestTag} came out`);
  lines.push(`${guestTag} out again: the marker ${after.drawn ? 'still drawn' : 'gone'}`);
  const quiet = await yardUnseenInHouse(pair, callPage, lines, { tags, canary, picture });

  // --- #740: party created inside a building -> every joiner spawns inside that same building ---
  for (const page of pair.pages) await callPage(page, 'coopPartyLeave');
  await pair.run(15);
  await callPage(host, 'coopEnterHouse', { id: HOUSE });
  await pair.run(10);
  const code = await callPage(host, 'coopPartyHost', { tag: tags[0] });
  for (let i = 0; i < guests.length; i++) {
    await callPage(guests[i], 'coopPartyJoin', { code, tag: tags[i + 1] });
  }
  await pair.until(
    (_h, _g, states) => states.slice(1).every((s) => s.status === 'joined')
      && states.every((s) => s.partners === pair.pages.length - 1),
    JOIN_WAIT,
    `party never reformed inside the ${HOUSE}`,
  );
  await pair.run(HEARD_FRAMES);
  if (canary) {
    // canary: kick guest out of the building to verify the check catches spawning outside
    await callPage(guest, 'coopLeaveHouse');
    await pair.run(10);
  }
  const hostIn = await callPage(host, 'coopHousePartyState');
  const guestsIn = [];
  for (const page of guests) guestsIn.push(await callPage(page, 'coopHousePartyState'));
  const spawnFound = [];
  if (hostIn.room !== HOUSE) spawnFound.push(`host is not in ${HOUSE} (${hostIn.room})`);
  guestsIn.forEach((s, i) => {
    const tag = tags[i + 1];
    if (s.room !== HOUSE) spawnFound.push(`${tag} spawned outside ${HOUSE} (room=${s.room})`);
    if (!s.zoomHeld) spawnFound.push(`${tag}'s zoom was not locked inside ${HOUSE}`);
    if (s.partnersAway > 0 || s.partnersVisible < pair.pages.length - 1) {
      spawnFound.push(`${tag} inside ${HOUSE} sees ${s.partnersVisible}/${pair.pages.length - 1} partners (${s.partnersAway} away)`);
    }
  });
  if (hostIn.partnersAway > 0 || hostIn.partnersVisible < guests.length) {
    spawnFound.push(`host inside ${HOUSE} sees ${hostIn.partnersVisible}/${guests.length} guests (${hostIn.partnersAway} away)`);
  }
  const allIn = [hostIn, ...guestsIn];
  for (let i = 0; i < allIn.length; i++) {
    for (let j = i + 1; j < allIn.length; j++) {
      if (allIn[i].room !== HOUSE || allIn[j].room !== HOUSE) continue;
      const dist = Math.hypot(allIn[i].pos[0] - allIn[j].pos[0], allIn[i].pos[1] - allIn[j].pos[1]);
      if (dist < MIN_GUEST_APART) {
        spawnFound.push(`${tags[i]} and ${tags[j]} overlap inside ${HOUSE} (${dist.toFixed(2)} m apart)`);
      }
    }
  }
  lines.push(`party created in ${HOUSE}: guests in ${guestsIn.map((s) => s.room ?? 'village').join(', ')}, `
    + `host sees ${hostIn.partnersVisible}/${guests.length}, ${guestTag} sees ${guestsIn[0].partnersVisible}/${pair.pages.length - 1}`);
  await picture('party-in-house');

  // leaving the building back to the village must compile nothing (village loaded at boot)
  const compilesBefore = guestsIn[0].lateCompiles;
  if (guestsIn[0].room === HOUSE) {
    await callPage(guest, 'coopLeaveHouse');
    await pair.run(10);
    const left = await callPage(guest, 'coopHousePartyState');
    if (left.room !== null) spawnFound.push(`${guestTag} did not leave ${HOUSE}`);
    if (left.zoomHeld) spawnFound.push(`${guestTag}'s zoom stayed locked after leaving ${HOUSE}`);
    if (left.lateCompiles !== compilesBefore) {
      spawnFound.push(`leaving ${HOUSE} compiled ${left.lateCompiles - compilesBefore} shader program(s)`);
    }
    lines.push(`${guestTag} left ${HOUSE}: back in ${left.room ?? 'village'}, ${left.lateCompiles - compilesBefore} late compiles`);
  }

  // --- reverse: host outside in the village, guest joins from inside a building -> guest leaves building ---
  for (const page of pair.pages) await callPage(page, 'coopPartyLeave');
  await pair.run(15);
  await callPage(host, 'coopLeaveHouse');
  await callPage(guest, 'coopEnterHouse', { id: HOUSE });
  await pair.run(10);
  const outCode = await callPage(host, 'coopPartyHost', { tag: tags[0] });
  await callPage(guest, 'coopPartyJoin', { code: outCode, tag: guestTag });
  await pair.until(
    (h, g) => g.status === 'joined' && h.partners === 1 && g.partners === 1,
    JOIN_WAIT,
    'guest never joined outside host from inside a house',
  );
  await pair.run(HEARD_FRAMES);
  const guestOut = await callPage(guest, 'coopHousePartyState');
  const hostOut = await callPage(host, 'coopHousePartyState');
  if (guestOut.room !== null) problems.push(`houses: ${guestTag} stayed in ${guestOut.room} when joining host outside`);
  if (guestOut.zoomHeld) problems.push(`houses: ${guestTag}'s zoom stayed locked when joining host outside`);
  if (hostOut.partnersAway > 0 || guestOut.partnersAway > 0) {
    problems.push(`houses: host/guest away after joining outside host (host away=${hostOut.partnersAway}, guest away=${guestOut.partnersAway})`);
  }
  lines.push(`party outside, ${guestTag} joined from ${HOUSE}: now in ${guestOut.room ?? 'village'}, `
    + `host sees ${hostOut.partnersVisible}, ${guestTag} sees ${guestOut.partnersVisible}`);

  if (!canary) {
    return [...problems, ...found.map((p) => `houses: ${p}`), ...spawnFound.map((p) => `houses: ${p}`), ...quiet];
  }
  const caughtYard = quiet.length > 0;
  lines.push(`canary: the yard kept going in the ${HOUSE} ${caughtYard ? 'caught' : 'went unseen'}`);
  if (!caughtYard) problems.push('houses canary: the yard kept going in a house went unseen');
  const caughtMark = found.some((p) => p.includes('shows no marker'));
  const caughtSpawn = spawnFound.some((p) => p.includes('spawned outside'));
  lines.push(`canary: the marker taken away ${caughtMark ? 'caught' : 'went unseen'}; guest outside ${HOUSE} ${caughtSpawn ? 'caught' : 'went unseen'}`);
  if (!caughtMark) problems.push('houses: canary: the lost marker went unseen');
  if (!caughtSpawn) problems.push(`houses: canary: guest outside ${HOUSE} went unseen`);
  return problems;
}

/** the frames both heroes cast every skill in the yard before one goes in, and those read in the house after, and how
 *  often they're read */
const CASTING_FRAMES = 360;
const INSIDE_FRAMES = 360;
const READ_EVERY = 30;
/** what of the yard a game in a house is read for (`coopYardSeen` in page/coopHouses.ts) */
const YARD_PARTS = ['projectiles', 'effects', 'particles', 'lights', 'numbers', 'channels', 'spent'];

/**
 * Nothing of the training yard shows in a house (from play: "make sure you cant see any casts while inside the village
 * houses, that anyone might be casting at the training grounds"): both heroes cast every skill of theirs in the yard,
 * channels held, then `inside` walks into the house while `outside` casts on, and `inside`'s game is read each half
 * second for anything of the yard's (its projectiles, effects, particles and pooled lights by the yard, the numbers
 * floating, a channel held). Played both ways round, host inside and guest. Returns the problems found.
 */
async function yardUnseenInHouse(pair, callPage, lines, { tags, canary, picture }) {
  const problems = [];
  const [host, guest] = pair.pages;
  const ways = [
    { inside: host, outside: guest, who: tags[0] },
    { inside: guest, outside: host, who: tags[1] },
  ];
  for (const [turn, { inside, outside, who }] of ways.entries()) {
    for (const page of [host, guest]) {
      await callPage(page, 'coopPractise');
      await callPage(page, 'coopCastEveryInLobby', { on: true });
    }
    await pair.run(CASTING_FRAMES);
    const before = await callPage(inside, 'coopYardSeen');
    if (canary) await callPage(inside, 'coopKeepVillage', { kept: true });
    await callPage(inside, 'coopCastEveryInLobby', { on: false });
    await callPage(inside, 'coopEnterHouse', { id: HOUSE });
    const most = Object.fromEntries(YARD_PARTS.map((part) => [part, 0]));
    for (let read = 0; read < INSIDE_FRAMES; read += READ_EVERY) {
      await pair.run(read === 0 ? 2 : READ_EVERY);
      const seen = await callPage(inside, 'coopYardSeen');
      if (seen.room !== HOUSE) throw new Error(`lab: coop: houses: ${who} never went into the ${HOUSE}`);
      for (const part of YARD_PARTS) most[part] = Math.max(most[part], seen[part]);
    }
    if (turn === 0) await picture('yard-from-house');
    if (canary) await callPage(inside, 'coopKeepVillage', { kept: false });
    await callPage(outside, 'coopCastEveryInLobby', { on: false });
    await callPage(inside, 'coopLeaveHouse');
    await pair.run(HEARD_FRAMES);
    const said = YARD_PARTS.map((part) => `${part} ${most[part]}`).join(', ');
    const going = YARD_PARTS.map((part) => `${part} ${before[part]}`).join(', ');
    lines.push(`${who} in the ${HOUSE}, the yard cast in: of the yard's, at most ${said} (in the yard: ${going})`);
    if (before.projectiles + before.effects + before.particles === 0) {
      throw new Error(`lab: coop: houses: nothing was cast in the yard before ${who} went in`);
    }
    const seen = YARD_PARTS.filter((part) => most[part] > 0);
    if (seen.length) problems.push(`houses: ${who} in the ${HOUSE} shows the yard's ${seen.join(', ')}`);
  }
  return problems;
}
