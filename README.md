# Rota

Türkiye'nin 81 ilinde gezilecek yerlerden en kısa yürüyüş rotasını oluşturan
statik PWA. Sunucu yok: tüm veri derlenmiş hâlde geliyor, rota tarayıcıda
hesaplanıyor, hava durumu çalışma anında Open-Meteo'dan çekiliyor.

**Canlı:** https://rota-app-bg1.pages.dev

## Nasıl çalışır

- **Tema** — tarih, müze, lezzet, doğa, manzara. Neredeyse her şehir için en
  dolu tema varsayılan seçilir; veri olmayan temalar seçilemez.
- **Süre** — kısa / yarım gün / tam gün.
- **Başlangıç** — şehir merkezi ya da cihaz konumu.
- Rotalar **2-opt** ile iyileştirilir. Bir durak sığmazsa en maliyetli durak
  atılır, süre bütçesi hiçbir zaman aşılmaz.
- Yağmur varsa kapalı mekân önerilir. Hava durumu alınamazsa rota yine
  üretilir, sadece kapalı/mekan önerisi devre dışı kalır.

## Komutlar

```bash
npm install
npm run dev            # gelistirme sunucusu
npm run build          # out/ klasorune statik export
```

Doğrulama:

```bash
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # 12 birim testi (rota motoru + veri butunlugu)
npm run check:encoding # Turkce karakter bozulmasi denetimi
npm run verify:links   # out/ icindeki her baglantiyi statik sunucu gibi cozer

# tarayici testleri statik sunucu ister
node scripts/serve-out.mjs 3001 &
npm run test:browser             # Playwright: rota, tema, gezinme
npm run test:offline             # service worker + cevrimdisi davranis
```

Her iki tarayıcı testi `BASE` ortam değişkeniyle canlıya da koşturulabilir:

```bash
BASE=https://rota-app-bg1.pages.dev npm run test:browser
```

## Mimari

| Konu | Karar |
|---|---|
| Çıktı | `output: "export"` — tamamen statik, `out/` |
| URL biçimi | `trailingSlash: true` — statik hostların okuduğu `index.html` düzeni |
| Rota hesabı | İstemcide; 1458 tema×süre kombinasyonu için 1458 HTML yerine 81 sayfa |
| Hava durumu | İstemcide, 30 dakikalık `localStorage` önbelleği |
| Veri | `src/data/pois.json`, 6078 POI, derlenmiş olarak pakette |
| Depolama | Sunucu yok; hesap, veritabanı, API anahtarı yok |
| PWA | Service worker: sayfalar network-first, `_next/static` cache-first |

`out/` yaklaşık 10 MB ve çoğunluğu RSC yükleri, bu yüzden baştan tümü
ön belleğe alınmaz; sadece dört dosyalık kabuk eager yüklenir, sayfalar
ziyaret edildikçe cache'e girer.

## Veri

Noktalar OpenStreetMap'ten Overpass API ile, görseller Wikimedia Commons'tan
çekildi. Lisanslar ODbL (veri) ve CC (görseller). Ölçek: 81 il, 6078 POI,
ortalama il başına 75.

Görsel oranı düşük (%8). Veriyi tazelemek için `npm run data` Overpass'ten
çeker ve `.cache/` altında biriktirir.

## Dikkat çeken noktalar

- `npm run check:encoding` Türkçe karakterlerin sessizce bozulmasını yakalar.
  PowerShell ile dosya düzenlemek (`Get-Content | Set-Content`) UTF-8'i iki kez
  kodlayıp `kalmadı` yerine `kalmadÄ±` yazabiliyor; testler bunu fark etmiyor
  ve sessizce her şeyi geçiyor.
- `npm run verify:links` bağlantıları geliştirme sunucusuna değil, statik
  barındırmaya göre çözer. `next dev` çalışırken görünen bir bağlantı
  production'da 404 verebilir.
- Playwright tarayıcıları kurulumda indirilmez (`package.json` → `config`).
  İlk kez ihtiyaç duyarsan: `npx playwright install chromium`.
- PWA ikonları `public/icon.svg`'den `node scripts/make-icons.mjs` ile üretilir.
- `scripts/serve-out.mjs` bilerek `<path>.html` fallback'i yapmaz. Bu sessizce
  "export rotayı düz dosya olarak yazmış" hatasını gizlerdi; aynı hata
  production'da her bağlantıyı 404 yapardı.

## Cloudflare dağıtımı

GitHub'a push olunca Cloudflare Pages otomatik build alır:

- Build command: `npm run build`
- Build output: `out`
- Framework preset: `None`
- Environment: `NODE_VERSION=22`