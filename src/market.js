import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "market.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Yahoo Finance sembolleri. Sırayı/etiketleri buradan değiştirebilirsin.
const SYMBOLS = [
  { label: "BIST 30", symbol: "XU030.IS", decimals: 2 },
  { label: "S&P 500", symbol: "^GSPC", decimals: 2 },
  { label: "Nasdaq", symbol: "^IXIC", decimals: 2 },
  { label: "Dow Jones", symbol: "^DJI", decimals: 2 },
  { label: "Dolar/TL", symbol: "USDTRY=X", decimals: 4 },
  { label: "Euro/TL", symbol: "EURTRY=X", decimals: 4 },
  { label: "Ons Altın", symbol: "GC=F", decimals: 2 },
  { label: "Brent", symbol: "BZ=F", decimals: 2 },
];

const ONS_TO_GRAM = 31.1034768; // 1 ons = 31.1035 gram

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

  const prev = meta.chartPreviousClose ?? meta.previousClose ?? value;
  const change = value - prev;
  const changePct = prev ? (change / prev) * 100 : 0;

  // Grafikler için son ~30 kapanış (canlı fiyatla birlikte)
  const rawCloses = result?.indicators?.quote?.[0]?.close || [];
  const series = rawCloses
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .slice(-30);
  if (series.length) {
    const last = series[series.length - 1];
    if (Math.abs(last - value) / Math.max(Math.abs(value), 1) > 0.00005) series.push(value);
  }

  return { label: spec.label, value, prev, change, changePct, decimals: spec.decimals, series };
}

/** İki seriyi sondan hizalar ve eleman bazında çarpar (gram altın için). */
function mulSeries(a = [], b = []) {
  const n = Math.min(a.length, b.length);
  if (!n) return [];
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  return ax.map((v, i) => (v / ONS_TO_GRAM) * bx[i]);
}

/** Piyasa göstergelerini çeker ve data/market.json'a yazar. */
export async function updateMarket() {
  const settled = await Promise.allSettled(SYMBOLS.map(quote));
  const items = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);

  // Gram altın = (ons altın / 31.1035) * dolar kuru
  const gold = items.find((i) => i.label === "Ons Altın");
  const usd = items.find((i) => i.label === "Dolar/TL");
  if (gold && usd) {
    const now = (gold.value / ONS_TO_GRAM) * usd.value;
    const prev = (gold.prev / ONS_TO_GRAM) * usd.prev;
    items.push({
      label: "Gram Altın",
      value: now,
      prev,
      change: now - prev,
      changePct: prev ? ((now - prev) / prev) * 100 : 0,
      decimals: 2,
      series: mulSeries(gold.series, usd.series),
    });
  }

  const data = { updatedAt: new Date().toISOString(), items };
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
  return data;
}
