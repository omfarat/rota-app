"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPois } from "@/lib/pois";
import { THEMES, durationOf, type City, type Poi, type Theme } from "@/lib/types";
import { planCustomRoute, planRoute } from "@/lib/route";
import { fetchWeather, type Weather } from "@/lib/weather";
import { RouteView } from "@/components/route-view";

const THEMES_IDS = new Set<string>(THEMES.map((t) => t.id));

/**
 * The route is computed in the browser so a static export needs no server.
 * The plan renders straight from the bundled POI data; weather is fetched
 * separately and only downgrades the plan to indoor stops when it arrives.
 */
export function RoutePlanner({ city }: { city: City }) {
  const search = useSearchParams();
  // undefined = loading, null = unavailable, object = shown.
  const [weather, setWeather] = useState<Weather | null | undefined>(undefined);

  const themeParam = search.get("tema") ?? undefined;
  const theme: Theme = THEMES_IDS.has(themeParam ?? "") ? (themeParam as Theme) : "genel";
  const preset = durationOf(search.get("sure") ?? undefined);

  const lat = Number(search.get("lat"));
  const lon = Number(search.get("lon"));
  const useHere =
    search.get("baslangic") === "here" && Number.isFinite(lat) && Number.isFinite(lon);

  const start = useHere ? { lat, lon } : { lat: city.lat, lon: city.lon };
  const startLabel = useHere ? "Konumun" : `${city.name} merkezi`;

  const pois = useMemo(() => getPois(city.slug), [city.slug]);
  const byId = useMemo(() => new Map(pois.map((p) => [p.id, p])), [pois]);

  // "Kendi rotanı oluştur" akışı: sec sayfası virgülle ayrılmış POI id'leri
  // yollar. Bilinmeyen ya da tekrarlı id'ler elenir; sıra optimizasyonu
  // planCustomRoute içinde yapılır.
  const customIds = useMemo(() => {
    const raw = search.get("ozel");
    if (raw === null) return null;
    return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  }, [search]);

  const customPicks = useMemo<Poi[] | null>(
    () =>
      customIds === null
        ? null
        : customIds.flatMap((id) => {
            const p = byId.get(id);
            return p ? [p] : [];
          }),
    [customIds, byId],
  );

  useEffect(() => {
    let alive = true;
    fetchWeather(city.lat, city.lon).then((w) => {
      if (alive) setWeather(w);
    });
    return () => {
      alive = false;
    };
  }, [city.lat, city.lon]);

  const plan =
    customPicks === null
      ? planRoute({
          city,
          pois,
          theme,
          start,
          startLabel,
          hours: preset.hours,
          maxKm: preset.maxKm,
          maxStops: preset.maxStops,
          wet: Boolean(weather?.wet),
        })
      : planCustomRoute(city, customPicks, start);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href={`/sehir/${city.slug}/`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-terra-600"
      >
        ← {city.name} seçimlerine dön
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {city.name} gezi rotası
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {customPicks === null
            ? "Sıralama, mesafeye göre en kısa yolu bulacak şekilde kuruldu."
            : "Kendi seçtiğin yerler, en kısa sürüş sırasına dizildi."}
        </p>
      </header>

      {weather === undefined && (
        <p className="mb-4 rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm text-ink-500">
          Hava durumu sorgulanıyor; rota bu arada hazırlanıyor.
        </p>
      )}
      {weather === null && (
        <p className="mb-4 rounded-2xl border border-sand-200 bg-sand-100 px-4 py-3 text-sm text-ink-600">
          Hava durumu şu anda gösterilemiyor. Rota yine de hazırlandı; kapalı
          mekan önerisi bu tur için devre dışı kaldı.
        </p>
      )}

      <RouteView
        plan={plan}
        weather={weather ?? null}
        startPoint={start}
        startLabel={startLabel}
      />
    </main>
  );
}