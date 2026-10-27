import { Types, isValidObjectId } from 'mongoose';

import type { InterestTag } from '../activities/interests';
import { UserModel } from '../auth/userModel';
import type { Audience, FriendService } from '../friends/friendService';
import type { Pace, TransportMode } from '../itineraries/engine/types';
import type { ItineraryDto, ItineraryService } from '../itineraries/itineraryService';
import type { Budget } from '../itineraries/tripOptions';
import { HttpError } from '../middleware/errorHandler';
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
  itineraryId: string;
  rating: number;
  caption: string;
}

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

// One traveller's posts, or the feed's authors: friends (and the caller), or everyone but private strangers.
function authorFilter(feed: Feed, authorId: string | undefined, audience: Audience): object {
  if (authorId !== undefined) {
    return new Types.ObjectId(authorId);
  }
  return feed === 'friends' ? { $in: audience.friendIds } : { $nin: audience.hiddenIds };
}

function author(id: Types.ObjectId, names: ReadonlyMap<string, string>): PostAuthorDto {
  return { id: id.toString(), name: names.get(id.toString()) ?? FORMER_TRAVELLER };
}

/** Feed Service: shared trips, their likes and comments, and copying a shared trip into your own trips. */
export class PostService {
  constructor(
    private readonly itineraryService: ItineraryService,
    private readonly friendService: FriendService,
  ) {}

  /** Shares a frozen copy of one of the caller's itineraries, with a rating and a caption. */
  async createPost(userId: string, input: NewPost): Promise<PostDetailDto> {
    const trip = await this.itineraryService.snapshot(userId, input.itineraryId);
    if (trip.days.every((day) => day.stops.length === 0)) {
      throw new HttpError(422, 'This trip has no stops to share');
    }
    const post = await PostModel.create({
      authorId: new Types.ObjectId(userId),
      itineraryId: new Types.ObjectId(input.itineraryId),
      cityKey: cityKey(trip.city),
      rating: input.rating,
      caption: input.caption,
      trip,
    });
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
      authorId: authorFilter(query.feed, authorId, audience),
      ...(query.city === undefined ? {} : { cityKey: cityKey(query.city) }),
      ...(query.before === undefined ? {} : { createdAt: { $lt: query.before } }),
    };
    const posts = await PostModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(FEED_PAGE_SIZE);
    const names = await authorNames(posts.map((post) => post.authorId));
    const commentCounts = await this.commentCounts(posts);
    return posts.map((post) => this.toPostDto(viewerId, post, names, commentCounts.get(post._id.toString()) ?? 0));
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
  }

  /** Likes or unlikes the post; doing either twice changes nothing. */
  async setLike(viewerId: string, postId: string, liked: boolean): Promise<LikeState> {
    const post = await this.requireVisible(viewerId, postId);
    const viewer = new Types.ObjectId(viewerId);
    const updated = await PostModel.findByIdAndUpdate(post._id, liked ? { $addToSet: { likedBy: viewer } } : { $pull: { likedBy: viewer } }, { new: true });
    if (!updated) {
      throw new HttpError(404, 'Post not found');
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
  async copyPost(viewerId: string, postId: string, startDate: string): Promise<ItineraryDto> {
    const post = await this.requireVisible(viewerId, postId);
    const names = await authorNames([post.authorId]);
    const note = `Copied from ${author(post.authorId, names).name}'s ${post.trip.city} trip.`;
    return this.itineraryService.copyTrip(viewerId, post.trip, startDate, note);
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

  private toPostDto(viewerId: string, post: PostDocument, names: ReadonlyMap<string, string>, commentCount: number): PostDto {
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
      createdAt: post.createdAt.toISOString(),
    };
  }

  private async toDetail(viewerId: string, post: PostDocument): Promise<PostDetailDto> {
    const names = await authorNames([post.authorId]);
    const commentCount = await CommentModel.countDocuments({ postId: post._id });
    const { trip } = post;
    return {
      ...this.toPostDto(viewerId, post, names, commentCount),
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
