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

/** Something another traveller (or the disruption timer) did that concerns this traveller, pushed to their devices. */
export interface LiveEvent {
  type: LiveEventType;
  /** What happened, ready to show: "Ava joined Crew". */
  text: string;
  /** Who did it; empty for the disruption timer. */
  actorId: string;
  groupId?: string;
  tripId?: string;
  postId?: string;
  at: string;
}

export type LiveEventListener = (recipientIds: string[], event: LiveEvent) => void;

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
 * Carries live events from the services that cause them to the Trip Sync & Disruption Service, which pushes each to the
 * recipients' devices. The traveller who acted never gets their own event. Pushing never fails the action itself.
 */
export class LiveEvents {
  private readonly listeners: LiveEventListener[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  subscribe(listener: LiveEventListener): void {
    this.listeners.push(listener);
  }

  publish(recipientIds: readonly (string | Types.ObjectId)[], event: Omit<LiveEvent, 'at'>): void {
    const recipients = [...new Set(recipientIds.map(String))].filter((id) => id !== event.actorId);
    if (recipients.length === 0) {
      return;
    }
    const stamped: LiveEvent = { ...event, at: this.now().toISOString() };
    for (const listener of this.listeners) {
      try {
        listener(recipients, stamped);
      } catch (error) {
        console.error('Failed to push a live event', error);
      }
    }
  }
}
