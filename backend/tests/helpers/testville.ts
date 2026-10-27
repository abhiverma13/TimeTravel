import { Types } from 'mongoose';

import { ActivityModel } from '../../src/activities/activityModel';
import type { ActivityService, TaggedPlace } from '../../src/activities/activityService';
import { ItineraryModel } from '../../src/itineraries/itineraryModel';

/*
 * Testville: five made-up places a short walk apart, with opening hours (and two prices) chosen so that adjustments
 * and options have predictable outcomes. Morning Bakery closes at noon, so it only fits early in the day; Town Museum (a
 * 2-hour visit) closes at 17:00; Night Market opens at 17:00, too late for a day ending at 18:00.
 */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function hours(openHour: number, closeHour: number): TaggedPlace['openingPeriods'] {
  return EVERY_DAY.map((day) => ({ open: { day, hour: openHour, minute: 0 }, close: { day, hour: closeHour, minute: 0 } }));
}

function place(
  slug: string,
  name: string,
  offset: number,
  types: string[],
  foundBy: TaggedPlace['foundBy'],
  periods: TaggedPlace['openingPeriods'],
  priceLevel?: TaggedPlace['priceLevel'],
): TaggedPlace {
  return {
    placeId: `testville-${slug}`,
    name,
    address: `${name}, Testville`,
    location: { lat: 49.28 + offset / 1000, lng: -123.12 + offset / 1000 },
    types,
    rating: 4.5,
    userRatingCount: 100,
    openingPeriods: periods,
    priceLevel,
    foundBy,
  };
}

export const TESTVILLE_PLACES: readonly TaggedPlace[] = [
  place('bakery', 'Morning Bakery', 0, ['bakery'], ['food'], hours(8, 12), 'low'),
  place('park', 'Harbour Park', 1, ['park'], ['outdoors'], [{ open: { day: 0, hour: 0, minute: 0 } }]),
  place('museum', 'Town Museum', 2, ['museum'], ['museums'], hours(10, 17), 'high'),
  place('lookout', 'Lookout Tower', 3, ['tourist_attraction'], ['landmarks'], hours(9, 18)),
  place('market', 'Night Market', 4, ['market'], ['food'], hours(17, 22)),
];

export async function seedTestville(activityService: ActivityService): Promise<void> {
  await activityService.importPlaces('Testville', TESTVILLE_PLACES);
}

export interface StoredTripOptions {
  /** Names of the stops to store locked. */
  locked?: string[];
  /** Start times to store, by stop name (the rest get placeholder times); used to mark stops as already started. */
  startTimes?: Record<string, string>;
  groupId?: string;
  pace?: 'relaxed' | 'moderate' | 'packed';
  /** When the day ends (default 18:00). */
  dayEnd?: string;
}

/**
 * Stores a one-day Testville itinerary (Saturday 2026-10-24, 09:00-18:00, moderate pace unless options say otherwise) with exactly these stops
 * in this order, as if it had been generated, and returns its id. Adjustments re-time the stops themselves.
 */
export async function storeTestvilleTrip(userId: string, stopNames: string[], options: StoredTripOptions = {}): Promise<string> {
  const startTimes = new Map(Object.entries(options.startTimes ?? {}));
  const stops = await Promise.all(
    stopNames.map(async (name, index) => {
      const activity = await ActivityModel.findOne({ name });
      if (!activity) {
        throw new Error(`Seed Testville first: no activity named ${name}`);
      }
      const start = startTimes.get(name) ?? `${String(9 + index).padStart(2, '0')}:00`;
      return {
        activityId: activity._id,
        name,
        address: activity.address,
        location: { lat: activity.location.coordinates[1], lng: activity.location.coordinates[0] },
        interests: activity.interests,
        startTime: start,
        endTime: start,
        travelMinutes: 1,
        communityScore: 4.5,
        locked: options.locked?.includes(name) ?? false,
      };
    }),
  );
  const itinerary = await ItineraryModel.create({
    userId: new Types.ObjectId(userId),
    groupId: options.groupId === undefined ? undefined : new Types.ObjectId(options.groupId),
    city: 'Testville',
    startDate: '2026-10-24',
    endDate: '2026-10-24',
    dayStart: '09:00',
    dayEnd: options.dayEnd ?? '18:00',
    interests: [],
    pace: options.pace ?? 'moderate',
    lodging: { label: 'Testville centre', lat: 49.281, lng: -123.119, source: 'city-centre' },
    days: [{ date: '2026-10-24', weekday: 6, stops, returnTravelMinutes: 1 }],
    candidateCount: TESTVILLE_PLACES.length,
    unscheduledCount: 0,
    warnings: [],
    generationMs: 1,
  });
  return itinerary._id.toString();
}
