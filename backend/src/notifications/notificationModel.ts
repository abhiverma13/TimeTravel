import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import { LIVE_EVENT_AREAS, LIVE_EVENT_TYPES, type LiveEventArea, type LiveEventType } from '../sync/liveEvents';

/** Notifications older than this are deleted: long enough to catch up after a trip, short enough to stay small. */
export const NOTIFICATION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** A live event kept for one traveller, so the app can show what is new (its red dots) after a restart. */
export interface Notification {
  userId: Types.ObjectId;
  type: LiveEventType;
  area: LiveEventArea;
  text: string;
  actorId: string;
  groupId?: string;
  tripId?: string;
  postId?: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<Notification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: LIVE_EVENT_TYPES, required: true },
  area: { type: String, enum: LIVE_EVENT_AREAS, required: true },
  text: { type: String, required: true },
  actorId: { type: String, default: '' },
  groupId: { type: String },
  tripId: { type: String },
  postId: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, required: true },
});
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, area: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationModel = model<Notification>('Notification', notificationSchema);
