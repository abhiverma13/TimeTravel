import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import type { DisruptionService, SuggestionDto } from '../disruptions/disruptionService';
import { UserModel } from '../auth/userModel';
import type { GroupService, MembersLeft } from '../groups/groupService';
import type { TripChange, TripService } from '../trips/tripService';
import type { LiveEvent, LiveEvents } from './liveEvents';
import { HttpError } from '../middleware/errorHandler';

export type SubscribeReply = { ok: true } | { ok: false; error: string };
export type Acknowledge = (reply: SubscribeReply) => void;

/** Where a member of the trip is now, as their device reported it. Relayed live, never stored. */
export interface MemberLocation {
  tripId: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  at: string;
}

/** Messages the server pushes to the app. */
export interface ServerToClientEvents {
  tripUpdated: (change: TripChange) => void;
  memberLocation: (location: MemberLocation) => void;
  memberLocationStopped: (member: { tripId: string; userId: string }) => void;
  suggestionAdded: (suggestion: SuggestionDto) => void;
  /** The traveller left the trip's group, was removed, or the group was deleted: no more updates for this trip. */
  tripAccessLost: (lost: { tripId: string }) => void;
  /** Something another traveller did that concerns this one: a friend request, a member joining a group, a like. */
  liveEvent: (event: LiveEvent) => void;
}

/** Messages the app sends. All take `{ tripId }`; `shareLocation` also takes `{ lat, lng }`. */
export interface ClientToServerEvents {
  subscribe: (payload: unknown, acknowledge?: Acknowledge) => void;
  unsubscribe: (payload: unknown) => void;
  shareLocation: (payload: unknown, acknowledge?: Acknowledge) => void;
  stopSharingLocation: (payload: unknown) => void;
}

interface SocketData {
  userId: string;
  /** Looked up once, the first time the traveller shares their location. */
  name?: string;
  /** The trips this device is sharing its location with. */
  sharingIn?: Set<string>;
}

type TripSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TripSyncServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const subscription = z.object({ tripId: z.string() });
const locationUpdate = z.object({ tripId: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

/** What the hub needs from the other services. */
export interface TripSyncServices {
  authService: AuthService;
  tripService: TripService;
  groupService: GroupService;
  disruptionService: DisruptionService;
  liveEvents: LiveEvents;
}

function roomFor(tripId: string): string {
  return `trip:${tripId}`;
}

/** Every device of a signed-in traveller is in their own room, for the live events that concern them. */
function userRoom(userId: string): string {
  return `user:${userId}`;
}

async function subscribe(socket: TripSocket, tripService: TripService, payload: unknown, acknowledge: Acknowledge): Promise<void> {
  const parsed = subscription.safeParse(payload);
  if (!parsed.success) {
    acknowledge({ ok: false, error: 'Send { tripId } to subscribe' });
    return;
  }
  try {
    // Only members of a group trip (or the owner of a personal one) may listen to it.
    await tripService.getTrip(socket.data.userId, parsed.data.tripId);
    await socket.join(roomFor(parsed.data.tripId));
    acknowledge({ ok: true });
  } catch (error) {
    if (!(error instanceof HttpError)) {
      console.error('Live update subscription failed', error);
    }
    acknowledge({ ok: false, error: error instanceof HttpError ? error.message : 'Internal server error' });
  }
}

// Passes the device's position to the trip's other members. Only a device subscribed to the trip, whose traveller can
// still see it, may share with it.
async function shareLocation(socket: TripSocket, tripService: TripService, payload: unknown, acknowledge: Acknowledge): Promise<void> {
  const parsed = locationUpdate.safeParse(payload);
  if (!parsed.success) {
    acknowledge({ ok: false, error: 'Send { tripId, lat, lng } to share your location' });
    return;
  }
  const { tripId, lat, lng } = parsed.data;
  if (!socket.rooms.has(roomFor(tripId))) {
    acknowledge({ ok: false, error: 'Subscribe to the trip before sharing your location' });
    return;
  }
  try {
    await tripService.getTrip(socket.data.userId, tripId);
    socket.data.name ??= (await UserModel.findById(socket.data.userId))?.name ?? 'A traveller';
  } catch (error) {
    if (error instanceof HttpError) {
      acknowledge({ ok: false, error: error.message });
      return;
    }
    console.error('Location sharing failed', error);
    acknowledge({ ok: false, error: 'Internal server error' });
    return;
  }
  socket.data.sharingIn = new Set([...(socket.data.sharingIn ?? []), tripId]);
  socket.to(roomFor(tripId)).emit('memberLocation', { tripId, userId: socket.data.userId, name: socket.data.name, lat, lng, at: new Date().toISOString() });
  acknowledge({ ok: true });
}

// Tells the trip's other members this device no longer shares its position with them.
function stopSharing(socket: TripSocket, tripId: string): void {
  if (socket.data.sharingIn?.delete(tripId) === true) {
    socket.to(roomFor(tripId)).emit('memberLocationStopped', { tripId, userId: socket.data.userId });
  }
}

// Cuts the live updates of travellers who can no longer see a group's trips: each of their devices stops sharing its
// position with those trips, leaves their rooms, and is told the trip is gone.
function revokeAccess(io: TripSyncServer, left: MembersLeft): void {
  const leaving = new Set(left.userIds);
  for (const socket of io.of('/').sockets.values()) {
    if (!leaving.has(socket.data.userId)) {
      continue;
    }
    for (const tripId of left.tripIds.filter((id) => socket.rooms.has(roomFor(id)))) {
      stopSharing(socket, tripId);
      Promise.resolve(socket.leave(roomFor(tripId))).catch((error: unknown) => {
        console.error('Live update unsubscribe failed', error);
      });
      socket.emit('tripAccessLost', { tripId });
    }
  }
}

/**
 * Trip Sync & Disruption Service, live updates: a Socket.io hub on the API's own server. The app connects with its
 * session token, subscribes to the trips on screen, and receives `tripUpdated { trip, actorId, summary }`
 * after every saved adjustment, so every member's device shows the same plan without polling. Members can also share
 * where they are with the trip's other members while its map is open (`shareLocation`, `memberLocation`), and receive
 * the disruption suggestions made for the trip (`suggestionAdded`). A traveller who leaves a group, is removed, or whose
 * group is deleted stops receiving its trips at once (`tripAccessLost`). Every connected device also receives the live
 * events that concern its traveller (`liveEvent`), such as a friend request or a member joining one of their groups.
 */
export function attachTripSync(server: HttpServer | HttpsServer, services: TripSyncServices): TripSyncServer {
  const { authService, tripService, groupService, disruptionService, liveEvents } = services;
  const io: TripSyncServer = new Server(server);
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth.token;
    try {
      socket.data.userId = authService.verifySessionToken(typeof token === 'string' ? token : '');
      next();
    } catch {
      next(new Error('Invalid or expired session token'));
    }
  });
  io.on('connection', (socket) => {
    Promise.resolve(socket.join(userRoom(socket.data.userId))).catch((error: unknown) => {
      console.error('Live event subscription failed', error);
    });
    socket.on('subscribe', (payload, acknowledge) => {
      subscribe(socket, tripService, payload, acknowledge ?? (() => undefined)).catch((error: unknown) => {
        console.error('Live update subscription failed', error);
      });
    });
    socket.on('unsubscribe', (payload) => {
      const parsed = subscription.safeParse(payload);
      if (parsed.success) {
        stopSharing(socket, parsed.data.tripId);
        Promise.resolve(socket.leave(roomFor(parsed.data.tripId))).catch((error: unknown) => {
          console.error('Live update unsubscribe failed', error);
        });
      }
    });
    socket.on('shareLocation', (payload, acknowledge) => {
      shareLocation(socket, tripService, payload, acknowledge ?? (() => undefined)).catch((error: unknown) => {
        console.error('Location sharing failed', error);
      });
    });
    socket.on('stopSharingLocation', (payload) => {
      const parsed = subscription.safeParse(payload);
      if (parsed.success) {
        stopSharing(socket, parsed.data.tripId);
      }
    });
    socket.on('disconnecting', () => {
      for (const tripId of [...(socket.data.sharingIn ?? [])]) {
        stopSharing(socket, tripId);
      }
    });
  });
  tripService.onTripChanged((change) => {
    io.to(roomFor(change.trip.id)).emit('tripUpdated', change);
  });
  disruptionService.onSuggestion((suggestion) => {
    io.to(roomFor(suggestion.tripId)).emit('suggestionAdded', suggestion);
  });
  groupService.onMembersLeft((left) => {
    revokeAccess(io, left);
  });
  liveEvents.subscribe((recipientIds, event) => {
    io.to(recipientIds.map(userRoom)).emit('liveEvent', event);
  });
  return io;
}
