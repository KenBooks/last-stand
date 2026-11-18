// `npm run lab -- scholar`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithSheetEach, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab scholar`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the library\'s Brother Hollis (his reading loop posed through frame by frame, its wrap included: no joint '
    + 'snapping, his head and hands moving, his sleeves never through his table, the book\'s prints reaching the '
    + 'spine, the page he turns never under the book and landing flat, his fingers on its edge while he holds it, '
    + 'the page never through either hand, his forearms clothed to the wrist, nothing on his table inside his '
    + 'sleeves, his fingertips never sunk into what they rest on; a hero come near glanced up at and walked off '
    + 'from, the hero held in his eye while talked to; then his rounds (a browse, a keep and a restock, each frame: '
    + 'never into what stands in the room, a book in his hands at a hand, its shelf\'s book hidden while it\'s off it, '
    + 'a hero come close looked up at and his task going on, the hero in his way gone round, talked to and he stops; '
    + 'nothing compiled over them, the frame sat and walking); pictured at the loop\'s beats close up from each side '
    + 'and over his shoulder, his face, and as the player sees him); `--film` a picture a moment; `--canary` jumps '
    + 'his loop on mid-way, raises his table, lowers the page\'s spine, draws the prints back from the spine, drops '
    + 'the page on his resting hand, strips his undersleeves, puts his quill back under his arm and holds a book he '
    + 'carries off his hands.',
  help: "the library's scholar, Brother Hollis: his reading loop posed through frame by frame, its wrap included (no "
    + 'joint snapping, his head and hands moving), glancing up at a hero come near and holding his eye while talked '
    + 'to; pictured at points of the loop close up from each side and over his shoulder, and as the player sees him',
  options: {
    views: { kind: 'list', usage: 'a,b', default: 'front,left,right,back,above', help: 'the views of the close-ups' },
    at: { kind: 'numbers', usage: 's,s', help: 'the points of his loop pictured (s), in place of its beats' },
    film: { kind: 'switch', help: 'a picture for each moment in order (film-N.png), not one sheet: the frames of a clip' },
    canary: { kind: 'switch', help: 'jump his loop on 20 s mid-way and raise the table 8 cm, both of which must be found' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('scholar', { canary: Boolean(options.canary), views: options.views, at: options.at });
  },
  // (its moments written: him at each beat of his loop close up, the talk, as the player sees him; with --film a
  // picture each, in order, for a clip of his loop)
  finish(results, options, session) {
    if (options.film) return textWithSheetEach(results, session.outFor('scholar'), session.browser);
    return textWithMoments(results, session.outFor('scholar'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
