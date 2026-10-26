#!/usr/bin/env node
// ==========================================================================
// AI MODEL KONTROL ARACI
// --------------------------------------------------------------------------
// Kullanim:
//   node --env-file-if-exists=.env scripts/model-kontrol.mjs
//
// Neden gerekli: Groq ve Gemini eski modelleri haber vermeden kapatıyor.
// Kapanan bir model istege 404 ("missing") dondurur ve hat sessizce yeni
// haber uretemez hale gelir — 2026-10'da tam olarak bu yasandi.
//
// Bu arac iki sey yapar:
//   1) Sağlayıcının SU AN sunduğu model listesini yazar.
//   2) src/config.js icindeki listeyi gercek bir JSON istegiyle dener;
//      hangisi calisiyor, hangisi 404/kota, tek tek gosterir.
//
// Ciktiya gore src/config.js icindeki groqModels / geminiModels guncellenir
// (ya da GROQ_MODELS / GEMINI_MODELS Actions degiskeni olarak verilir).
// ==========================================================================

import { config } from "../src/config.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const groqKey = process.env.GROQ_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const kisa = (s, n = 150) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

async function cevapla(url, init, model) {
  const basla = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
    const govde = await res.text();
    const sure = ((Date.now() - basla) / 1000).toFixed(1);
    if (res.ok) return { model, ok: true, durum: res.status, sure, not: kisa(govde, 90) };
    return { model, ok: false, durum: res.status, sure, not: kisa(govde) };
  } catch (err) {
    return { model, ok: false, durum: "hata", sure: ((Date.now() - basla) / 1000).toFixed(1), not: err.message };
  }
}

function yaz(baslik, satirlar) {
  console.log(`\n${baslik}`);
  for (const s of satirlar) {
    const isaret = s.ok ? "✓" : "✗";
    console.log(`  ${isaret} ${s.model.padEnd(38)} ${String(s.durum).padEnd(5)} ${s.sure}s  ${s.ok ? "" : s.not}`);
  }
}

// ---------------------------------------------------------------- Groq
if (!groqKey) {
  console.log("\nGroq: GROQ_API_KEY yok, atlandi.");
} else {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { authorization: `Bearer ${groqKey}` },
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json();
    const sohbet = (json.data || [])
      .map((m) => m.id)
      .filter((id) => !/whisper|tts|guard|orpheus|embed|moderation/i.test(id));
    console.log(`\nGroq hesabında sohbet modelleri (${sohbet.length}):`);
    for (const id of sohbet) console.log(`  · ${id}`);
  } catch (err) {
    console.log(`\nGroq model listesi alınamadı: ${err.message}`);
  }

  const sonuc = [];
  for (const model of config.ai.groqModels) {
    sonuc.push(
      await cevapla(
        GROQ_ENDPOINT,
        {
          method: "POST",
          headers: { authorization: `Bearer ${groqKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Sadece geçerli JSON döndür." },
              { role: "user", content: '{"ok":true} biçiminde JSON döndür.' },
            ],
          }),
        },
        model
      )
    );
  }
  yaz("config.ai.groqModels denemesi:", sonuc);
}

// -------------------------------------------------------------- Gemini
if (!geminiKey) {
  console.log("\nGemini: GEMINI_API_KEY yok, atlandi.");
} else {
  const sonuc = [];
  for (const model of config.ai.geminiModels) {
    sonuc.push(
      await cevapla(
        `${GEMINI_ENDPOINT}/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": geminiKey, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: '{"ok":true} biçiminde sadece JSON döndür.' }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: "application/json" },
          }),
        },
        model
      )
    );
  }
  yaz("config.ai.geminiModels denemesi:", sonuc);
}

console.log(
  "\nNot: 404 = model kapatılmış (listeden çıkar), 429 = kota/limit (sıradaki model denenir).\n"
);
