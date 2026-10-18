import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import {
  BEST_TIMES,
  COST_LEVELS,
  MAX_REPORTED_DURATION,
  MIN_REPORTED_DURATION,
  type ReviewTags,
  SETTINGS,
} from './reviewTags';

export const MAX_REVIEW_COMMENT_LENGTH = 500;

export interface Review {
  activityId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Whole stars, 1 to 5. */
  rating: number;
  comment: string;
  tags: ReviewTags;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<Review>(
  {
    activityId: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: MAX_REVIEW_COMMENT_LENGTH },
    tags: {
      durationMinutes: { type: Number, min: MIN_REPORTED_DURATION, max: MAX_REPORTED_DURATION },
      bestTimeOfDay: { type: String, enum: BEST_TIMES },
      cost: { type: String, enum: COST_LEVELS },
      setting: { type: String, enum: SETTINGS },
    },
  },
  { timestamps: true },
);
// One review per traveller per activity; reviewing again edits it.
reviewSchema.index({ activityId: 1, userId: 1 }, { unique: true });

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewModel = model<Review>('Review', reviewSchema);

export interface ReviewDto {
  id: string;
  activityId: string;
  rating: number;
  comment: string;
  tags: ReviewTags;
  updatedAt: string;
}

export function toReviewDto(review: ReviewDocument): ReviewDto {
  return {
    id: review._id.toString(),
    activityId: review.activityId.toString(),
    rating: review.rating,
    comment: review.comment,
    tags: reviewTagsOf(review),
    updatedAt: review.updatedAt.toISOString(),
  };
}

/** A review's tags as a plain object holding only the tags the traveller set. */
export function reviewTagsOf(review: ReviewDocument): ReviewTags {
  const { durationMinutes, bestTimeOfDay, cost, setting } = review.tags;
  const tags: ReviewTags = {};
  if (durationMinutes !== undefined) {
    tags.durationMinutes = durationMinutes;
  }
  if (bestTimeOfDay !== undefined) {
    tags.bestTimeOfDay = bestTimeOfDay;
  }
  if (cost !== undefined) {
    tags.cost = cost;
  }
  if (setting !== undefined) {
    tags.setting = setting;
  }
  return tags;
}
