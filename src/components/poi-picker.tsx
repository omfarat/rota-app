"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPois } from "@/lib/pois";
import { THEMES, type City, type Theme } from "@/lib/types";
import { CUSTOM_MAX_STOPS, formatDuration } from "@/lib/route";
import { useMyLocation } from "@/components/use-my-location";

const LIST_CAP = 80;

export function PoiPicker({ city }: { city: City }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Theme | "tumu">("tumu");
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState<"center" | "here">("center");
  const { coords, error, loading, request } = useMyLocation();

  const pois = useMemo(() => getPois(city.slug), [city.slug]);

  const counts = useMemo(() => {
    const m = new Map<Theme, number>();
    for (const p of pois) m.set(p.theme, (m.get(p.theme) ?? 0) + 1);
    return m;
  }, [pois]);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return pois.filter(
      (p) =>
        (filter === "tumu" || p.theme === filter) &&
        (!q ||
          p.name.toLocaleLowerCase("tr").includes(q) ||
          p.district?.toLocaleLowerCase("tr").includes(q)),
    );
  }, [pois, filter, query]);

  const shown = results.slice(0, LIST_CAP);
  const full = selected.length >= CUSTOM_MAX_STOPS;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length >= CUSTOM_MAX_STOPS
          ? prev
          : [...prev, id],
    );
  }

  const visitMinutes = useMemo(
    () =>
      selected.reduce(
        (a, id) => a + (pois.find((p) => p.id === id)?.duration ?? 0),
        0,
      ),
    [selected, pois],
  );

  function go() {
    const params = new URLSearchParams({
      ozel: selected.join(","),
      baslangic: start,
    });
    if (start === "here" && coords) {
      params.set("lat", coords.lat.toFixed(5));
      params.set("lon", coords.lng.toFixed(5));
    }
    router.push(`/sehir/${city.slug}/rota/?${params.toString()}`);
  }

  if (pois.length === 0) {
    return (
      <p className="rounded-2xl border border-sand-200 bg-white px-4 py-6 text-center text-sm text-ink-500">
        Bu şehir için henüz veri yok.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Yer ara (ör. müze, çarşı)..."
        className="w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-ink-400 focus:border-terra-500"
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("tumu")}
          aria-pressed={filter === "tumu"}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            filter === "tumu"
              ? "border-terra-500 bg-terra-500/5 text-ink-900 ring-1 ring-terra-500"
              : "border-sand-200 bg-white text-ink-500"
          }`}
        >
          Tümü · {pois.length}
        </button>
        {THEMES.filter((t) => (counts.get(t.id) ?? 0) > 0).map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            aria-pressed={filter === t.id}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === t.id
                ? "border-terra-500 bg-terra-500/5 text-ink-900 ring-1 ring-terra-500"
                : "border-sand-200 bg-white text-ink-500"
            }`}
          >
            {t.icon} {t.label} · {counts.get(t.id)}
          </button>
        ))}
      </div>

      {full && (
        <p className="rounded-2xl border border-sand-200 bg-sand-100 px-4 py-3 text-sm text-ink-600">
          En fazla {CUSTOM_MAX_STOPS} yer seçebilirsin. Çıkarmak için dokun.
        </p>
      )}

      <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
        {shown.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-500">
            Sonuç yok. Başka bir şey arat.
          </li>
        )}
        {shown.map((p) => {
          const order = selected.indexOf(p.id);
          const isSel = order >= 0;
          const theme = THEMES.find((t) => t.id === p.theme);
          return (
            <li key={p.id}>
              <button
                onClick={() => toggle(p.id)}
                disabled={!isSel && full}
                aria-pressed={isSel}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                  isSel ? "bg-terra-500/5" : "hover:bg-sand-50"
                } disabled:opacity-40`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isSel
                      ? "bg-terra-600 text-white"
                      : "border border-sand-300 text-ink-400"
                  }`}
                >
                  {isSel ? order + 1 : "+"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-400">
                    {theme?.icon} {theme?.label} · {p.duration} dk
                    {p.district ? ` · ${p.district}` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {results.length > LIST_CAP && (
        <p className="text-center text-xs text-ink-400">
          {results.length} yerden {LIST_CAP} tanesi gösteriliyor; aratarak daralt.
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-ink-700">Nereden başlayalım?</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setStart("center")}
            aria-pressed={start === "center"}
            className={`rounded-2xl border p-3 text-left text-sm font-semibold transition ${
              start === "center"
                ? "border-moss-600 bg-moss-600/5 ring-1 ring-moss-600"
                : "border-sand-200 bg-white"
            }`}
          >
            {city.name} merkezi
          </button>
          <button
            onClick={() => {
              setStart("here");
              if (!coords) request();
            }}
            aria-pressed={start === "here"}
            className={`rounded-2xl border p-3 text-left text-sm font-semibold transition ${
              start === "here"
                ? "border-moss-600 bg-moss-600/5 ring-1 ring-moss-600"
                : "border-sand-200 bg-white"
            }`}
          >
            {coords ? "Konumum kullanılıyor" : loading ? "Konum alınıyor..." : "Konumum"}
          </button>
        </div>
        {start === "here" && error && !coords && (
          <p className="mt-2 text-xs text-ink-400">{error}</p>
        )}
      </section>

      <div className="sticky bottom-4 rounded-2xl border border-sand-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center justify-between px-1 text-sm">
          <span className="font-semibold text-ink-900">
            {selected.length} yer seçildi
          </span>
          <span className="text-xs text-ink-400">
            ~{formatDuration(visitMinutes)} yerinde
          </span>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button
              onClick={() => setSelected([])}
              className="rounded-2xl border border-sand-200 px-4 py-3 text-sm font-medium text-ink-500"
            >
              Temizle
            </button>
          )}
          <button
            onClick={go}
            disabled={
              selected.length === 0 || (start === "here" && !coords)
            }
            className="flex-1 rounded-2xl bg-ink-900 px-5 py-3 text-center font-semibold text-white transition hover:bg-ink-700 disabled:opacity-40"
          >
            Rotayı oluştur
          </button>
        </div>
      </div>
    </div>
  );
}
