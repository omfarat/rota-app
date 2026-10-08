import type { MetadataRoute } from "next";
import { allCities } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

// A static export refuses to prerender an implicit route handler.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const cities = allCities().map((city) => ({
    url: `${SITE_URL}/sehir/${city.slug}/`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...cities,
  ];
}