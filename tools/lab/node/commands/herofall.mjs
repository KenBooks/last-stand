// `npm run lab -- herofall`: the local hero's fall after a lethal hit.
import { asText, fixtureFrom, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS, SETUP_OPTIONS } from '../optionKit.mjs';

/** The hero's fall, measured in the game after lethal damage. */
export default {
  summary: 'a lethal hit on the hero: early knee bend, backward landing and rebound, settled pose and floor clearance',
  help: 'give the hero a lethal hit in a solo run and follow the fall through landing and floor clearance',
  options: {
    canary: { kind: 'switch', help: 'put the settled hero through the floor and require the geometry check to catch it' },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each: (side, options) => side.command('heroFall', {
    fixture: fixtureFrom(options),
    canary: Boolean(options.canary),
  }),
  textOf: asText,
  problemsOf: problemsIn,
};
