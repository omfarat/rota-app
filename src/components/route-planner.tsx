"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getPois } from "@/lib/pois";
import { THEMES, durationOf, type City, type Poi, type Theme } from "@/lib/types";
import { planCustomRoute, planRoute } from "@/lib/route";
import { RouteView } from "@/components/route-view";

const THEMES_IDS = new Set<string>(THEMES.map((t) => t.id));

/**
 * The route is computed in the browser so a static export needs no server.
 * The plan renders straight from the bundled POI data.
 */
export function RoutePlanner({ city }: { city: City }) {
  const search = useSearchParams();

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

      <RouteView
        plan={plan}
        startPoint={start}
        startLabel={startLabel}
      />
    </main>
  );
}