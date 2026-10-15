import { config } from "./config.js";

const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    summary: { type: "string" },
    comment: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    category: { type: "string" },
  },
  required: ["title", "slug", "summary", "comment", "tags", "category"],
};

const SYSTEM = `Sen deneyimli bir Türk teknoloji ve genel haber editörüsün.
Sana bir kaynak haberin başlığı ve metni verilecek. Onu sıfırdan, kendi sözlerinle ele alıp
Türkçe bir haber kartı üreteceksin. Tarafsız, doğru ve akıcı yaz.
Asla kaynağın cümlelerini kopyalama; kendi ifadelerinle yeniden yaz. Bilgi uydurma.`;

function buildPrompt(article) {
  return `KAYNAK: ${article.source}
BAŞLIK: ${article.title}
METİN: ${article.content}

Aşağıdaki JSON alanlarını TÜRKÇE üret:
- title: Kaynak başlığı KOPYALAMA. Aynı haberi anlatan, ilgi çekici ve özgün bir başlık (en fazla 70 karakter).
- slug: title için URL dostu kimlik; küçük harf, tire ile, Türkçe karakter ve noktalama YOK.
- summary: Haberi 2-3 cümlede tarafsız biçimde özetle.
- comment: Senin editör yorumun; bu haber neden önemli, kime nasıl etkisi olur, ne anlama geliyor? 2-4 cümle, samimi ama profesyonel.
- tags: 3-6 adet kısa anahtar kelime.
- category: Şunlardan BİRİNİ seç: Teknoloji, Yapay Zeka, Mobil, Oyun, Donanım, Yazılım, İnternet, Bilim, Ekonomi, Diğer.`;
}

let workingModel = null;

export async function analyzeArticle(article, apiKey) {
  const candidates = [config.model, ...config.modelFallbacks];
  const order = workingModel
    ? [workingModel, ...candidates.filter((m) => m !== workingModel)]
    : [...new Set(candidates)];

  let lastErr;
  for (const model of order) {
    try {
      const out = await callGemini(model, article, apiKey);
      if (workingModel !== model) {
        workingModel = model;
        console.log(`\n    (model: ${model})`);
      }
      return out;
    } catch (err) {
      lastErr = err;
      if (err.modelMissing) continue; // yanlış/erişilemez model → sıradakini dene
      throw err;
    }
  }
  throw lastErr;
}

async function callGemini(model, article, apiKey, attempt = 1) {
  const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ parts: [{ text: buildPrompt(article) }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`Gemini(${model}) HTTP ${res.status}: ${body}`);

    // Rate limit / geçici sunucu hatası → kısa bekleme ile tekrar dene
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      const wait = attempt * 8000;
      console.warn(`    ! ${res.status}, ${wait / 1000}s bekleyip tekrar deniyorum...`);
      await sleep(wait);
      return callGemini(model, article, apiKey, attempt + 1);
    }

    // Model yok / erişilemiyor → yedek modele geç
    if (res.status === 404 || (res.status === 400 && /model/i.test(body))) {
      err.modelMissing = true;
    }
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini boş yanıt döndü");
  return normalize(JSON.parse(text), article);
}

function normalize(data, article) {
  return {
    title: String(data.title || article.title).trim().slice(0, 120),
    slug: slugify(data.slug || data.title || article.title),
    summary: String(data.summary || "").trim(),
    comment: String(data.comment || "").trim(),
    tags: Array.isArray(data.tags)
      ? data.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
      : [],
    category: String(data.category || "Diğer").trim(),
  };
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
