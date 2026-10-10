import { allCities } from "@/lib/data";

export function generateStaticParams() {
  return allCities().map((c) => ({ slug: c.slug }));
}

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCity } from '@/lib/data';
import { buildItinerary } from '@/lib/itinerary';
import { THEMES } from '@/lib/types';

export default async function ItineraryPage(
  props: PageProps<"/sehir/[slug]/gun-gun">,
) {
  const { slug } = await props.params;
  const city = getCity(slug);
  if (!city) notFound();
  const itin = buildItinerary(slug);

  function directionsUrl(stops: { lat: number; lon: number }[]) {
    if (stops.length < 2) return '';
    const first = stops[0];
    const last = stops[stops.length - 1];
    const middles = stops.slice(1, -1);
    if (middles.length <= 9) {
      const waypoints = middles.map((s) => s.lat + ',' + s.lon).join('|');
      return (
        'https://www.google.com/maps/dir/?api=1' +
        '&origin=' + first.lat + ',' + first.lon +
        '&destination=' + last.lat + ',' + last.lon +
        (waypoints ? '&waypoints=' + encodeURIComponent(waypoints) : '') +
        '&travelmode=driving'
      );
    }
    const path = stops.map((s) => s.lat + ',' + s.lon).join('/');
    return 'https://www.google.com/maps/dir/' + path + '?travelmode=driving';
  }

  function mapLink(dayIndex: number) {
    const d = itin.days[dayIndex];
    if (!d) return '';
    return directionsUrl(d.stops);
  }

  return (
    <main className='mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6'>
      <Link
        href={`/sehir/${city.slug}/`}
        className='mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-terra-600'
      >
        ← {city.name}
      </Link>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold text-ink-900 sm:text-3xl'>
            {city.name} · gün gün rota
          </h1>
          <p className='mt-1 text-sm text-ink-500'>
            {itin.totalPois} yer · {itin.totalDays} gün
          </p>
        </div>
      </div>
      <div className='space-y-6'>
        {itin.days.map((day, di) => (
          <section
            key={day.day}
            className='overflow-hidden rounded-3xl border border-sand-200 bg-white'
          >
            <div className='flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 bg-sand-50 px-4 py-3 sm:px-5'>
              <div>
                <h2 className='text-base font-bold text-ink-900'>Gün {day.day}</h2>
                <p className='mt-0.5 text-xs text-ink-500 sm:text-sm'>
                  {day.stops.length} durak · {day.distanceKm.toFixed(1)} km · {day.travelMin} dk araçla · {day.visitMin} dk yerinde
                </p>
              </div>
              {mapLink(di) && (
                <a
                  href={mapLink(di)}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm transition hover:bg-sand-100 sm:text-sm'
                >
                  Bu günü Google Haritalar'da aç
                </a>
              )}
            </div>
            <ol className='divide-y divide-sand-200'>
              {day.stops.map((s) => (
                <li key={s.id} className='flex gap-3 px-4 py-3 sm:px-5'>
                  <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terra-600 text-xs font-bold text-white'>
                    {s.orderInDay}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium text-ink-900 sm:text-base'>{s.name}</p>
                    <p className='mt-0.5 text-xs text-ink-500'>
                      {THEMES.find((t) => t.id === s.theme)?.icon} {THEMES.find((t) => t.id === s.theme)?.label} · {s.duration} dk · {s.travelKmFromPrev.toFixed(1)} km ({s.travelMinFromPrev} dk)
                    </p>
                    {s.image && (
                      <div className='relative mt-2 aspect-[3/2] w-full overflow-hidden rounded-2xl bg-sand-200 sm:w-64'>
                        <Image src={s.image} alt={s.name} fill sizes='256px' className='object-cover' />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}






