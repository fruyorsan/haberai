#!/usr/bin/env node
// ==========================================================================
// ALAN ADI DURUM / YAYINA ALMA ARACI
// --------------------------------------------------------------------------
// Kullanim:
//   node scripts/domain-durum.mjs            → DNS kayitlarini ve durumu yazar
//   node scripts/domain-durum.mjs --acikla   → alan adi cozuluyorsa yayina alir
//
// "--acikla" su isleri yapar (geri alinabilir):
//   1) GitHub Actions degiskeni CUSTOM_DOMAIN = haberinai.com.tr
//      (bir sonraki derleme site/public/CNAME dosyasini yazar)
//   2) GitHub Actions degiskeni SITE_URL = https://haberinai.com.tr
//   3) pipeline.yml'i elle calistirir (aninda yayin)
//
// Geri alma:
//   gh variable delete CUSTOM_DOMAIN
//   gh api -X PUT repos/fruyorsan/fruyorsan.github.io/pages -f "cname="
// ==========================================================================

import { execFileSync } from "node:child_process";
import { resolve4, resolve6, resolveCname } from "node:dns/promises";

const DOMAIN = "haberinai.com.tr";
const PAGES_HOST = "fruyorsan.github.io"; // A/AAAA kayitlari buradan okunur
const PAGES_REPO = "fruyorsan/fruyorsan.github.io"; // yayinin yapildigi depo
const WORKFLOW_REPO = "fruyorsan/haberai"; // kod deposu (Actions burada)

const gh = (...args) => {
  const out = execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20000,
  });
  return out.trim();
};

const tryResolve = async (fn, host) => {
  try {
    // NOT: Bazi modem/ISS DNS'leri var olmayan kayitlarda NXDOMAIN yerine
    // sessizce bekliyor; bu yuzden her sorguya kisa bir zaman asimi koyuyoruz.
    return await Promise.race([
      fn(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("dns-timeout")), 8000)),
    ]);
  } catch {
    return null;
  }
};

async function main() {
  const yayinaAl = process.argv.includes("--acikla");

  console.log(`\n=== ALAN ADI DURUMU: ${DOMAIN} ===\n`);

  const hedefA = (await tryResolve(resolve4, PAGES_HOST)) ?? [];
  const hedefAAAA = (await tryResolve(resolve6, PAGES_HOST)) ?? [];

  console.log("GitHub Pages'in istedigi DNS kayitlari (kayit sağlayıcına girilecek):");
  console.log(`  A     @    ${hedefA.join("\n  A     @    ")}`);
  console.log(`  AAAA  @    ${hedefAAAA.join("\n  AAAA  @    ")}`);
  console.log(`  CNAME www  ${PAGES_HOST}`);
  console.log("\nNot: .com.tr için bazen kayıt sağlayıcı '@' yerine boş/alt çizgi ister.");
  console.log("     'www' CNAME'i ile birlikte 4 A kaydı GitHub Pages için yeterlidir.\n");

  const domeA = (await tryResolve(resolve4, DOMAIN)) ?? [];
  const domeAAAA = (await tryResolve(resolve6, DOMAIN)) ?? [];
  const wwwCname = (await tryResolve(resolveCname, `www.${DOMAIN}`)) ?? [];
  const wwwA = (await tryResolve(resolve4, `www.${DOMAIN}`)) ?? [];

  const aKaydiDogru =
    domeA.length > 0 && hedefA.length > 0 && domeA.every((ip) => hedefA.includes(ip));
  const wwwDogru = wwwCname.some((c) => c.replace(/\.$/, "") === PAGES_HOST) || wwwA.length > 0;

  console.log("Şu anki durum:");
  console.log(`  ${DOMAIN}        A   → ${domeA.length ? domeA.join(", ") : "(çözülmüyor)"}`);
  console.log(`  ${DOMAIN}        AAAA→ ${domeAAAA.length ? domeAAAA.join(", ") : "(yok)"}`);
  console.log(`  www.${DOMAIN}   → ${wwwCname.length ? wwwCname.join(", ") : wwwA.length ? wwwA.join(", ") : "(çözülmüyor)"}`);
  console.log(`\n  A kaydı GitHub Pages'e işaret ediyor mu? ${aKaydiDogru ? "EVET ✓" : "HAYIR ✗"}`);
  console.log(`  www yönlendirmesi var mı?              ${wwwDogru ? "EVET ✓" : "HAYIR ✗"}`);

  let pagesCname = null;
  try {
    pagesCname = JSON.parse(gh("api", `repos/${PAGES_REPO}/pages`) || "{}").cname ?? null;
  } catch {
    /* gh yoksa veya yetki yoksa sorun değil */
  }
  console.log(`  GitHub Pages özel alan adı:            ${pagesCname ?? "(ayarlı değil)"}`);

  if (!yayinaAl) {
    if (aKaydiDogru) {
      console.log("\nAlan adı hazır görünüyor. Yayına almak için:");
      console.log("  node scripts/domain-durum.mjs --acikla\n");
    } else {
      console.log("\nAlan adı henüz GitHub Pages'e yönlenmiyor. DNS kayıtlarını ekle,\n" +
        "yayılmadan sonra bu betiği tekrar çalıştır (kontrol: node scripts/domain-durum.mjs).\n");
    }
    return;
  }

  // ---- Yayına alma ----
  if (!aKaydiDogru) {
    console.log("\n✗ Yayına alma iptal: alan adı GitHub Pages IP'lerine yönlenmiyor.");
    console.log("  Önce DNS kayıtlarını ekle. (CNAME eklenirse site erişilemez olur.)\n");
    process.exitCode = 1;
    return;
  }

  console.log("\n→ Yayına alınıyor...");
  gh("variable", "set", "CUSTOM_DOMAIN", "--body", DOMAIN, "--repo", WORKFLOW_REPO);
  console.log(`  ✓ CUSTOM_DOMAIN = ${DOMAIN}`);
  gh("variable", "set", "SITE_URL", "--body", `https://${DOMAIN}`, "--repo", WORKFLOW_REPO);
  console.log(`  ✓ SITE_URL = https://${DOMAIN}`);
  gh("workflow", "run", "pipeline.yml", "--repo", WORKFLOW_REPO);
  console.log("  ✓ pipeline.yml elle çalıştırıldı (1-3 dk içinde yayında)");
  console.log("\nYayın sonrası kontrol:");
  console.log("  curl -sI https://haberinai.com.tr/ | findstr /I \"HTTP location\"");
  console.log("  gh api -X PUT repos/" + PAGES_REPO + "/pages -F https_enforced=true   # sertifikadan sonra\n");
}

main().catch((e) => {
  console.error("Hata:", e.message);
  process.exitCode = 1;
});
