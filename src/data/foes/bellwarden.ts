// The Bell-Warden: the Ossuary Cantor's guard, two of them on the Crypt's wave 10 (data/biomes.ts `bosses`), and never
// a boss of its own: no ladder's rung and no special wave sends it alone. Its stats at wave 1 (`EnemyDef`) and how to
// fight it (the guide's words, no figures): read by data/enemies.ts with every other foe's file in this folder; its own
// numbers (`BELL_WARDEN`) read by its fight (entities/bellWarden.ts) and the guide.
import type { FoeFile } from '../enemies';

declare module '../enemies' { interface EnemyIds { bellwarden: true } }

export const FOES: FoeFile = {
  // a cracked bronze bell floating in the air, held up by its ghost, hovering where it rises as a guard
  // (entities/bellWarden.ts, models/bellWarden.ts)
  bellwarden: {
    def: {
      name: 'The Bell-Warden', model: 'bellwarden', ai: 'bellWarden',
      life: 4600, damage: 110, damageType: 'physical', speed: 1.5, radius: 3,
      range: 5, windup: 1, recover: 1, cooldown: 4.2,
      summon: 'husk',
      // (`boss` for what a boss is given: it stands its ground, its bar is a boss's, its toll is a telegraphed attack of
      // the boss toolkit's; it only ever rises as an encounter's guard, `BossRung.guards`)
      cost: 0, score: 70, knockbackResist: 1, freezeResist: 0.7, heft: 6, boss: true, accent: 0x5a7cff,
      // (as the Ossuary Cantor's guard: about a quarter of its life and three quarters of its damage, two of them at once)
      // (a lesser bell, about half its height, so its Cantor towers over it: from play, two full-size bells were "too
      // big (almost like main boss)"); hovering where it rises, tolling from there (from play: "They stay stationary")
      asGuard: { life: 0.26, damage: 0.75, size: 0.55, stands: true, name: 'Bell-Warden Guard' },
      bossKit: {
        // (one phase: it never grows stronger as it is hurt)
        phases: [{ below: 1 }],
        // (a toll's warning is the bell swung back, glowing and creaking)
        attacks: { toll: { warn: 1.05, recover: 1.0 } },
      },
    },
    note: {
      role: 'The Ossuary Cantor\'s guard',
      does: 'A cracked bronze bell floating in the air, held up by the ghost that haunts it: in the Crypt two of them come with the Ossuary Cantor as its guards. Each hovers where it rises and tolls from there, the bell swinging about its crown and a short ring of sound stunning whoever is close. While either stands, the Cantor is warded.',
      strengths: ['While either guard stands, the Cantor takes only a fraction of the damage.', 'While it stands it raises the dead round it now and then.', 'Its toll stuns you briefly if you are close to the bell when it rings.', 'Come near the bell and its ghost dives at you: it rises over you shrieking, then swoops down, carries you off and drops you.', 'Two of them at once, from two sides, as the Cantor casts.'],
      weaknesses: ['A lesser bell: little Health, and a toll that only reaches those nearby.', 'It never moves from where it rises: it hovers there. Fight the Cantor away from it and its toll cannot reach you.', 'The bell swings back and glows before every toll: that is your warning.', 'A raised shield facing the bell, a dash or a leap carries you through its ring.', 'The ghost\'s shriek is your warning: step aside as it swoops and it seizes nothing.', 'It never grows stronger as it is hurt.', 'Its dead stop rising the moment it falls.', 'Its tolls never land together with the Cantor\'s casts.'],
      beat: ['Kill the two guards first: the Cantor\'s ward falls with the last of them.', 'Keep a few steps off the bell when it swings back, then close in after the toll.'],
      vs: {
        warrior: 'Raise the shield towards the bell as it swings: the toll cannot stun you through it.',
        mage: 'Blink through the ring as it reaches you, then burn the bell down before turning on the Cantor.',
        ranger: 'Shoot it from beyond its ring; it is the Cantor\'s ward you are breaking.',
      },
    },
  },
};

/**
 * The Bell-Warden's own numbers (entities/bellWarden.ts). `toll`: its ring rolls out at `speed` (m/s) to `reach` (m),
 * fading as it goes; a hero it reaches within `stunsTo` (m) is stunned `stun` s and hurt `hurt` of its damage, unless
 * his shield is raised towards it or he's in a dash or a leap; its light, shake and sound `soft` of a full bell's, rung
 * `pitch` higher. `swing`: its bell's toll as a pendulum's swing about its crown (models/bellWarden.ts), `amp` its
 * widest (rad), building over the warning to its strike at the forward end, dying away over `after` of its swing after.
 * `dive`: its ghost dives at a hero who comes within `near` m of the bell: it rises over him shrieking for `warn` s,
 * following him, `over` m above him, then swoops at where he stands over `swoop` s down to `low` m over the floor, and
 * seizes him if he's still within `catch` m of that spot as it comes down; then it rests `every` s. `carry`: a seized
 * hero is carried up `rise` m and `away` m out from the bell over `carry` s, dropped from there (`fall` s) for `hurt`
 * of its damage, and isn't seized again for `grace` s. `raise`: it raises `count` of the dead round it, `near` m out,
 * `first` s after it rises and then every `every` s while it stands, at most `ownMost` of its own up, none past the
 * wave's alive limit (from play: "make sure they spawn mobs once in a while").
 */
export const BELL_WARDEN = {
  toll: { speed: 9, reach: 10, stunsTo: 6, stun: 0.8, hurt: 0.3, soft: 0.4, pitch: 1.6 },
  swing: { amp: 0.34, after: 2.4 },
  // (from play: "ghosts should be more likely to grabbing you when coming near the bell"; circling, it grabbed no one)
  dive: { near: 5.5, warn: 0.6, swoop: 0.42, catch: 1.3, every: 4.5, over: 2.8, low: 1.1 },
  carry: { carry: 1.1, rise: 2.4, away: 3, fall: 0.35, hurt: 0.45, grace: 4.5 },
  raise: { first: 6, every: [15, 20] as [number, number], count: [2, 3] as [number, number], near: [3.5, 6] as [number, number], ownMost: 5 },
};
