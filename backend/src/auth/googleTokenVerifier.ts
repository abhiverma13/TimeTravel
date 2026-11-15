import { OAuth2Client } from 'google-auth-library';

/** The identity claims TimeTravel reads from a verified Google ID token. */
export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
}

/** Google could not check the token (not configured, or not reachable): the server's problem, not the traveller's. */
export class GoogleUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GoogleUnavailableError';
  }
}

// Network failures fetching Google's signing keys carry a system error code (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ...).
function isNetworkError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code);
}

/** Verifies a Google ID token and returns its identity; rejects if the token is invalid, or with GoogleUnavailableError. */
export type GoogleTokenVerifier = (idToken: string) => Promise<GoogleIdentity>;

export function createGoogleTokenVerifier(clientId: string): GoogleTokenVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (!clientId) {
      throw new GoogleUnavailableError('GOOGLE_CLIENT_ID is not configured');
    }
    let ticket;
    try {
      ticket = await client.verifyIdToken({ idToken, audience: clientId });
    } catch (error) {
      throw isNetworkError(error) ? new GoogleUnavailableError('Could not reach Google to check the token', { cause: error }) : error;
    }
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new Error('Google ID token has no email claim');
    }
    return { googleId: payload.sub, email: payload.email, name: payload.name ?? payload.email };
  };
}
