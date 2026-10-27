import type { ActivityDto } from '../activities/activityService';
import type { CostLevel } from '../activities/reviewTags';

/** How much a traveller wants to spend per activity: any, low ($: free or cheap), or medium ($$: nothing expensive). */
export const BUDGETS = ['any', 'low', 'medium'] as const;
export type Budget = (typeof BUDGETS)[number];

const ALLOWED_COSTS: ReadonlyMap<Budget, readonly CostLevel[]> = new Map<Budget, readonly CostLevel[]>([
  ['low', ['free', 'low']],
  ['medium', ['free', 'low', 'medium']],
]);

/** True if the activity fits the budget; activities with no known cost always do. */
export function withinBudget(activity: ActivityDto, budget: Budget): boolean {
  const allowed = ALLOWED_COSTS.get(budget);
  return allowed === undefined || activity.cost === null || allowed.includes(activity.cost);
}

export interface CandidateFilter {
  budget: Budget;
  /** The traveller's own avoid list and the group's vetoes. */
  excludedIds: ReadonlySet<string>;
}

/** The activities the planner may choose from: within budget, and neither avoided nor vetoed. */
export function selectActivities(catalogue: readonly ActivityDto[], filter: CandidateFilter): ActivityDto[] {
  return catalogue.filter((activity) => !filter.excludedIds.has(activity.id) && withinBudget(activity, filter.budget));
}
