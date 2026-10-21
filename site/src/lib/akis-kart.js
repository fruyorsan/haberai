// ==========================================================================
// SHORTS HABER (/akis/) — kart üreticisi
// --------------------------------------------------------------------------
// Akış, Twitter/Shorts hissi veren dikey bir haber akışıdır: her kartta büyük
// gerçek fotoğraf, vurucu başlık, kısa AI özeti ve beğen/kaydet/paylaş
// eylemleri bulunur.
//
// Bu dosya kartın TEK şablonudur:
//   - /akis/ sayfası ilk kartları sunucuda bu şablonla basar,
//   - /akis.json sonsuz kaydırma için sonraki kartları aynı şablonla üretir.
// Böylece HTML iki yerde ayrı ayrı yazılmaz, tasarım tek yerden değişir.
//
// Görsel kuralı: kapak süzgecinden (lib/kapak.js) geçmeyen fotoğraf gösterilmez;
// o haberler markalı kırmızı zemin + kategori ile basılır. Yanlış fotoğraf
// göstermektense markalı zemin yeğlenir. Kart üzerinde marka/harf YER TUTUCUSU
// gösterilmez (eskiden "H" harfi basılıyordu): akışta fotoğrafsız haberler
// zaten listenin sonuna düşer (lib/ilgi.js), yani ilk ekranlar hep fotoğraflı.
// ==========================================================================
import { imageUrl, imageSrcset, timeAgo, publishedISO } from "./articles.js";
import { kapakKaynagi } from "./kapak.js";
import { ilgiSkoru } from "./ilgi.js";

/** HTML kaçışı: başlık/özet kaynak siteden geldiği için zorunludur. */
export function kac(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** Metni kelime ortasından kesmeden kısaltır. */
export function kisalt(metin, sinir = 190) {
  const t = String(metin ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= sinir) return t;
  const kesik = t.slice(0, sinir);
  const bosluk = kesik.lastIndexOf(" ");
  return `${(bosluk > sinir * 0.6 ? kesik.slice(0, bosluk) : kesik).replace(/[,;:.\s]+$/, "")}…`;
}

// CDN (wsrv.nl) görseli getiremezse kaynak adrese düşülür; o da olmazsa kart
// markalı zeminde kalır — bozuk görsel simgesi görünmez.
//
// ÖNEMLİ: srcset niteliği dururken `src` değiştirmek görüntüyü değiştirmez
// (tarayıcı srcset adayını kullanmaya devam eder). Bu yüzden yedeğe geçmeden
// önce srcset/sizes KALDIRILIR; aksi halde "kurtarma" sessizce başarısız olur.
const GORSEL_HATA =
  "if(this.dataset.orig&&!this.dataset.f){this.dataset.f='1';this.removeAttribute('srcset');this.removeAttribute('sizes');this.src=this.dataset.orig}" +
  "else{this.remove()}";

const KALP_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.4l8.8-8.7a5 5 0 0 0 0-7.1z"/></svg>';
const KAYIT_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h12a1 1 0 0 1 1 1v16l-7-4-7 4v-16a1 1 0 0 1 1-1z"/></svg>';
const PAYLAS_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
const YORUM_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4-1 0-2-.2-2.9-.5L4.2 20.5l1.3-3.6C4.4 15.7 3.5 13.9 3.5 12 3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4z"/></svg>';

/**
 * Tek bir akış kartının HTML'i.
 *
 * İlgi puanı (lib/ilgi.js) kartta `data-ilgi` olarak durur; sıralama sunucuda
 * bu puana göre yapıldığı için kartta ayrıca "🔥" rozeti GÖSTERİLMEZ (akışın
 * tepesi zaten en ilgi çekici haberlerdir; 24 kartın 24'ünü işaretlemek anlamsız
 * olurdu). Rozet, kronolojik listelerde kullanılır (ArticleCard.astro).
 *
 * @param {any} a haber kaydı (getArticles çıktısı)
 * @param {number} sira akıştaki sıra (ilk kartlar öncelikli yüklenir)
 * @returns {string}
 */
export function akisKart(a, sira = 0) {
  const kaynak = kapakKaynagi(a);
  const gorsel = kaynak ? imageUrl(kaynak, 960) : "";
  const gorselSet = kaynak ? imageSrcset(kaynak, [640, 960, 1280]) : "";
  const puan = ilgiSkoru(a);
  const baslik = kac(a.title);
  const ozet = kisalt(a.summary, 190);
  const kat = kac(a.category || "Haber");
  const slug = kac(a.slug);
  const kaynakAdi = kac(a.source || "HaberinAi");
  const zaman = kac(timeAgo(publishedISO(a)));
  // İlk kart vitrin gibidir: hemen yüklenir (LCP). Sonrakiler tembel.
  const oncelik = sira === 0;

  const gorselBlok = gorsel
    ? `<img src="${kac(gorsel)}"${
        gorselSet ? ` srcset="${kac(gorselSet)}" sizes="(max-width: 720px) 100vw, 640px"` : ""
      } width="960" height="540" alt="${baslik}"${
        oncelik ? ' fetchpriority="high"' : ' loading="lazy"'
      } decoding="async" data-orig="${kac(kaynak)}" onerror="${GORSEL_HATA}" />`
    : "";

  return `<article class="ak" data-slug="${slug}" data-ad="${kac(a.title)}" data-kat="${kac(a.categorySlug)}" data-ilgi="${puan}"${
    a.breaking === true ? ' data-son="1"' : ""
  }>
  <div class="ak__gorsel${gorsel ? "" : " ak__gorsel--yok"}">
    ${gorselBlok}
    <a class="ak__kat" href="/kategori/${kac(a.categorySlug)}/">${kat}</a>
    ${a.breaking === true ? '<span class="ak__son"><i></i>SON DAKİKA</span>' : ""}
  </div>
  <div class="ak__govde">
    <h2 class="ak__baslik"><a href="/haber/${slug}/">${baslik}</a></h2>
    ${
      ozet
        ? `<p class="ak__ozet"><span class="ak__ai" aria-hidden="true">✦</span>${kac(ozet)}</p>`
        : ""
    }
    <div class="ak__alt">
      <span class="ak__kaynak" title="Kaynak">${kaynakAdi}</span>
      <span class="ak__nokta" aria-hidden="true">·</span>
      <span class="ak__zaman">${zaman}</span>
    </div>
    <div class="ak__eylem">
      <a class="ak__oku" href="/haber/${slug}/">Haberi oku</a>
      <button class="ak__ikon ak__begen" type="button" data-islem="begen" aria-pressed="false" aria-label="Bu haberi beğen" title="Beğen">${KALP_SVG}</button>
      <button class="ak__ikon ak__yorum" type="button" data-islem="yorum" aria-label="Yorumlar" title="Yorumlar">${YORUM_SVG}</button>
      <button class="ak__ikon ak__kaydet" type="button" data-islem="kaydet" aria-pressed="false" aria-label="Bu haberi kaydet" title="Kaydet">${KAYIT_SVG}</button>
      <button class="ak__ikon ak__paylas" type="button" data-islem="paylas" aria-label="Bu haberi paylaş" title="Paylaş">${PAYLAS_SVG}</button>
    </div>
  </div>
</article>`;
}

/** Kart dizisini tek HTML parçasına çevirir. */
export function akisKartlar(liste, baslangic = 0) {
  return liste.map((a, i) => akisKart(a, baslangic + i)).join("\n");
}

/** /akis/ sayfasında ilk turda basılan kart sayısı. */
export const AKIS_ILK = 24;
/** Sonsuz kaydırmada her dosyada hazır duran kart sayısı. */
export const AKIS_TUR = 24;
