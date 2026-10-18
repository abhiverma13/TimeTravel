import { type LoginTicket, OAuth2Client, type TokenPayload } from 'google-auth-library';
import request from 'supertest';

import type { SignInResult } from '../../src/auth/authService';
import { type GoogleIdentity, createGoogleTokenVerifier } from '../../src/auth/googleTokenVerifier';
import { UserModel } from '../../src/auth/userModel';
import { TEST_GOOGLE_CLIENT_ID, createTestApp, signedInUser } from '../helpers/testApp';
import { DATABASE_STARTUP_TIMEOUT_MS, clearTestDatabase, startTestDatabase, stopTestDatabase } from '../helpers/testDatabase';

const adaIdentity: GoogleIdentity = { googleId: 'google-sub-123', email: 'ada@example.com', name: 'Ada Lovelace' };

/** Makes google-auth-library accept any token and report the given claims. */
function mockGoogleClaims(claims: Omit<Partial<TokenPayload>, 'sub'> & { sub: string }): jest.SpyInstance {
  const payload = { iss: 'https://accounts.google.com', aud: TEST_GOOGLE_CLIENT_ID, iat: 0, exp: 0, ...claims };
  const ticket = { getPayload: () => payload } as unknown as LoginTicket;
  return jest.spyOn(OAuth2Client.prototype, 'verifyIdToken')
    // verifyIdToken is overloaded with a callback form; cast past it to the promise form we use.
    .mockReturnValue(Promise.resolve(ticket) as never);
}

beforeAll(startTestDatabase, DATABASE_STARTUP_TIMEOUT_MS);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDatabase();
});
afterAll(stopTestDatabase);

// Interface POST /api/auth/google
describe('Mocked: POST /api/auth/google', () => {
  // Mocked behavior: Google verification accepts the token and returns Ada's identity
  // Input: { idToken: "valid-google-token" }
  // Expected status code: 200
  // Expected behavior: a user is created for Ada and a session token is issued
  // Expected output: { token, user: { id, email, name } }
  test('First sign-in creates the user', async () => {
    const verifyGoogleToken = jest.fn(async () => Promise.resolve(adaIdentity));
    const { app, authService } = createTestApp({ verifyGoogleToken });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    const body = response.body as SignInResult;
    expect(response.status).toBe(200);
    expect(verifyGoogleToken).toHaveBeenCalledWith('valid-google-token');
    expect(body.user).toEqual({
      id: expect.any(String),
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      homeCity: '',
      interests: [],
    });
    expect(authService.verifySessionToken(body.token)).toBe(body.user.id);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  // Mocked behavior: Google's OAuth2Client.verifyIdToken accepts the token and returns Ada's claims
  // Input: { idToken: "valid-google-token" }, using the production verifier wrapper
  // Expected status code: 200
  // Expected behavior: the wrapper maps Google's claims onto the user record
  // Expected output: { token, user } with Ada's email and name
  test('Production verifier maps Google claims', async () => {
    const verifyIdToken = mockGoogleClaims({ sub: 'google-sub-123', email: 'ada@example.com', name: 'Ada Lovelace' });
    const { app } = createTestApp({ verifyGoogleToken: createGoogleTokenVerifier(TEST_GOOGLE_CLIENT_ID) });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    expect(response.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'valid-google-token', audience: TEST_GOOGLE_CLIENT_ID });
    expect((response.body as SignInResult).user.email).toBe('ada@example.com');
  });

  // Mocked behavior: Google accepts the token, but the account has no display name
  // Input: { idToken: "valid-google-token" }
  // Expected status code: 200
  // Expected behavior: the user's email is used as their name
  // Expected output: { token, user } whose name equals the email
  test('Google account without a name', async () => {
    mockGoogleClaims({ sub: 'google-sub-456', email: 'nameless@example.com' });
    const { app } = createTestApp({ verifyGoogleToken: createGoogleTokenVerifier(TEST_GOOGLE_CLIENT_ID) });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    expect(response.status).toBe(200);
    expect((response.body as SignInResult).user.name).toBe('nameless@example.com');
  });

  // Mocked behavior: Google accepts the token, but it carries no email claim
  // Input: { idToken: "token-without-email" }
  // Expected status code: 401
  // Expected behavior: no user is created
  // Expected output: { error: "Invalid Google ID token" }
  test('Google token without email', async () => {
    mockGoogleClaims({ sub: 'google-sub-789' });
    const { app } = createTestApp({ verifyGoogleToken: createGoogleTokenVerifier(TEST_GOOGLE_CLIENT_ID) });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'token-without-email' });

    expect(response.status).toBe(401);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  // Mocked behavior: none needed; the server was started without GOOGLE_CLIENT_ID
  // Input: { idToken: "valid-google-token" }
  // Expected status code: 401
  // Expected behavior: Google is never called because the audience is unknown
  // Expected output: { error: "Invalid Google ID token" }
  test('Server missing GOOGLE_CLIENT_ID', async () => {
    const verifyIdToken = mockGoogleClaims({ sub: 'google-sub-123', email: 'ada@example.com' });
    const { app } = createTestApp({ verifyGoogleToken: createGoogleTokenVerifier('') });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    expect(response.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  // Mocked behavior: Google verification returns the same Google account with a new display name
  // Input: { idToken: "valid-google-token" } sent twice
  // Expected status code: 200 both times
  // Expected behavior: the existing user is updated rather than duplicated
  // Expected output: same user id, updated name
  test('Repeat sign-in reuses the user', async () => {
    const verifyGoogleToken = jest
      .fn<Promise<GoogleIdentity>, [string]>()
      .mockResolvedValueOnce(adaIdentity)
      .mockResolvedValueOnce({ ...adaIdentity, name: 'Ada King' });
    const { app } = createTestApp({ verifyGoogleToken });

    const first = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });
    const second = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.user.name).toBe('Ada King');
    expect(await UserModel.countDocuments()).toBe(1);
  });

  // Mocked behavior: Google verification rejects the token (expired or wrong audience)
  // Input: { idToken: "expired-google-token" }
  // Expected status code: 401
  // Expected behavior: no user is created
  // Expected output: { error: "Invalid Google ID token" }
  test('Google rejects the token', async () => {
    const verifyGoogleToken = jest.fn(async () => Promise.reject(new Error('Token used too late')));
    const { app } = createTestApp({ verifyGoogleToken });

    const response = await request(app).post('/api/auth/google').send({ idToken: 'expired-google-token' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid Google ID token' });
    expect(await UserModel.countDocuments()).toBe(0);
  });

  // Mocked behavior: Google accepts the token but the user database write fails
  // Input: { idToken: "valid-google-token" }
  // Expected status code: 500
  // Expected behavior: the error is handled and no session token is issued
  // Expected output: { error: "Internal server error" }
  test('Database write fails', async () => {
    const { app } = createTestApp({ verifyGoogleToken: async () => Promise.resolve(adaIdentity) });
    jest.spyOn(UserModel, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).post('/api/auth/google').send({ idToken: 'valid-google-token' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface GET /api/users/me
describe('Mocked: GET /api/users/me', () => {
  // Mocked behavior: the user database read fails
  // Input: Authorization header with a valid session token
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Database read fails', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(UserModel, 'findById').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get('/api/users/me').set(authorization);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});

// Interface PUT /api/users/me
describe('Mocked: PUT /api/users/me', () => {
  // Mocked behavior: the user database write fails
  // Input: { homeCity: "Vancouver" } with a valid session token
  // Expected status code: 500
  // Expected behavior: the error is handled without crashing the server
  // Expected output: { error: "Internal server error" }
  test('Database write fails', async () => {
    const { app, authService } = createTestApp();
    const { authorization } = await signedInUser(authService);
    jest.spyOn(UserModel, 'findByIdAndUpdate').mockImplementation(() => {
      throw new Error('Simulated database outage');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).put('/api/users/me').set(authorization).send({ homeCity: 'Vancouver' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
