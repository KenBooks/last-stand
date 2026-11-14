"""The skill icons (`src/ui/skillArt/<impl>.webp`): each class's side by side at a slot's size, how each fits the
round touch buttons, and a painted original made into one. Run through `npm run icons -- <command>`
(tools/icons/README.md)."""
import argparse
import sys
from pathlib import Path

from PIL import Image

from export import export
from fit import measure
from keys import write_diagrams
from sheet import sheet
from skills import ROOT, class_skills

# where the sheet goes unless told otherwise
SHEET = ROOT / 'tools' / 'icons' / 'out' / 'sheet.png'
# where the classes' key diagrams go: the README's pictures
KEYS = ROOT / 'docs' / 'screenshots'


def parse_tries(tries: list[str]) -> dict[str, Path]:
    """`impl=picture` pairs as a map, each picture checked to exist."""
    pictures = {}
    for pair in tries:
        impl, _, picture = pair.partition('=')
        path = Path(picture)
        if not impl or not path.exists():
            sys.exit(f'--try wants impl=picture, with a picture that exists: {pair}')
        pictures[impl] = path
    return pictures


def chosen_classes(names: str | None) -> dict:
    """The classes named (comma separated), or every class."""
    classes = class_skills()
    if not names:
        return classes
    wanted = names.split(',')
    unknown = [name for name in wanted if name not in classes]
    if unknown:
        sys.exit(f'no such class: {", ".join(unknown)} (there are {", ".join(classes)})')
    return {name: classes[name] for name in wanted}


def run_sheet(args: argparse.Namespace) -> int:
    """Writes the sheet of the classes' icons."""
    out = Path(args.out) if args.out else SHEET
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet(chosen_classes(args.classes), parse_tries(args.tries)).save(out)
    print(f'sheet: {out}')
    return 0


def run_check(args: argparse.Namespace) -> int:
    """Says how each class's icons fit the round buttons; 1 when one doesn't fit or a skill has none."""
    failed = False
    for name, skills in chosen_classes(args.classes).items():
        print(name)
        for skill in skills:
            if not skill.art.exists():
                print(f'  {skill.name:18s} no painted icon: shows its glyph')
                failed = True
                continue
            with Image.open(skill.art) as image:
                fit = measure(image.convert('RGB'))
            problems = fit.problems()
            failed = failed or bool(problems)
            print(f'  {skill.name:18s} {fit.line()}' + ''.join(f'\n    {problem}' for problem in problems))
    return 1 if failed else 0


def run_add(args: argparse.Namespace) -> int:
    """Makes a painted original into a skill's icon, padded to fit the round buttons."""
    skills = [skill for listed in class_skills().values() for skill in listed if skill.impl == args.impl]
    if not skills:
        sys.exit(f'no skill has the impl {args.impl}')
    with Image.open(args.picture) as original:
        before = measure(original.convert('RGB'))
    icon = export(Path(args.picture), skills[0].art)
    after = measure(icon)
    size = skills[0].art.stat().st_size
    print(f'{skills[0].name}: {skills[0].art.relative_to(ROOT)} ({size / 1024:.0f} KB)')
    print(f'  original  {before.line()}')
    print(f'  icon      {after.line()}')
    return 0


def run_keys(arguments: argparse.Namespace) -> int:
    """`keys`: each class's default keys drawn as a diagram for the README."""
    folder = Path(arguments.out) if arguments.out else KEYS
    for path in write_diagrams(folder, list(chosen_classes(arguments.classes))):
        with Image.open(path) as image:
            size = f'{image.width}x{image.height}'
        print(f'{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}: {size}, '
              f'{path.stat().st_size / 1024:.0f} KB')
    return 0


def parser() -> argparse.ArgumentParser:
    """The command line."""
    top = argparse.ArgumentParser(prog='npm run icons --', description=__doc__)
    commands = top.add_subparsers(dest='command', required=True)
    sheet_command = commands.add_parser('sheet', help="each class's icons side by side, at a slot's size too")
    sheet_command.add_argument('--try', dest='tries', action='append', default=[], metavar='IMPL=PICTURE',
                               help="a picture to show in a skill's place, as `add` would make it (repeatable)")
    sheet_command.add_argument('--classes', help='the classes to show, comma separated (default: every class)')
    sheet_command.add_argument('--out', help=f'where to write it (default: {SHEET.relative_to(ROOT)})')
    sheet_command.set_defaults(run=run_sheet)
    check_command = commands.add_parser('check', help='how each icon fits the round touch buttons')
    check_command.add_argument('--classes', help='the classes to check, comma separated (default: every class)')
    check_command.set_defaults(run=run_check)
    add_command = commands.add_parser('add', help="a painted original made into a skill's icon")
    add_command.add_argument('impl', help="the skill's impl name (its icon's file name)")
    add_command.add_argument('picture', help='the painted original, on black')
    add_command.set_defaults(run=run_add)
    keys_command = commands.add_parser('keys', help="each class's default keys as a diagram for the README")
    keys_command.add_argument('--classes', help='the classes to draw, comma separated (default: every class)')
    keys_command.add_argument('--out', help=f'the folder to write them in (default: {KEYS.relative_to(ROOT)})')
    keys_command.set_defaults(run=run_keys)
    return top


if __name__ == '__main__':
    arguments = parser().parse_args()
    sys.exit(arguments.run(arguments))
