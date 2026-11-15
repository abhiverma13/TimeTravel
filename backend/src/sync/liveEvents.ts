import type { Types } from 'mongoose';

import { UserModel } from '../auth/userModel';

export const LIVE_EVENT_TYPES = [
  'friendRequest',
  'friendAccepted',
  'friendRemoved',
  'memberJoined',
  'memberLeft',
  'removedFromGroup',
  'groupDeleted',
  'joinRequest',
  'joinAnswered',
  'postLiked',
  'postCommented',
  'suggestion',
] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

/** Where in the app an event belongs, for its red dot: the Trips, Groups, Feed or Profile tab. */
export const LIVE_EVENT_AREAS = ['trips', 'groups', 'feed', 'profile'] as const;
export type LiveEventArea = (typeof LIVE_EVENT_AREAS)[number];

const AREA_OF: Record<LiveEventType, LiveEventArea> = {
  friendRequest: 'profile',
  friendAccepted: 'profile',
  friendRemoved: 'profile',
  memberJoined: 'groups',
  memberLeft: 'groups',
  removedFromGroup: 'groups',
  groupDeleted: 'groups',
  joinRequest: 'groups',
  joinAnswered: 'groups',
  postLiked: 'feed',
  postCommented: 'feed',
  suggestion: 'trips',
};

/** Something another traveller (or the disruption timer) did that concerns this traveller, pushed to their devices. */
export interface LiveEvent {
  type: LiveEventType;
  area: LiveEventArea;
  /** What happened, ready to show: "Ava joined Crew". */
  text: string;
  /** Who did it; empty for the disruption timer. */
  actorId: string;
  groupId?: string;
  tripId?: string;
  postId?: string;
  at: string;
}

export type LiveEventListener = (recipientIds: string[], event: LiveEvent) => void | Promise<void>;

const SOMEONE = 'Someone';

/** A traveller's first name for an event's text; "Someone" if they cannot be found. Never throws. */
export async function firstNameOf(userId: string | Types.ObjectId): Promise<string> {
  try {
    const user = await UserModel.findById(userId, { name: 1 });
    return user?.name.split(' ').at(0) ?? SOMEONE;
  } catch (error) {
    console.error('Failed to name a live event', error);
    return SOMEONE;
  }
}

/**
 * Carries live events from the services that cause them to their listeners: the Trip Sync & Disruption Service pushes
 * each to the recipients' devices, and the Notification Service keeps it for their red dots. The traveller who acted
 * never gets their own event. A listener that fails never fails the action itself.
 */
export class LiveEvents {
  private readonly listeners: LiveEventListener[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  subscribe(listener: LiveEventListener): void {
    this.listeners.push(listener);
  }

  async publish(recipientIds: readonly (string | Types.ObjectId)[], event: Omit<LiveEvent, 'area' | 'at'>): Promise<void> {
    const recipients = [...new Set(recipientIds.map(String))].filter((id) => id !== event.actorId);
    if (recipients.length === 0) {
      return;
    }
    const stamped: LiveEvent = { ...event, area: AREA_OF[event.type], at: this.now().toISOString() };
    for (const listener of this.listeners) {
      try {
        await listener(recipients, stamped);
      } catch (error) {
        console.error('Failed to push a live event', error);
      }
    }
  }
}
