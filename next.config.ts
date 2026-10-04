import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the whole app is prerendered, so any web server can host it
  // and the POI data ships with the bundle for offline use.
  output: "export",
  // Without this, export writes /sehir/ankara.html and static hosts 404 on
  // /sehir/ankara. With it, every route becomes sehir/ankara/index.html, which
  // is what Cloudflare Pages and nginx actually serve.
  trailingSlash: true,
  images: {
    // A static export has no optimiser to run; Commons already serves resized
    // thumbnails over its own CDN.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/**" },
      { protocol: "https", hostname: "thumb.wikimedia.org", pathname: "/wikipedia/**" },
      { protocol: "https", hostname: "commons.wikimedia.org", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;