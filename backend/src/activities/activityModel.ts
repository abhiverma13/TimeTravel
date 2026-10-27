import { type HydratedDocument, Schema, model } from 'mongoose';

import { INTEREST_TAGS, type InterestTag } from './interests';
import type { OpeningPeriod } from './openingHours';
import { COST_LEVELS, type CostLevel, TAG_VALUES, type TagValue } from './reviewTags';

export interface Activity {
  placeId: string;
  cityKey: string;
  name: string;
  address: string;
  /** GeoJSON point: coordinates are [longitude, latitude]. */
  location: { type: 'Point'; coordinates: number[] };
  interests: InterestTag[];
  durationMinutes: number;
  googleRating: number | null;
  googleRatingCount: number;
  /** Google's price level, when it has one. */
  priceLevel?: CostLevel | undefined;
  /** null means Google has no hours for this place. */
  openingHours: OpeningPeriod[] | null;
  reviewCount: number;
  reviewRatingSum: number;
  /** Sum and count of the visit lengths travellers reported in reviews. */
  reportedDurationSum: number;
  reportedDurationCount: number;
  /** How many reviews carry each structured tag value. */
  tagCounts: Record<TagValue, number>;
}

const openingPeriodSchema = new Schema<OpeningPeriod>(
  {
    day: { type: Number, required: true, min: 0, max: 6 },
    openMinute: { type: Number, required: true, min: 0, max: 1440 },
    closeMinute: { type: Number, required: true, min: 0, max: 1440 },
  },
  { _id: false },
);

const activitySchema = new Schema<Activity>(
  {
    placeId: { type: String, required: true, unique: true },
    cityKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    address: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true },
    },
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
    durationMinutes: { type: Number, required: true, min: 1 },
    googleRating: { type: Number, default: null },
    googleRatingCount: { type: Number, default: 0 },
    priceLevel: { type: String, enum: COST_LEVELS },
    openingHours: { type: [openingPeriodSchema], default: null },
    reviewCount: { type: Number, default: 0 },
    reviewRatingSum: { type: Number, default: 0 },
    reportedDurationSum: { type: Number, default: 0 },
    reportedDurationCount: { type: Number, default: 0 },
    tagCounts: Object.fromEntries(TAG_VALUES.map((value) => [value, { type: Number, default: 0 }])),
  },
  { timestamps: true },
);
activitySchema.index({ location: '2dsphere' });

export type ActivityDocument = HydratedDocument<Activity>;
export const ActivityModel = model<Activity>('Activity', activitySchema);

/** Records when a city's catalogue was last pulled from Google Places, for cache expiry. */
export interface CityCatalogue {
  cityKey: string;
  displayName: string;
  fetchedAt: Date;
  meanRating: number;
  activityCount: number;
}

const cityCatalogueSchema = new Schema<CityCatalogue>({
  cityKey: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  fetchedAt: { type: Date, required: true },
  meanRating: { type: Number, required: true },
  activityCount: { type: Number, required: true },
});

export const CityCatalogueModel = model<CityCatalogue>('CityCatalogue', cityCatalogueSchema);

/** Case- and whitespace-insensitive key, so "vancouver " and "Vancouver" share one catalogue. */
export function toCityKey(city: string): string {
  return city.trim().replace(/\s+/g, ' ').toLowerCase();
}
