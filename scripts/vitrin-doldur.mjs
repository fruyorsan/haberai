import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeId } from "../src/store.js";
import { slugify } from "../src/ai.js";
import { yedekGorsel, atif } from "../src/stok-gorsel.js";

// ShiftDelete, DonanımHaber, Webtekno, Technopat'tan canlı çekilen güncel vitrin haberleri
export const CURATED = [
  {
    source: "NTV Teknoloji",
    sourceUrl: "https://www.ntv.com.tr/teknoloji/internetin-altyapisinda-kritik-acik-dunya-alarma-gecti-avrupada-devlet-siteleri-kapatildi,kritik-bgp-acigi-2026",    category: "İnternet",
    publishedAt: "2026-10-21T17:12:00.000Z",
    breaking: true,
    title: "İnternet altyapısında kritik güvenlik açığı: Avrupa'da kamu siteleri erişime kapatıldı",
    summary:
      "Küresel internet yönlendirme protokollerinde tespit edilen kritik bir güvenlik açığı nedeniyle Avrupa'daki bazı kamu kurumlarının web siteleri önlem amaçlı olarak geçici süreyle erişime kapatıldı.",
    keyPoints: [
      "Küresel ağ yönlendirme yazılımında uzaktan istismar edilebilen sıfırıncı gün açığı bulundu.",
      "Avrupa'da bazı bakanlık ve kamu portalları acil yama uygulanana kadar çevrimdışı bırakıldı.",
      "Siber güvenlik merkezleri tüm veri merkezi yöneticilerine acil güncelleme çağrısı yaptı.",
    ],
    body: [
      "Küresel internet trafiğinin omurgasını oluşturan yönlendirme ve sunucu altyapısında tespit edilen kritik bir sıfırıncı gün açığı, siber güvenlik kurumlarını alarma geçirdi. Saldırganların şifreli ağ paketleri üzerinden sunucu belleğine müdahale etmesine kapı aralayan zafiyetin ardından acil güvenlik bülteni yayımlandı.",
      "Avrupa Birliği bünyesindeki bazı kamu kurumları ve belediye portalları, olası bir veri sızıntısı veya hizmet kesintisi saldırısına hedef olmamak için sistemlerini geçici olarak dış erişime kapattı. Teknik ekipler çekirdek ağ yazılımlarına güvenlik yamalarını uygulamaya başladı.",
      "Ulusal siber güvenlik merkezleri, söz konusu açığın özellikle eski sürüm yönlendirici yazılımı kullanan kurumsal ağları ve bulut sunucularını etkilediğini bildirdi. Bireysel internet kullanıcılarının doğrudan bir veri kaybı riski bulunmasa da bazı çevrimiçi kamu hizmetlerinde kısa süreli erişim yavaşlamaları yaşanabiliyor.",
      "Altyapı sağlayıcılarının yayınladığı acil durum güncellemesinin küresel veri merkezlerinde birkaç saat içinde tamamlanmasıyla kapatılan kamu sitelerinin kademeli olarak yeniden açılması bekleniyor.",
    ],
    comment:
      "İnternet omurgasında kullanılan açık kaynaklı protokollerde çıkan tek bir kritik hata, dakikalar içinde ülkelerin kamu hizmetlerini durma noktasına getirebiliyor. Avrupa'daki kurumların saldırı gerçekleşmeden siteleri önleyici olarak kapatması doğru bir kriz yönetimi olsa da, kritik altyapıların tek tip yazılım kütüphanelerine olan bağımlılığı küresel ölçekte en büyük siber kırılganlık olmaya devam ediyor.",
    editorNote:
      "Küresel internet yönlendirme yazılımlarında tespit edilen sıfırıncı gün açığı sonrası Avrupa'da bazı kamu siteleri yama yapılana kadar kapatıldı.",
    tags: ["Siber Güvenlik", "İnternet", "Avrupa", "Teknoloji", "Sunucu"],
  },
  {
    source: "Haber Global",
    sourceUrl: "https://haberglobal.com.tr/spor/yunus-akgunden-lille-filelerine-tarihi-gol-2026-10-21",    category: "Spor",
    publishedAt: "2026-10-21T17:10:00.000Z",
    breaking: true,
    title: "Yunus Akgün'den Avrupa sahnesinde Lille ağlarına erken ve tarihi gol",
    summary:
      "Galatasaray'ın genç yıldızı Yunus Akgün, Lille karşısında maçın henüz başında kaydettiği şık golle sarı-kırmızılı kulübün Avrupa kupaları tarihindeki en erken gollerinden birine imza attı.",
    keyPoints: [
      "Yunus Akgün, Lille karşısında ceza sahası dışından yaptığı vuruşla takımını öne geçirdi.",
      "Genç oyuncu bu sezon Avrupa kupalarındaki gol serisini sürdürerek kariyer rekorunu geliştirdi.",
      "Sarı-kırmızılıların Avrupa'daki en erken golleri arasına giren vuruş tribünleri ayağa kaldırdı.",
    ],
    body: [
      "Avrupa kupalarındaki kritik Lille mücadelesine hızlı başlayan Galatasaray'da sahneye çıkan isim bir kez daha Yunus Akgün oldu. Karşılaşmanın henüz ilk dakikalarında gelişen hücumda topu önünde bulan milli futbolcu, kalecinin uzanamayacağı köşeye yaptığı sert vuruşla fileleri havalandırdı.",
      "Bu erken gol, sarı-kırmızılı temsilcimizin Avrupa kupaları tarihinde kaydettiği en hızlı gollerden biri olarak kayıtlara geçti. Maçın başında gelen skor avantajı, Fransız temsilcisinin savunma kurgusunu bozarken Galatasaray'ın oyun kontrolünü eline almasını sağladı.",
      "Bu sezon hem Süper Lig'de hem de Avrupa maçlarında skora doğrudan katkı veren Yunus Akgün, üst üste çıktığı Avrupa karşılaşmalarında gol atma başarısı gösteren nadir Türk oyuncular arasındaki yerini sağlamlaştırdı.",
      "Teknik heyetin hücum presi ve hızlı geçiş oyunu planında kilit rol üstlenen genç kanat oyuncusu, maç boyunca sergilediği enerjiyle taraftarlardan tam not aldı.",
    ],
    comment:
      "Avrupa deplasmanlarında ve üst düzey Fransız takımlarına karşı maçın başında skor üstünlüğünü yakalamak, karşılaşmanın bütün taktik dengesini değiştirir. Yunus Akgün'ün bu sezon yakaladığı özgüven ve ceza sahası çevresindeki bitiriciliği, Galatasaray'ın Avrupa hedeflerinde yabancı yıldızlar kadar yerli rotasyonun da belirleyici olduğunu kanıtlıyor.",
    editorNote:
      "Yunus Akgün, Lille karşısında kaydettiği şık golle Avrupa'daki gol serisini sürdürürken kulüp tarihinin en erken gollerinden birine imza attı.",
    tags: ["Galatasaray", "Yunus Akgün", "Lille", "Avrupa Kupası", "Spor"],
  },
  {
    source: "Hürriyet Gündem",
    sourceUrl: "https://www.hurriyet.com.tr/ekonomi/cumhurbaskani-yardimcisi-yilmaz-2027-yili-butcesini-meclise-sundu-2026-10-21",    category: "Ekonomi",
    publishedAt: "2026-10-21T17:08:00.000Z",
    breaking: true,
    title: "2027 yılı merkezi yönetim bütçe teklifi TBMM Plan ve Bütçe Komisyonu'na sunuldu",
    summary:
      "Cumhurbaşkanı Yardımcısı Cevdet Yılmaz, 2027 yılı Merkezi Yönetim Bütçe Kanunu Teklifi'ni TBMM Plan ve Bütçe Komisyonu'na sunarak enflasyonla mücadele, eğitim ve savunma ödeneklerinin ayrıntılarını paylaştı.",
    keyPoints: [
      "2027 bütçesinde en büyük pay eğitim, sağlık ve savunma yatırımlarına ayrıldı.",
      "Mali disiplinin korunarak bütçe açığının milli gelire oranının düşürülmesi hedefleniyor.",
      "Bütçe maratonu komisyon görüşmelerinin ardından Aralık ayında Genel Kurul'a gelecek.",
    ],
    body: [
      "Türkiye Büyük Millet Meclisi'nde 2027 yılı bütçe maratonu resmen başladı. Cumhurbaşkanı Yardımcısı Cevdet Yılmaz, TBMM Plan ve Bütçe Komisyonu'nda yaptığı sunumla yeni yılın gelir ve gider hedeflerini, makroekonomik beklentileri ve bakanlık ödeneklerini milletvekilleriyle paylaştı.",
      "Yeni bütçe teklifinde en yüksek ödeneğin yine eğitim ve sağlık hizmetlerine ayrıldığı, savunma sanayii ve afetlere dirençli şehircilik yatırımlarının ise öncelikli kalemler arasında tutulduğu vurgulandı. Sosyal yardım ve dar gelirli vatandaşları koruma programları için ayrılan kaynak da güncellendi.",
      "Sunumda dezenflasyon sürecinin maliye politikasıyla destekleneceği ve bütçe açığının gayrisafi yurt içi hasılaya oranının kademeli olarak aşağı çekileceği belirtildi. Vergi gelirlerinde tabana yayılan adil bir tahsilat yapısının hedeflendiği ifade edildi.",
      "Plan ve Bütçe Komisyonu'nda yaklaşık bir ay sürecek bakanlık bütçesi görüşmelerinin ardından teklif Aralık ayında TBMM Genel Kurulu'nda oylanarak yasalaşacak.",
    ],
    comment:
      "Enflasyonla mücadelede para politikası kadar bütçe disiplini ve kamu harcamalarının kalitesi de belirleyici rol oynuyor. 2027 bütçesinde eğitim ve üretime dönük yatırımların korunurken cari harcamalarda tasarruf hedeflerinin ne ölçüde tutturulacağı, önümüzdeki yıl vergi yükünü ve piyasa faizlerini doğrudan etkileyecektir.",
    editorNote:
      "Meclis'te 2027 bütçe maratonu başladı; eğitim ve savunma aslan payını alırken mali disiplin ve enflasyonla mücadele ana hedef olarak öne çıktı.",
    tags: ["Bütçe", "TBMM", "Ekonomi", "Enflasyon", "Meclis"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/iphone-duo-cikmadan-applea-kotu-haber-satis-tahminleri-asagi-cekildi",    category: "Mobil",
    publishedAt: "2026-10-21T17:06:00.000Z",
    title: "Katlanabilir iPhone Duo çıkmadan Apple'ın satış tahminleri düşürüldü",
    summary:
      "Apple'ın uzun süredir beklenen katlanabilir telefonu iPhone Duo henüz tanıtılmadan analistler ilk yıl sevkiyat beklentilerini aşağı yönlü revize etti. Yüksek başlangıç fiyatı ve menteşe tedarik zincirindeki kapasite sınırları tahminleri doğrudan baskılıyor.",
    keyPoints: [
      "Analistler katlanabilir iPhone Duo için ilk yıl sevkiyat tahminlerini aşağı çekti.",
      "2.000 doları aşması beklenen fiyat etiketi ilk dalga talebi sınırlayabilir.",
      "Özel katlanabilir OLED panel ve menteşe üretiminde tedarik darboğazı yaşanıyor.",
    ],
    body: [
      "Apple'ın katlanabilir telefon pazarına giriş bileti olması beklenen iPhone Duo modeli hakkında tedarik zincirinden gelen son raporlar, şirketin ilk yıl hedeflerinde temkinli bir revizyona gidildiğini gösteriyor. Pazar araştırma kuruluşları, cihazın seri üretim takvimindeki daralma ve yüksek maliyet yapısı nedeniyle ilk sevkiyat tahminlerini düşürdü.",
      "Özellikle ekran kat izini minimuma indiren özel OLED panel katmanı ile sıvı metal alaşımlı menteşe mekanizmasının üretim verimliliği beklentilerin altında seyrediyor. Tedarikçilerin yüksek kalite standartlarını tutturmakta zorlanması, lansman dönemindeki stok adedini doğrudan kısıtlayacak.",
      "Fiyatlandırma tarafında ise cihazın 2.000 dolar bandının üzerinde konumlandırılacağı öngörülüyor. Küresel akıllı telefon pazarında üst segment tüketicilerin bile katlanabilir modellere geçişte fiyat hassasiyeti göstermesi, ilk yıl satışlarının yalnızca sadık kullanıcı kitlesiyle sınırlı kalmasına yol açabilir.",
      "Buna karşın Apple'ın iPadOS ve iOS arayüzlerini tek gövdede birleştiren yeni yazılım mimarisiyle katlanabilir form faktöründe kullanım deneyimini değiştirmesi bekleniyor. Üretim darboğazlarının aşılmasıyla birlikte ikinci nesilde çok daha geniş bir kullanıcı tabanına ulaşılması hedefleniyor.",
    ],
    comment:
      "Katlanabilir telefon pazarında donanım dayanıklılığı kadar başlangıç fiyatı da satın alma kararını belirliyor. Apple'ın 2.000 dolar üstü bir etiketle sahneye çıkması, ilk nesil iPhone Duo'yu ana akım bir modelden çok vitrin ürününe dönüştürebilir. Rakip markaların yedinci nesil katlanabilir cihazlarla fiyatları aşağı çektiği bir dönemde, Apple'ın fark yaratabilmesi yalnızca yazılım ekosistemindeki kusursuz geçişe bağlı olacak.",
    editorNote:
      "2.000 doları aşan fiyat beklentisi ve ekran tedarikindeki darboğaz, katlanabilir iPhone Duo'nun ilk yıl stoklarını ciddi biçimde sınırlayabilir.",
    tags: ["Apple", "iPhone Duo", "Katlanabilir Telefon", "iOS", "Mobil"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/chatgpt-artik-sohbetleri-kilitlemenize-izin-veriyor",    category: "Yapay Zeka",
    publishedAt: "2026-10-21T16:38:00.000Z",
    title: "ChatGPT, özel sohbetleri PIN ve biyometrik doğrulamayla kilitleme özelliği aldı",
    summary:
      "OpenAI, ChatGPT kullanıcılarının hassas yazışmalarını meraklı gözlerden koruması için sohbet kilitleme özelliğini devreye aldı. Kilitlenen geçmiş görüşmelere yalnızca PIN kodu veya cihazın yüz ve parmak izi doğrulamasıyla erişilebiliyor.",
    keyPoints: [
      "ChatGPT'deki bireysel sohbetler artık PIN veya biyometrik doğrulamayla kilitlenebiliyor.",
      "Kilitli sohbetlerin içeriği kenar çubuğunda ve arama sonuçlarında gizleniyor.",
      "Özellik hem mobil uygulamada hem de masaüstü web arayüzünde kademeli olarak açıldı.",
    ],
    body: [
      "OpenAI, milyonlarca kullanıcının iş planlarından kişisel notlarına kadar pek çok hassas veriyi paylaştığı ChatGPT arayüzüne doğrudan sohbet kilitleme katmanı ekledi. Yeni güvenlik seçeneği sayesinde kullanıcılar, seçtikleri sohbet dizilerini tek dokunuşla koruma altına alabiliyor.",
      "Kilitleme işlemi aktif edildiğinde ilgili yazışmanın başlığı ve içerik önizlemesi sol menüdeki geçmiş listesinden kaldırılıyor. Ortak kullanılan bilgisayarlarda veya telefonu başkasının eline verdiğiniz anlarda özel sohbetlerin kazara görüntülenmesi böylece tamamen engelleniyor.",
      "Mobil cihazlarda Face ID, Touch ID veya Android biyometrik doğrulama altyapısıyla entegre çalışan sistem, masaüstü tarayıcılarda ise hesap bazlı özel PIN kodu talep ediyor. Ayrıca kilitlenen sohbetler uygulama içi genel arama sonuçlarında da doğrulama yapılana kadar listelenmiyor.",
      "Kullanıcı gizliliğini cihaz düzeyinde güçlendiren bu adım, özellikle kurumsal hesapların ve ortak ekran kullanan profesyonellerin en çok talep ettiği güvenlik güncellemesi olarak öne çıkıyor.",
    ],
    comment:
      "Yapay zekâ asistanları artık basit birer arama aracı değil, kişisel ve kurumsal sırların tutulduğu dijital birer not defteri işlevi görüyor. Ortak kullanılan bilgisayar veya telefonlarda sohbet geçmişinin açıkta kalması ciddi bir mahremiyet açığı yaratıyordu. Biyometrik kilit desteği, WhatsApp'taki sohbet kilidi alışkanlığını yapay zekâ tarafına taşıyarak günlük kullanımda güven hissini doğrudan artıracaktır.",
    editorNote:
      "Ortak bilgisayar veya telefon kullananlar için ChatGPT geçmişini PIN ve yüz tanımayla gizleyen yeni kilit katmanı devreye girdi.",
    tags: ["ChatGPT", "OpenAI", "Yapay Zeka", "Siber Güvenlik", "Gizlilik"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/whatsapp-iphoneda-safarinin-isini-ustlenmeye-hazirlaniyor",    category: "Mobil",
    publishedAt: "2026-10-21T16:34:00.000Z",
    title: "WhatsApp, iPhone'da bağlantıları Safari yerine kendi tarayıcısında açacak",
    summary:
      "WhatsApp, iOS uygulaması için geliştirdiği yeni uygulama içi özel tarayıcıyla sohbetlerde paylaşılan web bağlantılarını doğrudan kendi penceresinde açmaya hazırlanıyor. Kullanıcılar uygulamadan çıkmadan güvenli bağlantı kontrolüyle sayfaları gezebilecek.",
    keyPoints: [
      "iOS için WhatsApp, harici Safari yönlendirmesi yerine gelişmiş uygulama içi tarayıcıya geçiyor.",
      "Şüpheli bağlantılar açılmadan önce gerçek zamanlı oltalama denetiminden geçirilecek.",
      "İsteyen kullanıcılar ayarlardan varsayılan harici tarayıcı seçeneğine geri dönebilecek.",
    ],
    body: [
      "Meta, iPhone kullanıcılarının WhatsApp sohbetlerinde tıkladığı web bağlantılarını Safari'ye yönlendirmek yerine doğrudan uygulama içinde açan yeni tarayıcı arayüzünü test etmeye başladı. Güncellemeyle birlikte bağlantılar sohbet ekranından kopmadan hızlı bir alt pencerede yükleniyor.",
      "Yeni uygulama içi tarayıcı yalnızca hız kazandırmakla kalmıyor, aynı zamanda oltalama ve zararlı site girişimlerine karşı yerleşik bir güvenlik kalkanı sunuyor. Bağlantının yönlendirdiği alan adı şüpheli bulunduğunda kullanıcıya sayfa yüklenmeden önce tam ekran uyarı gösteriliyor.",
      "Arayüzde sayfa içi arama, metin boyutu büyütme, bağlantıyı kopyalama ve tek dokunuşla Safari'de açma kısayolları da korunuyor. Böylece haber okurken veya alışveriş bağlantısına bakarken gelen yeni mesajlara anında dönmek mümkün hale geliyor.",
      "Test süreci tamamlandıktan sonra tüm iOS kullanıcılarına sunulacak özellik, uygulama ayarları altından isteğe bağlı olarak kapatılabilecek.",
    ],
    comment:
      "Mesajlaşma uygulamalarında paylaşılan bir habere her tıklandığında Safari'ye geçiş yapmak hem zaman kaybettiriyor hem de tarayıcıda onlarca açık sekme birikmesine neden oluyordu. WhatsApp'ın kendi tarayıcı katmanını güçlendirmesi kullanıcıyı uygulama içinde tutarken, oltalama bağlantılarına karşı ön denetim sunmasıyla dolandırıcılık vakalarını da azaltacaktır.",
    editorNote:
      "iPhone'da WhatsApp bağlantılarına tıkladığınızda Safari'ye geçme zorunluluğu kalkıyor; yeni uygulama içi tarayıcı oltalama korumasıyla geliyor.",
    tags: ["WhatsApp", "iPhone", "Safari", "iOS", "Mobil"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/intel-nova-lake-islemciler-28-cekirdekle-dizustu-bilgisayarlara-geliyor",    category: "Donanım",
    publishedAt: "2026-10-21T16:30:00.000Z",
    title: "Intel Nova Lake işlemciler 28 çekirdekle dizüstü bilgisayarlara geliyor",
    summary:
      "Intel'in yeni nesil mobil işlemci ailesi Nova Lake-HX, 28 çekirdekli hibrit mimarisiyle üst düzey oyuncu ve iş istasyonu dizüstü bilgisayarlarına masaüstü seviyesinde performans getirmeye hazırlanıyor.",
    keyPoints: [
      "Nova Lake-HX mobil işlemciler 28 çekirdeğe kadar çıkan yeni hibrit yapılandırmayla geliyor.",
      "Yeni nesil performans ve verimlilik çekirdekleri çoklu iş parçacığında %30'un üzerinde artış hedefliyor.",
      "Üst segment oyuncu dizüstü bilgisayarlarında PCIe 5.0 ve yüksek hızlı DDR5 desteği standartlaşacak.",
    ],
    body: [
      "Intel, dizüstü bilgisayar pazarında performans sınırlarını yukarı taşıyacak yeni nesil Nova Lake mobil işlemci ailesi için hazırlıklarını hızlandırdı. Sızdırılan teknik verilere göre serinin tepe modeli Nova Lake-HX, toplam 28 çekirdekli yapısıyla mobil iş istasyonlarını ve üst düzey oyuncu bilgisayarlarını hedefleyecek.",
      "Yeni mimaride yüksek saat hızına sahip performans çekirdekleri ile arka plan görevlerini üstlenen düşük güç tüketimli verimlilik çekirdekleri yeniden dengeleniyor. Bu sayede hem ağır video kurgu ve üç boyutlu tasarım yüklerinde hem de modern oyunlarda masaüstü işlemcilere yakın bir performans profili sunuluyor.",
      "Önbellek kapasitesinin genişletilmesi ve bellek kontrolcüsünün daha yüksek DDR5 frekanslarını desteklemesi, özellikle rekabetçi oyunlarda kare hızı kararlılığını doğrudan iyileştirecek. Ayrıca entegre yapay zekâ hızlandırıcı biriminin yerel model çalıştırma kapasitesi de katlanıyor.",
      "Üreticilerin yeni soğutma tasarımlarıyla birlikte Nova Lake tabanlı ilk üst segment dizüstü bilgisayarları önümüzdeki dönemde vitrine çıkarması bekleniyor.",
    ],
    comment:
      "Mobil işlemcilerde 28 çekirdek seviyesine çıkılması, taşınabilir iş istasyonları ile masaüstü sistemler arasındaki performans makasını neredeyse tamamen kapatıyor. Ancak bu yoğunluktaki bir yonganın gerçek potansiyelini gösterebilmesi, dizüstü üreticilerinin termal kısıtlamaları ne kadar aşabileceğine bağlı olacak; aksi halde kağıt üzerindeki çekirdek sayısı yüksek ısı nedeniyle frekans kısılmasına takılabilir.",
    editorNote:
      "Intel'in 28 çekirdekli yeni Nova Lake-HX mobil işlemcisi, oyuncu dizüstü bilgisayarlarına masaüstü gücü taşımaya hazırlanıyor.",
    tags: ["Intel", "Nova Lake", "İşlemci", "Donanım", "Oyuncu Bilgisayarı"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/youtube-dislike-butonunu-tamamen-gizleyecek",    category: "İnternet",
    publishedAt: "2026-10-21T16:26:00.000Z",
    title: "YouTube, beğenmeme butonunu ana arayüzden kaldırıp menü altına gizliyor",
    summary:
      "YouTube, yıllar önce sayacını kapattığı beğenmeme (dislike) butonunu şimdi de video altındaki ana etkileşim şeridinden kaldırarak üç nokta menüsünün içine taşımayı test ediyor.",
    keyPoints: [
      "Beğenmeme butonu video altındaki ana çubuktan kaldırılıp ek seçenekler menüsüne taşınıyor.",
      "Değişiklik özellikle Shorts ve mobil video oynatıcı arayüzünü sadeleştirmeyi amaçlıyor.",
      "Olumsuz geri bildirimler öneri algoritmasını eğitmek için arka planda çalışmaya devam edecek.",
    ],
    body: [
      "Video platformu YouTube, daha önce herkese açık sayacını kaldırdığı beğenmeme (dislike) butonu için yeni bir arayüz değişikliğini devreye alıyor. Yapılan testlerde olumsuz oy düğmesinin video altındaki görünür şeritten tamamen çıkarıldığı ve 'Daha fazla' menüsü altına gizlendiği görüldü.",
      "Şirket bu adımla özellikle mobil ekranda ve Shorts akışında buton kalabalığını azaltmayı, aynı zamanda içerik üreticilerine yönelik organize olumsuz oy kampanyalarını tamamen kırmayı hedefliyor. Kullanıcılar bir içeriği beğenmediklerini belirtmek istediklerinde artık iki dokunuş yapmak zorunda kalacak.",
      "Öte yandan beğenmeme sinyali öneri algoritması için çalışmayı sürdürecek. Kullanıcı menü içinden 'Beğenmedim' veya 'İlgilenmiyorum' seçeneğine dokunduğunda, benzer içeriklerin ana sayfada çıkma olasılığı yine düşürülecek.",
      "Kullanıcı deneyimi tarafında ise tarayıcı eklentileriyle tahmini beğenmeme sayılarını takip eden izleyiciler, butonun ikinci plana atılmasıyla geri bildirim oranlarının ciddi biçimde düşeceğini savunuyor.",
    ],
    comment:
      "YouTube'un beğenmeme sayacını gizlemesinden sonra butonu da menü altına saklaması, platformda yanıltıcı veya düşük kaliteli videoları ilk bakışta ayırt etmeyi daha da zorlaştıracaktır. İçerik üreticilerini linç kampanyalarından korumak anlaşılır bir hedef olsa da, izleyicinin tek dokunuşla olumsuz geri bildirim verme hakkını zorlaştırmak öneri algoritmasının veri kalitesini de zayıflatabilir.",
    editorNote:
      "Sayacı yıllar önce gizlenen YouTube dislike butonu, yeni arayüz testiyle birlikte ana ekrandan tamamen kaldırılıp menü içine saklanıyor.",
    tags: ["YouTube", "Dislike", "Sosyal Medya", "İnternet", "Google"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/xbox-game-pass-sistemine-koklu-degisiklik-yolda",    category: "Oyun",
    publishedAt: "2026-10-21T16:22:00.000Z",
    title: "Xbox Game Pass abonelik paketlerinde bulut ve aile odaklı yeni dönem başlıyor",
    summary:
      "Microsoft, Xbox Game Pass abonelik katmanlarını yeniden yapılandırarak yalnızca bulut oyunculuğuna özel uygun fiyatlı paket ile çoklu kullanıcı paylaşımını birleştiren yeni seçenekler hazırlıyor.",
    keyPoints: [
      "Xbox Game Pass katmanları bulut odaklı uygun paket ve yeni paylaşım seçenekleriyle güncelleniyor.",
      "Konsol veya güçlü PC sahibi olmayan oyuncular için doğrudan TV ve mobil odaklı abonelik geliyor.",
      "İlk gün eklenen büyük bütçeli oyunların erişim katmanları yeniden tanımlanıyor.",
    ],
    body: [
      "Microsoft, milyonlarca oyuncunun kullandığı Xbox Game Pass abonelik sisteminde kullanıcı alışkanlıklarına göre şekillenen kapsamlı bir revizyona hazırlanıyor. Yeni yapıda konsol veya oyun bilgisayarı satın almadan yalnızca bulut üzerinden oyun oynamak isteyenler için bağımsız ve daha ekonomik bir katman öne çıkıyor.",
      "Akıllı televizyonlar, el konsolları ve mobil cihazlar üzerinden doğrudan yüksek grafikli oyunları çalıştıran Xbox Cloud Gaming altyapısı, sunucu kapasitesinin artırılmasıyla daha düşük gecikme ve daha yüksek çözünürlük desteği sunacak.",
      "Ayrıca aynı hane içinde birden fazla oyuncunun abonelik avantajlarını paylaşabilmesini kolaylaştıran esnek profil seçenekleri de masada bulunuyor. İlk gün kütüphaneye eklenen dev bütçeli yapımlar ise en üst abonelik katmanının temel ayrıcalığı olmaya devam edecek.",
      "Oyun fiyatlarının küresel ölçekte yükseldiği dönemde Microsoft'un abonelik katmanlarını farklı bütçelere göre çeşitlendirmesi, Game Pass ekosisteminin abone büyümesini yeniden hızlandırmayı hedefliyor.",
    ],
    comment:
      "Oyun donanımı maliyetlerinin hızla arttığı bir dönemde Microsoft'un Game Pass'i donanımdan bağımsız bir bulut paketine dönüştürmesi stratejik açıdan çok doğru bir hamle. Özellikle Türkiye gibi donanım fiyatlarının yüksek olduğu pazarlarda, yalnızca bir kontrolcü ve akıllı TV ile kütüphaneye erişebilmek abonelik sistemini yeniden en cazip seçenek haline getirebilir.",
    editorNote:
      "Konsol veya pahalı PC almadan yalnızca bulut üzerinden oyun oynamak isteyenler için daha uygun fiyatlı yeni Xbox Game Pass paketi yolda.",
    tags: ["Xbox", "Game Pass", "Microsoft", "Oyun", "Bulut Oyun"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/iphone-duo-acilinca-ipade-donusuyor-apple-uygulamalarinin-yeni-hali-belli-oldu",    category: "Mobil",
    publishedAt: "2026-10-21T16:18:00.000Z",
    title: "iPhone Duo açılınca iPad'e dönüşüyor: Apple uygulamalarının yeni arayüzü sızdı",
    summary:
      "Apple'ın katlanabilir modeli iPhone Duo açıldığında ekranın iPadOS benzeri çift sütunlu çoklu görev arayüzüne geçtiğini gösteren yeni uygulama tasarımları ortaya çıktı.",
    keyPoints: [
      "iPhone Duo iç ekranı açıldığında Apple uygulamaları otomatik olarak iPad düzenine geçiyor.",
      "Mesajlar, Mail, Notlar ve Safari yan yana çift panel ve yüzen pencere desteği kazanıyor.",
      "Kapak ekranından iç ekrana geçişte uygulamalar kaldığı yerden kesintisiz devam ediyor.",
    ],
    body: [
      "Apple'ın katlanabilir akıllı telefonu iPhone Duo için geliştirdiği özel arayüz mimarisi, cihazın yalnızca ekranı büyüyen bir telefon olmadığını, açıldığı anda kompakt bir iPad deneyimine dönüştüğünü ortaya koydu. Ortaya çıkan tasarım detaylarında yerleşik Apple uygulamalarının esnek ekran oranına göre anında yeniden şekillendiği görülüyor.",
      "Cihaz kapalıyken standart iPhone görünümünü koruyan Mail, Mesajlar, Dosyalar ve Notlar uygulamaları, iç ekran açıldığında sol tarafta kenar çubuğu ve sağ tarafta geniş içerik alanı sunan çift sütunlu iPad düzenine geçiyor.",
      "Çoklu görev tarafında ise iki farklı uygulamayı ekranı bölerek aynı anda kullanmak ve üçüncü bir uygulamayı yüzen pencere olarak üstte tutmak mümkün oluyor. Sürükle-bırak desteğiyle Safari'deki bir görseli veya metni yan penceredeki Notlar uygulamasına anında aktarmak standart hale geliyor.",
      "Apple'ın donanım tarafında geciken katlanabilir hamlesini yazılım uyumuyla telafi etme stratejisi, üçüncü parti uygulama geliştiricilerinin de mevcut iPad arayüzlerini iPhone Duo'ya kolayca uyarlamasını sağlayacak.",
    ],
    comment:
      "Android tarafındaki katlanabilir telefonların en büyük yumuşak karnı, pek çok uygulamanın hâlâ dev bir telefon ekranı gibi gerilerek çalışmasıydı. Apple'ın yıllardır oturmuş iPadOS uygulama ekosistemini doğrudan iPhone Duo'nun iç ekranına taşıması, katlanabilir telefonları ilk kez gerçek bir cep bilgisayarına dönüştürebilir.",
    editorNote:
      "iPhone Duo açıldığı anda iOS'tan iPadOS düzenine geçiyor; çift sütunlu uygulamalar ve sürükle-bırak çoklu görev ilk kez cebe giriyor.",
    tags: ["Apple", "iPhone Duo", "iPadOS", "iOS", "Katlanabilir Telefon"],
  },
  {
    source: "ShiftDelete",
    sourceUrl: "https://shiftdelete.net/honor-robot-phone-time-tarafindan-2026nin-en-iyi-icatlari-arasina-secildi",    category: "Mobil",
    publishedAt: "2026-10-21T16:14:00.000Z",
    title: "HONOR Robot Phone, TIME tarafından 2026'nın en iyi icatları arasına seçildi",
    summary:
      "HONOR'un hareketli gimbal kamera modülü ve otonom yapay zekâ etkileşimiyle dikkat çeken yenilikçi telefonu Robot Phone, TIME dergisinin 2026 En İyi İcatlar listesine girdi.",
    keyPoints: [
      "HONOR Robot Phone, TIME dergisinin 2026 Yılın En İyi İcatları listesinde ödüllendirildi.",
      "Gövdeden çıkan motorlu gimbal kamera, kullanıcıyı gerçek zamanlı takip ederek çekim yapıyor.",
      "Çok modlu yapay zekâ asistanı çevreyi görerek sesli ve görsel komutlara tepki veriyor.",
    ],
    body: [
      "Akıllı telefon tasarımlarının birbirine benzediği bir dönemde radikal form faktörüyle öne çıkan HONOR Robot Phone, TIME dergisinin her yıl hazırladığı 'En İyi İcatlar' listesinde 2026 yılının en dikkat çekici tüketici teknolojilerinden biri seçildi.",
      "Cihazın en çarpıcı özelliğini, arka gövdeden dışarı doğru açılan motorlu mikro-gimbal kamera mekanizması oluşturuyor. Bu hareketli modül, masa üstüne bırakıldığında kullanıcıyı odada otomatik olarak takip edebiliyor ve sarsıntısız profesyonel video kayıtları gerçekleştirebiliyor.",
      "Donanım yeniliği, cihaz üzerinde çalışan çok modlu yapay zekâ motoruyla destekleniyor. Kamera modülü yalnızca görüntü kaydetmekle kalmıyor; kullanıcının gösterdiği nesneleri analiz ediyor, el hareketlerini algılıyor ve küçük baş hareketleriyle görsel geri bildirim verebiliyor.",
      "Özellikle tek başına içerik üreten vlog çekimcileri ve görüntülü toplantı yapan profesyoneller için harici tripod ile gimbal ihtiyacını ortadan kaldıran bu tasarım, mobil donanımda robotik entegrasyonun ilk başarılı örneği olarak gösteriliyor.",
    ],
    comment:
      "Yıllardır sadece işlemci hızı ve sensör megapikseli yarışına sıkışan akıllı telefon pazarında, hareketli robotik kamerayı yapay zekâ görüşüyle birleştirmek gerçekten taze bir soluk. Mekanik parçaların uzun vadeli dayanıklılığı her zaman soru işareti olsa da, içerik üreticileri için harici gimbal taşımadan otomatik takip yapabilen bir telefon doğrudan pratik bir ihtiyacı çözüyor.",
    editorNote:
      "Gövdesinden çıkan robotik gimbal kamerasıyla kullanıcıyı takip eden HONOR Robot Phone, TIME'ın 2026 En İyi İcatlar listesine girdi.",
    tags: ["HONOR", "Robot Phone", "TIME", "Yapay Zeka", "Mobil"],
  },
  {
    source: "DonanımHaber",
    sourceUrl: "https://www.donanimhaber.com/watch-10-dan-gectim-ne-fark-etti-apple-watch-12-incelemesi--211835",    category: "Donanım",
    publishedAt: "2026-10-21T16:10:00.000Z",
    title: "Apple Watch 12 incelemesi: Watch 10'dan geçince pil ve ekranda neler değişti",
    summary:
      "Apple Watch Series 12, iki nesil önceki Watch 10 ile kıyaslandığında daha parlak geniş açılı OLED ekranı, geliştirilen sağlık sensörleri ve günlük kullanımda hissedilen pil verimliliğiyle öne çıkıyor.",
    keyPoints: [
      "Yeni S12 yongası enerji verimliliğini artırarak yoğun kullanımda günü daha rahat çıkarıyor.",
      "Eğik açılardan %40 daha parlak görünen ekran, güneş altında okunabilirliği belirgin biçimde artırıyor.",
      "Uyku apnesi ve kardiyovasküler sağlık takibi yeni sensör algoritmalarıyla daha hassas çalışıyor.",
    ],
    body: [
      "Akıllı saat kullanıcılarının en çok merak ettiği 'iki nesilde bir yükseltmeye değer mi' sorusu, Apple Watch Series 10'dan Series 12'ye geçiş deneyimiyle netlik kazandı. Tasarım çizgisi ince ve kavisli kasa yapısını korurken, asıl fark ekran parlaklığı ve iç donanım verimliliğinde ortaya çıkıyor.",
      "Yeni nesil geniş açılı LTPO OLED panel, bileğe tam karşıdan bakmadığınız anlarda bile yüksek parlaklık sunarak açık havada ve spor sırasında bildirim okunabilirliğini üst seviyeye taşıyor. İnce çerçeveler sayesinde saat kadranları kasa boyutu büyümeden daha ferah görünüyor.",
      "Donanım kalbindeki yeni işlemci mimarisi, arka plandaki sağlık ölçümlerini daha düşük güç tüketimiyle yürütüyor. Watch 10'da akşam saatlerinde kritik seviyeye inen batarya, Series 12'de her zaman açık ekran aktifken bile gece uyku takibine yeterli şarj bırakıyor.",
      "Hızlı şarj desteğiyle yalnızca 15 dakikalık dolumun sekiz saatlik uyku takibine yetmesi, saati gün boyu bileğinden çıkarmak istemeyen kullanıcılar için günlük rutini ciddi ölçüde kolaylaştırıyor.",
    ],
    comment:
      "Akıllı saatlerde her yıl model yenilemek çoğu kullanıcı için anlamlı bir fark yaratmıyor; ancak iki nesillik geçişlerde batarya ömrü ve ekran parlaklığındaki iyileşmeler doğrudan hissediliyor. Watch 10 kullanıcıları için en somut kazanım yeni bir tasarım değil, her zaman açık ekranı kapatmadan günü ve gece uyku takibini tek şarjla tamamlayabilmek.",
    editorNote:
      "Apple Watch 10'dan Series 12'ye geçişte tasarım aynı kalsa da açısal ekran parlaklığı ve pil verimliliği günlük kullanımı doğrudan değiştiriyor.",
    tags: ["Apple Watch 12", "Apple", "Akıllı Saat", "Donanım", "İnceleme"],
  },
  {
    source: "Technopat",
    sourceUrl: "https://www.technopat.net/2026/10/21/steam-linux-surumu-bastan-degisiyor/",    category: "Oyun",
    publishedAt: "2026-10-21T16:06:00.000Z",
    title: "Steam Linux sürümü baştan değişiyor: 32 bit dönemi resmen kapanıyor",
    summary:
      "Valve, Linux ve SteamOS ekosisteminde yıllardır kullanılan 32 bit istemci mimarisini geride bırakarak tamamen yerel 64 bit Steam istemcisine geçiş sürecini başlattı.",
    keyPoints: [
      "Steam'in Linux istemcisi eski 32 bit kütüphane bağımlılığından kurtularak tam 64 bit mimariye geçiyor.",
      "Klasik 32 bit oyunlar Proton ve uyumluluk katmanı sayesinde sorunsuz çalışmaya devam edecek.",
      "Yeni mimari Steam Deck ve Linux masaüstü sistemlerde daha hızlı açılış ve düşük bellek kullanımı sağlıyor.",
    ],
    body: [
      "PC oyunculuğunun en büyük platformu Steam, Linux ve SteamOS tarafında uzun süredir beklenen mimari dönüşümü hayata geçiriyor. Valve, istemcinin çekirdek yapısını eski 32 bit sistem kütüphanelerinden ayırarak tamamen yerel 64 bit mimariye taşıyan güncellemeyi devreye aldı.",
      "Bugüne kadar modern 64 bit Linux dağıtımlarında bile Steam istemcisini çalıştırmak için çok sayıda ek 32 bit paket kurulması gerekiyordu. Yeni mimariyle birlikte bu kurulum karmaşası sona ererken istemci arayüzü çok daha hızlı tepki veriyor.",
      "Oyuncuların en çok endişe ettiği eski 32 bit oyunların uyumluluğu ise Valve'ın kapsayıcı çalışma ortamı ve Proton katmanı sayesinde korunuyor. Yani istemci 64 bit olsa da kütüphanedeki klasik yapımlar hiçbir performans kaybı olmadan açılmaya devam ediyor.",
      "Bu köklü değişiklik, özellikle Steam Deck ve yeni nesil taşınabilir SteamOS cihazlarında hem sistem güncelleme boyutlarını küçültecek hem de arka plan bellek tüketimini azaltacak.",
    ],
    comment:
      "Linux oyunculuğunun Steam Deck ile yakaladığı ivme, yıllardır taşınan 32 bit istemci yükünü artık sürdürülemez hale getirmişti. Valve'ın eski oyun uyumluluğunu bozmadan istemciyi tam 64 bit mimariye geçirmesi, hem modern Linux dağıtımlarında kurulum zahmetini bitirecek hem de el konsollarında sistem kaynaklarını rahatlatacaktır.",
    editorNote:
      "Valve, Steam Deck ve Linux sistemlerde eski oyun uyumluluğunu bozmadan tam 64 bit Steam istemcisine geçişi başlattı.",
    tags: ["Steam", "Valve", "Linux", "Steam Deck", "Oyun"],
  },
  {
    source: "Webtekno",
    sourceUrl: "https://www.webtekno.com/football-manager-27-5-gun-boyunca-ucretsiz-oynanabilecek-h227662.html",    category: "Oyun",
    publishedAt: "2026-10-21T16:02:00.000Z",
    title: "Football Manager 27, 5 gün boyunca tüm oyunculara ücretsiz açılıyor",
    summary:
      "Futbol menajerlik serisinin yeni oyunu Football Manager 27, sınırlı süreli deneme etkinliği kapsamında 5 gün boyunca hiçbir ücret ödemeden indirip oynanabilecek.",
    keyPoints: [
      "Football Manager 27, 5 gün sürecek özel etkinlik boyunca ücretsiz deneyimlenebilecek.",
      "Deneme süresinde oluşturulan kariyer kayıtları tam sürüme geçildiğinde kaldığı yerden devam edecek.",
      "Yeni maç motoru ve yenilenen taktik ekranı tüm liglerle birlikte erişime açık olacak.",
    ],
    body: [
      "Futbol tutkunlarının her sezon yüzlerce saat harcadığı menajerlik simülasyonu Football Manager 27 için beklenen ücretsiz deneme takvimi duyuruldu. Oyuncular, beş gün boyunca oyunun tam sürümünü hiçbir kısıtlama olmadan bilgisayarlarına indirip kariyerlerine başlayabilecek.",
      "Etkinlik süresince serinin yenilenen grafik maç motoru, güncellenen transfer yapay zekâsı ve baştan tasarlanan kulüp yönetim panelleri eksiksiz olarak kullanılabilecek. Böylece oyunu satın almadan önce kendi sisteminizdeki performansını ve yeni arayüz akıcılığını test etmek mümkün olacak.",
      "Ücretsiz dönem boyunca kaydedilen tüm kariyer dosyaları bulut ve yerel depolamada korunacak. Etkinlik sonunda oyunu satın almaya karar veren menajerler, kurdukları kadroyu ve lig ilerlemelerini sıfırlamadan tam sürümde yoluna devam edebilecek.",
      "Kampanya süresince oyunun mağaza sayfasında özel bir indirim oranının da eşzamanlı olarak sunulması bekleniyor.",
    ],
    comment:
      "Menajerlik oyunlarında yeni maç motoru ve arayüz değişiklikleri oyuncuları her zaman ikiye böler. Satın alma kararı vermeden önce beş gün boyunca tam sürümü kendi kariyer kaydınızla deneyebilmek, özellikle yüksek oyun fiyatları karşısında oyuncular için kaçırılmayacak bir fırsat sunuyor.",
    editorNote:
      "Football Manager 27 beş gün boyunca ücretsiz açılıyor; üstelik kurduğunuz kariyer kaydı tam sürüme geçtiğinizde silinmiyor.",
    tags: ["Football Manager 27", "FM 27", "Ücretsiz Oyun", "Steam", "Oyun"],
  },
  {
    source: "Webtekno",
    sourceUrl: "https://www.webtekno.com/aya-super-bilgisayar-gonderiliyor-iste-bilgisayarin-tum-ozellikleri-h227647.html",    category: "Uzay",
    publishedAt: "2026-10-21T15:58:00.000Z",
    title: "Ay yüzeyine ilk süper bilgisayar gönderiliyor: Uzayda veri merkezi kurulacak",
    summary:
      "Ay görevlerinde toplanan devasa verileri Dünya'ya göndermeden yerinde işlemek için radyasyona dayanıklı yapay zekâ destekli süper bilgisayar modülü Ay yüzeyine fırlatılıyor.",
    keyPoints: [
      "Ay yüzeyinde otonom veri işleme ve yapay zekâ analizi yapacak ilk süper bilgisayar modülü hazırlanıyor.",
      "Radyasyon kalkanlı özel SSD ve düşük güç tüketimli işlemciler aşırı sıcaklık farklarına dayanacak.",
      "Gezgin araçların ve uyduların verileri Dünya'ya aktarılmadan saniyeler içinde Ay'da işlenecek.",
    ],
    body: [
      "Uzay araştırmalarında iletişim gecikmesini ve bant genişliği darboğazını ortadan kaldıracak tarihi bir donanım adımı atılıyor. Ay yüzeyine indirilecek yeni nesil süper bilgisayar modülü, uzay araçlarının topladığı yüksek çözünürlüklü sensör verilerini Dünya'ya göndermeye gerek kalmadan doğrudan Ay'da işleyecek.",
      "Kozmik radyasyon, vakum ortamı ve eksi 170 ile artı 120 derece arasında değişen aşırı sıcaklık farklarına dayanacak biçimde tasarlanan sistem, özel yalıtımlı katı hal sürücüleri ve hata düzeltmeli işlemci çekirdekleri barındırıyor.",
      "Yerleşik yapay zekâ modelleri sayesinde Ay yüzeyindeki krater haritalama, su buzu tespiti ve otonom iniş hesaplamaları gerçek zamanlı olarak yerinde gerçekleştirilecek. Dünya'ya yalnızca işlenmiş sonuç paketleri iletilerek iletişim hattındaki yük %90 oranında azaltılacak.",
      "Projenin başarılı olması halinde gelecekteki kalıcı Ay üsleri ve derin uzay görevleri için yörünge dışı veri merkezlerinin ilk altyapısı kurulmuş olacak.",
    ],
    comment:
      "Ay'da kalıcı üs kurma hedefi sadece roket ve yaşam modüllerinden ibaret değil; oradaki otonom robotların anlık karar verebilmesi için yerel bilgi işlem gücü şart. Veriyi Dünya'ya gönderip yanıt beklemek yerine Ay yüzeyinde süper bilgisayar çalıştırmak, uzay görevlerinde bulut bilişim çağını başlatacaktır.",
    editorNote:
      "Kozmik radyasyona ve aşırı sıcaklığa dayanıklı ilk süper bilgisayar modülü, uzay verilerini yerinde işlemek üzere Ay'a gönderiliyor.",
    tags: ["Uzay", "Ay", "Süper Bilgisayar", "Yapay Zeka", "Bilim"],
  },
];

// Vitrin için güvenli kapak: kaynak sitenin fotoğrafı ASLA kullanılmaz.
// Değerler Wikimedia Commons'ta serbest lisanslı (CC0 / kamu malı / CC BY /
// CC BY-SA) dosyalardır; atıf bilgisi `gorselKaynak` olarak habere yazılır.
// Eşleşme yoksa kategorinin doğrulanmış yedeği (`yedekGorsel`) kullanılır.
export const GUVENLI_KAPAK = new Map([
  [
    "https://www.ntv.com.tr/teknoloji/internetin-altyapisinda-kritik-acik-dunya-alarma-gecti-avrupada-devlet-siteleri-kapatildi,kritik-bgp-acigi-2026",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/Server_Rack_with_Spaghetti-Like_Mass_of_Network_Cables.jpg/1280px-Server_Rack_with_Spaghetti-Like_Mass_of_Network_Cables.jpg",
      yazar: "Kim Scarborough from Chicago, IL",
      lisans: "CC BY-SA 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Server_Rack_with_Spaghetti-Like_Mass_of_Network_Cables.jpg",
    },
  ],
  [
    "https://haberglobal.com.tr/spor/yunus-akgunden-lille-filelerine-tarihi-gol-2026-10-21",
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Besiktas_JK_-_Trabzonspor_match.jpg",
      yazar: "ayhang",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Besiktas_JK_-_Trabzonspor_match.jpg",
    },
  ],
  [
    "https://www.hurriyet.com.tr/ekonomi/cumhurbaskani-yardimcisi-yilmaz-2027-yili-butcesini-meclise-sundu-2026-10-21",
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/9/96/Turkish_lira.jpg",
      yazar: "jon smith from Stamford, England",
      lisans: "CC BY-SA 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Turkish_lira.jpg",
    },
  ],
  [
    "https://shiftdelete.net/iphone-duo-cikmadan-applea-kotu-haber-satis-tahminleri-asagi-cekildi",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/Foldable_smartphone_%28Android_Ice_Cream_Sandwich%29.jpg/1280px-Foldable_smartphone_%28Android_Ice_Cream_Sandwich%29.jpg",
      yazar: "The photo: Own work The logos: Google LLC",
      lisans: "CC BY 3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Foldable_smartphone_(Android_Ice_Cream_Sandwich).jpg",
    },
  ],
  [
    "https://shiftdelete.net/chatgpt-artik-sohbetleri-kilitlemenize-izin-veriyor",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/71/Mobile_phone_with_ChatGPT_on_yellow_background_%2852917075654%29.jpg/1280px-Mobile_phone_with_ChatGPT_on_yellow_background_%2852917075654%29.jpg",
      yazar: "Jernej Furman from Slovenia",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Mobile_phone_with_ChatGPT_on_yellow_background_(52917075654).jpg",
    },
  ],
  [
    "https://shiftdelete.net/intel-nova-lake-islemciler-28-cekirdekle-dizustu-bilgisayarlara-geliyor",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1d/Intel_C43201-5_chip_%2815597750510%29.jpg/1280px-Intel_C43201-5_chip_%2815597750510%29.jpg",
      yazar: "_brouhaha_",
      lisans: "CC BY-SA 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Intel_C43201-5_chip_(15597750510).jpg",
    },
  ],
  [
    "https://shiftdelete.net/youtube-dislike-butonunu-tamamen-gizleyecek",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Youtube_App_Startup.JPG/1280px-Youtube_App_Startup.JPG",
      yazar: "SCBY",
      lisans: "CC BY-SA 4.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Youtube_App_Startup.JPG",
    },
  ],
  [
    "https://shiftdelete.net/xbox-game-pass-sistemine-koklu-degisiklik-yolda",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/Xbox-One-Console-wController-FL.jpg/1280px-Xbox-One-Console-wController-FL.jpg",
      yazar: "Evan-Amos",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Xbox-One-Console-wController-FL.jpg",
    },
  ],
  [
    "https://shiftdelete.net/iphone-duo-acilinca-ipade-donusuyor-apple-uygulamalarinin-yeni-hali-belli-oldu",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/Foldable_smartphone_%28Android_Ice_Cream_Sandwich%29.jpg/1280px-Foldable_smartphone_%28Android_Ice_Cream_Sandwich%29.jpg",
      yazar: "The photo: Own work The logos: Google LLC",
      lisans: "CC BY 3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Foldable_smartphone_(Android_Ice_Cream_Sandwich).jpg",
    },
  ],
  [
    "https://shiftdelete.net/honor-robot-phone-time-tarafindan-2026nin-en-iyi-icatlari-arasina-secildi",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Romo_Smartphone_Robot_%2815021333117%29.jpg/1280px-Romo_Smartphone_Robot_%2815021333117%29.jpg",
      yazar: "Maurizio Pesce from Milan, Italia",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Romo_Smartphone_Robot_(15021333117).jpg",
    },
  ],
  [
    "https://www.donanimhaber.com/watch-10-dan-gectim-ne-fark-etti-apple-watch-12-incelemesi--211835",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Apple_Watch_Series_7%3B_January_2022_%2803%29.jpg/1280px-Apple_Watch_Series_7%3B_January_2022_%2803%29.jpg",
      yazar: "MIKI Yoshihito",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Apple_Watch_Series_7;_January_2022_(03).jpg",
    },
  ],
  [
    "https://www.technopat.net/2026/10/21/steam-linux-surumu-bastan-degisiyor/",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg/1280px-Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg",
      yazar: "Brian Wong",
      lisans: "CC BY-SA 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Gaming_PC-Setup_-_Astaroth-_The_Completed_System.jpg",
    },
  ],
  [
    "https://www.webtekno.com/football-manager-27-5-gun-boyunca-ucretsiz-oynanabilecek-h227662.html",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Hands_holding_video_game_controller_%2850811892858%29.jpg/1280px-Hands_holding_video_game_controller_%2850811892858%29.jpg",
      yazar: "Vu Hoang",
      lisans: "CC BY 2.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Hands_holding_video_game_controller_(50811892858).jpg",
    },
  ],
  [
    "https://www.webtekno.com/aya-super-bilgisayar-gonderiliyor-iste-bilgisayarin-tum-ozellikleri-h227647.html",
    {
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/When_NASA%E2%80%99s_SLS_%28Space_Launch_System%29_rocket_launches_the_agency%E2%80%99s_Artemis_II_mission_to_the_Moon%2C_four_CubeSats%2C_or_small_satellites%2C_will_be_hitching_a_ride_inside_the_rocket%E2%80%99s_Orion_stage_%28nasas-sls-rocket-secondary-payloads%29.jpg/1280px-thumbnail.jpg",
      yazar: "NASA/Kevin O’Brien",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:When_NASA%E2%80%99s_SLS_(Space_Launch_System)_rocket_launches_the_agency%E2%80%99s_Artemis_II_mission_to_the_Moon,_four_CubeSats,_or_small_satellites,_will_be_hitching_a_ride_inside_the_rocket%E2%80%99s_Orion_stage_(nasas-sls-rocket-secondary-payloads).jpg",
    },
  ],
  [
    "https://www.teknoblog.com/philips-iki-kavisli-qhd-monitorunu-tanitti/",
    {
      // "computer monitor" araması 1980'lerden kalma Atari bilgisayarını
      // getiriyordu; güncel bir monitör karesi elle sabitlendi.
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/24/Computer_monitor_samsung.jpg/1280px-Computer_monitor_samsung.jpg",
      yazar: "G4ming4lif3",
      lisans: "Kamu malı",
      sayfa: "https://commons.wikimedia.org/wiki/File:Computer_monitor_samsung.jpg",
    },
  ],
  [
    "https://www.bloomberght.com/trump-in-balo-salonunun-bagiscilari-ortaya-cikti-3791515",
    {
      // Arama "Facebook/Twitter post" görselini öne çıkarıyordu; portre daha uygun.
      url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Donald_Trump_by_Gage_Skidmore_12.jpg/1280px-Donald_Trump_by_Gage_Skidmore_12.jpg",
      yazar: "Gage Skidmore",
      lisans: "CC BY-SA 3.0",
      sayfa: "https://commons.wikimedia.org/wiki/File:Donald_Trump_by_Gage_Skidmore_12.jpg",
    },
  ],
]);

export function vitrinDoldur(articles) {
  const existingUrls = new Set(articles.map((a) => a.sourceUrl));
  let added = 0;
  for (const item of CURATED) {
    if (existingUrls.has(item.sourceUrl)) continue;
    const kapak = GUVENLI_KAPAK.get(item.sourceUrl) || yedekGorsel(item.category, item.sourceUrl);
    articles.unshift({
      id: makeId(item.sourceUrl),
      title: item.title,
      slug: slugify(item.title),
      summary: item.summary,
      keyPoints: item.keyPoints,
      body: item.body,
      comment: item.comment,
      editorNote: item.editorNote,
      tags: item.tags,
      category: item.category,
      image: kapak.url,
      gorselKaynak: atif(kapak),
      source: item.source,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      generatedAt: new Date().toISOString(),
      breaking: false,
    });
    added++;
  }

  articles.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  return { added };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = "data/articles.json";
  const articles = JSON.parse(readFileSync(file, "utf8"));
  const { added } = vitrinDoldur(articles);
  writeFileSync(file, JSON.stringify(articles, null, 2) + "\n", "utf8");
  console.log(`Eklendi: ${added} güvenli kapaklı vitrin haberi.`);
}
