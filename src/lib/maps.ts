import type { LatLon } from "./route";

const coord = (p: LatLon) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

/**
 * Google only accepts a limited number of intermediate waypoints, so a longer
 * route has to be handed over as several legs instead of silently losing stops.
 */
const WAYPOINT_LIMIT = 9;

/** start + all stops, which is what actually has to fit into one Maps link. */
export function routePoints(origin: LatLon, stops: LatLon[]): LatLon[] {
  return [origin, ...stops];
}

export function splitLegs<T>(points: T[]): T[][] {
  if (points.length <= WAYPOINT_LIMIT + 2) return [points];
  const legs: T[][] = [];
  for (let i = 0; i < points.length - 1; i += WAYPOINT_LIMIT) {
    legs.push(points.slice(i, i + WAYPOINT_LIMIT + 1));
  }
  return legs;
}

export function googleMapsUrl(origin: LatLon, stops: LatLon[]): string {
  if (!stops.length) return `https://www.google.com/maps/dir/?api=1&origin=${coord(origin)}`;
  const params = new URLSearchParams({
    api: "1",
    origin: coord(origin),
    destination: coord(stops[stops.length - 1]),
    travelmode: "walking",
  });
  // Intermediate stops only: the last one is already the destination.
  const waypoints = stops.slice(0, -1).map(coord).join("|");
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appleMapsUrl(origin: LatLon, stops: LatLon[]): string {
  if (!stops.length) return `https://maps.apple.com/?saddr=${coord(origin)}`;
  const src = encodeURIComponent(coord(origin));
  const dest = encodeURIComponent(coord(stops[stops.length - 1]));
  return `https://maps.apple.com/?saddr=${src}&daddr=${dest}&dirflg=w`;
}

export function googleSinglePlaceUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

export function osmUrl(p: LatLon): string {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`;
}