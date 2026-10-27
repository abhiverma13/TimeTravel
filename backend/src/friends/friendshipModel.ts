import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

export const FRIENDSHIP_STATUSES = ['pending', 'accepted'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

/** A friend request from `requesterId` to `recipientId`; once accepted, the two are friends. */
export interface Friendship {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: FriendshipStatus;
  /** Both user ids in sorted order, so two travellers have at most one friendship, whoever asked first. */
  pair: string;
  createdAt: Date;
  updatedAt: Date;
}

const friendshipSchema = new Schema<Friendship>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, required: true },
    pair: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);
friendshipSchema.index({ requesterId: 1 });
friendshipSchema.index({ recipientId: 1 });

export type FriendshipDocument = HydratedDocument<Friendship>;
export const FriendshipModel = model<Friendship>('Friendship', friendshipSchema);

export function pairKey(userId: string, otherId: string): string {
  return userId < otherId ? `${userId}:${otherId}` : `${otherId}:${userId}`;
}
