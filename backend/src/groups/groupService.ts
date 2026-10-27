import { randomInt } from 'node:crypto';

import { Types, isValidObjectId } from 'mongoose';

import { UserModel } from '../auth/userModel';
import { ItineraryModel } from '../itineraries/itineraryModel';
import { HttpError } from '../middleware/errorHandler';
import { INTEREST_TAGS, type InterestTag } from '../shared/interestTags';
import { type GroupDocument, type GroupMember, GroupModel, type GroupRole } from './groupModel';

/** Larger parties rarely move around a city together; the planner is tuned for small groups. */
export const MAX_GROUP_MEMBERS = 12;
export const INVITE_CODE_LENGTH = 6;
// No 0/O or 1/I, so a code read aloud or off a screen is not mistyped.
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_ATTEMPTS = 5;
const DUPLICATE_KEY_ERROR = 11000;
const FORMER_MEMBER_NAME = 'Former traveller';

export interface GroupMemberDto {
  userId: string;
  name: string;
  role: GroupRole;
  interests: InterestTag[];
  vetoedActivityIds: string[];
}

export interface GroupDto {
  id: string;
  name: string;
  inviteCode: string;
  /** The caller's role, so the app knows whether to offer owner actions. */
  myRole: GroupRole;
  members: GroupMemberDto[];
  createdAt: string;
}

export interface GroupSummaryDto {
  id: string;
  name: string;
  memberCount: number;
  myRole: GroupRole;
  createdAt: string;
}

export interface GroupPreferencesUpdate {
  interests?: InterestTag[] | undefined;
  vetoedActivityIds?: string[] | undefined;
}

/** What a group's members want from a trip, combined for the Itinerary Engine. */
export interface GroupTripPreferences {
  /** Per interest, the share of members (0 to 1) who picked it; empty when nobody picked any. */
  interestShares: Map<InterestTag, number>;
  /** Activities at least one member vetoed. */
  vetoedActivityIds: Set<string>;
}

function randomInviteCode(): string {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => INVITE_CODE_ALPHABET.charAt(randomInt(INVITE_CODE_ALPHABET.length))).join('');
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === DUPLICATE_KEY_ERROR;
}

function memberOf(group: GroupDocument, userId: string): GroupMember | undefined {
  return group.members.find((member) => member.userId.toString() === userId);
}

function knownInterests(tags: readonly string[]): InterestTag[] {
  return tags.filter((tag): tag is InterestTag => INTEREST_TAGS.some((known) => known === tag));
}

/** Group Service: travel groups, their members, invite codes and each member's trip preferences. */
export class GroupService {
  /** Creates a group owned by the caller, with a fresh invite code. */
  async createGroup(userId: string, name: string): Promise<GroupDto> {
    const owner: GroupMember = {
      userId: new Types.ObjectId(userId),
      role: 'owner',
      interests: await this.profileInterests(userId),
      vetoedActivityIds: [],
      joinedAt: new Date(),
    };
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
      try {
        const group = await GroupModel.create({ name, inviteCode: randomInviteCode(), members: [owner] });
        return await this.toGroupDto(group, userId);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
    throw new HttpError(503, 'Could not create an invite code; please try again');
  }

  /** The caller's groups, newest first. */
  async listGroups(userId: string): Promise<GroupSummaryDto[]> {
    const groups = await GroupModel.find({ 'members.userId': new Types.ObjectId(userId) }).sort({ createdAt: -1, _id: -1 });
    return groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      memberCount: group.members.length,
      myRole: memberOf(group, userId)?.role ?? 'member',
      createdAt: group.createdAt.toISOString(),
    }));
  }

  async getGroup(userId: string, groupId: string): Promise<GroupDto> {
    return this.toGroupDto(await this.requireMember(userId, groupId), userId);
  }

  /** Adds the caller to the group with this invite code; joining a group twice changes nothing. */
  async joinGroup(userId: string, inviteCode: string): Promise<GroupDto> {
    const group = await GroupModel.findOne({ inviteCode });
    if (!group) {
      throw new HttpError(404, 'No group has that invite code');
    }
    if (memberOf(group, userId)) {
      return this.toGroupDto(group, userId);
    }
    return this.toGroupDto(await this.addMember(group._id, userId), userId);
  }

  /** Adds the traveller as a member, with their profile interests; 409 if the group is full. */
  async addMember(groupId: Types.ObjectId, userId: string): Promise<GroupDocument> {
    const member: GroupMember = {
      userId: new Types.ObjectId(userId),
      role: 'member',
      interests: await this.profileInterests(userId),
      vetoedActivityIds: [],
      joinedAt: new Date(),
    };
    // One atomic update, so two people joining at once cannot overfill the group.
    const joined = await GroupModel.findOneAndUpdate(
      { _id: groupId, 'members.userId': { $ne: member.userId }, $expr: { $lt: [{ $size: '$members' }, MAX_GROUP_MEMBERS] } },
      { $push: { members: member } },
      { new: true },
    );
    if (!joined) {
      throw new HttpError(409, 'This group is full');
    }
    return joined;
  }

  /** Sets the caller's own interests and/or vetoes for this group's trips; fields left out are unchanged. */
  async updatePreferences(userId: string, groupId: string, update: GroupPreferencesUpdate): Promise<GroupDto> {
    const group = await this.requireMember(userId, groupId);
    const changes: Record<string, unknown> = {};
    if (update.interests !== undefined) {
      changes['members.$.interests'] = [...new Set(update.interests)];
    }
    if (update.vetoedActivityIds !== undefined) {
      changes['members.$.vetoedActivityIds'] = [...new Set(update.vetoedActivityIds)].map((id) => new Types.ObjectId(id));
    }
    const updated = await GroupModel.findOneAndUpdate(
      { _id: group._id, 'members.userId': new Types.ObjectId(userId) },
      { $set: changes },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new HttpError(404, 'Group not found');
    }
    return this.toGroupDto(updated, userId);
  }

  /** The owner removes a member, or a member leaves. The owner cannot leave: they delete the group instead. */
  async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
    const group = await this.requireMember(userId, groupId);
    const target = memberOf(group, memberId);
    if (!target) {
      throw new HttpError(404, 'Member not found');
    }
    if (memberId === userId && target.role === 'owner') {
      throw new HttpError(409, 'The owner cannot leave the group; delete it instead');
    }
    if (memberId !== userId && memberOf(group, userId)?.role !== 'owner') {
      throw new HttpError(403, 'Only the group owner can remove members');
    }
    await GroupModel.updateOne({ _id: group._id }, { $pull: { members: { userId: target.userId } } });
  }

  /** Deletes the group and its itineraries. Owner only. */
  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.requireMember(userId, groupId);
    if (memberOf(group, userId)?.role !== 'owner') {
      throw new HttpError(403, 'Only the group owner can delete the group');
    }
    await ItineraryModel.deleteMany({ groupId: group._id });
    await GroupModel.deleteOne({ _id: group._id });
  }

  /** Every member's interests and vetoes, combined; the caller must be a member. */
  async tripPreferences(userId: string, groupId: string): Promise<GroupTripPreferences> {
    const group = await this.requireMember(userId, groupId);
    const pickedBy = new Map<InterestTag, number>();
    const vetoedActivityIds = new Set<string>();
    for (const member of group.members) {
      for (const tag of new Set(member.interests)) {
        pickedBy.set(tag, (pickedBy.get(tag) ?? 0) + 1);
      }
      for (const activityId of member.vetoedActivityIds) {
        vetoedActivityIds.add(activityId.toString());
      }
    }
    const interestShares = new Map([...pickedBy].map(([tag, count]) => [tag, count / group.members.length]));
    return { interestShares, vetoedActivityIds };
  }

  /** Ids of the groups the user belongs to. */
  async memberGroupIds(userId: string): Promise<Types.ObjectId[]> {
    const groups = await GroupModel.find({ 'members.userId': new Types.ObjectId(userId) }, { _id: 1 });
    return groups.map((group) => group._id);
  }

  /** The group, if the user is a member; anyone else gets "not found", so groups are not revealed. */
  async requireMember(userId: string, groupId: string): Promise<GroupDocument> {
    if (!isValidObjectId(groupId)) {
      throw new HttpError(404, 'Group not found');
    }
    const group = await GroupModel.findOne({ _id: new Types.ObjectId(groupId), 'members.userId': new Types.ObjectId(userId) });
    if (!group) {
      throw new HttpError(404, 'Group not found');
    }
    return group;
  }

  private async profileInterests(userId: string): Promise<InterestTag[]> {
    const user = await UserModel.findById(userId);
    return knownInterests(user?.interests ?? []);
  }

  private async toGroupDto(group: GroupDocument, userId: string): Promise<GroupDto> {
    const users = await UserModel.find({ _id: { $in: group.members.map((member) => member.userId) } }, { name: 1 });
    const names = new Map(users.map((user) => [user._id.toString(), user.name]));
    return {
      id: group._id.toString(),
      name: group.name,
      inviteCode: group.inviteCode,
      myRole: memberOf(group, userId)?.role ?? 'member',
      members: group.members.map((member) => ({
        userId: member.userId.toString(),
        name: names.get(member.userId.toString()) ?? FORMER_MEMBER_NAME,
        role: member.role,
        interests: knownInterests(member.interests),
        vetoedActivityIds: member.vetoedActivityIds.map((id) => id.toString()),
      })),
      createdAt: group.createdAt.toISOString(),
    };
  }
}
