import type { TaggedPlace } from '../activities/activityService';
import type { InterestTag } from '../activities/interests';
import type { PlacesPeriod } from '../activities/openingHours';

/*
 * DEMO DATA, NOT LIVE GOOGLE DATA.
 * A hand-written Vancouver catalogue for local development, demos without a Places API key,
 * and backend tests. Coordinates are approximate; ratings, rating counts and opening hours
 * are illustrative and will differ from Google's. Place ids start with "demo-" so they are
 * never confused with real Google place ids.
 */

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Google's "open 24 hours" encoding: a single period with no close. */
const OPEN_24_HOURS: PlacesPeriod[] = [{ open: { day: 0, hour: 0, minute: 0 } }];

function hours(open: string, close: string, days: readonly number[] = EVERY_DAY): PlacesPeriod[] {
  const [openHour = 0, openMinute = 0] = open.split(':').map(Number);
  const [closeHour = 0, closeMinute = 0] = close.split(':').map(Number);
  return days.map((day) => ({
    open: { day, hour: openHour, minute: openMinute },
    // A close at or before the open time is after midnight, i.e. on the next day.
    close: {
      day: closeHour * 60 + closeMinute <= openHour * 60 + openMinute ? (day + 1) % 7 : day,
      hour: closeHour,
      minute: closeMinute,
    },
  }));
}

function place(
  slug: string,
  name: string,
  lat: number,
  lng: number,
  types: string[],
  foundBy: InterestTag[],
  rating: number,
  userRatingCount: number,
  openingPeriods: PlacesPeriod[] | undefined,
): TaggedPlace {
  return {
    placeId: `demo-${slug}`,
    name,
    address: `${name}, Vancouver, BC`,
    location: { lat, lng },
    types,
    rating,
    userRatingCount,
    openingPeriods,
    foundBy,
  };
}

export const DEMO_VANCOUVER_PLACES: readonly TaggedPlace[] = [
  place('stanley-park-seawall', 'Stanley Park Seawall', 49.3017, -123.1417, ['park', 'tourist_attraction'], ['outdoors'], 4.8, 318, OPEN_24_HOURS),
  place('granville-island-market', 'Granville Island Public Market', 49.2727, -123.135, ['market', 'tourist_attraction'], ['food'], 4.6, 241, hours('09:00', '19:00')),
  place('museum-of-anthropology', 'Museum of Anthropology at UBC', 49.2697, -123.2594, ['museum'], ['museums'], 4.7, 180, hours('10:00', '17:00', [0, 2, 3, 4, 5, 6])),
  place('vancouver-aquarium', 'Vancouver Aquarium', 49.3008, -123.1309, ['aquarium', 'tourist_attraction'], ['family'], 4.5, 210, hours('09:30', '17:30')),
  place('vancouver-art-gallery', 'Vancouver Art Gallery', 49.2829, -123.1205, ['art_gallery', 'museum'], ['museums'], 4.4, 150, hours('10:00', '17:00', [0, 1, 3, 4, 5, 6])),
  place('capilano-suspension-bridge', 'Capilano Suspension Bridge Park', 49.3429, -123.1149, ['park', 'tourist_attraction'], ['outdoors', 'landmarks'], 4.6, 260, hours('09:00', '18:00')),
  place('science-world', 'Science World', 49.2734, -123.1038, ['museum'], ['family'], 4.5, 190, hours('10:00', '17:00')),
  place('queen-elizabeth-park', 'Queen Elizabeth Park', 49.2418, -123.1126, ['park'], ['outdoors'], 4.7, 140, OPEN_24_HOURS),
  place('vandusen-garden', 'VanDusen Botanical Garden', 49.2384, -123.1289, ['botanical_garden'], ['outdoors'], 4.7, 120, hours('10:00', '17:00')),
  place('sun-yat-sen-garden', 'Dr. Sun Yat-Sen Classical Chinese Garden', 49.2797, -123.1037, ['garden', 'tourist_attraction'], ['outdoors'], 4.5, 95, hours('10:00', '16:30')),
  place('gastown-steam-clock', 'Gastown Steam Clock', 49.2844, -123.1089, ['historical_landmark', 'tourist_attraction'], ['landmarks'], 4.3, 200, OPEN_24_HOURS),
  place('canada-place', 'Canada Place', 49.2888, -123.1111, ['tourist_attraction'], ['landmarks'], 4.5, 170, OPEN_24_HOURS),
  place('vancouver-lookout', 'Vancouver Lookout', 49.2848, -123.1119, ['observation_deck', 'tourist_attraction'], ['landmarks'], 4.3, 110, hours('10:00', '18:00')),
  place('kitsilano-beach', 'Kitsilano Beach', 49.2754, -123.1532, ['beach'], ['outdoors'], 4.6, 130, hours('06:00', '22:00')),
  place('english-bay-beach', 'English Bay Beach', 49.2863, -123.143, ['beach'], ['outdoors'], 4.6, 125, OPEN_24_HOURS),
  place('bloedel-conservatory', 'Bloedel Conservatory', 49.2417, -123.1131, ['botanical_garden'], ['outdoors', 'family'], 4.5, 80, hours('10:00', '17:00')),
  place('museum-of-vancouver', 'Museum of Vancouver', 49.2762, -123.1447, ['museum'], ['museums'], 4.4, 70, hours('10:00', '17:00')),
  place('space-centre', 'H.R. MacMillan Space Centre', 49.2763, -123.1443, ['planetarium', 'museum'], ['family'], 4.4, 75, hours('10:00', '17:00', [0, 5, 6])),
  place('bill-reid-gallery', 'Bill Reid Gallery', 49.2849, -123.1186, ['art_gallery'], ['museums'], 4.7, 60, hours('10:00', '17:00', [0, 3, 4, 5, 6])),
  place('lynn-canyon-park', 'Lynn Canyon Park', 49.3445, -123.018, ['park', 'hiking_area'], ['outdoors'], 4.7, 150, hours('07:00', '21:00')),
  place('robson-street', 'Robson Street', 49.2846, -123.1265, ['tourist_attraction'], ['shopping'], 4.3, 90, OPEN_24_HOURS),
  place('pacific-centre', 'CF Pacific Centre', 49.283, -123.118, ['shopping_mall'], ['shopping'], 4.3, 100, hours('10:00', '21:00')),
  place('chinatown', 'Vancouver Chinatown', 49.2797, -123.1003, ['tourist_attraction'], ['landmarks', 'food'], 4.1, 85, OPEN_24_HOURS),
  place('alibi-room', 'The Alibi Room', 49.2848, -123.0995, ['bar', 'restaurant'], ['nightlife'], 4.5, 65, hours('17:00', '00:00')),
  place('commodore-ballroom', 'Commodore Ballroom', 49.2803, -123.1229, ['live_music_venue'], ['nightlife'], 4.6, 70, hours('19:00', '02:00', [5, 6])),
  place('maritime-museum', 'Vancouver Maritime Museum', 49.2775, -123.147, ['museum'], ['museums'], 4.4, 55, hours('10:00', '17:00', [0, 4, 5, 6])),
  place('beaty-museum', 'Beaty Biodiversity Museum', 49.2633, -123.2508, ['museum'], ['museums', 'family'], 4.7, 50, hours('10:00', '17:00', [0, 2, 3, 4, 5, 6])),
  place('nitobe-garden', 'Nitobe Memorial Garden', 49.2665, -123.2595, ['garden'], ['outdoors'], 4.6, 60, hours('10:00', '16:00')),
  place('lonsdale-quay', 'Lonsdale Quay Market', 49.31, -123.0828, ['market'], ['food', 'shopping'], 4.4, 90, hours('09:00', '19:00')),
  place('grouse-mountain', 'Grouse Mountain', 49.38, -123.0814, ['tourist_attraction', 'hiking_area'], ['outdoors'], 4.5, 160, hours('09:00', '22:00')),
];
