import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { allCities, getCity } from "@/lib/data";
import { PoiPicker } from "@/components/poi-picker";

export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(
  props: PageProps<"/sehir/[slug]/sec">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const city = getCity(slug);
  return {
    title: city ? `${city.name} özel rota` : "Özel rota",
    robots: { index: false, follow: true },
    alternates: { canonical: `/sehir/${slug}/` },
  };
}

function PickerSkeleton() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-4 h-5 w-32 animate-pulse rounded bg-sand-200" />
      <div className="mb-6 h-9 w-64 animate-pulse rounded bg-sand-200" />
      <div className="h-12 animate-pulse rounded-2xl bg-sand-100" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-sand-100" />
        ))}
      </div>
    </main>
  );
}

export default async function PickPage(props: PageProps<"/sehir/[slug]/sec">) {
  const { slug } = await props.params;
  const city = getCity(slug);
  if (!city) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href={`/sehir/${city.slug}/`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-terra-600"
      >
        ← {city.name}
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Kendi rotanı oluştur
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Gezmek istediğin yerlere dokun; en kısa sürüş sırasını biz dizelim.
        </p>
      </header>

      <Suspense fallback={<PickerSkeleton />}>
        <PoiPicker city={city} />
      </Suspense>
    </main>
  );
}
