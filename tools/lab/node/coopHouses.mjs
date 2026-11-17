// `lab coop --scenarios houses`: a partner gone into one of the village's houses is shown to the others outside
// (`src/ui/houseMarks.ts`, read from the room each game's state already says). The host stands before the tavern's
// door; the guest goes into the tavern. Judged on the host's game: the marker over its door drawn with the guest's
// name, the minimap's dot for him there, and his name under the house's on the village's map; then the
// guest comes out, and all three must be gone. `--canary`: the host's marker is taken off the screen once drawn, which
// must be found.

/** the house the guest goes into */
const HOUSE = 'tavern';
/** frames for a move across the link to be heard and drawn, and for the map to unfold flat */
const HEARD_FRAMES = 90;
const MAP_FRAMES = 90;

/**
 * Plays it on `pair` (its room open already). Returns the problems found, its lines added to `lines`.
 */
export async function partnerInHouse(pair, callPage, lines, { tags, canary = false, pictures = false }) {
  const problems = [];
  const [host, guest] = pair.pages;
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
  if (!canary) return [...problems, ...found.map((p) => `houses: ${p}`)];
  const caught = found.some((p) => p.includes('shows no marker'));
  lines.push(`canary: the marker taken away ${caught ? 'caught' : 'went unseen'}`);
  return caught ? problems : [...problems, 'houses: canary: the lost marker went unseen'];
}
