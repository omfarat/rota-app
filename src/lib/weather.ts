export interface Weather {
  temperatureC: number | null;
  precipitationChance: number | null;
  code: number | null;
  label: string;
  wet: boolean;
}

const CODE_LABELS: Record<number, string> = {
  0: "Açık",
  1: "Az bulutlu",
  2: "Parçalı bulutlu",
  3: "Bulutlu",
  45: "Sisli",
  48: "Kırağı",
  51: "Hafif çiseleme",
  53: "Çiseleme",
  55: "Yoğun çiseleme",
  61: "Hafif yağmur",
  63: "Yağmur",
  65: "Şiddetli yağmur",
  71: "Hafif kar",
  73: "Kar",
  75: "Yoğun kar",
  80: "Sağanak",
  81: "Sağanak",
  82: "Şiddetli sağanak",
  95: "Gök gürültülü sağanak",
  96: "Dolu ile sağanak",
  99: "Şiddetli dolu",
};

/**
 * Weather is fetched from the browser and cached in localStorage rather than
 * through unstable_cache, because a static export has no server to cache in.
 * A failed lookup returns null and the caller still plans the route.
 */
const CACHE_KEY = "rota-weather-v1";
const TTL_MS = 30 * 60 * 1000;

type CacheEntry = { at: number; data: Weather | null };

function readCache(key: string): CacheEntry | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed[key] ?? null;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  if (typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<
      string,
      CacheEntry
    >;
    parsed[key] = entry;
    // Keep the cache small: drop every other city's entry once there are too many.
    const keys = Object.keys(parsed);
    if (keys.length > 60) {
      for (const k of keys.sort((a, b) => (parsed[a].at ?? 0) - (parsed[b].at ?? 0)).slice(0, keys.length - 60)) {
        delete parsed[k];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // A full or blocked localStorage must never break route planning.
  }
}

async function request(lat: number, lon: number): Promise<Weather | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      lat +
      "&longitude=" +
      lon +
      "&current=temperature_2m,precipitation,weather_code" +
      "&daily=precipitation_probability_max&timezone=auto&forecast_days=1";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = await res.json();
    const code = j.current?.weather_code ?? null;
    const rain = j.current?.precipitation ?? 0;
    const chance = j.daily?.precipitation_probability_max?.[0] ?? null;
    return {
      temperatureC: j.current?.temperature_2m ?? null,
      precipitationChance: chance,
      code,
      label: code != null ? CODE_LABELS[code] ?? "—" : "—",
      wet: (rain ?? 0) > 0 || (chance ?? 0) >= 60,
    };
  } catch {
    return null;
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  const roundedLat = Number(lat.toFixed(3));
  const roundedLon = Number(lon.toFixed(3));
  const key = `${roundedLat},${roundedLon}`;

  const cached = readCache(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const data = await request(roundedLat, roundedLon);
  // A network failure is not cached, so the next visit tries again.
  if (data) writeCache(key, { at: Date.now(), data });
  return data;
}