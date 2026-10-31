import { describe, expect, it } from 'vitest';
import {
  addLine,
  addRounds,
  arrange,
  cropLines,
  freeSections,
  growLine,
  lastOf,
  nextFree,
  resizeLine,
  shrinkLine,
} from '@/lib/crop-plan';
import { adjacent, layout, type Grown, type Section } from '@/lib/planner';

// An open plot in rows: strips across, each in blocks.
const field = () =>
  layout({ width: 9, length: 9, shape: 'rect', ground: 'rows' });
const withCrops = (sections: Section[], crops: Record<number, string>) =>
  sections.map((s, i) =>
    crops[i] ? { ...s, crop: crops[i], sow: '2027-03-01' } : s
  );
// A crop's sections touch one another (one piece on the ground).
const together = (sections: Section[], crop: string) => {
  const ids = sections.flatMap((s, i) => (s.crop === crop ? [i] : []));
  const seen = new Set([ids[0]]);
  for (let grew = true; grew;) {
    grew = false;
    for (const i of ids)
      if (
        !seen.has(i) &&
        [...seen].some(j => adjacent(sections[i], sections[j]))
      ) {
        seen.add(i);
        grew = true;
      }
  }
  return seen.size === ids.length;
};

describe('the garden by crop', () => {
  it('lists one line per crop and day, planted apart', () => {
    const s = withCrops(field(), { 0: 'potato', 1: 'potato', 5: 'lettuce' });
    s[2] = { ...s[2], crop: 'potato', planted: '2027-03-01' };
    const lines = cropLines(s);
    expect(lines.map(l => [l.crop, l.planted, l.ids.length])).toEqual([
      ['lettuce', false, 1],
      ['potato', false, 2],
      ['potato', true, 1],
    ]);
  });

  it('grows a line into a free section touching it, and shrinks it from its far end', () => {
    const s = withCrops(field(), { 0: 'potato' });
    const [line] = cropLines(s);
    const grown = growLine(s, line);
    const [bigger] = cropLines(grown);
    expect(bigger.ids).toHaveLength(2);
    expect(adjacent(grown[bigger.ids[0]], grown[bigger.ids[1]])).toBe(true);
    expect(cropLines(shrinkLine(grown, bigger))[0].ids).toHaveLength(1);
    // What is in the ground is never given up.
    const planted = s.map((x, i) =>
      i === 0 ? { ...x, planted: '2027-03-01' } : x
    );
    expect(lastOf(planted, [0])).toBeNull();
  });

  it('makes a line as many sections as typed, as far as there is room', () => {
    const s = withCrops(field(), { 0: 'potato' });
    const [line] = cropLines(s);
    const ten = resizeLine(s, line, 10);
    expect(cropLines(ten)[0].ids).toHaveLength(10);
    expect(together(ten, 'potato')).toBe(true);
    expect(
      cropLines(resizeLine(ten, cropLines(ten)[0], 3))[0].ids
    ).toHaveLength(3);
    // More than the garden holds: all of it.
    const all = resizeLine(s, line, 10_000);
    expect(freeSections(all)).toBe(0);
    expect(cropLines(all)[0].ids).toHaveLength(field().length);
  });

  it('puts a new crop next to its family, else at the north end; none when full', () => {
    const s = withCrops(field(), { 7: 'cabbage' });
    const kale = addLine(s, 'kale', '2027-04-01')!;
    expect(adjacent(kale.sections[kale.index], s[7])).toBe(true);
    const first = addLine(field(), 'potato', null)!;
    const top = Math.min(...field().map(x => x.y0));
    expect(field()[first.index].y0).toBe(top); // north is up: the top strip
    expect(nextFree(field(), [])).not.toBeNull();
    const full = field().map(x => ({ ...x, crop: 'lettuce' }));
    expect(addLine(full, 'potato', null)).toBeNull();
  });

  it('sows a line again in rounds, every so many weeks, as long as there is room', () => {
    const s = withCrops(field(), { 0: 'lettuce', 1: 'lettuce' });
    const [line] = cropLines(s);
    const { sections, rounds } = addRounds(s, line, 3, 3, '2027-01-01');
    expect(rounds).toBe(3);
    expect(cropLines(sections).map(l => [l.day, l.ids.length])).toEqual([
      ['2027-03-01', 2],
      ['2027-03-22', 2],
      ['2027-04-12', 2],
    ]);
    const tight = field().map((x, i) => (i > 3 ? { ...x, crop: 'garlic' } : x));
    tight[0] = { ...tight[0], crop: 'lettuce', sow: '2027-03-01' };
    const room = addRounds(
      tight,
      cropLines(tight).find(l => l.crop === 'lettuce')!,
      3,
      6,
      '2027-01-01'
    );
    expect(room.rounds).toBe(4); // three free sections: three more rounds of one
  });

  it("arranges each crop's sections side by side, families together, planted ones where they are", () => {
    // Scattered: potatoes, cabbages and lettuces all over, one potato planted.
    const crops: Record<number, string> = {};
    field().forEach((_, i) => {
      if (i % 3 === 0) crops[i] = 'potato';
      else if (i % 3 === 1) crops[i] = 'cabbage';
      else if (i % 5 === 0) crops[i] = 'lettuce';
    });
    const s = withCrops(field(), crops);
    s[4] = { ...s[4], crop: 'kale', planted: '2027-02-01' };
    const out = arrange(s, { today: '2027-03-01' });
    expect(out[4]).toEqual(s[4]);
    for (const crop of ['potato', 'cabbage', 'lettuce'])
      expect(out.filter(x => x.crop === crop && !x.planted).length, crop).toBe(
        s.filter(x => x.crop === crop && !x.planted).length
      );
    expect(together(out, 'lettuce')).toBe(true);
  });

  it('moves a family off the ground it grew on last year', () => {
    const s = withCrops(field(), {
      0: 'cabbage',
      1: 'cabbage',
      2: 'carrot',
      3: 'carrot',
    });
    const first = arrange(s, { today: '2027-03-01' });
    const cabbageAt = first.flatMap((x, i) =>
      x.crop === 'cabbage' ? [i] : []
    );
    // Last year the cabbage family grew where the arrangement first put it.
    const past: Grown[] = cabbageAt.map(i => ({
      crop: 'kale',
      x0: first[i].x0,
      x1: first[i].x1,
      y0: first[i].y0,
      y1: first[i].y1,
      planted: '2026-04-01',
      ended: '2026-10-01',
      end: 'harvested',
    }));
    const next = arrange(s, { today: '2027-03-01', past });
    const now = next.flatMap((x, i) => (x.crop === 'cabbage' ? [i] : []));
    expect(now.some(i => cabbageAt.includes(i))).toBe(false);
  });
});
