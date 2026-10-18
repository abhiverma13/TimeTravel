import request from 'supertest';

import { createTestApp } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterAll(stopTestDatabase);

// Interface GET /health
describe('Unmocked: GET /health', () => {
  // Input: GET request to /health while MongoDB is connected
  // Expected status code: 200
  // Expected behavior: service reports healthy status and a connected database
  // Expected output: { status: "ok", database: "connected" }
  test('Healthy service with database', async () => {
    const response = await request(createTestApp().app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'connected' });
  });
});

// Interface GET /does-not-exist
describe('Unmocked: GET /does-not-exist', () => {
  // Input: GET request to an unregistered route
  // Expected status code: 404
  // Expected behavior: request is rejected; no state is changed
  // Expected output: { error: "Not Found" }
  test('Unregistered route', async () => {
    const response = await request(createTestApp().app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not Found' });
  });
});
