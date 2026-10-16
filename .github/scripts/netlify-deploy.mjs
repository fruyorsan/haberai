// Netlify REST API ile dosya deploy'u (netlify-cli olmadan).
// CLI'nin prod deploy'u bazi planlarda "Forbidden" donduruyor; bu betik
// klasik dosya-deploy akisini uygular:
//   1. POST /sites/:id/deploys  → dosya yolu → sha1 manifest
//   2. response.required ve digests yantına göre eksik dosyaları PUT eder
//   3. deploy "ready" olana kadar POLL eder
// Kullanım: node netlify-deploy.mjs <publish-dir> <deploy-mesaji>
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const [publishDir, message] = process.argv.slice(2);
const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;

if (!publishDir || !token || !siteId) {
  console.error("Kullanim: node netlify-deploy.mjs <dizin> <mesaj>  (env: NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID)");
  process.exit(1);
}

const sha1 = (buf) => createHash("sha1").update(buf).digest("hex");

function walk(dir, base = dir, files = {}) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, files);
    else {
      const rel = "/" + relative(base, p).split(sep).join("/");
      files[rel] = sha1(readFileSync(p));
    }
  }
  return files;
}

const files = walk(publishDir);
const count = Object.keys(files).length;
console.log(`Manifest hazir: ${count} dosya`);

const api = (path, init = {}, raw = false) =>
  fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(raw ? { "Content-Type": "application/octet-stream" } : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });

// 1) Manifest ile deploy olustur (draft=false → prod)
const createRes = await api(`/sites/${siteId}/deploys`, {
  method: "POST",
  body: JSON.stringify({ files, ...(message ? { title: message } : {}) }),
});
const deploy = await createRes.json();
if (!createRes.ok) {
  console.error(`Deploy olusturulamadi: HTTP ${createRes.status}`, JSON.stringify(deploy).slice(0, 800));
  process.exit(1);
}
console.log(`Deploy olusturuldu: ${deploy.id} (${deploy.deploy_ssl_url || deploy.url})`);

// 2) Sunucunun istedigi dosyalari yukle
const required = new Set([...(deploy.required || []), ...(Object.keys(deploy.digests || {}))]);
let uploaded = 0;
for (const path of required) {
  const local = join(publishDir, ...path.split("/").filter(Boolean));
  let body;
  try {
    body = readFileSync(local);
    if (sha1(body) !== files[path]) {
      console.error(`Hash uyusmazligi: ${path} — offline buildler arasinda digerme olabilir`);
    }
  } catch {
    console.warn(`Tanimanmayan dosya istendi, atlanıyor: ${path}`);
    continue;
  }
  const up = await api(`/deploys/${deploy.id}/files/${encodeURIComponent(path)}`, { method: "PUT", body }, true);
  if (!up.ok) {
    console.error(`Yukleme basarisiz: ${path} HTTP ${up.status} ${await up.text().catch(() => "")}`);
    process.exit(1);
  }
  uploaded++;
}
console.log(uploaded === 0 ? `Sunucunun deposu mevcut; 0 dosya yuklendi.` : `${uploaded} dosya yuklendi.`);

// 3) Deploy tamamlanana kadar bekle (en fazla 10 dk)
const deadline = Date.now() + 10 * 60 * 1000;
let state = "new";
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 8000));
  const d = await (await api(`/deploys/${deploy.id}`)).json();
  state = d.state;
  if (["ready", "error"].includes(state)) {
    if (state === "error") {
      console.error(`Deploy hata ile bitti: ${d.error_message || d.error_message}`);
      process.exit(1);
    }
    console.log(`Deploy hazir: ${d.ssl_url}`);
    process.exit(0);
  }
}
console.error(`Deploy zaman asiri; son durum: ${state}`);
process.exit(1);
