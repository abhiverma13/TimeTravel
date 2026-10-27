import { Types, isValidObjectId } from 'mongoose';

import { type UserDocument, UserModel } from '../auth/userModel';
import { HttpError } from '../middleware/errorHandler';
import { type FriendshipDocument, FriendshipModel, pairKey } from './friendshipModel';

const SEARCH_LIMIT = 20;
const DUPLICATE_KEY_ERROR = 11000;

/** How a traveller relates to the one looking: themselves, nobody yet, asked by them, asking them, or friends. */
export type FriendRelation = 'self' | 'none' | 'requested' | 'incoming' | 'friends';

export interface TravellerDto {
  id: string;
  name: string;
  /** Empty for a private account the viewer is not friends with. */
  homeCity: string;
  isPrivate: boolean;
  friendship: FriendRelation;
}

export interface TravellerProfileDto extends TravellerDto {
  friendCount: number;
}

export interface FriendListsDto {
  /** The caller's own privacy setting. */
  isPrivate: boolean;
  friends: TravellerDto[];
  /** Requests the caller received. */
  incoming: TravellerDto[];
  /** Requests the caller sent. */
  outgoing: TravellerDto[];
}

export interface FriendRequestResult {
  traveller: TravellerDto;
  /** False if nothing new was saved: already asked, already friends, or it accepted their request. */
  created: boolean;
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === DUPLICATE_KEY_ERROR;
}

// Searched text is matched literally, not as a pattern.
function escapePattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function relationTo(viewerId: string, userId: string, friendship: FriendshipDocument | null | undefined): FriendRelation {
  if (viewerId === userId) {
    return 'self';
  }
  if (!friendship) {
    return 'none';
  }
  if (friendship.status === 'accepted') {
    return 'friends';
  }
  return friendship.requesterId.toString() === viewerId ? 'requested' : 'incoming';
}

// The traveller as the viewer sees them: a private account's details only for its friends.
function describe(viewerId: string, user: UserDocument, friendship: FriendshipDocument | null | undefined): TravellerDto {
  const id = user._id.toString();
  const relation = relationTo(viewerId, id, friendship);
  const visible = !user.isPrivate || relation === 'friends' || relation === 'self';
  return { id, name: user.name, homeCity: visible ? user.homeCity : '', isPrivate: user.isPrivate, friendship: relation };
}

/** Friend Service: finding travellers, friend requests and friendships, and each account's privacy. */
export class FriendService {
  /** Travellers whose name contains the text, or whose email is exactly it, by name; not the caller. */
  async searchTravellers(viewerId: string, text: string): Promise<TravellerDto[]> {
    const users = await UserModel.find({
      _id: { $ne: new Types.ObjectId(viewerId) },
      $or: [{ name: { $regex: escapePattern(text), $options: 'i' } }, { email: text.toLowerCase() }],
    })
      .sort({ name: 1, _id: 1 })
      .limit(SEARCH_LIMIT);
    return this.toTravellers(viewerId, users);
  }

  async getTraveller(viewerId: string, userId: string): Promise<TravellerProfileDto> {
    const user = await this.requireUser(userId);
    const friendCount = await FriendshipModel.countDocuments({ status: 'accepted', $or: [{ requesterId: user._id }, { recipientId: user._id }] });
    return { ...(await this.toTraveller(viewerId, user)), friendCount };
  }

  async listFriends(userId: string): Promise<FriendListsDto> {
    const me = await this.requireUser(userId);
    const friendships = await FriendshipModel.find({ $or: [{ requesterId: me._id }, { recipientId: me._id }] });
    const otherIds = friendships.map((friendship) => (friendship.requesterId.equals(me._id) ? friendship.recipientId : friendship.requesterId));
    const travellers = await this.toTravellers(userId, await UserModel.find({ _id: { $in: otherIds } }).sort({ name: 1, _id: 1 }));
    return {
      isPrivate: me.isPrivate,
      friends: travellers.filter((traveller) => traveller.friendship === 'friends'),
      incoming: travellers.filter((traveller) => traveller.friendship === 'incoming'),
      outgoing: travellers.filter((traveller) => traveller.friendship === 'requested'),
    };
  }

  /** Asks the traveller to be friends. If they already asked the caller, the two become friends at once. */
  async sendRequest(userId: string, targetId: string): Promise<FriendRequestResult> {
    if (targetId === userId) {
      throw new HttpError(400, 'You cannot add yourself as a friend');
    }
    const target = await this.requireUser(targetId);
    const pair = pairKey(userId, targetId);
    const existing = await FriendshipModel.findOne({ pair });
    let created = false;
    if (existing === null) {
      try {
        await FriendshipModel.create({ requesterId: new Types.ObjectId(userId), recipientId: target._id, status: 'pending', pair });
        created = true;
      } catch (error) {
        // They asked the caller at the same moment; their request stands and shows as incoming.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    } else if (existing.status === 'pending' && existing.recipientId.toString() === userId) {
      await FriendshipModel.updateOne({ _id: existing._id }, { $set: { status: 'accepted' } });
    }
    return { traveller: await this.toTraveller(userId, target), created };
  }

  /** Accepts the request this traveller sent the caller. */
  async acceptRequest(userId: string, requesterId: string): Promise<TravellerDto> {
    const accepted = await FriendshipModel.findOneAndUpdate(
      { pair: pairKey(userId, requesterId), recipientId: new Types.ObjectId(userId), status: 'pending' },
      { $set: { status: 'accepted' } },
      { new: true },
    );
    if (!accepted) {
      throw new HttpError(404, 'Friend request not found');
    }
    return this.toTraveller(userId, await this.requireUser(requesterId));
  }

  /** Unfriends the traveller, cancels a request sent to them, or declines one from them. */
  async removeFriendship(userId: string, otherId: string): Promise<void> {
    const { deletedCount } = await FriendshipModel.deleteOne({ pair: pairKey(userId, otherId) });
    if (deletedCount === 0) {
      throw new HttpError(404, 'You have no friendship or request with this traveller');
    }
  }

  async setPrivacy(userId: string, isPrivate: boolean): Promise<{ isPrivate: boolean }> {
    const user = await UserModel.findByIdAndUpdate(userId, { $set: { isPrivate } }, { new: true });
    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    return { isPrivate: user.isPrivate };
  }

  private async requireUser(userId: string): Promise<UserDocument> {
    const user = isValidObjectId(userId) ? await UserModel.findById(userId) : null;
    if (!user) {
      throw new HttpError(404, 'Traveller not found');
    }
    return user;
  }

  private async toTraveller(viewerId: string, user: UserDocument): Promise<TravellerDto> {
    const friendship = await FriendshipModel.findOne({ pair: pairKey(viewerId, user._id.toString()) });
    return describe(viewerId, user, friendship);
  }

  private async toTravellers(viewerId: string, users: readonly UserDocument[]): Promise<TravellerDto[]> {
    const friendships = await FriendshipModel.find({ pair: { $in: users.map((user) => pairKey(viewerId, user._id.toString())) } });
    const byPair = new Map(friendships.map((friendship) => [friendship.pair, friendship]));
    return users.map((user) => describe(viewerId, user, byPair.get(pairKey(viewerId, user._id.toString()))));
  }
}
