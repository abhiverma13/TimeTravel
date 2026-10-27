import { z } from 'zod';

import type { PlacesPeriod } from './openingHours';
import type { CostLevel } from './reviewTags';

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours.periods',
  'places.priceLevel',
].join(',');
const PLACES_PAGE_SIZE = 20;
const PLACES_TIMEOUT_MS = 10_000;

/** A place returned by Google Places, reduced to the fields TimeTravel stores. */
export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  types: string[];
  rating: number | null;
  userRatingCount: number;
  openingPeriods: PlacesPeriod[] | undefined;
  /** Google's price level, on the same scale as travellers' cost tags; absent when Google has none. */
  priceLevel?: CostLevel | undefined;
}

/** Whether a place is open for business, as Google reports it. */
export const BUSINESS_STATUSES = ['OPERATIONAL', 'CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY'] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/** External module boundary for Google Places, so tests and the demo seed can substitute it. */
export interface PlacesClient {
  searchText(query: string): Promise<PlaceResult[]>;
  /** The place's business status, or null when Google does not say; optional so clients can leave it out. */
  businessStatus?(placeId: string): Promise<BusinessStatus | null>;
}

export class PlacesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlacesApiError';
  }
}

const periodPointSchema = z.object({
  day: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(24),
  minute: z.number().int().min(0).max(59),
});

const PRICE_LEVELS: ReadonlyMap<string, CostLevel> = new Map<string, CostLevel>([
  ['PRICE_LEVEL_FREE', 'free'],
  ['PRICE_LEVEL_INEXPENSIVE', 'low'],
  ['PRICE_LEVEL_MODERATE', 'medium'],
  ['PRICE_LEVEL_EXPENSIVE', 'high'],
  ['PRICE_LEVEL_VERY_EXPENSIVE', 'high'],
]);

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  types: z.array(z.string()).optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  regularOpeningHours: z
    .object({ periods: z.array(z.object({ open: periodPointSchema, close: periodPointSchema.optional() })).optional() })
    .optional(),
});

const searchResponseSchema = z.object({ places: z.array(placeSchema).optional() });

const statusResponseSchema = z.object({ businessStatus: z.enum(BUSINESS_STATUSES).optional() });

/** Calls Places API (New) Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search */
export class GooglePlacesClient implements PlacesClient {
  constructor(private readonly apiKey: string) {}

  async searchText(query: string): Promise<PlaceResult[]> {
    const response = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: PLACES_PAGE_SIZE }),
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new PlacesApiError(`Places text search failed with HTTP ${String(response.status)}`);
    }
    const parsed = searchResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new PlacesApiError('Places text search returned an unexpected response');
    }
    return (parsed.data.places ?? []).flatMap((place) => {
      if (place.location === undefined || place.displayName === undefined) {
        return [];
      }
      return [
        {
          placeId: place.id,
          name: place.displayName.text,
          address: place.formattedAddress ?? '',
          location: { lat: place.location.latitude, lng: place.location.longitude },
          types: place.types ?? [],
          rating: place.rating ?? null,
          userRatingCount: place.userRatingCount ?? 0,
          openingPeriods: place.regularOpeningHours?.periods,
          priceLevel: place.priceLevel === undefined ? undefined : PRICE_LEVELS.get(place.priceLevel),
        },
      ];
    });
  }

  /** Place Details with only the business status: https://developers.google.com/maps/documentation/places/web-service/place-details */
  async businessStatus(placeId: string): Promise<BusinessStatus | null> {
    const response = await fetch(`${PLACE_DETAILS_URL}${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'businessStatus' },
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new PlacesApiError(`Place details failed with HTTP ${String(response.status)}`);
    }
    const parsed = statusResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new PlacesApiError('Place details returned an unexpected response');
    }
    return parsed.data.businessStatus ?? null;
  }
}
