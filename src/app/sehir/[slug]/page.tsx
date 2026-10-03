import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allCities, getCity, getPois, hasData } from "@/lib/data";
import { THEMES } from "@/lib/types";
import { PlanForm } from "@/components/plan-form";

export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

export default async function CityPage(props: PageProps<"/sehir/[slug]">) {
  const { slug } = await props.params;
  const city = getCity(slug);
  if (!city) notFound();
  const pois = getPois(slug);
  const available = hasData(slug);

  const themeCounts = new Map<string, number>();
  for (const p of pois) themeCounts.set(p.theme, (themeCounts.get(p.theme) ?? 0) + 1);

  const famous = pois.slice(0, 6);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-terra-600"
      >
        ← Tüm şehirler
      </Link>

      <div className="relative mb-6 aspect-[16/10] w-full overflow-hidden rounded-3xl bg-sand-200">
        {city.photo ? (
          <Image
            src={city.photo}
            alt={city.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">
            🏙️
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/85 to-transparent p-5 pt-16">
          <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
            {city.region} · {city.plate}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">
            {city.name}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/85">
            <span>{city.poiCount} gezilecek yer</span>
            {city.highlight && <span className="truncate">· {city.highlight}</span>}
          </p>
        </div>
      </div>

      {city.summary && (
        <details className="group mb-6 rounded-2xl border border-sand-200 bg-white px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-ink-700 marker:hidden">
            {city.summary.slice(0, 110)}…{" "}
            <span className="text-terra-600 group-open:hidden">devamı</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {city.summary}
          </p>
        </details>
      )}

      {!available ? (
        <div className="rounded-2xl border border-sand-200 bg-white p-6 text-center">
          <p className="text-sm text-ink-500">
            {city.name} için henüz veri toplanmadı.
          </p>
        </div>
      ) : (
        <>
          {famous.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-bold text-ink-700">En bilinenler</h2>
              <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {famous.map((poi) => (
                  <li
                    key={poi.id}
                    className="w-44 shrink-0 overflow-hidden rounded-2xl border border-sand-200 bg-white"
                  >
                    <div className="relative aspect-[3/2] w-full bg-sand-200">
                      {poi.image ? (
                        <Image
                          src={poi.image}
                          alt={poi.name}
                          fill
                          sizes="176px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xl">
                          {THEMES.find((t) => t.id === poi.theme)?.icon}
                        </div>
                      )}
                    </div>
                    <p className="px-3 py-2 text-sm leading-snug font-medium">
                      {poi.name}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PlanForm city={city} />

          <section className="mt-10">
            <h2 className="mb-3 text-sm font-bold text-ink-700">
              Veride ne var?
            </h2>
            <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white text-sm">
              {THEMES.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <span>
                    {t.icon} {t.label}
                  </span>
                  <span className="text-ink-400">
                    {themeCounts.get(t.id) ?? 0} yer
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}