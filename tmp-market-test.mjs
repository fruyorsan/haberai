import { updateMarket } from "./src/market.js";

const d = await updateMarket();
console.log("Gösterge sayısı:", d.items.length);
for (const i of d.items) {
  const s = i.series || [];
  console.log(
    `  ${i.label.padEnd(12)} değer=${i.value.toFixed(4).padStart(12)}  değişim=%${i.changePct
      .toFixed(2)
      .padStart(6)}  seri=${s.length} nokta  [${s.length ? s[0].toFixed(2) : "-"} → ${
      s.length ? s[s.length - 1].toFixed(2) : "-"
    }]`
  );
}
