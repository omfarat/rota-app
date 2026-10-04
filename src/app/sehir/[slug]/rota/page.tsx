import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allCities, getCity } from "@/lib/data";
import type { City } from "@/lib/types";
import { RoutePlanner } from "@/components/route-planner";

/**
 * Static export needs every dynamic path up front. The theme and duration live
 * in the query string instead of the path, so 81 pages cover all combinations.
 */
export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

/**
 * The route is built in the browser from the query string, so the prerendered
 * HTML of every route page is this fallback. Without it the page stays blank
 * until the bundle arrives, which is very visible on a phone.
 */
function RouteSkeleton({ city }: { city: City }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href={`/sehir/${city.slug}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-terra-600"
      >
        ← {city.name} seçimlerine dön
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {city.name} gezi rotası
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Sıralama, mesafeye göre en kısa yolu bulacak şekilde kuruldu.
        </p>
      </header>

      <div
        role="status"
        className="mb-4 rounded-2xl border border-sand-200 bg-white px-4 py-3 text-sm text-ink-500"
      >
        Rota hazırlanıyor...
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[74px] animate-pulse rounded-2xl border border-sand-200 bg-sand-100"
          />
        ))}
      </section>

      <h2 className="mt-8 mb-3 text-sm font-bold text-ink-700">Duraklar</h2>
      <ol className="space-y-3 border-l-2 border-sand-200 pl-5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="-ml-[27px]">
            <span className="block size-4 animate-pulse rounded-full bg-sand-200" />
            <div className="ml-4 mt-2 h-16 animate-pulse rounded-2xl bg-sand-100" />
          </li>
        ))}
      </ol>
    </main>
  );
}

export default async function RoutePage(props: PageProps<"/sehir/[slug]/rota">) {
  const { slug } = await props.params;
  const city = getCity(slug);
  if (!city) notFound();

  return (
    <Suspense fallback={<RouteSkeleton city={city} />}>
      <RoutePlanner city={city} />
    </Suspense>
  );
}