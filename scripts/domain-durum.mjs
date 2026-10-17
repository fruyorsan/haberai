#!/usr/bin/env node
// ==========================================================================
// ALAN ADI DURUM / YAYINA ALMA ARACI
// --------------------------------------------------------------------------
// Kullanim:
//   node scripts/domain-durum.mjs            → DNS kayitlarini ve durumu yazar
//   node scripts/domain-durum.mjs --acikla   → alan adi cozuluyorsa yayina alir
//
// "--acikla" su isleri yapar (geri alinabilir):
//   1) GitHub Actions degiskeni CUSTOM_DOMAIN = <alan adi>
//      (bir sonraki derleme site/public/CNAME dosyasini yazar)
//   2) GitHub Actions degiskeni SITE_URL = https://<alan adi>
//   3) pipeline.yml'i elle calistirir (aninda yayin)
//
// Alan adi degistirmek icin:  DOMAIN=ornek.com npm run domain
//
// Geri alma:
//   gh variable delete CUSTOM_DOMAIN
//   gh api -X PUT repos/fruyorsan/fruyorsan.github.io/pages -f "cname="
//
// NOT (Natro): Natro'da sadece alan adi alindiysa A/CNAME kaydi duzenlemek
// "Premium/Profesyonel DNS" hizmetine bagli (aylik ~0,10 $). Ucretsiz yol:
// nameserver'lari ucretsiz bir DNS saglayicisina (or. Cloudflare) cevirip
// kayitlari orada yonetmek.
// ==========================================================================

import { execFileSync } from "node:child_process";

// --------------------------------------------------------------------------
// DNS sorgusu: DNS-over-HTTPS
// Yerel modem/ISS DNS'i eski kaydi saatlerce onbelleginde tutabiliyor, bazi
// ISS'ler UDP:53 sorgularini yonlendiriyor. "Dunya ne goruyor" sorusunun
// cevabi icin HTTPS uzerinden genel cozumleyicilere sorulur.
// Degistirmek icin:  DOH_SUNUCU=https://dns.google/resolve npm run domain
// --------------------------------------------------------------------------
const DOH_SUNUCULARI = [
  process.env.DOH_SUNUCU || "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];
const TIP_KODU = { A: 1, NS: 2, CNAME: 5, AAAA: 28 };

async function dohSorgu(ad, tip) {
  let sonHata = null;
  for (const sunucu of DOH_SUNUCULARI) {
    try {
      const r = await fetch(`${sunucu}?name=${encodeURIComponent(ad)}&type=${tip}`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const kod = TIP_KODU[tip];
      return (j.Answer || [])
        .filter((a) => a.type === kod)
        .map((a) => String(a.data).replace(/\.$/, ""));
    } catch (e) {
      sonHata = e;
    }
  }
  throw sonHata ?? new Error("doh-basarisiz");
}

// Alan adi: DOMAIN=... ortam degiskeni ya da --domain=... ile degistirilebilir.
const DOMAIN = (
  process.env.DOMAIN ||
  (process.argv.find((a) => a.startsWith("--domain=")) || "").slice("--domain=".length) ||
  "haberinai.site"
)
  .trim()
  .toLowerCase();
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

const tryResolve = async (fn) => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

async function main() {
  const yayinaAl = process.argv.includes("--acikla");

  console.log(`\n=== ALAN ADI DURUMU: ${DOMAIN} ===\n`);

  const hedefA = (await tryResolve(() => dohSorgu(PAGES_HOST, "A"))) ?? [];
  const hedefAAAA = (await tryResolve(() => dohSorgu(PAGES_HOST, "AAAA"))) ?? [];

  console.log("GitHub Pages'in istedigi DNS kayitlari (kayit sağlayıcına girilecek):");
  console.log(`  A     @    ${hedefA.join("\n  A     @    ")}`);
  console.log(`  AAAA  @    ${hedefAAAA.join("\n  AAAA  @    ")}`);
  console.log(`  CNAME www  ${PAGES_HOST}`);
  console.log("\nNotlar:");
  console.log("  • Kayıt sağlayıcı '@' yerine boş alan isteyebilir (alt alan adı boş).");
  console.log("  • 4 A kaydı + 'www' CNAME'i GitHub Pages için yeterlidir.");
  console.log("  • Natro'da DNS kaydı düzenlemek Premium DNS hizmetine bağlı;");
  console.log("    ücretsiz yol: nameserver'ları Cloudflare'e çevirip kayıtları orada girmek.\n");

  const domeA = (await tryResolve(() => dohSorgu(DOMAIN, "A"))) ?? [];
  const domeAAAA = (await tryResolve(() => dohSorgu(DOMAIN, "AAAA"))) ?? [];
  const wwwCname = (await tryResolve(() => dohSorgu(`www.${DOMAIN}`, "CNAME"))) ?? [];
  const wwwA = (await tryResolve(() => dohSorgu(`www.${DOMAIN}`, "A"))) ?? [];

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
  console.log(`  curl -sI https://${DOMAIN}/ | findstr /I "HTTP location"`);
  console.log("  gh api -X PUT repos/" + PAGES_REPO + "/pages -F https_enforced=true   # sertifikadan sonra\n");
}

main().catch((e) => {
  console.error("Hata:", e.message);
  process.exitCode = 1;
});
