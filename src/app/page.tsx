import Image from "next/image";
import Link from "next/link";
import { allCities, firstLetter } from "@/lib/data";
import { CitySearch } from "@/components/city-search";

export default function HomePage() {
  const cities = allCities();
  const groups = new Map<string, typeof cities>();
  for (const city of cities) {
    const letter = firstLetter(city.name);
    groups.set(letter, [...(groups.get(letter) ?? []), city]);
  }
  const letters = [...groups.keys()];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-terra-600 uppercase">
          Türkiye
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Şehrini seç, rotasını gör
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-500">
          {cities.length} ildeki gezilecek yerler hazır. Tema seç, konumunu ver,
          uygulama en kısa yürüyüş rotasını sıralasın.
        </p>
      </header>

      <CitySearch cities={cities} />

      <nav className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {letters.map((letter) => (
          <a
            key={letter}
            href={`#harf-${encodeURIComponent(letter)}`}
            className="shrink-0 rounded-full border border-sand-200 bg-white px-3 py-1 text-sm font-semibold text-ink-500 transition hover:border-terra-500 hover:text-terra-600"
          >
            {letter}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        {letters.map((letter) => (
          <section key={letter} id={`harf-${encodeURIComponent(letter)}`}>
            <h2 className="mb-3 text-sm font-bold text-ink-400">{letter}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(groups.get(letter) ?? []).map((city) => (
                <li key={city.slug}>
                  <Link
                    href={`/sehir/${city.slug}`}
                    className="group block overflow-hidden rounded-2xl border border-sand-200 bg-white transition hover:border-terra-500 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand-200">
                      {city.photo ? (
                        <Image
                          src={city.photo}
                          alt={`${city.name} — ${city.highlight ?? "genel görünüm"}`}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-2xl">
                          🏙️
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        {city.poiCount} yer
                      </span>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate font-semibold">{city.name}</h3>
                        <span className="shrink-0 text-xs text-ink-400">
                          {city.plate}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {city.highlight ?? city.region}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-16 border-t border-sand-200 pt-6 text-xs leading-relaxed text-ink-400">
        <p>
          Veriler OpenStreetMap ve Wikidata topluluklarından geliyor. Ziyaret
          saatleri ve bilet fiyatları bilerek gösterilmiyor — güncel bilgi için
          yerin kendi sitesine bak.
        </p>
      </footer>
    </main>
  );
}