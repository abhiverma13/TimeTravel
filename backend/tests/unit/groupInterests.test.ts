import { utilityOf } from '../../src/itineraries/engine/candidates';
import type { Candidate } from '../../src/itineraries/engine/types';

function candidate(interests: string[], score = 4): Candidate {
  return { id: interests.join('+'), location: { lat: 0, lng: 0 }, interests, durationMinutes: 60, score, openingHours: null };
}

describe('utilityOf with group interest shares', () => {
  test("An interest every member picked scores like a solo traveller's match", () => {
    const shares = new Map([['museums', 1]]);

    expect(utilityOf(candidate(['museums']), [], shares)).toBeCloseTo(utilityOf(candidate(['museums']), ['museums']));
  });

  test('The boost grows with the share of members who picked the interest', () => {
    const shares = new Map([
      ['museums', 1 / 3],
      ['outdoors', 2 / 3],
    ]);

    const museum = utilityOf(candidate(['museums']), [], shares);
    const park = utilityOf(candidate(['outdoors']), [], shares);
    const bar = utilityOf(candidate(['nightlife']), [], shares);

    expect(park).toBeGreaterThan(museum);
    expect(museum).toBeGreaterThan(bar);
    expect(bar).toBeCloseTo(utilityOf(candidate(['nightlife']), ['museums']));
  });

  test('An activity with several interests uses its best-shared one', () => {
    const shares = new Map([
      ['landmarks', 0.25],
      ['outdoors', 1],
    ]);

    expect(utilityOf(candidate(['landmarks', 'outdoors']), [], shares)).toBeCloseTo(utilityOf(candidate(['outdoors']), [], shares));
  });

  test('A group with no interests ranks by community score alone', () => {
    expect(utilityOf(candidate(['food'], 4.2), ['museums'], new Map())).toBe(4.2);
  });
});
