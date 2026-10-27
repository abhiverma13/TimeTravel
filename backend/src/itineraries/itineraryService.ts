import { Types, isValidObjectId } from 'mongoose';

import type { ActivityDto, ActivityService } from '../activities/activityService';
import type { InterestTag } from '../activities/interests';
import type { PlacesClient } from '../activities/placesClient';
import { UserModel } from '../auth/userModel';
import type { GroupService, GroupTripPreferences } from '../groups/groupService';
import { HttpError } from '../middleware/errorHandler';
import { type ItineraryAdjustment, type RepairInputs, STALE_ITINERARY, applyAdjustment, toCandidate } from './dayRepair';
import { pruneCandidates } from './engine/candidates';
import { dayContext, paceSettings, planTrip } from './engine/planner';
import { estimateTravelMinutes } from './engine/travelTime';
import type { GeoPoint, Pace, PlanRequest, TripDay } from './engine/types';
import { type ItineraryDay, type ItineraryDocument, ItineraryModel, type Lodging } from './itineraryModel';
import { clockFromMinutes, minutesFromClock, tripDays } from './tripCalendar';

export const MAX_TRIP_DAYS = 7;
const RECENT_ITINERARY_LIMIT = 20;

export interface GenerateItineraryInput {
  city: string;
  startDate: string;
  endDate: string;
  dayStart: string;
  dayEnd: string;
  /** HH:MM on the first day; the plan starts no earlier. */
  arrivalTime?: string | undefined;
  /** HH:MM on the last day; the plan ends by then. */
  departureTime?: string | undefined;
  interests: InterestTag[];
  pace: Pace;
  /** Hotel name or address; days start and end there. */
  lodging?: string | undefined;
  /** Plans a trip for this group: its members' interests and vetoes replace `interests`. */
  groupId?: string | undefined;
}

export interface ItineraryStopDto {
  activityId: string;
  name: string;
  address: string;
  location: GeoPoint;
  interests: InterestTag[];
  startTime: string;
  endTime: string;
  travelMinutes: number;
  communityScore: number;
  locked: boolean;
}

export interface ItineraryDto {
  id: string;
  /** The group the trip belongs to, or null for a personal trip. */
  groupId: string | null;
  city: string;
  startDate: string;
  endDate: string;
  dayStart: string;
  dayEnd: string;
  arrivalTime: string | null;
  departureTime: string | null;
  interests: InterestTag[];
  pace: Pace;
  lodging: Lodging;
  days: { date: string; weekday: number; stops: ItineraryStopDto[]; returnTravelMinutes: number }[];
  candidateCount: number;
  unscheduledCount: number;
  warnings: string[];
  generationMs: number;
  /** Send it back with an adjustment; it changes with every adjustment. */
  version: number;
  createdAt: string;
}

export interface ItinerarySummaryDto {
  id: string;
  groupId: string | null;
  city: string;
  startDate: string;
  endDate: string;
  pace: Pace;
  stopCount: number;
  createdAt: string;
}

/** An adjustment that was saved: who made it, and the itinerary as it is now. */
export interface ItineraryChange {
  itinerary: ItineraryDto;
  actorId: string;
  /** For the other members' screens: "Ava removed Stanley Park Seawall". */
  summary: string;
}

export type ItineraryListener = (change: ItineraryChange) => void;

export interface ItineraryServiceOptions {
  /** Local search time per day, passed to the engine. */
  searchBudgetMsPerDay?: number;
}

function toItineraryDto(itinerary: ItineraryDocument): ItineraryDto {
  return {
    id: itinerary._id.toString(),
    groupId: itinerary.groupId?.toString() ?? null,
    city: itinerary.city,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate,
    dayStart: itinerary.dayStart,
    dayEnd: itinerary.dayEnd,
    arrivalTime: itinerary.arrivalTime ?? null,
    departureTime: itinerary.departureTime ?? null,
    interests: [...itinerary.interests],
    pace: itinerary.pace,
    lodging: { label: itinerary.lodging.label, lat: itinerary.lodging.lat, lng: itinerary.lodging.lng, source: itinerary.lodging.source },
    days: itinerary.days.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      returnTravelMinutes: day.returnTravelMinutes,
      stops: day.stops.map((stop) => ({
        activityId: stop.activityId.toString(),
        name: stop.name,
        address: stop.address,
        location: { lat: stop.location.lat, lng: stop.location.lng },
        interests: [...stop.interests],
        startTime: stop.startTime,
        endTime: stop.endTime,
        travelMinutes: stop.travelMinutes,
        communityScore: stop.communityScore,
        locked: stop.locked,
      })),
    })),
    candidateCount: itinerary.candidateCount,
    unscheduledCount: itinerary.unscheduledCount,
    warnings: [...itinerary.warnings],
    generationMs: itinerary.generationMs,
    version: itinerary.version,
    createdAt: itinerary.createdAt.toISOString(),
  };
}

/** The trip's days, with the first day starting at arrival and the last ending at departure. */
type TripHours = Pick<GenerateItineraryInput, 'startDate' | 'endDate' | 'dayStart' | 'dayEnd' | 'arrivalTime' | 'departureTime'>;

function plannedDays(input: TripHours): TripDay[] {
  const days = tripDays(input.startDate, input.endDate);
  const lastIndex = days.length - 1;
  return days.map((day, index) => ({
    ...day,
    startMinute: index === 0 && input.arrivalTime !== undefined
      ? Math.max(minutesFromClock(input.dayStart), minutesFromClock(input.arrivalTime))
      : undefined,
    endMinute: index === lastIndex && input.departureTime !== undefined
      ? Math.min(minutesFromClock(input.dayEnd), minutesFromClock(input.departureTime))
      : undefined,
  }));
}

function cityCentre(activities: readonly ActivityDto[]): GeoPoint {
  const lat = activities.reduce((sum, activity) => sum + activity.location.lat, 0) / activities.length;
  const lng = activities.reduce((sum, activity) => sum + activity.location.lng, 0) / activities.length;
  return { lat, lng };
}

// A stored day as plain data, so it can be changed and written back whole.
function plainDay(day: ItineraryDay): ItineraryDay {
  return {
    date: day.date,
    weekday: day.weekday,
    returnTravelMinutes: day.returnTravelMinutes,
    stops: day.stops.map((stop) => ({
      activityId: stop.activityId,
      name: stop.name,
      address: stop.address,
      location: { lat: stop.location.lat, lng: stop.location.lng },
      interests: [...stop.interests],
      startTime: stop.startTime,
      endTime: stop.endTime,
      travelMinutes: stop.travelMinutes,
      communityScore: stop.communityScore,
      locked: stop.locked,
    })),
  };
}

/** Trip planning on top of the Itinerary Engine: gathers candidates, resolves lodging, stores the plan. */
export class ItineraryService {
  private readonly listeners: ItineraryListener[] = [];

  constructor(
    private readonly activityService: ActivityService,
    private readonly placesClient: PlacesClient | null,
    private readonly groupService: GroupService,
    private readonly options: ItineraryServiceOptions = {},
  ) {}

  async generateItinerary(userId: string, input: GenerateItineraryInput): Promise<ItineraryDto> {
    const startedAt = performance.now();
    const group: GroupTripPreferences | null =
      input.groupId === undefined ? null : await this.groupService.tripPreferences(userId, input.groupId);
    const catalogue = await this.activityService.listActivities(input.city);
    if (catalogue.length === 0) {
      throw new HttpError(404, `No activities found for ${input.city}`);
    }
    const activities = catalogue.filter((activity) => !group?.vetoedActivityIds.has(activity.id));
    const interests = group ? [...group.interestShares.keys()] : input.interests;

    const warnings: string[] = [];
    const lodging = await this.resolveLodging(input, catalogue, warnings);
    const plan = planTrip(
      activities.map(toCandidate),
      {
        days: plannedDays(input),
        dayStartMinute: minutesFromClock(input.dayStart),
        dayEndMinute: minutesFromClock(input.dayEnd),
        origin: { lat: lodging.lat, lng: lodging.lng },
        interests,
        interestShares: group?.interestShares,
        pace: input.pace,
      },
      this.options.searchBudgetMsPerDay === undefined ? {} : { searchBudgetMsPerDay: this.options.searchBudgetMsPerDay },
    );

    const activitiesById = new Map(activities.map((activity) => [activity.id, activity]));
    const days = plan.days.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      returnTravelMinutes: day.returnTravelMinutes,
      stops: day.stops.flatMap((stop) => {
        const activity = activitiesById.get(stop.candidateId);
        if (activity === undefined) {
          return [];
        }
        return [
          {
            activityId: new Types.ObjectId(activity.id),
            name: activity.name,
            address: activity.address,
            location: activity.location,
            interests: activity.interests,
            startTime: clockFromMinutes(stop.startMinute),
            endTime: clockFromMinutes(stop.endMinute),
            travelMinutes: stop.travelMinutes,
            communityScore: activity.communityScore,
            locked: false,
          },
        ];
      }),
    }));
    if (days.every((day) => day.stops.length === 0)) {
      warnings.push('No activity fits these dates and hours; try longer days or different interests.');
    }

    const itinerary = await ItineraryModel.create({
      userId: new Types.ObjectId(userId),
      groupId: input.groupId === undefined ? undefined : new Types.ObjectId(input.groupId),
      city: input.city,
      startDate: input.startDate,
      endDate: input.endDate,
      dayStart: input.dayStart,
      dayEnd: input.dayEnd,
      arrivalTime: input.arrivalTime,
      departureTime: input.departureTime,
      interests,
      pace: input.pace,
      lodging,
      days,
      candidateCount: plan.candidateCount,
      unscheduledCount: plan.unscheduledCandidateIds.length,
      warnings,
      generationMs: Math.round(performance.now() - startedAt),
    });
    return toItineraryDto(itinerary);
  }

  /**
   * An itinerary the traveller may see: their own personal trip, or a trip of a group they belong to.
   * Anything else is reported as not found.
   */
  async getItinerary(userId: string, itineraryId: string): Promise<ItineraryDto> {
    return toItineraryDto(await this.findVisible(userId, itineraryId));
  }

  /** The traveller's most recent personal and group itineraries, newest first; or one group's, with `groupId`. */
  async listItineraries(userId: string, groupId?: string): Promise<ItinerarySummaryDto[]> {
    const filter =
      groupId === undefined
        ? await this.visibleFilter(userId)
        : { groupId: (await this.groupService.requireMember(userId, groupId))._id };
    const itineraries = await ItineraryModel.find(filter).sort({ createdAt: -1 }).limit(RECENT_ITINERARY_LIMIT);
    return itineraries.map((itinerary) => ({
      id: itinerary._id.toString(),
      groupId: itinerary.groupId?.toString() ?? null,
      city: itinerary.city,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      pace: itinerary.pace,
      stopCount: itinerary.days.reduce((count, day) => count + day.stops.length, 0),
      createdAt: itinerary.createdAt.toISOString(),
    }));
  }

  /** Called after every saved adjustment; the Trip Sync & Disruption Service pushes it to connected members. */
  onItineraryChanged(listener: ItineraryListener): void {
    this.listeners.push(listener);
  }

  /**
   * View & Adjust Itinerary: locks, unlocks, removes or moves a stop, or re-plans a day, then notifies listeners.
   * Refused with 409 when the itinerary changed since `change.version`, so concurrent edits never overwrite each other.
   */
  async adjustItinerary(userId: string, itineraryId: string, change: ItineraryAdjustment): Promise<ItineraryDto> {
    const itinerary = await this.findVisible(userId, itineraryId);
    if (itinerary.version !== change.version) {
      throw new HttpError(409, STALE_ITINERARY);
    }
    const days = itinerary.days.map(plainDay);
    const day = days.at(change.dayIndex);
    if (day === undefined) {
      throw new HttpError(400, 'dayIndex is out of range');
    }
    const repaired = applyAdjustment(change, await this.repairInputs(userId, itinerary, days, day, change.dayIndex));
    const newDays = days.map((other, index) =>
      index === change.dayIndex ? { ...other, stops: repaired.stops, returnTravelMinutes: repaired.returnTravelMinutes } : other,
    );
    const updated = await ItineraryModel.findOneAndUpdate(
      { _id: itinerary._id, version: change.version },
      { $set: { days: newDays }, $inc: { version: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new HttpError(409, STALE_ITINERARY);
    }
    const dto = toItineraryDto(updated);
    await this.notify(userId, dto, repaired.summary);
    return dto;
  }

  private async repairInputs(
    userId: string,
    itinerary: ItineraryDocument,
    days: readonly ItineraryDay[],
    day: ItineraryDay,
    dayIndex: number,
  ): Promise<RepairInputs> {
    const catalogue = await this.activityService.listActivities(itinerary.city);
    const group = itinerary.groupId ? await this.groupService.tripPreferences(userId, itinerary.groupId.toString()) : null;
    const request: PlanRequest = {
      days: plannedDays(itinerary),
      dayStartMinute: minutesFromClock(itinerary.dayStart),
      dayEndMinute: minutesFromClock(itinerary.dayEnd),
      origin: { lat: itinerary.lodging.lat, lng: itinerary.lodging.lng },
      interests: itinerary.interests,
      interestShares: group?.interestShares,
      pace: itinerary.pace,
    };
    const candidates = catalogue.filter((activity) => !group?.vetoedActivityIds.has(activity.id)).map(toCandidate);
    const tripDay = request.days.at(dayIndex) ?? { date: day.date, weekday: day.weekday };
    return {
      day,
      context: dayContext(request, tripDay, estimateTravelMinutes),
      ranked: new Map(pruneCandidates(candidates, request).map((candidate) => [candidate.id, candidate])),
      catalogue: new Map(catalogue.map((activity) => [activity.id, activity])),
      usedElsewhere: new Set(
        days.filter((_, index) => index !== dayIndex).flatMap((other) => other.stops.map((stop) => stop.activityId.toString())),
      ),
      maxStops: paceSettings(itinerary.pace).maxStopsPerDay,
    };
  }

  private async notify(userId: string, itinerary: ItineraryDto, summary: string): Promise<void> {
    const actor = await UserModel.findById(userId);
    const firstName = actor?.name.split(' ').at(0) ?? 'Someone';
    for (const listener of this.listeners) {
      try {
        listener({ itinerary, actorId: userId, summary: `${firstName} ${summary}` });
      } catch (error) {
        // The change is saved; a failed push must not fail the request. Clients catch up when they reload.
        console.error('Failed to push an itinerary change', error);
      }
    }
  }

  /** The itinerary, if the traveller may see it; 404 otherwise. */
  private async findVisible(userId: string, itineraryId: string): Promise<ItineraryDocument> {
    if (!isValidObjectId(itineraryId)) {
      throw new HttpError(404, 'Itinerary not found');
    }
    const itinerary = await ItineraryModel.findOne({ _id: new Types.ObjectId(itineraryId), ...(await this.visibleFilter(userId)) });
    if (!itinerary) {
      throw new HttpError(404, 'Itinerary not found');
    }
    return itinerary;
  }

  // Personal trips are the generating traveller's; group trips belong to whoever is in the group now.
  private async visibleFilter(userId: string): Promise<{ $or: object[] }> {
    const groupIds = await this.groupService.memberGroupIds(userId);
    return { $or: [{ userId: new Types.ObjectId(userId), groupId: null }, { groupId: { $in: groupIds } }] };
  }

  /** Finds the lodging with Google Places, falling back to the centre of the city's activities. */
  private async resolveLodging(
    input: GenerateItineraryInput,
    activities: readonly ActivityDto[],
    warnings: string[],
  ): Promise<Lodging> {
    const centre: Lodging = { label: `${input.city} centre`, ...cityCentre(activities), source: 'city-centre' };
    if (input.lodging === undefined || input.lodging === '') {
      return centre;
    }
    if (this.placesClient !== null) {
      try {
        const [match] = await this.placesClient.searchText(`${input.lodging}, ${input.city}`);
        if (match) {
          return { label: match.name, lat: match.location.lat, lng: match.location.lng, source: 'places' };
        }
      } catch (error) {
        console.warn('Lodging lookup failed', error);
      }
    }
    warnings.push(`Could not find "${input.lodging}"; days start and end at the ${input.city} centre.`);
    return centre;
  }
}
