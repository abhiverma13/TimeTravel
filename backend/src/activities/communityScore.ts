/** How many "average" ratings every activity starts with, pulling sparse scores toward the city mean. */
export const SHRINKAGE_WEIGHT = 5;
/** Google's aggregate rating counts as at most this many votes, so TimeTravel reviews still move the score. */
export const GOOGLE_PRIOR_MAX_WEIGHT = 20;
/** Used when no activity in the city has a Google rating yet. */
export const DEFAULT_CITY_MEAN_RATING = 4;

export interface ScoreInputs {
  googleRating: number | null;
  googleRatingCount: number;
  reviewCount: number;
  reviewRatingSum: number;
  /** Verified reviews (already in reviewCount and reviewRatingSum) count once more, so twice in all. */
  verifiedReviewCount?: number;
  verifiedRatingSum?: number;
}

/**
 * Bayesian average of the city mean, Google's rating (as a capped prior) and TimeTravel reviews, verified ones counting
 * double, so one 5-star review cannot outrank a well-reviewed landmark. Rounded to two decimals.
 */
export function communityScore(inputs: ScoreInputs, cityMeanRating: number): number {
  const googleWeight = inputs.googleRating === null ? 0 : Math.min(inputs.googleRatingCount, GOOGLE_PRIOR_MAX_WEIGHT);
  const weightedSum =
    SHRINKAGE_WEIGHT * cityMeanRating + (inputs.googleRating ?? 0) * googleWeight + inputs.reviewRatingSum + (inputs.verifiedRatingSum ?? 0);
  const totalWeight = SHRINKAGE_WEIGHT + googleWeight + inputs.reviewCount + (inputs.verifiedReviewCount ?? 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/** Mean Google rating across a city's rated activities. */
export function cityMeanRating(ratings: readonly (number | null)[]): number {
  const known = ratings.filter((rating): rating is number => rating !== null);
  if (known.length === 0) {
    return DEFAULT_CITY_MEAN_RATING;
  }
  return known.reduce((sum, rating) => sum + rating, 0) / known.length;
}
