import { z } from 'zod';

import type { GeoPoint, TransportMode } from './engine/types';

const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const ROUTE_MATRIX_FIELD_MASK = 'originIndex,destinationIndex,duration,condition';
const ROUTES_TIMEOUT_MS = 10_000;
const SECONDS_PER_MINUTE = 60;

const TRAVEL_MODES: ReadonlyMap<TransportMode, string> = new Map<TransportMode, string>([
  ['walk', 'WALK'],
  ['transit', 'TRANSIT'],
  ['drive', 'DRIVE'],
]);

/** Google's per-request limit on origins x destinations: 100 for transit, 625 otherwise. */
export function matrixElementLimit(mode: TransportMode): number {
  return mode === 'transit' ? 100 : 625;
}

/** One travel time between origins[originIndex] and destinations[destinationIndex]. */
export interface MatrixEntry {
  originIndex: number;
  destinationIndex: number;
  minutes: number;
}

/** External module boundary for Google Routes, so tests can substitute it. */
export interface RoutesClient {
  /** Travel times for every origin-destination pair that has a route; pairs without one are left out. */
  computeMatrix(origins: readonly GeoPoint[], destinations: readonly GeoPoint[], mode: TransportMode): Promise<MatrixEntry[]>;
}

export class RoutesApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutesApiError';
  }
}

// Proto3 JSON leaves out zero values, so a missing index means 0.
const elementSchema = z.object({
  originIndex: z.number().int().min(0).default(0),
  destinationIndex: z.number().int().min(0).default(0),
  /** Seconds, written like "300s". */
  duration: z.string().optional(),
  condition: z.string().optional(),
});
const matrixResponseSchema = z.array(elementSchema);

function waypoint(point: GeoPoint): object {
  return { waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } } };
}

/** Calls Routes API Compute Route Matrix: https://developers.google.com/maps/documentation/routes/compute_route_matrix */
export class GoogleRoutesClient implements RoutesClient {
  constructor(private readonly apiKey: string) {}

  async computeMatrix(origins: readonly GeoPoint[], destinations: readonly GeoPoint[], mode: TransportMode): Promise<MatrixEntry[]> {
    const response = await fetch(ROUTE_MATRIX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': ROUTE_MATRIX_FIELD_MASK,
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: destinations.map(waypoint),
        travelMode: TRAVEL_MODES.get(mode) ?? 'TRANSIT',
      }),
      signal: AbortSignal.timeout(ROUTES_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new RoutesApiError(`Route matrix request failed with HTTP ${String(response.status)}`);
    }
    const parsed = matrixResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new RoutesApiError('Route matrix request returned an unexpected response');
    }
    return parsed.data.flatMap((element) => {
      const seconds = Number.parseFloat(element.duration ?? '');
      return element.condition === 'ROUTE_EXISTS' && Number.isFinite(seconds)
        ? [{ originIndex: element.originIndex, destinationIndex: element.destinationIndex, minutes: Math.ceil(seconds / SECONDS_PER_MINUTE) }]
        : [];
    });
  }
}
