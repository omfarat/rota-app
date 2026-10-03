import citiesJson from "@/data/cities.json";
import poisJson from "@/data/pois.json";
import type { City, Poi } from "./types";

const cities = citiesJson as City[];
const pois = poisJson as Record<string, Poi[]>;

export function allCities(): City[] {
  return [...cities].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export function getCity(slug: string): City | undefined {
  return cities.find((c) => c.slug === slug);
}

export function getPois(slug: string): Poi[] {
  return pois[slug] ?? [];
}

export function hasData(slug: string): boolean {
  return Boolean(pois[slug]?.length);
}

const trAlphabet =
  "A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z".split(" ");

export function firstLetter(name: string): string {
  const ch = name[0].toLocaleUpperCase("tr-TR");
  return trAlphabet.includes(ch) ? ch : "#";
}