import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Rota — Türkiye'de şehir rotaları",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Rota — Türkiye'de şehir rotaları",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "Rota",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Rota — Türkiye'de şehir rotaları",
    description: SITE_DESCRIPTION,
    images: ["/icon-512.png"],
  },
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