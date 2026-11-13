import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import type { DisruptionService, SuggestionDto } from '../disruptions/disruptionService';
import { UserModel } from '../auth/userModel';
import type { TripChange, TripService } from '../trips/tripService';
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

function roomFor(tripId: string): string {
  return `trip:${tripId}`;
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

// Passes the device's position to the trip's other members. Only a device subscribed to the trip may share with it.
async function shareLocation(socket: TripSocket, payload: unknown, acknowledge: Acknowledge): Promise<void> {
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
    socket.data.name ??= (await UserModel.findById(socket.data.userId))?.name ?? 'A traveller';
  } catch (error) {
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

/**
 * Trip Sync & Disruption Service, live updates: a Socket.io hub on the API's own server. The app connects with its
 * session token, subscribes to the trips on screen, and receives `tripUpdated { trip, actorId, summary }`
 * after every saved adjustment, so every member's device shows the same plan without polling. Members can also share
 * where they are with the trip's other members while its map is open (`shareLocation`, `memberLocation`), and receive
 * the disruption suggestions made for the trip (`suggestionAdded`).
 */
export function attachTripSync(
  server: HttpServer | HttpsServer,
  authService: AuthService,
  tripService: TripService,
  disruptionService: DisruptionService,
): TripSyncServer {
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
      shareLocation(socket, payload, acknowledge ?? (() => undefined)).catch((error: unknown) => {
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
  return io;
}
