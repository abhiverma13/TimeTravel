import { Types, isValidObjectId } from 'mongoose';

import type { InterestTag } from '../activities/interests';
import { UserModel } from '../auth/userModel';
import { type GroupDocument, GroupModel } from '../groups/groupModel';
import type { GroupService } from '../groups/groupService';
import { haversineKm } from '../itineraries/engine/travelTime';
import type { GeoPoint } from '../itineraries/engine/types';
import { type ItineraryDocument, ItineraryModel } from '../itineraries/itineraryModel';
import { addDays } from '../itineraries/tripCalendar';
import { HttpError } from '../middleware/errorHandler';
import { type JoinRequestDocument, JoinRequestModel, type JoinRequestStatus } from './joinRequestModel';

/** Trips with a stop this close to the traveller count as nearby. */
export const NEARBY_RADIUS_KM = 10;
/** Trips that have not ended and start within this many days. */
export const NEARBY_DAYS_AHEAD = 7;
const NEARBY_LIMIT = 20;
const STOP_PREVIEW = 5;
const FORMER_TRAVELLER = 'Former traveller';

/** An open trip near the traveller. Its lodging and its members' positions are never included. */
export interface NearbyTripDto {
  itineraryId: string;
  groupId: string;
  groupName: string;
  /** The group owner's name. */
  organizer: string;
  memberCount: number;
  city: string;
  startDate: string;
  endDate: string;
  /** The first few stops, in order. */
  stopNames: string[];
  interests: InterestTag[];
  /** From the traveller to the trip's nearest stop. */
  distanceKm: number;
  /** The traveller's latest request to join this trip, if any. */
  myRequest: 'none' | JoinRequestStatus;
}

export interface JoinRequestDto {
  id: string;
  itineraryId: string;
  groupId: string;
  requester: { id: string; name: string };
  note: string;
  status: JoinRequestStatus;
  createdAt: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nearestStopKm(itinerary: ItineraryDocument, point: GeoPoint): number {
  const distances = itinerary.days.flatMap((day) => day.stops.map((stop) => haversineKm(point, stop.location)));
  return Math.min(Number.POSITIVE_INFINITY, ...distances);
}

async function requesterNames(requests: readonly JoinRequestDocument[]): Promise<Map<string, string>> {
  const users = await UserModel.find({ _id: { $in: requests.map((request) => request.requesterId) } }, { name: 1 });
  return new Map(users.map((user) => [user._id.toString(), user.name]));
}

function describe(request: JoinRequestDocument, names: ReadonlyMap<string, string>): JoinRequestDto {
  return {
    id: request._id.toString(),
    itineraryId: request.itineraryId.toString(),
    groupId: request.groupId.toString(),
    requester: { id: request.requesterId.toString(), name: names.get(request.requesterId.toString()) ?? FORMER_TRAVELLER },
    note: request.note,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  };
}

function roleOf(group: GroupDocument, userId: string): string | undefined {
  return group.members.find((member) => member.userId.toString() === userId)?.role;
}

/** Nearby Service: trips their group opened to travellers nearby, and requests to join those groups. */
export class NearbyService {
  constructor(
    private readonly groupService: GroupService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The group's owner opens a group trip to travellers nearby, or closes it again. */
  async setOpen(userId: string, itineraryId: string, openToJoin: boolean): Promise<{ openToJoin: boolean }> {
    const itinerary = isValidObjectId(itineraryId) ? await ItineraryModel.findById(itineraryId) : null;
    if (!itinerary?.groupId) {
      if (itinerary?.userId.toString() === userId) {
        throw new HttpError(409, 'Only group trips can be opened to travellers nearby');
      }
      throw new HttpError(404, 'Itinerary not found');
    }
    const group = await GroupModel.findById(itinerary.groupId);
    const role = group ? roleOf(group, userId) : undefined;
    if (role === undefined) {
      throw new HttpError(404, 'Itinerary not found');
    }
    if (role !== 'owner') {
      throw new HttpError(403, 'Only the group owner can open this trip to travellers nearby');
    }
    await ItineraryModel.updateOne({ _id: itinerary._id }, { $set: { openToJoin } });
    return { openToJoin };
  }

  /** Open trips with a stop within 10 km that have not ended and start within 7 days, nearest first; not the caller's. */
  async findNearby(userId: string, point: GeoPoint): Promise<NearbyTripDto[]> {
    const today = isoDay(this.now());
    const myGroupIds = await this.groupService.memberGroupIds(userId);
    const open = await ItineraryModel.find({
      openToJoin: true,
      groupId: { $exists: true, $nin: myGroupIds },
      endDate: { $gte: today },
      startDate: { $lte: addDays(today, NEARBY_DAYS_AHEAD) },
    });
    const nearby = open
      .map((itinerary) => ({ itinerary, distanceKm: nearestStopKm(itinerary, point) }))
      .filter((trip) => trip.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, NEARBY_LIMIT);
    const groups = new Map((await GroupModel.find({ _id: { $in: nearby.map((trip) => trip.itinerary.groupId) } })).map((group) => [group._id.toString(), group]));
    const ownerIds = [...groups.values()].flatMap((group) => group.members.filter((member) => member.role === 'owner').map((member) => member.userId));
    const names = new Map((await UserModel.find({ _id: { $in: ownerIds } }, { name: 1 })).map((user) => [user._id.toString(), user.name]));
    const requests = await JoinRequestModel.find({ requesterId: new Types.ObjectId(userId), itineraryId: { $in: nearby.map((trip) => trip.itinerary._id) } }).sort({ createdAt: 1 });
    const latestRequest = new Map(requests.map((request) => [request.itineraryId.toString(), request.status]));
    return nearby.flatMap(({ itinerary, distanceKm }) => {
      const group = groups.get(itinerary.groupId?.toString() ?? '');
      if (!group) {
        return [];
      }
      const ownerId = group.members.find((member) => member.role === 'owner')?.userId.toString() ?? '';
      return [
        {
          itineraryId: itinerary._id.toString(),
          groupId: group._id.toString(),
          groupName: group.name,
          organizer: names.get(ownerId) ?? FORMER_TRAVELLER,
          memberCount: group.members.length,
          city: itinerary.city,
          startDate: itinerary.startDate,
          endDate: itinerary.endDate,
          stopNames: itinerary.days.flatMap((day) => day.stops.map((stop) => stop.name)).slice(0, STOP_PREVIEW),
          interests: [...itinerary.interests],
          distanceKm: Math.round(distanceKm * 10) / 10,
          myRequest: latestRequest.get(itinerary._id.toString()) ?? 'none',
        },
      ];
    });
  }

  /** Asks to join the group of an open trip, with an optional note to its owner. */
  async requestToJoin(userId: string, itineraryId: string, note: string): Promise<JoinRequestDto> {
    const itinerary = isValidObjectId(itineraryId) ? await ItineraryModel.findById(itineraryId) : null;
    if (!itinerary?.openToJoin || !itinerary.groupId) {
      throw new HttpError(404, 'This trip is not open to join');
    }
    const groupId = itinerary.groupId;
    if ((await this.groupService.memberGroupIds(userId)).some((id) => id.equals(groupId))) {
      throw new HttpError(409, "You are already in this trip's group");
    }
    const requesterId = new Types.ObjectId(userId);
    if ((await JoinRequestModel.countDocuments({ itineraryId: itinerary._id, requesterId, status: 'pending' })) > 0) {
      throw new HttpError(409, 'You already asked to join this trip');
    }
    const request = await JoinRequestModel.create({ groupId, itineraryId: itinerary._id, requesterId, note });
    return describe(request, await requesterNames([request]));
  }

  /** The group's pending requests, oldest first. Owner only. */
  async listRequests(userId: string, groupId: string): Promise<JoinRequestDto[]> {
    const group = await this.groupService.requireMember(userId, groupId);
    if (roleOf(group, userId) !== 'owner') {
      throw new HttpError(403, 'Only the group owner sees join requests');
    }
    const requests = await JoinRequestModel.find({ groupId: group._id, status: 'pending' }).sort({ createdAt: 1, _id: 1 });
    const names = await requesterNames(requests);
    return requests.map((request) => describe(request, names));
  }

  /** The group's owner accepts (adding the traveller to the group) or declines a pending request. */
  async answer(userId: string, requestId: string, accept: boolean): Promise<JoinRequestDto> {
    const request = isValidObjectId(requestId) ? await JoinRequestModel.findById(requestId) : null;
    const group = request ? await GroupModel.findById(request.groupId) : null;
    if (!request || !group || roleOf(group, userId) === undefined) {
      throw new HttpError(404, 'Join request not found');
    }
    if (roleOf(group, userId) !== 'owner') {
      throw new HttpError(403, 'Only the group owner can answer join requests');
    }
    if (request.status !== 'pending') {
      throw new HttpError(409, 'This request was already answered');
    }
    // They may have joined with the invite code in the meantime.
    if (accept && roleOf(group, request.requesterId.toString()) === undefined) {
      await this.groupService.addMember(group._id, request.requesterId.toString());
    }
    request.status = accept ? 'accepted' : 'declined';
    await request.save();
    return describe(request, await requesterNames([request]));
  }
}
