"""A real hand's fist as a 3D reference: MakeHuman's base mesh (CC0) closed by its own rig and weights.

The fist the game sculpts is judged against this one, from the same studio views, never shipped (`README.md`). The
joints' angles are a fist's as measured on people (FIST below), each turned about its bone's own plane of flexion
(MakeHuman's `rotation_plane`), the skin blended by dual quaternions as the game's hands are.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'

# A fist's joints in degrees of flexion, as a closed fist is measured on people (a tight fist's metacarpophalangeal
# joints near 90, the middle joints 100 to 110, the last 60 to 80; the ring's and little finger's metacarpals bent
# in a little at their base, cupping the palm). Thumb: its metacarpal across the palm, its two joints bent over the
# index and middle fingers' middle segments.
FIST = {
    'finger2-1.R': 88, 'finger2-2.R': 100, 'finger2-3.R': 65,
    'finger3-1.R': 90, 'finger3-2.R': 102, 'finger3-3.R': 65,
    'finger4-1.R': 92, 'finger4-2.R': 104, 'finger4-3.R': 65,
    'finger5-1.R': 94, 'finger5-2.R': 104, 'finger5-3.R': 65,
    'metacarpal3.R': 6, 'metacarpal4.R': 12,
    'finger1-1.R': 35, 'finger1-2.R': 45, 'finger1-3.R': 55,
}
# the thumb's metacarpal turned about its own length too, its pad towards the fingers (opposition)
THUMB_TWIST = -60
# the hand's bones: the wrist and all under it
HAND_ROOT = 'wrist.R'
# the mesh kept round the wrist: its forearm this far back from the wrist's joint (m)
FOREARM_KEPT = 0.04


@dataclass
class Rig:
    """MakeHuman's skeleton at rest: each bone's head, tail, plane of flexion's normal and parent."""
    head: dict[str, np.ndarray]
    tail: dict[str, np.ndarray]
    normal: dict[str, np.ndarray]
    parent: dict[str, str | None]


def read_mesh(obj: Path) -> tuple[np.ndarray, np.ndarray]:
    """The base mesh's vertices (m: the file's decimetres) and its body's faces as quads."""
    positions: list[list[float]] = []
    quads: list[list[int]] = []
    group = ''
    for line in obj.read_text(encoding='utf-8').splitlines():
        if line.startswith('v '):
            positions.append([float(n) / 10 for n in line.split()[1:4]])
        elif line.startswith('g '):
            group = line[2:].strip()
        elif line.startswith('f ') and group == 'body':
            corners = [int(c.split('/')[0]) - 1 for c in line.split()[1:]]
            if len(corners) == 3:
                corners.append(corners[2])
            quads.append(corners)
    return np.array(positions), np.array(quads)


def read_rig(skel: Path, positions: np.ndarray) -> Rig:
    """The skeleton's joints, each the mean of its vertices, and every bone's plane of flexion."""
    data = json.loads(skel.read_text(encoding='utf-8'))
    joint = {name: positions[ids].mean(axis=0) for name, ids in data['joints'].items()}
    rig = Rig({}, {}, {}, {})
    for name, bone in data['bones'].items():
        rig.head[name] = joint[bone['head']]
        rig.tail[name] = joint[bone['tail']]
        rig.parent[name] = bone['parent']
        a, b, c = (joint[j] for j in data['planes'][bone['rotation_plane']])
        normal = np.cross(b - a, c - b)
        rig.normal[name] = normal / (np.linalg.norm(normal) or 1)
    return rig


def under(rig: Rig, root: str) -> list[str]:
    """`root` and every bone under it, each after its parent."""
    order = [root]
    for name in order:
        order.extend(child for child, parent in rig.parent.items() if parent == name)
    return order


def turn(axis: np.ndarray, degrees: float) -> np.ndarray:
    """A rotation matrix of `degrees` about `axis`."""
    x, y, z = axis / np.linalg.norm(axis)
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    k = np.array([[0, -z, y], [z, 0, -x], [-y, x, 0]])
    return np.eye(3) + s * k + (1 - c) * (k @ k)


def curl_sign(rig: Rig, bone: str) -> float:
    """Which way about a bone's plane normal bends it towards the palm: the way its finger already curls at rest."""
    chain = [bone]
    while True:
        children = [c for c, p in rig.parent.items() if p == chain[-1]]
        if not children:
            break
        chain.append(children[0])
    tip = rig.tail[chain[-1]] - rig.head[bone]
    length = rig.tail[bone] - rig.head[bone]
    bent = np.cross(length, tip)
    return 1.0 if np.dot(bent, rig.normal[bone]) >= 0 else -1.0


def pose(rig: Rig, angles: dict[str, float], twist: float) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Each hand bone's world transform (rotation, translation) with `angles` applied down the chain."""
    world: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    sign = curl_sign(rig, 'finger3-1.R')
    for name in under(rig, HAND_ROOT):
        local = turn(rig.normal[name], sign * angles.get(name, 0.0))
        if name == 'finger1-1.R':
            local = local @ turn(rig.tail[name] - rig.head[name], twist)
        pivot = rig.head[name]
        parent = rig.parent[name]
        rot_p, move_p = world.get(parent, (np.eye(3), np.zeros(3)))
        rot = rot_p @ local
        move = rot_p @ (pivot - local @ pivot) + move_p
        world[name] = (rot, move)
    return world


def skin(positions: np.ndarray, weights: dict[str, list], world: dict) -> np.ndarray:
    """The vertices blended by their bones' transforms (linear, the weights normalised over the hand's bones)."""
    out = positions.copy()
    total = np.zeros(len(positions))
    moved = np.zeros_like(positions)
    for name, (rot, move) in world.items():
        for index, weight in weights.get(name, []):
            moved[index] += weight * (rot @ positions[index] + move)
            total[index] += weight
    held = total > 0
    # a vertex partly on the forearm keeps that share where it was
    out[held] = moved[held] + (1 - np.minimum(total[held], 1))[:, None] * positions[held]
    return out


def hand_faces(rig: Rig, positions: np.ndarray, quads: np.ndarray) -> np.ndarray:
    """The faces of the hand and the forearm's end: every corner past a plane across the forearm near the wrist."""
    wrist = rig.head[HAND_ROOT]
    along = rig.tail['finger3-1.R'] - wrist
    along /= np.linalg.norm(along)
    ahead = (positions - wrist) @ along > -FOREARM_KEPT
    near = np.linalg.norm(positions - wrist, axis=1) < 0.25
    keep = ahead & near
    return quads[keep[quads].all(axis=1)]


@dataclass
class Model:
    """A hand to picture: its vertices and triangles, its axes (rows: across from the index knuckle to the little
    finger's, up from the wrist to the middle knuckle, out of its back) and its knuckles' breadth, which sizes it."""
    positions: np.ndarray
    tris: np.ndarray
    frame: np.ndarray
    breadth: float
    joints: dict | None = None


def frame_of(wrist: np.ndarray, index: np.ndarray, middle: np.ndarray, little: np.ndarray) -> tuple[np.ndarray, float]:
    """A hand's axes and knuckle breadth from where its wrist and knuckles are."""
    up = middle - wrist
    across = little - index
    back = np.cross(across, up)
    up = up / np.linalg.norm(up)
    back = back / np.linalg.norm(back)
    return np.array([np.cross(up, back), up, back]), float(np.linalg.norm(across))


def reference(folder: Path, closed: bool) -> Model:
    """MakeHuman's right hand, closed in its fist or open, its axes as they were at rest."""
    positions, quads = read_mesh(folder / '3dobjs' / 'base.obj')
    rig = read_rig(folder / 'rigs' / 'default.mhskel', positions)
    weights = json.loads((folder / 'rigs' / 'default_weights.mhw').read_text(encoding='utf-8'))['weights']
    faces = hand_faces(rig, positions, quads)
    world = pose(rig, FIST if closed else {}, THUMB_TWIST if closed else 0)
    posed = skin(positions, weights, world)
    knuckle = {name: rig.head[f'finger{n}-1.R'] for name, n in (('index', 2), ('middle', 3), ('little', 5))}
    frame, breadth = frame_of(rig.head[HAND_ROOT], knuckle['index'], knuckle['middle'], knuckle['little'])
    tris = np.concatenate([faces[:, [0, 1, 2]], faces[:, [0, 2, 3]]])
    tris = tris[(tris[:, 0] != tris[:, 1]) & (tris[:, 1] != tris[:, 2]) & (tris[:, 0] != tris[:, 2])]
    model = Model(posed, tris, frame, breadth)
    model.joints = {'wrist': rig.head[HAND_ROOT], **knuckle}
    return model


def ours(path: Path) -> Model:
    """The game's hand as `ourHand.ts` wrote it."""
    data = json.loads(path.read_text(encoding='utf-8'))
    joints = {name: np.array(place, float) for name, place in data['joints'].items()}
    frame, breadth = frame_of(joints['wrist'], joints['index'], joints['middle'], joints['little'])
    positions = np.array(data['positions'], float).reshape(-1, 3)
    tris = np.array(data['index'], int).reshape(-1, 3)
    return Model(positions, tris, frame, breadth)


# each studio view: where the camera stands from the hand (in the hand's frame), and its up
VIEWS = {
    'back': ([0, 0, 1], [0, 1, 0]),
    'palm': ([0, 0, -1], [0, 1, 0]),
    'thumb side': ([-1, 0, 0], [0, 1, 0]),
    'little side': ([1, 0, 0], [0, 1, 0]),
    'knuckles': ([0, 1, 0], [0, 0, 1]),
    'quarter': ([-0.6, 0.35, 0.72], [0, 1, 0]),
}
# the picture's width in knuckle breadths
FIELD = 2.6


def render(model: Model, view: str, size: int) -> Image.Image:
    """The hand seen orthographically from `view`, lit softly from the camera, on grey: a z-buffered rasteriser."""
    stand, up = (model.frame.T @ np.array(v, float) for v in VIEWS[view])
    look = -stand / np.linalg.norm(stand)
    right = np.cross(up, look)
    right /= np.linalg.norm(right)
    up = np.cross(look, right)
    used = np.unique(model.tris)
    centre = (model.positions[used].min(axis=0) + model.positions[used].max(axis=0)) / 2
    local = (model.positions - centre) @ np.array([right, up, look]).T
    scale = size / (FIELD * model.breadth)
    xs = local[:, 0] * scale + size / 2
    ys = size / 2 - local[:, 1] * scale
    depth = np.full((size, size), -np.inf)
    shade = np.full((size, size), 0.45)
    for a, b, c in model.tris:
        if a == b or b == c or a == c:
            continue
        normal = np.cross(local[b] - local[a], local[c] - local[a])
        length = np.linalg.norm(normal)
        if length == 0:
            continue
        light = 0.25 + 0.75 * abs(normal[2]) / length
        fill(depth, shade, (xs[[a, b, c]], ys[[a, b, c]], local[[a, b, c], 2]), light)
    skin_tone = np.array([224, 172, 150])
    grey = np.array([115, 115, 115])
    hit = np.isfinite(depth)
    image = np.where(hit[..., None], shade[..., None] * skin_tone, grey).astype(np.uint8)
    return Image.fromarray(image)


def fill(depth: np.ndarray, shade: np.ndarray, tri: tuple, light: float) -> None:
    """One triangle into the buffers: its pixels nearer the camera than what's there (z towards the camera)."""
    xs, ys, zs = tri
    x0, x1 = int(max(xs.min(), 0)), int(min(xs.max() + 1, depth.shape[1]))
    y0, y1 = int(max(ys.min(), 0)), int(min(ys.max() + 1, depth.shape[0]))
    if x0 >= x1 or y0 >= y1:
        return
    px, py = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
    det = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
    if det == 0:
        return
    w0 = ((ys[1] - ys[2]) * (px - xs[2]) + (xs[2] - xs[1]) * (py - ys[2])) / det
    w1 = ((ys[2] - ys[0]) * (px - xs[2]) + (xs[0] - xs[2]) * (py - ys[2])) / det
    w2 = 1 - w0 - w1
    inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
    z = -(w0 * zs[0] + w1 * zs[1] + w2 * zs[2])
    region = depth[y0:y1, x0:x1]
    nearer = inside & (z > region)
    region[nearer] = z[nearer]
    shade[y0:y1, x0:x1][nearer] = light


def sheet(rows: list[tuple[str, Model]], size: int, path: Path) -> None:
    """Each hand's views in a row, the rows one above the other, each tile labelled."""
    label_height = 20
    out = Image.new('RGB', (size * len(VIEWS), (size + label_height) * len(rows)), (30, 30, 30))
    draw = ImageDraw.Draw(out)
    for row, (name, model) in enumerate(rows):
        top = row * (size + label_height)
        for column, view in enumerate(VIEWS):
            out.paste(render(model, view, size), (column * size, top + label_height))
            draw.text((column * size + 6, top + 4), f'{name}: {view}', fill=(230, 230, 230))
    out.save(path)


def write_json(model: Model, path: Path) -> None:
    """A hand as `ourHand.ts` writes one: its vertices, triangles and the joints that set its frame."""
    used = np.unique(model.tris)
    remap = np.full(len(model.positions), -1)
    remap[used] = np.arange(len(used))
    data = {
        'positions': model.positions[used].ravel().round(6).tolist(),
        'index': remap[model.tris].ravel().tolist(),
        'joints': {name: place.round(6).tolist() for name, place in model.joints.items()},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding='utf-8')
    print(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--makehuman', required=True, help="MakeHuman's folder: 3dobjs/base.obj, rigs/default.*")
    parser.add_argument('--ours', action='append', default=[], help="a hand `ourHand.ts` wrote, a row each")
    parser.add_argument('--size', type=int, default=300)
    parser.add_argument('--open', action='store_true', help='the reference open, at rest')
    parser.add_argument('--out', default=str(OUT / 'sheet.png'))
    parser.add_argument('--json', help="write the reference as `ourHand.ts` writes a hand, for `studio.mjs`, and stop")
    args = parser.parse_args()
    rows = [('reference', reference(Path(args.makehuman), not args.open))]
    if args.json:
        write_json(rows[0][1], Path(args.json))
        return
    rows += [(Path(path).stem, ours(Path(path))) for path in args.ours]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet(rows, args.size, out)
    print(out)


if __name__ == '__main__':
    main()
