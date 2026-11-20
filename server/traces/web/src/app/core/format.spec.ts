import { ago, bytes, countsOf, percent } from './format';

describe('format', () => {
  it('writes sizes in the unit that fits', () => {
    expect([bytes(351), bytes(47_616), bytes(1_258_291)]).toEqual(['351 B', '46.5 KB', '1.2 MB']);
  });

  it('writes ages from just now to months', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const at = (seconds: number) => new Date(now - seconds * 1000).toISOString();
    expect(ago(at(30), now)).toBe('just now');
    expect(ago(at(5 * 60), now)).toBe('5 min ago');
    expect(ago(at(3 * 3600), now)).toBe('3 h ago');
    expect(ago(at(3 * 86400), now)).toBe('3 d ago');
    expect(ago(at(65 * 86400), now)).toBe('2 mo ago');
  });

  it('keeps a little use from reading 0%', () => {
    expect([percent(0), percent(0.0004), percent(0.042), percent(0.5)]).toEqual(['0%', '<0.1%', '4.2%', '50%']);
  });

  it('orders counts the most first and names the empty one', () => {
    expect(countsOf({ fight: 2, '': 1, lobby: 5 })).toEqual([
      { name: 'lobby', count: 5 },
      { name: 'fight', count: 2 },
      { name: '(none)', count: 1 },
    ]);
  });
});
