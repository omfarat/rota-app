import type { MetadataRoute } from "next";
import { allCities } from "@/lib/data";

// A static export refuses to prerender an implicit route handler.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rota — Türkiye şehir rotaları",
    short_name: "Rota",
    description: `Türkiye'nin ${allCities().length} ilinde gezilecek yerlerden en kısa yürüyüş rotasını oluştur.`,
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}