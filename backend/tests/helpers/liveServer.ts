import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type Socket, io } from 'socket.io-client';

import type { ItineraryChange } from '../../src/itineraries/itineraryService';
import { type SubscribeReply, attachTripSync } from '../../src/sync/tripSync';
import type { TestApp } from './testApp';

export interface LiveServer {
  url: string;
  close: () => Promise<void>;
}

/** Serves the test app and its live-update hub on a free local port, as index.ts does in production. */
export async function startLiveServer(testApp: TestApp): Promise<LiveServer> {
  const server = createServer(testApp.app);
  const hub = attachTripSync(server, testApp.authService, testApp.itineraryService);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${String(port)}`,
    close: async () => hub.close(),
  };
}

/** A connected client using the session token from an `Authorization: Bearer` header. */
export async function connectClient(url: string, authorization: { Authorization: string }): Promise<Socket> {
  const socket = io(url, { auth: { token: authorization.Authorization.replace('Bearer ', '') }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

export async function subscribeTo(socket: Socket, itineraryId: string): Promise<SubscribeReply> {
  return (await socket.emitWithAck('subscribe', { itineraryId })) as SubscribeReply;
}

export async function nextUpdate(socket: Socket): Promise<ItineraryChange> {
  return new Promise((resolve) => {
    socket.once('itineraryUpdated', resolve);
  });
}
