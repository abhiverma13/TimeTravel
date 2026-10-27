import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import { UserModel } from '../auth/userModel';
import type { ItineraryChange, ItineraryService } from '../itineraries/itineraryService';
import { HttpError } from '../middleware/errorHandler';

export type SubscribeReply = { ok: true } | { ok: false; error: string };
export type Acknowledge = (reply: SubscribeReply) => void;

/** Where a member of the trip is now, as their device reported it. Relayed live, never stored. */
export interface MemberLocation {
  itineraryId: string;
  userId: string;
  name: string;
  lat: number;
  lng: number;
  at: string;
}

/** Messages the server pushes to the app. */
export interface ServerToClientEvents {
  itineraryUpdated: (change: ItineraryChange) => void;
  memberLocation: (location: MemberLocation) => void;
  memberLocationStopped: (member: { itineraryId: string; userId: string }) => void;
}

/** Messages the app sends. All take `{ itineraryId }`; `shareLocation` also takes `{ lat, lng }`. */
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
  /** The itineraries this device is sharing its location with. */
  sharingIn?: Set<string>;
}

type TripSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TripSyncServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const subscription = z.object({ itineraryId: z.string() });
const locationUpdate = z.object({ itineraryId: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

function roomFor(itineraryId: string): string {
  return `itinerary:${itineraryId}`;
}

async function subscribe(socket: TripSocket, itineraryService: ItineraryService, payload: unknown, acknowledge: Acknowledge): Promise<void> {
  const parsed = subscription.safeParse(payload);
  if (!parsed.success) {
    acknowledge({ ok: false, error: 'Send { itineraryId } to subscribe' });
    return;
  }
  try {
    // Only members of a group trip (or the owner of a personal one) may listen to it.
    await itineraryService.getItinerary(socket.data.userId, parsed.data.itineraryId);
    await socket.join(roomFor(parsed.data.itineraryId));
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
    acknowledge({ ok: false, error: 'Send { itineraryId, lat, lng } to share your location' });
    return;
  }
  const { itineraryId, lat, lng } = parsed.data;
  if (!socket.rooms.has(roomFor(itineraryId))) {
    acknowledge({ ok: false, error: 'Subscribe to the itinerary before sharing your location' });
    return;
  }
  try {
    socket.data.name ??= (await UserModel.findById(socket.data.userId))?.name ?? 'A traveller';
  } catch (error) {
    console.error('Location sharing failed', error);
    acknowledge({ ok: false, error: 'Internal server error' });
    return;
  }
  socket.data.sharingIn = new Set([...(socket.data.sharingIn ?? []), itineraryId]);
  socket.to(roomFor(itineraryId)).emit('memberLocation', { itineraryId, userId: socket.data.userId, name: socket.data.name, lat, lng, at: new Date().toISOString() });
  acknowledge({ ok: true });
}

// Tells the trip's other members this device no longer shares its position with them.
function stopSharing(socket: TripSocket, itineraryId: string): void {
  if (socket.data.sharingIn?.delete(itineraryId) === true) {
    socket.to(roomFor(itineraryId)).emit('memberLocationStopped', { itineraryId, userId: socket.data.userId });
  }
}

/**
 * Trip Sync & Disruption Service, live updates: a Socket.io hub on the API's own server. The app connects with its
 * session token, subscribes to the itineraries on screen, and receives `itineraryUpdated { itinerary, actorId, summary }`
 * after every saved adjustment, so every member's device shows the same plan without polling. Members can also share
 * where they are with the trip's other members while its map is open (`shareLocation`, `memberLocation`).
 */
export function attachTripSync(server: HttpServer | HttpsServer, authService: AuthService, itineraryService: ItineraryService): TripSyncServer {
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
      subscribe(socket, itineraryService, payload, acknowledge ?? (() => undefined)).catch((error: unknown) => {
        console.error('Live update subscription failed', error);
      });
    });
    socket.on('unsubscribe', (payload) => {
      const parsed = subscription.safeParse(payload);
      if (parsed.success) {
        stopSharing(socket, parsed.data.itineraryId);
        Promise.resolve(socket.leave(roomFor(parsed.data.itineraryId))).catch((error: unknown) => {
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
        stopSharing(socket, parsed.data.itineraryId);
      }
    });
    socket.on('disconnecting', () => {
      for (const itineraryId of [...(socket.data.sharingIn ?? [])]) {
        stopSharing(socket, itineraryId);
      }
    });
  });
  itineraryService.onItineraryChanged((change) => {
    io.to(roomFor(change.itinerary.id)).emit('itineraryUpdated', change);
  });
  return io;
}
