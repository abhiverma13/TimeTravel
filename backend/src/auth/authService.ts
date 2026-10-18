import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';

import { HttpError } from '../middleware/errorHandler';
import type { GoogleTokenVerifier } from './googleTokenVerifier';
import { type ProfileUpdate, UserModel, type UserProfile, toUserProfile } from './userModel';

const SESSION_LIFETIME = '7d';

export interface SignInResult {
  token: string;
  user: UserProfile;
}

/** Auth & Profile Service: exchanges Google ID tokens for TimeTravel sessions and serves profiles. */
export class AuthService {
  constructor(
    private readonly verifyGoogleToken: GoogleTokenVerifier,
    private readonly jwtSecret: string,
  ) {}

  /** Verifies the Google ID token, creates or updates the user, and issues a session token. */
  async signInWithGoogle(idToken: string): Promise<SignInResult> {
    let identity;
    try {
      identity = await this.verifyGoogleToken(idToken);
    } catch {
      throw new HttpError(401, 'Invalid Google ID token');
    }

    const user = await UserModel.findOneAndUpdate(
      { googleId: identity.googleId },
      { $set: { email: identity.email, name: identity.name } },
      { upsert: true, new: true, runValidators: true },
    );
    return { token: this.createSessionToken(user._id.toString()), user: toUserProfile(user) };
  }

  createSessionToken(userId: string): string {
    return jwt.sign({}, this.jwtSecret, { subject: userId, expiresIn: SESSION_LIFETIME });
  }

  /** Returns the user id a session token was issued for, or throws a 401 HttpError. */
  verifySessionToken(token: string): string {
    let subject: string | undefined;
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      subject = typeof payload === 'string' ? undefined : payload.sub;
    } catch {
      throw new HttpError(401, 'Invalid or expired session token');
    }
    if (subject === undefined || !isValidObjectId(subject)) {
      throw new HttpError(401, 'Invalid or expired session token');
    }
    return subject;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    return toUserProfile(user);
  }

  /** Sets the traveller's home city and/or interest tags; fields left out are unchanged. */
  async updateProfile(userId: string, update: ProfileUpdate): Promise<UserProfile> {
    const changes: ProfileUpdate = {};
    if (update.homeCity !== undefined) {
      changes.homeCity = update.homeCity;
    }
    if (update.interests !== undefined) {
      changes.interests = [...new Set(update.interests)];
    }
    const user = await UserModel.findByIdAndUpdate(userId, { $set: changes }, { new: true, runValidators: true });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    return toUserProfile(user);
  }
}
