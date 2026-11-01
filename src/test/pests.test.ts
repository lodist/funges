import { describe, expect, it } from 'vitest';
import { flight, PESTS } from '@/lib/pests';

const flat = (t: number) => Array<number>(12).fill(t);
const carrotFly = PESTS.carrot_fly.flight!;

describe("a fly's spring flight", () => {
  it('starts and ends at its degree days since 1 March', () => {
    // 15 °C every day: 10 a day above 5 °C; 260 on 26 March, 560 on 25 April.
    expect(flight(carrotFly, '2027-04-10', flat(15))).toEqual({
      from: '2027-03-26',
      until: '2027-04-25',
    });
  });

  it('counts the observed and forecast days first, the typical ones after', () => {
    // 25 °C for 1-10 March (200), then 15 °C: 260 on 16 March.
    const warm = {
      start: '2027-02-20',
      t: [...Array<number>(9).fill(0), ...Array<number>(10).fill(25), null],
    };
    expect(flight(carrotFly, '2027-03-15', flat(15), warm)?.from).toBe(
      '2027-03-16'
    );
  });

  it('says nothing before 1 March, or where the year never warms enough', () => {
    expect(flight(carrotFly, '2027-02-28', flat(15))).toBeNull();
    expect(flight(carrotFly, '2027-06-01', flat(5))).toBeNull();
  });
});
