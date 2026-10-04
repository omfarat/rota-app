import poisJson from "@/data/pois.json";
import type { Poi } from "./types";

// Kept apart from data.ts on purpose: the city list is small and needed by the
// layout, while this file is ~1.2 MB and only route planning needs it.
const pois = poisJson as Record<string, Poi[]>;

export function getPois(slug: string): Poi[] {
  return pois[slug] ?? [];
}