import { PAD_BOTTOM, PAD_LEFT, TimePoint, layOut, nearest, niceTop } from './chart-logic';

const points = (values: number[]): TimePoint[] =>
  values.map((value, i) => ({ at: i, value, when: `day ${i}`, text: String(value) }));

describe('chart logic', () => {
  it('tops the y axis at a round number', () => {
    expect([0, 1, 3, 7, 12, 180, 2400].map(niceTop)).toEqual([1, 1, 5, 10, 20, 200, 2500]);
  });

  it('lays a line from the left margin to the right edge, the highest point near the top', () => {
    const g = layOut(points([0, 5, 10]), 'line', 434, 200);
    expect(g.placed.map((p) => p.x)).toEqual([PAD_LEFT, PAD_LEFT + 200, 434]);
    expect(g.placed[0].y).toBe(200 - PAD_BOTTOM);
    expect(g.placed[2].y).toBe(4);
    expect(g.line.startsWith(`M${PAD_LEFT}.0,`)).toBe(true);
    expect(g.ticksY.map((t) => t.text)).toEqual(['0', '5', '10']);
  });

  it('gives each bar its band, a gap between them', () => {
    const g = layOut(points([1, 2, 3, 4]), 'bars', PAD_LEFT + 400, 200);
    expect(g.placed.map((p) => p.width)).toEqual([98, 98, 98, 98]);
    expect(g.placed[1].left - (g.placed[0].left + g.placed[0].width)).toBe(2);
    expect(g.line).toBe('');
  });

  it('labels a few points evenly apart from the newest, the ends held inside', () => {
    const g = layOut(points(Array.from({ length: 30 }, (_, i) => i)), 'bars', 634, 200);
    expect(g.ticksX.map((t) => t.text)).toEqual(['day 5', 'day 11', 'day 17', 'day 23', 'day 29']);
    expect(g.ticksX[g.ticksX.length - 1]).toMatchObject({ anchor: 'end', text: 'day 29' });
    const steps = g.ticksX.slice(1).map((t, k) => t.x - g.ticksX[k].x);
    expect(new Set(steps.map((d) => d.toFixed(3))).size).toBe(1);
  });

  it('never puts two labels a single point apart (a week of bars)', () => {
    const g = layOut(points([1, 2, 3, 4, 5, 6, 7]), 'bars', 634, 200);
    expect(g.ticksX.map((t) => t.text)).toEqual(['day 0', 'day 2', 'day 4', 'day 6']);
    expect(g.ticksX[0].anchor).toBe('start');
  });

  it('finds the point nearest the pointer', () => {
    const g = layOut(points([1, 2, 3]), 'line', 434, 200);
    expect([nearest(g, 0), nearest(g, PAD_LEFT + 180), nearest(g, 999)]).toEqual([0, 1, 2]);
    expect(nearest(layOut([], 'line', 434, 200), 50)).toBe(-1);
  });
});
