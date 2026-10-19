#!/usr/bin/env node
// Hesap (üyelik) altyapısının kurulu olup olmadığını tek komutla kontrol eder.
//
// KULLANIM
//   1) supabase.com → proje → SQL Editor → supabase/hesap.sql → Run
//      (yorumlar.sql daha önce çalıştırılmış olmalı)
//   2) Kontrol et:
//
//      node scripts/hesap-kur.mjs https://xxxx.supabase.co "sb_publishable_..."
//
// Sadece OKUR: hiçbir hesap açmaz, hiçbir veriyi değiştirmez. Geçersiz (çok kısa)
// bir şifreyle `uye_kayit` fonksiyonunu çağırır; fonksiyon varsa doğrulama hatası
// döner, yoksa 404 gelir.

const [urlArg, anahtarArg] = process.argv.slice(2);
const url = String(urlArg || process.env.YORUM_URL || "").replace(/\/+$/, "");
const anahtar = String(anahtarArg || process.env.YORUM_ANON || "").trim();

async function main() {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !anahtar) {
    console.error(
      'Kullanım: node scripts/hesap-kur.mjs https://<proje>.supabase.co "<publishable/anon key>"',
    );
    return 1;
  }

  const basliklar = { apikey: anahtar, "Content-Type": "application/json" };
  if (anahtar.startsWith("eyJ")) basliklar.Authorization = `Bearer ${anahtar}`;

  console.log("Hesap fonksiyonları deneniyor…");

  let yanit;
  try {
    yanit = await fetch(`${url}/rest/v1/rpc/uye_kayit`, {
      method: "POST",
      headers: basliklar,
      body: JSON.stringify({ p_kadi: "zz", p_sifre: "x", p_ad: "" }),
    });
  } catch (e) {
    console.error(`✗ Bağlantı kurulamadı: ${e.message}`);
    return 1;
  }

  const metin = await yanit.text();

  if (yanit.status === 404 || metin.includes("PGRST202")) {
    console.error(
      "✗ Hesap fonksiyonları YOK.\n" +
        "  SQL Editor'de supabase/hesap.sql dosyasının TAMAMINI yapıştırıp Run'a bas.\n" +
        "  Sonra bu komutu tekrar çalıştır.",
    );
    return 1;
  }

  if (yanit.status === 401 || yanit.status === 403) {
    console.error("✗ Anahtar reddedildi. 'anon public' / 'publishable' anahtarını kullandığından emin ol.");
    return 1;
  }

  let veri = {};
  try {
    veri = metin ? JSON.parse(metin) : {};
  } catch {
    /* düz metin */
  }

  // Beklenen: kullanıcı adı/şifre kısa olduğu için {"hata": "..."} dönmesi.
  if (veri && veri.hata) {
    console.log(`✓ Hesap fonksiyonları HAZIR. Örnek doğrulama yanıtı: ${veri.hata}`);
    console.log("\nSıradaki adım: site canlıda. /hesap/ sayfasından kayıt ol.");
    return 0;
  }

  console.error(
    `✗ Beklenmeyen yanıt (HTTP ${yanit.status}): ${metin.slice(0, 300)}\n` +
      "  hesap.sql içindeki fonksiyonlar eksik olabilir; dosyanın tamamını çalıştırdığından emin ol.",
  );
  return 1;
}

process.exitCode = await main();
