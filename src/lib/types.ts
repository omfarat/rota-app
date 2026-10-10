export type Theme = "genel" | "tarih" | "muze" | "lezzet" | "doga" | "manzara";

export interface City {
  slug: string;
  name: string;
  plate: string;
  region: string;
  lat: number;
  lon: number;
  summary: string | null;
  photo: string | null;
  photoBy?: string | null;
  photoLicense?: string | null;
  highlight: string | null;
  poiCount: number;
  themes: Theme[];
}

export interface Poi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  theme: Theme;
  indoor: boolean;
  duration: number;
  priority: number;
  district?: string;
  distanceKm?: number;
  image?: string;
  imageBy?: string | null;
  imageLicense?: string | null;
  imageSource?: "commons" | "mapillary" | null;
  heritage?: string;
  description?: string;
}

export const THEMES: {
  id: Theme;
  label: string;
  icon: string;
  blurb: string;
}[] = [
  { id: "genel", label: "Genel", icon: "🗺️", blurb: "Şehrin en bilinen yerleri" },
  { id: "tarih", label: "Tarih", icon: "🏛️", blurb: "Antik kentler, kaleler, camiler" },
  { id: "muze", label: "Müze", icon: "🖼️", blurb: "Sanat ve arkeoloji müzeleri" },
  { id: "lezzet", label: "Lezzet", icon: "🍽️", blurb: "Restoranlar, pazarlar, lokumlar" },
  { id: "doga", label: "Doğa", icon: "🌳", blurb: "Parklar, doğa rezervleri, bahçeler" },
  { id: "manzara", label: "Manzara", icon: "🌄", blurb: "Seyir noktaları ve teraslar" },
];

// Single source of truth for trip length: the form, the route page and the
// router all read these numbers, so they cannot drift apart.
export const DURATIONS = [
  { id: "short", label: "Kısa", detail: "3 saat · 15 km", hours: 3, maxKm: 15, maxStops: 5 },
  { id: "half", label: "Yarım gün", detail: "5 saat · 25 km", hours: 5, maxKm: 25, maxStops: 8 },
  { id: "full", label: "Tam gün", detail: "9 saat · 45 km", hours: 9, maxKm: 45, maxStops: 12 },
] as const;

export type Duration = (typeof DURATIONS)[number];
export type DurationId = Duration["id"];

export const DEFAULT_DURATION: DurationId = "half";

export function durationOf(id: string | undefined): Duration {
  return DURATIONS.find((d) => d.id === id) ?? durationOf(DEFAULT_DURATION);
}