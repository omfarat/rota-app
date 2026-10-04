import { Suspense } from "react";
import { notFound } from "next/navigation";
import { allCities, getCity } from "@/lib/data";
import { RoutePlanner } from "@/components/route-planner";

/**
 * Static export needs every dynamic path up front. The theme and duration live
 * in the query string instead of the path, so 81 pages cover all combinations.
 */
export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

export default async function RoutePage(props: PageProps<"/sehir/[slug]/rota">) {
  const { slug } = await props.params;
  const city = getCity(slug);
  if (!city) notFound();

  return (
    <Suspense fallback={null}>
      <RoutePlanner city={city} />
    </Suspense>
  );
}