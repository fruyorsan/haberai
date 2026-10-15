import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "market.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ------------------------------------------------------------------
// YAHOO FINANCE SEMBOLLERİ
//   ticker: false  -> üst şeritte GÖRÜNMEZ (Piyasa sayfasında görünür)
//   deriveOnly     -> yalnızca türetme için çekilir, gösterge olarak listelenmez
// ------------------------------------------------------------------
const SYMBOLS = [
  { label: "BIST 30", symbol: "XU030.IS", decimals: 2 },
  { label: "Dolar/TL", symbol: "USDTRY=X", decimals: 4 },
  { label: "Euro/TL", symbol: "EURTRY=X", decimals: 4 },
  { label: "Ons Altın", symbol: "GC=F", decimals: 2 },
  { label: "Brent", symbol: "BZ=F", decimals: 2 },

  // Yalnızca Piyasa sayfasında görünür
  { label: "S&P 500", symbol: "^GSPC", decimals: 2, ticker: false },
  { label: "Nasdaq", symbol: "^IXIC", decimals: 2, ticker: false },
  { label: "Dow Jones", symbol: "^DJI", decimals: 2, ticker: false },

  // Sadece türetme kaynağı (gösterge listesinde yer almaz)
  { label: "Ons Gümüş", symbol: "SI=F", decimals: 2, deriveOnly: true },
  { label: "Bitcoin", symbol: "BTC-USD", decimals: 0, deriveOnly: true },
];

// Görünme sırası (üst şerittekiler önce)
const ORDER = [
  "BIST 30",
  "Dolar/TL",
  "Euro/TL",
  "Gram Altın",
  "Çeyrek Altın",
  "Ons Altın",
  "Gümüş (gram)",
  "Brent",
  "Bitcoin/TL",
  "S&P 500",
  "Nasdaq",
  "Dow Jones",
];

const ONS_TO_GRAM = 31.1034768; // 1 ons = 31.1035 gram
const CEYREK_ORANI = 1.6042; // çeyrek altın = 1,75 g × 22 ayar ≈ 1,6042 g has altın

async function quote(spec) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    spec.symbol
  )}?interval=1d&range=1mo`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const value = meta?.regularMarketPrice;
  if (typeof value !== "number") throw new Error("veri yok");

  // Grafikler için son ~30 kapanış (canlı fiyatla birlikte)
  const rawCloses = (result?.indicators?.quote?.[0]?.close || []).filter(
    (v) => typeof v === "number" && Number.isFinite(v)
  );

  // Günlük değişim: Yahoo'nun meta.chartPreviousClose alanı "aralığın başından
  // önceki" kapanıştır; 1 aylık aralıkta 1 AYLIK değişimi verir (BIST 30'da
  // -%9,96 gibi yanlış sonuç). Doğrusu günlük serinin son iki kapanışıdır.
  const metaPrev = meta?.regularMarketPreviousClose ?? meta?.previousClose;
  const seriesPrev = rawCloses.length >= 2 ? rawCloses[rawCloses.length - 2] : null;
  const prev =
    typeof metaPrev === "number" && metaPrev > 0
      ? metaPrev
      : seriesPrev ?? meta?.chartPreviousClose ?? value;
  const change = value - prev;
  const changePct = prev ? (change / prev) * 100 : 0;

  const series = rawCloses.slice(-30);
  if (series.length) {
    const last = series[series.length - 1];
    if (Math.abs(last - value) / Math.max(Math.abs(value), 1) > 0.00005) series.push(value);
  }

  return {
    label: spec.label,
    value,
    prev,
    change,
    changePct,
    decimals: spec.decimals,
    series,
    ticker: spec.ticker !== false,
    deriveOnly: Boolean(spec.deriveOnly),
  };
}

/** İki seriyi sondan hizalar, eleman bazında çarpar ve katsayı uygular. */
function combineSeries(a = [], b = [], factor = 1) {
  const n = Math.min(a.length, b.length);
  if (!n) return [];
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  return ax.map((v, i) => v * factor * bx[i]);
}

/** Piyasa göstergelerini çeker ve data/market.json'a yazar. */
export async function updateMarket() {
  const settled = await Promise.allSettled(SYMBOLS.map(quote));
  const fetched = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);

  const items = fetched.filter((i) => !i.deriveOnly);
  const find = (label) => fetched.find((i) => i.label === label);

  const add = (label, value, prev, decimals, series, ticker = true) => {
    items.push({
      label,
      value,
      prev,
      change: value - prev,
      changePct: prev ? ((value - prev) / prev) * 100 : 0,
      decimals,
      series: series || [],
      ticker,
    });
  };

  const gold = find("Ons Altın");
  const silver = find("Ons Gümüş");
  const usd = find("Dolar/TL");
  const btc = find("Bitcoin");

  // Gram altın = (ons altın / 31,1035) × dolar kuru
  if (gold && usd) {
    add(
      "Gram Altın",
      (gold.value / ONS_TO_GRAM) * usd.value,
      (gold.prev / ONS_TO_GRAM) * usd.prev,
      2,
      combineSeries(gold.series, usd.series, 1 / ONS_TO_GRAM)
    );
  }

  // Çeyrek altın ≈ gram altın × 1,6042
  const gram = items.find((i) => i.label === "Gram Altın");
  if (gram) {
    add(
      "Çeyrek Altın",
      gram.value * CEYREK_ORANI,
      gram.prev * CEYREK_ORANI,
      2,
      (gram.series || []).map((v) => v * CEYREK_ORANI)
    );
  }

  // Gümüş (gram) = (ons gümüş / 31,1035) × dolar kuru
  if (silver && usd) {
    add(
      "Gümüş (gram)",
      (silver.value / ONS_TO_GRAM) * usd.value,
      (silver.prev / ONS_TO_GRAM) * usd.prev,
      2,
      combineSeries(silver.series, usd.series, 1 / ONS_TO_GRAM)
    );
  }

  // Bitcoin/TL = bitcoin(usd) × dolar kuru
  if (btc && usd) {
    add(
      "Bitcoin/TL",
      btc.value * usd.value,
      btc.prev * usd.prev,
      0,
      combineSeries(btc.series, usd.series, 1)
    );
  }

  // Sırala
  const idx = (label) => {
    const i = ORDER.indexOf(label);
    return i === -1 ? ORDER.length : i;
  };
  items.sort((a, b) => idx(a.label) - idx(b.label));

  const data = { updatedAt: new Date().toISOString(), items };
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
  return data;
}
