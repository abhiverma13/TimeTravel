import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

export const JOIN_REQUEST_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

/** A traveller nearby asking to join the group of a trip its owner opened to others. */
export interface JoinRequest {
  groupId: Types.ObjectId;
  itineraryId: Types.ObjectId;
  requesterId: Types.ObjectId;
  /** A short hello to the group's owner. */
  note: string;
  status: JoinRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const joinRequestSchema = new Schema<JoinRequest>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    itineraryId: { type: Schema.Types.ObjectId, ref: 'Itinerary', required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: JOIN_REQUEST_STATUSES, default: 'pending' },
  },
  { timestamps: true },
);
joinRequestSchema.index({ groupId: 1, status: 1, createdAt: 1 });
joinRequestSchema.index({ requesterId: 1, itineraryId: 1 });

export type JoinRequestDocument = HydratedDocument<JoinRequest>;
export const JoinRequestModel = model<JoinRequest>('JoinRequest', joinRequestSchema);
