/**
 * Sayı dizisinden SVG grafik yolları üretir (sunucu tarafında, sıfır JS maliyeti).
 * Dönen değer: { line, area, min, max, first, last, up }
 */
export function chartPaths(values, width = 300, height = 72, pad = 3) {
  const nums = (values || []).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (nums.length < 2) return null;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || Math.abs(max) * 0.01 || 1;

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = innerW / (nums.length - 1);

  const pts = nums.map((v, i) => [
    pad + i * stepX,
    pad + (1 - (v - min) / span) * innerH,
  ]);

  const line = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const baseline = (height - pad).toFixed(2);
  const area = `${line} L${(pad + innerW).toFixed(2)} ${baseline} L${pad.toFixed(2)} ${baseline} Z`;

  const lastX = (pad + innerW).toFixed(2);
  const lastY = pts[pts.length - 1][1].toFixed(2);

  return {
    line,
    area,
    min,
    max,
    first: nums[0],
    last: nums[nums.length - 1],
    up: nums[nums.length - 1] >= nums[0],
    lastX,
    lastY,
  };
}

/** Sayıyı Türkçe biçimde yazar. */
export function nf(value, decimals = 2) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Yüzdeyi +/- işaretiyle yazar. */
export function pf(value, decimals = 2) {
  return `${value >= 0 ? "+" : "-"}%${nf(Math.abs(value), decimals)}`;
}
