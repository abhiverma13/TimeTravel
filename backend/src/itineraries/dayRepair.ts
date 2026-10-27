import { Types } from 'mongoose';

import type { ActivityDto } from '../activities/activityService';
import { HttpError } from '../middleware/errorHandler';
import { repairDay } from './engine/adjust';
import { type RankedCandidate, windowsOn } from './engine/candidates';
import { type DayContext, type SimulatedDay, simulateDay } from './engine/daySchedule';
import type { Candidate } from './engine/types';
import type { ItineraryDay, ItineraryStop } from './itineraryModel';
import { clockFromMinutes, minutesFromClock } from './tripCalendar';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One change a traveller makes to a day of an itinerary. `version` is the itinerary version they last saw. */
export type ItineraryAdjustment =
  | { action: 'lock' | 'unlock' | 'remove'; version: number; dayIndex: number; activityId: string }
  | { action: 'move'; version: number; dayIndex: number; activityId: string; toIndex: number }
  | { action: 'replan'; version: number; dayIndex: number; fromTime?: string | undefined };

/** Everything needed to repair one day of a stored itinerary. */
export interface RepairInputs {
  day: ItineraryDay;
  /** The whole day's context: from the lodging, back to the lodging, within the day's hours. */
  context: DayContext;
  /** Ranked candidates for the trip (vetoed activities already left out), by activity id. */
  ranked: ReadonlyMap<string, RankedCandidate>;
  catalogue: ReadonlyMap<string, ActivityDto>;
  /** Activities scheduled on the trip's other days, which must not appear twice. */
  usedElsewhere: ReadonlySet<string>;
  maxStops: number;
}

export interface RepairedDay {
  stops: ItineraryStop[];
  returnTravelMinutes: number;
  /** What changed, said after the traveller's name: "removed Stanley Park Seawall". */
  summary: string;
}

export const STALE_ITINERARY = 'This itinerary changed since you loaded it; reload it and try again';

export function toCandidate(activity: ActivityDto): Candidate {
  return {
    id: activity.id,
    location: activity.location,
    interests: activity.interests,
    durationMinutes: activity.durationMinutes,
    score: activity.communityScore,
    openingHours: activity.openingHours,
  };
}

/**
 * A locked stop keeps its start time: its only opening window becomes its current visit, if that visit is inside the
 * place's real opening hours, and none otherwise. The day is then repaired around it rather than moving it.
 */
function pinned(candidate: RankedCandidate, stop: ItineraryStop, weekday: number): RankedCandidate {
  const openMinute = minutesFromClock(stop.startTime);
  const closeMinute = openMinute + candidate.durationMinutes;
  const fits = windowsOn(candidate.openingHours, weekday).some((window) => window.openMinute <= openMinute && closeMinute <= window.closeMinute);
  return { ...candidate, openingHours: fits ? [{ day: weekday, openMinute, closeMinute }] : [] };
}

/** The candidate for a stop already in the plan (pinned in time if `pin`), even if it has left the ranked candidates. */
function candidateFor(stop: ItineraryStop, inputs: RepairInputs, pin = false): RankedCandidate {
  const candidate = unpinnedCandidateFor(stop, inputs);
  return pin ? pinned(candidate, stop, inputs.context.weekday) : candidate;
}

function unpinnedCandidateFor(stop: ItineraryStop, inputs: RepairInputs): RankedCandidate {
  const id = stop.activityId.toString();
  const ranked = inputs.ranked.get(id);
  if (ranked) {
    return ranked;
  }
  const activity = inputs.catalogue.get(id);
  const candidate: Candidate = activity
    ? toCandidate(activity)
    : {
        id,
        location: stop.location,
        interests: stop.interests,
        durationMinutes: minutesFromClock(stop.endTime) - minutesFromClock(stop.startTime),
        score: stop.communityScore,
        openingHours: null,
      };
  return { ...candidate, utility: candidate.score };
}

/** Timed stops for a simulated route, keeping each kept stop's details and lock. */
function timedStops(simulation: SimulatedDay, inputs: RepairInputs, previous: readonly ItineraryStop[]): ItineraryStop[] {
  const previousById = new Map(previous.map((stop) => [stop.activityId.toString(), stop]));
  return simulation.stops.map((scheduled) => {
    const before = previousById.get(scheduled.candidateId);
    const activity = inputs.catalogue.get(scheduled.candidateId);
    return {
      activityId: new Types.ObjectId(scheduled.candidateId),
      name: activity?.name ?? before?.name ?? '',
      address: activity?.address ?? before?.address ?? '',
      location: activity?.location ?? before?.location ?? { lat: 0, lng: 0 },
      interests: activity?.interests ?? before?.interests ?? [],
      startTime: clockFromMinutes(scheduled.startMinute),
      endTime: clockFromMinutes(scheduled.endMinute),
      travelMinutes: scheduled.travelMinutes,
      communityScore: activity?.communityScore ?? before?.communityScore ?? 0,
      locked: before?.locked ?? false,
    };
  });
}

function stopIndex(day: ItineraryDay, activityId: string): number {
  const index = day.stops.findIndex((stop) => stop.activityId.toString() === activityId);
  if (index === -1) {
    throw new HttpError(404, 'That stop is not in this day');
  }
  return index;
}

function freePool(inputs: RepairInputs, excluded: ReadonlySet<string>): RankedCandidate[] {
  return [...inputs.ranked.values()].filter((candidate) => !inputs.usedElsewhere.has(candidate.id) && !excluded.has(candidate.id));
}

function setLock(inputs: RepairInputs, activityId: string, locked: boolean): RepairedDay {
  const index = stopIndex(inputs.day, activityId);
  const stops = inputs.day.stops.map((stop, position) => (position === index ? { ...stop, locked } : stop));
  const name = stops.at(index)?.name ?? '';
  return { stops, returnTravelMinutes: inputs.day.returnTravelMinutes, summary: `${locked ? 'locked' : 'unlocked'} ${name}` };
}

/** Removes the stop, keeps the others in order, and offers the freed time to other activities. */
function removeStop(inputs: RepairInputs, activityId: string): RepairedDay {
  const index = stopIndex(inputs.day, activityId);
  const removed = inputs.day.stops.at(index);
  const kept = inputs.day.stops.filter((_, position) => position !== index);
  const pool = freePool(inputs, new Set([activityId]));
  const day = repairDay(kept.map((stop) => candidateFor(stop, inputs, stop.locked)), pool, inputs.context, { maxStops: inputs.maxStops, reorder: false });
  if (day === null) {
    throw new HttpError(422, 'The rest of the day no longer fits; re-plan the day instead');
  }
  return {
    stops: timedStops(day.simulation, inputs, kept),
    returnTravelMinutes: day.simulation.returnTravelMinutes,
    summary: `removed ${removed?.name ?? ''}`,
  };
}

/** Moves the stop to another position and re-times the day; refused if anything would then miss its hours. */
function moveStop(inputs: RepairInputs, activityId: string, toIndex: number): RepairedDay {
  const index = stopIndex(inputs.day, activityId);
  if (toIndex >= inputs.day.stops.length) {
    throw new HttpError(400, 'toIndex is out of range');
  }
  const moved = inputs.day.stops.at(index);
  const others = inputs.day.stops.filter((_, position) => position !== index);
  const order = moved ? [...others.slice(0, toIndex), moved, ...others.slice(toIndex)] : others;
  // Other locked stops keep their times; the moved stop itself goes wherever it is put.
  const simulation = simulateDay(order.map((stop) => candidateFor(stop, inputs, stop.locked && stop !== moved)), inputs.context);
  if (simulation === null) {
    throw new HttpError(422, `${moved?.name ?? 'That stop'} cannot go there: a stop would miss its opening hours or the day would run late`);
  }
  return {
    stops: timedStops(simulation, inputs, inputs.day.stops),
    returnTravelMinutes: simulation.returnTravelMinutes,
    summary: `moved ${moved?.name ?? ''}`,
  };
}

/**
 * Re-plans the day from `fromTime` (default: the start of the day). Stops already started stay as they are;
 * later locked stops stay in order; everything else is re-chosen, ending back at the lodging.
 */
function replanDay(inputs: RepairInputs, fromTime: string | undefined): RepairedDay {
  const fromMinute = fromTime === undefined ? inputs.context.dayStartMinute : minutesFromClock(fromTime);
  const started = inputs.day.stops.filter((stop) => minutesFromClock(stop.startTime) < fromMinute);
  const lockedLater = inputs.day.stops.filter((stop) => minutesFromClock(stop.startTime) >= fromMinute && stop.locked);
  const last = started.at(-1);
  const context: DayContext = {
    ...inputs.context,
    dayStartMinute: Math.max(fromMinute, last ? minutesFromClock(last.endTime) : inputs.context.dayStartMinute),
    origin: last ? last.location : inputs.context.origin,
    returnTo: inputs.context.origin,
  };
  const pool = freePool(inputs, new Set(started.map((stop) => stop.activityId.toString())));
  const rest = repairDay(lockedLater.map((stop) => candidateFor(stop, inputs, true)), pool, context, {
    maxStops: Math.max(inputs.maxStops - started.length, 0),
    reorder: true,
  });
  if (rest === null) {
    throw new HttpError(422, 'Your locked stops no longer fit the rest of the day; unlock one and try again');
  }
  const homeFromLast = last ? inputs.context.travelMinutes(last.location, inputs.context.origin) : 0;
  const weekday = WEEKDAY_NAMES.at(inputs.day.weekday) ?? 'the day';
  return {
    stops: [...started, ...timedStops(rest.simulation, inputs, inputs.day.stops)],
    returnTravelMinutes: rest.route.length > 0 ? rest.simulation.returnTravelMinutes : homeFromLast,
    summary: fromTime === undefined ? `re-planned ${weekday}` : `re-planned ${weekday} from ${fromTime}`,
  };
}

/** Applies one adjustment to a day and returns the new day. */
export function applyAdjustment(change: ItineraryAdjustment, inputs: RepairInputs): RepairedDay {
  switch (change.action) {
    case 'lock':
    case 'unlock':
      return setLock(inputs, change.activityId, change.action === 'lock');
    case 'remove':
      return removeStop(inputs, change.activityId);
    case 'move':
      return moveStop(inputs, change.activityId, change.toIndex);
    case 'replan':
      return replanDay(inputs, change.fromTime);
  }
}
