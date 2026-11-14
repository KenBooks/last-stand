// A class's outline: a small grey bust drawn in SVG, shown in a party card or list where its player has chosen no
// portrait, so every card has a picture and the same layout. One a class, told apart by its shape alone (the mage's
// hat and staff, the warrior's helm and pauldrons, the ranger's hood and bow); a class with none drawn gets a plain
// bust. Inline, so it's nothing to download.

const GROUND = '#1b1a21';
const BODY = '#6c6c74';
const EDGE = '#b4b4bc';

/** a bust's shoulders, `half` wide each side of the middle */
const shoulders = (half: number): string =>
  `<path d="M${18 - half} 36.5C${18 - half} 28 ${24 - half} 24.5 18 24.5S${18 + half} 28 ${18 + half} 36.5Z"/>`;

const OUTLINES: Record<string, string> = {
  // a pointed hat over a narrow face, a staff with its orb at his side
  mage: `${shoulders(11)}<circle cx="17" cy="19" r="4.6"/>`
    + '<path d="M18.5 2.5C19 8 21.5 12 26.5 15.5C21 17.6 13 17.6 7.5 15.5C12.5 12 16 8 18.5 2.5Z"/>'
    + `<path d="M31 11V36" fill="none" stroke-width="1.6"/><circle cx="31" cy="7.5" r="2.6" fill="${EDGE}"/>`,
  // a crested helm with a T of a visor, broad pauldrons
  warrior: `${shoulders(13)}<circle cx="6.5" cy="28.5" r="4.6"/><circle cx="29.5" cy="28.5" r="4.6"/>`
    + '<path d="M17 6V2.5H19V6Z"/>'
    + '<path d="M11 20.5V13C11 8.5 14 5.5 18 5.5S25 8.5 25 13V20.5L21.5 24H14.5Z"/>'
    + `<path d="M13.6 13.2H22.4V15.4H19V21.5H17V15.4H13.6Z" fill="${GROUND}" stroke="none"/>`,
  // a hood drawn to a point round a shadowed face, a bow behind one shoulder and arrows over the other
  ranger: '<path d="M27.5 9C34 17 34 27 27.5 35" fill="none" stroke-width="1.6"/>'
    + '<path d="M27.5 9V35M9.5 26L6 15.5M12.5 25L10 14.5" fill="none" stroke-width="1"/>'
    + `${shoulders(11)}`
    + '<path d="M18 3.5C12 5 9.5 11 10 18C10.4 22.5 13.5 24.5 18 24.5S25.6 22.5 26 18C26.5 11 24 5 18 3.5Z"/>'
    + `<path d="M18 9.5C14.8 10.5 13.6 14 13.8 17.5C14 20.5 15.8 22 18 22S22 20.5 22.2 17.5C22.4 14 21.2 10.5 18 9.5Z"`
    + ` fill="${GROUND}" stroke="none"/>`,
};

/** a class with no outline of its own: a head and shoulders */
const PLAIN = `${shoulders(11)}<circle cx="18" cy="15" r="6.5"/>`;

/** `classId`'s outline as an SVG the size of a party portrait (`.party-portrait`), in greys. */
export function classOutline(classId: string): string {
  const drawn = OUTLINES[classId] ?? PLAIN;
  return '<svg class="party-portrait outline" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">'
    + `<rect width="36" height="36" fill="${GROUND}"/>`
    + `<g fill="${BODY}" stroke="${EDGE}" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round">${drawn}</g>`
    + '</svg>';
}
