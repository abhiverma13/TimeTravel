export const MINUTES_PER_DAY = 24 * 60;

/** One opening window on a weekday (0 = Sunday), in minutes after local midnight. */
export interface OpeningPeriod {
  day: number;
  openMinute: number;
  closeMinute: number;
}

/** A point in Google Places' `regularOpeningHours.periods` format. */
export interface PlacesPeriodPoint {
  day: number;
  hour: number;
  minute: number;
}

export interface PlacesPeriod {
  open: PlacesPeriodPoint;
  close?: PlacesPeriodPoint | undefined;
}

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

/**
 * Converts Google Places opening periods into per-weekday windows.
 * Returns null when Google has no hours, which the planner treats as "open whenever the traveller is out".
 * Windows that run past midnight are cut at midnight: a day plan never extends into the next day.
 */
export function toOpeningPeriods(periods: readonly PlacesPeriod[] | undefined): OpeningPeriod[] | null {
  if (periods === undefined || periods.length === 0) {
    return null;
  }
  const [first] = periods;
  if (periods.length === 1 && first?.close === undefined) {
    // Google's encoding of "open 24 hours".
    return ALL_WEEK.map((day) => ({ day, openMinute: 0, closeMinute: MINUTES_PER_DAY }));
  }
  return periods.map(({ open, close }) => {
    const openMinute = open.hour * 60 + open.minute;
    const closesSameDay = close !== undefined && close.day === open.day;
    const closeMinute = closesSameDay ? close.hour * 60 + close.minute : MINUTES_PER_DAY;
    return { day: open.day, openMinute, closeMinute: Math.max(closeMinute, openMinute) };
  });
}
