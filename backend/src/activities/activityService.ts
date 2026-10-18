import { Types, isValidObjectId } from 'mongoose';

import { HttpError } from '../middleware/errorHandler';
import { type ActivityDocument, ActivityModel, type CityCatalogue, CityCatalogueModel, toCityKey } from './activityModel';
import { DEFAULT_CITY_MEAN_RATING, cityMeanRating, communityScore } from './communityScore';
import { INTEREST_TAGS, type InterestTag, SEARCH_PHRASE_BY_TAG, interestsForPlace, typicalVisitMinutes } from './interests';
import { type OpeningPeriod, toOpeningPeriods } from './openingHours';
import type { PlaceResult, PlacesClient } from './placesClient';
import { type ReviewDocument, type ReviewDto, ReviewModel, reviewTagsOf, toReviewDto } from './reviewModel';
import { type CommunityTags, type ReviewTags, TAG_VALUES, communityTags, tagCounterChanges, visitMinutes } from './reviewTags';

/** Google Places results are reused for a week before the city is fetched again. */
export const CATALOGUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A place together with the interest searches that returned it. */
export interface TaggedPlace extends PlaceResult {
  foundBy: InterestTag[];
}

/** The activity shape the front-end and the Itinerary Engine read. */
export interface ActivityDto {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  interests: InterestTag[];
  /** Typical visit length, replaced by travellers' reported average once enough have reported it. */
  durationMinutes: number;
  communityTags: CommunityTags;
  googleRating: number | null;
  googleRatingCount: number;
  reviewCount: number;
  communityScore: number;
  /** null when opening hours are unknown. */
  openingHours: OpeningPeriod[] | null;
}

function tagCountsOf(activity: ActivityDocument): Map<string, number> {
  return new Map(TAG_VALUES.map((value) => [value, Number(activity.get(`tagCounts.${value}`) ?? 0)]));
}

export function toActivityDto(activity: ActivityDocument, meanRating: number): ActivityDto {
  const [lng = 0, lat = 0] = activity.location.coordinates;
  return {
    id: activity._id.toString(),
    name: activity.name,
    address: activity.address,
    location: { lat, lng },
    interests: [...activity.interests],
    durationMinutes: visitMinutes(activity.reportedDurationSum, activity.reportedDurationCount, activity.durationMinutes),
    communityTags: communityTags(tagCountsOf(activity)),
    googleRating: activity.googleRating,
    googleRatingCount: activity.googleRatingCount,
    reviewCount: activity.reviewCount,
    communityScore: communityScore(
      {
        googleRating: activity.googleRating,
        googleRatingCount: activity.googleRatingCount,
        reviewCount: activity.reviewCount,
        reviewRatingSum: activity.reviewRatingSum,
      },
      meanRating,
    ),
    openingHours: activity.openingHours?.map(({ day, openMinute, closeMinute }) => ({ day, openMinute, closeMinute })) ?? null,
  };
}

export interface ReviewInput {
  rating: number;
  comment: string;
  tags: ReviewTags;
}

export interface ReviewResult {
  /** false when the traveller had already reviewed this activity and the review was edited. */
  created: boolean;
  review: ReviewDto;
  /** The activity with its community score recomputed. */
  activity: ActivityDto;
}

function byCommunityScore(left: ActivityDto, right: ActivityDto): number {
  return (
    right.communityScore - left.communityScore ||
    right.googleRatingCount + right.reviewCount - (left.googleRatingCount + left.reviewCount) ||
    left.name.localeCompare(right.name)
  );
}

/** Merges duplicate places (one place can match several interest searches). */
function mergeDuplicatePlaces(places: readonly TaggedPlace[]): TaggedPlace[] {
  const merged = new Map<string, TaggedPlace>();
  for (const place of places) {
    const existing = merged.get(place.placeId);
    merged.set(place.placeId, existing ? { ...existing, foundBy: [...existing.foundBy, ...place.foundBy] } : place);
  }
  return [...merged.values()];
}

/** Activity & Review Service: the cached activity catalogue per city. */
export class ActivityService {
  constructor(
    private readonly placesClient: PlacesClient | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Activities in a city, best community score first, optionally limited to one interest. */
  async listActivities(city: string, interest?: InterestTag): Promise<ActivityDto[]> {
    const cityKey = toCityKey(city);
    const catalogue = await this.ensureCatalogue(cityKey, city);
    const activities = await ActivityModel.find(interest ? { cityKey, interests: interest } : { cityKey });
    return activities.map((activity) => toActivityDto(activity, catalogue.meanRating)).sort(byCommunityScore);
  }

  /** Creates or edits the traveller's review of an activity and returns its updated community score. */
  async reviewActivity(userId: string, activityId: string, input: ReviewInput): Promise<ReviewResult> {
    if (!isValidObjectId(activityId) || (await ActivityModel.exists({ _id: activityId })) === null) {
      throw new HttpError(404, 'Activity not found');
    }
    const activityObjectId = new Types.ObjectId(activityId);
    const userObjectId = new Types.ObjectId(userId);

    const existing = await ReviewModel.findOne({ activityId: activityObjectId, userId: userObjectId });
    const counterChanges = tagCounterChanges(existing ? reviewTagsOf(existing) : null, input.tags);
    let review: ReviewDocument;
    if (existing) {
      counterChanges.set('reviewRatingSum', input.rating - existing.rating);
      existing.rating = input.rating;
      existing.comment = input.comment;
      existing.tags = input.tags;
      review = await existing.save();
    } else {
      counterChanges.set('reviewCount', 1);
      counterChanges.set('reviewRatingSum', input.rating);
      review = await ReviewModel.create({ activityId: activityObjectId, userId: userObjectId, ...input });
    }
    await ActivityModel.updateOne({ _id: activityObjectId }, { $inc: Object.fromEntries(counterChanges) });

    const activity = await ActivityModel.findById(activityObjectId);
    if (!activity) {
      throw new HttpError(404, 'Activity not found');
    }
    const catalogue = await CityCatalogueModel.findOne({ cityKey: activity.cityKey });
    return {
      created: existing === null,
      review: toReviewDto(review),
      activity: toActivityDto(activity, catalogue?.meanRating ?? DEFAULT_CITY_MEAN_RATING),
    };
  }

  /** Stores places as a city's catalogue. Reviews already left on known places are kept. */
  async importPlaces(city: string, places: readonly TaggedPlace[]): Promise<CityCatalogue> {
    const cityKey = toCityKey(city);
    const uniquePlaces = mergeDuplicatePlaces(places);
    if (uniquePlaces.length > 0) {
      await ActivityModel.bulkWrite(
        uniquePlaces.map((place) => {
          const interests = interestsForPlace(place.types, place.foundBy);
          return {
            updateOne: {
              filter: { placeId: place.placeId },
              update: {
                $set: {
                  cityKey,
                  name: place.name,
                  address: place.address,
                  location: { type: 'Point', coordinates: [place.location.lng, place.location.lat] },
                  interests,
                  durationMinutes: typicalVisitMinutes(interests),
                  googleRating: place.rating,
                  googleRatingCount: place.userRatingCount,
                  openingHours: toOpeningPeriods(place.openingPeriods),
                },
              },
              upsert: true,
            },
          };
        }),
      );
    }
    const catalogue = {
      cityKey,
      displayName: city.trim(),
      fetchedAt: this.now(),
      meanRating: cityMeanRating(uniquePlaces.map((place) => place.rating)),
      activityCount: uniquePlaces.length,
    };
    await CityCatalogueModel.updateOne({ cityKey }, { $set: catalogue }, { upsert: true });
    return catalogue;
  }

  private async ensureCatalogue(cityKey: string, city: string): Promise<CityCatalogue> {
    const cached = await CityCatalogueModel.findOne({ cityKey });
    if (cached && this.now().getTime() - cached.fetchedAt.getTime() < CATALOGUE_TTL_MS) {
      return cached;
    }
    if (this.placesClient === null) {
      if (cached) {
        return cached;
      }
      throw new HttpError(503, `No activities are available for ${city.trim()}: Google Places is not configured`);
    }

    let places: TaggedPlace[];
    try {
      places = await this.searchCity(this.placesClient, city.trim());
    } catch (error) {
      if (cached) {
        console.warn('Google Places refresh failed; serving the cached catalogue', error);
        return cached;
      }
      console.error('Google Places search failed', error);
      throw new HttpError(502, 'Could not load activities from Google Places');
    }
    return this.importPlaces(city, places);
  }

  /** One Places text search per interest tag, e.g. "museums and galleries in Vancouver". */
  private async searchCity(placesClient: PlacesClient, city: string): Promise<TaggedPlace[]> {
    const results = await Promise.all(
      INTEREST_TAGS.map(async (tag) => {
        const phrase = SEARCH_PHRASE_BY_TAG.get(tag) ?? tag;
        const places = await placesClient.searchText(`${phrase} in ${city}`);
        return places.map((place) => ({ ...place, foundBy: [tag] }));
      }),
    );
    return results.flat();
  }
}
