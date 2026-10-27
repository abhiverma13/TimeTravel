import type { TripDay } from './engine/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function utcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** True for a real calendar date written YYYY-MM-DD (so 2026-02-30 is rejected). */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(utcMidnight(value).getTime()) && utcMidnight(value).toISOString().startsWith(value);
}

/** True for a 24-hour clock time written HH:MM. */
export function isClockTime(value: string): boolean {
  return CLOCK_TIME.test(value);
}

/** "09:30" becomes 570 minutes after midnight. */
export function minutesFromClock(clockTime: string): number {
  const [hours = 0, minutes = 0] = clockTime.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 570 minutes after midnight becomes "09:30". */
export function clockFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Number of days from startDate to endDate inclusive (1 for a same-day trip). */
export function tripLengthDays(startDate: string, endDate: string): number {
  return Math.round((utcMidnight(endDate).getTime() - utcMidnight(startDate).getTime()) / MS_PER_DAY) + 1;
}

/** The date `days` days after `isoDate`, written YYYY-MM-DD. */
export function addDays(isoDate: string, days: number): string {
  return new Date(utcMidnight(isoDate).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Every date of the trip with its weekday (0 = Sunday). Dates are the destination's local dates. */
export function tripDays(startDate: string, endDate: string): TripDay[] {
  const start = utcMidnight(startDate).getTime();
  return Array.from({ length: tripLengthDays(startDate, endDate) }, (_, offset) => {
    const date = new Date(start + offset * MS_PER_DAY);
    return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay() };
  });
}
