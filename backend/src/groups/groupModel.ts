import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import { INTEREST_TAGS, type InterestTag } from '../shared/interestTags';

export const GROUP_ROLES = ['owner', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export interface GroupMember {
  userId: Types.ObjectId;
  role: GroupRole;
  /** The member's interests for this group's trips; starts as their profile interests. */
  interests: InterestTag[];
  /** Activities this member never wants in the group's trips. */
  vetoedActivityIds: Types.ObjectId[];
  joinedAt: Date;
}

/** A travel group: people who plan trips together. Its itineraries carry its id. */
export interface Group {
  name: string;
  /** Shared with friends so they can join; unique across groups. */
  inviteCode: string;
  members: GroupMember[];
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<GroupMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: GROUP_ROLES, required: true },
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
    vetoedActivityIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Activity' }], default: [] },
    joinedAt: { type: Date, required: true },
  },
  { _id: false },
);

const groupSchema = new Schema<Group>(
  {
    name: { type: String, required: true, trim: true },
    inviteCode: { type: String, required: true, unique: true },
    members: { type: [memberSchema], default: [] },
  },
  { timestamps: true },
);
groupSchema.index({ 'members.userId': 1 });

export type GroupDocument = HydratedDocument<Group>;
export const GroupModel = model<Group>('Group', groupSchema);
