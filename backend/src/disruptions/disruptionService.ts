import { Types, isValidObjectId } from 'mongoose';

import { ActivityModel } from '../activities/activityModel';
import type { ActivityDto } from '../activities/activityService';
import type { PlacesClient } from '../activities/placesClient';
import type { RankedCandidate } from '../itineraries/engine/candidates';
import { type ItineraryDocument, ItineraryModel } from '../itineraries/itineraryModel';
import type { ItineraryDto, ItineraryService } from '../itineraries/itineraryService';
import { HttpError } from '../middleware/errorHandler';
import { type SuggestionDocument, SuggestionModel, type SuggestionReason } from './suggestionModel';
import type { Forecast, WeatherClient } from './weatherClient';

/** How often the timer checks active trips. */
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_SECOND = 1000;
/** Stops starting within this time are checked. */
const LOOKAHEAD_MS = 36 * MS_PER_HOUR;
/** A suggestion nobody answers lapses after this long. */
const SUGGESTION_LIFETIME_MS = 12 * MS_PER_HOUR;
/** A venue's status is asked of Google at most this often. */
const STATUS_TTL_MS = 6 * MS_PER_HOUR;
/** Rain is "likely" from this probability of precipitation up. */
export const RAIN_LIKELY = 0.6;
const WET_CONDITIONS = new Set(['Rain', 'Drizzle', 'Thunderstorm', 'Snow']);
const STALE_SUGGESTION = 'The trip changed since this suggestion; it no longer applies';

export interface SuggestionDto {
  id: string;
  itineraryId: string;
  dayIndex: number;
  date: string;
  activityId: string;
  activityName: string;
  reason: SuggestionReason;
  message: string;
  /** The day's stops if accepted, in order. */
  proposedStops: string[];
  createdAt: string;
  expiresAt: string;
}

export type SuggestionListener = (suggestion: SuggestionDto) => void;

/** A stop the timer looks at, with when it starts and ends in UTC. */
interface UpcomingStop {
  dayIndex: number;
  activityId: string;
  name: string;
  startTime: string;
  outdoor: boolean;
  start: number;
  end: number;
}

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function toDto(suggestion: SuggestionDocument): SuggestionDto {
  return {
    id: suggestion._id.toString(),
    itineraryId: suggestion.itineraryId.toString(),
    dayIndex: suggestion.dayIndex,
    date: suggestion.day.date,
    activityId: suggestion.activityId.toString(),
    activityName: suggestion.activityName,
    reason: suggestion.reason,
    message: suggestion.message,
    proposedStops: suggestion.day.stops.map((stop) => stop.name),
    createdAt: suggestion.createdAt.toISOString(),
    expiresAt: suggestion.expiresAt.toISOString(),
  };
}

/** Whether rain is likely in any forecast slot overlapping [start, end). */
export function rainDuring(forecast: Forecast, start: number, end: number): boolean {
  return forecast.slots.some(
    (slot) => slot.start.getTime() < end && slot.end.getTime() > start && (slot.precipitationChance >= RAIN_LIKELY || WET_CONDITIONS.has(slot.condition)),
  );
}

/** Indoors, as travellers tagged it, or else anything not listed under outdoors. */
export function isIndoor(candidate: RankedCandidate, activity: ActivityDto | undefined): boolean {
  const setting = activity?.communityTags.setting ?? null;
  return setting === 'indoor' || (setting === null && !candidate.interests.includes('outdoors'));
}

// The trip's stops starting within the next 36 hours. Stop times are local, so they are shifted by the forecast's UTC
// offset when there is one.
function upcomingStops(trip: ItineraryDocument, now: number, utcOffsetSeconds: number): UpcomingStop[] {
  return trip.days.flatMap((day, dayIndex) =>
    day.stops.flatMap((stop) => {
      const start = Date.parse(`${day.date}T${stop.startTime}:00Z`) - utcOffsetSeconds * MS_PER_SECOND;
      const end = Date.parse(`${day.date}T${stop.endTime}:00Z`) - utcOffsetSeconds * MS_PER_SECOND;
      const upcoming = start > now && start - now <= LOOKAHEAD_MS;
      return upcoming
        ? [{ dayIndex, activityId: stop.activityId.toString(), name: stop.name, startTime: stop.startTime, outdoor: stop.interests.includes('outdoors'), start, end }]
        : [];
    }),
  );
}

/**
 * Trip Sync & Disruption Service, disruptions: on a timer, checks the forecast and venue status for the stops of trips
 * under way, and proposes a change for a disrupted stop (an indoor activity instead of an outdoor one in the rain, or
 * another activity instead of a closed venue). Proposals reach the members live; nothing changes until one accepts.
 */
export class DisruptionService {
  private readonly listeners: SuggestionListener[] = [];

  constructor(
    private readonly itineraryService: ItineraryService,
    private readonly weatherClient: WeatherClient | null,
    private readonly placesClient: PlacesClient | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  onSuggestion(listener: SuggestionListener): void {
    this.listeners.push(listener);
  }

  /** Checks every trip under way (yesterday to two days ahead, to allow for time zones); returns how many suggestions it made. */
  async checkActiveTrips(): Promise<number> {
    const now = this.now().getTime();
    const trips = await ItineraryModel.find({ endDate: { $gte: isoDay(now - MS_PER_DAY) }, startDate: { $lte: isoDay(now + 2 * MS_PER_DAY) } });
    let made = 0;
    for (const trip of trips) {
      try {
        made += await this.checkTrip(trip, now);
      } catch (error) {
        // One trip's failure must not stop the others being checked.
        console.error('Disruption check failed for an itinerary', error);
      }
    }
    return made;
  }

  /**
   * Proposes a change for one disrupted stop and pushes it to the trip's members, unless one is already waiting for that
   * stop or no change fits. Returns whether it made one.
   */
  async suggest(itineraryId: Types.ObjectId, dayIndex: number, activityId: string, reason: SuggestionReason): Promise<boolean> {
    const now = this.now();
    const waiting = await SuggestionModel.countDocuments({ itineraryId, activityId: new Types.ObjectId(activityId), status: 'pending', expiresAt: { $gt: now } });
    const proposal = waiting > 0 ? null : await this.itineraryService.proposeReplacement(itineraryId, dayIndex, activityId, reason === 'rain' ? isIndoor : () => true);
    const trip = proposal ? await ItineraryModel.findById(itineraryId) : null;
    const disrupted = trip?.days.at(dayIndex)?.stops.find((stop) => stop.activityId.toString() === activityId);
    if (!proposal || !disrupted) {
      return false;
    }
    const before = new Set(trip?.days.at(dayIndex)?.stops.map((stop) => stop.name));
    const added = proposal.day.stops.map((stop) => stop.name).filter((name) => !before.has(name));
    const problem = reason === 'rain' ? `Rain is likely at ${disrupted.startTime} during ${disrupted.name}.` : `${disrupted.name} is closed.`;
    const suggestion = await SuggestionModel.create({
      itineraryId,
      dayIndex,
      activityId: disrupted.activityId,
      activityName: disrupted.name,
      reason,
      message: added.length > 0 ? `${problem} Swap it for ${added.join(' and ')}?` : `${problem} Take it out and keep the time free?`,
      summary: added.length > 0 ? `swapped ${disrupted.name} for ${added.join(' and ')}` : `took ${disrupted.name} out`,
      day: proposal.day,
      basedOnVersion: proposal.version,
      expiresAt: new Date(now.getTime() + SUGGESTION_LIFETIME_MS),
    });
    const dto = toDto(suggestion);
    for (const listener of this.listeners) {
      try {
        listener(dto);
      } catch (error) {
        console.error('Failed to push a suggestion', error);
      }
    }
    return true;
  }

  /** The trip's suggestions still waiting for an answer, oldest first; ones the trip has moved past are left out. */
  async listSuggestions(userId: string, itineraryId: string): Promise<SuggestionDto[]> {
    const itinerary = await this.itineraryService.getItinerary(userId, itineraryId);
    const suggestions = await SuggestionModel.find({
      itineraryId: new Types.ObjectId(itinerary.id),
      status: 'pending',
      basedOnVersion: itinerary.version,
      expiresAt: { $gt: this.now() },
    }).sort({ createdAt: 1, _id: 1 });
    return suggestions.map(toDto);
  }

  /** A member accepts: the proposed day is saved (if the trip has not changed since) and every member sees it live. */
  async accept(userId: string, suggestionId: string): Promise<ItineraryDto> {
    const suggestion = await this.requirePending(userId, suggestionId);
    try {
      const itinerary = await this.itineraryService.applyProposedDay(
        userId,
        suggestion.itineraryId.toString(),
        { version: suggestion.basedOnVersion, day: suggestion.toObject().day },
        suggestion.dayIndex,
        `accepted a suggestion: ${suggestion.summary}`,
      );
      suggestion.status = 'accepted';
      await suggestion.save();
      return itinerary;
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        suggestion.status = 'expired';
        await suggestion.save();
        throw new HttpError(409, STALE_SUGGESTION);
      }
      throw error;
    }
  }

  /** A member turns the suggestion down; the trip stays as it is. */
  async dismiss(userId: string, suggestionId: string): Promise<void> {
    const suggestion = await this.requirePending(userId, suggestionId);
    suggestion.status = 'dismissed';
    await suggestion.save();
  }

  // A pending, unexpired suggestion for a trip the traveller may see.
  private async requirePending(userId: string, suggestionId: string): Promise<SuggestionDocument> {
    const suggestion = isValidObjectId(suggestionId) ? await SuggestionModel.findById(suggestionId) : null;
    if (!suggestion) {
      throw new HttpError(404, 'Suggestion not found');
    }
    await this.itineraryService.getItinerary(userId, suggestion.itineraryId.toString()).catch(() => {
      throw new HttpError(404, 'Suggestion not found');
    });
    if (suggestion.status !== 'pending') {
      throw new HttpError(409, 'This suggestion was already answered');
    }
    if (suggestion.expiresAt <= this.now()) {
      suggestion.status = 'expired';
      await suggestion.save();
      throw new HttpError(409, 'This suggestion has expired');
    }
    return suggestion;
  }

  private async checkTrip(trip: ItineraryDocument, now: number): Promise<number> {
    const forecast = await this.forecastFor(trip);
    let made = 0;
    for (const stop of upcomingStops(trip, now, forecast?.utcOffsetSeconds ?? 0)) {
      const rain = forecast !== null && stop.outdoor && rainDuring(forecast, stop.start, stop.end);
      const reason: SuggestionReason | null = rain ? 'rain' : (await this.isClosed(stop.activityId)) ? 'closed' : null;
      if (reason !== null && (await this.suggest(trip._id, stop.dayIndex, stop.activityId, reason))) {
        made += 1;
      }
    }
    return made;
  }

  private async forecastFor(trip: ItineraryDocument): Promise<Forecast | null> {
    if (this.weatherClient === null) {
      return null;
    }
    try {
      return await this.weatherClient.forecast({ lat: trip.lodging.lat, lng: trip.lodging.lng });
    } catch (error) {
      console.warn('Weather forecast unavailable; checking closures only', error);
      return null;
    }
  }

  // Asks Google about a venue at most every 6 hours, keeping the answer on the activity.
  private async isClosed(activityId: string): Promise<boolean> {
    const lookup = this.placesClient?.businessStatus?.bind(this.placesClient);
    const activity = lookup ? await ActivityModel.findById(activityId) : null;
    if (!lookup || !activity) {
      return false;
    }
    const checkedAt = activity.statusCheckedAt?.getTime() ?? 0;
    if (this.now().getTime() - checkedAt >= STATUS_TTL_MS) {
      try {
        activity.businessStatus = (await lookup(activity.placeId)) ?? undefined;
        activity.statusCheckedAt = this.now();
        await activity.save();
      } catch (error) {
        console.warn('Venue status unavailable', error);
        return false;
      }
    }
    return activity.businessStatus === 'CLOSED_TEMPORARILY' || activity.businessStatus === 'CLOSED_PERMANENTLY';
  }
}
