import { unstable_cache } from "next/cache";

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

const getWeather = unstable_cache(
  async (lat: number, lon: number): Promise<Weather | null> => {
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
  },
  ["weather"],
  { revalidate: 1800 },
);

export function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  return getWeather(Number(lat.toFixed(3)), Number(lon.toFixed(3)));
}