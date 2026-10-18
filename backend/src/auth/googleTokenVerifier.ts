import { OAuth2Client } from 'google-auth-library';

/** The identity claims TimeTravel reads from a verified Google ID token. */
export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
}

/** Verifies a Google ID token and returns its identity, or rejects if the token is invalid. */
export type GoogleTokenVerifier = (idToken: string) => Promise<GoogleIdentity>;

export function createGoogleTokenVerifier(clientId: string): GoogleTokenVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured');
    }
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new Error('Google ID token has no email claim');
    }
    return { googleId: payload.sub, email: payload.email, name: payload.name ?? payload.email };
  };
}
