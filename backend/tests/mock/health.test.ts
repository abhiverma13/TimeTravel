import request from 'supertest';

import { createApp } from '../../src/app';
import * as connection from '../../src/db/connection';

afterEach(() => {
  jest.restoreAllMocks();
});

// Interface GET /health
describe('Mocked: GET /health', () => {
  // Mocked behavior: isDatabaseConnected reports that MongoDB is unreachable
  // Input: GET request to /health
  // Expected status code: 200
  // Expected behavior: the server still answers, so deploy scripts can tell "server up, database down" apart
  // Expected output: { status: "ok", database: "disconnected" }
  test('Database unavailable', async () => {
    jest.spyOn(connection, 'isDatabaseConnected').mockReturnValue(false);

    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'disconnected' });
  });
});
