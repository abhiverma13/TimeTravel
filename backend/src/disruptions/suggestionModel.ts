import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import { type ItineraryDay, daySchema } from '../itineraries/itineraryModel';

export const SUGGESTION_REASONS = ['rain', 'closed'] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];
export const SUGGESTION_STATUSES = ['pending', 'accepted', 'dismissed', 'expired'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/**
 * A change the Trip Sync & Disruption Service proposes for a day after a disruption (rain on an outdoor stop, or a
 * closed venue). Nothing changes until a member accepts it.
 */
export interface Suggestion {
  itineraryId: Types.ObjectId;
  dayIndex: number;
  /** The disrupted stop. */
  activityId: Types.ObjectId;
  activityName: string;
  reason: SuggestionReason;
  /** What the members read: "Rain is likely at 14:00 during Harbour Park. Swap it for Town Museum?" */
  message: string;
  /** What the others are told if it is accepted: "swapped Harbour Park for Town Museum". */
  summary: string;
  /** The day as it would be, and the itinerary version it was worked out from. */
  day: ItineraryDay;
  basedOnVersion: number;
  status: SuggestionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const suggestionSchema = new Schema<Suggestion>(
  {
    itineraryId: { type: Schema.Types.ObjectId, ref: 'Itinerary', required: true },
    dayIndex: { type: Number, required: true },
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    activityName: { type: String, required: true },
    reason: { type: String, enum: SUGGESTION_REASONS, required: true },
    message: { type: String, required: true },
    summary: { type: String, required: true },
    day: { type: daySchema, required: true },
    basedOnVersion: { type: Number, required: true },
    status: { type: String, enum: SUGGESTION_STATUSES, default: 'pending' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
suggestionSchema.index({ itineraryId: 1, status: 1, activityId: 1 });

export type SuggestionDocument = HydratedDocument<Suggestion>;
export const SuggestionModel = model<Suggestion>('Suggestion', suggestionSchema);
