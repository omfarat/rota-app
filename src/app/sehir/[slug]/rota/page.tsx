import Link from "next/link";
import { notFound } from "next/navigation";
import { getCity, getPois } from "@/lib/data";
import { THEMES, durationOf, type Theme } from "@/lib/types";
import { planRoute } from "@/lib/route";
import { fetchWeather } from "@/lib/weather";
import { RouteView } from "@/components/route-view";

const THEMES_IDS = new Set<string>(THEMES.map((t) => t.id));

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RoutePage(props: PageProps<"/sehir/[slug]/rota">) {
  const { slug } = await props.params;
  const query = await props.searchParams;

  const city = getCity(slug);
  if (!city) notFound();

  const themeParam = one(query.tema);
  const theme: Theme = THEMES_IDS.has(themeParam ?? "") ? (themeParam as Theme) : "genel";
  const preset = durationOf(one(query.sure));

  const lat = Number(one(query.lat));
  const lon = Number(one(query.lon));
  const useHere = one(query.baslangic) === "here" && Number.isFinite(lat) && Number.isFinite(lon);

  const start = useHere ? { lat, lon } : { lat: city.lat, lon: city.lon };
  const startLabel = useHere ? "Konumun" : `${city.name} merkezi`;

  const pois = getPois(slug);
  const weather = await fetchWeather(city.lat, city.lon);

  const plan = planRoute({
    city,
    pois,
    theme,
    start,
    startLabel,
    hours: preset.hours,
    maxKm: preset.maxKm,
    maxStops: preset.maxStops,
    wet: Boolean(weather?.wet),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link
        href={`/sehir/${slug}`}
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

      <RouteView
        plan={plan}
        weather={weather}
        startPoint={start}
        startLabel={startLabel}
      />
    </main>
  );
}