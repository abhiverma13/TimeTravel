import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import { INTEREST_TAGS, type InterestTag } from '../activities/interests';
import { PACES, type Pace } from './engine/types';

export interface ItineraryStop {
  activityId: Types.ObjectId;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  interests: InterestTag[];
  /** HH:MM, local time at the destination. */
  startTime: string;
  endTime: string;
  /** Travel from the previous stop, or from the lodging for the first stop. */
  travelMinutes: number;
  communityScore: number;
  /** A locked stop stays in place when the day is re-planned. */
  locked: boolean;
}

export interface ItineraryDay {
  date: string;
  weekday: number;
  stops: ItineraryStop[];
  /** Travel from the last stop back to the lodging. */
  returnTravelMinutes: number;
}

export interface Lodging {
  label: string;
  lat: number;
  lng: number;
  /** "places" when found with Google Places, "city-centre" when the city's centre is used instead. */
  source: 'places' | 'city-centre';
}

/** A generated trip plan. The trip details are embedded so one document holds the whole itinerary. */
export interface Itinerary {
  /** Who generated it. */
  userId: Types.ObjectId;
  /** Set for a group trip: every member of the group can see it. Personal trips have none. */
  groupId?: Types.ObjectId | undefined;
  city: string;
  startDate: string;
  endDate: string;
  dayStart: string;
  dayEnd: string;
  /** HH:MM on the first day; the plan starts no earlier. */
  arrivalTime?: string | undefined;
  /** HH:MM on the last day; the plan ends by then. */
  departureTime?: string | undefined;
  interests: InterestTag[];
  pace: Pace;
  lodging: Lodging;
  days: ItineraryDay[];
  candidateCount: number;
  unscheduledCount: number;
  warnings: string[];
  generationMs: number;
  /** Bumped on every adjustment, so two people editing at once cannot overwrite each other. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = { lat: { type: Number, required: true }, lng: { type: Number, required: true } };

const stopSchema = new Schema<ItineraryStop>(
  {
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    name: { type: String, required: true },
    address: { type: String, default: '' },
    location: pointSchema,
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    travelMinutes: { type: Number, required: true },
    communityScore: { type: Number, required: true },
    locked: { type: Boolean, default: false },
  },
  { _id: false },
);

const daySchema = new Schema<ItineraryDay>(
  {
    date: { type: String, required: true },
    weekday: { type: Number, required: true },
    stops: { type: [stopSchema], default: [] },
    returnTravelMinutes: { type: Number, required: true },
  },
  { _id: false },
);

const itinerarySchema = new Schema<Itinerary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', index: true },
    city: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    dayStart: { type: String, required: true },
    dayEnd: { type: String, required: true },
    arrivalTime: { type: String },
    departureTime: { type: String },
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
    pace: { type: String, enum: PACES, required: true },
    lodging: {
      label: { type: String, required: true },
      ...pointSchema,
      source: { type: String, enum: ['places', 'city-centre'], required: true },
    },
    days: { type: [daySchema], default: [] },
    candidateCount: { type: Number, required: true },
    unscheduledCount: { type: Number, required: true },
    warnings: { type: [String], default: [] },
    generationMs: { type: Number, required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type ItineraryDocument = HydratedDocument<Itinerary>;
export const ItineraryModel = model<Itinerary>('Itinerary', itinerarySchema);
