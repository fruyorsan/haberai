// ==========================================================================
// /akis/sayfa/<ofset>.json — Shorts Haber'in sonsuz kaydırma topları
// --------------------------------------------------------------------------
// NEDEN SORGU DİZESİ DEĞİL: site tamamen statik (GitHub Pages). Statik bir
// /akis.json dosyası sorgu dizesini (offset, kategori) göremez; her istek aynı
// ilk kartları döndürür ve akışta tekrarlar oluşur. Bu yüzden her top ayrı bir
// statik dosya olarak ÜRETİM ANINDA hazırlanır:
//
//   /akis/sayfa/0.json, /akis/sayfa/24.json, /akis/sayfa/48.json, ...
//
// Her dosyada AKIS_TUR kartın HAZIR HTML'i durur (şablon: lib/akis-kart.js).
// İstemci yalnızca sıradaki ofseti indirir; tekrar eden slug'lar istemcide
// ayıklanır (kategori akışında ilk kartlar süzülmüş listeden geldiği için
// çakışma olabilir).
// ==========================================================================
import { getYayinArticles } from "../../../lib/articles.js";
import { akisKartlar, AKIS_TUR } from "../../../lib/akis-kart.js";
import { ilgiSirala } from "../../../lib/ilgi.js";

/** Akışın tamamı için top dosyalarını üretir (0, 24, 48, …). */
export function getStaticPaths() {
  const toplam = getYayinArticles().length;
  const yollar = [];
  for (let offset = 0; offset < toplam; offset += AKIS_TUR) {
    yollar.push({ params: { no: String(offset) } });
  }
  return yollar;
}

export function GET({ params }) {
  const offset = Math.max(0, Number.parseInt(String(params.no), 10) || 0);
  // Sıra, /akis/ gövdesiyle AYNI olmalı (lib/ilgi.js): aksi halde sonsuz
  // kaydırmada tekrar eden kartlar ve sıra atlamaları olur.
  const tumu = getYayinArticles();
  const liste = ilgiSirala(tumu);
  const dilim = liste.slice(offset, offset + AKIS_TUR);
  const sonraki = offset + dilim.length;

  return new Response(
    JSON.stringify({
      offset,
      verilen: dilim.length,
      sonraki,
      toplam: liste.length,
      son: sonraki >= liste.length,
      html: akisKartlar(dilim, offset),
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Akış 5 dakikada bir güncelleniyor; kısa önbellek yeterli.
        "Cache-Control": "public, max-age=300",
      },
    }
  );
}
