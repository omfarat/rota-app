"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { City, DurationId } from "@/lib/types";
import { THEMES, DURATIONS, DEFAULT_DURATION, type Theme } from "@/lib/types";
import { useMyLocation } from "@/components/use-my-location";

export function PlanForm({ city }: { city: City }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("genel");
  const [length, setLength] = useState<DurationId>(DEFAULT_DURATION);
  const [start, setStart] = useState<"center" | "here">("center");
  const { coords, error, loading, request } = useMyLocation();

  const chosen = DURATIONS.find((l) => l.id === length) ?? DURATIONS[0];

  function go() {
    const params = new URLSearchParams({ tema: theme, sure: length, baslangic: start });
    if (start === "here" && coords) {
      params.set("lat", coords.lat.toFixed(5));
      params.set("lon", coords.lng.toFixed(5));
    }
    router.push(`/sehir/${city.slug}/rota?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-bold text-ink-700">Nasıl gezmek istersin?</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`rounded-2xl border p-3 text-left transition ${
                theme === t.id
                  ? "border-terra-500 bg-terra-500/5 ring-1 ring-terra-500"
                  : "border-sand-200 bg-white hover:border-ink-400"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="mt-1 block text-sm font-semibold">{t.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-400">
                {t.blurb}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-ink-700">Ne kadar vaktin var?</h2>
        <div className="grid grid-cols-3 gap-2">
          {DURATIONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLength(l.id)}
              aria-pressed={length === l.id}
              className={`rounded-2xl border px-3 py-3 text-center transition ${
                length === l.id
                  ? "border-aegean-500 bg-aegean-500/5 ring-1 ring-aegean-500"
                  : "border-sand-200 bg-white hover:border-ink-400"
              }`}
            >
              <span className="block text-sm font-semibold">{l.label}</span>
              <span className="mt-0.5 block text-xs text-ink-400">{l.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-ink-700">Nereden başlayalım?</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => setStart("center")}
            aria-pressed={start === "center"}
            className={`rounded-2xl border p-3 text-left transition ${
              start === "center"
                ? "border-moss-600 bg-moss-600/5 ring-1 ring-moss-600"
                : "border-sand-200 bg-white hover:border-ink-400"
            }`}
          >
            <span className="block text-sm font-semibold">
              {city.name} merkezi
            </span>
            <span className="mt-0.5 block text-xs text-ink-400">
              Şehrin tam ortasından başla
            </span>
          </button>

          <button
            onClick={() => {
              setStart("here");
              if (!coords) request();
            }}
            aria-pressed={start === "here"}
            className={`rounded-2xl border p-3 text-left transition ${
              start === "here"
                ? "border-moss-600 bg-moss-600/5 ring-1 ring-moss-600"
                : "border-sand-200 bg-white hover:border-ink-400"
            }`}
          >
            <span className="block text-sm font-semibold">
              {coords ? "Konumum kullanılıyor" : "Konumum"}
            </span>
            <span className="mt-0.5 block text-xs text-ink-400">
              {loading
                ? "Konum alınıyor..."
                : coords
                  ? "Rotan buradan başlayacak"
                  : error ?? "Şu an bulunduğun yerden başla"}
            </span>
          </button>
        </div>
      </section>

      <button
        onClick={go}
        disabled={start === "here" && !coords}
        className="w-full rounded-2xl bg-ink-900 px-5 py-4 text-center font-semibold text-white transition hover:bg-ink-700 disabled:opacity-40"
      >
        Rotayı oluştur
      </button>

      <p className="text-center text-xs text-ink-400">
        En fazla {chosen.maxStops} durak · {chosen.detail.split("·")[1].trim()} yürüyüş
      </p>
    </div>
  );
}