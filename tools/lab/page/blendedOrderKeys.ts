// The order the engine draws what blends in, as Bulwark's plan.rs makes it, and the pairs of records whose order turns
// round as the camera moves while they overlap on the screen (`blendedOrder.ts`). What blends is drawn after what's
// opaque, the farthest first, by each record's sphere, made from its vertices (`sphere_of` in its cull.rs): what the
// game thins (a wall, a roof, a column) first of all, each by its farthest point, the rest by its middle. Two records
// drawn in turns that swap as the camera moves paint each other over and under in turn: the hall's plinths, merged
// into one record, showed through the ghost of the column before him and then didn't.

/** A sphere: its middle and its radius. */
export interface Sphere { x: number; y: number; z: number; radius: number }

/** A rectangle on the screen, in pixels. */
export interface ScreenRect { left: number; top: number; right: number; bottom: number }

/** One record as the engine sorts it at one stand. */
export interface Sorted {
  /** the record's name, the same at every stand */
  name: string;
  /** whether it's thinned by the game (`THINNED`): drawn before all else that blends, by their farthest point */
  thinned: boolean;
  /** whether its blending adds light (order makes no difference between two that add) */
  adds: boolean;
  /** its sphere in the world */
  sphere: Sphere;
  /** where it covers the screen */
  rect: ScreenRect;
  /** the set of parts it's one of that must be drawn in given turns, and its turn there (the hall's columns: a plinth
   *  under its shaft, the capital over it) */
  turn?: { set: number; at: number };
}

/** Two records whose order turned round between two stands, overlapping on the screen at both. */
export interface Flip { first: string; second: string; stands: [number, number] }

/** The sphere round a run of xyz positions as the engine makes it: its box's middle, and the farthest point from it. */
export function sphereOfPositions(positions: ArrayLike<number>): Sphere {
  if (positions.length < 3) return { x: 0, y: 0, z: 0, radius: 0 };
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let at = 0; at + 2 < positions.length; at += 3) {
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], positions[at + axis]);
      high[axis] = Math.max(high[axis], positions[at + axis]);
    }
  }
  const middle = low.map((value, axis) => (value + high[axis]) / 2);
  let farthest = 0;
  for (let at = 0; at + 2 < positions.length; at += 3) {
    const dx = positions[at] - middle[0];
    const dy = positions[at + 1] - middle[1];
    const dz = positions[at + 2] - middle[2];
    farthest = Math.max(farthest, dx * dx + dy * dy + dz * dz);
  }
  return { x: middle[0], y: middle[1], z: middle[2], radius: Math.sqrt(farthest) };
}

/** How far the engine counts a record from the eye: a thinned one by its farthest point, the rest by its middle
 *  (squared, as plan.rs keeps it). */
export function farOf(record: Sorted, eye: { x: number; y: number; z: number }): number {
  const dx = record.sphere.x - eye.x;
  const dy = record.sphere.y - eye.y;
  const dz = record.sphere.z - eye.z;
  const squared = dx * dx + dy * dy + dz * dz;
  return record.thinned ? Math.sqrt(squared) + record.sphere.radius : squared;
}

/** Whether `a` is drawn before `b` from `eye`: the thinned first, then the farthest first, then as they're met
 *  (`index`). */
export function drawnBefore(a: Sorted, aIndex: number, b: Sorted, bIndex: number,
  eye: { x: number; y: number; z: number }): boolean {
  if (a.thinned !== b.thinned) return a.thinned;
  const farA = farOf(a, eye);
  const farB = farOf(b, eye);
  if (farA !== farB) return farA > farB;
  return aIndex < bIndex;
}

/** Whether two rectangles share more than `least` pixels. */
export function overlap(a: ScreenRect, b: ScreenRect, least: number): boolean {
  const wide = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const high = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return wide > 0 && high > 0 && wide * high > least;
}

/** One stand: the eye and every record that blends there, in the order the walk meets them. */
export interface Stand { eye: { x: number; y: number; z: number }; records: Sorted[] }

/** The sets whose parts aren't drawn in their turns at `stand`: each set's records as the engine sorts them, against
 *  the turns given. */
export function turnsBroken(stand: Stand): number[] {
  const bySet = new Map<number, { record: Sorted; index: number }[]>();
  stand.records.forEach((record, index) => {
    if (!record.turn) return;
    bySet.set(record.turn.set, [...(bySet.get(record.turn.set) ?? []), { record, index }]);
  });
  const broken: number[] = [];
  for (const [set, members] of bySet) {
    const drawn = [...members].sort((a, b) => (drawnBefore(a.record, a.index, b.record, b.index, stand.eye) ? -1 : 1));
    const turns = drawn.map((member) => member.record.turn!.at);
    if (turns.some((at, k) => k > 0 && at < turns[k - 1])) broken.push(set);
  }
  return broken;
}

/** The pairs whose order turns round between two neighbouring stands (a small move of the camera) while they
 *  overlap on the screen at both, and aren't both light added. */
export function flipsBetween(stands: Stand[], firstIndex: number, least: number): Flip[] {
  const found: Flip[] = [];
  const before = stands[firstIndex];
  const after = stands[firstIndex + 1];
  const afterByName = new Map(after.records.map((record, index) => [record.name, { record, index }]));
  for (let i = 0; i < before.records.length; i++) {
    for (let j = i + 1; j < before.records.length; j++) {
      const a = before.records[i];
      const b = before.records[j];
      if (a.adds && b.adds) continue;
      const laterA = afterByName.get(a.name);
      const laterB = afterByName.get(b.name);
      if (!laterA || !laterB) continue;
      if (!overlap(a.rect, b.rect, least) || !overlap(laterA.record.rect, laterB.record.rect, least)) continue;
      const was = drawnBefore(a, i, b, j, before.eye);
      const now = drawnBefore(laterA.record, laterA.index, laterB.record, laterB.index, after.eye);
      if (was !== now) found.push({ first: a.name, second: b.name, stands: [firstIndex, firstIndex + 1] });
    }
  }
  return found;
}
