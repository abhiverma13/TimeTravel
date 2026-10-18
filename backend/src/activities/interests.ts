import { INTEREST_TAGS, type InterestTag } from '../shared/interestTags';

export { INTEREST_TAGS, type InterestTag };

/** Google Places types (https://developers.google.com/maps/documentation/places/web-service/place-types) per tag. */
const TAGS_BY_PLACE_TYPE: ReadonlyMap<string, readonly InterestTag[]> = new Map<string, readonly InterestTag[]>([
  ['museum', ['museums']],
  ['art_gallery', ['museums']],
  ['art_museum', ['museums']],
  ['history_museum', ['museums']],
  ['cultural_center', ['museums']],
  ['park', ['outdoors']],
  ['national_park', ['outdoors']],
  ['state_park', ['outdoors']],
  ['hiking_area', ['outdoors']],
  ['beach', ['outdoors']],
  ['garden', ['outdoors']],
  ['botanical_garden', ['outdoors']],
  ['marina', ['outdoors']],
  ['restaurant', ['food']],
  ['cafe', ['food']],
  ['bakery', ['food']],
  ['food_court', ['food']],
  ['farmers_market', ['food']],
  ['market', ['food', 'shopping']],
  ['shopping_mall', ['shopping']],
  ['department_store', ['shopping']],
  ['gift_shop', ['shopping']],
  ['book_store', ['shopping']],
  ['tourist_attraction', ['landmarks']],
  ['historical_landmark', ['landmarks']],
  ['cultural_landmark', ['landmarks']],
  ['monument', ['landmarks']],
  ['observation_deck', ['landmarks']],
  ['plaza', ['landmarks']],
  ['bar', ['nightlife']],
  ['pub', ['nightlife']],
  ['night_club', ['nightlife']],
  ['live_music_venue', ['nightlife']],
  ['concert_hall', ['nightlife']],
  ['zoo', ['family']],
  ['aquarium', ['family']],
  ['amusement_park', ['family']],
  ['water_park', ['family']],
  ['planetarium', ['family']],
  ['playground', ['family']],
]);

/** Typical visit length per tag until travellers' own duration tags replace it. */
const VISIT_MINUTES_BY_TAG: ReadonlyMap<InterestTag, number> = new Map<InterestTag, number>([
  ['museums', 120],
  ['outdoors', 90],
  ['food', 60],
  ['shopping', 60],
  ['landmarks', 45],
  ['nightlife', 90],
  ['family', 120],
]);
const DEFAULT_VISIT_MINUTES = 60;

/** The Places text-search phrase used to discover activities for each tag, e.g. "museums in Vancouver". */
export const SEARCH_PHRASE_BY_TAG: ReadonlyMap<InterestTag, string> = new Map<InterestTag, string>([
  ['museums', 'museums and galleries'],
  ['outdoors', 'parks, beaches and gardens'],
  ['food', 'food markets and famous local restaurants'],
  ['shopping', 'shopping streets and markets'],
  ['landmarks', 'landmarks and tourist attractions'],
  ['nightlife', 'bars and live music venues'],
  ['family', 'family attractions'],
]);

/** Tags implied by a place's Google types, plus the tag of the search that found it. */
export function interestsForPlace(placeTypes: readonly string[], foundBy: Iterable<InterestTag>): InterestTag[] {
  const tags = new Set<InterestTag>(foundBy);
  for (const placeType of placeTypes) {
    for (const tag of TAGS_BY_PLACE_TYPE.get(placeType) ?? []) {
      tags.add(tag);
    }
  }
  return INTEREST_TAGS.filter((tag) => tags.has(tag));
}

/** The longest typical visit among an activity's tags, so a museum-and-family place gets museum time. */
export function typicalVisitMinutes(interests: readonly InterestTag[]): number {
  const durations = interests.map((tag) => VISIT_MINUTES_BY_TAG.get(tag) ?? DEFAULT_VISIT_MINUTES);
  return durations.length === 0 ? DEFAULT_VISIT_MINUTES : Math.max(...durations);
}
