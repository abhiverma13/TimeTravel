import type { Express } from 'express';

import { createApp } from '../../src/app';
import { AuthService } from '../../src/auth/authService';
import { createGoogleTokenVerifier, type GoogleTokenVerifier } from '../../src/auth/googleTokenVerifier';
import { UserModel } from '../../src/auth/userModel';

export const TEST_JWT_SECRET = 'test-jwt-secret';
export const TEST_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

export interface TestAppOptions {
  /** Replaces real Google token verification; defaults to the real verifier. */
  verifyGoogleToken?: GoogleTokenVerifier;
}

export interface TestApp {
  app: Express;
  authService: AuthService;
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  const authService = new AuthService(
    options.verifyGoogleToken ?? createGoogleTokenVerifier(TEST_GOOGLE_CLIENT_ID),
    TEST_JWT_SECRET,
  );
  return { app: createApp({ authService }), authService };
}

/** Creates a user directly in the database and returns an Authorization header for them. */
export async function signedInUser(
  authService: AuthService,
  name = 'Test Traveller',
): Promise<{ userId: string; authorization: { Authorization: string } }> {
  const user = await UserModel.create({
    googleId: `google-${name.replace(/\s+/g, '-').toLowerCase()}`,
    email: `${name.replace(/\s+/g, '.').toLowerCase()}@example.com`,
    name,
  });
  const userId = user._id.toString();
  return { userId, authorization: { Authorization: `Bearer ${authService.createSessionToken(userId)}` } };
}
