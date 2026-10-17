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
  ],
};

const SYSTEM = `Sen deneyimli bir Türk teknoloji ve genel haber editörüsün.
Sana bir kaynak haberin başlığı ve metni verilecek. Okuyucuya kendi sözlerinle, akıcı ve
doyurucu bir Türkçe haber metni yazacaksın. Tarafsız ol, abartma, bilgi uydurma.
Her alanın işi farklıdır:
- "summary": kısa ve net özet (sadece "ne oldu").
- "body": haberin TAM METNİ; kaynaktaki bilgileri genişleterek anlatan, birkaç paragraflık dolu bir haber.
- "comment": özetten ve gövdeden TAMAMEN FARKLI, yalnızca yorum/analiz (neden önemli, kimi etkiler, ne olabilir).
- "editorNote": ana sayfadaki "öne çıkanlar" slaytı için kısa MANŞET NOTU; summary ve comment'ten FARKLI, 1-2 cümle
  (en fazla ~180 karakter), merak uyandıran ama abartısız ve clickbait olmayan bir not.

TÜRKÇE YAZIM VE DİLGİN:
- Her kelimen gerçek bir Türkçe sözcük olsun. Uydurma ya da bozuk sözcük yazma ("küirli" gibi), cümleyi yarım
  bırakma, ek dizilimini ve boşlukları bozma ("içinnet" gibi). Cümleyi vermeden önce bir kez sessizce oku.
- Sayı, tarih, ölçü ve para birimini kaynaktaki değerle aktar; gerekiyorsa ayır (21 °C, 1.213 km, 3,5).
- Bir alan için elinde bilgi yoksa alanı boş bırakma; kaynaktaki en alakalı bilgiyle doldur. Hiçbir dizi alanı
  (keyPoints, body, tags) boş kalmasın.

KALIP YASAĞI (comment, editorNote ve body'de TEKRAR BOZUKLUK YARATAN boş kalıplar):
- Şu ifadeleri kullanma: "önem taşıyor", "gözler önüne seriyor/serdi", "gündeme getirdi/taşıdı", "bir kez daha",
  "bu gelişme", "bu tablo", "dikkat çekiyor", "kilit bir eşik", "kayda değer", "ufku açıyor", "önemli bir adım",
  "kritik bir dönüm noktası", "yakından takip edilecek".
- Yorum ve manşet notunu "Bu tür ... olaylar/uluslararası ...", "Her dönem tartışma konusu olmuştur" gibi
  kalıplarla açma; açılış cümlen bu haberin kendi kişisine göre yazılsın.

TELİF KURALLARI (kesin ve bağlayıcı):
- Kaynağın cümlelerini ASLA kopyalama; kendi ifadelerinle, sıfırdan yeniden yaz.
- Kaynakla arka arkaya 10 kelimeden uzun aynı sözcük dizisini kullanma.
- Kaynağın paragraf sırasını ve cümle yapısını taklit etme; kendi kurgunla yaz.
- Doğrudan alıntı gerekiyorsa en fazla bir kısa alıntı yap, tırnak içinde ver ve kime ait olduğunu belirt.
- Kaynak metinde olmayan alıntı söz üretme.
Yanıtını SADECE geçerli bir JSON nesnesi olarak ver.`;

function buildPrompt(article, ekNot = "") {
  const cats = config.categories.join(", ");
  const hint = article.feedCategory ? `\nKAYNAK KATEGORİSİ (sadece ipucu): ${article.feedCategory}` : "";
  return `KAYNAK: ${article.source}${hint}
BAŞLIK: ${article.title}
METİN: ${article.content}

Aşağıdaki JSON alanlarını TÜRKÇE üret:
- title: Kaynak başlığını KOPYALAMA; ne kelime kelime ne de "X hakkında bilmeniz gerekenler" gibi kalıp olarak
  yeniden kullanma. Haberi bir cümleyle özetleyen olumlu bir başlık yaz; SORU cümlesi ve "Belli Oldu Mu?",
  "Ne Kadar Oldu?" gibi tıklanma tuzağı YAZMA. Başlıktaki tarih/saat damgasını ("17 Ekim 2026 ...") ancak haber
  o güne özgüyse taşı. İdeal uzunluk 45-70 karakter. Clickbait, abartı ve gereksiz "!" kullanma.
  VURUCULUK: en çarpıcı somut ayrıntıyı öne al (marka, kişi, karar, sayı, özellik adı); edilgen ve jenerik
  kalıplar yerine aktif, net bir fiil kullan ("duyurdu", "kaldırıldı", "zam geldi", "ücretsiz oldu").
  Başlığı okuyan ne olduğunu anlasın; merak uyandır ama içeriği abartıp yanıltma.
  Başlığın ve her cümlenin İLK HARFİ BÜYÜK olsun; özel adların yazımını koru, tümü büyük harfle bağırma.
- slug: title için URL dostu kimlik; küçük harf, tire ile, Türkçe karakter ve noktalama YOK.
- summary: Haberin ÖZETİ. 2-3 cümle (yaklaşık 35-55 kelime). İlk cümle TEK BAŞINA haberi anlatsın: okur yalnızca
  özeti okuyup haberi anlamalı. Sonraki cümleler en kritik ayrıntıyı ve sonucu versin. Nötr kal: sadece "ne oldu,
  kim, nerede, neden önemli" bilgisini ver, yorum katma. title'ın kopyası veya tekrarı OLMASIN.
- keyPoints: Haberin en önemli 3 ayrıntısı, kısa madde olarak. Her madde en fazla 14 kelime olsun ve SOMUT bilgi içersin (sayı, fiyat, tarih, isim, teknik özellik varsa mutlaka yaz).
- body: HABERİN TAM METNİ. 4-6 paragraf, toplam 350-550 kelime. Kaynaktaki bilgileri kullanarak haberi genişlet: ayrıntılar, sayılar, teknik özellikler, ilgili gelişmeler, açıklamalar. Kurallar:
  * Her paragraf 2-4 cümle olsun ve ayrı bir dizi öğesi olsun.
  * Önceki paragrafta geçmeyen yeni bir somut ayrıntı ekle; aynı bilgiyi uzatıp tekrarlama.
  * İlk paragraf summary'yi KOPYALAMASIN; habere farklı bir girişle başla.
  * UYDURMA YASAK: Kaynakta geçmeyen isim, tarih, sayı, unvan, kurum, söz veya olay yazma. Geçmişe dönük iddialar (şu yıl atandı, şu projeyi yürüttü, şu rakamı açıkladı) kesinlikle uydurma.
  * Emin olmadığın ayrıntıyı eklemek yerine, kaynaktaki bilgiyi daha ayrıntılı ve akıcı biçimde anlat. Doğal çıkarımları "olabilir / bekleniyor" gibi temkinli ifadelerle ver.
  * Kaynak kısaysa da gövdeyi 2-3 cümlelik bir özet metnine indirme; kaynakta geçen her olguyu en az bir cümleyle
    işle, cümleleri birbirine bağlayarak akıcı paragraflar kur. Toplamda 180 kelimenin ALTINA İNME (hedef
    250-400 kelime); paragraf sayısı gerektiğinde 3'e düşebilir.
  * Uzatmayı boş cümleyle değil, kaynaktaki ayrıntıyı daha açık anlatarak yap: "dikkat çekiyor", "büyük önem
    taşıyor" gibi dolgu yasak. Kaynakta hiç ayrıntı yoksa haberi doğal çıkarımlarla ve temkinli ifadelerle anlat;
    bilgi uydurma yasağı her koşulda geçerlidir.
  * TEK HABER ODAĞI: yalnızca verilen kaynak haberi yaz. Kaynağın içinde geçen başka haberleri/gelişmeleri ayrı
    birer haber gibi anlatma, konuyu dağıtma; onlar bu haberin bağlamı olarak tek bir çizgide kalsın.
  * Yapay zekâ gibi değil, gazete haberi gibi yaz; "bu yazıda", "aşağıda" gibi ifadeler kullanma.
  * TELİF: Kaynak metinden cümle kopyalama, arka arkaya 10 kelimeden uzun aynı diziyi kullanma, kaynağın paragraf sırasını izleme.
- comment: EDİTÖR YORUMU. summary ve body'nin TEKRARI KESİNLİKLE OLMAYACAK: hiçbir bilgiyi yeniden anlatma. Doğrudan yorumla başla. Şu sorulara cevap ver: Bu neden önemli? Kimi nasıl etkiler? Bundan sonrası için ne beklenebilir, neye dikkat edilmeli? 3-5 cümle; samimi ama profesyonel, gerekirse eleştirel.
  SOMUTLUK ZORUNLU: Yorumun en az bir cümlesi bu habere özgü bir kırıntıya dayanmalı — kaynaktan gelen sayı, tutar,
  tarih, isim, kurum ya da teknik ayrıntı gibi SOMUT bir öğe. Yorumda genel bir ahlak dersi, "önemlidir" türü
  süsleme, başlığın tekrarı ya da habere hiç dokunmayan boş genellemeler yazma; o somut öğeden yola çık.
- editorNote: MANŞET NOTU (ana sayfadaki "öne çıkanlar" slaytı için). summary ve comment ile AYNI cümleleri ya da cümle parçalarını KESİNLİKLE kullanma; onların kısaltması/özeti de olmasın. 1-2 cümle, en fazla ~180 karakter. Manşet tonunda; merak uyandıran ama clickbait olmayan, ölçülü, samimi-profesyonel bir not yaz. Habere yeni bir açı ya da çıkarım kat: "neden bakmalısın", "asıl önemli olan ne"? YASAK: notu "Neden bakmalısın/bakmalısınız?" gibi hazır bir soruyla bitirmek; haberin özelliklerini sıralayıp bırakmak; boş slogan. Not yeni bir bilgi, karşılaştırma ya da çıkarım katmalı. Abartma ve bilgi uydurma; "şok", "inanılmaz", "bomba" gibi ifadeler kullanma.
- tags: 3-6 adet kısa, habere özgü anahtar kelime; kategori adını ("Gündem") etiket olarak tekrarlama.
- category: AŞAĞIDAKİ listeden TAM OLARAK birini seç (başka bir kelime yazma): ${cats}

YAZMADAN ÖNCE KONTROL ET: (1) summary title'ın kopyası mı? (2) Yorumda ve manşet notunda yasaklı kalıplardan biri mi var? (3) Gövde kaynaktaki somut ayrıntılara dayanıyor mu, yoksa boş mu şişirildi? (4) Hiçbir dizi alanı boş kaldı mı? (5) Türkçe yazım hatası var mı? (6) Özetin ilk cümlesi tek başına haberi anlatıyor mu, başlık listede tıklanacak kadar vurucu mu?

Yanıt formatı (sadece JSON):
{"title":"...","slug":"...","summary":"...","keyPoints":["...","...","..."],"body":["paragraf 1","paragraf 2","paragraf 3"],"comment":"...","editorNote":"...","tags":["..."],"category":"..."}${ekNot ? `\n\n${ekNot}` : ""}`;
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

async function callProvider(c, article, ekNot = "") {
  return c.provider === "groq" ? groqCall(c, article, ekNot) : geminiCall(c, article, ekNot);
}

// --------------------------- Gemini ---------------------------
async function geminiCall(c, article, ekNot = "") {
  const res = await safeFetch(`${GEMINI_ENDPOINT(c.model)}?key=${c.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ parts: [{ text: buildPrompt(article, ekNot) }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 3000,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
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
      max_tokens: 5000,
      // gpt-oss bir akıl yürütme modeli: kısa tutmazsak token bütçesini "düşünmeye"
      // harcayıp JSON'u tamamlayamıyor (json_validate_failed hatası).
      reasoning_effort: "low",
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

  if (status === 429 || lower.includes("quota") || lower.includes("resource_exhausted")) {
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
  const m = /retry in\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(text);
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
    category: canonicalCategory(data.category, article.feedCategory),
  };
}

function canonicalCategory(value, hint) {
  const norm = (s) => String(s || "").toLocaleLowerCase("tr").trim();
  const target = norm(value);
  if (!target) return config.categories.includes(hint) ? hint : "Diğer";

  const exact = config.categories.find((c) => norm(c) === target);
  if (exact) return exact;

  const partial = config.categories.find(
    (c) => target.length > 2 && (target.includes(norm(c)) || norm(c).includes(target))
  );
  if (partial) return partial;

  return config.categories.includes(hint) ? hint : "Diğer";
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
