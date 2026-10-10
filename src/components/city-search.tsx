"use client";

import { useMemo, useState } from "react";
import type { City } from "@/lib/types";

export function CitySearch({ cities }: { cities: City[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return null;
    return cities.filter(
      (c) =>
        c.name.toLocaleLowerCase("tr").includes(q) ||
        c.highlight?.toLocaleLowerCase("tr").includes(q) ||
        c.region.toLocaleLowerCase("tr").includes(q),
    );
  }, [cities, query]);

  return (
    <div className="mb-8">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Şehir ya da gezilecek yer ara..."
        className="w-full rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-ink-400 focus:border-terra-500"
      />
      {results && (
        <ul className="mt-2 divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-500">Sonuç yok.</li>
          )}
          {results.slice(0, 12).map((city) => (
            <li key={city.slug}>
              <a
                href={`/sehir/${city.slug}/`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-sand-50"
              >
                <span className="font-medium">{city.name}</span>
                <span className="truncate text-xs text-ink-400">
                  {city.highlight ?? city.region}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}