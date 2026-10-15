// Netlify Function: /api/sor
// Okuyucunun haber hakkındaki sorusunu Groq'a iletir. Anahtar sunucuda kalır.
export const config = { path: "/api/sor" };

const MODEL = "openai/gpt-oss-20b";
const MAX_QUESTION = 400;

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Yöntem desteklenmiyor." }, 405);
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: "Servis yapılandırılmamış." }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const question = String(body?.question || "").trim().slice(0, MAX_QUESTION);
  if (question.length < 3) return json({ error: "Lütfen bir soru yazın." }, 400);

  const title = String(body?.title || "").slice(0, 220);
  const summary = String(body?.summary || "").slice(0, 900);
  const comment = String(body?.comment || "").slice(0, 900);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 450,
        messages: [
          {
            role: "system",
            content:
              "Sen HaberAI'nin haber asistanısın. Yalnızca sana verilen haber bağlamına dayanarak Türkçe, kısa (en fazla 4 cümle) ve net yanıt ver. Bağlamda olmayan bilgiyi uydurma; emin değilsen bunu açıkça söyle.",
          },
          {
            role: "user",
            content: `HABER BAŞLIĞI: ${title}\nHABER ÖZETİ: ${summary}\nEDİTÖR YORUMU: ${comment}\n\nKULLANICI SORUSU: ${question}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      return json({ error: "AI şu an yanıt veremiyor, birazdan tekrar dene." }, 502);
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return json({ error: "Yanıt üretilemedi." }, 502);

    return json({ answer });
  } catch {
    return json({ error: "Bağlantı hatası, birazdan tekrar dene." }, 504);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
