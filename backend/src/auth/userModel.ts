import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';

import { INTEREST_TAGS, type InterestTag } from '../shared/interestTags';

const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    homeCity: { type: String, default: '' },
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);

/** The user fields the front-end is allowed to see. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  /** Prefills Explore and the Trip Builder; empty until the traveller sets it. */
  homeCity: string;
  interests: InterestTag[];
}

export interface ProfileUpdate {
  homeCity?: string | undefined;
  interests?: InterestTag[] | undefined;
}

export function toUserProfile(user: UserDocument): UserProfile {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    homeCity: user.homeCity,
    interests: user.interests.filter((tag): tag is InterestTag => INTEREST_TAGS.some((known) => known === tag)),
  };
}
