"use client";

import { useCallback, useState } from "react";

interface Coords {
  lat: number;
  lng: number;
}

export function useMyLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tarayıcın konumu desteklemiyor.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => {
        setError("Konum izni verilmedi, merkezden başlayacak.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return { coords, error, loading, request };
}