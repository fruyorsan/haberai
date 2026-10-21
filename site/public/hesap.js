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
    if (!el) return { url: "", anahtar: "", kategoriler: [], avatarlar: [] };
    try {
      var d = JSON.parse(el.textContent || "{}");
      return {
        url: String(d.hesapUrl || "").replace(/\/+$/, ""),
        anahtar: String(d.hesapAnahtar || ""),
        kategoriler: Array.isArray(d.kategoriler) ? d.kategoriler : [],
        avatarlar: Array.isArray(d.avatarlar) ? d.avatarlar : [],
      };
    } catch (e) {
      return { url: "", anahtar: "", kategoriler: [], avatarlar: [] };
    }
  }

  // ------------------------------------------------------------------------
  // Avatar (profil fotoğrafı) yardımcıları
  // ------------------------------------------------------------------------
  var stilEklendi = false;
  function stilKur() {
    if (stilEklendi || !document.head) return;
    stilEklendi = true;
    var s = document.createElement("style");
    s.textContent =
      ".hb-av-img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}" +
      ".hb-av{overflow:hidden}";
    document.head.appendChild(s);
  }

  /** Avatarın arka plan rengini bulur (hazır avatar ya da eski emoji ise). */
  function avatarRenk(deger) {
    var liste = ayarlar().avatarlar;
    for (var i = 0; i < liste.length; i++) {
      if (liste[i] && liste[i].kod === deger) return liste[i].renk || "";
    }
    return "";
  }

  /**
   * Bir elemanı avatar ile doldurur: site çizimi (/avatar/...), yüklenen görsel
   * (data/https) ya da adın baş harfi. Kap canlı bir HTML elemanıdır.
   */
  function avatarDoldur(kap, avatar, ad) {
    if (!kap) return;
    stilKur();
    kap.textContent = "";
    kap.classList.add("hb-av");
    kap.style.background = "";
    kap.style.backgroundImage = "";
    kap.style.color = "";

    var deger = avatar ? String(avatar) : "";
    var resimli =
      deger.indexOf("data:") === 0 ||
      deger.indexOf("https://") === 0 ||
      deger.charAt(0) === "/";

    if (resimli) {
      var img = document.createElement("img");
      img.className = "hb-av-img";
      img.src = deger;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      kap.appendChild(img);
      return;
    }
    if (deger) {
      kap.textContent = deger; // eski emoji avatarlar (geriye dönük)
      var renk = avatarRenk(deger);
      if (renk) kap.style.background = renk;
      kap.style.color = "#fff";
      kap.style.fontSize = "1.35em";
      return;
    }
    kap.textContent = ((ad || "?").trim().charAt(0) || "?").toLocaleUpperCase("tr");
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
      if (ikon) {
        if (u) {
          avatarDoldur(ikon, u.avatar, u.ad);
        } else {
          // Giriş yapılmamış: mobilde yazı gizlendiği için boş düğme
          // görünmemeli — sade bir "kişi" simgesi basılır.
          ikon.classList.remove("hb-av");
          ikon.textContent = "";
          ikon.innerHTML =
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
            'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
            'aria-hidden="true"><circle cx="12" cy="8" r="3.4"/>' +
            '<path d="M5.5 20c.6-3.7 3.2-5.6 6.5-5.6s5.9 1.9 6.5 5.6"/></svg>';
          ikon.style.background = "";
          ikon.style.color = "";
          ikon.style.fontSize = "";
        }
      }
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
    else void yorumKimlik();
  }

  async function kayitOl(kadi, sifre, ad) {
    var r = await rpc("uye_kayit", { p_kadi: kadi, p_sifre: sifre, p_ad: ad });
    if (r.hata) return r;
    oturumYaz({
      id: r.id,
      kadi: r.kadi,
      ad: r.ad,
      token: r.token,
      ilgi: [],
      bildirim_ilgi: [],
      avatar: null,
      rol: "uye",
      etiket: "",
      bildirim_siklik: "gunluk7",
    });
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
      avatar: r.avatar || null,
      rol: r.rol || "uye",
      etiket: r.etiket || "",
      bildirim_siklik: r.bildirim_siklik || "gunluk7",
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
    var yeni = {
      ...u,
      ad: r.ad,
      ilgi: r.ilgi || [],
      bildirim_ilgi: r.bildirim_ilgi || [],
      avatar: r.avatar || null,
      rol: r.rol || "uye",
      etiket: r.etiket || "",
      bildirim_siklik: r.bildirim_siklik || "gunluk7",
    };
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
   * Profil fotoğrafını ayarlar. Boş gönderim fotoğrafı kaldırır.
   * Değer: site çizimi ("/avatar/kedi.svg"), data URL ya da https:// görsel adresi.
   */
  async function avatarAyarla(deger) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    var r = await rpc("uye_avatar", {
      p_id: u.id,
      p_token: u.token,
      p_avatar: deger || null,
    });
    if (r && !r.hata) {
      oturumYaz({ ...u, avatar: r.avatar || null });
      duyur();
    }
    return r;
  }

  /** Beğendiğin haberlerin slug listesi (hesaba bağlı). */
  async function begeniler() {
    var u = oturumOku();
    if (!u) return [];
    var r = await rpc("uye_begeniler", { p_id: u.id, p_token: u.token });
    return Array.isArray(r) ? r : [];
  }

  async function begen(slug) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("uye_begen", { p_id: u.id, p_token: u.token, p_slug: slug });
  }

  async function begenSil(slug) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("uye_begen_sil", { p_id: u.id, p_token: u.token, p_slug: slug });
  }

  /**
   * Hesabı kalıcı olarak siler. Yorumlar silinmez; yalnızca hesap bağı kopar ve
   * yorum takma adıyla kalır. Avatar, okuma listesi ve beğeniler silinir.
   */
  async function hesapSil() {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    var r = await rpc("uye_sil", { p_id: u.id, p_token: u.token });
    if (r && !r.hata) {
      cikisYap();
      duyur();
    }
    return r;
  }

  /** Yorum cihaz anahtarının localStorage adı (Yorumlar.astro ile aynı). */
  var CIHAZ_ANAHTARI = "hb-yorum-cihaz";
  /** En son OneSignal'e yazılan üye etiketi (gereksiz silme isteği atılmasın). */
  var OS_UYE_ANAHTARI = "hb-os-yorum-uye";

  function cihazOku() {
    try {
      var v = localStorage.getItem(CIHAZ_ANAHTARI);
      return v && v.length >= 8 ? v : "";
    } catch (e) {
      return "";
    }
  }

  /**
   * Yorum bildirimleri için bu cihazı OneSignal'de işaretler:
   *
   *   * `yorum_kimlik_c` → cihaz anahtarı: hesapsız yazılan yorumların sahibi,
   *   * `yorum_kimlik_u` → üye numarası: hesapla yazılan yorumların sahibi.
   *
   * Sunucu (supabase/yorum-bildirim.sql), bir yorum beğenildiğinde ya da yoruma
   * yanıt geldiğinde bildirimi YALNIZCA bu etiketlerle tek kişiye yollar.
   * Etiket yazılamazsa (SDK yok, reklam engelleyici…) sessizce geçilir.
   *
   * `cihaz` verilmezse localStorage'daki anahtar kullanılır; o da yoksa yalnızca
   * üye etiketi yazılır. Hesap kapandıysa üye etiketi SİLİNİR: çıkış yapan
   * okuyucunun cihazı, o hesabın yorum bildirimlerini almaya devam etmesin.
   */
  async function yorumKimlik(cihaz) {
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
    if (!os || !os.User) return;

    var u = oturumOku();
    var simdiki = u && u.id ? String(u.id) : "";
    var onceki = "";
    try {
      onceki = localStorage.getItem(OS_UYE_ANAHTARI) || "";
    } catch (e) {}

    try {
      var t = {};
      var c = cihaz || cihazOku();
      if (c) t.yorum_kimlik_c = String(c);
      if (simdiki) t.yorum_kimlik_u = simdiki;
      if (Object.keys(t).length && typeof os.User.addTags === "function") os.User.addTags(t);
      // Hesap kapanmışsa eski üye etiketi kalmasın (hesap değişiminde etiketin
      // üzerine yeni numara yazılır, ayrıca silmeye gerek yok).
      if (!simdiki && onceki && typeof os.User.removeTag === "function") {
        os.User.removeTag("yorum_kimlik_u");
      }
      try {
        localStorage.setItem(OS_UYE_ANAHTARI, simdiki);
      } catch (e) {}
    } catch (e) {}
  }

  /**
   * Hesabı bu cihazın bildirim aboneliğine bağlar (OneSignal external id) ve
   * ilgi alanlarını bildirim etiketlerine yazar. Bildirim panelinin yerel
   * anahtarları da güncellenir; panel seçimleri dolu gösterir.
   */
  async function pushEsle(u) {
    u = u || oturumOku();
    if (!u) return;
    // Yerel kopya OneSignal'den BAĞIMSIZ yazılır: bildirim paneli ve haber
    // sayfasındaki "takip et" düğmeleri, SDK hazır olmasa da seçimleri dolu
    // göstersin. (Eskiden erken return yüzünden seçimler kaybolmuş görünüyordu.)
    // Hesapta hiç konu yoksa (ne bildirim konusu ne ilgi alanı) cihazın kendi
    // panelinden yaptığı seçim KORUNUR; eskiden her sayfa açılışında boş listeyle
    // üzerine yazılıyor ve okuyucunun seçtiği konular siliniyordu.
    var hesapListesi =
      u.bildirim_ilgi && u.bildirim_ilgi.length ? u.bildirim_ilgi : u.ilgi || [];
    var yerelListe = [];
    try {
      var ham = JSON.parse(localStorage.getItem("bildirim-kategoriler") || "[]");
      if (Array.isArray(ham)) yerelListe = ham.filter(Boolean).map(String);
    } catch (e) {}
    var slugs = hesapListesi.length ? hesapListesi : yerelListe;
    try {
      localStorage.setItem("bildirim-kategoriler", JSON.stringify(slugs));
      localStorage.setItem("bildirim-son-dakika", "true");
      if (u.bildirim_siklik) localStorage.setItem("bildirim-siklik", u.bildirim_siklik);
      window.dispatchEvent(
        new CustomEvent("hb-bildirim-degisti", { detail: { kategoriler: slugs } })
      );
    } catch (e) {}

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

    try {
      os.login(String(u.id));
    } catch (e) {}
    // Yorum bildirimleri (beğeni/yanıt) için kimlik etiketleri de yazılır.
    void yorumKimlik();

    try {
      var tum = ayarlar().kategoriler;
      // son_dakika: hesaba giren cihazın son dakika haberlerini alması için
      // (sunucu "tüm aboneler" hedeflemesini bu etiketle yapar).
      var t = { uye: "1", son_dakika: "1" };
      // Bildirim sıklığı: sunucu "aninda" olanlara her konuyu anında yollar,
      // "gunluk7"/"gunluk10" olanlara günde en fazla 7/10 bildirim, "ozet"
      // olanlara günde 3 özet, "son" olanlara yalnızca son dakika.
      var siklik = u.bildirim_siklik || "";
      if (!siklik) {
        try {
          siklik = localStorage.getItem("bildirim-siklik") || "gunluk7";
        } catch (e) {
          siklik = "gunluk7";
        }
      }
      t.bildirim_sikligi = siklik;
      try {
        localStorage.setItem("bildirim-siklik", siklik);
      } catch (e) {}
      for (var i = 0; i < tum.length; i++) {
        // Anında ve günlük sınırlı modlar konu bildirimi alır; özet/son
        // seçenlerde kategori etiketi boşaltılır.
        t["kategori_" + tum[i]] =
          (siklik === "aninda" || siklik === "gunluk7" || siklik === "gunluk10") &&
          slugs.indexOf(tum[i]) >= 0
            ? "1"
            : "";
      }
      os.User.addTags(t);
    } catch (e) {}
  }

  /**
   * Bildirim sıklığını kaydeder (gunluk7 | gunluk10 | aninda | ozet | son) ve
   * cihaz etiketini hemen günceller. Profil sayfasındaki seçici bunu çağırır.
   */
  async function bildirimSiklik(siklik) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    var r = await rpc("uye_bildirim_siklik", {
      p_id: u.id,
      p_token: u.token,
      p_siklik: siklik,
    });
    if (!r || r.hata) return r || { hata: "Kaydedilemedi." };
    u.bildirim_siklik = siklik;
    oturumYaz(u);
    try {
      localStorage.setItem("bildirim-siklik", siklik);
    } catch (e) {}
    await pushEsle(u);
    return r;
  }

  /** Yönetici: kayıtlı okuyucuların listesi. */
  async function adminUyeler() {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("admin_uyeler", { p_id: u.id, p_token: u.token });
  }

  /** Yönetici: bir okuyucuya rozet yazar. Rozet sadece görünür; yetki vermez. */
  async function adminEtiket(hedef, etiket) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    return rpc("admin_etiket", {
      p_id: u.id,
      p_token: u.token,
      p_hedef: hedef,
      p_etiket: etiket || "",
      p_rol: null,
    });
  }

  /**
   * Üye olarak yorum yazar. `ust` verilirse bu bir YANITTIR: haber adresi
   * sunucuda üst yorumdan bulunur ve yanıtlanan yorumun sahibine bildirim gider.
   */
  async function yorumEkle(slug, metin, ust) {
    var u = oturumOku();
    if (!u) return { hata: "Giriş yapmalısın." };
    if (ust) {
      return rpc("uye_yanit_ekle", {
        p_id: u.id,
        p_token: u.token,
        p_yorum: ust,
        p_metin: metin,
      });
    }
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
    avatarAyarla: avatarAyarla,
    avatarDoldur: avatarDoldur,
    begeniler: begeniler,
    begen: begen,
    begenSil: begenSil,
    hesapSil: hesapSil,
    pushEsle: pushEsle,
    yorumKimlik: yorumKimlik,
    bildirimSiklik: bildirimSiklik,
    adminUyeler: adminUyeler,
    adminEtiket: adminEtiket,
    dugmeleriGuncelle: dugmeleriGuncelle,
  };

  function baslat() {
    dugmeleriGuncelle();
    var u = oturumOku();
    if (u) pushEsle(u);
    // Hesapsız okuyucu da (daha önce yorum yazdıysa) cihaz etiketini taşısın:
    // beğeni/yanıt bildirimi ancak bu etiketle okuyucuya ulaşabilir.
    else void yorumKimlik();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", baslat);
  } else {
    baslat();
  }
})();
