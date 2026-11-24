// `lab invite`'s part on what an agent makes in the scene (src/dev/agentMakes.ts, #529's second half), between its
// steps and its kick (inviteCheck.mjs):
//   the example thing (examples/beacon.ts) made before the hero, and seen: a placed camera's picture of the spot
//     before and after, its middle changed far more than the scene changes by itself over as many frames;
//   its updater running by the game's step (the stone turned);
//   made again from a changed file with no place given: one thing of the name, where the first stood;
//   a module that throws, one that imports what isn't the game's and one that imports the game's entry: each
//     refused, the thing left standing;
//   a place of the game's (src/world/places/rack.ts) built as a made thing as its module stands: its imports
//     answered with the game's own modules, its materials the village's (the place kit);
//   unmade: out of the scene;
//   one more left made through the kick: it stays, the panel says so, and its Remove takes it out.
// The canary builds the thing with its meshes hidden: the picture must say nothing appeared.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callPage } from './inviteCheck.mjs';
import { moduleText } from './makeCode.mjs';
import { REPO } from './paths.mjs';

const EXAMPLE = join(REPO, 'tools', 'lab', 'examples', 'beacon.ts');
const NAME = 'beacon';
/** a picture's side (px) */
const SIDE = 480;
/** frames a made thing is given to be drawn: its pipelines are compiled aside, and it shows once they are */
const SHOW_FRAMES = 40;
/** where the camera stands from the thing (m), and how high on it it looks */
const FROM = [2.6, 2.4, 2.6];
const LOOKS_AT = 1.4;
/** the least share of the picture's middle a made thing changes, and how many times what the scene changes alone */
const SEEN_LEAST = 0.1;
const SEEN_OVER_STILL = 3;
/** frames the stone is given to turn, and the least it turns in them (rad) */
const TURN_FRAMES = 30;
const TURN_LEAST = 0.2;

const THROWS = 'export function build() { throw new Error("boom"); }';
const IMPORTS = 'import { join } from "node:path"; export function build() { return join; }';
/** a place of the game's, built as a made thing as its module stands; and a module of the game's none may import */
const PLACE = join(REPO, 'src', 'world', 'places', 'rack.ts');
const ENTRY = 'import { nothing } from "../../../src/main"; export function build() { return nothing; }';

/** The example's source, the canary's with every mesh of it hidden. */
function exampleSource(hidden) {
  const source = readFileSync(EXAMPLE, 'utf8');
  if (!hidden) return source;
  const added = 'kit.group.add(post, stone);';
  if (!source.includes(added)) throw new Error(`invite: ${EXAMPLE} no longer has "${added}" for the canary to follow`);
  return source.replace(added, `${added}\n  post.visible = false;\n  stone.visible = false;`);
}

/** A PNG of the spot `at` from the placed camera, the game's frames drawn meanwhile. */
function pictureOf(game, link, at) {
  const camera = {
    at: [at[0] + FROM[0], at[1] + FROM[1], at[2] + FROM[2]],
    to: [at[0], at[1] + LOOKS_AT, at[2]],
  };
  return game.whileStepping(link.step('picture', { side: SIDE, camera, format: 'png' }), true);
}

/** The share of two pictures' middles that differs. */
function differs(game, a, b) {
  return callPage(game.page, 'invite', 'invitePictureDiff', { type: a.type, a: a.data, b: b.data });
}

const stoneTurn = (link) => link.step('eval', {
  code: `G.scene.getObjectByName('agent:${NAME}').getObjectByName('stone').rotation.y`,
});

/** The thing made and seen drawn where it was made; returns what `make` answered. */
async function madeAndSeen(game, found, link, dir) {
  const code = await moduleText(exampleSource(found.canary), EXAMPLE);
  // (where it will stand: made once and taken out, so the spot is pictured empty first)
  const first = await game.whileStepping(link.step('make', { name: NAME, code }));
  await game.whileStepping(link.step('unmake', { name: NAME }));
  const empty = await pictureOf(game, link, first.at);
  await game.step(SHOW_FRAMES, true);
  const still = await pictureOf(game, link, first.at);
  const thing = await game.whileStepping(link.step('make', { name: NAME, code, at: first.at }));
  await game.step(SHOW_FRAMES, true);
  const shown = await pictureOf(game, link, first.at);
  writeFileSync(join(dir, '5-before-made.png'), Buffer.from(empty.data, 'base64'));
  writeFileSync(join(dir, '6-made.png'), Buffer.from(shown.data, 'base64'));
  const alone = await differs(game, empty, still);
  const changed = await differs(game, still, shown);
  found.say(`make ${NAME}: ${thing.meshes} meshes, ${thing.triangles} triangles in ${thing.place} at `
    + `${thing.at.join(', ')}; the picture's middle changed by ${(changed * 100).toFixed(1)}% `
    + `(the scene alone over as many frames: ${(alone * 100).toFixed(1)}%)`);
  found.expect(thing.meshes === 2 && thing.triangles > 20, `make answered ${thing.meshes} meshes of ${thing.triangles} triangles`);
  found.expect(changed >= SEEN_LEAST && changed >= alone * SEEN_OVER_STILL,
    `the made thing isn't drawn: the picture's middle changed by ${(changed * 100).toFixed(1)}%`, 'unseen');
  return thing;
}

/** The made thing's updater runs by the game's step. */
async function turns(game, found, link) {
  const before = await game.whileStepping(stoneTurn(link));
  await game.step(TURN_FRAMES);
  const after = await game.whileStepping(stoneTurn(link));
  found.say(`its updater: the stone turned ${(after - before).toFixed(2)} rad over ${TURN_FRAMES} frames`);
  found.expect(after - before >= TURN_LEAST, `the made thing's updater didn't run (the stone turned ${after - before} rad)`);
}

/** Made again in its place; a module that throws and one that imports the game's own are refused, the thing left. */
async function madeAgain(game, found, link, thing) {
  const larger = exampleSource(false).replace('const STONE = 0.35;', 'const STONE = 0.6;');
  const again = await game.whileStepping(link.step('make', { name: NAME, code: await moduleText(larger, EXAMPLE) }));
  const groups = (await game.state()).groups;
  found.say(`made again from a changed file: ${again.replaced ? 'in its place' : 'NOT replaced'} at `
    + `${again.at.join(', ')}, the scene holding ${groups.join(', ') || 'none'}`);
  found.expect(again.replaced && again.at.join() === thing.at.join(), 'made again, the thing didn\'t take its earlier place');
  found.expect(groups.length === 1 && groups[0] === `agent:${NAME}`, `made again, the scene holds ${groups.join(', ')}`);

  const refusals = [];
  const broken = [
    ['throws', THROWS, /boom/],
    ['imports what isn\'t the game\'s', IMPORTS, /three and the game's own modules/],
    ['imports the game\'s entry', ENTRY, /src\/main/],
  ];
  for (const [what, source, said] of broken) {
    const code = await moduleText(source, EXAMPLE);
    const error = await game.whileStepping(link.step('make', { name: NAME, code })).then(() => 'built', (e) => e.message);
    refusals.push(`one that ${what}: "${error}"`);
    found.expect(said.test(error), `a module that ${what} was answered "${error}"`);
  }
  const standing = await game.whileStepping(link.step('makes'));
  found.say(`a module refused (${refusals.join('; ')}): ${standing.length} thing left standing`);
  found.expect(standing.length === 1 && standing[0].name === NAME && !standing[0].error, 'a refused module took the standing thing down');
}

/** A place of the game's built as a made thing, as its module stands: the rack, with the village's own materials. */
async function placeBuilt(game, found, link) {
  const code = await moduleText(readFileSync(PLACE, 'utf8'), PLACE);
  const rack = await game.whileStepping(link.step('make', { name: 'rack', code, at: [0, 0, 0] }));
  const own = await game.whileStepping(link.step('eval', {
    code: `(() => { const made = new Set(); G.scene.getObjectByName('agent:rack').traverse((o) => { if (o.material) made.add(o.material); });
      const village = new Set(Object.values(G.arena.village.mats)); return [...made].filter((m) => village.has(m)).length + ' of ' + made.size; })()`,
  }));
  found.say(`a place's module (src/world/places/rack.ts) made as it stands: ${rack.meshes} meshes, ${rack.triangles} `
    + `triangles, obstacles named: ${rack.obstacles}, ${own} of its materials the village's own`);
  found.expect(rack.meshes > 0 && rack.triangles > 500, `the rack built ${rack.meshes} meshes of ${rack.triangles} triangles`);
  found.expect(rack.obstacles >= 1, 'the rack named no obstacle through the place kit');
  found.expect(/^[1-9]\d* of /.test(own), `the rack's materials aren't the village's (${own})`);
  await game.whileStepping(link.step('unmake', { name: 'rack' }));
}

/**
 * What an agent makes in the scene, checked on `game` through `link` (an agent let in). Leaves one thing made, for
 * `removedByThePanel` after the kick.
 */
export async function madeInTheScene(game, found, link, dir) {
  const thing = await madeAndSeen(game, found, link, dir);
  await turns(game, found, link);
  await madeAgain(game, found, link, thing);
  await placeBuilt(game, found, link);
  const left = await game.whileStepping(link.step('unmake', { name: NAME }));
  const groups = (await game.state()).groups;
  found.say(`unmake ${NAME}: ${left.length} made, the scene holding ${groups.length} of them`);
  found.expect(left.length === 0 && groups.length === 0, 'unmake left the thing in the scene');
  const none = await game.whileStepping(link.step('unmake', { name: NAME })).then(() => 'answered', (e) => e.message);
  found.expect(/nothing named/.test(none), `unmaking what isn't made was answered "${none}"`);
  await game.whileStepping(link.step('make', { name: NAME, code: await moduleText(exampleSource(false), EXAMPLE) }));
}

/** After the kick: the thing the agent left stays, the panel says so, and its Remove takes it out. */
export async function removedByThePanel(game, found) {
  const kept = await game.until((s) => s.made !== '', 'the panel never said what the agent left made');
  found.expect(kept.groups.length === 1, `the agent gone, the scene holds ${kept.groups.length} made things`);
  await game.press('unmake');
  const after = await game.until((s) => s.made === '', 'the panel\'s Remove left its line up');
  found.say(`the agent gone: the panel says "${kept.made}"; Remove pressed, the scene holds ${after.groups.length}`);
  found.expect(after.groups.length === 0, 'the panel\'s Remove left a made thing in the scene');
}
