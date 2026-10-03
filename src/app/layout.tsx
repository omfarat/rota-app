import type { Metadata, Viewport } from "next";
import { allCities } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rota — Türkiye'de şehir rotaları",
  description: `Türkiye'nin ${allCities().length} ilinde gezilecek yerleri listele, seçtiğin yerlerden en kısa yürüyüş rotasını oluştur.`,
  applicationName: "Rota",
  appleWebApp: { capable: true, title: "Rota", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr">
      <body className="min-h-dvh bg-sand-50 font-sans antialiased">{children}</body>
    </html>
  );
}