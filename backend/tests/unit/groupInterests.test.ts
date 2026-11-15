import { utilityOf } from '../../src/trips/engine/candidates';
import type { Candidate } from '../../src/trips/engine/types';

function candidate(interests: string[], score = 4): Candidate {
  return { id: interests.join('+'), location: { lat: 0, lng: 0 }, interests, durationMinutes: 60, score, openingHours: null };
}

describe('utilityOf with group interest shares', () => {
  // Input: a museum (score 4) with interest shares { museums: 1 } (every member picked museums)
  // Expected behavior: a share of 1 gives the full boost, as for a solo traveller interested in museums
  // Expected output: the group utility is close to the solo traveller's utility for the same museum
  test("An interest every member picked scores like a solo traveller's match", () => {
    const shares = new Map([['museums', 1]]);

    expect(utilityOf(candidate(['museums']), [], shares)).toBeCloseTo(utilityOf(candidate(['museums']), ['museums']));
  });

  // Input: interest shares { museums: 1/3, outdoors: 2/3 }, and a museum, a park and a bar (nightlife, which no member
  //        picked), each scored 4
  // Expected behavior: a larger share gives a larger boost; an interest no member picked gets the minimum weight
  // Expected output: park > museum > bar, and the bar's utility is close to a solo traveller's non-matching activity
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

  // Input: interest shares { landmarks: 0.25, outdoors: 1 } and an activity tagged both landmarks and outdoors
  // Expected behavior: the activity is boosted by its interest with the highest share (outdoors)
  // Expected output: its utility is close to that of an activity tagged outdoors only
  test('An activity with several interests uses its best-shared one', () => {
    const shares = new Map([
      ['landmarks', 0.25],
      ['outdoors', 1],
    ]);

    expect(utilityOf(candidate(['landmarks', 'outdoors']), [], shares)).toBeCloseTo(utilityOf(candidate(['outdoors']), [], shares));
  });

  // Input: a food activity scored 4.2, empty interest shares, and a solo interest list of museums
  // Expected behavior: with group shares given but empty, no boost is applied and the solo interest list is ignored
  // Expected output: 4.2 (the community score)
  test('A group with no interests ranks by community score alone', () => {
    expect(utilityOf(candidate(['food'], 4.2), ['museums'], new Map())).toBe(4.2);
  });
});
