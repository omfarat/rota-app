"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Theme } from "@/lib/types";
import { THEMES } from "@/lib/types";
import type { RoutePlan, RouteStop } from "@/lib/route";
import { formatDuration, haversineKm, reorder, travelMinutes } from "@/lib/route";
import { googleMapsUrl, appleMapsUrl, osmUrl } from "@/lib/maps";
import type { Weather } from "@/lib/weather";

const themeOf = (id: Theme) => THEMES.find((t) => t.id === id)!;

export function RouteView({
  plan,
  weather,
  startPoint,
  startLabel,
}: {
  plan: RoutePlan;
  weather: Weather | null;
  startPoint: { lat: number; lon: number };
  startLabel: string;
}) {
  const [stops, setStops] = useState<RouteStop[]>(plan.stops);
  const [removed, setRemoved] = useState<string[]>([]);

  const stats = useMemo(() => {
    const km = stops.reduce((acc, s, i) => {
      const prev =
        i === 0 ? startPoint : { lat: stops[i - 1].lat, lon: stops[i - 1].lon };
      return acc + haversineKm(prev, s);
    }, 0);
    const drive = travelMinutes(km);
    return {
      km: +km.toFixed(1),
      drive,
      visit: stops.reduce((a, s) => a + s.duration, 0),
      indoor: stops.length
        ? Math.round((stops.filter((s) => s.indoor).length / stops.length) * 100)
        : 0,
    };
  }, [stops, startPoint]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    // reorder() indexes into plan.stops, so map the new order back to the
    // original stop list before handing it over.
    const originalIndex = new Map(plan.stops.map((s, i) => [s.id, i]));
    setStops(
      reorder(
        { ...plan, stops },
        next.map((s) => originalIndex.get(s.id)!),
        startPoint,
      ).stops,
    );
  }

  function drop(id: string) {
    const remaining = stops.filter((s) => s.id !== id);
    setRemoved((r) => [...r, id]);
    setStops(remaining);
  }

  function restore() {
    setStops(plan.stops);
    setRemoved([]);
  }

  if (stops.length === 0) {
    return (
      <div className="rounded-2xl border border-sand-200 bg-white p-8 text-center">
        <p className="font-medium">Bu seçimle uygun durak kalmadı.</p>
        <Link
          href={`/sehir/${plan.city.slug}/`}
          className="mt-3 inline-block text-sm text-terra-600 hover:underline"
        >
          Seçimleri değiştir
        </Link>
      </div>
    );
  }

  const points = stops.map((s) => ({ lat: s.lat, lon: s.lon }));
  // Google'ın harita URL'si en fazla 9 ara nokta kabul eder: başlangıç + ilk
  // 10 durak. Arayüzdeki notla aynı davranış.
  const gmaps = googleMapsUrl(startPoint, points.slice(0, 10));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Durak" value={String(stops.length)} />
        <Stat label="Mesafe" value={`${stats.km} km`} />
        <Stat label="Araçla" value={formatDuration(stats.drive)} />
        <Stat label="Yerinde" value={formatDuration(stats.visit)} />
      </section>

      {weather && (
        <div className="rounded-2xl border border-sand-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-medium">
              {weather.temperatureC != null
                ? `${Math.round(weather.temperatureC)}°C`
                : "—"}
            </span>
            <span className="text-ink-500">{weather.label}</span>
            {weather.precipitationChance != null && (
              <span className="text-ink-400">
                · yağış %{weather.precipitationChance}
              </span>
            )}
            <span className="text-ink-400">· {startLabel}</span>
          </div>
          {plan.weatherApplied && (
            <p className="mt-1.5 text-xs text-ink-400">
              Hava durumu rotaya uygulandı.
            </p>
          )}
        </div>
      )}

      {plan.notes.map((note) => (
        <p
          key={note}
          className="rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm text-ink-500"
        >
          {note}
        </p>
      ))}

      <section>
        <h2 className="mb-3 text-sm font-bold text-ink-700">
          {plan.city.name} · {themeOf(plan.theme).icon} {themeOf(plan.theme).label} rotası
        </h2>
        <p className="-mt-2 mb-3 text-xs text-ink-400">
          {startLabel} başlangıç · {stats.indoor}% kapalı alan
        </p>

        <ol className="relative space-y-3 border-l-2 border-sand-200 pl-5">
          <li className="relative -ml-[27px] pb-1">
            <span className="flex size-4 items-center justify-center rounded-full bg-ink-900">
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <p className="ml-4 text-xs font-medium text-ink-400">
              Başlangıç · {startLabel}
            </p>
          </li>

          {stops.map((stop, i) => (
            <li key={stop.id} className="relative animate-fade-up">
              <span className="absolute -left-[27px] top-1 flex size-4 items-center justify-center rounded-full bg-terra-500 text-[9px] font-bold text-white">
                {i + 1}
              </span>

              <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
                <div className="flex gap-3 p-3">
                  {stop.image && (
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand-200">
                      <Image
                        src={stop.image}
                        alt={stop.name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="leading-snug font-semibold">{stop.name}</h3>
                      <button
                        onClick={() => drop(stop.id)}
                        aria-label={`${stop.name} rotadan çıkar`}
                        className="shrink-0 rounded-lg px-1.5 text-lg leading-none text-ink-400 transition hover:bg-sand-100 hover:text-terra-600"
                      >
                        ×
                      </button>
                    </div>

                    <p className="mt-1 text-xs text-ink-500">
                      {themeOf(stop.theme).icon} {themeOf(stop.theme).label} ·{" "}
                      {stop.duration} dk
                      {stop.indoor && " · kapalı"}
                      {stop.heritage && " · UNESCO"}
                    </p>

                    {stop.district && (
                      <p className="text-xs text-ink-400">📍 {stop.district}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <a
                        href={googleMapsUrl(
                          i === 0 ? startPoint : stops[i - 1],
                          [{ lat: stop.lat, lon: stop.lon }],
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-sand-100 px-2 py-1 text-[11px] font-medium text-ink-700 transition hover:bg-sand-200"
                      >
                        Buraya git
                      </a>
                      <a
                        href={osmUrl(stop)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg px-2 py-1 text-[11px] text-ink-400 transition hover:bg-sand-100"
                      >
                        OSM
                      </a>
                      {i > 0 && (
                        <span className="text-[11px] text-ink-400">
                          ↑ {stop.distanceFromPrevKm} km · {stop.driveMinutes} dk
                          araçla
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="Yukarı taşı"
                        className="rounded-md border border-sand-200 px-1.5 text-[11px] text-ink-500 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === stops.length - 1}
                        aria-label="Aşağı taşı"
                        className="rounded-md border border-sand-200 px-1.5 text-[11px] text-ink-500 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>

        {removed.length > 0 && (
          <button
            onClick={restore}
            className="mt-4 text-sm text-terra-600 hover:underline"
          >
            Çıkarılan {removed.length} durağı geri getir
          </button>
        )}
      </section>

      <section className="space-y-2">
        <a
          href={gmaps}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl bg-aegean-600 px-5 py-4 text-center font-semibold text-white transition hover:bg-aegean-500"
        >
          🗺️ Rotayı Google Haritalar&apos;da aç
        </a>
        {/* The empty route returned above, so there is always at least one stop here. */}
        <a
          href={appleMapsUrl(startPoint, points)}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-sand-200 bg-white px-5 py-3 text-center text-sm font-medium text-ink-700 transition hover:border-ink-400"
        >
          {points.length > 1 ? "Apple Haritalar&apos;da aç" : "Apple Haritalar&apos;nda gör"}
        </a>
        <p className="text-center text-xs leading-relaxed text-ink-400">
          {points.length > 10
            ? `Uzun rotalar harita uygulamasında bölünebilir. İlk 10 durak tek listede açılır, kalanı için aynı butonu tekrar kullan.`
            : "Haritada araç (sürüş) modu seçili gelir."}
        </p>
      </section>

      <Link
        href={`/sehir/${plan.city.slug}/`}
        className="block rounded-2xl border border-sand-200 bg-white px-5 py-3 text-center text-sm font-medium text-ink-700 transition hover:border-ink-400"
      >
        Seçimleri değiştir
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white px-3 py-2.5 text-center">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  );
}