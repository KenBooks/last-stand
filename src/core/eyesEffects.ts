// What of a skill's look is drawn through the eyes, by the player's settings: up close a large effect lies over what
// the player aims at, so each may be left out there and stays as it is in every other view.
import { readCookie, writeCookie } from './cookies';

/** the setting (Settings' Spell circle, the cookie): shown unless turned off (from play: "an option in settings to
 *  disable the circle in 1st person and only leave the beam, off by default") */
const PORTAL_COOKIE = 'last-stand-eyes-portal';
let portalOn = readCookie(PORTAL_COOKIE) !== 'off';

/** Whether Void Lance's portal is drawn through the eyes (the setting): off, the lance alone is. */
export const eyesPortal = (): boolean => portalOn;

/** The setting: the portal drawn through the eyes or not, kept for the next visit. */
export function setEyesPortal(on: boolean): void {
  portalOn = on;
  writeCookie(PORTAL_COOKIE, on ? 'on' : 'off');
}
