// OneSignal abonelerine tek seferlik özür / duyuru push bildirimi gönderir.
import { createHash } from "node:crypto";

const APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const REST_KEY = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
const SITE_URL = (process.env.SITE_URL || "https://haberinai.site").replace(/\/+$/, "");

if (!APP_ID || !REST_KEY) {
  console.error("ONESIGNAL_APP_ID veya ONESIGNAL_REST_API_KEY bulunamadı!");
  process.exit(1);
}

function uuidAnahtar(metin) {
  const h = createHash("sha256").update(String(metin)).digest("hex");
  const varyant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${varyant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function duyuruGonder() {
  const baslik = "🔔 Sizden Özür Dileriz";
  const icerik = "Bildirim sıklığı ve hatalı/bulanık görsel sorunları giderildi. İlginiz ve sabrınız için teşekkür ederiz.";
  const url = `${SITE_URL}/`;

  console.log(`Duyuru hazırlanıyor...`);
  console.log(`Başlık: ${baslik}`);
  console.log(`İçerik: ${icerik}`);
  console.log(`Hedef URL: ${url}`);

  const govde = {
    app_id: APP_ID,
    target_channel: "push",
    included_segments: ["Total Subscriptions"],
    headings: { tr: baslik, en: baslik },
    contents: { tr: icerik, en: icerik },
    url: url,
    chrome_web_icon: `${SITE_URL}/ikon-192.png`,
    firefox_icon: `${SITE_URL}/ikon-192.png`,
    large_icon: `${SITE_URL}/ikon-192.png`,
    chrome_web_badge: `${SITE_URL}/ikon-192.png`,
    chrome_web_image: `${SITE_URL}/og-default.png`,
    big_picture: `${SITE_URL}/og-default.png`,
    ios_attachments: { id1: `${SITE_URL}/og-default.png` },
    ttl: 86400,
    idempotency_key: uuidAnahtar(`ozur-duyuru-${Date.now()}`),
  };

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${REST_KEY}`,
    },
    body: JSON.stringify(govde),
  });

  const metin = await res.text();
  console.log(`OneSignal Yanıtı (HTTP ${res.status}):`, metin);

  if (!res.ok) {
    throw new Error(`OneSignal hatası: ${metin}`);
  }

  const veri = JSON.parse(metin);
  console.log(`✓ Bildirim başarıyla kuyruğa alındı! ID: ${veri.id}, Alıcı sayısı: ${veri.recipients ?? "Hesaplanıyor"}`);
}

duyuruGonder().catch((err) => {
  console.error("Gönderim başarısız:", err);
  process.exit(1);
});
