// ==========================================================================
// KAPAK KARTI — haberin konusuna göre seçilen illüstrasyonlu tasarım kartı
// --------------------------------------------------------------------------
// NEDEN: Fotoğraf bulunamayan ya da kullanılması güvenli olmayan haberlerde
// eskiden düz koyu bir zemin + başlık basılıyordu; bu "boş" duruyordu. Alakasız
// stok fotoğraf ise (ör. başka bir maçın karesi) kartdan daha çok güven
// kaybettiriyor. Bu modül her haber için, KONUYA GÖRE seçilen bir illüstrasyon
// (telefon, çip, top, tren, kalkan...) ve kategori renginde zengin bir sahne
// üretir: her zaman alakalı, telifsiz ve tutarlı.
//
// Saf fonksiyonlar: ağ yok, dosya yazma yok. `kartTaban` bir PNG Buffer döner;
// marka rozeti ve alt şerit kapak hattında (kapak-uret.mjs) üstüne basılır.
// ==========================================================================
import sharp from "sharp";

const FONT = "Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif";

const XML = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ----------------------------------------------------------------- renkler
/** HSL → "#rrggbb" (librsvg sürümünden bağımsız olsun diye hex üretilir). */
function hsl(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** Kategori → ton (hue). Aynı kategori her zaman aynı renk ailesinde durur. */
const KATEGORI_TON = {
  Teknoloji: 212,
  "Yapay Zeka": 268,
  Mobil: 192,
  Donanım: 168,
  Yazılım: 232,
  İnternet: 200,
  Oyun: 300,
  Bilim: 152,
  Uzay: 250,
  Otomobil: 18,
  Spor: 138,
  Ekonomi: 44,
  Dünya: 206,
  Gündem: 356,
  Kültür: 330,
  Sağlık: 172,
};

/** Kategori → varsayılan illüstrasyon (anahtar kelime bulunamazsa). */
const KATEGORI_IKON = {
  Teknoloji: "chip",
  "Yapay Zeka": "ai",
  Mobil: "phone",
  Donanım: "chip",
  Yazılım: "laptop",
  İnternet: "wifi",
  Oyun: "gamepad",
  Bilim: "flask",
  Uzay: "rocket",
  Otomobil: "car",
  Spor: "ball",
  Ekonomi: "chart",
  Dünya: "globe",
  Gündem: "news",
  Kültür: "film",
  Sağlık: "heart",
};

// ------------------------------------------------------------- illüstrasyon
// Hepsi 200×200 kutuda, `A` = vurgu rengi. Çizgi + yarı saydam dolgu: koyu
// zeminde parlayan, tek renk ailesinde duran "duotone" bir görünüm verir.
const SW = 4.5;
const st = (A, w = SW) =>
  `stroke="${A}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const dolgu = (A, o = 0.18) => `fill="${A}" fill-opacity="${o}"`;

const IKONLAR = {
  phone: (A) => `
    <rect x="62" y="16" width="76" height="168" rx="16" ${dolgu(A, 0.14)} ${st(A)}/>
    <rect x="70" y="32" width="60" height="130" rx="6" ${dolgu(A, 0.3)}/>
    <rect x="88" y="23" width="24" height="5" rx="2.5" fill="${A}"/>
    <circle cx="100" cy="173" r="5" fill="none" ${st(A, 3)}/>
    <path d="M78 58H122M78 78H110M78 98H118M78 118H100" stroke="#fff" stroke-opacity=".75" stroke-width="4" stroke-linecap="round"/>`,

  chip: (A) => {
    const pins = [70, 90, 110, 130]
      .map(
        (p) =>
          `<path d="M${p} 52V30M${p} 148V170M52 ${p}H30M148 ${p}H170" ${st(A, 5)}/>`
      )
      .join("");
    return `${pins}
    <rect x="52" y="52" width="96" height="96" rx="12" ${dolgu(A, 0.16)} ${st(A)}/>
    <rect x="76" y="76" width="48" height="48" rx="6" ${dolgu(A, 0.4)} stroke="#fff" stroke-opacity=".8" stroke-width="3"/>
    <path d="M92 100H108M100 92V108" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
  },

  ai: (A) => {
    const dugum = [
      [44, 58],
      [158, 48],
      [36, 138],
      [164, 144],
      [100, 176],
    ];
    const cizgi = dugum
      .map(([x, y]) => `<path d="M${x} ${y}L100 100" ${st(A, 3.5)} stroke-opacity=".7"/>`)
      .join("");
    const nok = dugum
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" ${dolgu(A, 0.4)} ${st(A, 3.5)}/>`)
      .join("");
    return `${cizgi}${nok}
    <circle cx="100" cy="100" r="30" ${dolgu(A, 0.3)} ${st(A)}/>
    <path d="M100 76L106 94L124 100L106 106L100 124L94 106L76 100L94 94Z" fill="#fff"/>`;
  },

  gamepad: (A) => `
    <path d="M52 66H148C172 66 188 98 184 134C182 154 162 160 148 146L132 126H68L52 146C38 160 18 154 16 134C12 98 28 66 52 66Z" ${dolgu(A, 0.16)} ${st(A)}/>
    <path d="M62 86V112M50 99H74" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <circle cx="140" cy="88" r="8" fill="${A}"/><circle cx="158" cy="104" r="8" fill="${A}" fill-opacity=".7"/>
    <circle cx="122" cy="104" r="8" fill="${A}" fill-opacity=".7"/><circle cx="140" cy="120" r="8" fill="${A}" fill-opacity=".5"/>`,

  car: (A) => `
    <path d="M16 132V114Q16 106 26 104L50 98L70 74Q74 70 82 70H128Q136 70 142 76L160 98L178 104Q186 106 186 116V132Z" ${dolgu(A, 0.16)} ${st(A)}/>
    <path d="M76 98L90 80H126L142 98Z" ${dolgu(A, 0.4)}/>
    <circle cx="56" cy="134" r="19" fill="#0b0e14" ${st(A)}/><circle cx="56" cy="134" r="6" fill="${A}"/>
    <circle cx="148" cy="134" r="19" fill="#0b0e14" ${st(A)}/><circle cx="148" cy="134" r="6" fill="${A}"/>
    <path d="M178 112H186" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/>`,

  bolt: (A) => `
    <circle cx="100" cy="100" r="76" ${dolgu(A, 0.12)} ${st(A)}/>
    <circle cx="100" cy="100" r="58" fill="none" ${st(A, 2.5)} stroke-opacity=".4"/>
    <path d="M114 26L62 108H96L86 174L140 88H106Z" fill="#ffd23f"/>`,

  ball: (A) => {
    const pts = (r) =>
      Array.from({ length: 5 }, (_, i) => {
        const a = (-90 + i * 72) * (Math.PI / 180);
        return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
      });
    const ic = pts(26);
    const dis = pts(76);
    const radyal = ic
      .map(([x, y], i) => `<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${dis[i][0].toFixed(1)} ${dis[i][1].toFixed(1)}" ${st(A, 4)}/>`)
      .join("");
    return `<circle cx="100" cy="100" r="76" ${dolgu(A, 0.1)} ${st(A)}/>${radyal}
    <polygon points="${ic.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" ${dolgu("#ffffff", 0.9)} ${st(A, 3)}/>`;
  },

  basket: (A) => `
    <circle cx="100" cy="100" r="76" ${dolgu(A, 0.12)} ${st(A)}/>
    <path d="M100 24V176M24 100H176M50 38Q88 100 50 162M150 38Q112 100 150 162" fill="none" ${st(A, 4)}/>`,

  trophy: (A) => `
    <path d="M64 34H136V86Q136 120 100 124Q64 120 64 86Z" ${dolgu(A, 0.22)} ${st(A)}/>
    <path d="M64 48H44Q40 80 66 94M136 48H156Q160 80 134 94" fill="none" ${st(A)}/>
    <rect x="92" y="124" width="16" height="22" fill="${A}"/>
    <rect x="66" y="146" width="68" height="16" rx="5" ${dolgu(A, 0.55)} ${st(A, 3.5)}/>
    <path d="M100 52L106 66L120 67L109 77L113 91L100 83L87 91L91 77L80 67L94 66Z" fill="#ffd23f"/>`,

  chart: (A) => {
    const barlar = [
      [40, 44],
      [72, 70],
      [104, 100],
      [136, 130],
    ]
      .map(([x, h]) => `<rect x="${x}" y="${170 - h}" width="26" height="${h}" rx="4" ${dolgu(A, 0.32)} ${st(A, 3.5)}/>`)
      .join("");
    return `${barlar}
    <path d="M32 112L76 86L108 100L168 42" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M144 40H170V66" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  },

  globe: (A) => `
    <circle cx="100" cy="100" r="76" ${dolgu(A, 0.12)} ${st(A)}/>
    <ellipse cx="100" cy="100" rx="34" ry="76" fill="none" ${st(A, 3.5)}/>
    <path d="M100 24V176M24 100H176M34 66Q100 84 166 66M34 134Q100 116 166 134" fill="none" ${st(A, 3.5)}/>`,

  flask: (A) => `
    <path d="M84 24H116M90 24V82L44 156Q34 174 56 174H144Q166 174 156 156L110 82V24" fill="none" ${st(A)}/>
    <path d="M62 128H138L154 156Q160 170 144 170H56Q40 170 46 156Z" ${dolgu(A, 0.5)}/>
    <circle cx="94" cy="110" r="6" fill="#fff" fill-opacity=".8"/><circle cx="112" cy="94" r="4" fill="#fff" fill-opacity=".8"/>
    <circle cx="102" cy="142" r="5" fill="#fff" fill-opacity=".6"/>`,

  rocket: (A) => `
    <path d="M100 18Q142 52 142 112V138H58V112Q58 52 100 18Z" ${dolgu(A, 0.2)} ${st(A)}/>
    <circle cx="100" cy="88" r="17" ${dolgu(A, 0.45)} stroke="#fff" stroke-width="4"/>
    <path d="M58 114L32 152L58 142ZM142 114L168 152L142 142Z" fill="${A}"/>
    <path d="M82 146Q100 192 118 146Z" fill="#ffd23f"/>`,

  shield: (A) => `
    <path d="M100 18L162 42V98Q162 144 100 182Q38 144 38 98V42Z" ${dolgu(A, 0.2)} ${st(A)}/>
    <path d="M70 98L93 122L132 74" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,

  scale: (A) => `
    <path d="M100 30V166M62 170H138M38 54H162" fill="none" ${st(A, 5.5)}/>
    <circle cx="100" cy="34" r="9" fill="${A}"/>
    <path d="M38 54L20 112M38 54L56 112M162 54L144 112M162 54L180 112" fill="none" ${st(A, 3)}/>
    <path d="M16 112H60Q58 134 38 136Q18 134 16 112ZM140 112H184Q182 134 162 136Q142 134 140 112Z" ${dolgu(A, 0.45)} ${st(A, 3.5)}/>`,

  train: (A) => `
    <path d="M52 40Q52 26 68 26H132Q148 26 148 40V128Q148 142 134 142H66Q52 142 52 128Z" ${dolgu(A, 0.16)} ${st(A)}/>
    <rect x="66" y="42" width="68" height="42" rx="9" ${dolgu(A, 0.42)}/>
    <path d="M60 100H140" ${st(A, 3)} stroke-opacity=".7"/>
    <circle cx="76" cy="118" r="7" fill="#ffd23f"/><circle cx="124" cy="118" r="7" fill="#ffd23f"/>
    <path d="M70 142L50 178M130 142L150 178M38 178H162" fill="none" ${st(A, 5)}/>`,

  plane: (A) => `
    <path d="M100 16L113 76L182 114V130L113 110L108 152L134 168V180L100 171L66 180V168L92 152L87 110L18 130V114L87 76Z" ${dolgu(A, 0.22)} ${st(A)}/>`,

  seismic: (A) => `
    <circle cx="100" cy="100" r="38" fill="none" ${st(A, 3)} stroke-opacity=".5"/>
    <circle cx="100" cy="100" r="70" fill="none" ${st(A, 3)} stroke-opacity=".28" stroke-dasharray="6 9"/>
    <path d="M12 100H50L66 58L86 152L108 38L128 142L144 100H188" fill="none" stroke="${A}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="108" cy="38" r="7" fill="#ffd23f"/>`,

  flame: (A) => `
    <path d="M100 18C108 56 152 74 152 122C152 156 128 180 100 180C72 180 48 156 48 126C48 100 66 88 74 68C82 84 88 90 92 90C94 66 92 42 100 18Z" ${dolgu(A, 0.28)} ${st(A)}/>
    <path d="M100 98C107 120 128 128 128 148C128 162 116 172 100 172C84 172 72 162 72 148C72 132 92 124 100 98Z" fill="#ffd23f" fill-opacity=".92"/>`,

  weather: (A) => {
    const isin = Array.from({ length: 8 }, (_, i) => {
      const a = (i * 45) * (Math.PI / 180);
      return `<path d="M${(76 + 36 * Math.cos(a)).toFixed(1)} ${(78 + 36 * Math.sin(a)).toFixed(1)}L${(76 + 48 * Math.cos(a)).toFixed(1)} ${(78 + 48 * Math.sin(a)).toFixed(1)}" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`;
    }).join("");
    return `${isin}<circle cx="76" cy="78" r="26" fill="#ffd23f" fill-opacity=".95"/>
    <path d="M58 160Q32 160 32 136Q32 112 58 112Q66 86 96 86Q128 86 134 114Q164 112 166 138Q166 160 142 160Z" ${dolgu(A, 0.4)} ${st(A)}/>`;
  },

  building: (A) => `
    <path d="M100 22L174 66H26Z" ${dolgu(A, 0.28)} ${st(A)}/>
    ${[42, 74, 106, 138]
      .map((x) => `<rect x="${x}" y="78" width="20" height="70" rx="3" ${dolgu(A, 0.4)} ${st(A, 3)}/>`)
      .join("")}
    <rect x="28" y="150" width="144" height="12" rx="3" fill="${A}"/><rect x="18" y="166" width="164" height="12" rx="3" fill="${A}" fill-opacity=".7"/>`,

  heart: (A) => `
    <path d="M100 170C28 120 20 70 52 50C76 34 96 50 100 66C104 50 124 34 148 50C180 70 172 120 100 170Z" ${dolgu(A, 0.26)} ${st(A)}/>
    <path d="M40 100H76L90 76L106 130L120 100H160" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  laptop: (A) => `
    <rect x="42" y="48" width="116" height="80" rx="9" ${dolgu(A, 0.2)} ${st(A)}/>
    <path d="M22 140H178L166 158H34Z" ${dolgu(A, 0.5)} ${st(A, 3.5)}/>
    <text x="100" y="102" font-family="${FONT}" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">&lt;/&gt;</text>`,

  wifi: (A) => `
    <path d="M30 80Q100 20 170 80M54 108Q100 68 146 108M78 134Q100 114 122 134" fill="none" stroke="${A}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="100" cy="158" r="11" fill="${A}"/>`,

  news: (A) => `
    <rect x="28" y="34" width="144" height="132" rx="11" ${dolgu(A, 0.16)} ${st(A)}/>
    <rect x="44" y="50" width="112" height="15" rx="3" fill="${A}" fill-opacity=".85"/>
    <rect x="44" y="76" width="50" height="42" rx="4" ${dolgu(A, 0.4)}/>
    <path d="M106 84H156M106 100H156M106 116H142M44 134H156M44 150H128" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>`,

  film: (A) => `
    <rect x="28" y="80" width="144" height="92" rx="9" ${dolgu(A, 0.16)} ${st(A)}/>
    <path d="M30 76L23 46L168 20L175 50Z" ${dolgu(A, 0.5)} ${st(A)}/>
    <path d="M52 66L45 38M86 60L79 32M120 54L113 26M154 48L147 20" stroke="#fff" stroke-opacity=".85" stroke-width="7" stroke-linecap="round"/>
    <polygon points="88,108 88,150 128,129" fill="#fff" fill-opacity=".92"/>`,

  tv: (A) => `
    <path d="M68 52L100 22L132 52" fill="none" ${st(A)}/>
    <rect x="26" y="52" width="148" height="106" rx="13" ${dolgu(A, 0.16)} ${st(A)}/>
    <rect x="40" y="66" width="120" height="78" rx="6" ${dolgu(A, 0.38)}/>
    <polygon points="90,88 90,124 122,106" fill="#fff" fill-opacity=".92"/>`,
};

// ----------------------------------------------------------- konu → ikon
// Her kural: [ikon, regex, ağırlık]. Başlıkta geçen eşleşme 2, sorgu/etiketlerde
// geçen 1 puan getirir; en yüksek toplam kazanır. Eşleşme yoksa kategori ikonu.
const KURALLAR = [
  ["ai", /yapay zek|\bai\b|chatgpt|gemini|openai|claude|copilot|\bllm\b|robot|yapay zeka/g],
  ["phone", /telefon|iphone|galaxy|redmi|xiaomi|pixel|smartphone|akıllı saat|oneplus|oppo|\bvivo\b|huawei|honor|realme|\bnothing\b/g],
  ["chip", /işlemci|çip|chip|\bgpu|\bcpu|nvidia|\bamd\b|intel|ekran kartı|\bram\b|\bssd\b|snapdragon|dimensity|bellek|anakart|semiconductor|donanım/g],
  ["gamepad", /\boyun|playstation|\bps5|xbox|steam|nintendo|\bgta\b|\bfps\b|oyuncu|e-?spor|fortnite|twitch|game|konsol/g],
  ["bolt", /şarj|elektrik|enerji|doğal ?gaz|akaryakıt|benzin|motorin|petrol|batarya|\bepdk\b|güneş enerjisi|nükleer/g],
  ["car", /otomobil|araç|elektrikli|togg|tesla|\bsuv\b|otomotiv|motosiklet|\bbmw\b|mercedes|\baudi\b|volkswagen|fiat|renault|toyota|honda|hyundai|chery|\bford\b|sürücü|trafik|otomobil/g],
  ["basket", /basketbol|\bnba\b|euroleague|basket|potaya/g],
  ["ball", /\bmaç|futbol|süper lig|galatasaray|fenerbahçe|beşiktaş|trabzonspor|göztepe|\bgol\b|transfer|şampiyonlar ligi|\buefa\b|premier league|stadium|chelsea|barcelona|real madrid|derbi|hakem|teknik direktör|\blig\b|milli takım|football|soccer/g],
  ["trophy", /şampiyon|\bkupa|madalya|olimpiyat|turnuva|rekor|ödül töreni|gümüş madalya|altın madalya/g],
  ["train", /\btren|raylı|marmaray|\btcdd\b|demiryolu|banliyö|metro\b|tramvay/g],
  ["plane", /uçak|havayolu|havalimanı|\bthy\b|pegasus|uçuş|\bjet\b|airline|airport|havacılık/g],
  ["rocket", /uzay|roket|\bnasa\b|spacex|uydu|\bmars\b|yörünge|astronot|teleskop|starship|starlink|\bay'a\b/g],
  ["heart", /sağlık|hastane|doktor|hastalık|ilaç|tedavi|salgın|\bgrip\b|kanser|ameliyat|hasta\b|aşı\b|obezite|diyabet/g],
  ["flask", /\bbilim|araştırma|keşif|deney|laboratuvar|genetik|fosil|gezegen|iklim|üniversite|bilim insan|arkeolog|\bdna\b/g],
  ["seismic", /deprem|artçı|sarsıntı|\bafad\b|\bfay\b|tsunami|volkan|kandilli/g],
  ["flame", /yangın|alev|patlama|itfaiye|yanıyor|yandı|orman yangın/g],
  ["weather", /hava durumu|yağış|sağanak|kar yağ|fırtına|\bsel\b|\bdon\b|sıcaklık|meteoroloji|kuraklık|\bdolu\b|rüzgar|çığ\b|kasırga|\bhava\b/g],
  ["scale", /mahkeme|\bdava\b|savcı|tutuklan|yargı|hakim|\bceza|soruşturma|gözaltı|anayasa|\bkanun|hukuk|iddianame|yargıtay|danıştay|tazminat|avukat|bilirkişi/g],
  ["shield", /güvenlik|savunma|\bordu\b|asker|\biha\b|\bsiha\b|siber|saldırı|hack|casus|\bnato\b|füze|silah|terör|operasyon|polis|jandarma|sızıntı|veri ihlali|gizlilik|\bvpn\b|şifre|antivirüs|fidye/g],
  ["building", /bakanlık|\bbakan\b|belediye|meclis|cumhurbaşkan|seçim|hükümet|\btbmm\b|\bvali\b|resmi gazete|genel müdür|başkan\b|\bparti\b|siyas|diplomasi|zirve|müfettiş|kabine/g],
  ["chart", /borsa|dolar|\beuro\b|enflasyon|\bfaiz|altın|ekonomi|\bzam\b|vergi|maaş|asgari|\bbist\b|piyasa|kripto|bitcoin|bütçe|ihracat|ithalat|merkez bankası|\btcmb\b|\becb\b|\bfed\b|yatırım|hisse|\bsatış|büyüme|işsizlik|fatura|ödeme/g],
  ["tv", /\bdizi\b|netflix|disney|prime video|\bhbo\b|televizyon|\btv\b|yayın akışı|sezon/g],
  ["film", /\bfilm|sinema|fragman|konser|festival|albüm|şarkı|tiyatro|\bkitap|oscar|vizyon|anime|sanatçı|oyuncu kadro|yönetmen/g],
  ["laptop", /yazılım|güncelleme|windows|macos|linux|uygulama|\bios\b|chrome|tarayıcı|\bapi\b|açık kaynak|github|microsoft|\boffice\b|sürüm|\bbeta\b|güvenlik açığı|eklenti|yama\b/g],
  ["wifi", /internet|fiber|\b5g\b|wi-?fi|operatör|turkcell|vodafone|türk telekom|sosyal medya|instagram|twitter|whatsapp|tiktok|telegram|erişim|çöktü|kesinti|\bx\b|platform/g],
  ["globe", /dünya|\babd\b|(?:^|\s)çin(?:\s|'|$)|rusya|ukrayna|israil|gazze|\biran\b|avrupa|\bab\b|\bbm\b|\bg20\b|suriye|trump|putin|biden|filistin|savaş|ateşkes|konvoy|küresel|uluslararası|hindistan|japonya|almanya|fransa|ingiltere/g],
];

const ikonAdi = (a) => {
  const baslik = String(a?.title || "").toLocaleLowerCase("tr");
  const ek = [a?.gorselSorgu, ...(Array.isArray(a?.tags) ? a.tags : [])]
    .join(" ")
    .toLocaleLowerCase("tr");
  let en = null;
  let enPuan = 0;
  for (const [ad, re] of KURALLAR) {
    const puan =
      2 * (baslik.match(re)?.length || 0) + (ek.match(re)?.length || 0);
    if (puan > enPuan) {
      en = ad;
      enPuan = puan;
    }
  }
  return en || KATEGORI_IKON[String(a?.category || "")] || "news";
};

/** Başlıktan basit satır kırma (kapak hattı kendi akıllı kırıcısını verebilir). */
function satirKir(metin, enFazla = 24, satirSayisi = 3) {
  const kelimeler = String(metin || "").replace(/\s+/g, " ").trim().split(" ");
  const satirlar = [];
  let satir = "";
  for (const k of kelimeler) {
    const aday = satir ? `${satir} ${k}` : k;
    if (!satir || aday.length <= enFazla) satir = aday;
    else {
      satirlar.push(satir);
      satir = k;
    }
  }
  if (satir) satirlar.push(satir);
  if (satirlar.length > satirSayisi) {
    const kes = satirlar.slice(0, satirSayisi);
    kes[satirSayisi - 1] = kes[satirSayisi - 1].replace(/[,.;:!?]+$/, "") + "…";
    return kes;
  }
  return satirlar;
}

/**
 * Kapak tabanı (PNG Buffer).
 * @param {object} p
 * @param {object} p.haber       { title, category, gorselSorgu, tags }
 * @param {string[]} [p.satirlar] hazır başlık satırları (yoksa başlıktan kırılır)
 * @param {number} [p.boyut]     başlık punto
 * @param {number} [p.lh]        satır aralığı
 */
export async function kartTaban({ haber, satirlar, boyut = 56, lh = 68, W = 1280, H = 720 }) {
  const kategori = String(haber?.category || "");
  const ton = KATEGORI_TON[kategori] ?? 214;
  const A = hsl(ton, 88, 62); // vurgu
  const koyu = hsl(ton, 55, 6);
  const orta = hsl((ton + 18) % 360, 52, 14);
  const isik = hsl(ton, 90, 55);

  const ad = ikonAdi(haber);
  const ikon = (IKONLAR[ad] || IKONLAR.news)(A);

  const satir = satirKir(haber?.title, 22, 4);
  const fBoyut = satir.length >= 4 ? 46 : 52;
  const fLh = satir.length >= 4 ? 60 : 68;
  const ilkY = 336 - ((satir.length - 1) * fLh) / 2;
  const etiket = XML(kategori.toLocaleUpperCase("tr"));
  const hapW = Math.max(120, Math.round(etiket.length * 15.4 + 46));
  const hapY = Math.round(ilkY - fBoyut - 52);
  const sonY = Math.round(ilkY + (satir.length - 1) * fLh);

  const baslikSvg = satir
    .map(
      (s, i) =>
        `<text x="76" y="${Math.round(ilkY + i * fLh + 3)}" font-size="${fBoyut}" font-weight="700" fill="#000" fill-opacity=".4" letter-spacing="-0.8">${XML(s)}</text>` +
        `<text x="76" y="${Math.round(ilkY + i * fLh)}" font-size="${fBoyut}" font-weight="700" fill="#fff" letter-spacing="-0.8">${XML(s)}</text>`
    )
    .join("\n      ");

  // İllüstrasyon: 200×200 kutu, 2.0 ölçek, sağ yarıda ortalı.
  const cx = 1010;
  const cy = 336;
  const olcek = 2.0;
  const tx = cx - 100 * olcek;
  const ty = cy - 100 * olcek;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="zemin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${koyu}"/><stop offset="1" stop-color="${orta}"/>
    </linearGradient>
    <radialGradient id="parilti" cx="${cx / W}" cy="${cy / H}" r="0.62">
      <stop offset="0" stop-color="${isik}" stop-opacity=".55"/>
      <stop offset=".45" stop-color="${isik}" stop-opacity=".16"/>
      <stop offset="1" stop-color="${isik}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="kose" cx=".02" cy=".02" r=".7">
      <stop offset="0" stop-color="${isik}" stop-opacity=".22"/><stop offset="1" stop-color="${isik}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="nokta" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.5" fill="#fff" fill-opacity=".07"/>
    </pattern>
    <filter id="bulanik" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
    <filter id="golge" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#zemin)"/>
  <rect width="${W}" height="${H}" fill="url(#kose)"/>
  <rect width="${W}" height="${H}" fill="url(#nokta)"/>
  <rect width="${W}" height="${H}" fill="url(#parilti)"/>
  <path d="M760 -20L560 ${H + 20}" stroke="${A}" stroke-opacity=".16" stroke-width="3"/>
  <path d="M800 -20L600 ${H + 20}" stroke="${A}" stroke-opacity=".08" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="262" fill="none" stroke="${A}" stroke-opacity=".22" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="322" fill="none" stroke="${A}" stroke-opacity=".12" stroke-width="2" stroke-dasharray="4 12"/>
  <circle cx="${cx}" cy="${cy}" r="384" fill="none" stroke="${A}" stroke-opacity=".07" stroke-width="2"/>
  <ellipse cx="${cx}" cy="${cy + 246}" rx="190" ry="20" fill="#000" fill-opacity=".45" filter="url(#golge)"/>
  <g transform="translate(${tx} ${ty}) scale(${olcek})" filter="url(#bulanik)" opacity=".75">${ikon}</g>
  <g transform="translate(${tx} ${ty}) scale(${olcek})">${ikon}</g>
  <g font-family="${FONT}">
    ${
      etiket
        ? `<rect x="76" y="${hapY}" width="${hapW}" height="46" rx="23" fill="${A}"/>
    <text x="${76 + Math.round(hapW / 2)}" y="${hapY + 31}" font-size="22" font-weight="700" fill="${koyu}" letter-spacing="2.6" text-anchor="middle">${etiket}</text>`
        : ""
    }
      ${baslikSvg}
    <rect x="76" y="${sonY + 34}" width="96" height="8" rx="4" fill="${A}"/>
  </g>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export { ikonAdi, KATEGORI_TON };
