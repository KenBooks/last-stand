// A class's default picture: shown in a party card or list where its player has chosen no portrait, so every card
// has a picture and the same layout. A painted bust in greys with no face (the mage's starred hood and staff, the
// warrior's closed helm, the ranger's feathered cap and tall bow), `portraits/<class>/default-<class>.webp`, small and
// inlined in the bundle: nothing is downloaded for it, and it shows offline. A class with none painted gets a plain
// bust drawn in SVG.
const pictures = import.meta.glob<string>('./portraits/*/default-*.webp', {
  eager: true, query: '?inline', import: 'default',
});
const painted = new Map(Object.entries(pictures).map(([path, data]) => [
  path.slice(path.lastIndexOf('/default-') + '/default-'.length, -'.webp'.length), data,
]));

/** a class with no default painted: a head and shoulders */
const PLAIN = '<svg class="party-portrait outline" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">'
  + '<rect width="36" height="36" fill="#1b1a21"/>'
  + '<g fill="#6c6c74" stroke="#b4b4bc" stroke-width=".9">'
  + '<path d="M7 36.5C7 28 13 24.5 18 24.5S29 28 29 36.5Z"/><circle cx="18" cy="15" r="6.5"/></g></svg>';

/** `classId`'s default picture, the size of a party portrait (`.party-portrait`), in greys. */
export function classOutline(classId: string): string {
  const data = painted.get(classId);
  return data ? `<img class="party-portrait outline" src="${data}" width="36" height="36" alt="">` : PLAIN;
}
