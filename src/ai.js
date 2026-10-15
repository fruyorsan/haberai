import { config } from "./config.js";

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

TELİF KURALLARI (kesin ve bağlayıcı):
- Kaynağın cümlelerini ASLA kopyalama; kendi ifadelerinle, sıfırdan yeniden yaz.
- Kaynakla arka arkaya 10 kelimeden uzun aynı sözcük dizisini kullanma.
- Kaynağın paragraf sırasını ve cümle yapısını taklit etme; kendi kurgunla yaz.
- Doğrudan alıntı gerekiyorsa en fazla bir kısa alıntı yap, tırnak içinde ver ve kime ait olduğunu belirt.
- Kaynak metinde olmayan alıntı söz üretme.
Yanıtını SADECE geçerli bir JSON nesnesi olarak ver.`;

function buildPrompt(article) {
  const cats = config.categories.join(", ");
  const hint = article.feedCategory ? `\nKAYNAK KATEGORİSİ (sadece ipucu): ${article.feedCategory}` : "";
  return `KAYNAK: ${article.source}${hint}
BAŞLIK: ${article.title}
METİN: ${article.content}

Aşağıdaki JSON alanlarını TÜRKÇE üret:
- title: Kaynak başlığı KOPYALAMA. Haberi anlatan, özgün ve net bir başlık yaz. İdeal uzunluk 45-70 karakter. Clickbait, abartı ve gereksiz "!" kullanma.
- slug: title için URL dostu kimlik; küçük harf, tire ile, Türkçe karakter ve noktalama YOK.
- summary: Haberin ÖZETİ. 3-4 cümle (yaklaşık 50-70 kelime); KISA ve NET ama doyurucu. Nötr kal: sadece "ne oldu, kim, nerede, neden önemli" bilgisini ver, yorum katma.
- keyPoints: Haberin en önemli 3 ayrıntısı, kısa madde olarak. Her madde en fazla 14 kelime olsun ve SOMUT bilgi içersin (sayı, fiyat, tarih, isim, teknik özellik varsa mutlaka yaz).
- body: HABERİN TAM METNİ. 4-6 paragraf, toplam 350-550 kelime. Kaynaktaki bilgileri kullanarak haberi genişlet: ayrıntılar, sayılar, teknik özellikler, ilgili gelişmeler, açıklamalar. Kurallar:
  * Her paragraf 2-4 cümle olsun ve ayrı bir dizi öğesi olsun.
  * İlk paragraf summary'yi KOPYALAMASIN; habere farklı bir girişle başla.
  * UYDURMA YASAK: Kaynakta geçmeyen isim, tarih, sayı, unvan, kurum, söz veya olay yazma. Geçmişe dönük iddialar (şu yıl atandı, şu projeyi yürüttü, şu rakamı açıkladı) kesinlikle uydurma.
  * Emin olmadığın ayrıntıyı eklemek yerine, kaynaktaki bilgiyi daha ayrıntılı ve akıcı biçimde anlat. Doğal çıkarımları "olabilir / bekleniyor" gibi temkinli ifadelerle ver.
  * Kaynak çok kısaysa gövdeyi kısa tut (3 paragraf); doldurmak için bilgi ekleme.
  * Yapay zekâ gibi değil, gazete haberi gibi yaz; "bu yazıda", "aşağıda" gibi ifadeler kullanma.
  * TELİF: Kaynak metinden cümle kopyalama, arka arkaya 10 kelimeden uzun aynı diziyi kullanma, kaynağın paragraf sırasını izleme.
- comment: EDİTÖR YORUMU. summary ve body'nin TEKRARI KESİNLİKLE OLMAYACAK: hiçbir bilgiyi yeniden anlatma. Doğrudan yorumla başla. Şu sorulara cevap ver: Bu neden önemli? Kimi nasıl etkiler? Bundan sonrası için ne beklenebilir, neye dikkat edilmeli? 3-5 cümle; samimi ama profesyonel, gerekirse eleştirel.
- editorNote: MANŞET NOTU (ana sayfadaki "öne çıkanlar" slaytı için). summary ve comment ile AYNI cümleleri ya da cümle parçalarını KESİNLİKLE kullanma; onların kısaltması/özeti de olmasın. 1-2 cümle, en fazla ~180 karakter. Manşet tonunda; merak uyandıran ama clickbait olmayan, ölçülü, samimi-profesyonel bir not yaz. Habere yeni bir açı ya da çıkarım kat: "neden bakmalısın", "asıl önemli olan ne"? Abartma ve bilgi uydurma; "şok", "inanılmaz", "bomba" gibi ifadeler kullanma.
- tags: 3-6 adet kısa anahtar kelime.
- category: AŞAĞIDAKİ listeden TAM OLARAK birini seç (başka bir kelime yazma): ${cats}

Yanıt formatı (sadece JSON):
{"title":"...","slug":"...","summary":"...","keyPoints":["...","...","..."],"body":["paragraf 1","paragraf 2","paragraf 3"],"comment":"...","editorNote":"...","tags":["..."],"category":"..."}`;
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

export async function analyzeArticle(article) {
  const all = candidates();
  if (!all.length) throw new Error("Hiç API anahtarı yok (GEMINI_API_KEY / GROQ_API_KEY)");

  const available = all.filter((c) => !exhausted.has(keyOf(c)));
  if (!available.length) throw allExhaustedError();

  let lastErr;
  for (const c of available) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callProvider(c, article);
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

  throw allExhaustedError(lastErr);
}

async function callProvider(c, article) {
  return c.provider === "groq" ? groqCall(c, article) : geminiCall(c, article);
}

// --------------------------- Gemini ---------------------------
async function geminiCall(c, article) {
  const res = await safeFetch(`${GEMINI_ENDPOINT(c.model)}?key=${c.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ parts: [{ text: buildPrompt(article) }] }],
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
async function groqCall(c, article) {
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
        { role: "user", content: buildPrompt(article) },
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
