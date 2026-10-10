"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // The dev server serves modules unbundled and a cached shell would shadow
    // them, so only register against the exported build.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Inside the native app (Capacitor) the files are served locally; the
    // web service worker must not take over navigation there.
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    try {
      if (w.Capacitor?.isNativePlatform?.()) return;
    } catch {
      // If the bridge is unreachable, fall through to normal registration.
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is an enhancement; the app works without it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}