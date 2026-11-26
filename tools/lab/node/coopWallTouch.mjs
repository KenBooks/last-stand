// `lab coop --class ranger --scenarios wall-touch`: a ranger's Hedgeward in the village breaks when a partner walks
// into it, on every game, and stands when its own caster does (from the owner: "its currently possible to troll other
// players in coop by denying them entry with ranger's vines skill that cannot be destroyed, because skills are
// disabled outside of training yard... lets make it possiible to destroy the vines for other players by touching
// them"). In the village with no run, the host raises a wall in the training yard between himself and the guest, walks
// into it himself (it must stand on both games), steps away, and the guest walks at it from the other side: it must
// break on both games and the guest come through. `--canary`: the guest's game breaks its copy without telling the
// others, which must read as the wall still standing on the host's.

/** the host's spot, the wall's aim and the guest's spot, in the yard's own frame (across, along: m), and where the host
 *  steps away to and where the guest walks for (beyond the wall) */
const HOST_AT = [-4, -2.5];
const WALL_AT = [-1.5, -2.5];
const GUEST_AT = [1.5, -2.5];
const HOST_AWAY = [-5, -4];
const GUEST_FOR = [-3, -2.5];
/** frames: the heroes settled where they're stood, the key held aimed, the wall risen and told to the guest */
const SETTLE_FRAMES = 30;
const HOLD_FRAMES = 12;
const RISE_FRAMES = 90;
/** frames the host walks into his own wall, and the most the guest walks for, in steps */
const OWN_WALK_FRAMES = 120;
const GUEST_WALK_MOST = 300;
const WALK_STEP = 30;
/** frames for the guest's word to reach the host's game, the link's round trip and its jitter past it */
const TOLD_FRAMES = 60;
/** how far past the wall's line the guest must come (m: his body's half and some) */
const THROUGH = 0.6;
/** how near the wall the host must have walked to have touched it (m: from his middle to its line) */
const PRESSED = 0.8;

/**
 * Plays it on `pair` (its room open already). Returns the problems found, its lines added to `lines`.
 */
export async function partnerThroughWall(pair, callPage, lines, { canary = false, pictures = false }) {
  const problems = [];
  const [host, guest] = pair.pages;
  const picture = async (name) => {
    if (pictures) lines.push(`pictured ${(await pair.picture(`wall-touch-${name}`)).join(', ')}`);
  };
  const seen = async () => Promise.all([host, guest].map((page) => callPage(page, 'coopWallTouchSeen')));
  await callPage(host, 'coopWallTouchStand', { at: HOST_AT });
  await callPage(guest, 'coopWallTouchStand', { at: GUEST_AT });
  await pair.run(SETTLE_FRAMES);
  const [stoodHost, stoodGuest] = await seen();
  lines.push(`stood in the yard: the host at ${spot(stoodHost.hero)}, the guest at ${spot(stoodGuest.hero)}`);
  const { key, aim } = await callPage(host, 'coopWallTouchKey', { at: WALL_AT });
  if (!key) return ['wall-touch: the host\'s hero has no Hedgeward (run it with --class ranger)'];
  await callPage(host, 'coopHoldInLobby', { key, at: aim });
  await pair.run(HOLD_FRAMES);
  await callPage(host, 'coopHoldInLobby', { key: null });
  await pair.run(RISE_FRAMES);
  const [raisedHost, raisedGuest] = await seen();
  lines.push(`the host raised a wall: ${standing(raisedHost)} on the host's, ${standing(raisedGuest)} on the guest's`);
  if (raisedHost.walls.length !== 1 || raisedGuest.walls.length !== 1) {
    return [...problems, 'wall-touch: the host\'s wall didn\'t stand on both games'];
  }
  await picture('raised');
  const line = raisedHost.walls[0].across;
  await walkFor(pair, callPage, host, [line + 1, HOST_AT[1]], OWN_WALK_FRAMES);
  const [ownHost, ownGuest] = await seen();
  const ownGap = line - ownHost.hero.across;
  lines.push(`the host walked into his own wall (${ownGap.toFixed(2)} m from its line): `
    + `${standing(ownHost)} on the host's, ${standing(ownGuest)} on the guest's`);
  if (ownGap > PRESSED) problems.push('wall-touch: the host never reached his own wall');
  if (ownHost.walls.length !== 1 || ownGuest.walls.length !== 1) {
    problems.push('wall-touch: the host\'s own touch broke his wall');
  }
  await callPage(host, 'coopWallTouchStand', { at: HOST_AWAY });
  await callPage(guest, 'coopWallTouchWalk', { to: GUEST_FOR, canary });
  let frames = 0;
  let through = false;
  while (frames < GUEST_WALK_MOST && !through) {
    await pair.run(WALK_STEP);
    frames += WALK_STEP;
    const now = await callPage(guest, 'coopWallTouchSeen');
    through = now.hero.across < line - THROUGH;
  }
  await callPage(guest, 'coopWallTouchWalk', { to: null });
  await pair.run(TOLD_FRAMES);
  const [afterHost, afterGuest] = await seen();
  const where = afterGuest.hero.across - line;
  lines.push(`the guest walked at it for ${frames} frames: ${through ? 'through' : 'held back'} `
    + `(${where.toFixed(2)} m from its line); ${standing(afterHost)} on the host's, `
    + `${standing(afterGuest)} on the guest's`);
  await picture('through');
  if (!through) problems.push('wall-touch: the guest walked into the host\'s wall and never came through it');
  if (afterGuest.walls.length) problems.push('wall-touch: the guest\'s touch never broke the wall on its own game');
  const found = afterHost.walls.length ? ['the wall the guest broke by touch still stood on the host\'s game'] : [];
  if (!canary) return [...problems, ...found.map((problem) => `wall-touch: ${problem}`)];
  const caught = found.length > 0;
  lines.push(`canary: the guest's touch never told ${caught ? 'caught' : 'went unseen'}`);
  return caught ? problems : [...problems, 'wall-touch: canary: the touch never told went unseen'];
}

/** `page`'s hero walked for yard spot `to` for `frames` frames, then stopped. */
async function walkFor(pair, callPage, page, to, frames) {
  await callPage(page, 'coopWallTouchWalk', { to });
  await pair.run(frames);
  await callPage(page, 'coopWallTouchWalk', { to: null });
  await pair.run(1);
}

/** A spot in the yard's frame, said. */
function spot({ across, along }) {
  return `${across.toFixed(2)}, ${along.toFixed(2)}`;
}

/** The walls a game shows, said: how many stand, and the first's life. */
function standing(seen) {
  if (!seen.walls.length) return 'none standing';
  const [wall] = seen.walls;
  const at = `${wall.across.toFixed(2)}, ${wall.along.toFixed(2)} in the yard`;
  return `${seen.walls.length} standing (life ${wall.life}, at ${at})`;
}
