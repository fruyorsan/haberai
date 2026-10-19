// ==========================================================================
// HESAP — okuyucu oturumu (klasik tarayıcı betiği)
// --------------------------------------------------------------------------
// Neden public/ altında: Astro'nun modül paketleyicisi yalnızca içe aktarma
// içeren bir <script> etiketini üretim derlemesinde düşürebiliyor. Bu dosya
// doğrudan /hesap.js olarak servis edilir; her sayfada Base.astro yükler.
//
// Kimlik doğrulama Supabase tarafındadır (supabase/hesap.sql). Burada yalnızca
// kayıt/giriş/çıkış, oturumun saklanması ve arayüz düğmelerinin güncellenmesi
// yapılır. Şifre saklanmaz; yalnızca sunucunun ürettiği oturum anahtarı tutulur.
// ==========================================================================
(function () {
  "use strict";

  var ANAHTAR = "hb-oturum";

  function ayarlar() {
    var el = document.getElementById("hb-ayar");
    if (!el) return { url: "", anahtar: "", kategoriler: [] };
    try {
      var d = JSON.parse(el.textContent || "{}");
      return {
        url: String(d.hesapUrl || "").replace(/\/+$/, ""),
        anahtar: String(d.hesapAnahtar || ""),
        kategoriler: Array.isArray(d.kategoriler) ? d.kategoriler : [],
      };
    } catch (e) {
      return { url: "", anahtar: "", kategoriler: [] };
    }
  }

  function basliklar() {
    var a = ayarlar();
    var h = { apikey: a.anahtar, "Content-Type": "application/json" };
    if (a.anahtar.indexOf("eyJ") === 0) h.Authorization = "Bearer " + a.anahtar;
    return h;
  }

  function oturumOku() {
    try {
      var ham = localStorage.getItem(ANAHTAR);
      if (!ham) return null;
      var u = JSON.parse(ham);
      return u && u.id && u.token ? u : null;
    } catch (e) {
      return null;
    }
  }

  function oturumYaz(u) {
    try {
      if (u) localStorage.setItem(ANAHTAR, JSON.stringify(u));
      else localStorage.removeItem(ANAHTAR);
    } catch (e) {}
  }

  async function rpc(fn, govde) {
    var a = ayarlar();
    if (!a.url || !a.anahtar) return { hata: "Hesap servisi ayarlı değil." };
    var r;
    try {
      r = await fetch(a.url + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: basliklar(),
        body: JSON.stringify(govde),
      });
    } catch (e) {
      return { hata: "Bağlantı kurulamadı. İnternetini kontrol et." };
    }
    var metin = await r.text();
    if (!r.ok) {
      var mesaj = "Beklenmeyen bir hata oluştu.";
      // Fonksiyon bulunamadı: SQL kurulmamış (PostgREST 404 / PGRST202).
      if (r.status === 404 || r.status === 400) {
        if (metin.indexOf("PGRST202") >= 0 || r.status === 404) {
          mesaj = "Hesap sistemi henüz kurulmadı. Yönetici supabase/hesap.sql dosyasını çalıştırmalı.";
        }
      }
      try {
        var j = JSON.parse(metin);
        if (j.message) mesaj = j.message;
        if (j.hata) mesaj = j.hata;
      } catch (e) {}
      return { hata: mesaj };
    }
    try {
      return metin ? JSON.parse(metin) : {};
    } catch (e) {
      return {};
    }
  }

  function dugmeleriGuncelle() {
    var u = oturumOku();
    var liste = document.querySelectorAll("[data-hesap]");
    for (var i = 0; i < liste.length; i++) {
      var el = liste[i];
      var ad = el.querySelector("[data-hesap-ad]");
      var ikon = el.querySelector("[data-hesap-ikon]");
      if (ad) ad.textContent = u ? u.ad : "Giriş";
      if (ikon) ikon.textContent = u ? (u.ad.trim().charAt(0) || "?").toLocaleUpperCase("tr") : "";
      el.classList.toggle("is-uye", Boolean(u));
      el.setAttribute("title", u ? u.ad + " · profilim" : "Giriş yap / kayıt ol");
      if (el.tagName === "A") el.setAttribute("href", u ? "/profil/" : "/hesap/");
    }
  }

  function duyur() {
    var u = oturumOku();
    try {
      window.dispatchEvent(new CustomEvent("hb-oturum-degisti", { detail: u }));
    } catch (e) {}
    dugmeleriGuncelle();
    if (u) pushEsle(u);
  }

  async function kayitOl(kadi, sifre, ad) {
    var r = await rpc("uye_kayit", { p_kadi: kadi, p_sifre: sifre, p_ad: ad });
    if (r.hata) return r;
    oturumYaz({ id: r.id, kadi: r.kadi, ad: r.ad, token: r.token, ilgi: [], bildirim_ilgi: [] });
    duyur();
    return r;
  }

  async function girisYap(kadi, sifre) {
    var r = await rpc("uye_giris", { p_kadi: kadi, p_sifre: sifre });
    if (r.hata) return r;
    oturumYaz({
      id: r.id,
      kadi: r.kadi,
      ad: r.ad,
      token: r.token,
      ilgi: r.ilgi || [],
      bildirim_ilgi: r.bildirim_ilgi || [],
    });
    duyur();
    return r;
  }

  async function cikisYap() {
    var u = oturumOku();
    if (u) await rpc("uye_cikis", { p_id: u.id, p_token: u.token });
    oturumYaz(null);
    duyur();
  }

  async function profilTazele() {
    var u = oturumOku();
    if (!u) return null;
    var r = await rpc("uye_bilgi", { p_id: u.id, p_token: u.token });
    if (r.hata) {
      if (/geçersiz/i.test(r.hata)) {
        oturumYaz(null);
        duyur();
      }
      return null;
    }
    var yeni = { ...u, ad: r.ad, ilgi: r.ilgi || [], bildirim_ilgi: r.bildirim_ilgi || [] };
    oturumYaz(yeni);
    duyur();
    return yeni;
  }

  async function profilGuncelle(patch) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    var r = await rpc("uye_guncelle", {
      p_id: u.id,
      p_token: u.token,
      p_ad: patch.ad != null ? patch.ad : u.ad,
      p_ilgi: patch.ilgi != null ? patch.ilgi : u.ilgi || [],
      p_bildirim_ilgi: patch.bildirim_ilgi != null ? patch.bildirim_ilgi : u.bildirim_ilgi || [],
    });
    if (r.hata) return r;
    oturumYaz({
      ...u,
      ad: r.ad != null ? r.ad : u.ad,
      ilgi: r.ilgi != null ? r.ilgi : u.ilgi,
      bildirim_ilgi: r.bildirim_ilgi != null ? r.bildirim_ilgi : u.bildirim_ilgi,
    });
    duyur();
    return r;
  }

  async function yorumlarim() {
    var u = oturumOku();
    if (!u) return [];
    var r = await rpc("uye_yorumlar", { p_id: u.id, p_token: u.token });
    return Array.isArray(r) ? r : [];
  }

  /** Haberi okuma listesine ekle. */
  async function kaydet(slug, baslik) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("uye_kaydet", {
      p_id: u.id,
      p_token: u.token,
      p_slug: slug,
      p_baslik: baslik || "",
    });
  }

  /** Haberi okuma listesinden çıkar. */
  async function kaydetSil(slug) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("uye_kayit_sil", { p_id: u.id, p_token: u.token, p_slug: slug });
  }

  /** Okuma listesi. */
  async function kayitlar() {
    var u = oturumOku();
    if (!u) return [];
    var r = await rpc("uye_kayitlar", { p_id: u.id, p_token: u.token });
    return Array.isArray(r) ? r : [];
  }

  /**
   * Hesabı bu cihazın bildirim aboneliğine bağlar (OneSignal external id) ve
   * ilgi alanlarını bildirim etiketlerine yazar. Bildirim panelinin yerel
   * anahtarları da güncellenir; panel seçimleri dolu gösterir.
   */
  async function pushEsle(u) {
    u = u || oturumOku();
    if (!u) return;
    var hazir = window.HaberinaiOS && window.HaberinaiOS.hazir;
    if (!hazir) return;
    var os = await Promise.race([
      hazir,
      new Promise(function (r) {
        setTimeout(function () {
          r(null);
        }, 8000);
      }),
    ]);
    if (!os) return;

    var slugs = u.bildirim_ilgi || [];
    try {
      localStorage.setItem("bildirim-kategoriler", JSON.stringify(slugs));
      localStorage.setItem("bildirim-son-dakika", "true");
    } catch (e) {}

    try {
      os.login(String(u.id));
    } catch (e) {}

    try {
      var tum = ayarlar().kategoriler;
      var t = { uye: "1" };
      for (var i = 0; i < tum.length; i++) {
        t["kategori_" + tum[i]] = slugs.indexOf(tum[i]) >= 0 ? "1" : "";
      }
      os.User.addTags(t);
    } catch (e) {}
  }

  async function yorumEkle(slug, metin) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("uye_yorum_ekle", { p_id: u.id, p_token: u.token, p_slug: slug, p_metin: metin });
  }

  window.HaberinAi = {
    aktif: function () {
      var a = ayarlar();
      return Boolean(a.url && a.anahtar);
    },
    oturumOku: oturumOku,
    kayitOl: kayitOl,
    girisYap: girisYap,
    cikisYap: cikisYap,
    profilTazele: profilTazele,
    profilGuncelle: profilGuncelle,
    yorumlarim: yorumlarim,
    yorumEkle: yorumEkle,
    kaydet: kaydet,
    kaydetSil: kaydetSil,
    kayitlar: kayitlar,
    pushEsle: pushEsle,
    dugmeleriGuncelle: dugmeleriGuncelle,
  };

  function baslat() {
    dugmeleriGuncelle();
    var u = oturumOku();
    if (u) pushEsle(u);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baslat);
  } else {
    baslat();
  }
})();
