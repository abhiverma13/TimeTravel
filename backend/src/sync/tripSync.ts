import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';

import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import type { AuthService } from '../auth/authService';
import type { ItineraryChange, ItineraryService } from '../itineraries/itineraryService';
import { HttpError } from '../middleware/errorHandler';

export type SubscribeReply = { ok: true } | { ok: false; error: string };
export type Acknowledge = (reply: SubscribeReply) => void;

/** Messages the server pushes to the app. */
export interface ServerToClientEvents {
  itineraryUpdated: (change: ItineraryChange) => void;
}

/** Messages the app sends. Both take `{ itineraryId }`. */
export interface ClientToServerEvents {
  subscribe: (payload: unknown, acknowledge?: Acknowledge) => void;
  unsubscribe: (payload: unknown) => void;
}

interface SocketData {
  userId: string;
}

type TripSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TripSyncServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const subscription = z.object({ itineraryId: z.string() });

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

/**
 * Trip Sync & Disruption Service, live updates: a Socket.io hub on the API's own server. The app connects with its
 * session token, subscribes to the itineraries on screen, and receives `itineraryUpdated { itinerary, actorId, summary }`
 * after every saved adjustment, so every member's device shows the same plan without polling.
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
        Promise.resolve(socket.leave(roomFor(parsed.data.itineraryId))).catch((error: unknown) => {
          console.error('Live update unsubscribe failed', error);
        });
      }
    });
  });
  itineraryService.onItineraryChanged((change) => {
    io.to(roomFor(change.itinerary.id)).emit('itineraryUpdated', change);
  });
  return io;
}
