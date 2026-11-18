// The village's dialogs (Play together, how to play, a talk, a trade, Odo's counter): each registers itself here from
// its own module, so main.ts asks whether one is up, hands it the keys and puts them all away on Escape without naming
// any. Each new dialog was another name in four places of main.ts, and every PR adding one conflicted there. A module
// that imports nothing: the dialogs' modules register as they load, whatever loaded first.

/** A dialog as main.ts sees it. */
export interface Dialog {
  /** whether it's up */
  open(): boolean;
  /** put away on Escape with the others (none: it takes its own Escape first, as a trade does) */
  close?(): void;
  /** its own keys while it's up (a talk's replies by number) */
  keys?(): void;
}

const DIALOGS: Dialog[] = [];

/** `d` registered, by its own module as it loads. */
export function dialog(d: Dialog): void { DIALOGS.push(d); }

/** Whether any dialog is up. */
export const dialogOpen = (): boolean => DIALOGS.some((d) => d.open());

/** Every dialog's keys, each while it's up. */
export function dialogKeys(): void {
  for (const d of DIALOGS) if (d.open()) d.keys?.();
}

/** Every dialog put away that Escape puts away. */
export function closeDialogs(): void {
  for (const d of DIALOGS) d.close?.();
}
