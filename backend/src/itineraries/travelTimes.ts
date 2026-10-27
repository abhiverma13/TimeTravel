import { Schema, model } from 'mongoose';

import { TRANSPORT_MODES, type GeoPoint, type TransportMode, type TravelTimeEstimator } from './engine/types';
import { estimateTravelMinutes } from './engine/travelTime';
import { type RoutesClient, matrixElementLimit } from './routesClient';

/** How long a Google Routes travel time is reused before it is fetched again. */
export const TRAVEL_TIME_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Generation fetches real travel times among the lodging and this many best candidates; other pairs are estimated. */
export const ROUTED_CANDIDATES = 12;

interface TravelTime {
  mode: TransportMode;
  /** "lat,lng" rounded to 5 decimals (about a metre). */
  from: string;
  to: string;
  minutes: number;
  fetchedAt: Date;
}

const travelTimeSchema = new Schema<TravelTime>({
  mode: { type: String, enum: TRANSPORT_MODES, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  minutes: { type: Number, required: true },
  fetchedAt: { type: Date, required: true },
});
travelTimeSchema.index({ mode: 1, from: 1, to: 1 }, { unique: true });
// MongoDB deletes each cached time a week after it was fetched.
travelTimeSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: TRAVEL_TIME_TTL_SECONDS });

export const TravelTimeModel = model<TravelTime>('TravelTime', travelTimeSchema);

export function pointKey(point: GeoPoint): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function pairKey(from: string, to: string): string {
  return `${from}|${to}`;
}

/** A travel-time function, and whether any of its times came from Google Routes. */
export interface TravelTimes {
  travelMinutes: TravelTimeEstimator;
  usesRoutes: boolean;
}

/** Splits `items` into chunks of at most `size`. */
function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

/** Real travel times from Google Routes where available, cached in MongoDB for a week; the offline estimate otherwise. */
export class TravelTimeService {
  constructor(private readonly routesClient: RoutesClient | null) {}

  /**
   * Travel times between these points: cached Routes times, plus (with `fetchMissing`) any missing pairs requested from
   * Routes now. Every other pair, and every pair when Routes is unavailable or fails, uses the offline estimate.
   */
  async forPoints(points: readonly GeoPoint[], mode: TransportMode, fetchMissing: boolean): Promise<TravelTimes> {
    const unique = [...new Map(points.map((point) => [pointKey(point), point])).values()];
    const keys = unique.map(pointKey);
    const cached = await TravelTimeModel.find({ mode, from: { $in: keys }, to: { $in: keys } });
    const known = new Map(cached.map((entry) => [pairKey(entry.from, entry.to), entry.minutes]));
    if (fetchMissing && this.routesClient !== null && unique.length > 1) {
      const missingOrigins = unique.filter((from) => unique.some((to) => from !== to && !known.has(pairKey(pointKey(from), pointKey(to)))));
      for (const [key, minutes] of await this.fetch(missingOrigins, unique, mode)) {
        known.set(key, minutes);
      }
    }
    return {
      travelMinutes: (from, to) => known.get(pairKey(pointKey(from), pointKey(to))) ?? estimateTravelMinutes(from, to, mode),
      usesRoutes: known.size > 0,
    };
  }

  // Requests the matrix in pieces within Google's per-request limit and caches every time it returns.
  private async fetch(origins: readonly GeoPoint[], destinations: readonly GeoPoint[], mode: TransportMode): Promise<Map<string, number>> {
    const fetched = new Map<string, number>();
    if (origins.length === 0 || this.routesClient === null) {
      return fetched;
    }
    const originsPerRequest = Math.max(1, Math.floor(matrixElementLimit(mode) / destinations.length));
    try {
      for (const group of chunks(origins, originsPerRequest)) {
        for (const entry of await this.routesClient.computeMatrix(group, destinations, mode)) {
          const from = group.at(entry.originIndex);
          const to = destinations.at(entry.destinationIndex);
          if (from && to) {
            fetched.set(pairKey(pointKey(from), pointKey(to)), entry.minutes);
          }
        }
      }
    } catch (error) {
      // Plans still work from the offline estimate; whatever arrived before the failure is kept.
      console.warn('Google Routes travel times unavailable; using estimates', error);
    }
    if (fetched.size === 0) {
      return fetched;
    }
    const fetchedAt = new Date();
    await TravelTimeModel.bulkWrite(
      [...fetched].map(([key, minutes]) => {
        const [from = '', to = ''] = key.split('|');
        return { updateOne: { filter: { mode, from, to }, update: { $set: { minutes, fetchedAt } }, upsert: true } };
      }),
    );
    return fetched;
  }
}
