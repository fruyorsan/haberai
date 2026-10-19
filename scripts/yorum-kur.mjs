#!/usr/bin/env node
// Yorum altyapısını (Supabase) tek komutla bağlar.
//
// KULLANIM
//   1) supabase.com → ücretsiz proje → SQL Editor → supabase/yorumlar.sql → Run
//   2) Project Settings → API: Project URL + anon public key kopyala
//   3) Bu komutu çalıştır:
//
//      node scripts/yorum-kur.mjs https://xxxx.supabase.co "eyJhbGciOi..."
//
// Yaptığı iş:
//   - Anahtarla `yorumlar` tablosunu okumayı dener (kurulum doğru mu?)
//   - GitHub deposuna YORUM_URL / YORUM_ANON değişkenlerini yazar
//   - Siteyi yeniden derletir (pipeline.yml)
//
// Gereksinim: `gh` CLI, fruyorsan/haberai deposuna yetkili olarak giriş yapmış.

import { execFileSync } from "node:child_process";

const [urlArg, anahtarArg] = process.argv.slice(2);
const url = String(urlArg || "").replace(/\/+$/, "");
const anahtar = String(anahtarArg || "").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !anahtar) {
  console.error(
    "Kullanım: node scripts/yorum-kur.mjs https://<proje>.supabase.co \"<anon public key>\"",
  );
  process.exit(1);
}

console.log("1/3  Tablo deneniyor…");
// Yeni "publishable" anahtarı (sb_publishable_…) JWT değildir; Authorization'a
// yazılmaz, yalnızca apikey başlığıyla gönderilir.
const basliklar = { apikey: anahtar };
if (anahtar.startsWith("eyJ")) basliklar.Authorization = `Bearer ${anahtar}`;
const yanit = await fetch(`${url}/rest/v1/yorumlar?select=id&limit=1`, {
  headers: basliklar,
});

if (yanit.status === 404) {
  console.error(
    "✗ `yorumlar` tablosu yok. SQL Editor'de supabase/yorumlar.sql dosyasını çalıştırdın mı?",
  );
  process.exit(1);
}
if (yanit.status === 401 || yanit.status === 403) {
  console.error("✗ Anahtar reddedildi. 'anon public' anahtarını kopyaladığından emin ol.");
  process.exit(1);
}
if (!yanit.ok) {
  console.error(`✗ Beklenmeyen yanıt: HTTP ${yanit.status} ${await yanit.text()}`);
  process.exit(1);
}
console.log("✓ Tablo hazır.");

function gh(...args) {
  return execFileSync("gh", args, { stdio: "inherit", shell: process.platform === "win32" });
}

console.log("2/3  GitHub değişkenleri yazılıyor…");
gh("variable", "set", "YORUM_URL", "--repo", "fruyorsan/haberai", "--body", url);
gh("variable", "set", "YORUM_ANON", "--repo", "fruyorsan/haberai", "--body", anahtar);

console.log("3/3  Site yeniden derleniyor…");
gh("workflow", "run", "pipeline.yml", "--repo", "fruyorsan/haberai");

console.log("\nBitti. ~2 dakika sonra yorumlar canlıda açılır.");
