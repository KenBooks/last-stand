// The options the lab's commands share (tools/lab): the run's set-up, the options every command on a page takes,
// how a picture is drawn, and the lists their choices come from. Each command's own are in node/commands/.

/** the ways a hero may hold his weapons (src/loot/loadout.ts `WeaponStyle`) */
export const WEAPON_STYLES = ['oneHanded', 'shield', 'twoHanded', 'dual'];

/** the schools a weapon may be attuned to, and none held (src/types.ts `School`, `HeldStyle`'s `bare`): the mage's */
export const SCHOOL_STYLES = ['arcane', 'fire', 'lightning', 'healing', 'bare'];

/** the ways a picture can be drawn (page/looks.ts `LOOKS`) */
const LOOKS = ['lit', 'wire', 'faces', 'parts', 'bones'];

/** how a command's pictures are drawn */
export const LOOK_OPTION = {
  kind: 'choice',
  choices: LOOKS,
  usage: LOOKS.join('|'),
  help: 'as the player sees it (lit, the default), the hero\'s wireframe, his faces\' orientation (front blue, '
    + 'back red), each of his parts a colour of its own (and where each is in the picture), his skeleton over it',
};

/** the options that set up the run before a command (page/lab.ts `Fixture`) */
export const SETUP_OPTIONS = {
  view: { kind: 'choice', choices: ['top', 'third', 'first'], usage: 'top|third|first', help: 'the game\'s view' },
  at: { kind: 'pair', usage: 'x,z', help: 'where the hero stands (12,22: off the dais, clear of props)' },
  facing: { kind: 'number', usage: 'rad', help: 'the way he faces (0 is +z)' },
  nocked: { kind: 'switch', help: 'a bow\'s hero with an arrow on the string (=false: none)' },
  gear: {
    kind: 'choice',
    choices: [...WEAPON_STYLES, ...SCHOOL_STYLES],
    usage: [...WEAPON_STYLES, ...SCHOOL_STYLES].join('|'),
    help: 'the hero holding his weapons this way (a class with more than one; as rolled by default), or a staff of '
      + 'this school, or none (bare), for a class whose weapons have schools',
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
  rarity: {
    kind: 'choice',
    choices: ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant'],
    usage: 'common|magic|rare|epic|legendary|ascendant',
    help: 'every item he wears of this rarity, as its look shows it (Rare and up glow in its colour; as rolled by '
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
export const COMMON_OPTIONS = {
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
    help: 'the page booted as a device that settled on this quality (low@518400: a phone\'s), set as the player\'s '
      + 'setting: the boot\'s '
      + 'warm-ups run at it, and the hero is built at its detail (High, the lab\'s own, by default)',
  },
  cold: {
    kind: 'switch',
    help: 'the page booted as a player\'s first visit leaves it: nothing the game warms after the lobby shows asked '
      + 'for, the fight\'s and the other heroes\' programs cold until something needs them (the lab\'s own boot asks '
      + 'for them at once and waits)',
  },
  first: {
    kind: 'switch',
    help: 'the page booted as a player\'s first visit: no saved hero, so the game boots its default one (--class '
      + 'it) and opens on the hero selection screen, cold as --cold leaves it (programs --first: what its first '
      + 'frames compile at a draw)',
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
