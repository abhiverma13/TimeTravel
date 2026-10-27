import { Types, isValidObjectId } from 'mongoose';

import type { ActivityDto, ActivityService } from '../activities/activityService';
import type { InterestTag } from '../activities/interests';
import type { PlacesClient } from '../activities/placesClient';
import type { GroupService, GroupTripPreferences } from '../groups/groupService';
import { HttpError } from '../middleware/errorHandler';
import { planTrip } from './engine/planner';
import type { Candidate, GeoPoint, Pace, TripDay } from './engine/types';
import { type ItineraryDocument, ItineraryModel, type Lodging } from './itineraryModel';
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
      })),
    })),
    candidateCount: itinerary.candidateCount,
    unscheduledCount: itinerary.unscheduledCount,
    warnings: [...itinerary.warnings],
    generationMs: itinerary.generationMs,
    createdAt: itinerary.createdAt.toISOString(),
  };
}

function toCandidate(activity: ActivityDto): Candidate {
  return {
    id: activity.id,
    location: activity.location,
    interests: activity.interests,
    durationMinutes: activity.durationMinutes,
    score: activity.communityScore,
    openingHours: activity.openingHours,
  };
}

/** The trip's days, with the first day starting at arrival and the last ending at departure. */
function plannedDays(input: GenerateItineraryInput): TripDay[] {
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

/** Trip planning on top of the Itinerary Engine: gathers candidates, resolves lodging, stores the plan. */
export class ItineraryService {
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
