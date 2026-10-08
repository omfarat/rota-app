import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// A static export refuses to prerender an implicit route handler.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}