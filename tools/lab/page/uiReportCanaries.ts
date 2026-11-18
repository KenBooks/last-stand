// The canaries of `lab ui`'s bug report states (`uiBugReport.ts`) and the panels' lobby's links (`uiPanelLinks.ts`),
// apart from those modules (once read by `ui.ts` for every run, the modules loaded only as their states ran, since
// they import the game's bug report: `--ab` against a commit from before it stopped every state of `ui` loading
// there). Each state is a module of `uiStates/` now, loaded as it runs.

/** the problem the box's canary must raise */
export const BUG_REPORT_CANARY = { name: 'reaches past the window', what: 'the form twice the window\'s height' };
/** the problem the touch state's canary must raise: something of the page laid over the form (the beta's notice
 *  lay over its title on a phone held sideways, unseen by the controls' own checks) */
export const BUG_REPORT_COVER_CANARY = { name: 'lies over the form', what: 'a panel laid over the form\'s middle' };
/** the panels' lobby's links: the canary's problem as the check names it, and what it plants */
export const PANEL_LINKS_CANARY = { name: 'off its place', what: 'the row laid out as one line that wraps, as before' };
