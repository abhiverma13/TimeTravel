export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Opening window on a weekday (0 = Sunday), in minutes after local midnight. */
export interface WeeklyWindow {
  day: number;
  openMinute: number;
  closeMinute: number;
}

/** An activity the planner may schedule. */
export interface Candidate {
  id: string;
  location: GeoPoint;
  interests: readonly string[];
  durationMinutes: number;
  /** Community score, 1 to 5. */
  score: number;
  /** null when hours are unknown: treated as open whenever the traveller is out. */
  openingHours: readonly WeeklyWindow[] | null;
}

export type Pace = 'relaxed' | 'moderate' | 'packed';
export const PACES: readonly Pace[] = ['relaxed', 'moderate', 'packed'];

export interface TripDay {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** 0 = Sunday. */
  weekday: number;
}

export interface PlanRequest {
  days: readonly TripDay[];
  dayStartMinute: number;
  dayEndMinute: number;
  /** Where each day starts and ends (the traveller's lodging). */
  origin: GeoPoint;
  interests: readonly string[];
  pace: Pace;
}

/** Minutes to travel between two points. */
export type TravelTimeEstimator = (from: GeoPoint, to: GeoPoint) => number;

export interface ScheduledStop {
  candidateId: string;
  startMinute: number;
  endMinute: number;
  /** Travel from the previous stop, or from the origin for the first stop. */
  travelMinutes: number;
}

export interface DayPlan {
  date: string;
  weekday: number;
  stops: ScheduledStop[];
  /** Travel from the last stop back to the origin. */
  returnTravelMinutes: number;
}

export interface TripPlan {
  days: DayPlan[];
  /** How many candidates survived pruning. */
  candidateCount: number;
  /** Pruned candidates that did not fit anywhere in the trip. */
  unscheduledCandidateIds: string[];
}
