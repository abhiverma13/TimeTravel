import { type HydratedDocument, Schema, type Types, model } from 'mongoose';

import { INTEREST_TAGS } from '../activities/interests';
import { PACES, TRANSPORT_MODES } from '../itineraries/engine/types';
import { daySchema } from '../itineraries/itineraryModel';
import type { TripSnapshot } from '../itineraries/itineraryService';
import { BUDGETS } from '../itineraries/tripOptions';

/** A trip a traveller shared: a frozen copy of the itinerary, their rating of it, and a caption. */
export interface Post {
  authorId: Types.ObjectId;
  /** The itinerary it was shared from; later changes to it do not change the post. */
  itineraryId: Types.ObjectId;
  /** The trip's city in lower case, for the feed's city filter. */
  cityKey: string;
  rating: number;
  caption: string;
  trip: TripSnapshot;
  likedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const tripSchema = new Schema<TripSnapshot>(
  {
    city: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    dayStart: { type: String, required: true },
    dayEnd: { type: String, required: true },
    interests: { type: [{ type: String, enum: INTEREST_TAGS }], default: [] },
    pace: { type: String, enum: PACES, required: true },
    transportMode: { type: String, enum: TRANSPORT_MODES, required: true },
    budget: { type: String, enum: BUDGETS, required: true },
    lodging: {
      label: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      source: { type: String, enum: ['places', 'city-centre'], required: true },
    },
    days: { type: [daySchema], default: [] },
  },
  { _id: false },
);

const postSchema = new Schema<Post>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    itineraryId: { type: Schema.Types.ObjectId, ref: 'Itinerary', required: true },
    cityKey: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    caption: { type: String, default: '' },
    trip: { type: tripSchema, required: true },
    likedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  { timestamps: true },
);
postSchema.index({ createdAt: -1 });
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ cityKey: 1, createdAt: -1 });

export type PostDocument = HydratedDocument<Post>;
export const PostModel = model<Post>('Post', postSchema);

/** A comment on a post. */
export interface PostComment {
  postId: Types.ObjectId;
  authorId: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<PostComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
  },
  { timestamps: true },
);
commentSchema.index({ postId: 1, createdAt: 1 });

export type CommentDocument = HydratedDocument<PostComment>;
export const CommentModel = model<PostComment>('Comment', commentSchema);
