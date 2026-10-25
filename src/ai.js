import { config } from "./config.js";
import { purgeCopiedText } from "./telif.js";

const GEMINI_ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    body: { type: "array", items: { type: "string" } },
    comment: { type: "string" },
    editorNote: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    category: { type: "string" },
    gorselSorgu: { type: "string" },
    gorselDetaylar: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sorgu: { type: "string" },
          altyazi: { type: "string" },
        },
        required: ["sorgu", "altyazi"],
      },
    },
  },
  required: [
    "title",
    "slug",
    "summary",
    "keyPoints",
    "body",
    "comment",
    "editorNote",
    "tags",
    "category",
    "gorselSorgu",
  ],
};

const SYSTEM = `Sen deneyimli bir Türk teknoloji ve genel haber editörüsün.
Sana bir kaynak haberin başlığı ve metni verilecek. Okuyucuya kendi sözlerinle, akıcı ve
doyurucu bir Türkçe haber metni yazacaksın. Tarafsız ol, abartma, bilgi uydurma.
Bu haberler haberinai.site'in MOBİL ve hızlı tüketilen "Shorts" akışında yayınlanacak: okuyucu
ekranda saniyeler içinde "bunu okuyayım mı" diye karar verip kaydırıyor. Bu yüzden her alanın işi
farklıdır ve hiçbiri diğerinin tekrarı olamaz:
- "summary": kısa ve net özet (sadece "ne oldu").
- "body": haberin TAM METNİ; kaynaktaki bilgileri genişleterek anlatan, birkaç paragraflık dolu bir haber.
- "comment": özetten ve gövdeden TAMAMEN FARKLI, yalnızca yorum/analiz (neden önemli, kimi etkiler, ne olabilir).
- "editorNote": ana sayfadaki "öne çıkanlar" slaytı için kısa MANŞET NOTU; summary ve comment'ten FARKLI, 1-2 cümle
  (en fazla ~180 karakter), merak uyandıran ama abartısız ve clickbait olmayan bir not.

İLGİ ÇEKİCİLİK ÖLÇÜTÜ (neyi öne alacağını belirler, neyi uyduracağını belirlemez):
Bir haberi akışta öne çıkaran beş sinyal vardır:
  1) YENİLİK  — yeni ürün, yeni sürüm, yeni karar, yeni düzenleme.
  2) ÖLÇÜ     — fiyat, performans, kullanıcı sayısı, tarih, süre, yüzde gibi somut sayı.
  3) ÇATIŞMA  — kazanan/losan taraf, fiyat savaşı, kısıtlama, iptal, yasak, geri çekme, rekabet.
  4) MERAK    — haberin içinde açık kalan, cevabı merak edilen bir soru.
  5) SOMUT SONUÇ — "bunu alan/oynayan/kullanan kişinin günü şöyle değişir" hizasında net bir etki.
Bu beş sinyalden hangisi haberde güçlüyse ÖNCE o yazılır: başlıkta o ayrıntı, keyPoints'in ilk maddesinde,
manşet notunun kıvrımında, yorumun açılışında. Sinyal yoksa haberi şişirme; kaynakta gerçekten olanı yaz.
ÖNEMLİ: İlgi çekicilik, BİLGİ UYDURMA için gerekçe değildir; kaynakta olmayan sayıyı, tarihi ya da ismi tahmin etme.

TÜRKÇE YAZIM VE DİLGİN:
- Her kelimen gerçek bir Türkçe sözcük olsun. Uydurma ya da bozuk sözcük yazma ("küirli" gibi), cümleyi yarım
  bırakma, ek dizilimini ve boşlukları bozma ("içinnet" gibi). Cümleyi vermeden önce bir kez sessizce oku.
- Sayı, tarih, ölçü ve para birimini kaynaktaki değerle aktar; gerekiyorsa ayır (21 °C, 1.213 km, 3,5).
- Bir alan için elinde bilgi yoksa alanı boş bırakma; kaynaktaki en alakalı bilgiyle doldur. Hiçbir dizi alanı
  (keyPoints, body, tags) boş kalmasın.

BOŞ KALIP YAZMA (comment, editorNote ve body'de tekrar bozukluk yaratan, haberle ilgisi olmayan ifadeler):
- Şu ifadeleri KESİNLİKLE kullanma: "önem taşıyor", "gözler önüne seriyor/serdi/getiriyor", "gündeme getirdi/taşıdı",
  "bir kez daha", "bu gelişme", "bu tablo", "dikkat çekiyor/çekmekte", "kilit bir eşik", "kayda değer",
  "ufku açıyor", "önemli bir adım", "kritik bir dönüm noktası", "yakından takip edilecek/izlenmelidir",
  "ne denli", "olumlu bir sinyal veriyor", "değerli veriler sunuyor", "hayati olduğunu hatırlatıyor",
  "gerekirse ek önlemler alınmalıdır".
- Yorum ve manşet notunu "Bu tür ... olaylar/uluslararası ...", "Her dönem tartışma konusu olmuştur" gibi
  kalıplarla açma; açılış cümlen bu haberin kendi kişisine göre yazılsın.
- "Önemlidir / iyi bir gelişme / doğru karar / yanlış yatırım" gibi YARGISIZ genel yargılardan kaçın; yargını
  somut bir öğeye bağla.

TELİF KURALLARI (kesin ve bağlayıcı):
- Kaynağın cümlelerini ASLA kopyalama; kendi ifadelerinle, sıfırdan yeniden yaz.
- Kaynakla arka arkaya 10 kelimeden uzun aynı sözcük dizisini kullanma.
- Kaynağın paragraf sırasını ve cümle yapısını taklit etme; kendi kurgunla yaz.
- Doğrudan alıntı gerekiyorsa en fazla bir kısa alıntı yap, tırnak içinde ver ve kime ait olduğunu belirt.
- Kaynak metinde olmayan alıntı söz üretme.
Yanıtını SADECE geçerli bir JSON nesnesi olarak ver.`;

// Yorumun derinliğini kategoriye göre yönlendiren bakış açıları. Yalnızca istem
// metnini besler: JSON şeması ve alan adları değişmez.
const ANALIZ_ACISI = {
  Teknoloji: "fiyat/performans dengesi, rakiplere göre konumlanma, kullanıcının günlük hayatına etkisi",
  "Yapay Zeka": "modelin neleri yapıp neleri yapamadığı, gerçekten işe yarama koşulu, veri/gizlilik maliyeti, hangi işi ortadan kaldırabilir",
  Mobil: "fiyat/performans oranı, batarya ve donanım gereksinimi, yazılım destek süresi, rakiplerle kıyas",
  Oyun: "fiyat, platform, çıkış tarihi, donanım gereksinimi (FPS/RAM/SSD), oynanış ve mod/çevrimdışı değişikliği",
  Donanım: "fiyat/performans, güç tüketimi ve ısınma, dayanıklılık, kimin işine yarayacağı",
  Yazılım: "sürüm ve yayın tarihi, ücretlendirme/lisans koşulu, güvenlik riski, eski sürümleri etkileyen kırılma",
  İnternet: "kullanıcı sayısı ve pazar payı, veri/regülasyon etkisi, yerel karşılığı",
  Bilim: "sonucun büyüklüğü ve kanıt düzeyi, gerçek hayata ne zaman yansır, yanlış anlaşılma riski",
  Ekonomi: "tutarın büyüklüğü, kimin cebine etki ettiği, kısa ve uzun vadeli sonuç",
  Spor: "istatistiksel kıyas, kadro/transfer etkisi, sonucu değiştirebilir mi",
  Gündem: "ölçülen sayı, doğrudan etkilenen kişi sayısı, resmî açıklamanın neyi değiştirdiği",
  Dünya: "Türkiye'ye ve gündelik hayata yansıması, hangi taraf için risk, sıradaki adım",
  Diğer: "habere özgü somut ölçü ve doğrudan etkilenen kesim",
};

const analizAcisi = (kategori) =>
  ANALIZ_ACISI[String(kategori || "").trim()] || ANALIZ_ACISI.Diğer;

function buildPrompt(article, ekNot = "") {
  const cats = config.categories.join(", ");
  const hint = article.feedCategory ? `\nKAYNAK KATEGORİSİ (sadece ipucu): ${article.feedCategory}` : "";
  // Yorumun "kime ne olur / ne değişir" kısmını somutlaştıran kategori bakış açısı.
  const acisi = analizAcisi(article.feedCategory);
  return `KAYNAK: ${article.source}${hint}
BAŞLIK: ${article.title}
METİN: ${article.content}

Aşağıdaki JSON alanlarını TÜRKÇE üret:
- title: 45-70 KARAKTER (boşluklar dahil). ShiftDelete/Webtekno tonunda VURUCU ama DÜRÜST ol. Kaynak başlığını
  kelime kelime KOPYALAMA; "X hakkında bilmeniz gerekenler" gibi kalıbı da kullanma.
  YAPI: [özne: marka/kişi/kurum] + [aktif somut fiil] + [sayı ya da sonuç]. Edilgen ve jenerik kalıplar yerine
  net bir fiil kullan ("duyurdu", "kaldırdı", "zam getirdi", "ücretsiz yaptı", "getirdi"). Başlık tek başına
  okunduğunda "ne oldu" sorusunu cevaplasın; mümkünse "ne DEĞİŞTİRİR / kimi etkiler" cevabını da versin.
  KESİNLİKLE YASAK: SORU cümlesi; "!" ve "?" işareti; "Belli Oldu Mu?", "Ne Kadar Oldu?", "5 İpuçlu",
  "Bunu Bilenler Şaşıracak", "Şok", "İnanılmaz", "Bomba", "Sürpriz", "Flaş", "Son Dakika", "Biliyor muydunuz"
  gibi clickbait/abartı; noktalama yığını; gereksiz uzun başlık.
  Başlıktaki tarih/saat damgasını ("17 Ekim 2026 ...") yalnızca haber o güne özgüyse taşı.
  ÖRNEKLER (YALNIZ cümle YAPISI örneğidir; içlerindeki marka, kişi ve rakamları KENDİ HABERİNE TAŞIMA):
    ✗ "Yapay Zekâ Dünyayı Baştan Yapacak!"
    ✓ "Ticaret Bakanlığı, cep telefonu taksit üstünü 40 bin TL'ye çıkardı"
    ✗ "PlayStation 5 ne zaman çıkacak?"
    ✓ "PlayStation 5 güncellemesi, eski konsollardaki oyunları kapatıyor"
    ✗ "Donanım Fiyatları Uçtu"
    ✓ "DDR5 bellek fiyatları 3 aylık alçaklığın ardından yüzde 12 geriledi"
  Başlığın ve her cümlenin İLK HARFİ BÜYÜK olsun; özel adların yazımını koru, tümü büyük harfle bağırma.
- slug: title için URL dostu kimlik; küçük harf, tire ile, Türkçe karakter ve noktalama YOK.
- summary: Haberin ÖZETİ. 2-3 cümle, toplam 35-55 KELİME (ilk cümle 12-20 kelime olsun). İlk cümle TEK BAŞINA
  haberi anlatsın: okur yalnızca özeti okuyup haberi anlamalı. Sonraki cümleler en kritik ayrıntıyı ve sonucu
  versin. Nötr kal: sadece "ne oldu, kim, nerede, neden önemli" bilgisini ver, yorum katma. title'ın kopyası
  ya da aynı kelimelerle tekrarı OLMASIN; başlıkta geçmeyen somut bir ayrıntıyı (sayı, tarih, ölçü) özetle.
- keyPoints: Haberin en önemli 3 ayrıntısı, kısa madde olarak. Her madde en fazla 14 kelime olsun ve SOMUT
  bilgi içersin (sayı, fiyat, tarih, isim, teknik özellik varsa mutlaka yaz). İLK MADDE, beş ilgi çekicilik
  sinyalinden (yenilik / ölçü / çatışma / merak / somut sonuç) en güçlü olanı olsun; kalanlar önem sırasına
  göre diz.
- body: HABERİN TAM METNİ. 4-6 paragraf, TOPLAM 250-400 KELİME; 180 kelimenin ALTINA İNME. Kaynaktaki bilgileri
  kullanarak haberi genişlet: ayrıntılar, sayılar, teknik özellikler, ilgili gelişmeler, açıklamalar. Kurallar:
  * Her paragraf 3-4 cümle olsun ve ayrı bir dizi öğesi olsun (tek cümlelik ya da çok kısa paragraf yazma).
  * Önceki paragrafta geçmeyen yeni bir somut ayrıntı ekle; aynı bilgiyi uzatıp tekrarlama.
  * İlk paragraf summary'yi KOPYALAMASIN; habere farklı bir girişle başla.
  * UYDURMA YASAK: Kaynakta geçmeyen isim, tarih, sayı, unvan, kurum, söz veya olay yazma. Geçmişe dönük iddialar (şu yıl atandı, şu projeyi yürüttü, şu rakamı açıkladı) kesinlikle uydurma.
  * Kaynakta sayı/ölçü/tarih geçiyorsa gövdede de mutlaka geçsin; kaynakta geçen her olguyu en az bir cümleyle
    işle, cümleleri birbirine bağlayarak akıcı paragraflar kur. Kaynak kısaysa bile gövdeyi 2-3 cümlelik bir
    özet metnine indirme; kaynağın her ayrıntısını daha açık ve daha ayrıntılı anlatarak doldur.
  * Uzatmayı boş cümleyle değil, kaynaktaki ayrıntıyı daha açık anlatarak yap: "dikkat çekiyor", "büyük önem
    taşıyor", "ne denli", "bu gelişme" gibi dolgu yasak. Kaynakta hiç ayrıntı yoksa haberi doğal çıkarımlarla ve
    temkinli ifadelerle anlat; bilgi uydurma yasağı her koşulda geçerlidir.
  * TEK HABER ODAĞI: yalnızca verilen kaynak haberi yaz. Kaynağın içinde geçen başka haberleri/gelişmeleri ayrı
    birer haber gibi anlatma, konuyu dağıtma; onlar bu haberin bağlamı olarak tek bir çizgide kalsın.
  * Yapay zekâ gibi değil, gazete haberi gibi yaz; "bu yazıda", "aşağıda" gibi ifadeler kullanma.
  * TELİF: Kaynak metinden cümle kopyalama, arka arkaya 10 kelimeden uzun aynı diziyi kullanma, kaynağın paragraf sırasını izleme.
- comment: EDİTÖR ANALİZİ ("AI yorumu" olarak gösterilir). summary ve body'nin olgularını TEKRAR ETME; hiçbir
  sayıyı, tarihi veya alıntıyı yeniden yazma. Tek işi YORUM: kendi değerlendirmeni ortaya koy. 3-5 cümle,
  samimi ama profesyonel, gerekirse eleştirel. Şu sırayı izle:
  1) AÇILIŞ: haberin özünü tekrarlamadan TEK CÜMLELİK KESİN BİR YARGI ver (ne yapılması ya da kaçınılması
     gerektiğine dair somut bir hüküm). "Değerli veriler sunuyor", "olumlu bir sinyal veriyor", "önemli bir
     adım", "gözler önüne seriyor" gibi yargısız giriş yapma.
  2) GEREKÇE: yargını KAYNAKTAN GELEN en az BİR SOMUT ÖĞEYE dayandır (sayı, tutar, tarih, sürüm numarası,
     isim, kurum, teknik özellik) ve o öğeyi yorumun gövdesinde açıkça geçir.
  3) ETKİ: "kimi nasıl etkiler" — etkilenen kesimi somutlaştır (oyuncu, telefon kullanıcısı, geliştirici,
     şirket, çalışan, vatandaş); "herkes için önemli" deme.
  4) ÖLÇÜ / KARŞILAŞTIRMA / SENARYO: EN AZ BİR cümle şunlardan BİRİ olsun ve yorumun sonuna yakın bitsin:
       - KARŞILAŞTIRMA: "önceki sürüm / önceki fiyat / rakip modelle kıyaslandığında ..."
       - ÖLÇÜ: "bu rakam şu eşiği geçiyor / geçmiyor"
       - SENARYO: "şu olursa şu sonuç doğar" ya da "bu değişiklik yalnızca şu koşulda işe yarar"
  5) (isteğe bağlı) RİSK / FIRSAT: kimi riskliyor, kimin fırsatı var.
  KATEGORİ BİLİNCİ (bu haberde mutlaka ele al): ${acisi}. Bu bakış açılarından en az birini yorumda KESİN işle.
  SOMUTLUK KURALI: Kaynak metinde sayı, ölçü veya tarih varsa yorum bunlardan EN AZ BİRİNİ kendi cümlende
  kullanmak ZORUNDADIR. Kaynakta OLMAYAN sayı, isim, unvan, söz veya tarih yazma; senaryo kuruyorsan
  "olabilir", "bekleniyor", "olursa" gibi temkinli kur. Genel geçer ahlak dersi, "önemlidir" türü süsleme,
  başlığın tekrarı ya da habere hiç dokunmayan boş genelleme yazma.
- editorNote: MANŞET NOTU (ana sayfadaki "öne çıkanlar" slaytı ve mobil akış için). summary ve comment ile AYNI
  cümleleri ya da cümle parçalarını KESİNLİKLE kullanma; onların kısaltması/özeti de olmasın. 1-2 cümle, en fazla
  ~180 karakter. YAPI: 1 cümle kıvrım (haberin "asıl ilginç yanı" ne) + isteğe bağlı 1 cümle somut uyarı veya
  karşılaştırma. Manşet tonunda; merak uyandıran ama clickbait olmayan, ölçülü, samimi-profesyonel bir not yaz.
  Not yeni bir bilgi, karşılaştırma ya da çıkarım katmalı; abartma ve bilgi uydurma.
  YASAK: notu "Neden bakmalısın/bakmalısınız?" gibi hazır bir soruyla bitirmek; haberin özelliklerini sıralayıp
  bırakmak; boş slogan; "önem taşıyor", "gözler önüne seriyor", "bir kez daha", "yakından takip edilecek",
  "ne denli", "bu gelişme" kalıpları; "şok", "inanılmaz", "bomba" gibi ifadeler.
- tags: 3-6 adet kısa, habere özgü, aranabilir anahtar kelime (marka, ürün, kişi, konu); kategori adını
  ("Gündem") etiket olarak tekrarlama.
- category: AŞAĞIDAKİ listeden TAM OLARAK birini seç (başka bir kelime yazma): ${cats}
  * DİKKAT: Kaynak teknoloji sitesi (ShiftDelete, Webtekno, DonanımHaber vb.) olsa bile KAYNAK KATEGORİSİ'ni
    ezbere kopyalama; haberin GERÇEK KONUSUNA göre seç:
    - Dizi, film, fragman, sinema, konser, tiyatro, kitap → "Kültür"
    - Deprem, belediye, bakanlık, iç siyaset, asayiş, mahkeme, savunma/askeri tedarik → "Gündem"
    - Uluslararası siyaset, savaş, diplomasi, ülke liderleri → "Dünya"
    - Borsa, enflasyon, faiz, vergi, maaş, ihracat rakamları → "Ekonomi"
    - Otomobil, elektrikli araç, SUV, motor, şarj istasyonu → "Otomobil"
    - "Teknoloji" ve "Yapay Zeka" kategorilerini YALNIZCA doğrudan teknoloji, cihaz, yazılım, donanım veya
      yapay zeka modelleriyle ilgili haberlere ver.
- gorselSorgu: Haberle doğrudan ilgili, haber fotoğrafı gibi ÇIKACAK İNGİLİZCE arama sorgusu (2-5 kelime).
  KURAL: somut ve görsel bir şey yaz. Haberde geçen kişi/marka/ürün/yer adı varsa onu kullan
  ("Elon Musk", "iPhone 17", "Togg T10X") ve yanına sahneyi ekle ki fotoğraf dikkat çekici olsun
  ("Elon Musk Tesla factory", "Galatasaray stadium", "iPhone 17 unboxing", "Istanbul metro").
  Kişi/marka yoksa sahneyi yaz ("electric car charging station", "stock market trading floor",
  "football stadium floodlights", "data center server room", "science laboratory"). SOYUT kavram
  YASAK ("innovation", "future", "economy", "success", "crisis"); Türkçe yazma; tırnak, noktalama
  ve açıklama ekleme.
  AFET/HAVA (sel, deprem, fırtına, yangın, kar, kuraklık): olayın ADINI değil, YERDEN ÇEKİLMİŞ
  SAHNEYİ yaz. ("flooded street cars", "storm clouds over city", "earthquake damaged building",
  "wildfire forest fire", "snow covered street cars"). YASAK: uydu/harita görüntüsü çağrıştıran
  sorgular ("satellite view", "aerial map", "MODIS", "from space") ve manzara sorguları
  ("coastline landscape", "sea view") — bunlar afet haberine sakin bir doğa fotoğrafı getirir.
- gorselDetaylar: Haberin satır aralarında (1. ve 3. paragraftan sonra) gösterilecek 2 FARKLI detay fotoğrafı
  için dizi: [{"sorgu":"...","altyazi":"..."},{"sorgu":"...","altyazi":"..."}].
  * KURAL: Kapak sorgusu (gorselSorgu) ile AYNI OLMASIN. Haberin paragraflarında bahsedilen SOMUT ALT DETAYLARI
    hedefle (ör. haber iPhone 18 ise 1. detayda kamera merceği geçiyorsa sorgu: "smartphone camera lens closeup",
    altyazi: "Yeni nesil akıllı telefon kamera merceği ve sensör yapısı"; 2. detayda işlemci/üretim geçiyorsa
    sorgu: "semiconductor microchip wafer", altyazi: "Yarı iletken yonga ve donanım üretim süreci").
  * Her iki "sorgu" alanı da 2-4 kelimelik SOMUT İNGİLİZCE görsel arama terimi, "altyazi" alanı ise fotoğrafın
    altında yazacak kısa ve açıklayıcı TÜRKÇE alt yazı (5-10 kelime) olsun.

YAZMADAN ÖNCE KONTROL ET:
(1) Başlık 45-70 karakterde mi; "!" veya "?" var mı; kaynak başlığıyla aynı cümle mi; tıklanacak kadar vurucu
    ama doğruluğu bozacak bir abartı var mı?
(2) Özet 35-55 kelime mi ve ilk cümlesi tek başına haberi anlatıyor mu; başlığın kopyası mı?
(3) Gövde toplam 250-400 kelime aralığında mı (180'in altına düştü mü)? Her paragraf 3-4 cümle mi?
(4) Gövde kaynaktaki somut ayrıntılara dayanıyor mu, yoksa boş mu şişirildi?
(5) Yorum GERÇEK ANALİZ mi: kesin bir yargı + kaynaktan en az bir somut öğe + kime etki + en az bir
    karşılaştırma, ölçü ya da senaryo. Kopya veya dolgu cümle varsa yeniden yaz.
(6) comment ve editorNote içinde yasaklı kalıplardan ("önem taşıyor", "gözler önüne", "bir kez daha", "ne denli",
    "bu gelişme", "yakından takip") biri geçiyor mu?
(7) Hiçbir alanda kaynakta olmayan isim, sayı, tarih ya da alıntı uyduruldu mu? (Telif: 10 kelimelik dizi?)
(8) Hiçbir dizi alanı boş kaldı mı; Türkçe yazım hatası var mı?
(9) gorselSorgu İngilizce, 2-5 kelime ve somut mu; soyut bir kavram mı yazdın; afet/hava haberiysen
    olayın adı yerine yerden çekilmiş sahneyi yazdın mı (uydu/map/manzara sorgusu yasak)?

Yanıt formatı (sadece JSON):
{"title":"...","slug":"...","summary":"...","keyPoints":["...","...","..."],"body":["paragraf 1","paragraf 2","paragraf 3"],"comment":"...","editorNote":"...","tags":["..."],"category":"...","gorselSorgu":"..."}${ekNot ? `\n\n${ekNot}` : ""}`;
}

// Bu çalıştırmada tükenen (günlük kota) adaylar
const exhausted = new Set();
const keyOf = (c) => `${c.provider}:${c.model}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function candidates() {
  const list = [];
  if (process.env.GROQ_API_KEY) {
    for (const model of config.ai.groqModels) {
      list.push({ provider: "groq", model, apiKey: process.env.GROQ_API_KEY });
    }
  }
  if (process.env.GEMINI_API_KEY) {
    for (const model of config.ai.geminiModels) {
      list.push({ provider: "gemini", model, apiKey: process.env.GEMINI_API_KEY });
    }
  }
  list.push({ provider: "pollinations", model: "openai", apiKey: "free" });
  return list;
}

function allExhaustedError(lastErr) {
  const e = new Error(
    `Tüm AI adayları bu çalıştırmada tükendi/başarısız: ${lastErr?.message || "bilinmeyen"}`
  );
  e.allExhausted = true;
  return e;
}

// Üretilen içerikte eksik kalan alanlar. Telif filtresi bir cümleyi sildiğinde
// alan tamamen boş kalabilir; o durumda yeniden üretim istenir.
function eksikAlanlar(ai) {
  const eksik = [];
  if (String(ai.summary || "").trim().length < 40) eksik.push("summary");
  if (String(ai.comment || "").trim().length < 40) eksik.push("comment");
  if (String(ai.editorNote || "").trim().length < 10) eksik.push("editorNote");
  if (!(ai.body || []).filter(Boolean).length) eksik.push("body");
  if (!(ai.keyPoints || []).filter(Boolean).length) eksik.push("keyPoints");
  return eksik;
}

const EK_ISTEM = `EK İSTEK (önceki denemede bazı alanlar boş kaldı): Tüm alanları eksiksiz doldur.
Özellikle comment ve editorNote alanlarında kaynağın cümle kuruluşunu değil kendi cümlelerini kullan;
kaynakla arka arkaya 10 kelimeden uzun aynı sözcük dizisini ASLA kullanma, kaynaktan cümle kopyalama.
Yorum kesin bir yargıyla açılsın, kaynaktaki en az bir somut öğeyi (sayı, tarih, isim) kullansın ve en az bir
karşılaştırma, ölçü ya da senaryo içersin; "önem taşıyor", "bir kez daha", "ne denli" gibi kalıpları kullanma.
Her alanı kısa ve tam cümlelerle yaz; hiçbir alanı boş bırakma.`;

export async function analyzeArticle(article) {
  const all = candidates();
  if (!all.length) throw new Error("Hiç API anahtarı yok (GEMINI_API_KEY / GROQ_API_KEY)");

  const available = all.filter((c) => !exhausted.has(keyOf(c)));
  if (!available.length) throw allExhaustedError();

  // TELİF GÜVENCESİ BURADA UYGULANIR: kaynakla birebir örtüşen cümleler
  // ayıklanınca bir alan (özellikle comment/editorNote) tamamen boşalabiliyor.
  // Bu yüzden temizlik sonrası alanlar denetlenir ve gerekirse bir kez daha
  // üretim istenir (aşağıdaki EK_ISTEM ile).
  const kaynak = String(article?.content || "");
  const temizle = (ai) => (kaynak.length >= 200 ? purgeCopiedText(ai, kaynak).cleaned : ai);

  let lastErr;
  let enIyi = null;
  let enIyiEksik = Number.POSITIVE_INFINITY;
  let calisanAday = null;

  for (const c of available) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ai = temizle(await callProvider(c, article));
        calisanAday = c;
        const eksik = eksikAlanlar(ai);
        if (eksik.length < enIyiEksik) {
          enIyi = ai;
          enIyiEksik = eksik.length;
        }
        if (!eksik.length) return ai;
        console.warn(`    (eksik alan: ${eksik.join(", ")})`);
        break; // üretim başarılı ama alan eksik; sıradaki adaya geç
      } catch (err) {
        lastErr = err;

        // Günlük kota / model yok -> bu adayı bırak, sıradakine geç
        if (err.kind === "quota" || err.kind === "missing") {
          exhausted.add(keyOf(c));
          console.warn(`    (${c.provider}/${c.model}: ${err.kind} -> sıradaki)`);
          break;
        }

        // Dakikalık limit -> bekle ve AYNI adayı tekrar dene
        if (err.kind === "ratelimit") {
          const wait = Math.min(Math.max(err.wait || 20, 5), 70);
          console.warn(`    (${c.provider}/${c.model}: dakikasal limit, ${wait}s bekleniyor)`);
          await sleep(wait * 1000);
          continue;
        }

        // Geçici sunucu hatası -> kısa bekle, tekrar dene
        if (err.kind === "transient") {
          await sleep(3000);
          continue;
        }

        throw err;
      }
    }
  }

  // Alanlar hâlâ eksikse tek bir ek deneme: daha özgün anlatım isteğiyle.
  const tekrarAday =
    calisanAday && !exhausted.has(keyOf(calisanAday))
      ? calisanAday
      : available.find((c) => !exhausted.has(keyOf(c)));
  if (enIyiEksik > 0 && tekrarAday) {
    try {
      const ai = temizle(await callProvider(tekrarAday, article, EK_ISTEM));
      const eksik = eksikAlanlar(ai);
      if (eksik.length < enIyiEksik) {
        enIyi = ai;
        enIyiEksik = eksik.length;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (enIyi) return enIyi;
  throw allExhaustedError(lastErr);
}

/**
 * Arşivdeki ESKİ haberler için yalnızca görsel arama sorgusu üretir.
 * Tam haber üretiminden çok daha küçük bir istek: kotayı az tüketir.
 * Dönüş: İngilizce sorgu (2-5 kelime) veya "" (üretilemedi).
 */
export async function gorselSorgusu(article) {
  const istem = `Aşağıdaki Türkçe haber için Wikimedia Commons'ta fotoğraf aranacak İNGİLİZCE bir sorgu üret.

BAŞLIK: ${article.title}
ÖZET: ${String(article.summary || "").slice(0, 400)}
ETİKETLER: ${(article.tags || []).join(", ")}
KATEGORİ: ${article.category || ""}

KURALLAR:
- 2-5 kelime; somut ve fotoğrafta GÖRÜNEBİLECEK bir şey yaz.
- Marka/ürün/kişi/yer adı varsa onu kullan ("iPhone 17", "Togg T10X", "Elon Musk", "Galatasaray stadium").
- Soyut kavram YASAK ("innovation", "future", "economy"). Türkçe yazma. Noktalama kullanma.
Yanıt SADECE şu JSON olsun: {"gorselSorgu":"..."}`;

  const all = candidates().filter((c) => !exhausted.has(keyOf(c)));
  if (!all.length) throw allExhaustedError();

  let lastErr;
  for (const c of all) {
    try {
      const metin =
        c.provider === "groq" ? await kisaMetinGroq(c, istem) : await kisaMetinGemini(c, istem);
      return temizSorgu(parseJson(metin)?.gorselSorgu);
    } catch (err) {
      lastErr = err;
      if (err.kind === "quota" || err.kind === "missing") {
        exhausted.add(keyOf(c));
        continue;
      }
      if (err.kind === "ratelimit") {
        await sleep(Math.min(Math.max(err.wait || 20, 5), 70) * 1000);
        continue;
      }
      if (err.kind === "transient") {
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
  throw allExhaustedError(lastErr);
}

async function kisaMetinGemini(c, istem) {
  const res = await safeFetch(`${GEMINI_ENDPOINT(c.model)}?key=${c.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: istem }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 120,
        ...(/gemma/i.test(c.model) ? {} : { responseMimeType: "application/json" }),
      },
    }),
  });
  if (!res.ok) throw classify(res.status, await res.text(), res.headers, "Gemini");
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function kisaMetinGroq(c, istem) {
  const res = await safeFetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify({
      model: c.model,
      temperature: 0.4,
      max_tokens: 200,
      ...(/gpt-oss/i.test(c.model) ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: istem }],
    }),
  });
  if (!res.ok) throw classify(res.status, await res.text(), res.headers, "Groq");
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || "";
}

async function callProvider(c, article, ekNot = "") {
  return c.provider === "pollinations" ? pollinationsCall(c, article, ekNot) : c.provider === "groq" ? groqCall(c, article, ekNot) : geminiCall(c, article, ekNot);
}
async function pollinationsCall(c, article, ekNot = "") {
  const cats = config.categories.join(", ");
  const prompt = `Bu haberi kendi cümlelerinle Türkçe JSON olarak yeniden yaz. Alanlar: title (45-70 karakter vurucu başlık), slug, summary (2-3 cümle özet), keyPoints (3 somut madde dizisi), body (4 dolu paragraf dizisi, toplam ~250 kelime), comment (3-4 cümle özgün editör analizi ve etkisi), editorNote (1-2 cümle manşet notu, <=175 karakter), tags (4 Türkçe etiket dizisi), category (${cats} içinden biri), gorselSorgu (2-4 kelimelik İngilizce görsel sorgusu).\nKAYNAK: ${article.source} (${article.feedCategory || ""})\nBAŞLIK: ${article.title}\nMETİN: ${String(article.content || "").slice(0, 2600)}`;
  const res = await safeFetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: c.model || "openai", reasoning_effort: "low", temperature: 0.75, messages: [{ role: "system", content: "Deneyimli bir Türk teknoloji ve haber editörüsün. Kaynak cümlelerini kopyalamadan özgün Türkçe haber üret. Yanıtını SADECE geçerli JSON nesnesi olarak ver." }, { role: "user", content: prompt }] }) });
  if (!res.ok) throw classify(res.status, await res.text(), res.headers, "Pollinations");
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) { const e = new Error("Pollinations boş yanıt döndü"); e.kind = "transient"; throw e; }
  return normalize(parseJson(text), article);
}

// --------------------------- Gemini ---------------------------
async function geminiCall(c, article, ekNot = "") {
  const res = await safeFetch(`${GEMINI_ENDPOINT(c.model)}?key=${c.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(/gemma/i.test(c.model) ? {} : { systemInstruction: { parts: [{ text: SYSTEM }] } }),
      contents: [{ parts: [{ text: /gemma/i.test(c.model) ? `${SYSTEM}\n\n${buildPrompt(article, ekNot)}` : buildPrompt(article, ekNot) }] }],
      generationConfig: {
        temperature: 0.85,
        // İstem gövdeyi 250-400 kelimeye çıkardığı için 3000 jeton dar kalıyordu:
        // Türkçe ~2-3 jeton/kelime olduğundan yanıt kesilip JSON geçersizleşebiliyordu.
        maxOutputTokens: 4096,
        ...(/gemma/i.test(c.model) ? {} : { responseMimeType: "application/json" }),
        ...(/gemma/i.test(c.model) ? {} : { responseSchema: SCHEMA }),
      },
    }),
  });

  if (!res.ok) throw classify(res.status, await res.text(), res.headers, "Gemini");
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini boş yanıt döndü");
  return normalize(parseJson(text), article);
}

// --------------------------- Groq ---------------------------
async function groqCall(c, article, ekNot = "") {
  const res = await safeFetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.apiKey}`,
    },
    body: JSON.stringify({
      model: c.model,
      temperature: 0.85,
      max_tokens: 4000,
      // gpt-oss bir akıl yürütme modeli: kısa tutmazsak token bütçesini "düşünmeye"
      // harcayıp JSON'u tamamlayamıyor (json_validate_failed hatası).
      ...(/gpt-oss/i.test(c.model) ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildPrompt(article, ekNot) },
      ],
    }),
  });

  if (!res.ok) throw classify(res.status, await res.text(), res.headers, "Groq");
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq boş yanıt döndü");
  return normalize(parseJson(text), article);
}

// --------------------------- Yardımcılar ---------------------------
async function safeFetch(url, options) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  } catch (err) {
    const e = new Error(`Ağ hatası: ${err.message}`);
    e.kind = "transient";
    throw e;
  }
}

/** HTTP hatasını sınıflar: quota | ratelimit | missing | transient | other */
function classify(status, body, headers, provider) {
  const snippet = String(body).slice(0, 2500);
  const lower = snippet.toLowerCase();
  const err = new Error(`${provider} HTTP ${status}: ${snippet.slice(0, 1200)}`);

  let wait = 0;
  const retryAfter = headers?.get?.("retry-after");
  if (retryAfter && !isNaN(Number(retryAfter))) wait = Number(retryAfter);
  if (!wait) {
    const rd = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(snippet);
    if (rd) wait = Number(rd[1]);
  }
  if (!wait) wait = parseHumanDelay(snippet);
  err.wait = wait;

  if (status === 402 && lower.includes("free_limit")) {
    err.kind = "ratelimit";
    err.wait = Math.max(wait || 31, 16);
  } else if (status === 429 || lower.includes("quota") || lower.includes("resource_exhausted")) {
    // Günlük kota mı yoksa dakikalık limit mi?
    const daily = /per day/i.test(snippet) || wait > 120;
    err.kind = daily ? "quota" : "ratelimit";
  } else if (status === 404 || (status === 400 && lower.includes("model"))) {
    err.kind = "missing";
  } else if (status >= 500 || status === 408) {
    err.kind = "transient";
  } else {
    err.kind = "other";
  }
  return err;
}

/** "retry in 7h44m24.9s" veya "Please retry in 20s" -> saniye */
function parseHumanDelay(text) {
  const m = /retry (?:in|after)\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(text);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI yanıtı JSON olarak çözümlenemedi");
  }
}

// Manşet notu sözleşmesi: 1-2 cümle, en fazla ~180 karakter. Şemaya uymayan
// çıktı (eksik, kopya, aşırı uzun) kırpılır ya da boş bırakılır; boş kalanlar
// arşiv yenileme (backfill) turunda yeniden üretilir.
const EDITOR_NOTE_MAX = 180;

function cleanEditorNote(value, ...others) {
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const text = clean(value);
  if (text.length < 10 || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(text)) return "";

  // summary/comment ile birebir aynı çıktı işe yaramaz; at.
  const norm = (s) => clean(s).toLocaleLowerCase("tr");
  const mine = norm(text);
  if (others.some((o) => norm(o) && norm(o) === mine)) return "";

  if (text.length <= EDITOR_NOTE_MAX) return text;
  const head = text.slice(0, EDITOR_NOTE_MAX).replace(/\s+\S*$/, "").trimEnd();
  return `${(head || text.slice(0, EDITOR_NOTE_MAX)).slice(0, EDITOR_NOTE_MAX - 1)}…`;
}

/** Görsel arama sorgusu: tırnak/noktalama atılır, boşsa etiketten türetilir. */
function temizSorgu(value, yedek) {
  const s = String(value || "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (s.length >= 2) return s;
  const t = String(yedek || "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim();
  return t.slice(0, 60);
}

function normalize(data, article) {
  return {
    title: String(data.title || article.title).trim().slice(0, 120),
    slug: slugify(data.slug || data.title || article.title),
    summary: String(data.summary || "").trim(),
    keyPoints: Array.isArray(data.keyPoints)
      ? data.keyPoints.map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
      : [],
    body: (Array.isArray(data.body) ? data.body : String(data.body || "").split(/\n{2,}/))
      .map((t) => String(t).trim())
      .filter((t) => t.length > 40)
      .slice(0, 8),
    comment: String(data.comment || "").trim(),
    editorNote: cleanEditorNote(data.editorNote, data.summary, data.comment),
    tags: Array.isArray(data.tags)
      ? data.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
      : [],
    category: canonicalCategory(data.category, article.feedCategory, data.title || article.title, data.summary || article.content),
    // Telif güvenli stok görsel araması için (bkz. src/stok-gorsel.js).
    gorselSorgu: temizSorgu(data.gorselSorgu, Array.isArray(data.tags) ? data.tags[0] : ""),
    gorselDetaylar: Array.isArray(data.gorselDetaylar)
      ? data.gorselDetaylar
          .map((d) => ({
            sorgu: temizSorgu(d?.sorgu, ""),
            altyazi: String(d?.altyazi || "").replace(/\s+/g, " ").trim().slice(0, 110),
          }))
          .filter((d) => d.sorgu.length >= 3)
          .slice(0, 2)
      : [],
  };
}

export function canonicalCategory(value, hint, title = "", summary = "") {
  const norm = (s) => String(s || "").toLocaleLowerCase("tr").trim();
  const target = norm(value);
  let secilen = "";
  if (target) {
    const exact = config.categories.find((c) => norm(c) === target);
    if (exact) secilen = exact;
    else {
      const partial = config.categories.find(
        (c) => target.length > 2 && (target.includes(norm(c)) || norm(c).includes(target))
      );
      if (partial) secilen = partial;
    }
  }
  if (!secilen) {
    secilen = config.categories.includes(hint) ? hint : "Diğer";
  }

  // Teknoloji/Yapay Zeka sitelerinden gelen ama konusu teknoloji olmayan haberleri gerçek kategorisine taşı
  const sade = (s) =>
    String(s || "")
      .replace(/[İIı]/g, "i")
      .replace(/[Şş]/g, "s")
      .replace(/[Ğğ]/g, "g")
      .replace(/[Üü]/g, "u")
      .replace(/[Öö]/g, "o")
      .replace(/[Çç]/g, "c")
      .replace(/[ÂâÎîÛû]/g, (m) => ({ â: "a", Â: "a", î: "i", Î: "i", û: "u", U: "u" }[m] || "a"))
      .toLowerCase();
  const metin = sade(`${title} ${summary}`);
  if (secilen === "Teknoloji" || secilen === "Yapay Zeka") {
    const tekSinyal =
      /(yapay zeka|\bai\b|chatgpt|claude|gemini|\bllm\b|openai|anthropic|deepseek|mistral|hugging\s*face|sohbet modeli|dil modeli|iphone|samsung|galaxy|android|\bios\b|windows|linux|macbook|apple|google|microsoft|\bmeta\b|nvidia|\bamd\b|intel|islemci|ekran karti|\bgpu\b|\bcpu\b|\bram\b|\bssd\b|anakart|uygulama|yazilim|siber|hacker|veri sizintisi|veri merkezi|sunucu|bulut|robot|kuantum|\b5g\b|\b6g\b|wi-?fi|akilli telefon|batarya|kamera|sensor|starlink|starshield)/.test(
        metin
      );
    if (!tekSinyal) {
      if (/\b(fragman|sezon|dizisi|sinema|gise|yuzuklerin efendisi|konser|festival|tiyatro)\b/.test(metin)) {
        return "Kültür";
      }
      if (/\b(super lig|galatasaray|fenerbahce|besiktas|trabzonspor|sampiyonlar ligi|teknik direktor|bonservis|mac sonu|golcu)\b/.test(metin)) {
        return "Spor";
      }
      if (/\b(deprem|afad|kandilli|osb baskani|belediye baskani|icisle|tbmm|meclis uyesi|valilik|emniyet|gozalti|tutuklama|savcilik|eurofighter|savas ucagi|zirhli arac|paletli|fnss|bedir mutabakati|ortak savunma)\b/.test(metin)) {
        return "Gündem";
      }
      if (/\b(ateskes|zelenskiy|putin|netanyahu|gazze|orta dogu|diplomasi|birlesmis milletler|nato zirvesi)\b/.test(metin)) {
        return "Dünya";
      }
      if (/\b(enflasyon|merkez bankasi|faiz karari|asgari ucret|emekli maasi|borsa istanbul|\bbist\b)\b/.test(metin)) {
        return "Ekonomi";
      }
    }
  }
  return secilen;
}

export function slugify(str) {
  const map = {
    ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u",
  };
  return String(str)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
