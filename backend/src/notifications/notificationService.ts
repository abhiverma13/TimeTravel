import { Types } from 'mongoose';

import type { LiveEvent, LiveEventArea, LiveEventType, LiveEvents } from '../sync/liveEvents';
import { type NotificationDocument, NotificationModel } from './notificationModel';

/** How many of the newest notifications a list returns. */
export const NOTIFICATION_LIST_LIMIT = 30;

export interface NotificationDto {
  id: string;
  type: LiveEventType;
  area: LiveEventArea;
  text: string;
  actorId: string;
  groupId: string | null;
  tripId: string | null;
  postId: string | null;
  read: boolean;
  at: string;
}

/** How many unread notifications each area of the app has: a red dot on its tab when above zero. */
export type UnreadCounts = Record<LiveEventArea, number>;

function toDto(notification: NotificationDocument): NotificationDto {
  return {
    id: notification._id.toString(),
    type: notification.type,
    area: notification.area,
    text: notification.text,
    actorId: notification.actorId,
    groupId: notification.groupId ?? null,
    tripId: notification.tripId ?? null,
    postId: notification.postId ?? null,
    read: notification.read,
    at: notification.createdAt.toISOString(),
  };
}

/**
 * Notification Service: keeps every live event for each of its recipients, unread until they open the part of the app
 * it belongs to, so the app can show red dots for what is new even after a restart.
 */
export class NotificationService {
  constructor(liveEvents: LiveEvents) {
    liveEvents.subscribe(async (recipientIds, event) => this.store(recipientIds, event));
  }

  /** The traveller's newest notifications, and their unread count per area. */
  async list(userId: string): Promise<{ notifications: NotificationDto[]; unread: UnreadCounts }> {
    const notifications = await NotificationModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(NOTIFICATION_LIST_LIMIT);
    return { notifications: notifications.map(toDto), unread: await this.unreadCounts(userId) };
  }

  /** Marks the traveller's notifications in one area read (all of them without an area); returns what is left. */
  async markRead(userId: string, area?: LiveEventArea): Promise<{ unread: UnreadCounts }> {
    const unreadInArea = { userId: new Types.ObjectId(userId), read: false, ...(area ? { area } : {}) };
    await NotificationModel.updateMany(unreadInArea, { $set: { read: true } });
    return { unread: await this.unreadCounts(userId) };
  }

  private async store(recipientIds: string[], event: LiveEvent): Promise<void> {
    const { at, ...details } = event;
    await NotificationModel.insertMany(recipientIds.map((userId) => ({ ...details, userId: new Types.ObjectId(userId), createdAt: new Date(at) })));
  }

  private async unreadCounts(userId: string): Promise<UnreadCounts> {
    const counts = await NotificationModel.aggregate<{ _id: LiveEventArea; count: number }>([
      { $match: { userId: new Types.ObjectId(userId), read: false } },
      { $group: { _id: '$area', count: { $sum: 1 } } },
    ]);
    const byArea = new Map(counts.map(({ _id, count }) => [_id, count]));
    return { trips: byArea.get('trips') ?? 0, groups: byArea.get('groups') ?? 0, feed: byArea.get('feed') ?? 0, profile: byArea.get('profile') ?? 0 };
  }
}

