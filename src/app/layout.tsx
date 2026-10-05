import type { Metadata, Viewport } from "next";
import { allCities } from "@/lib/data";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rota — Türkiye'de şehir rotaları",
  description: `Türkiye'nin ${allCities().length} ilinde gezilecek yerleri listele, seçtiğin yerlerden en kısa yürüyüş rotasını oluştur.`,
  applicationName: "Rota",
  appleWebApp: { capable: true, title: "Rota", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
      <body className="min-h-dvh bg-sand-50 font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}