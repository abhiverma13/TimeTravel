import { haversineKm } from './travelTime';
import type { Candidate, PlanRequest, WeeklyWindow } from './types';

/** Activities further than this from the lodging are not considered. */
export const MAX_DISTANCE_KM = 25;
/** The scheduler only sees the best K candidates: small enough to solve fast, large enough to stay interesting. */
export const MAX_CANDIDATES = 40;

const MATCHING_INTEREST_WEIGHT = 1.5;
const OTHER_INTEREST_WEIGHT = 0.5;

const ALWAYS_OPEN: readonly { openMinute: number; closeMinute: number }[] = [{ openMinute: 0, closeMinute: 24 * 60 }];

/** A candidate with the value the planner maximises: community score weighted by interest match. */
export interface RankedCandidate extends Candidate {
  utility: number;
}

/** The opening windows of a candidate on a weekday; unknown hours count as open all day. */
export function windowsOn(
  openingHours: readonly WeeklyWindow[] | null,
  weekday: number,
): readonly { openMinute: number; closeMinute: number }[] {
  return openingHours === null ? ALWAYS_OPEN : openingHours.filter((window) => window.day === weekday);
}

/**
 * Community score, boosted when the activity matches one of the traveller's interests.
 * With `interestShares` (a group), the boost grows with the share of members who picked the best
 * matching interest: all of them gives the full boost, as for a solo traveller; none gives the minimum.
 */
export function utilityOf(
  candidate: Candidate,
  interests: readonly string[],
  interestShares?: ReadonlyMap<string, number>,
): number {
  if (interestShares !== undefined) {
    if (interestShares.size === 0) {
      return candidate.score;
    }
    const share = Math.max(0, ...candidate.interests.map((interest) => interestShares.get(interest) ?? 0));
    return candidate.score * (OTHER_INTEREST_WEIGHT + share * (MATCHING_INTEREST_WEIGHT - OTHER_INTEREST_WEIGHT));
  }
  if (interests.length === 0) {
    return candidate.score;
  }
  const matches = candidate.interests.some((interest) => interests.includes(interest));
  return candidate.score * (matches ? MATCHING_INTEREST_WEIGHT : OTHER_INTEREST_WEIGHT);
}

/** True if the candidate is open long enough for a visit within the traveller's hours on some trip day. */
function fitsSomeDay(candidate: Candidate, request: PlanRequest): boolean {
  return request.days.some((day) =>
    windowsOn(candidate.openingHours, day.weekday).some((window) => {
      const start = Math.max(window.openMinute, day.startMinute ?? request.dayStartMinute);
      const end = Math.min(window.closeMinute, day.endMinute ?? request.dayEndMinute);
      return end - start >= candidate.durationMinutes;
    }),
  );
}

/**
 * Step 1 of the engine: shrink the problem before solving it. Drops candidates too far from the lodging
 * or never open during the trip, then keeps the top MAX_CANDIDATES by utility (ties broken by id).
 */
export function pruneCandidates(candidates: readonly Candidate[], request: PlanRequest): RankedCandidate[] {
  return candidates
    .filter((candidate) => haversineKm(request.origin, candidate.location) <= MAX_DISTANCE_KM)
    .filter((candidate) => fitsSomeDay(candidate, request))
    .map((candidate) => ({ ...candidate, utility: utilityOf(candidate, request.interests, request.interestShares) }))
    .sort((left, right) => right.utility - left.utility || left.id.localeCompare(right.id))
    .slice(0, MAX_CANDIDATES);
}
