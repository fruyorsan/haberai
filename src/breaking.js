import { config } from "./config.js";
import { looksLikeSpamTitle } from "./kalite.js";

// ==========================================================================
// SON DAKİKA (breaking) TESPİTİ VE ÖNCELİK PUANI
// --------------------------------------------------------------------------
// Amaç: taze/bomba haberleri normal akıştan önce yakalamak. Bir haber "son
// dakika" sayılır eğer:
//   1) yayın zamanı breakingWindowMin (varsayılan 120) dakikadan yeni VE
//   2) kaynağı "fast" (hızlı şerit) VEYA başlığında son dakika sinyali geçiyor.
// Tespit burada; seçim/kota src/index.js içinde.
// ==========================================================================

// Başlıkta geçerse haberi "son dakika" işaretleyen sinyaller.
const BREAKING_WORDS =
  /son dakika|az önce|duyurdu|tanıttı|tanıtıldı|ilk kez|şimdi|canlı|rekor|kaza|deprem|istifa|vefat|hayatını kaybetti|açıkladı|patlama|yangın|acil/i;

// Gelecek tarihli (saati ileri) kaynaklar için tolerans (dk). fetcher zaten
// 15 dk üzerini "şimdi"ye çeker; burada da hafif bir pay bırakıyoruz.
const FUTURE_TOLERANS_MIN = 20;

/** Yayın yaşı (dakika). Geçersiz tarihte null. */
export function ageMinutes(publishedAt, now = Date.now()) {
  const t = new Date(publishedAt || 0).getTime();
  if (!Number.isFinite(t)) return null;
  return (now - t) / 60000;
}

/**
 * Haber son dakika mı?
 * @param {{ title?: string, publishedAt?: string, fast?: boolean, sourceName?: string, windowMin?: number }} param0
 * @returns {boolean}
 */
export function isBreaking({ title, publishedAt, fast, windowMin } = {}) {
  const win = Number.isFinite(windowMin) ? windowMin : config.breakingWindowMin;
  const age = ageMinutes(publishedAt);

  // Tarihi çözülemeyen haberi son dakika sayma (yanlış pozitif riski).
  if (age === null) return false;
  if (age > win) return false; // pencereden eski
  if (age < -FUTURE_TOLERANS_MIN) return false; // tolerans dışı gelecek tarih
  if (looksLikeSpamTitle(title)) return false; // SEO çöpü başlıklar son dakika olamaz

  if (fast) return true;
  return BREAKING_WORDS.test(String(title || ""));
}

/**
 * Basit öncelik puanı (büyük = daha öncelikli). Üç bileşen:
 *   - tazelik: yeni haber yüksek puan (0 dk = +40, pencere sonunda ~0)
 *   - fast kaynak bonusu: +50
 *   - son dakika anahtar kelimesi: +20
 * @param {{ title?: string, publishedAt?: string, fast?: boolean, windowMin?: number }} param0
 * @returns {number}
 */
export function breakingScore({ title, publishedAt, fast, windowMin } = {}) {
  const win = Number.isFinite(windowMin) ? windowMin : config.breakingWindowMin;
  let score = 0;

  const age = ageMinutes(publishedAt);
  if (age !== null) {
    const clamped = Math.min(Math.max(age, 0), win);
    score += Math.max(0, 40 * (1 - clamped / (win || 1))); // 0 dk -> +40, win -> 0
  }

  if (fast) score += 50;
  if (BREAKING_WORDS.test(String(title || ""))) score += 20;

  return Math.round(score * 100) / 100;
}
