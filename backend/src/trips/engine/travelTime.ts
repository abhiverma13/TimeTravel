import type { GeoPoint, TransportMode } from './types';

const EARTH_RADIUS_KM = 6371;
/** Streets are not straight lines; this inflates great-circle distance to a typical route length. */
const ROUTE_DETOUR_FACTOR = 1.3;
const WALKING_SPEED_KMH = 4.8;
/** Trips up to this route length are walked. */
const MAX_WALKING_KM = 1.5;
const TRANSIT_SPEED_KMH = 20;
const TRANSIT_WAIT_MINUTES = 8;
const DRIVING_SPEED_KMH = 30;
/** Finding parking at each stop. */
const PARKING_MINUTES = 5;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Offline travel-time estimate from straight-line distance and typical urban speeds. Walking walks everything; transit
 * walks short hops and otherwise rides at an average speed plus a wait; driving adds time to park. This is the planner's
 * fallback wherever no Google Routes travel time is available.
 */
export function estimateTravelMinutes(from: GeoPoint, to: GeoPoint, mode: TransportMode = 'transit'): number {
  const routeKm = haversineKm(from, to) * ROUTE_DETOUR_FACTOR;
  if (routeKm < 0.05) {
    return 0;
  }
  if (mode === 'walk' || (mode === 'transit' && routeKm <= MAX_WALKING_KM)) {
    return Math.ceil((routeKm / WALKING_SPEED_KMH) * 60);
  }
  if (mode === 'drive') {
    return Math.ceil((routeKm / DRIVING_SPEED_KMH) * 60 + PARKING_MINUTES);
  }
  return Math.ceil((routeKm / TRANSIT_SPEED_KMH) * 60 + TRANSIT_WAIT_MINUTES);
}
