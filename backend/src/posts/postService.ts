import { Types, isValidObjectId } from 'mongoose';

import type { InterestTag } from '../activities/interests';
import { UserModel } from '../auth/userModel';
import type { Audience, FriendService } from '../friends/friendService';
import type { Pace, TransportMode } from '../trips/engine/types';
import type { TripDto, TripService } from '../trips/tripService';
import type { Budget } from '../trips/tripOptions';
import { HttpError } from '../middleware/errorHandler';
import { LiveEvents, firstNameOf } from '../sync/liveEvents';
import { type CommentDocument, CommentModel, type PostDocument, PostModel } from './postModel';

export const FEEDS = ['friends', 'everyone'] as const;
export type Feed = (typeof FEEDS)[number];

const FEED_PAGE_SIZE = 20;
const COMMENT_LIMIT = 100;
const FORMER_TRAVELLER = 'Former traveller';

export interface PostAuthorDto {
  id: string;
  name: string;
}

export interface PostDto {
  id: string;
  author: PostAuthorDto;
  city: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  stopCount: number;
  rating: number;
  caption: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  /** True for the caller's own posts, which they may delete. */
  mine: boolean;
  /** How many travellers shared this trip: its planner and everyone whose copy is linked to it. */
  takenBy: number;
  /** The mean of all their ratings, to one decimal. */
  averageRating: number;
  /** For a copy linked to its original: that post and its planner. The feed shows the original's card instead. */
  original: { postId: string; planner: PostAuthorDto } | null;
  createdAt: string;
}

export interface PostStopDto {
  activityId: string;
  name: string;
  interests: InterestTag[];
  startTime: string;
  endTime: string;
  travelMinutes: number;
  communityScore: number;
}

/** A post with its frozen trip, for reading it in full. */
export interface PostDetailDto extends PostDto {
  trip: {
    dayStart: string;
    dayEnd: string;
    pace: Pace;
    transportMode: TransportMode;
    budget: Budget;
    interests: InterestTag[];
    lodging: string;
    days: { date: string; weekday: number; returnTravelMinutes: number; stops: PostStopDto[] }[];
  };
}

export interface CommentDto {
  id: string;
  author: PostAuthorDto;
  text: string;
  /** True for the caller's own comments. */
  mine: boolean;
  createdAt: string;
}

export interface NewPost {
  tripId: string;
  rating: number;
  caption: string;
  /** For a copy whose stops changed: whether the feed should show it as part of the original's card. */
  linkToOriginal?: boolean | undefined;
}

/** Someone who shared a trip: its planner, or a traveller whose copy is linked to it. */
export interface TakerDto {
  postId: string;
  traveller: PostAuthorDto;
  rating: number;
  caption: string;
  planner: boolean;
  createdAt: string;
}

/** The ratings of a post's linked copies, by original post id. */
type LinkedRatings = Map<string, number[]>;

export interface FeedQuery {
  feed: Feed;
  city?: string | undefined;
  /** Only this traveller's posts, if the caller may see them. */
  authorId?: string | undefined;
  /** Only posts older than this, for the next page. */
  before?: Date | undefined;
}

export interface LikeState {
  likeCount: number;
  likedByMe: boolean;
}

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

async function authorNames(authorIds: readonly Types.ObjectId[]): Promise<Map<string, string>> {
  const users = await UserModel.find({ _id: { $in: authorIds } }, { name: 1 });
  return new Map(users.map((user) => [user._id.toString(), user.name]));
}

// One traveller's posts (linked copies included, as their history), or a feed of cards: originals and posts of their
// own, never a linked copy. Friends' cards are their posts and the originals they took; everyone's leave out private
// strangers.
async function scopeOf(feed: Feed, authorId: string | undefined, audience: Audience): Promise<object> {
  if (authorId !== undefined) {
    return { authorId: new Types.ObjectId(authorId) };
  }
  const cards = { originalPostId: null, authorId: { $nin: audience.hiddenIds } };
  if (feed === 'everyone') {
    return cards;
  }
  const takenByFriends = await PostModel.distinct('originalPostId', { authorId: { $in: audience.friendIds }, originalPostId: { $ne: null } });
  return { ...cards, $or: [{ authorId: { $in: audience.friendIds } }, { _id: { $in: takenByFriends } }] };
}

async function linkedRatings(posts: readonly PostDocument[]): Promise<LinkedRatings> {
  const linked = await PostModel.find({ originalPostId: { $in: posts.map((post) => post._id) } }, { originalPostId: 1, rating: 1 });
  const ratings: LinkedRatings = new Map();
  for (const copy of linked) {
    const key = copy.originalPostId?.toString() ?? '';
    ratings.set(key, [...(ratings.get(key) ?? []), copy.rating]);
  }
  return ratings;
}

function author(id: Types.ObjectId, names: ReadonlyMap<string, string>): PostAuthorDto {
  return { id: id.toString(), name: names.get(id.toString()) ?? FORMER_TRAVELLER };
}

/** What a post's DTO needs besides the post. */
interface PostExtras {
  names: ReadonlyMap<string, string>;
  commentCount: number;
  /** The ratings of the copies linked to it. */
  linkedRatings: number[];
  /** For a linked copy: the planner of its original. */
  plannerId?: Types.ObjectId | undefined;
}

/** Feed Service: shared trips, their likes and comments, and copying a shared trip into your own trips. */
export class PostService {
  constructor(
    private readonly tripService: TripService,
    private readonly friendService: FriendService,
    private readonly events: LiveEvents = new LiveEvents(),
  ) {}

  /**
   * Shares a frozen copy of one of the caller's trips, with a rating and a caption. A copy of a shared trip is linked to
   * its original (and shown on the feed as part of the original's card) when its stops are unchanged, or when the
   * traveller chooses to link a changed one; a changed copy must say which (400 otherwise).
   */
  async createPost(userId: string, input: NewPost): Promise<PostDetailDto> {
    const trip = await this.tripService.snapshot(userId, input.tripId);
    if (trip.days.every((day) => day.stops.length === 0)) {
      throw new HttpError(422, 'This trip has no stops to share');
    }
    const original = await this.originalOf(userId, input);
    const post = await PostModel.create({
      authorId: new Types.ObjectId(userId),
      tripId: new Types.ObjectId(input.tripId),
      cityKey: cityKey(trip.city),
      rating: input.rating,
      caption: input.caption,
      trip,
      originalPostId: original?._id,
    });
    if (original) {
      await this.events.publish([original.authorId], {
        type: 'tripTaken',
        actorId: userId,
        postId: original._id.toString(),
        text: `${await firstNameOf(userId)} took your ${original.trip.city} trip`,
      });
    }
    return this.toDetail(userId, post);
  }

  /** A page of posts the caller may see, newest first: friends' (and their own), everyone's, or one traveller's. */
  async listPosts(viewerId: string, query: FeedQuery): Promise<PostDto[]> {
    const audience = await this.friendService.audience(viewerId);
    const { authorId } = query;
    if (authorId !== undefined && audience.hiddenIds.some((id) => id.toString() === authorId)) {
      return [];
    }
    const filter = {
      ...(await scopeOf(query.feed, authorId, audience)),
      ...(query.city === undefined ? {} : { cityKey: cityKey(query.city) }),
      ...(query.before === undefined ? {} : { createdAt: { $lt: query.before } }),
    };
    const posts = await PostModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(FEED_PAGE_SIZE);
    const originals = await PostModel.find({ _id: { $in: posts.flatMap((post) => post.originalPostId ?? []) } }, { authorId: 1 });
    const [names, commentCounts, ratings] = await Promise.all([
      authorNames([...posts, ...originals].map((post) => post.authorId)),
      this.commentCounts(posts),
      linkedRatings(posts),
    ]);
    const plannerOf = new Map(originals.map((original) => [original._id.toString(), original.authorId]));
    return posts.map((post) =>
      this.toPostDto(viewerId, post, {
        names,
        commentCount: commentCounts.get(post._id.toString()) ?? 0,
        linkedRatings: ratings.get(post._id.toString()) ?? [],
        plannerId: post.originalPostId ? plannerOf.get(post.originalPostId.toString()) : undefined,
      }),
    );
  }

  async getPost(viewerId: string, postId: string): Promise<PostDetailDto> {
    return this.toDetail(viewerId, await this.requireVisible(viewerId, postId));
  }

  /** The author deletes their post and its comments. */
  async deletePost(viewerId: string, postId: string): Promise<void> {
    const post = await this.requireVisible(viewerId, postId);
    if (post.authorId.toString() !== viewerId) {
      throw new HttpError(403, 'Only the author can delete this post');
    }
    await CommentModel.deleteMany({ postId: post._id });
    await PostModel.deleteOne({ _id: post._id });
    // Copies linked to it become posts of their own again.
    await PostModel.updateMany({ originalPostId: post._id }, { $unset: { originalPostId: 1 } });
  }

  /**
   * Everyone who shared this trip, planner first: the caller sees public travellers and their friends (and themselves);
   * private strangers are only counted.
   */
  async listTakers(viewerId: string, postId: string): Promise<{ takers: TakerDto[]; hiddenCount: number }> {
    const shown = await this.requireVisible(viewerId, postId);
    const original = shown.originalPostId ? ((await PostModel.findById(shown.originalPostId)) ?? shown) : shown;
    const copies = await PostModel.find({ originalPostId: original._id }).sort({ createdAt: 1, _id: 1 });
    const { hiddenIds } = await this.friendService.audience(viewerId);
    const hidden = new Set(hiddenIds.map((id) => id.toString()));
    const visible = [original, ...copies].filter((post) => !hidden.has(post.authorId.toString()));
    const names = await authorNames(visible.map((post) => post.authorId));
    const takers = visible.map((post) => ({
      postId: post._id.toString(),
      traveller: author(post.authorId, names),
      rating: post.rating,
      caption: post.caption,
      planner: post._id.equals(original._id),
      createdAt: post.createdAt.toISOString(),
    }));
    return { takers, hiddenCount: copies.length + 1 - visible.length };
  }

  /** Likes or unlikes the post; doing either twice changes nothing. */
  async setLike(viewerId: string, postId: string, liked: boolean): Promise<LikeState> {
    const post = await this.requireVisible(viewerId, postId);
    const viewer = new Types.ObjectId(viewerId);
    const change = liked ? { $addToSet: { likedBy: viewer } } : { $pull: { likedBy: viewer } };
    const updated = await PostModel.findByIdAndUpdate(post._id, change, { new: true });
    if (!updated) {
      throw new HttpError(404, 'Post not found');
    }
    if (liked && !post.likedBy.some((id) => id.equals(viewer))) {
      await this.events.publish([post.authorId], {
        type: 'postLiked',
        actorId: viewerId,
        postId,
        text: `${await firstNameOf(viewerId)} liked your ${post.trip.city} trip`,
      });
    }
    return { likeCount: updated.likedBy.length, likedByMe: liked };
  }

  /** The post's comments, oldest first. */
  async listComments(viewerId: string, postId: string): Promise<CommentDto[]> {
    const post = await this.requireVisible(viewerId, postId);
    const comments = await CommentModel.find({ postId: post._id }).sort({ createdAt: 1, _id: 1 }).limit(COMMENT_LIMIT);
    const names = await authorNames(comments.map((comment) => comment.authorId));
    return comments.map((comment) => this.toCommentDto(viewerId, comment, names));
  }

  async addComment(viewerId: string, postId: string, text: string): Promise<CommentDto> {
    const post = await this.requireVisible(viewerId, postId);
    const comment = await CommentModel.create({ postId: post._id, authorId: new Types.ObjectId(viewerId), text });
    await this.events.publish([post.authorId], {
      type: 'postCommented',
      actorId: viewerId,
      postId,
      text: `${await firstNameOf(viewerId)} commented on your ${post.trip.city} trip`,
    });
    return this.toCommentDto(viewerId, comment, await authorNames([comment.authorId]));
  }

  /** The comment's author, or the post's author, deletes a comment. */
  async deleteComment(viewerId: string, postId: string, commentId: string): Promise<void> {
    const post = await this.requireVisible(viewerId, postId);
    const comment = isValidObjectId(commentId) ? await CommentModel.findOne({ _id: new Types.ObjectId(commentId), postId: post._id }) : null;
    if (!comment) {
      throw new HttpError(404, 'Comment not found');
    }
    if (comment.authorId.toString() !== viewerId && post.authorId.toString() !== viewerId) {
      throw new HttpError(403, "Only the comment's author or the post's author can delete it");
    }
    await CommentModel.deleteOne({ _id: comment._id });
  }

  /** Copies the shared trip into the caller's own trips, starting on `startDate`. */
  async copyPost(viewerId: string, postId: string, startDate: string): Promise<TripDto> {
    const post = await this.requireVisible(viewerId, postId);
    const names = await authorNames([post.authorId]);
    const note = `Copied from ${author(post.authorId, names).name}'s ${post.trip.city} trip.`;
    // A copy of a copy links back to the first trip, so all of them share one card.
    const original = post.originalPostId ? ((await PostModel.findById(post.originalPostId)) ?? post) : post;
    return this.tripService.copyTrip(viewerId, post.trip, startDate, note, { postId: original._id, authorId: original.authorId });
  }

  // The post a new post of this trip links to, if any: the trip's original, when it still exists and the copy is
  // unchanged or the traveller chose to link it.
  private async originalOf(userId: string, input: NewPost): Promise<PostDocument | null> {
    const source = await this.tripService.getTrip(userId, input.tripId);
    const original = source.copiedFrom ? await PostModel.findById(source.copiedFrom.postId) : null;
    if (!original) {
      return null;
    }
    if (source.modifiedSinceCopy && input.linkToOriginal === undefined) {
      throw new HttpError(400, 'This trip changed since it was copied: say whether to link it back to the original (linkToOriginal)');
    }
    return !source.modifiedSinceCopy || input.linkToOriginal === true ? original : null;
  }

  // A post the caller may see; anything else is "not found", so private accounts' posts are not revealed.
  private async requireVisible(viewerId: string, postId: string): Promise<PostDocument> {
    const post = isValidObjectId(postId) ? await PostModel.findById(postId) : null;
    if (!post || !(await this.friendService.canSee(viewerId, post.authorId.toString()))) {
      throw new HttpError(404, 'Post not found');
    }
    return post;
  }

  private async commentCounts(posts: readonly PostDocument[]): Promise<Map<string, number>> {
    const counts = await CommentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { postId: { $in: posts.map((post) => post._id) } } },
      { $group: { _id: '$postId', count: { $sum: 1 } } },
    ]);
    return new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
  }

  private toPostDto(viewerId: string, post: PostDocument, extras: PostExtras): PostDto {
    const { names, commentCount, linkedRatings: ratings, plannerId } = extras;
    const allRatings = [post.rating, ...ratings];
    return {
      id: post._id.toString(),
      author: author(post.authorId, names),
      city: post.trip.city,
      startDate: post.trip.startDate,
      endDate: post.trip.endDate,
      dayCount: post.trip.days.length,
      stopCount: post.trip.days.reduce((count, day) => count + day.stops.length, 0),
      rating: post.rating,
      caption: post.caption,
      likeCount: post.likedBy.length,
      likedByMe: post.likedBy.some((id) => id.toString() === viewerId),
      commentCount,
      mine: post.authorId.toString() === viewerId,
      takenBy: allRatings.length,
      averageRating: Math.round((allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length) * 10) / 10,
      original: post.originalPostId && plannerId ? { postId: post.originalPostId.toString(), planner: author(plannerId, names) } : null,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private async toDetail(viewerId: string, post: PostDocument): Promise<PostDetailDto> {
    const original = post.originalPostId ? await PostModel.findById(post.originalPostId, { authorId: 1 }) : null;
    const names = await authorNames(original ? [post.authorId, original.authorId] : [post.authorId]);
    const commentCount = await CommentModel.countDocuments({ postId: post._id });
    const linked = (await linkedRatings([post])).get(post._id.toString()) ?? [];
    const { trip } = post;
    return {
      ...this.toPostDto(viewerId, post, { names, commentCount, linkedRatings: linked, plannerId: original?.authorId }),
      trip: {
        dayStart: trip.dayStart,
        dayEnd: trip.dayEnd,
        pace: trip.pace,
        transportMode: trip.transportMode,
        budget: trip.budget,
        interests: [...trip.interests],
        lodging: trip.lodging.label,
        days: trip.days.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          returnTravelMinutes: day.returnTravelMinutes,
          stops: day.stops.map((stop) => ({
            activityId: stop.activityId.toString(),
            name: stop.name,
            interests: [...stop.interests],
            startTime: stop.startTime,
            endTime: stop.endTime,
            travelMinutes: stop.travelMinutes,
            communityScore: stop.communityScore,
          })),
        })),
      },
    };
  }

  private toCommentDto(viewerId: string, comment: CommentDocument, names: ReadonlyMap<string, string>): CommentDto {
    return {
      id: comment._id.toString(),
      author: author(comment.authorId, names),
      text: comment.text,
      mine: comment.authorId.toString() === viewerId,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
