import { Types, isValidObjectId } from 'mongoose';

import type { InterestTag } from '../activities/interests';
import { UserModel } from '../auth/userModel';
import { type GroupDocument, GroupModel } from '../groups/groupModel';
import type { GroupService } from '../groups/groupService';
import { haversineKm } from '../trips/engine/travelTime';
import type { GeoPoint } from '../trips/engine/types';
import { type TripDocument, TripModel } from '../trips/tripModel';
import { addDays } from '../trips/tripCalendar';
import { HttpError } from '../middleware/errorHandler';
import { LiveEvents, firstNameOf } from '../sync/liveEvents';
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
  tripId: string;
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
  tripId: string;
  groupId: string;
  requester: { id: string; name: string };
  note: string;
  status: JoinRequestStatus;
  createdAt: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nearestStopKm(trip: TripDocument, point: GeoPoint): number {
  const distances = trip.days.flatMap((day) => day.stops.map((stop) => haversineKm(point, stop.location)));
  return Math.min(Number.POSITIVE_INFINITY, ...distances);
}

async function requesterNames(requests: readonly JoinRequestDocument[]): Promise<Map<string, string>> {
  const users = await UserModel.find({ _id: { $in: requests.map((request) => request.requesterId) } }, { name: 1 });
  return new Map(users.map((user) => [user._id.toString(), user.name]));
}

function describe(request: JoinRequestDocument, names: ReadonlyMap<string, string>): JoinRequestDto {
  return {
    id: request._id.toString(),
    tripId: request.tripId.toString(),
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
    private readonly events: LiveEvents = new LiveEvents(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The group's owner opens a group trip to travellers nearby, or closes it again. */
  async setOpen(userId: string, tripId: string, openToJoin: boolean): Promise<{ openToJoin: boolean }> {
    const trip = isValidObjectId(tripId) ? await TripModel.findById(tripId) : null;
    if (!trip?.groupId) {
      if (trip?.userId.toString() === userId) {
        throw new HttpError(409, 'Only group trips can be opened to travellers nearby');
      }
      throw new HttpError(404, 'Trip not found');
    }
    const group = await GroupModel.findById(trip.groupId);
    const role = group ? roleOf(group, userId) : undefined;
    if (role === undefined) {
      throw new HttpError(404, 'Trip not found');
    }
    if (role !== 'owner') {
      throw new HttpError(403, 'Only the group owner can open this trip to travellers nearby');
    }
    await TripModel.updateOne({ _id: trip._id }, { $set: { openToJoin } });
    return { openToJoin };
  }

  /** Open trips with a stop within 10 km that have not ended and start within 7 days, nearest first; not the caller's. */
  async findNearby(userId: string, point: GeoPoint): Promise<NearbyTripDto[]> {
    const today = isoDay(this.now());
    const myGroupIds = await this.groupService.memberGroupIds(userId);
    const open = await TripModel.find({
      openToJoin: true,
      groupId: { $exists: true, $nin: myGroupIds },
      endDate: { $gte: today },
      startDate: { $lte: addDays(today, NEARBY_DAYS_AHEAD) },
    });
    const nearby = open
      .map((trip) => ({ trip, distanceKm: nearestStopKm(trip, point) }))
      .filter((trip) => trip.distanceKm <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, NEARBY_LIMIT);
    const groups = new Map((await GroupModel.find({ _id: { $in: nearby.map((entry) => entry.trip.groupId) } })).map((group) => [group._id.toString(), group]));
    const ownerIds = [...groups.values()].flatMap((group) => group.members.filter((member) => member.role === 'owner').map((member) => member.userId));
    const names = new Map((await UserModel.find({ _id: { $in: ownerIds } }, { name: 1 })).map((user) => [user._id.toString(), user.name]));
    const requests = await JoinRequestModel.find({ requesterId: new Types.ObjectId(userId), tripId: { $in: nearby.map((entry) => entry.trip._id) } }).sort({ createdAt: 1 });
    const latestRequest = new Map(requests.map((request) => [request.tripId.toString(), request.status]));
    return nearby.flatMap(({ trip, distanceKm }) => {
      const group = groups.get(trip.groupId?.toString() ?? '');
      if (!group) {
        return [];
      }
      const ownerId = group.members.find((member) => member.role === 'owner')?.userId.toString() ?? '';
      return [
        {
          tripId: trip._id.toString(),
          groupId: group._id.toString(),
          groupName: group.name,
          organizer: names.get(ownerId) ?? FORMER_TRAVELLER,
          memberCount: group.members.length,
          city: trip.city,
          startDate: trip.startDate,
          endDate: trip.endDate,
          stopNames: trip.days.flatMap((day) => day.stops.map((stop) => stop.name)).slice(0, STOP_PREVIEW),
          interests: [...trip.interests],
          distanceKm: Math.round(distanceKm * 10) / 10,
          myRequest: latestRequest.get(trip._id.toString()) ?? 'none',
        },
      ];
    });
  }

  /** Asks to join the group of an open trip, with an optional note to its owner. */
  async requestToJoin(userId: string, tripId: string, note: string): Promise<JoinRequestDto> {
    const trip = isValidObjectId(tripId) ? await TripModel.findById(tripId) : null;
    if (!trip?.openToJoin || !trip.groupId) {
      throw new HttpError(404, 'This trip is not open to join');
    }
    const groupId = trip.groupId;
    if ((await this.groupService.memberGroupIds(userId)).some((id) => id.equals(groupId))) {
      throw new HttpError(409, "You are already in this trip's group");
    }
    const requesterId = new Types.ObjectId(userId);
    if ((await JoinRequestModel.countDocuments({ tripId: trip._id, requesterId, status: 'pending' })) > 0) {
      throw new HttpError(409, 'You already asked to join this trip');
    }
    const request = await JoinRequestModel.create({ groupId, tripId: trip._id, requesterId, note });
    const group = await GroupModel.findById(groupId);
    const ownerIds = group?.members.filter((member) => member.role === 'owner').map((member) => member.userId) ?? [];
    this.events.publish(ownerIds, {
      type: 'joinRequest',
      actorId: userId,
      groupId: groupId.toString(),
      tripId,
      text: `${await firstNameOf(userId)} asked to join ${group?.name ?? 'your group'}`,
    });
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
    this.events.publish([request.requesterId], {
      type: 'joinAnswered',
      actorId: userId,
      groupId: group._id.toString(),
      tripId: request.tripId.toString(),
      text: `${await firstNameOf(userId)} ${request.status} your request to join ${group.name}`,
    });
    return describe(request, await requesterNames([request]));
  }
}
