import request from 'supertest';

import type { GroupDto } from '../../src/groups/groupService';
import type { ItineraryDto } from '../../src/itineraries/itineraryService';
import { connectClient, nextUpdate, startLiveServer, subscribeTo } from '../helpers/liveServer';
import { createTestApp, seedVancouver, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

/*
 * NFR 2, live update latency: when a group trip changes, every member's connected device shows the new plan within
 * 2 s. Measured end to end, from the moment one member sends an adjustment to the moment the other members' devices
 * receive the updated itinerary, so it includes the re-plan, the database write and the push.
 */
const LIMIT_MS = 2000;
const RUNS = 20;
const MEMBERS = 4;

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues.at(index) ?? Number.NaN;
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterAll(stopTestDatabase);

describe('NFR: live update latency', () => {
  test(`every member receives each of ${String(RUNS)} adjustments within ${String(LIMIT_MS)} ms`, async () => {
    const testApp = createTestApp();
    const { app, authService, activityService } = testApp;
    const users = await Promise.all(Array.from({ length: MEMBERS }, async (_, index) => signedInUser(authService, `Member ${String(index)}`)));
    const [owner, ...others] = users;
    if (!owner) {
      throw new Error('no owner');
    }
    await seedVancouver(activityService);
    const group = (await request(app).post('/api/groups').set(owner.authorization).send({ name: 'Crew' })).body as GroupDto;
    for (const member of others) {
      await request(app).post('/api/groups/join').set(member.authorization).send({ inviteCode: group.inviteCode });
    }
    let itinerary = (
      await request(app)
        .post('/api/itineraries/generate')
        .set(owner.authorization)
        .send({ city: 'Vancouver', startDate: '2026-10-24', endDate: '2026-10-26', pace: 'packed', groupId: group.id })
    ).body as ItineraryDto;
    const live = await startLiveServer(testApp);
    const sockets = await Promise.all(others.map(async (member) => connectClient(live.url, member.authorization)));
    for (const socket of sockets) {
      await subscribeTo(socket, itinerary.id);
    }

    const latencies: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const stop = itinerary.days.at(0)?.stops.at(0);
      // Alternate the cheapest change (a lock) with the most expensive one (re-planning a whole day).
      const change =
        run % 2 === 0
          ? { action: 'replan', version: itinerary.version, dayIndex: run % 3 }
          : { action: stop?.locked ? 'unlock' : 'lock', version: itinerary.version, dayIndex: 0, activityId: stop?.activityId };
      const received = sockets.map(async (socket) => nextUpdate(socket).then(() => performance.now()));
      const sentAt = performance.now();
      const response = await request(app).post(`/api/itineraries/${itinerary.id}/adjust`).set(owner.authorization).send(change);
      expect(response.status).toBe(200);
      itinerary = response.body as ItineraryDto;
      latencies.push(...(await Promise.all(received)).map((at) => at - sentAt));
    }

    const sorted = [...latencies].sort((left, right) => left - right);
    console.info(
      [
        `NFR live update latency: ${String(RUNS)} adjustments x ${String(sockets.length)} other members = ${String(latencies.length)} deliveries`,
        `p50 ${percentile(sorted, 0.5).toFixed(0)} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms, max ${(sorted.at(-1) ?? 0).toFixed(0)} ms (limit ${String(LIMIT_MS)} ms)`,
      ].join('\n'),
    );
    expect(sorted.at(-1)).toBeLessThan(LIMIT_MS);
    for (const socket of sockets) {
      socket.disconnect();
    }
    await live.close();
  }, 120_000);
});
