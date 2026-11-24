// The guide's tips: how a run works and what helps, each with its figures from the game's data (the run's and the
// loot's rules, block, co-op, the skills that daze, freeze or slow), so none goes stale as the tuning moves.
import { BLOCK, COOP, PARTY, PVP, RUN } from '../../data/balance';
import { DUEL_WINS, WINS_USUAL } from '../../game/duel';
import { LOOT, WAVES } from '../../data/waves';
import { HERO, ENEMIES } from '../../data/enemies';
import { RARITIES, STATS } from '../../data/items';
import { CLASSES } from '../../data/classes/index';
import { formatStat } from '../../loot/items';
import type { SkillDef, StatKey } from '../../types';
import { head, num, para, pct, points, secs, whole } from './parts';
import { HOLLIS } from '../../data/talk';
import { HOUSES } from '../../data/houses';
import { CUT, RESTOCK_RUNS, STOCKED_FROM, TRADED } from '../../data/merchant';

export interface Tip { id: string; title: string; html: () => string }

/** Every skill of every class, once each, with the class it's of. */
function allSkills(): { def: SkillDef; cls: string }[] {
  const out: { def: SkillDef; cls: string }[] = [];
  for (const cls of Object.values(CLASSES)) {
    for (const def of cls.skills) if (!out.some((o) => o.def.impl === def.impl)) out.push({ def, cls: cls.name });
  }
  return out;
}
const named = (s: { def: SkillDef; cls: string }): string => `<b style="color:${s.def.icon.color}">${s.def.name}</b> (${s.cls})`;

/** The first wave a rarity can come in (its weight above none). */
const firstWaveOf = (i: number): number => Array.from({ length: 60 }, (_, w) => w + 1).find((w) => LOOT.rarityWeights(w)[i] > 0) ?? 0;

/** A wave's chances of each rarity for a wave's reward, as shares. */
function chances(w: number): number[] {
  const weights = LOOT.rarityWeights(w, LOOT.waveRewardBonus(w));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((v) => v / sum);
}

export const TIPS_PAGES: Tip[] = [
  {
    id: 'bank', title: 'Bank or continue',
    html: () => para('Every run is a gamble. After <b>every</b> wave you choose:')
      + points('', [
        `<b class="gold">Bank</b> (B): leave the arena and keep everything you found. Future runs in that battleground can start from the wave you banked.`,
        `<b class="gold">Continue</b> (C): a harder wave with better loot. You get back ${pct(RUN.healOnContinue)} of your Health and ${pct(RUN.energyOnContinue)} of your Energy first.`,
        '<b class="red">If you die, every unbanked item is lost.</b>',
      ])
      + para(`Each cleared wave adds rewards to your bag: ${[1, 5, 10, 15].map((w) => `${LOOT.waveRewards(w)} at wave ${w}`).join(', ')}, rarer the deeper you go. A foe drops an item ${pct(LOOT.killDropChance)} of the time, an elite ${pct(LOOT.heroDropChance)}, and a boss ${LOOT.bossDrops}. A boss comes every ${WAVES.bossEvery}th wave.`)
      + points('When to bank', [
        'Your Health is low and your draught is cooling down.',
        'The next wave is a boss wave and you are not sure you can beat it.',
        'You carry a rare item (you see its rarity) you do not want to lose.',
        'You are about to stop playing: a run left half-way is lost.',
      ]),
  },
  {
    id: 'loot', title: 'Loot and rarity',
    html: () => {
      const waves = [1, 5, 10, 15];
      const rows = RARITIES.map((r, i) => `<tr><th style="color:${r.color}">${r.name}</th><td>${r.affixes[0]}–${r.affixes[1]}</td>${waves.map((w) => `<td>${num(chances(w)[i] * 100, 1)}%</td>`).join('')}</tr>`);
      // the tiers that drop only from some wave on (Ascendant, Ultimate)
      const late = (['ascendant', 'ultimate'] as const).map((id) => RARITIES.findIndex((r) => r.id === id)).filter((i) => i >= 0);
      return para('Loot goes straight into your bag, sealed: you only see each item\'s rarity until you bank. The bank\'s summary then opens them one by one, the most valuable first.')
        + para('A rarer item rolls more extra stats and bigger ones. The chances below are for a cleared wave\'s rewards:')
        + `<table class="gd-table"><tr><th>Rarity</th><th>Extra stats</th>${waves.map((w) => `<th>Wave ${w}</th>`).join('')}</tr>${rows.join('')}</table>`
        + late.map((i) => para(`${RARITIES[i].name} items only drop from wave ${firstWaveOf(i)} on.`)).join('')
        + head('Stat limits') + para('Each stat has a most a single item can roll:')
        + `<div class="gd-caps">${(Object.keys(STATS) as StatKey[]).filter((k) => STATS[k].cap).map((k) => `<span>${formatStat(k, STATS[k].cap!)}</span>`).join('')}</div>`;
    },
  },
  {
    id: 'items', title: 'Items and the lobby floor',
    html: () => points('', [
      'Open the inventory with I (or the Bag button on touch). Hover an item to compare it with what you wear; right-click (or tap, then Equip) to put it on.',
      'To get rid of an item, <b>drag it out onto the floor</b>, Shift-click it, or tap it and press Drop. It lands on the ground in the lobby.',
      'Changed your mind? Click its name on the floor to pick it up again. <b class="red">Anything left on the floor is gone once a run starts.</b>',
      'An item you wear comes off at the stash, the chest by the hall.',
      `The stash holds ${RUN.bagLimit} items. Filter it by stat to find what you need.`,
      'Each hero, and each save slot, keeps its own gear, stash and records.',
    ]),
  },
  {
    id: 'block', title: 'Blocking and guard',
    html: () => {
      const raise = allSkills().find((s) => s.def.block);
      const b = STATS.block, a = STATS.blockAmount;
      return para(`Only a shield blocks. Lowered, it has a chance to block (up to ${num(b.cap ?? 0)}% on one shield) part of each hit: its Damage Blocked. After a block it needs ${secs(BLOCK.recovery)} before it can block again.`)
        + (raise ? para(`Held up with ${named(raise)}, it blocks every hit from the front (within ${num(BLOCK.arc * 180 / Math.PI, 0)}° of where you face) for ${num(raise.def.block!)}× its Damage Blocked, and you move at ${pct(raise.def.moveMult ?? 1)} of your speed while it drains Energy.`) : '')
        + para(`<b>A hit bigger than your guard breaks it:</b> you are staggered for ${secs(BLOCK.guardBreak)}, able to move but not to block, attack or cast. A shield's Damage Blocked grows with its item level (${whole(a.base)} on a first shield).`)
        + points('Tips', ['Raise the shield for the big blows you see coming (a slam\'s ring, a boss\'s volley), not all the time.', 'Turn to face the danger: blows from behind are never blocked.', 'A guard broken by a slam is worse than stepping out of it.']);
    },
  },
  {
    id: 'control', title: 'Daze, freeze and other effects',
    html: () => {
      const s = allSkills();
      const lines: string[] = [];
      for (const k of s) {
        const d = k.def;
        if (d.freeze) lines.push(`${named(k)} <b>freezes</b> foes solid for ${secs(d.freeze)}.`);
        if (/daze/i.test(d.desc) && d.duration) lines.push(`${named(k)} <b>dazes</b> for ${secs(d.duration)}: a dazed foe stops what it was doing.`);
        if (d.chill) lines.push(`${named(k)} <b>chills</b> the foes it leaves alive for ${secs(d.chill)}, slowing them.`);
        if (d.burn) lines.push(`${named(k)} may <b>set foes alight</b> (${pct(d.burn.chance)} a hit): ${whole(d.burn.perSecond)} fire damage a second for ${secs(d.burn.seconds)}.`);
        if (d.pull) lines.push(`${named(k)} <b>drags</b> foes into it.`);
        if (d.amp) lines.push(`${named(k)} <b>marks</b> a foe: it takes ${pct(d.amp)} more damage from everyone for ${secs(d.duration ?? 0)}.`);
        if (d.impl === 'strawman') lines.push(`${named(k)} <b>lures</b> nearby foes to it for ${secs(d.duration ?? 0)}.`);
        if (d.overCast && d.impl === 'bullRush') lines.push(`${named(k)} <b>carries</b> foes along and throws them, dazed, where it stops.`);
        if (d.knock && d.knock >= 5) lines.push(`${named(k)} <b>knocks foes back</b> hard.`);
      }
      const bosses = Object.values(ENEMIES).filter((e) => e.boss);
      const fr = bosses[0]?.freezeResist;
      return para('There is no single "stun" in Last Stand: each skill stops foes its own way.')
        + points('', lines)
        + para(`<b>Elites and bosses</b> are not dazed by lightning, lured or carried${fr ? `, and bosses shake off a freeze ${pct(fr)} sooner` : ''}. Heavy foes resist being knocked back.`)
        + para('Foes can stop you too: a guard broken staggers you, and the Barkhide Hulk\'s vine roots you to the ground until it lets go or you dash free.');
    },
  },
  {
    id: 'survive', title: 'Staying alive',
    html: () => {
      const pot = allSkills().find((s) => s.def.impl === 'potion')?.def;
      return points('', [
        pot ? `The <b>Healing Draught</b> (Q) restores ${whole(pot.heal ?? 0)} Health and ${pct(pot.healPct ?? 0)} of your most, every ${secs(pot.cooldown)}. You can walk while drinking. Drink early.` : '',
        'Health and Energy refill slowly on their own; gear can raise both, and some items leech a share of the damage you deal back as Health.',
        'Armour cuts physical damage; Resistance cuts every other kind (fire, vitality, arcane...). Each foe\'s page shows what its blow does to you now.',
        'Every slam is marked by a ring on the ground first: watch the floor.',
        'Keep moving. Most foes are slower than you, and ranged foes aim ahead of you: change direction when they cast.',
        'Pillars, stones and trees block bolts: break a caster\'s line to it.',
      ].filter(Boolean));
    },
  },
  {
    id: 'waves', title: 'Waves, elites and score',
    html: () => para(`A wave comes in groups, ${secs(WAVES.groupInterval)} apart: ${WAVES.groups(1)} groups at wave 1, up to ${WAVES.groups(99)} later. At most ${WAVES.maxAlive(1)} foes stand at once at wave 1 (${WAVES.maxAlive(10)} at wave 10). New kinds of foe join as the waves go on.`)
      + para(`<b>Elites</b> come from wave ${Array.from({ length: 60 }, (_, i) => i + 1).find((w) => WAVES.heroChance(w) > 0)}: ${[3, 5, 10].map((w) => `${pct(WAVES.heroChance(w))} of foes at wave ${w}`).join(', ')}, at most ${pct(WAVES.heroChance(99))}. An elite has ${num(HERO.lifeMult)}× the Health, deals ${num(HERO.damageMult)}× the damage and is more likely to drop an item.`)
      + para(`<b>Score:</b> ${RUN.scorePerKill} a kill, times your multiplier. Every ${RUN.killsPerMultiplier} kills raise it a step, up to ×${RUN.multiplierMax}; ${secs(RUN.multiplierDecay)} without a kill and it drops a step.`),
  },
  {
    id: 'coop', title: 'Playing together',
    html: () => points('', [
      `Up to ${COOP.maxPlayers} heroes play together. Open a room at the campfire (Play together) and share its code.`,
      'A public room is listed for anyone to join; a private one is joined by its code; a password room is listed but needs its password.',
      'Signed in to cloud saves, Play together\'s Friends tab gives you a friend code to share. Friends see when you are online and in which room, join it from their list, and you can invite them into yours.',
      'Each player keeps their own loot: nothing is shared or stolen.',
      `A fallen partner bleeds out over ${secs(COOP.bleedOut)}. Stand within ${num(COOP.reviveRange)} m and hold E (or the Revive button) for ${secs(COOP.reviveTime)} to raise them with ${pct(COOP.reviveLife)} of their Health.`,
      `Waves grow with the party: ${PARTY.foes.map((f, i) => `${i + 1}: ${num(f, 2)}× the foes`).join(', ')}, each with more Health.`,
      'Hold Left Shift to ping a spot or a foe for your party, and press Enter to chat.',
      'A mage with a healing staff keeps everyone standing; a warrior with a shield draws the blows; a ranger marks the biggest threat for all.',
    ]),
  },
  {
    id: 'duels', title: 'Duels',
    html: () => para('Heroes can fight each other at the <b>weapons rack</b> in the village, by the training yard. A duel is fought within a party: open a room at the campfire first. Nothing is won or lost, and nothing is saved.')
      + points('Setting one up', [
        "The room's host picks the battleground, 1 v 1 or 2 v 2, how many rounds win the match "
          + `(${DUEL_WINS.map((w) => `first to ${w}`).join(', ')}; first to ${WINS_USUAL} unless chosen), and whether your gear counts or everyone fights with none.`,
        'Each player clicks or taps a free place on a side, or Watching. Clicking a place someone holds asks them to give it up.',
        'Every fighter says they are ready, then the host begins.',
      ])
      + points('A round', [
        `It starts from the gates after a ${secs(PVP.countdown)} count, and lasts at most ${secs(PVP.roundTime)}: then the side with more of its Health left takes it.`,
        `It ends when a side is all down. If both fall within ${secs(PVP.trade)} of each other, it is a draw.`,
        `Everyone is whole again for the next round, ${secs(PVP.between)} later.`,
        `You may drink ${PVP.draughts} Healing Draught${PVP.draughts === 1 ? '' : 's'} a round.`,
      ])
      + points('How skills work on heroes', [
        `Skills deal ${pct(PVP.damage)} of their damage to a hero (burns and other damage over time too): they are tuned for foes with many times a hero's Health.`,
        `A freeze, a daze or being carried holds a hero for ${pct(PVP.hold)} as long, and then they can't be held again for ${secs(PVP.holdRest)}.`,
        "A charge shoves a hero aside instead of carrying them. A chill slows a hero as it slows a foe.",
        'Blocks, wards and dodges work as they do against foes: a raised shield still turns a blow from the front.',
      ], 'plain'),
  },
  {
    id: 'folk', title: 'Folk of the village',
    html: () => para(`Some of the village's houses have someone in them. Walk up and press <b>E</b> (or tap Use, or click them); pick what to say with a click, a tap or its number's key, and Esc ends the talk.`)
      + points('', [
        `<b class="gold">${HOLLIS.name}</b>, ${HOLLIS.title.toLowerCase()}, reads at his table in the library, south of the square. He knows the village's old books, and maybe a secret or two: ask him if he has heard anything strange.`,
        `<b class="gold">Odo the Merchant</b> keeps ${HOUSES.merchant.name}, on the Thornwood's road by the campfire. He trades gear for gear, no coin: press E at his counter, choose one of his wares, then offer banked gear from your stash until its value reaches his price (a piece's own value and ${pct(CUT - 1)} more). He takes and sells only ${TRADED.map((r) => RARITIES.find((x) => x.id === r)?.name.toLowerCase()).join(', ')} gear (rares once you have reached wave ${whole(STOCKED_FROM.rare)}, epics once you have reached wave ${whole(STOCKED_FROM.epic)}), keeps all you give him, and has new wares every ${whole(RESTOCK_RUNS)} runs. Between customers he works about his shop (stocking his shelves, dusting, looking over a blade, weighing coin, keeping his ledger) and glances over at whoever is in; walk in, or up to his counter, and he puts down what he's doing and comes to his desk to serve you.`,
      ]),
  },
  {
    id: 'controls', title: 'Controls',
    html: () => points('', [
      'Move with WASD; aim with the mouse. Left and right click and keys 1 to 4 are your skills; Q is the draught.',
      'V changes the view: top-down, over the shoulder, through the eyes. The wheel zooms; hold the middle button and drag to turn the camera.',
      'In the village: E uses what you are near, I opens the inventory, M the map. G opens this guide anywhere; Esc pauses.',
      'On touch: the left half of the screen is a stick; drag a skill button to aim it, let go to cast; a tap casts at the nearest foe.',
      'The pause menu\'s Controls tab shows every key as it is bound now.',
    ]),
  },
];
