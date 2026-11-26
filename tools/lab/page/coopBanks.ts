// `lab coop --scenarios banks`: the choice after a wave as a whole party makes it (tools/lab/node/coopBanks.mjs drives
// it; from play, a party of three at wave 38: "bug here, everyone pressed bank, it instead went into spectate mode").
// What each game shows of the party's choice: its own player's, and how many of its partners it shows banked.
import { G } from '../../../src/state';

/** This game's word on the choice after a wave. */
export interface BanksSeen {
  /** its own player out of the run as it shows him ('banked', 'dead', or '' still in) */
  own: string;
  /** the partners it shows banked, and the partners in the run's party (not away in the lobby) */
  partnersBanked: number;
  partners: number;
  /** the wave its run is at (0 out of one) */
  wave: number;
}

/** The Continue button as this game draws it: spinning (its choice on its way), pressable, and what it says. */
export interface ContinueShown {
  spinning: boolean;
  pressable: boolean;
  label: string;
}

/** The choice's Continue button now (`#decision .cont`). */
export function coopContinueShown(): ContinueShown {
  const button = document.querySelector<HTMLButtonElement>('#decision .cont');
  const shown = !!button && !document.getElementById('decision')!.classList.contains('hidden');
  return {
    spinning: shown && button!.classList.contains('sending'),
    pressable: shown && !button!.disabled,
    label: button?.querySelector('.cont-label')?.textContent ?? '',
  };
}

/** What this game shows of the party's choice now. */
export function coopBanksSeen(): BanksSeen {
  const partners = G.players.filter((player) => !player.local && !player.away);
  return {
    own: G.player.out ?? '',
    partnersBanked: partners.filter((player) => player.out === 'banked').length,
    partners: partners.length,
    wave: G.run?.wave ?? 0,
  };
}
