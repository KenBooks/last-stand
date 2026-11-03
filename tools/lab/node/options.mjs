// The lab's command line (tools/lab): its commands, the options each takes, and the help made from them. An option
// is checked as it's read, so a misspelt one or a bad value stops the command at once, before anything boots.
import { labError } from './errors.mjs';

/**
 * How an option's value is read:
 * - `switch`: `--name` is true, `--name=false` false;
 * - `text`: `--name value` or `--name=value`;
 * - `list`: comma-separated text, as a list (each one of `choices`, when it has them);
 * - `number`: a finite number;
 * - `pair`: two numbers, `x,z`;
 * - `numbers`: comma-separated numbers, as many as `count` says or in `each`s (any count without them),
 *   `0.2,-0.4,-0.5`;
 * - `choice`: one of `choices`;
 * - `ref`: a switch that may name a commit (`--ab`, `--ab=165246d`);
 * - `screen`: a window's size in css px and the screen's pixel ratio, `1280x720@3` (`@1` when it's left out);
 * - `screens`: two of them, `3840x2160@1,1280x720@3`.
 */
const KINDS = [
  'switch', 'text', 'list', 'number', 'pair', 'numbers', 'choice', 'ref', 'screen', 'screens', 'screenList',
];

/** the UI's states `ui` pictures, in the order it runs them: the lobby's, then the run's (page/ui.ts `UiState`) */
export const UI_STATES = [
  'lobby', 'tooltip', 'glow', 'help', 'saves', 'heroes', 'readying', 'readyingHeroes', 'clicked', 'views',
  'behindProps',
  'logLobby',
  'skillTipsTouch', 'sheetTouch', 'litTouch',
  'run', 'scores', 'perf', 'decision', 'pause', 'summary', 'skillTips', 'log', 'logTouch',
  'hudTouch', 'decisionTouch',
];

/** the ways a hero may hold his weapons (src/loot/loadout.ts `WeaponStyle`) */
export const WEAPON_STYLES = ['oneHanded', 'shield', 'twoHanded', 'dual'];

/** the ways a picture can be drawn (page/looks.ts `LOOKS`) */
const LOOKS = ['lit', 'wire', 'faces', 'parts', 'bones'];

/** how a command's pictures are drawn */
const LOOK_OPTION = {
  kind: 'choice',
  choices: LOOKS,
  usage: LOOKS.join('|'),
  help: 'as the player sees it (lit, the default), the hero\'s wireframe, his faces\' orientation (front blue, '
    + 'back red), each of his parts a colour of its own (and where each is in the picture), his skeleton over it',
};

/** the options that set up the run before a command (page/lab.ts `Fixture`) */
const SETUP_OPTIONS = {
  view: { kind: 'choice', choices: ['top', 'third', 'first'], usage: 'top|third|first', help: 'the game\'s view' },
  at: { kind: 'pair', usage: 'x,z', help: 'where the hero stands (12,22: off the dais, clear of props)' },
  facing: { kind: 'number', usage: 'rad', help: 'the way he faces (0 is +z)' },
  nocked: { kind: 'switch', help: 'a bow\'s hero with an arrow on the string (=false: none)' },
  gear: {
    kind: 'choice',
    choices: WEAPON_STYLES,
    usage: WEAPON_STYLES.join('|'),
    help: 'the hero holding his weapons this way (a class with more than one; as rolled by default)',
  },
  weapon: {
    kind: 'text',
    usage: 'base',
    help: 'with --gear, the weapon held that way by its base (Maul, Greataxe...; dual: one in each hand; the '
      + 'class\'s first by default)',
  },
  wear: {
    kind: 'list',
    usage: 'a,b',
    choices: ['helm', 'chest', 'hands', 'none'],
    help: 'the armour he wears, as the player dresses him (hands: gloves and bracers; none: bare; as rolled by '
      + 'default)',
  },
  tune: {
    kind: 'text',
    joins: ';',
    usage: 'name.field[i,..]=v[,v...][;...]',
    help: 'tunable values set before the run (src/core/tuning.ts: '
      + 'warriorEyes.oneOn=0.75,-1.1,0.5;warriorEyes.roll=1.2), or some of a list\'s numbers, each to the one value '
      + '(warriorSwings.twoBack[46,52]=-6)',
  },
};

/** the options every command running on a page takes */
const COMMON_OPTIONS = {
  ab: {
    kind: 'ref',
    usage: '[=ref]',
    help: 'also on another commit (origin/main by default): its results beside this tree\'s, and the lines that '
      + 'differ (a commit against itself agrees, line for line)',
  },
  fresh: {
    kind: 'switch',
    help: 'with --ab, run the other commit again rather than read its kept result (tools/lab/out/ab-cache: kept by '
      + 'its commit, the lab\'s code, the command and its options)',
  },
  class: { kind: 'text', usage: 'name', help: 'the hero (ranger, warrior, mage; the last one used by default)' },
  boot: {
    kind: 'text',
    usage: 'level[@pixels]',
    help: 'the page booted as a device whose Auto settled on this quality (low@518400: a phone\'s): the boot\'s '
      + 'warm-ups run at it, and the hero is built at its detail (High, the lab\'s own, by default)',
  },
  cold: {
    kind: 'switch',
    help: 'the page booted as a player\'s first visit leaves it: nothing the game warms after the lobby shows asked '
      + 'for, the fight\'s and the other heroes\' programs cold until something needs them (the lab\'s own boot asks '
      + 'for them at once and waits)',
  },
  screen: {
    kind: 'screen',
    usage: 'WxH[@ratio]',
    help: 'the page put on a screen of this size (css px) and pixel ratio once it has booted, as a window moved onto '
      + 'another monitor is (1280x720@3: a 4K screen at 300%; 1920x1080@1 by default)',
  },
  screens: {
    kind: 'screens',
    usage: 'WxH[@ratio],WxH[@ratio]',
    help: 'this tree on two screens, one after the other, compared as --ab compares two commits: the lines and the '
      + 'pictures that differ (3840x2160@1,1280x720@3: a 4K screen at 100% and at 300%, pictured at its 3840x2160 '
      + 'pixels on both)',
  },
  insets: {
    kind: 'numbers',
    count: 4,
    usage: 'left,top,right,bottom',
    help: 'with --screen or --screens, the screen\'s safe-area insets (css px), as a phone\'s camera cutout gives '
      + 'them to env(safe-area-inset-*) (34,0,0,0: a phone held sideways with its camera on the left)',
  },
  profile: {
    kind: 'switchOrText',
    usage: '[=function]',
    help: 'where the command\'s time went in the page: its busiest functions (=animate ranger.ts: those in that '
      + 'function, by their share of it)',
  },
  randoms: {
    kind: 'switch',
    help: 'what drew the page\'s random numbers as the command ran: the busiest callers, each at its line (an A/B\'s '
      + 'pictures of anything random differ after the first draw one side made and the other didn\'t)',
  },
  layers: {
    kind: 'switch',
    help: 'the page\'s composited layers at each screen picture, each element\'s box and why it\'s a layer, and with '
      + '--ab where the sides\' differ (a picture whose UI lines are drawn brighter or dimmer, nothing else changed, '
      + 'was rastered another way)',
  },
  watch: {
    kind: 'switch',
    help: 'run it again each time the source changes, until Ctrl+C (needs npm run lab:serve)',
  },
  sweep: {
    kind: 'text',
    joins: ';',
    usage: 'name.field[i,..]=a|b|c[;...]',
    help: 'run it once for each value of a tunable (or every combination of several), over --tune, and say each '
      + 'run\'s problems side by side, the runs with the fewest named (needs npm run lab:serve and a command that '
      + 'takes --tune): warriorSwings.twoBack[46,52]=-6|-10 sets those two numbers; warriorEyes.roll=1|1.2 the list',
  },
};

/**
 * The commands: what each does (`help`), what it takes after its name (`argument`), and its options. A command
 * that is `open` passes options it doesn't know on (`--name` or `--name=value`) to what it runs.
 */
export const COMMANDS = {
  sheet: {
    help: 'the hero pictured in the states the player sees, from the game\'s views and close up, with each arm\'s '
      + 'load and posture beside them: tools/lab/out/sheets/<tag>/sheet.png',
    options: {
      states: { kind: 'list', usage: 'a,b', default: 'stand,walk', help: 'the states: stand, walk, full, cast' },
      views: {
        kind: 'list',
        usage: 'a,b',
        default: 'lobby,top,third,front,left,back',
        help: 'the views: lobby, top, third, front, left, right, back, above; eyes with --view first',
      },
      tag: { kind: 'text', usage: 'name', default: 'latest', help: 'the sheet\'s folder' },
      focus: { kind: 'text', usage: 'joint', help: 'close-ups framed on a joint (head, handL...), not the body' },
      look: LOOK_OPTION,
      skill: { kind: 'text', usage: 'name', help: 'the cast state\'s skill: its key, its behaviour or its name' },
      shares: {
        kind: 'list',
        usage: 'a,b',
        default: '0.3,0.55,0.8',
        help: 'the cast state\'s moments, as shares of its cast',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  carry: {
    help: 'the ranger\'s carried bow against his body through a carry\'s round',
    options: {
      canary: { kind: 'switch', help: 'plant faults the measure must catch' },
      frames: { kind: 'switch', help: 'list every frame with a clip: its phase, what crossed what, how deep' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  feet: {
    help: 'the hero\'s feet against the ground round the dais\'s edges and on level ground: standing at full draw by '
      + 'the edges, walking across them and strafing up and down the steps with a shot drawn',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['edge', 'level', 'strafe', 'cross', 'run'],
        help: 'the scenarios (all by default): edge, level, strafe, cross, run',
      },
      canary: { kind: 'switch', help: 'plant faults the measures must catch: a planted ankle slid, one sunk' },
      frames: { kind: 'switch', help: 'list every stance and standing case flagged, and what was wrong with it' },
      trace: { kind: 'switch', help: 'each frame of each walk, foot by foot (pick one with --scenarios)' },
      ...COMMON_OPTIONS,
    },
  },
  range: {
    help: 'every joint of the hero against a body\'s ranges, frame by frame: standing, walking each way, attacking, '
      + 'and walks that change direction while he attacks or runs',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['stand', 'walk', 'shoot', 'reverse', 'taps', 'run', 'cast'],
        help: 'the scenarios (all by default): stand, walk, shoot, reverse, taps, run, cast (with --skill)',
      },
      skill: { kind: 'text', usage: 'name', help: 'the cast scenario\'s skill: its key, its behaviour or its name' },
      foe: { kind: 'text', usage: 'kind', help: 'a foe of this kind stood ahead of him for the cast scenario (dummy)' },
      ahead: { kind: 'number', usage: 'm', help: 'with --foe, how far ahead it stands (1.8 by default)' },
      biome: {
        kind: 'choice',
        choices: ['crypt', 'forest'],
        usage: 'crypt|forest',
        help: 'the biome he stands in (the lobby\'s by default): with --at, by its wall',
      },
      at: SETUP_OPTIONS.at,
      facing: SETUP_OPTIONS.facing,
      gear: SETUP_OPTIONS.gear,
      weapon: SETUP_OPTIONS.weapon,
      tune: SETUP_OPTIONS.tune,
      canary: {
        kind: 'switch',
        help: 'plant faults the measure must catch: the head turned past the neck\'s range, the fist bent on its '
          + 'forearm',
      },
      frames: { kind: 'switch', help: 'list every frame with a joint past its range' },
      trace: {
        kind: 'switch',
        help: 'list every frame of the leg IK, as gait --trace does, with the joints past their ranges',
      },
      span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
      ...COMMON_OPTIONS,
    },
  },
  stops: {
    help: 'the hero coming to a stop from a run, judged as a person stops: the steps once still, a foot put out and '
      + 'drawn back, a step back, a foot off the body\'s level, on level ground and by the dais\'s edge',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['level', 'drawn', 'edgeOut', 'edgeIn', 'edgeSlant', 'edgeAlong', 'edgeShot'],
        help: 'the scenarios (all by default): level, drawn, edgeOut, edgeIn, edgeSlant, edgeAlong, edgeShot',
      },
      frames: { kind: 'switch', help: 'list every stop: where it rested, each step after the keys were let go' },
      trace: { kind: 'switch', help: 'with --frames, each frame of each stop along the way from where it rested' },
      only: { kind: 'text', usage: 'name', help: 'only the stops whose names contain this (d 23, 12 cm out)' },
      ...COMMON_OPTIONS,
    },
  },
  coop: {
    help: 'two games playing together, the host\'s and the guest\'s, their messages carried as a link of a high ping '
      + 'carries them: how far behind and how roughly each copies the other\'s heroes and foes, whether an arrow that '
      + 'struck a foe on the guest\'s screen counted, whether a blow it dodged on its screen hurt it, where its blink '
      + 'came out on the host\'s screen and whether the foes it dazed were dazed on the host\'s, and whether every foe '
      + 'its charge met on its screen was carried and thrown on both and ended before it, and whether a Power '
      + 'Strike it cast its charge over landed in the charge on both, shown over it and building to its blow',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['walk', 'foes', 'shoot', 'evade', 'dodge', 'down', 'blink', 'rush', 'strike', 'throws'],
        help: 'the scenarios (all the hero can play by default): walk, foes, shoot, evade (a ranger or a mage), dodge, '
          + 'down, blink (a mage), rush and strike (a warrior), throws',
      },
      ping: { kind: 'number', usage: 'ms', help: 'the link\'s least round trip (300 by default)' },
      jitter: { kind: 'number', usage: 'ms', help: 'how much later each way a message may come (60 by default)' },
      pictures: { kind: 'switch', help: 'picture both screens at a scenario\'s moments (into out/coop)' },
      ...COMMON_OPTIONS,
    },
  },
  gait: {
    help: 'the hero\'s walk judged as a person\'s, over level ground and the dais\'s steps, nothing drawn, drawn and '
      + 'changing direction: the time on each foot, both and neither, the steps, the hops, the hips\' rise and fall, '
      + 'the jerks, each filmed from the side',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['walk', 'run', 'drawn', 'taps', 'zigzag', 'circle', 'circleDrawn', 'stairs', 'stairsDrawn'],
        help: 'the scenarios (all by default): walk, run, drawn, taps, zigzag, circle, circleDrawn, stairs, '
          + 'stairsDrawn',
      },
      frames: { kind: 'switch', help: 'list every step (its foot, when it left and landed, how far) and the hops' },
      trace: {
        kind: 'switch',
        help: 'list every frame: the way the body faces and goes, the pelvis, the cycle, each foot',
      },
      span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
      films: {
        kind: 'switch',
        help: 'film each scenario, run again for it (=false: the numbers alone, in half the time)',
      },
      offsets: {
        kind: 'list',
        usage: 'a,b',
        help: 'each scenario from these starts, a run each on one page: its first move so many frames longer '
          + '(its turns at other points of a stride; 0 alone by default)',
      },
      ...COMMON_OPTIONS,
    },
  },
  form: {
    help: 'the hero\'s run judged against a runner\'s, with each way he holds his weapons: the stride\'s timing, '
      + 'each joint\'s curve over it, stick figures over a runner\'s and the hero pictured at eight points of it: '
      + 'tools/lab/out/form/<way>.png',
    options: {
      gear: {
        kind: 'list',
        usage: 'a,b',
        choices: WEAPON_STYLES,
        help: `the ways of holding the weapons (the class's all by default): ${WEAPON_STYLES.join(', ')}`,
      },
      canary: {
        kind: 'switch',
        help: 'plant a fault the measure must catch: the left knee straight through its stance',
      },
      frames: { kind: 'switch', help: 'list each leg\'s cycles and the curves bin by bin' },
      pictures: {
        kind: 'switch',
        help: 'picture the run: stick figures, and the hero run again for him (=false: the numbers alone)',
      },
      ...COMMON_OPTIONS,
    },
  },
  ui: {
    help: 'the game\'s UI as the player sees it, each state pictured whole with its named elements\' and the world\'s '
      + 'labels\' boxes as shares of the window, the game\'s cursor over all of it and every digit shown on its line: '
      + 'with --screens, whether the UI is the same share of the screen on both (tools/lab/out/ui)',
    options: {
      states: {
        kind: 'list',
        usage: 'a,b',
        choices: UI_STATES,
        help: 'the states (every one by default): lobby, tooltip, glow (the stash\'s items lit for a hovered item\'s '
          + 'slot, pictured at set moments of its loops, each of which must animate only what the compositor moves), '
          + 'help, saves, heroes (the hero selection screen opened by Change hero: the hero in focus in the room '
          + 'its panel leaves, its parts within the window and none over another, the hero beside clicked into focus, '
          + 'Esc back to the lobby), readying (the fight\'s loading bar over the lobby: within the window, its label '
          + 'on a line), readyingHeroes (Change hero clicked with the heroes\' programs cold: the bar says it readies '
          + 'the heroes), clicked (a battleground\'s button clicked and a '
          + 'key pressed after it: '
          + 'where the focus went), views (the lobby\'s camera switched through its views: the labels over the '
          + 'dummies against their anchors), behindProps (a column planted between the camera and each dummy\'s label: '
          + 'every label hidden behind it, every one shown with it gone; the canary plants it aside), run (the HUD '
          + 'with a hurt foe\'s bar and damage numbers), '
          + 'scores, perf, decision, pause, summary, skillTips (each skill\'s tooltip on the hotbar opened by the '
          + 'mouse, within the window; the tallest pictured; skillTipsTouch: the lobby\'s by a finger\'s tap), log '
          + '(the battle log with hits dealt and taken: every '
          + 'line shown, within the screen, over nothing of the HUD), logLobby (the same over the lobby, clear of its '
          + 'panels), '
          + 'logTouch (the same in touch mode: clear of the touch HUD, touches let through), hudTouch (the touch '
          + 'HUD\'s top corners at the screen\'s edges, none of its corners\' controls over another; --insets for a '
          + 'phone\'s cutout), decisionTouch (the choice after a wave in touch mode: on a short screen within its top '
          + '30%, its buttons a finger\'s height), sheetTouch (a stash shield\'s sheet opened by a tap, its card '
          + 'beside the worn one\'s: its buttons within the window and the sheet), litTouch (a worn item pressed long: '
          + 'the stash items that fit its slot lit until a tap elsewhere)',
      },
      hdr: { kind: 'switch', help: 'HDR on, as on a display in HDR mode (the pause menu shows its levels)' },
      canary: {
        kind: 'switch',
        help: 'plant the system\'s cursor on the page\'s body in each state, old-style digits on it and the labels\' '
          + 'lining twin taken away (the skill tooltips made as tall as the window): each check must find its own',
      },
      ...COMMON_OPTIONS,
    },
  },
  wind: {
    help: 'the loading screen\'s exit as it hands over to the lobby\'s logo: the loading screen put back over the '
      + 'lobby and its exit run on the lab\'s clock, the particles\' picture read from the exit\'s canvas column by '
      + 'column as each rests in the logo\'s place, laid over the lobby behind them, against the lobby logo once the '
      + 'exit is done, both at the screen\'s own pixels: the pixels apart and which way the logo stands from them (a '
      + 'jump the player sees as the logo takes over): tools/lab/out/wind',
    options: {
      resize: {
        kind: 'screenList',
        usage: 'WxH[@ratio],...',
        help: 'the window put on these screens one after another as the particles fly, the last where they land '
          + '(1920x1080@1.25,1536x864@1.25 on --screen 1536x864@1.25: full screen and back at 125%)',
      },
      canary: {
        kind: 'switch',
        help: 'the lobby logo pictured a pixel lower than it is after the exit: the jump must be found, a pixel down',
      },
      ...COMMON_OPTIONS,
    },
  },
  light: {
    help: 'the frame\'s light as the player sees it: the hero standing in each biome, view and facing, the frame '
      + 'drawn and read back from the canvas, its light as a share of the screen\'s white (mean, by thirds, its '
      + 'brightest pixels, near white and past it): tools/lab/out/light',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facings: {
        kind: 'list',
        usage: 'a,b',
        default: '0,90,180,270',
        help: 'the ways the hero faces in the close views, degrees (0 is +z; the top view is measured at the first)',
      },
      pictures: { kind: 'switch', help: 'picture each frame too (=false: the numbers alone)' },
      hdr: {
        kind: 'switch',
        help: 'each frame drawn again in HDR (on any display) and checked against the SDR one: under the knee as an '
          + 'SDR screen shows it at the paper white, nothing past the peak, the canvas shown the frame drawn',
      },
      paper: { kind: 'number', usage: 'n', help: 'with --hdr, the paper white: a share of the screen\'s white (1)' },
      peak: { kind: 'number', usage: 'n', help: 'with --hdr, the brightest highlight: a share of its white (3)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the measures must catch: the first frame at twice the exposure (and in HDR at 1.2 times '
          + 'the paper white)',
      },
      ...COMMON_OPTIONS,
    },
  },
  fire: {
    help: 'each biome\'s fire as the player meets it: read from beside it with its own light and without, how tall '
      + 'and wide it burns, its light and hue from its base up, what of it is blown out white, its tongues, the smoke '
      + 'over it, how it moves and swells, and the flashes it makes on the screen; its flames from round them, '
      + 'whether they turn with the camera; the plants over it; pictured beside it, alone, from above, round it and '
      + 'in the game\'s views: tools/lab/out/fire',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      seconds: { kind: 'number', usage: 's', default: '2', help: 'how long the fire is read for' },
      cost: {
        kind: 'switch',
        help: 'time what its flames take of the GPU in the top-down view, drawn and not in turns (its times differ '
          + 'from run to run, as the machine\'s load does)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the faults the measures must catch: a still flame, one drawn white, none drawn, a strobe on the '
          + 'screen, flames showing the same face from behind, a plant over the fire, and with --cost the flames '
          + 'drawn four times over',
      },
      ...COMMON_OPTIONS,
    },
  },
  cast: {
    help: 'a skill of the hero\'s cast as the player casts it, its effect seen frame by frame: the hero standing in '
      + 'each biome and view with the biome\'s foes coming at him, the key pressed (held for a held skill or a '
      + 'channel, a drawn shot drawn to full) over an aim ahead, and every frame until the effect is over drawn and '
      + 'read back: its light against the budget (the frame\'s mean raised 50 at most, a sixteenth of it 150, 5% '
      + 'of it bright, as stored), the flashes in a second (WCAG\'s: three are a hazard) and the shaders compiled '
      + 'after loading; the skill named by its key, its behaviour or its name: tools/lab/out/cast/<skill> '
      + '(--class mage)',
    argument: 'skill',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facing: { kind: 'number', usage: 'degrees', help: 'the way the hero faces and casts (0, +z, by default)' },
      at: SETUP_OPTIONS.at,
      foes: {
        kind: 'number',
        usage: 'n',
        help: 'how many of the biome\'s commonest foes come at him (4 by default; 0: none)',
      },
      times: {
        kind: 'list',
        usage: 'a,b',
        default: '0.4,1.5,3',
        help: 'the moments pictured, s after the press',
      },
      pictures: { kind: 'switch', help: 'picture the moments (=false: the numbers alone)' },
      what: {
        kind: 'list',
        usage: 's,x,y',
        help: 'what the eye meets at a moment (s after the press) and a point of the screen (% across and down)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the fault the checks must catch, in the first biome and view: a strobe of the exposure',
      },
      gear: SETUP_OPTIONS.gear,
      weapon: SETUP_OPTIONS.weapon,
      tune: SETUP_OPTIONS.tune,
      ...COMMON_OPTIONS,
    },
  },
  perf: {
    help: 'skills cast in turn as the player casts them, the biome\'s foes coming at the hero, and every frame timed '
      + 'as the game\'s performance report times it, by the browser\'s clock with the game drawn and waited out on '
      + 'the GPU: the frame, the update by stage, the render, the GPU by pass (where the browser times it), the '
      + 'draws, triangles and particles, standing before the first press and from each press on; a cast never made, '
      + 'a shader compiled as it\'s timed and a canary unseen are problems (a phone\'s: --screen 832x384@3.75 '
      + '--quality low@518400 --throttle 4; --class mage)',
    argument: 'skills',
    options: {
      biome: {
        kind: 'choice',
        choices: ['crypt', 'forest'],
        usage: 'crypt|forest',
        help: 'the biome (forest by default)',
      },
      facing: { kind: 'number', usage: 'degrees', help: 'the way the hero faces and casts (0, +z, by default)' },
      at: SETUP_OPTIONS.at,
      view: SETUP_OPTIONS.view,
      gear: SETUP_OPTIONS.gear,
      foes: {
        kind: 'number',
        usage: 'n',
        help: 'how many of the biome\'s commonest foes come at him (10 by default; 0: none)',
      },
      apart: { kind: 'number', usage: 's', help: 'from one press to the next (1 s by default)' },
      after: { kind: 'number', usage: 's', help: 'from the last press to the end (4 s by default)' },
      quality: {
        kind: 'text',
        usage: 'level[@pixels]',
        help: 'the quality level (high, medium, low) and the most pixels the scene renders, as Auto settles on them '
          + '(low@518400: a phone\'s, Auto at its lowest; as the page has it by default), put to use before the '
          + 'set-up, the hero built at its detail',
      },
      throttle: { kind: 'number', usage: 'n', help: 'the CPU this many times slower (1 by default; 4: a phone\'s)' },
      frames: { kind: 'switch', help: 'list every frame: its time, the page\'s work by stage, what it drew' },
      canary: {
        kind: 'switch',
        help: 'plant costs the measure must see: the hero\'s update 2 ms slower, the scene drawn twice',
      },
      ...COMMON_OPTIONS,
    },
  },
  health: {
    help: 'the screen as the hero\'s Health runs low: standing in each biome and view, his Health held at shares of '
      + 'his most, and at each the frame drawn with the low-health look and without it at the same moment: the colour '
      + 'it drains, the blood\'s cover of the screen and of its middle, and how far in it reaches; a frame changed '
      + 'above where the look starts, blood in the middle of the view, a lower Health draining or covering less and '
      + 'a look too faint with nothing left are problems: tools/lab/out/health',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facings: {
        kind: 'list',
        usage: 'deg',
        default: '0',
        help: 'the way the hero faces, degrees (0 is +z; the first alone)',
      },
      shares: {
        kind: 'list',
        usage: 'a,b',
        default: '1,0.6,0.5,0.4,0.25,0.1,0',
        help: 'the shares of his most Health he is held at, in turn',
      },
      pictures: {
        kind: 'switch',
        help: 'picture the frames under the share the look starts at (=false: numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch, in the first scenario: the look drawn with Health whole, and its '
          + 'blood driven into the middle of the view',
      },
      ...COMMON_OPTIONS,
    },
  },
  held: {
    help: 'every held skill of the hero\'s class held as the player holds it, over a training dummy ahead: ready, '
      + 'its preview in its own look with no countdown and a release casting; then held through its cooldown and '
      + 'short of energy, red and counting down until a release would cast; Quarry Mark\'s red outline round the foe '
      + 'it would mark, over the shoulder and through the eyes too, its pixels near the foe and none away from it. A '
      + 'preview missing, in the wrong look or off its countdown, a release casting when it mustn\'t or not when it '
      + 'must, and an outline off its foe are problems: tools/lab/out/held (--class ranger, mage)',
    options: {
      pictures: { kind: 'switch', help: 'picture each preview, ready and on its cooldown (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: each preview read as ready with no countdown on its cooldown, '
          + 'Quarry Mark\'s outline drawn round the hero, and a shader compiled mid-game',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  envcost: {
    help: 'what the environment\'s lookups take of the GPU: the frame drawn with the scene\'s environment and '
      + 'without it, in turns within one page (a run\'s load is both sides\'), the hero standing in each biome and '
      + 'view; with --ab, each commit timed against itself',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third',
        help: 'the views: top, third, first',
      },
      rounds: { kind: 'number', usage: 'n', default: '8', help: 'the rounds of turns, each of 6 renders a side' },
      canary: {
        kind: 'switch',
        help: 'draw the frame twice with the environment: it must read at least 1.6 times the frame without',
      },
      ...COMMON_OPTIONS,
    },
  },
  haze: {
    help: 'the hero\'s held weapons\' light through the eyes (or his hands\', or over the shoulder: --part, --view): '
      + 'the frame drawn with them and without, each with the '
      + 'grade\'s adaptation and without it; their surface near white (glare over 5% of it is a problem), their '
      + 'bloom past it (over 0.5% of the frame), and any pixel outside their own darkened by their light (the '
      + 'adaptation to a bright area spread round them as a veil; over 0.5% of the frame): tools/lab/out/haze (the '
      + 'frame, and its map: glare yellow, bloom pink, haze red)',
    options: {
      biome: {
        kind: 'choice',
        choices: ['crypt', 'forest'],
        usage: 'crypt|forest',
        help: 'the biome (the forest by default)',
      },
      part: {
        kind: 'choice',
        choices: ['weapons', 'hands'],
        usage: 'weapons|hands',
        help: 'what\'s measured: the held weapons (by default), or the hands (the mage\'s glowing one)',
      },
      view: {
        kind: 'choice',
        choices: ['first', 'third'],
        usage: 'first|third',
        help: 'the view: through the eyes (by default), or over the shoulder',
      },
      facings: {
        kind: 'list',
        usage: 'a,b',
        default: '0,90,180,270',
        help: 'the ways the hero looks, degrees (0 is +z)',
      },
      pictures: { kind: 'switch', help: 'picture each frame and its haze (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant the faults the measures must catch: the frame with the weapons drawn at 0.8 of its exposure '
          + '(a haze), and the weapons lit white (a glare and its bloom)',
      },
      gear: SETUP_OPTIONS.gear,
      weapon: SETUP_OPTIONS.weapon,
      at: SETUP_OPTIONS.at,
      ...COMMON_OPTIONS,
    },
  },
  draw: {
    help: 'every drawn shot of the hero\'s class (the ranger\'s) drawn to full and held there as the player holds it, '
      + 'in each view, the motes on its arrowhead read every frame: none as it\'s drawn, and held at full it glints '
      + 'until it\'s loosed, seen in the view (the frame drawn with the glint and without it, round the arrowhead, '
      + 'every 4 frames of the hold, pictured at its most glaring), and in the close views the crosshair bold held '
      + 'at full alone, swelling into it once about its middle (none with motion reduced); a glint before full '
      + 'draw, missing or gone at full, hardly seen or glaring in a blob, the crosshair bold before full, regular at '
      + 'full, beating other than once or moving off its middle, and one with nothing drawn are problems: '
      + 'tools/lab/out/draw (--class ranger)',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      pictures: {
        kind: 'switch',
        help: 'picture each shot held at full draw, the screen and its arrowhead close, and the crosshair as it\'s '
          + 'drawn, at its beat\'s height and bold (=false: the numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: the glint and the crosshair\'s bold shown as the bow is '
          + 'drawn and taken away at full draw, the crosshair swelling about its corner, and its beat with motion '
          + 'reduced',
      },
      at: SETUP_OPTIONS.at,
      facing: SETUP_OPTIONS.facing,
      ...COMMON_OPTIONS,
    },
  },
  blink: {
    help: 'the mage\'s blink cast as the player casts it (the key held over the aim, let go): on open ground, past his '
      + 'reach, at a prop, past one, out at the arena\'s edge, up onto the dais and at his feet, where the preview '
      + 'showed against where he came out, a blow tried every frame, his body coming apart and whole again; then held '
      + 'through its cooldown and short of energy, the preview red and counting down until a release would cast; then '
      + 'foes near where he vanished and further off; a landing off its preview, past his reach or in a prop, a blow '
      + 'landed while he crossed, a preview green or off its countdown while a release would cast nothing, a near foe '
      + 'moving while dazed or never coming on again and a far one dazed or stopping are problems: tools/lab/out/blink '
      + '(--class mage)',
    options: {
      pictures: { kind: 'switch', help: 'picture a blink\'s moments and the dazed foes (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: the preview read a metre off, the guard taken off as he comes '
          + 'apart, the preview read green with no countdown on its cooldown, and a near foe\'s daze cleared at once',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  death: {
    help: 'each skill\'s kills as the player sees them fall: foes stood dazed where it strikes and cast at twice, each '
      + 'a hair from death and then holding just under what the first cast dealt it, every body followed as drawn '
      + 'until it has dissolved (how hard it was thrown and which way, how far it flew and how high, when it lay '
      + 'still); a body under the floor, in a prop or past the wall, posed off its points, gone back at the hero or '
      + 'against a swing, a storm\'s kill not going round it, the bodies killed with little to spare thrown as hard '
      + 'and a shader compiled meanwhile are problems: tools/lab/out/death (--class warrior)',
    options: {
      skills: {
        kind: 'list',
        usage: 'a,b',
        help: 'the skills, by key, behaviour or name (every one of the hero\'s that deals damage by default)',
      },
      pictures: {
        kind: 'switch',
        help: 'picture each skill\'s bodies as they fall and lie (=false: the numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: a body put under the floor for a frame, one thrown back at the '
          + 'hero, one struck off its middle turned the other way',
      },
      trace: {
        kind: 'switch',
        help: 'list each frame of each body each skill throws hard: each point\'s height over the floor less its size, '
          + 'how far its drawn pose is off it and its point\'s own height (cm)',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  hits: {
    help: 'each skill\'s blows as they land: foes stood dazed where it strikes (as death stands them), living past '
      + 'every blow, and it cast at them as the player casts it, every hit caught as it lands (a blow: the hits within '
      + 'a frame of each other); when each blow landed from the press, the gaps between them, when the hero was free '
      + 'again and the damage a second till then; striking nothing, a gap past --apart and blows no quicker than '
      + '--than\'s are problems (hits twinFangs --than cleave --apart 0.2 --class warrior --gear dual)',
    argument: 'skills',
    options: {
      apart: { kind: 'number', usage: 's', help: 'the most a skill\'s blows may be apart' },
      than: {
        kind: 'text',
        usage: 'skill',
        help: 'a skill held down for a row of its blows (the basic attack: cleave), whose pace each skill\'s blows '
          + 'must be quicker than',
      },
      canary: {
        kind: 'switch',
        help: 'plant the fault the checks must catch: a blow struck 1 s after each skill\'s first (with --apart or '
          + '--than), or else its foes kept from harm',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  log: {
    help: 'the battle log held to the hits as they land: each skill the hero can use, in each way of holding weapons '
      + 'his class has (or --gear\'s), cast at foes stood where it strikes as hits casts it, and the basic attack at '
      + 'foes it kills; each hit must be listed once and in turn, under the skill cast, on the foe it struck, for what '
      + 'it dealt, of its type, a crit and a kill as they were, and the panel must show every line; then a foe of each '
      + 'way of attacking (a blow, a bolt, a slam) strikes the hero, each blow listed under its name and attack, for '
      + 'the life it took and what his shield and ward stopped (log --class warrior --gear dual)',
    options: {
      skills: { kind: 'list', usage: 'a,b', help: 'the skills cast (every one the hero can use by default)' },
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: a hit in each cast listed under another skill, and a blow on '
          + 'the hero from no foe',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  tooltips: {
    help: 'each damage skill\'s tooltip held to the hits it deals: the hero given modifiers of every kind (all, '
      + 'arcane and elemental damage, a crit\'s chance and share, casting speed), each skill he can use, in each way '
      + 'of holding weapons his class has (or --gear\'s), cast at foes stood where it strikes as hits casts it; every '
      + 'hit must be within a figure its tooltip states (a crit raised by its share), a crit\'s chance the hero\'s, '
      + 'and a hit dealt over time as often as it says; the hotbar\'s tooltip must follow a change of his gear, and '
      + 'a skill giving him Health or a ward must give what its tooltip states',
    options: {
      skills: { kind: 'list', usage: 'a,b', help: 'the skills cast (every one dealing damage he can use by default)' },
      canary: {
        kind: 'switch',
        help: 'raise all damage and the hero\'s most Health once each tooltip is read, as a tooltip behind a change: '
          + 'the hits must be found above it, and what was given off it',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  spin: {
    help: 'mouse look turned one way for a long while in each close view, then the other, the pointer locked as the '
      + 'player\'s click takes it: mid-spin the browser\'s own move under the lock (Chrome on Windows sends one now '
      + 'and then, half the window across, as it puts its hidden cursor back) must not turn the view: no frame may '
      + 'turn it past three times the spin\'s steady turn (#318)',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['third', 'first'],
        default: 'third,first',
        help: 'the close views: third, first',
      },
      canary: {
        kind: 'switch',
        help: 'turn the view round by 180 degrees in a frame mid-spin, which must be found each way in each view',
      },
      at: SETUP_OPTIONS.at,
      facing: SETUP_OPTIONS.facing,
      ...COMMON_OPTIONS,
    },
  },
  cursor: {
    help: 'the cursor drawn over mouse look while Alt is held: in each close view the pointer locked as the player\'s '
      + 'click takes it (the lab\'s browser plays the lock, every event of the mouse sent to the game\'s canvas while '
      + 'it\'s held), then Alt held: the mouse moved onto the battle log\'s Pause must leave the view still and draw '
      + 'the cursor there, lit; its click must pause the log and not attack; over the hotbar\'s slot its tooltip must '
      + 'show; the wheel over the log\'s lines must scroll them, not zoom; a click on the world must not attack; Alt '
      + 'let go, the mouse turns the view again; the lock held and the run going on throughout',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['third', 'first'],
        default: 'third,first',
        help: 'the close views: third, first',
      },
      canary: {
        kind: 'switch',
        help: 'hold Ctrl instead, a key that frees nothing: the checks must find the view turning with the mouse and '
          + 'the click on Pause landing on the world',
      },
      at: SETUP_OPTIONS.at,
      facing: SETUP_OPTIONS.facing,
      gear: SETUP_OPTIONS.gear,
      weapon: SETUP_OPTIONS.weapon,
      ...COMMON_OPTIONS,
    },
  },
  evade: {
    help: 'the shooters getting out of the hero\'s attacks: each foe that evades (the Sporecaller ducks into the '
      + 'ground, the Rift Witch blinks away) stood before him, held to its spot and kept from shooting, and each '
      + 'attack of his it evades cast at it try after try, from in front of it, from behind it and (a drawn shot at '
      + 'a ducked foe) at its feet, every evade and hit caught; from in front, an evaded share off a half, a try '
      + 'struck after it evaded or missed without it, and a blink out of its reach, into a prop, by the wall or the '
      + 'hero or past a prop, from behind any evade, and at its feet a shot that missed, are problems (--class '
      + 'ranger, mage, warrior)',
    options: {
      skills: {
        kind: 'list',
        usage: 'a,b',
        help: 'the attacks, by key, behaviour or name (every one of the hero\'s that a foe evades by default)',
      },
      tries: {
        kind: 'number',
        usage: 'n',
        help: 'tries from in front, each attack and foe (30 by default; a third as many from behind and at its feet)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: the foes seeing all round them, and ducking without going down',
      },
      trace: {
        kind: 'switch',
        help: 'list each try: its evade, its hits, and where each of the hero\'s shots ended against the foe\'s feet '
          + 'and top',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  throws: {
    help: 'what the slamming foes throw at a hero too far off to slam, the thrower held to its spot and throwing as '
      + 'its AI has it, a throw a case: the Cinder Brute\'s lava at him stood still (it must land where he stood as '
      + 'it left the hand, its ring there every frame it flies, its splash and its pool hurting him), stepped off as '
      + 'it\'s thrown (nothing may hurt him) and up close (it slams, throwing nothing); the Barkhide Hulk\'s vine at him '
      + 'stood still (held for its hold, his walking going nowhere, walking after), stepped aside (never caught), '
      + 'stepped back onto it as it lies (held then, not before) and '
      + 'dashing once held (torn free: --class warrior, mage)',
    options: {
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: a splash far wider than its ring, a vine catching far off its '
          + 'line, and a dash leaving the hero held',
      },
      trace: {
        kind: 'switch',
        help: 'list each case\'s frames: the chunk\'s flight, the hero\'s place and hold',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  rush: {
    help: 'Bull Rush\'s foes as it sweeps them up:foes stood dazed on its line and at its sides (living, a hair from '
      + 'death, an elite and the boss), a set at a time, each followed until it is still (when it was met, how long it '
      + 'rode before the hero and how near his body, how it was let go, where it ended against where he stopped); a '
      + 'foe never met, left standing, carried inside him or ending behind or beside him, a living foe left unthrown '
      + 'and an elite or a boss thrown are problems; then skills cast with it (a Power Strike charged and the charge '
      + 'cast over it, a cleave and Twin Fangs as it runs, a strike at its stop, the charge cast as Steel Tempest '
      + 'spins and with the shield raised): one not cast as pressed, landed out of the run, striking nothing, shown '
      + 'as the charge, off its strides or let go as it runs, and the charge striking less than every foe on its '
      + 'line or falling short, are problems: tools/lab/out/rush (--class warrior)',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['sets', 'casts'],
        help: 'the parts (both by default): sets (the sets of foes the charge is cast through) and casts (the skills '
          + 'cast with it, those the weapons held allow)',
      },
      dummies: {
        kind: 'switch',
        help: 'cast the skills with the charge at the lobby\'s training dummies (planted, never carried) in place of '
          + 'the biome\'s foes',
      },
      pictures: {
        kind: 'switch',
        help: 'picture each set as the charge stops and once every foe is still, and each skill cast with it as it '
          + 'lands (=false: the numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: the first foe thrown put behind the hero as it lands, the '
          + 'charge shown in the strike\'s place as both run, its legs dropped from under the cleave, its blows '
          + 'made harmless, Steel Tempest let go as it is cast, and the charge cut short as Twin Fangs lands',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  crowd: {
    help: 'a crowd of foes killed at once and what the frame costs as their bodies fall: the crowd timed standing and '
      + 'then every frame until its bodies are gone, by the browser\'s own clock with the game drawn, the bodies\' '
      + 'part apart, at each CPU slowdown (as a low-end device\'s) and frame rate; the bodies\' part past its budget '
      + 'with the CPU slowest at 60 a second, or a canary unseen, are problems (--class warrior)',
    options: {
      count: { kind: 'number', usage: 'n', help: 'how many foes (by default the most a wave keeps alive, 38)' },
      throttles: {
        kind: 'list',
        usage: 'a,b',
        help: 'the CPU\'s slowdowns, a round each (1,4,6 by default: as it is, a mid-range phone\'s, a low-end one\'s)',
      },
      rates: { kind: 'list', usage: 'a,b', help: 'the frame rates, a round each at every slowdown (60,30 by default)' },
      skill: {
        kind: 'text',
        usage: 'name',
        help: 'the crowd killed by a cast of this skill (its key, behaviour or name), not by a blow each',
      },
      canary: {
        kind: 'switch',
        help: 'plant a cost the measure must see: the first round again, each body made 0.1 ms slower a frame',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  compiles: {
    help: 'whether the boot\'s warm-up compiled what a fight draws: in each biome a prop of every kind it has broken '
      + 'in turn, its rubble, debris and smoke drawn as they fly and settle, then its first wave fought, and the '
      + 'first biome\'s again by a hero built afresh (a class switch\'s); every program compiled meanwhile is a '
      + 'problem, said as the game\'s performance report says it, and so is a pass lit by another count of point '
      + 'lights than the boot\'s (the scene\'s, and through the eyes the arms\')',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      view: SETUP_OPTIONS.view,
      gear: SETUP_OPTIONS.gear,
      weapon: SETUP_OPTIONS.weapon,
      canary: {
        kind: 'switch',
        help: 'draw a material of a kind nothing else is before the hero: its program must come out as compiled; '
          + 'and put a point light in the scene: the count must find it',
      },
      switch: {
        kind: 'choice',
        usage: 'ranger|warrior|mage',
        choices: ['ranger', 'warrior', 'mage'],
        help: 'switch the hero to this class in the lobby first, as a player picks it (its button clicked, the '
          + 'switch waiting for the heroes\' warm-up), then fight as him: what a class switch compiles',
      },
      ...COMMON_OPTIONS,
    },
  },
  programs: {
    help: 'the programs the boot compiled (the game\'s ledger of them, dev builds alone): how many each loading '
      + 'step made, by the warm-ups\' compile or by a draw; each kind with the fields of its key that set its '
      + 'programs apart; those never drawn; those made after the reveal',
    options: {
      canary: {
        kind: 'switch',
        help: 'warm a box of a kind nothing else is (it must be listed compiled and drawn) and one on a layer no '
          + 'camera sees (it must be listed never drawn)',
      },
      cost: {
        kind: 'switch',
        help: 'compile each program again alone, salted so no cache answers, and time it: by kind, by what uses '
          + 'them, by the point lights they\'re lit by, the longest (a minute or more; its canary: the cache)',
      },
      ...COMMON_OPTIONS,
    },
  },
  maps: {
    help: 'the procedural maps a first visit makes in its workers (src/core/pbr.ts PRELOAD), each made on the page '
      + 'and timed, and a digest of its pixels: a map made faster keeps every pixel (with --ab, each digest as '
      + 'main\'s, the times side by side); each repeated map\'s seams (a seam fails it) and its means',
    options: {
      maps: { kind: 'list', usage: 'a,b', help: 'the recipes made, by name (every one by default)' },
      runs: { kind: 'number', usage: 'n', help: 'how many times each is made, its time the fastest (1 by default)' },
      pictures: {
        kind: 'switch',
        help: 'each map\'s albedo and height laid twice each way, its corner at its own pixels and its material lit '
          + 'on a square and a ball, a sheet a group (metal, stone, wood...)',
      },
      canary: {
        kind: 'switch',
        help: 'a byte of the first map\'s pixels changed once it\'s made (its digest must change), and a ramp '
          + 'across u planted in a copy of it (a seam must be found)',
      },
      ...COMMON_OPTIONS,
    },
  },
  tiles: {
    help: 'how big each repeated map\'s tile comes out on each surface of a biome: the metres a tile covers along u '
      + 'and v over the surface\'s triangles (the middle, a tenth to nine tenths of its area), how stretched it is '
      + 'and the map\'s pixels a metre',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      maps: { kind: 'list', usage: 'a,b', help: 'the maps, by their recipe\'s name (every repeated map by default)' },
      pictures: {
        kind: 'switch',
        help: 'each surface pictured as the player meets it: its point nearest the arena\'s middle, at a hero\'s height, '
          + 'from 2 m out, a sheet a biome',
      },
      canary: {
        kind: 'switch',
        help: 'a board 2 m by 0.5 m laid in each biome, its map repeated twice along u (it must read 1 m by 0.5 m)',
      },
      ...COMMON_OPTIONS,
    },
  },
  winding: {
    help: 'which way the game\'s faces point: every model built afresh and every biome\'s props, each mesh split '
      + 'into its parts and each judged by its signed volume (out, in, or open); a part wound inside out on a '
      + 'one-sided material shows its inside',
    options: {
      models: { kind: 'list', usage: 'a,b', help: 'the models, by their id (`husk`, `ranger`; every one by default)' },
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      canary: { kind: 'switch', help: 'a box wound inside out, drawn one sided, planted in the first biome' },
      ...COMMON_OPTIONS,
    },
  },
  beyond: {
    help: 'the ranger\'s arrows loosed over the wall: in each biome, at angles round the ring, his basic attack drawn '
      + 'to full at the ground past the wall and the nearest tree that way; each arrow left standing must have a '
      + 'surface drawn at its point (one in the air is a problem; --class ranger)',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      angles: { kind: 'number', usage: 'n', help: 'the angles round the ring he shoots out at (8 by default)' },
      canary: { kind: 'switch', help: 'an arrow planted standing in the air past the wall: it must be found' },
      ...COMMON_OPTIONS,
    },
  },
  trees: {
    help: 'the trees in the play area as the ranger\'s arrows meet them: in each biome every tree inside the wall a '
      + 'wooden prop and an arrow shot at its trunk standing in it; then another biome shown, and no arrow left '
      + '(--class ranger)',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      canary: {
        kind: 'switch',
        help: 'the first tree made stone and an arrow stuck again after the switch: both must be found',
      },
      ...COMMON_OPTIONS,
    },
  },
  columns: {
    help: 'the crypt\'s broken columns roll after roll: each mesh welded, an edge one triangle uses above the '
      + 'shaft\'s foot is a hole; the break\'s face inside the flutes no steeper than 75 degrees',
    options: {
      seeds: { kind: 'list', usage: 'a,b', help: 'the runs\' seeds the columns are rolled from (1 to 12)' },
      canary: { kind: 'switch', help: 'a triangle taken out of the first column\'s break: it must be found' },
      ...COMMON_OPTIONS,
    },
  },
  shadows: {
    help: 'the hero\'s shadow cast as one against his pieces cast each on its own: in each way he holds his '
      + 'weapons, in all his armour and in none, and in each view, the frame drawn both ways and compared pixel by '
      + 'pixel (more than 2 levels apart is a difference)',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      canary: { kind: 'switch', help: 'his pieces\' shadow moved 30 cm in the first case: it must be seen' },
      cost: {
        kind: 'switch',
        help: 'time the shadow map\'s draw a frame instead, cast as one and each piece alone in turns on one page',
      },
      ...COMMON_OPTIONS,
    },
  },
  wall: {
    help: 'how near the hero walks up to the wall: in each biome, at angles round the ring, he walks straight out '
      + 'until it stops him, and rays across his way read the gap between his body and the nearest surface drawn '
      + '(more than 20 cm is air between them; below -5 cm his body is in it)',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      angles: { kind: 'number', usage: 'n', help: 'the angles round the ring he walks out at (48 by default)' },
      canary: { kind: 'switch', help: 'the first angle\'s gap read a metre short of where he stopped: it must be seen' },
      ...COMMON_OPTIONS,
    },
  },
  rim: {
    help: 'the hero walked round the wall pressed into it, each way: every frame he moved further than a run '
      + 'takes him (thrown by the wall), and every stop he can\'t walk back in from (stuck)',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      canary: { kind: 'switch', help: 'a jump of 1 m planted and a stop held in place: both must be caught' },
      ...COMMON_OPTIONS,
    },
  },
  draws: {
    help: 'one frame\'s draw calls with the crowd of foes standing before the hero, by the geometry each drew, the '
      + 'most first: its draws in the scene, its shadow map and after it, the triangles, its material and what drew it '
      + '(a geometry drawn many times a frame is one an instanced mesh or a merge would draw once)',
    options: {
      count: {
        kind: 'number',
        usage: 'n',
        help: 'how many foes (by default the most a wave keeps alive, 38; 0: none)',
      },
      rows: { kind: 'number', usage: 'n', help: 'how many rows each list shows (16 by default)' },
      biome: {
        kind: 'choice',
        choices: ['crypt', 'forest'],
        usage: 'crypt|forest',
        help: 'the biome (as the page has it by default)',
      },
      canary: {
        kind: 'switch',
        help: 'stand seven boxes of one geometry before the hero, which must come out as seven draws of it, seven '
          + 'instanced boxes, four far behind the camera, which must come out as four outside the view, and an '
          + 'instanced mesh of none, which must come out as a draw of nothing',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  weapons: {
    help: 'each of the hero\'s weapons alone in a plain, lit studio: face on, edge on, from behind, from '
      + 'three-quarters and its head close up, with its size and its triangles: tools/lab/out/weapons/sheet.png',
    options: {
      weapons: { kind: 'list', usage: 'a,b', help: 'the bases pictured (the class\'s weapons by default)' },
      canary: { kind: 'switch', help: 'an empty studio pictured too: the measure of what\'s drawn must find nothing' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  hands: {
    help: 'the hero\'s right hand alone in a plain, lit studio, laid flat, open, relaxed, in a fist and closed '
      + 'round a handle, from the back, the palm, each side, the fingertips and three-quarters, with its size against '
      + 'a man\'s and its triangles: tools/lab/out/hands/sheet.png',
    options: {
      poses: {
        kind: 'list',
        usage: 'a,b',
        choices: ['flat', 'open', 'relaxed', 'fist', 'handle'],
        help: 'the poses pictured (all by default)',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['back', 'palm', 'thumb', 'little', 'tips', 'quarter', 'cuffs', 'web'],
        help: 'the views (all but the close-ups by default: cuffs, the glove\'s cuffs over the fingers; web, the '
          + 'thumb\'s web)',
      },
      look: LOOK_OPTION,
      glove: { kind: 'switch', help: 'the hand in its glove (=false: bare; as the hero\'s is by default)' },
      canary: {
        kind: 'switch',
        help: 'an empty studio pictured too, where nothing may be found drawn, and the hand built 10% larger, '
          + 'which must measure so',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  neck: {
    help: 'each hero\'s neck as it\'s sculpted, bare, in his chest item and under his hat or helm, at rest and '
      + 'looking aside: read up lines all round it from the clothes to the head (the ridges and shelves round it, the '
      + 'step and colour where the head\'s own skin takes over from the neck\'s, its girth against a man\'s, skin '
      + 'through the clothes) and pictured close in a lit studio from behind, the sides, the front and from above '
      + 'behind: tools/lab/out/neck/sheet.png',
    options: {
      classes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['warrior', 'mage', 'ranger'],
        default: 'warrior,mage,ranger',
        help: 'the heroes',
      },
      dresses: {
        kind: 'list',
        usage: 'a,b',
        choices: ['bare', 'chest', 'hat'],
        default: 'bare,chest,hat',
        help: 'what he wears: nothing over his clothes, his chest item, that and his hat or helm',
      },
      poses: {
        kind: 'list',
        usage: 'a,b',
        choices: ['rest', 'aside'],
        default: 'rest,aside',
        help: 'his head straight, or turned aside and bowed a little as he looks at a foe',
      },
      look: LOOK_OPTION,
      canary: {
        kind: 'switch',
        help: 'plant the faults the measures must catch: a ridge round the neck, and the neck\'s skin paler and wider '
          + 'where the head\'s takes over',
      },
      ...COMMON_OPTIONS,
    },
  },
  hood: {
    help: 'the mage\'s hood against its reference: its outline from the front, his left and the back laid over the '
      + 'reference\'s in the face\'s unit (the eyes to the chin), how much they share and how wide and high each is; its '
      + 'rim, point and capelet against the sizes the reference was made to; how much it sways as he walks: '
      + 'tools/lab/out/hood/sheet.png',
    options: {
      ref: {
        kind: 'text',
        usage: 'marks.json',
        help: 'the reference: each view\'s picture beside the file, with where its eyes and chin are '
          + '({ "front": { "picture": "front.png", "eyes": [x, y], "chin": [x, y] }, "left": ..., "back": ... })',
      },
      canary: { kind: 'switch', help: 'the hood made narrower: its rim and its outline must read it so' },
      edges: { kind: 'switch', help: 'list each view\'s outline every 0.2 E down, ours beside the reference\'s' },
      rows: { kind: 'switch', help: 'list how far the capelet stands off him row by row, its front, shoulders, back' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  turnaround: {
    help: 'the hero standing in a plain, lit studio from the front, three-quarters to his right, his right side and '
      + 'his back, and his head close from the front and the side, with how many triangles he is drawn with; '
      + '--ref sets a reference sheet\'s panels in a row under ours: tools/lab/out/turnaround/sheet.png',
    options: {
      ref: { kind: 'text', usage: 'picture', help: 'a reference sheet (PNG, JPEG or WebP) whose panels --panels cuts' },
      panels: {
        kind: 'text',
        usage: 'l,t,r,b;...',
        help: 'the reference\'s panel for each view in order (front, quarter, right, back, face, profile), its '
          + 'edges as shares of the picture; an empty one leaves its place empty',
      },
      canary: { kind: 'switch', help: 'an empty studio pictured too: the measure of what\'s drawn must find nothing' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  eyes: {
    help: 'a skill of the hero\'s cast through the eyes, frame by frame from the press until the arms are at rest '
      + 'again: where the weapon\'s tip is on the screen at rest, wound up, through the blow and at its end, how '
      + 'fast it crosses the view and where it is as the skill fires; a two-hander let go of by the other hand, or '
      + 'seen in one hand, an arm\'s joint past its range (a gripping wrist past a gripping wrist\'s), a strike led '
      + 'by its flat, slid across rather than swung round, stopped dead, met at the aim by its blade\'s inner part or '
      + 'sweeping a narrow share of the skill\'s arc, a weapon out of the frame at rest, and a basic attack\'s cuts '
      + 'chained unlike a body chains them (a backhand from the rest, back to the rest between cuts, the last end '
      + 'not held) are problems; with a film of the frames, each labelled with the gripping wrists\' bends: '
      + 'tools/lab/out/eyes/<skill> (--class warrior)',
    argument: 'skill',
    options: {
      times: { kind: 'number', usage: 'n', help: 'casts in a row, the key held through them (1 by default)' },
      apart: {
        kind: 'number',
        usage: 's',
        help: 'the key let go as each cast begins and pressed again s seconds after it ended (a pause in the attacks)',
      },
      every: { kind: 'number', usage: 'n', help: 'a frame pictured into the film every n (2 by default)' },
      cast: { kind: 'number', usage: 'n', help: 'film the nth cast of the row alone (every cast by default)' },
      close: {
        kind: 'list',
        usage: 'a,b',
        help: 'each cast\'s firing frame from these close-ups too (front, left, right, back, above): the arms and '
          + 'the weapon seen from outside, framed on the weapon\'s hand',
      },
      film: { kind: 'switch', help: 'the film of the frames (=false: the numbers alone)' },
      frames: {
        kind: 'switch',
        help: 'list every frame: the grip, the weapon\'s way and the other hand in the eyes\' frame, as the '
          + 'moves through the eyes are keyed (models/warriorEyes.ts)',
      },
      span: { kind: 'pair', usage: 'from,to', help: 'with --frames, only the frames from the first to the second' },
      canary: {
        kind: 'switch',
        help: 'the arms held as they were at the press and the other arm dropped: no blow, and a two-hander seen '
          + 'in one hand, no sweep, the dropped left weapon out of the frame and a chained cut as a backhand from the '
          + 'rest, must be found; the weapon turned its edge, then its flat, into its blow; held at its first turn, '
          + 'sliding with the hand; the right fist bent on its forearm 60° each way',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  swing: {
    help: 'a swing through the eyes keyed from a pose (src/entities/viewSwing.ts): the key of the swing that puts its '
      + 'grip at --grip and its weapon along --way (camera space: m, x right, y up, -z ahead), and what of the pose an '
      + 'arm swung in its plane can\'t hold (the grip or the way off the plane, the wrist past its range, the grip '
      + 'past the reach); a key given placed (--key), or else every key of the swing: the grip, the weapon, the elbow, '
      + 'the wrist and a two-hander\'s lower grip, with how far it is from the other shoulder (--class warrior)',
    argument: 'swing',
    options: {
      grip: {
        kind: 'numbers',
        each: 3,
        usage: 'x,y,z[,x,y,z...]',
        help: 'the grip\'s place in the view to key, or several, a pose each (with --way)',
      },
      way: {
        kind: 'numbers',
        each: 3,
        usage: 'x,y,z[,x,y,z...]',
        help: 'the weapon\'s way in the view to key, or one for each --grip',
      },
      key: {
        kind: 'numbers',
        each: 5,
        usage: 'way,reach,bend,drop,roll[,...]',
        help: 'a key to place, or several, its numbers after its share (models/warriorEyes.ts `warriorSwings`)',
      },
      left: {
        kind: 'switch',
        help: 'the left hand\'s swing: the right\'s mirrored across the view, as a dual wielder\'s off hand cuts '
          + '(--gear dual)',
      },
      turn: {
        kind: 'number',
        usage: 'rad',
        help: 'the trunk turned this far to the left, as a cut turns it (models/warriorEyes.ts `twoTurn`): the keys '
          + 'placed turned with it round the spine, and a pose (--grip, --way) taken as the eyes see it so turned',
      },
      trunk: {
        kind: 'choice',
        choices: ['rest', 'row', 'back', 'foreOut', 'backOut'],
        usage: 'rest|row|back|foreOut|backOut',
        help: 'each of the swing\'s keys turned as the trunk turns a cut of the hero\'s weapons at its share '
          + '(viewSwing.ts `cutTurnAt`): a forehand from rest, one in a row, or a backhand (in a row, the other way: '
          + 'a two-hander\'s backhand, a dual wielder\'s left hand\'s cut); or the way back to the guard after a '
          + 'forehand or a backhand, the turn its end left unwound (models/warrior.ts)',
      },
      canary: {
        kind: 'switch',
        help: 'the swing\'s blow keyed back from where its own key places it, and a grip moved 10 cm off its plane, '
          + 'must come back as that key and read 10 cm off',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  match: {
    help: 'the hero through the eyes, standing or at a moment of a strike, beside a reference\'s screenshot or a '
      + 'frame of its clip (a game his first-person weapons are posed after), on a screen of its shape: the '
      + 'reference, his frame and the two blended, the points marked on it (<picture>.marks.json, a clip\'s frame\'s '
      + '<clip>@<ms>.marks.json: crop, points in and tip, wide, box, the weapon\'s and fist\'s outline) and his own '
      + 'drawn on each, how far his are off and how much of the outlines his frame covers: '
      + 'tools/lab/out/match/<picture>/match.png',
    argument: 'picture',
    options: {
      frame: {
        kind: 'number',
        usage: 's',
        help: 'with a clip (.mp4, .webm, .mkv, .mov), the moment of it matched (cut by ffmpeg into '
          + 'tools/lab/out/match/frames)',
      },
      skill: {
        kind: 'text',
        usage: 'name',
        help: 'a strike pictured rather than the rest: the skill (its key, its behaviour or its name) cast ahead',
      },
      share: {
        kind: 'number',
        usage: '0-1',
        help: 'with --skill, the moment of its cast pictured, a share of it (0.5 by default)',
      },
      fit: {
        kind: 'list',
        usage: 'name.field,...',
        help: 'tunable values searched for the rest that frames his weapon nearest the marks, then pictured, with '
          + 'the --tune that gives it (warriorEyes.oneOn,warriorEyes.oneDir)',
      },
      near: {
        kind: 'list',
        usage: 'a,b',
        choices: ['line', 'wide', 'box', 'outline'],
        default: 'outline',
        help: 'the marks --fit comes near: the weapon\'s line (in and tip), its width, the part of the frame it '
          + 'covers, the outlines of the weapon and the fist (by default: each number alone was matched with the '
          + 'head out of the frame)',
      },
      canary: {
        kind: 'switch',
        help: 'his points taken as the reference\'s moved 10% across: the comparison must find them so; with '
          + '--fit, fitted to his own frame from values moved off it: the fit must find its way back',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  shots: {
    help: 'the hero\'s basic attack (the ranger\'s bow drawn to full) loosed at points over each biome\'s boss '
      + 'with its summons and the biome\'s foes packed round it, in each view, the crosshair turned onto each point in '
      + 'the close views, its flight followed frame by frame: every shot must strike the first foe drawn along its '
      + 'flight (none if none), and one aimed inside a foe reach it unless another is in the way; a basic attack '
      + 'that doesn\'t fly at the point (the mage\'s seeking bolt) is said so, and a canary missed is a problem '
      + '(--class ranger)',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      shots: { kind: 'number', usage: 'n', help: 'shots in each view, half over the boss (12 by default)' },
      canary: {
        kind: 'switch',
        help: 'the first shot\'s foe made invulnerable: the shot, taking nothing, must be found missed',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  gear: {
    help: 'full sets rolled for every class as its loot rolls them, at each rarity and item level, and what a set '
      + 'gives on average: Health (his own and gear\'s), regeneration a second, the draught\'s heal and how much it '
      + 'multiplies his damage; a class whose Health or regeneration from gear is out of the order of his own Health '
      + 'is a problem',
    options: {
      tiers: {
        kind: 'list',
        usage: 'rarity@ilvl,...',
        default: 'magic@5,rare@15,epic@30,legendary@50',
        help: 'the tiers: a rarity at an item level each',
      },
      sets: { kind: 'number', usage: 'n', help: 'the sets rolled for each class at each tier (400 by default)' },
      canary: {
        kind: 'switch',
        help: 'plant a fault the check must catch: the ranger\'s Health from gear rolled as the mage\'s',
      },
      ...COMMON_OPTIONS,
    },
  },
  hall: {
    help: 'the hero in focus in the hall of heroes (the hero selection screen) showing off his skill and standing '
      + 'after it, frame by frame: each hand, elbow and the weapon\'s tip in his own frame, and each jerk (its move '
      + 'a frame changing by over 12 cm, a jump, a stop or a start; a blow already flying past 25 cm a frame is its '
      + 'own); --gear and --weapon put the weapon in his hand there',
    options: {
      frames: { kind: 'switch', help: 'list every frame a point jerked, with its action and its moves' },
      glow: {
        kind: 'switch',
        help: 'the light round the weapon\'s tip instead (the mage\'s staff\'s crystal) frame by frame: its near '
          + 'white share, its peak against its mean and its flashes, pictured at its brightest and dimmest',
      },
      pictures: { kind: 'switch', help: 'with --glow, picture the tip (on by default; --pictures=false for none)' },
      canary: {
        kind: 'switch',
        help: 'plant a fault the measure must catch: the right shoulder turned for a frame after the showcase '
          + '(with --glow, the tip\'s glow lit up three times over for a second)',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  glance: {
    help: 'the hero\'s casual look round as he stands idle, read from the head\'s turn from the chest and the eyes\' '
      + 'in their sockets: in a run\'s countdown, walking and attacking from a glance, through the eyes, in the lobby '
      + 'and in the hall of heroes (within a neck\'s range, unhurried, no jerk, the eyes leading, never a loop)',
    options: {
      seconds: { kind: 'number', usage: 's', help: 'how long he stands in the countdown (40 by default)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the measure must catch: the head kicked aside for a frame, glances let come as he walks',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  poses: {
    help: 'the hero\'s pose a move at a time (standing, walking, strafing with the attack held, stopped) as a digest '
      + 'of every object\'s world matrix and every moving point of cloth to the last bit, and his animate timed '
      + 'each frame: a change made to cost less poses him exactly as before when an A/B\'s digests agree',
    options: {
      canary: { kind: 'switch', help: 'plant a fault the measure must catch: a number moved by its last bit' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  coat: {
    help: 'the hero\'s skirts (the ranger\'s coat, the mage\'s robe, the warrior\'s mail) and hood (the mage\'s) as he '
      + 'stands at idle in his head item and body armour, frame '
      + 'by frame: every point of the cloth in its own space, and each jerk (its move a frame changing by over 1 cm)',
    options: {
      seconds: { kind: 'number', usage: 's', help: 'how long he stands (5 by default)' },
      frames: { kind: 'switch', help: 'list the frames a point jerked, with where on the cloth' },
      rates: { kind: 'list', usage: 'a,b', help: 'the frame rates he stands at, once each (60,144 by default)' },
      canary: { kind: 'switch', help: 'plant a fault the measure must catch: a point kicked out for a frame' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  touch: {
    help: 'the touch controls\' move stick pushed by a finger, sent as a touch screen\'s: slid out to its edge and '
      + 'far past it, half the window across, and what each push gave (the stick\'s push, the knob, the hero\'s '
      + 'speed); a push further out may never give less',
    options: {
      canary: {
        kind: 'switch',
        help: 'plant a fault the measure must catch: the furthest push\'s finger slid back near the middle',
      },
      ...COMMON_OPTIONS,
    },
  },
  trail: {
    help: 'the trail a swung weapon leaves, as the player sees it: each strike cast in each view, every frame from '
      + 'the press until the weapons are still drawn with the trail and without, and the pixels it lit told apart; '
      + 'pixels outside where the weapons swept over the last 0.15 s (each weapon placed from its grip to its far '
      + 'end by its own meshes, in the hero\'s frame, as the camera drawing his arms sees it), a blow in the frame '
      + 'with no trail, its newest end off the blade and a trail while the weapons are still are problems; the frame '
      + 'each strike lit most pictured: tools/lab/out/trail (--class warrior)',
    options: {
      strikes: {
        kind: 'list',
        usage: 'skill[@style],...',
        help: 'the strikes: a skill by its key, its behaviour or its name, and the way the weapons are held for it '
          + `(${WEAPON_STYLES.join(', ')}; as the boot rolled them when not given); the warrior's every strike, and `
          + 'Rending Cleave with each way, by default',
      },
      biome: { kind: 'choice', choices: ['crypt', 'forest'], usage: 'crypt|forest', help: 'the biome (crypt)' },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      pictures: { kind: 'switch', help: 'picture each strike\'s frame its trail lit most (=false: the numbers alone)' },
      frames: {
        kind: 'switch',
        help: 'list every frame: the weapons\' speed, the trail\'s pixels and those outside, its newest column against '
          + 'the weapon and its pixels against the blade',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch, in the first strike: the trail lasting a second, never lit, and '
          + 'through the eyes drawn by the world\'s camera instead of the arms\' own',
      },
      wear: SETUP_OPTIONS.wear,
      tune: SETUP_OPTIONS.tune,
      ...COMMON_OPTIONS,
    },
  },
  tap: {
    help: 'every skill of the hero\'s class aimed by holding, its touch button pressed by a finger, the other thumb '
      + 'on the move stick: tapped standing, at once and walking (a movement skill goes the way he moves, any other '
      + 'at the nearest foe), and dragged while the stick moves (its own preview follows the drag, and it is cast '
      + 'where the preview showed) (--class mage, ranger)',
    options: {
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: a movement skill tapped with the stick let go and the hero turned '
          + 'to the foe, another tapped with its foe carried off, each drag\'s last preview read a frame early, its '
          + 'cast held against the stop before\'s, the plain aim ring shown beside a preview',
      },
      ...COMMON_OPTIONS,
    },
  },
  practice: {
    help: 'each skill on a key with a cooldown cast, then cast again as soon as the hero is free, in the lobby as it '
      + 'shows, in practice (stowed, as Space and a phone\'s Practice stow it), shown again after it, with every '
      + 'panel folded (a screen that shows them side by side) and in runs started from the lobby and begun in '
      + 'practice (a co-op guest\'s, as its host starts): where the lobby shows, a cast not made again at once, and '
      + 'elsewhere one made again within its cooldown, a key showing no countdown and a cast spending no energy, '
      + 'are problems',
    options: {
      canary: {
        kind: 'switch',
        help: 'the run begun in practice played again with the lobby\'s free casting planted, which must be caught',
      },
      ...COMMON_OPTIONS,
    },
  },
  spawns: {
    help: 'waves set off one after another in each biome (boss waves, the 5th to the 20th), a seed each, the hero at '
      + 'the arena\'s middle: the gate every foe came in by and the spot it rose on against the props and the edge, '
      + 'how many gates each group came by and its packs, the waves leaving a gate idle, when the boss came against '
      + 'the first group reaching the hero, and from each gate the first boss\'s walk to him; then waves 1, 5 and 10 '
      + 'at the game\'s own pace, each foe taken out as it reaches him; a number of gates no group came by, a wave '
      + 'leaving a gate idle, a gate no boss came by, a foe risen in a prop, a boss early or late and one that never '
      + 'reached the hero are problems',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      waves: {
        kind: 'number',
        usage: 'n',
        help: 'the waves in each biome (32 by default; the bosses\' gates are judged over 24 at least)',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the measures must catch, in the first biome: every foe read again moved onto one gate, '
          + 'the first half into a prop, and one more wave\'s boss frozen where it rose',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  music: {
    help: 'each biome\'s music played through as the player hears it: its lobby, a run\'s countdown, the first '
      + 'wave\'s fight and its win, the next wave, the tab hidden and shown again mid-fight, and the bank back to the '
      + 'lobby, every frame judged by what the game sends to WebAudio and what each track\'s output carries: a track '
      + 'rising where another is wanted, a level cut rather than faded, a fresh track not from its top, a track back '
      + 'elsewhere than where it was left (the lobby\'s between waves, the battle\'s from wave to wave), a loop off '
      + 'its track\'s, a battle track not decoded '
      + 'within the countdown, a silent track kept decoded and one unheard where it\'s wanted (or heard where it '
      + 'isn\'t) are problems',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'forest,crypt',
        help: 'the biomes, in turn: crypt, forest',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the judge must catch, in a round played again: the biome\'s battle track played as '
          + 'another\'s, the lobby\'s fade in cut to a twentieth of a second, every fresh track started 5 s in, '
          + 'every track coming back started from its top',
      },
      ...COMMON_OPTIONS,
    },
  },
  probe: {
    help: 'a probe module of your own: its default export takes the lab and the options (tools/lab/README.md)',
    argument: 'module',
    open: true,
    options: {
      setup: { kind: 'switch', help: 'set the run up first (=false: the probe sets up itself)' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  pwa: {
    help: 'a deploy as a returning player meets it, the offline worker and all: another commit\'s production build '
      + 'served as Pages serves the game and loaded in a fresh browser until its worker has the page and its fonts, '
      + 'then this tree\'s served in its place and the page reloaded under the old worker, under the new one and '
      + 'offline; every load must show the game\'s fonts, and every one after the swap this tree\'s build (runs in '
      + 'this process, not the server)',
    options: {
      from: {
        kind: 'ref',
        usage: '[=ref]',
        help: 'the commit deployed before (origin/main by default)',
      },
      canary: {
        kind: 'switch',
        help: 'a stale page served on the first reload after the swap, the font stylesheet\'s address broken after '
          + 'it: both must be found',
      },
    },
  },
  check: {
    help: 'the checks of a change to how the heroes move, every hero\'s, side by side in sessions of their own: the '
      + 'gait (its steps listed, no films), the stops, the ranges and the run\'s form for each hero, the ranger\'s '
      + 'feet and carry, the warrior\'s basic attack through the eyes with each weapon each way he holds it (a row '
      + 'with the canaries, a short and a long pause) and his other skills with each weapon that takes them, and '
      + 'each of his skills cast through the eyes for its light and flashes, on each way\'s first weapon, every '
      + 'swing of each weapon stepped between its keys, and the foes his charge sweeps up; each report in '
      + 'tools/lab/out/check/<command>-<hero>.txt (runs in this process, not the server)',
    options: {
      classes: { kind: 'list', usage: 'a,b', help: 'the heroes (warrior, mage, ranger by default)' },
      commands: {
        kind: 'list',
        usage: 'a,b',
        choices: ['gait', 'stops', 'range', 'form', 'feet', 'carry', 'eyes', 'cast', 'swing', 'rush', 'hits', 'log'],
        help: 'the commands (gait, stops, range, form, feet, carry, eyes, cast, swing, rush, hits, log by default)',
      },
      jobs: { kind: 'number', usage: 'n', help: 'how many sessions side by side (a core in three, at most 8)' },
      starts: {
        kind: 'number',
        usage: 'n',
        help: 'how many moments each gait scenario starts from, its counts added up (5 by default, at most 8)',
      },
      reuse: {
        kind: 'switch',
        help: 'each session\'s page kept for its next job of the same side and hero (=false: a page booted for each '
          + 'job, to show the reports come out the same)',
      },
      only: {
        kind: 'text',
        usage: 'text',
        help: 'only the jobs whose name has this in it, or any of these (eyes-warrior-dual: the eyes\' jobs with '
          + 'two weapons; hits,gait-warrior-run)',
      },
      plan: {
        kind: 'switch',
        help: 'run nothing: the order the sessions would take the jobs in and when each would be done, by what each '
          + 'took last time (tools/lab/out/check/durations.json)',
      },
      like: {
        kind: 'text',
        usage: 'dir',
        help: 'every report compared line by line with the one of its name in dir (a copy of an earlier check\'s '
          + 'tools/lab/out/check), how each run went aside: fails on any that differs',
      },
      ab: COMMON_OPTIONS.ab,
      fresh: COMMON_OPTIONS.fresh,
    },
  },
  live: {
    help: 'a page of the game kept between steps, each on the state the last one left (needs npm run lab:serve): '
      + 'start (--class, the set-up), picture (--views, --look, --on, --over, --crop), inspect [name] (--depth), eval '
      + '<expression>, frames <count>, log, stop; its pictures in tools/lab/out/live (tools/lab/COMMANDS.md)',
    argument: 'step',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        help: 'picture: the views (through the eyes eyes, else third by default; screen: the page with its UI)',
      },
      look: LOOK_OPTION,
      focus: { kind: 'text', usage: 'joint', help: 'picture: close-ups framed on a joint (head, handL...)' },
      distance: {
        kind: 'number',
        usage: 'm',
        help: 'picture: a close-up\'s distance from what it\'s framed on (1.7 from a joint, 4.3 from the body)',
      },
      over: {
        kind: 'text',
        usage: 'picture',
        help: 'picture: a reference (PNG, JPEG or WebP, a path) laid over each picture, stretched to it',
      },
      strength: { kind: 'number', usage: 'share', help: 'picture: how strongly --over is laid (0.5 by default)' },
      on: {
        kind: 'list',
        usage: 'x,y,z',
        help: 'picture: close-ups framed on this place in the world (m) instead of the hero: a prop, from --views',
      },
      crop: {
        kind: 'list',
        usage: 'l,t,r,b',
        help: 'picture: the part of each picture kept, its edges as shares of it (0.5,0,1,0.6)',
      },
      canary: {
        kind: 'switch',
        help: 'picture: the hero hidden and pictured in the parts look too, where no part of him may be found',
      },
      depth: { kind: 'number', usage: 'n', default: '1', help: 'inspect: the levels under it listed (1)' },
      class: COMMON_OPTIONS.class,
      screen: {
        ...COMMON_OPTIONS.screen,
        help: 'start: the page put on a screen of this size (css px) and pixel ratio once it has booted (a phone\'s: '
          + '832x384@3.75)',
      },
      ...SETUP_OPTIONS,
    },
  },
  eval: {
    help: 'an expression evaluated in the page, with `lab` in scope: npm run lab -- eval "lab.player.nocked"',
    argument: 'expression',
    options: { ...COMMON_OPTIONS },
  },
  serve: { help: 'keep a session up, booting each command\'s page ahead (npm run lab:serve)', options: {} },
  status: { help: 'what the server serves and has booted', options: {} },
  stop: { help: 'stop the server', options: {} },
  help: { help: 'this', options: {} },
};

/** The distance between two words in single-letter edits (Levenshtein's). */
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const replaced = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min(previous[j] + 1, row[j - 1] + 1, replaced));
    }
    previous = row;
  }
  return previous[b.length];
}

/** ` (did you mean x?)` when one of `names` is a slip of `word` away, else nothing. */
function suggestion(word, names) {
  const ranked = names
    .map((name) => ({ name, distance: editDistance(word, name) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best || best.distance > Math.max(1, Math.floor(word.length / 3))) return '';
  return ` (did you mean ${best.name}?)`;
}

/** A screen written as `WxH@ratio` (the ratio may be left out: 1), or null when it isn't one. */
function screenFrom(text) {
  const match = /^(\d+)x(\d+)(?:@(\d+\.?\d*|\.\d+))?$/.exec(text ?? '');
  if (!match) return null;
  const screen = { width: Number(match[1]), height: Number(match[2]), ratio: match[3] ? Number(match[3]) : 1 };
  return screen.width > 0 && screen.height > 0 && screen.ratio > 0 ? screen : null;
}

/** A number written in full (`12`, `-0.5`), or NaN: Number() also takes '', ' ' and '0x10'. */
function numberFrom(text) {
  return /^\s*-?(\d+\.?\d*|\.\d+)(e-?\d+)?\s*$/i.test(text) ? Number(text) : NaN;
}

/** An option's value as its kind reads it; throws saying what was wrong. */
function readValue(name, spec, text) {
  const wrong = (expected) => labError(`--${name}: ${expected}, not ${JSON.stringify(text)}`);
  switch (spec.kind) {
    case 'switch':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      throw wrong('true or false');
    case 'ref':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      if (text === '') throw wrong('a commit');
      return text;
    case 'text':
      if (!text) throw wrong('a value');
      return text;
    case 'switchOrText':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      if (!text) throw wrong('true, false or a value');
      return text;
    case 'list': {
      const items = text.split(',').map((item) => item.trim()).filter(Boolean);
      if (items.length === 0) throw wrong('a comma-separated list');
      const unknown = items.find((item) => spec.choices && !spec.choices.includes(item));
      if (unknown !== undefined) throw wrong(`some of ${spec.choices.join(', ')}${suggestion(unknown, spec.choices)}`);
      return items;
    }
    case 'number': {
      const value = numberFrom(text);
      if (!Number.isFinite(value)) throw wrong('a number');
      return value;
    }
    case 'pair': {
      const values = text.split(',').map(numberFrom);
      if (values.length !== 2 || !values.every(Number.isFinite)) throw wrong('two numbers, x,z');
      return values;
    }
    case 'numbers': {
      const values = text.split(',').map(numberFrom);
      if (!values.every(Number.isFinite)) throw wrong('comma-separated numbers');
      if (spec.count !== undefined && values.length !== spec.count) throw wrong(`${spec.count} numbers, ${spec.usage}`);
      if (spec.each !== undefined && values.length % spec.each !== 0) {
        throw wrong(`numbers in ${spec.each}s, ${spec.usage}`);
      }
      return values;
    }
    case 'choice':
      if (!spec.choices.includes(text)) throw wrong(spec.choices.join(', '));
      return text;
    case 'screen': {
      const screen = screenFrom(text);
      if (!screen) throw wrong('a size and pixel ratio, 1280x720@3');
      return screen;
    }
    case 'screens': {
      const screens = text.split(',').map(screenFrom);
      if (screens.length !== 2 || screens.includes(null)) {
        throw wrong('two sizes and pixel ratios, 3840x2160@1,1280x720@3');
      }
      return screens;
    }
    case 'screenList': {
      const screens = (text ?? '').split(',').map(screenFrom);
      if (screens.includes(null)) throw wrong('sizes and pixel ratios, 1920x1080@1.25,1536x864@1.25');
      return screens;
    }
    default:
      throw new Error(`option --${name} has an unknown kind ${spec.kind} (one of ${KINDS.join(', ')})`);
  }
}

/** An option an open command doesn't know, passed on: `--name` true, `--name=false` false, else its text. */
function passedOn(text) {
  if (text === undefined || text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

/** Throws at options that can't go together: `--screens` names both sides' screens, and runs this tree alone. */
function checkTogether(options) {
  if (options.insets && !options.screen && !options.screens) {
    throw labError('--insets are a screen\'s: give its --screen (or --screens)');
  }
  if (!options.screens) return;
  if (options.ab) throw labError('--screens compares this tree on two screens: it takes no --ab');
  if (options.screen) throw labError('--screens names both screens: it takes no --screen');
}

/** whether an option's kind takes the argument after it as its value (`--count 3`; `--ab` and `--profile` don't) */
const takesNext = (spec) => !['switch', 'ref', 'switchOrText'].includes(spec.kind);

/** An option's value as it's given again: joined to the first by its separator (`joins`: `--tune a --tune b` reads
 *  as `a;b`), else refused. (A second `--tune` once replaced the first unsaid, and five runs measured a tuning that
 *  wasn't asked for.) */
function givenAgain(name, spec, first, value) {
  if (first === undefined) return value;
  if (spec.joins) return `${first}${spec.joins}${value}`;
  throw labError(`--${name} given twice (${JSON.stringify(first)}, then ${JSON.stringify(value)})`);
}

/**
 * Reads a command line (the arguments after `lab`): the command, its options by name (each read as its kind says,
 * defaults filled in) and the words after the command, under `_`. Throws, saying what was wrong, at an unknown
 * command, an option the command doesn't take, or a bad value.
 */
export function parseCommandLine(argv) {
  const [command = 'help', ...rest] = argv;
  const name = command === '--help' || command === '-h' ? 'help' : command;
  const definition = COMMANDS[name];
  if (!definition) {
    const known = Object.keys(COMMANDS);
    throw labError(`no command ${name}${suggestion(name, known)}; the commands: ${known.join(', ')}`);
  }
  const specs = definition.options;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (!argument.startsWith('--')) {
      options._.push(argument);
      continue;
    }
    const [optionName, text] = argument.slice(2).split(/=(.*)/s);
    const spec = specs[optionName];
    if (!spec) {
      if (definition.open) {
        options[optionName] = passedOn(text);
        continue;
      }
      const known = Object.keys(specs);
      const guess = suggestion(optionName, known);
      const takes = guess || !known.length ? '' : `; it takes ${known.map((option) => `--${option}`).join(', ')}`;
      throw labError(`${name} takes no --${optionName}${guess}${takes}`);
    }
    if (text === undefined && takesNext(spec)) {
      if (i + 1 >= rest.length) throw labError(`--${optionName} needs a value (${spec.usage ?? spec.kind})`);
      options[optionName] = givenAgain(optionName, spec, options[optionName], readValue(optionName, spec, rest[++i]));
    } else {
      options[optionName] = givenAgain(optionName, spec, options[optionName], readValue(optionName, spec, text));
    }
  }
  for (const [optionName, spec] of Object.entries(specs)) {
    if (options[optionName] === undefined && spec.default !== undefined) {
      options[optionName] = readValue(optionName, spec, spec.default);
    }
  }
  checkTogether(options);
  if (definition.argument && options._.length === 0) throw labError(`${name} needs its ${definition.argument}`);
  if (!definition.argument && options._.length > 0) {
    throw labError(`${name} takes no ${JSON.stringify(options._[0])} (options start with --)`);
  }
  return { command: name, options };
}

/** the help's width, and the column its descriptions start at */
const HELP_WIDTH = 116;
const HELP_COLUMN = 28;

/** `head`, then `text` from the help's column, wrapped to its width under that column. */
function helpEntry(head, text) {
  const lines = [];
  let line = `${head.padEnd(HELP_COLUMN - 1)} `;
  let empty = true;
  for (const word of text.split(' ')) {
    if (!empty && line.length + 1 + word.length > HELP_WIDTH) {
      lines.push(line);
      line = ' '.repeat(HELP_COLUMN);
      empty = true;
    }
    line += empty ? word : ` ${word}`;
    empty = false;
  }
  lines.push(line);
  return lines.join('\n');
}

/** An option's entry in the help: `--name usage`, then what it does, and its default. */
function optionEntry(name, spec) {
  const value = !takesNext(spec) && spec.usage ? spec.usage : spec.usage ? ` ${spec.usage}` : '';
  const fallback = spec.default ? ` (${spec.default})` : '';
  return helpEntry(`      --${name}${value}`, `${spec.help}${fallback}`);
}

/** The help, made from `COMMANDS`: each command with its own options, then the ones the commands share. */
export function usage() {
  const shared = new Set([...Object.keys(SETUP_OPTIONS), ...Object.keys(COMMON_OPTIONS)]);
  const lines = ['npm run lab -- <command> [options]', ''];
  for (const [name, definition] of Object.entries(COMMANDS)) {
    if (name === 'help') continue;
    const head = definition.argument ? `${name} <${definition.argument}>` : name;
    lines.push(helpEntry(`  ${head}`, definition.help));
    for (const [optionName, spec] of Object.entries(definition.options)) {
      if (!shared.has(optionName)) lines.push(optionEntry(optionName, spec));
    }
    if (definition.open) lines.push(helpEntry('      --name[=value]', 'any other option is passed to the probe'));
  }
  lines.push('', '  the set-up (sheet, carry, probe):');
  for (const [name, spec] of Object.entries(SETUP_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push('  every command run on a page (sheet, carry, probe, eval):');
  for (const [name, spec] of Object.entries(COMMON_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push(
    '',
    'With npm run lab:serve up, each command\'s page is booted ahead of it. Every command runs on a page booted for',
    'it, so it gives the same result every time. The exit status is 1 when it failed or found a problem (an error',
    'in the page, a canary the measure missed).',
  );
  return lines.join('\n');
}
