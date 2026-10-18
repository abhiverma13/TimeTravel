/** Structured tags a traveller can attach to a review, alongside the star rating. */
export const BEST_TIMES = ['morning', 'afternoon', 'evening'] as const;
export const COST_LEVELS = ['free', 'low', 'medium', 'high'] as const;
export const SETTINGS = ['indoor', 'outdoor'] as const;

export type BestTime = (typeof BEST_TIMES)[number];
export type CostLevel = (typeof COST_LEVELS)[number];
export type Setting = (typeof SETTINGS)[number];

/** Every tag value; they are distinct across categories, so each has one counter on the activity. */
export const TAG_VALUES = [...BEST_TIMES, ...COST_LEVELS, ...SETTINGS] as const;
export type TagValue = (typeof TAG_VALUES)[number];

export const MIN_REPORTED_DURATION = 15;
export const MAX_REPORTED_DURATION = 480;
/** Travellers' reported visit length replaces the typical one once this many have reported it. */
export const MIN_DURATION_REPORTS = 2;
const DURATION_ROUNDING_MINUTES = 15;

export interface ReviewTags {
  durationMinutes?: number | undefined;
  bestTimeOfDay?: BestTime | undefined;
  cost?: CostLevel | undefined;
  setting?: Setting | undefined;
}

/** The most-reported value of each tag across an activity's reviews (null until someone reports it). */
export interface CommunityTags {
  bestTimeOfDay: BestTime | null;
  cost: CostLevel | null;
  setting: Setting | null;
}

function mostReported<T extends TagValue>(values: readonly T[], counts: ReadonlyMap<string, number>): T | null {
  let best: T | null = null;
  let bestCount = 0;
  for (const value of values) {
    const count = counts.get(value) ?? 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function communityTags(counts: ReadonlyMap<string, number>): CommunityTags {
  return {
    bestTimeOfDay: mostReported(BEST_TIMES, counts),
    cost: mostReported(COST_LEVELS, counts),
    setting: mostReported(SETTINGS, counts),
  };
}

/** The travellers' average visit length (to the nearest 15 minutes), or `typical` until enough have reported. */
export function visitMinutes(reportedSum: number, reportedCount: number, typical: number): number {
  if (reportedCount < MIN_DURATION_REPORTS) {
    return typical;
  }
  const rounded = Math.round(reportedSum / reportedCount / DURATION_ROUNDING_MINUTES) * DURATION_ROUNDING_MINUTES;
  return Math.max(DURATION_ROUNDING_MINUTES, rounded);
}

/**
 * The activity counter changes ($inc entries) for replacing a review's tags with new ones:
 * the previous tags (if the traveller is editing a review) are taken back and the new ones added.
 */
export function tagCounterChanges(previous: ReviewTags | null, next: ReviewTags): Map<string, number> {
  const changes = new Map<string, number>();
  const add = (field: string, amount: number): void => {
    changes.set(field, (changes.get(field) ?? 0) + amount);
  };
  const apply = (tags: ReviewTags, sign: number): void => {
    if (tags.durationMinutes !== undefined) {
      add('reportedDurationSum', sign * tags.durationMinutes);
      add('reportedDurationCount', sign);
    }
    for (const value of [tags.bestTimeOfDay, tags.cost, tags.setting]) {
      if (value !== undefined) {
        add(`tagCounts.${value}`, sign);
      }
    }
  };
  if (previous !== null) {
    apply(previous, -1);
  }
  apply(next, 1);
  return changes;
}
