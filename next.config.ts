import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every photo comes from Wikimedia Commons, no image CDN of our own.
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/**" },
      { protocol: "https", hostname: "thumb.wikimedia.org", pathname: "/wikipedia/**" },
      { protocol: "https", hostname: "commons.wikimedia.org", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;