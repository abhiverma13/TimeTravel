import jwt from 'jsonwebtoken';
import request from 'supertest';

import { UserModel } from '../../src/auth/userModel';
import { TEST_JWT_SECRET, createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(clearTestDatabase);
afterAll(stopTestDatabase);

// Interface POST /api/auth/google
describe('Unmocked: POST /api/auth/google', () => {
  // Input: empty JSON body
  // Expected status code: 400
  // Expected behavior: no user is created
  // Expected output: { error: "Invalid request", details: [...] }
  test('Missing idToken', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/auth/google').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
    expect(await UserModel.countDocuments()).toBe(0);
  });

  // Input: body that is not valid JSON
  // Expected status code: 400
  // Expected behavior: request is rejected before reaching Google
  // Expected output: { error: "Malformed JSON body" }
  test('Malformed JSON body', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/api/auth/google')
      .set('Content-Type', 'application/json')
      .send('{"idToken": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Malformed JSON body' });
  });

  // Input: an idToken that Google's verifier rejects (not a signed JWT)
  // Expected status code: 401
  // Expected behavior: no user is created and no session token is issued
  // Expected output: { error: "Invalid Google ID token" }
  test('Token rejected by Google verification', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/auth/google').send({ idToken: 'not-a-google-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid Google ID token' });
    expect(await UserModel.countDocuments()).toBe(0);
  });
});

// Interface GET /api/users/me
describe('Unmocked: GET /api/users/me', () => {
  // Input: Authorization header with a valid session token for an existing user
  // Expected status code: 200
  // Expected behavior: the user's profile is read from the database
  // Expected output: { id, email, name, homeCity, interests } of that user
  test('Valid session', async () => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService, 'Ada Lovelace');

    const response = await request(app).get('/api/users/me').set(authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: userId,
      email: 'ada.lovelace@example.com',
      name: 'Ada Lovelace',
      homeCity: '',
      interests: [],
    });
  });

  // Input: no Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Missing session token" }
  test('Missing session token', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/users/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing session token' });
  });

  // Input: Authorization header whose token was not signed by this server
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid or expired session token" }
  test('Forged session token', async () => {
    const { app } = createTestApp();
    const forged = jwt.sign({}, 'some-other-secret', { subject: '64b7f0c2a1b2c3d4e5f60718' });

    const response = await request(app).get('/api/users/me').set('Authorization', `Bearer ${forged}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
  });

  // Input: Authorization header with a correctly signed token whose subject is not a user id
  // Expected status code: 401
  // Expected behavior: request is rejected without querying by an invalid id
  // Expected output: { error: "Invalid or expired session token" }
  test('Session token with malformed subject', async () => {
    const { app } = createTestApp();
    const token = jwt.sign({}, TEST_JWT_SECRET, { subject: 'not-an-object-id' });

    const response = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
  });

  // Input: Authorization header with a correctly signed token but no subject at all
  // Expected status code: 401
  // Expected behavior: request is rejected
  // Expected output: { error: "Invalid or expired session token" }
  test('Session token without subject', async () => {
    const { app } = createTestApp();
    const token = jwt.sign({ purpose: 'not-a-session' }, TEST_JWT_SECRET);

    const response = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid or expired session token' });
  });

  // Input: valid session token for a user that has since been deleted
  // Expected status code: 404
  // Expected behavior: no profile is returned
  // Expected output: { error: "User not found" }
  test('Session for deleted user', async () => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService);
    await UserModel.findByIdAndDelete(userId);

    const response = await request(app).get('/api/users/me').set(authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'User not found' });
  });
});

// Interface PUT /api/users/me
describe('Unmocked: PUT /api/users/me', () => {
  // Input: { homeCity: " Vancouver ", interests: ["museums", "food", "museums"] } with a valid session
  // Expected status code: 200
  // Expected behavior: the profile is saved with the city trimmed and duplicate interests removed
  // Expected output: the updated profile
  test('Sets home city and interests', async () => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService);

    const response = await request(app)
      .put('/api/users/me')
      .set(authorization)
      .send({ homeCity: ' Vancouver ', interests: ['museums', 'food', 'museums'] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: userId, homeCity: 'Vancouver', interests: ['museums', 'food'] });
    expect((await UserModel.findById(userId))?.homeCity).toBe('Vancouver');
  });

  // Input: { interests: ["outdoors"] } for a traveller whose home city is already set
  // Expected status code: 200
  // Expected behavior: only the interests change; the home city is kept
  // Expected output: the profile with the old home city and the new interests
  test('Updates only the fields sent', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    await request(app).put('/api/users/me').set(authorization).send({ homeCity: 'Victoria' });

    const response = await request(app).put('/api/users/me').set(authorization).send({ interests: ['outdoors'] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ homeCity: 'Victoria', interests: ['outdoors'] });
  });

  // Input: an empty body, an unknown interest tag, and an 81-character city
  // Expected status code: 400 for each
  // Expected behavior: the profile is unchanged
  // Expected output: { error: "Invalid request", details: [...] }
  test.each([{}, { interests: ['skydiving'] }, { homeCity: 'x'.repeat(81) }])('Invalid profile update %p', async (body) => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService);

    const response = await request(app).put('/api/users/me').set(authorization).send(body);

    expect(response.status).toBe(400);
    expect((await UserModel.findById(userId))?.homeCity).toBe('');
  });

  // Input: a valid update without an Authorization header
  // Expected status code: 401
  // Expected behavior: nothing is changed
  // Expected output: { error: "Missing session token" }
  test('Not signed in', async () => {
    const { app } = createTestApp();

    const response = await request(app).put('/api/users/me').send({ homeCity: 'Vancouver' });

    expect(response.status).toBe(401);
  });

  // Input: a valid update for a user that has since been deleted
  // Expected status code: 404
  // Expected behavior: nothing is created
  // Expected output: { error: "User not found" }
  test('Session for deleted user', async () => {
    const { app, authService } = createTestApp();
    const { userId, authorization } = await signedInUser(authService);
    await UserModel.findByIdAndDelete(userId);

    const response = await request(app).put('/api/users/me').set(authorization).send({ homeCity: 'Vancouver' });

    expect(response.status).toBe(404);
    expect(await UserModel.countDocuments()).toBe(0);
  });
});
