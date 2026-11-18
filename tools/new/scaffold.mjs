// What `npm run new` writes: a sibling's files copied under the new id, each marked so the typecheck (or the lab's
// tests, for a lab command) names it until it's rewritten. Pure, but for the file system it is handed.

/** An id the game can use as a key and a file name: a lower-case letter, then letters and digits. */
const ID = /^[a-z][a-zA-Z0-9]*$/;

/** Says why an id can't be used, or nothing when it can. @param {string} id */
export function idProblem(id) {
  if (ID.test(id)) {
    return undefined;
  }
  return `"${id}" isn't an id: a lower-case letter, then letters and digits (camelCase)`;
}

/** The word with its first letter a capital. @param {string} word */
function capitalized(word) {
  return word[0].toUpperCase() + word.slice(1);
}

/** Escapes a word for a regular expression. @param {string} word */
function escaped(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Where a word starts and ends: by a letter or digit alone, so `_trade.scss` and `trade-ask` are renamed too. */
const NOT_IN_WORD = '(?<![a-zA-Z0-9])';
const NOT_BEFORE_WORD = '(?![a-zA-Z0-9])';

/**
 * The text with the sibling's id put as the new one wherever it stands as a word of its own, and as its capitalised
 * form (`buildImp` keeps its name, `Imp` becomes `Spitter`).
 * @param {string} text
 * @param {string} from
 * @param {string} to
 */
export function renamed(text, from, to) {
  const lower = new RegExp(`${NOT_IN_WORD}${escaped(from)}${NOT_BEFORE_WORD}`, 'g');
  const upper = new RegExp(`${NOT_IN_WORD}${escaped(capitalized(from))}${NOT_BEFORE_WORD}`, 'g');
  return text.replace(lower, to).replace(upper, capitalized(to));
}

/** The name of the marker a copied file is left with until it's rewritten. @param {string} like */
export function markerName(like) {
  return `NEW_FROM_${like.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/**
 * The lines put at a copied file's top, in its own language: a note, and in code an undeclared name, which the
 * typecheck names (and a script's import throws on) until the file is rewritten and they're deleted.
 * @param {string} path
 * @param {string} like
 */
export function markerLines(path, like) {
  const note = `new: copied from ${like} by npm run new: rewrite this file, then delete this line`;
  if (path.endsWith('.ts') || path.endsWith('.mjs')) {
    return [`// ${note} and the next.`, `${markerName(like)};`];
  }
  if (path.endsWith('.html')) {
    return [`<!-- ${note}. -->`];
  }
  if (path.endsWith('.scss')) {
    return [`// ${note}.`];
  }
  return [];
}

/** The file's text with its marker at the top. @param {string} path @param {string} text @param {string} like */
export function marked(path, text, like) {
  const lines = markerLines(path, like);
  if (lines.length === 0) {
    return text;
  }
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return lines.join(newline) + newline + text;
}

/**
 * A file to write: where from, where to.
 * @typedef {object} Copy
 * @property {string} from the sibling's file, from the repo's root
 * @property {string} to the new one's
 */

/**
 * The files to copy for a kind, the sibling's and the new id's side by side, folders read through `list`; a file
 * the kind marks optional is left out when the sibling has none.
 * @param {import('./kinds.mjs').Kind} kind
 * @param {string} like
 * @param {string} id
 * @param {{ exists(path: string): boolean, list(folder: string): string[] }} files
 * @returns {Copy[]}
 */
export function copiesFor(kind, like, id, files) {
  /** @type {Copy[]} */
  const copies = [];
  for (const template of kind.files) {
    const from = template.replaceAll('{id}', like);
    const to = template.replaceAll('{id}', id);
    if (from.endsWith('/')) {
      for (const name of files.list(from)) {
        copies.push({ from: from + name, to: to + renamed(name, like, id) });
      }
      continue;
    }
    if (kind.optional.includes(template) && !files.exists(from)) {
      continue;
    }
    copies.push({ from, to });
  }
  return copies;
}

/**
 * Why the copies can't be made (a sibling missing, a new file already there), or nothing when they can.
 * @param {import('./kinds.mjs').Kind} kind
 * @param {string} like
 * @param {string} id
 * @param {{ exists(path: string): boolean }} files
 */
export function copyProblem(kind, like, id, files) {
  const first = kind.files[0].replaceAll('{id}', like);
  if (!files.exists(first)) {
    return `no ${first} to copy: --like names a sibling of the same kind`;
  }
  for (const template of kind.files) {
    const to = template.replaceAll('{id}', id);
    if (files.exists(to)) {
      return `${to} is already there`;
    }
  }
  return undefined;
}
