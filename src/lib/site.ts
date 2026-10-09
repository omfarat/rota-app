// Canonical site origin, used for absolute URLs in metadata, robots.txt and the
// sitemap. Set NEXT_PUBLIC_SITE_URL at build time (e.g. on Cloudflare Pages)
// once a custom domain is live; until then the pages.dev origin is correct.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://rota-app-bg1.pages.dev"
).replace(/\/$/, "");

export const SITE_NAME = "Rota";

export const SITE_DESCRIPTION =
  "Türkiye'nin 81 ilinde gezilecek yerleri keşfet, seçtiğin yerlerden en kısa araç rotasını oluştur. Çevrimdışı çalışır.";