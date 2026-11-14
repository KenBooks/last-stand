"""A class's default keys as a diagram for the README (`docs/screenshots/keys-<class>.png`): the mouse with what each
button casts beside it, and the keys 1 to 4 and Q in a row, each skill by its painted icon, its name and a few words.
The bindings are read from the class's data as the game reads them (`src/loot/loadout.ts` `defaultLoadout`: a key
gets the last skill listing it), with what the same key casts with other gear beside it: a staff's school, a
shield, a two-handed weapon, a weapon in each hand. The few words are this file's own (`NOTES`)."""
import re
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from skills import ART, CLASSES

# the page: its width, its margin, the HUD's dark and its text
WIDTH = 1600
MARGIN = 36
BACKGROUND = (17, 16, 22)
PANEL = (30, 28, 38)
EDGE = (78, 70, 58)
TEXT = (232, 226, 212)
DIM = (160, 152, 138)
GOLD = (226, 184, 104)
# the heading's height, and the gap under it
HEADING = 64
# a mouse button's entries: an icon with its name and words beside it, one under another
ENTRY_ICON = 68
ENTRY_GAP = 12
ENTRY_WIDTH = 304
# the mouse drawn between its buttons' entries
MOUSE_WIDTH = 104
MOUSE_HEIGHT = 168
MOUSE_GAP = 22
# the keys' row: each key's icon, its cap under it and its column's width
KEY_ICON = 112
KEY_CAP = 46
KEY_COLUMN = 156
# the keys, in the order they're drawn, and what a cap says
MOUSE_KEYS = ['mouse0', 'mouse2']
ROW_KEYS = ['1', '2', '3', '4', 'q']
BUTTON_NAMES = {'mouse0': 'Left click', 'mouse2': 'Right click'}

# a skill as the data lists it: its key, impl and name on its first line
KEYED = re.compile(r"key: '(\w+)', impl: '(\w+)', name: '([^']+)'")
SCHOOL = re.compile(r"school: '(\w+)'")
NEEDS = re.compile(r"needs: '(\w+)'")
FALLBACK = re.compile(r"fallback: \{([^}]*)\}")
PAIR = re.compile(r"(\w+): '(\w+)'")
HELD = re.compile(r"channel: true|draw: ")
ACCENT = re.compile(r"accent: '(#[0-9a-fA-F]{6})'")
# (the class's own name comes before its skills')
CLASS_NAME = re.compile(r"(?<!_)name: '([^']+)'")

# the gear a skill is cast with, as the diagram says it
WITH = {
    'arcane': 'Arcane staff', 'fire': 'Fire staff', 'lightning': 'Lightning staff', 'healing': 'Healing staff',
    'shield': 'With a shield', 'twoHanded': 'Two-handed weapon', 'dual': 'A weapon in each hand',
}

# a few words on each skill, by impl
NOTES = {
    'splinterBolt': 'Seeking bolts that split on impact',
    'cinderburst': 'A bursting orb that sets foes alight',
    'stormcall': 'Charged lightning that dazes',
    'lifethread': 'A beam that heals an ally, or you',
    'voidLance': 'A piercing beam of raw arcana',
    'starfall': 'Crystals crash onto an area',
    'glacialNova': 'Freeze every foe around you',
    'maelstrom': 'A vortex that drags foes in',
    'blink': 'Aim, let go: cross there unharmed',
    'potion': 'Restore Health',
    'cleave': 'A wide sweep that restores Energy',
    'raiseShield': 'Block every blow from the front',
    'crescent': 'Lightning torn along the ground',
    'twinFangs': 'Lunge and strike with both blades',
    'tempest': 'Spin, shredding all around you',
    'bullRush': 'Charge, sweeping foes along',
    'powerStrike': 'Wind up a crushing overhead blow',
    'ironBellow': 'Hurl foes back and gain a ward',
    'nockShot': 'Draw further for a harder shot',
    'fanShot': 'Five arrows loosed in a fan',
    'piercingShot': 'An arrow through every foe in line',
    'arrowRain': 'Showers of arrows over an area',
    'quarryMark': 'Marked foe takes 25% more damage',
    'strawman': 'A decoy that draws foes off you',
}


@dataclass
class Bound:
    """A skill a key casts: its impl, its name, whether its key is held, and the gear it's cast with (if it
    matters)."""
    impl: str
    name: str
    held: bool
    gear: str = ''


@dataclass
class ClassKeys:
    """A class's name, accent and what each key casts (more than one where the gear held decides)."""
    name: str
    accent: str
    keys: dict[str, list[Bound]] = field(default_factory=dict)


def font(size: int) -> ImageFont.ImageFont:
    """The default font at `size` px."""
    return ImageFont.load_default(size=size)


def blocks_of(source: str) -> list[tuple[str, str, str, str]]:
    """Each skill's key, impl, name and the text of its entry in the data, in the data's order."""
    found = list(KEYED.finditer(source))
    blocks = []
    for index, match in enumerate(found):
        end = found[index + 1].start() if index + 1 < len(found) else len(source)
        blocks.append((match.group(1), match.group(2), match.group(3), source[match.start():end]))
    return blocks


def bound_for(key: str, blocks: list[tuple[str, str, str, str]]) -> list[Bound]:
    """What `key` casts by default: the last skill listing it, and with it what the same key casts with other gear
    (every school's spell of that key; the skill's fallbacks)."""
    by_impl = {impl: (name, text) for _, impl, name, text in blocks}
    listed = [block for block in blocks if block[0] == key]
    if not listed:
        return []
    schooled = [block for block in listed if SCHOOL.search(block[3])]
    if schooled:
        return [Bound(impl, name, bool(HELD.search(text)), WITH[SCHOOL.search(text).group(1)])
                for _, impl, name, text in reversed(schooled)]
    _, impl, name, text = listed[-1]
    needs = NEEDS.search(text)
    bound = [Bound(impl, name, bool(HELD.search(text)), WITH[needs.group(1)] if needs else '')]
    fallback = FALLBACK.search(text)
    for gear, other in PAIR.findall(fallback.group(1)) if fallback else []:
        other_name, other_text = by_impl[other]
        bound.append(Bound(other, other_name, bool(HELD.search(other_text)), WITH[gear]))
    return bound


def class_keys(class_id: str) -> ClassKeys:
    """`class_id`'s keys, from its data file."""
    source = (CLASSES / f'{class_id}.ts').read_text(encoding='utf-8')
    blocks = blocks_of(source)
    keys = {key: bound_for(key, blocks) for key in MOUSE_KEYS + ROW_KEYS}
    return ClassKeys(CLASS_NAME.search(source).group(1), ACCENT.search(source).group(1), keys)


def icon_of(impl: str, side: int) -> Image.Image:
    """A skill's painted icon at `side` px."""
    with Image.open(ART / f'{impl}.webp') as image:
        return image.convert('RGB').resize((side, side), Image.LANCZOS)


def wrapped(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.ImageFont, width: int) -> list[str]:
    """`text` broken into lines no wider than `width`."""
    lines = ['']
    for word in text.split():
        tried = f'{lines[-1]} {word}'.strip()
        if draw.textlength(tried, font=face) <= width or not lines[-1]:
            lines[-1] = tried
        else:
            lines.append(word)
    return lines


def held_tag(draw: ImageDraw.ImageDraw, right: int, top: int) -> None:
    """A small "hold" tag, its right edge at `right`."""
    face = font(13)
    width = int(draw.textlength('HOLD', font=face)) + 14
    draw.rounded_rectangle((right - width, top, right, top + 20), radius=6, outline=GOLD)
    draw.text((right - width / 2, top + 10), 'HOLD', fill=GOLD, font=face, anchor='mm')


def stack_height(count: int) -> int:
    """How tall `count` entries are, one under another."""
    return count * ENTRY_ICON + (count - 1) * ENTRY_GAP


def draw_entry(page: Image.Image, at: tuple[int, int], bound: Bound) -> None:
    """One of a mouse button's entries at `at`: its icon, and beside it the gear it's cast with, its name and words."""
    left, top = at
    draw = ImageDraw.Draw(page)
    draw.rounded_rectangle((left, top, left + ENTRY_WIDTH, top + ENTRY_ICON), radius=8, fill=PANEL)
    page.paste(icon_of(bound.impl, ENTRY_ICON), (left, top))
    text_left = left + ENTRY_ICON + 12
    line = top + 6
    if bound.gear:
        draw.text((text_left, line), bound.gear.upper(), fill=GOLD, font=font(12))
        line += 16
    draw.text((text_left, line), bound.name, fill=TEXT, font=font(19))
    if bound.held:
        held_tag(draw, left + ENTRY_WIDTH - 8, top + 6)
    note_width = ENTRY_WIDTH - ENTRY_ICON - 20
    for row, words in enumerate(wrapped(draw, NOTES[bound.impl], font(13), note_width)[:2]):
        draw.text((text_left, line + 25 + row * 16), words, fill=DIM, font=font(13))


def draw_mouse(draw: ImageDraw.ImageDraw, at: tuple[int, int], accent: str) -> None:
    """The mouse at `at`, both its buttons in the class's accent."""
    left, top = at
    right, bottom = left + MOUSE_WIDTH, top + MOUSE_HEIGHT
    middle = left + MOUSE_WIDTH // 2
    split = top + MOUSE_HEIGHT * 0.42
    draw.rounded_rectangle((left, top, right, bottom), radius=MOUSE_WIDTH // 2, fill=PANEL, outline=EDGE, width=3)
    draw.pieslice((left, top, right, top + MOUSE_WIDTH), 180, 360, fill=accent, outline=EDGE, width=3)
    draw.rectangle((left + 2, top + MOUSE_WIDTH // 2, right - 2, split), fill=accent)
    draw.line((left, split, right, split), fill=EDGE, width=3)
    draw.line((middle, top, middle, split), fill=EDGE, width=3)
    draw.rounded_rectangle((middle - 7, top + 18, middle + 7, top + 48), radius=7, fill=PANEL, outline=EDGE, width=2)


def draw_mouse_side(page: Image.Image, keys: ClassKeys, top: int, height: int) -> int:
    """The mouse with its buttons' entries either side, in a block `height` tall from `top`; where it ends on the
    right."""
    draw = ImageDraw.Draw(page)
    mouse_left = MARGIN + ENTRY_WIDTH + MOUSE_GAP
    mouse_top = top + 26 + (height - 26 - MOUSE_HEIGHT) // 2
    draw_mouse(draw, (mouse_left, mouse_top), keys.accent)
    sides = [(MARGIN, 'mouse0'), (mouse_left + MOUSE_WIDTH + MOUSE_GAP, 'mouse2')]
    for left, key in sides:
        bound = keys.keys[key]
        entry_top = top + 26 + (height - 26 - stack_height(len(bound))) // 2
        draw.text((left, entry_top - 26), BUTTON_NAMES[key].upper(), fill=TEXT, font=font(16))
        for index, skill in enumerate(bound):
            draw_entry(page, (left, entry_top + index * (ENTRY_ICON + ENTRY_GAP)), skill)
    return mouse_left + MOUSE_WIDTH + MOUSE_GAP + ENTRY_WIDTH


def draw_key(page: Image.Image, at: tuple[int, int], key: str, bound: Bound) -> None:
    """One key of the row at `at` (its column's left and top): its icon, its cap, the skill's name and words."""
    left, top = at
    draw = ImageDraw.Draw(page)
    middle = left + KEY_COLUMN // 2
    page.paste(icon_of(bound.impl, KEY_ICON), (middle - KEY_ICON // 2, top))
    cap_top = top + KEY_ICON + 12
    cap = (middle - KEY_CAP // 2, cap_top, middle + KEY_CAP // 2, cap_top + KEY_CAP)
    draw.rounded_rectangle(cap, radius=9, fill=PANEL, outline=GOLD, width=2)
    draw.text((middle, cap_top + KEY_CAP / 2), key.upper(), fill=TEXT, font=font(24), anchor='mm')
    if bound.held:
        held_tag(draw, middle + KEY_CAP // 2 + 52, cap_top + 13)
    name_top = cap_top + KEY_CAP + 12
    draw.text((middle, name_top), bound.name, fill=TEXT, font=font(17), anchor='mt')
    for row, words in enumerate(wrapped(draw, NOTES[bound.impl], font(13), KEY_COLUMN - 14)[:3]):
        draw.text((middle, name_top + 26 + row * 16), words, fill=DIM, font=font(13), anchor='mt')


# how tall the keys' row is: icon, cap, name and three lines of words
ROW_HEIGHT = KEY_ICON + 12 + KEY_CAP + 12 + 26 + 3 * 16


def diagram(class_id: str) -> Image.Image:
    """`class_id`'s keys drawn."""
    keys = class_keys(class_id)
    most = max(len(keys.keys[key]) for key in MOUSE_KEYS)
    block = max(26 + stack_height(most), 26 + MOUSE_HEIGHT, ROW_HEIGHT)
    top = MARGIN + HEADING
    page = Image.new('RGB', (WIDTH, top + block + MARGIN), BACKGROUND)
    draw = ImageDraw.Draw(page)
    draw.text((MARGIN, MARGIN), keys.name.upper(), fill=keys.accent, font=font(34))
    title_end = MARGIN + draw.textlength(keys.name.upper(), font=font(34))
    draw.text((title_end + 16, MARGIN + 16), 'default keys, each can be rebound', fill=DIM, font=font(15))
    mouse_end = draw_mouse_side(page, keys, top, block)
    row_left = mouse_end + (WIDTH - MARGIN - mouse_end - len(ROW_KEYS) * KEY_COLUMN) // 2 + 8
    row_top = top + (block - ROW_HEIGHT) // 2
    for index, key in enumerate(ROW_KEYS):
        draw_key(page, (row_left + index * KEY_COLUMN, row_top), key, keys.keys[key][0])
    return page


def write_diagrams(folder: Path, class_ids: list[str]) -> list[Path]:
    """Each class's diagram written into `folder` as `keys-<class>.png`; the files written."""
    folder.mkdir(parents=True, exist_ok=True)
    written = []
    for class_id in class_ids:
        path = folder / f'keys-{class_id}.png'
        diagram(class_id).save(path, optimize=True)
        written.append(path)
    return written
