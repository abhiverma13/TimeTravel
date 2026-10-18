import type { GeoPoint } from './types';

const EARTH_RADIUS_KM = 6371;
/** Streets are not straight lines; this inflates great-circle distance to a typical route length. */
const ROUTE_DETOUR_FACTOR = 1.3;
const WALKING_SPEED_KMH = 4.8;
/** Trips up to this route length are walked. */
const MAX_WALKING_KM = 1.5;
const TRANSIT_SPEED_KMH = 20;
const TRANSIT_WAIT_MINUTES = 8;

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
 * Offline travel-time estimate: walk short hops, otherwise take transit at an average urban speed plus a
 * wait. This is the planner's fallback when no travel-time matrix from Google Routes is available.
 */
export function estimateTravelMinutes(from: GeoPoint, to: GeoPoint): number {
  const routeKm = haversineKm(from, to) * ROUTE_DETOUR_FACTOR;
  if (routeKm < 0.05) {
    return 0;
  }
  if (routeKm <= MAX_WALKING_KM) {
    return Math.ceil((routeKm / WALKING_SPEED_KMH) * 60);
  }
  return Math.ceil((routeKm / TRANSIT_SPEED_KMH) * 60 + TRANSIT_WAIT_MINUTES);
}
