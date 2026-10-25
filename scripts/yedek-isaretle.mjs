// Kategori yedeği kullanan mevcut haberleri işaretler (gorselYedek = 1).
// `gorsel-guvenli` bir sonraki turda bu haberleri farklı sorgularla yeniden arar.
import fs from "node:fs";
import { YEDEK_GORSEL } from "../src/stok-gorsel.js";

const p = "data/articles.json";
const ham = fs.readFileSync(p, "utf8");
const crlf = ham.includes("\r\n");
const a = JSON.parse(ham);

const havuz = new Set();
for (const arr of Object.values(YEDEK_GORSEL)) for (const g of arr) havuz.add(g.url);

let n = 0;
for (const x of a) {
  if (havuz.has(String(x.image || ""))) {
    x.gorselYedek = Number(x.gorselYedek) || 1;
    n++;
  }
}

fs.writeFileSync(
  p,
  crlf ? JSON.stringify(a, null, 2).replace(/\n/g, "\r\n") + "\r\n" : JSON.stringify(a, null, 2) + "\n",
  "utf8"
);
console.log(`yedek işaretlenen: ${n} | havuz: ${havuz.size}`);
