import request from 'supertest';

import { NotificationModel } from '../../src/notifications/notificationModel';
import { createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

const simulatedOutage = () => {
  throw new Error('Simulated database outage');
};

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface GET /api/notifications
describe('Mocked: GET /api/notifications', () => {
  // Mocked behavior: reading notifications fails
  // Input: a traveller's session
  // Expected status code: 500
  // Expected behavior: the error is handled; the server keeps running
  // Expected output: { error: "Internal server error" }
  test('Notification database read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(NotificationModel, 'find').mockImplementation(simulatedOutage);

    const response = await request(app).get('/api/notifications').set(authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  // Mocked behavior: storing a notification fails
  // Input: Ava asks Ben to be friends
  // Expected status code: 201 for the request; 200 for Ben's list
  // Expected behavior: the friend request is still sent; the failure is logged; Ben has no notification
  // Expected output: Ben's list is empty; "Failed to push a live event" is logged
  test('Storing a notification fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const ava = await signedInUser(authService, 'Ava Traveller');
    const ben = await signedInUser(authService, 'Ben Traveller');
    jest.spyOn(NotificationModel, 'insertMany').mockImplementation(simulatedOutage);

    const sent = await request(app).post('/api/friends/requests').set(ava.authorization).send({ userId: ben.userId });
    jest.restoreAllMocks();
    const list = await request(app).get('/api/notifications').set(ben.authorization);

    expect(sent.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith('Failed to push a live event', expect.any(Error));
    expect(list.body).toEqual({ notifications: [], unread: { trips: 0, groups: 0, feed: 0, profile: 0 } });
  });
});

// Interface POST /api/notifications/read
describe('Mocked: POST /api/notifications/read', () => {
  // Mocked behavior: marking notifications read fails
  // Input: a traveller marks their Groups notifications read
  // Expected status code: 500
  // Expected behavior: the error is handled; the server keeps running
  // Expected output: { error: "Internal server error" }
  test('Notification database write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(NotificationModel, 'updateMany').mockImplementation(simulatedOutage);

    const response = await request(app).post('/api/notifications/read').set(authorization).send({ area: 'groups' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
