# BY LOTUSERIC Pine Script uyumluluk motoru

## Güncel çalışma durumu

- Pine v5/v6 lexer, parser ve bar-bar interpreter uygulamada çalışır; `timeframe.in_seconds()` ve timeframe dönüşümü desteklenir; `request.security` için yüksek zaman dilimi verisi mumlardan birleştirilir, düşük zaman dilimi verisi ise gerçek alt mumlar üzerinden değerlendirilir.
- `request.security` düşük zaman dilimi çağrısı, `lowerTimeframeData` / `securityLowerTfData` içindeki alt mumlardan her grafik mumunun son alt mumunu seçer. Veri yoksa tahmin üretmek yerine `PINE_MTF_DATA_REQUIRED` hatası verir.
- BY LOTUSERIC uygulaması, MTF kullanan Pine kodu daha yüksek zaman diliminde çalıştırıldığında 1 dakikalık kapanmış mumları OKX, Binance veya Bybit genel piyasa API'sinden alır; sembol/borsa bazında 60 saniyelik önbellek kullanır.
- Bağımsız topluluk uyumluluk korpusu: Quantum Algo SMC, QuanTAlib'den 7 örnek (HMA, Fisher, QQE, OBV, VWAP, Bollinger Bands, KAMA), Volume Profile (RegardHodler), POC/VAH/VAL Volume Profile (mervinj3546, MIT), MTF Checklist Dashboard ve FeelsStrategy'den 5 gösterge (S&R Zones, Liquidity Magnet, Air Pocket Profile, Power of Three, Confluence Pivot Zones; MIT). Bu 16 kaynak, kaynak kodları değiştirilmeden test edilir; bu sayı tüm Pine ekosisteminin desteklendiği anlamına gelmez.
- Güncel otomatik doğrulama: 900 sentetik 1 dakikalık mum üzerinde topluluk testleri; MTF paneli ayrıca 180 adet 5 dakikalık mum ve 900 adet 1 dakikalık alt mum ile çalıştırılır. Her yeni dil özelliği için regresyon testi eklenir.
- Harici sembol verisi, bütün Pine dil özellikleri, tüm borsa zaman dilimi kombinasyonları ve TradingView ile birebir sonuç eşitliği henüz tamamlanmış değildir. Desteklenmeyen veri/özellik açık hata üretmelidir.

Bu klasör, mevcut grafik motoruna dokunmadan geliştirilen bağımsız Pine uyumluluk katmanıdır.

## İlk aşama: kaynak ön yüzü

- `pine-frontend.js`: Pine kaynak kodunu token'lara ayırır; sürüm, fonksiyon/namespace çağrıları ve çizim/veri gereksinimlerini raporlar.
- `pine-frontend.test.js`: sözcüksel analiz, bozuk üs ve hata raporlama testleri.
- `pine-parser.js` / `pine-parser.test.js`: ifade AST katmanı ve temel parser regresyonları.
- `pine-runtime.js` / `pine-runtime.test.js`: `na`/`nz`, seri geçmişi, OHLCV bar bağlamı, `bar_index`, `var` kalıcılığı ve SMA/EMA/RMA başlangıç yardımcıları.

Bu aşama **Pine kodunu henüz çalıştırmaz**. Parser, tip/seri sistemi, bar-bar çalışma zamanı ve çizim adaptörü tamamlanmadan kodu çalıştırılmış gibi göstermeyeceğiz. Tanınmayan komutlar sessizce atlanmayacak.

## Uygulama sırası

1. Lexer ve kaynak analiz raporu.
2. Pine v5/v6 ifade ve statement parser'ı; AST ve satır/sütun hata konumları.
3. Seri/değer modeli: simple, input, series, na, geçmiş referansı `[n]`, bar yürütme sırası. (İlk temel yardımcılar eklendi; tam evaluator değil.)
4. Pine built-in fonksiyonları ve `ta`, `math`, `array`, `request` namespace katmanları.
5. plot/shape/char/bar/candle, line/label/box/table ve fill/hline çizim adaptörü.
6. Ayar girdileri, yeniden hesaplama, hata izolasyonu ve grafik entegrasyonu.
7. Kaynak ZIP'indeki her gösterge için TradingView karşılaştırmalı doğrulama.

## Kapsam ve güvenlik sınırları

- Mevcut Lightweight Charts grafiği korunur; bu klasör tek başına grafik arayüzünü değiştirmez.
- `strategy.*`, emir gönderme ve otomatik işlem Pine gösterge motorunun dışında tutulur.
- `request.security` gibi çoklu zaman dilimi çağrıları doğru veri bağlamı kurulmadan desteklenmiş sayılmaz.
- Kaynak kodun v5/v6 olması tek başına tam uyumluluk kanıtı değildir.
- Desteklenmeyen sözdizimi/komut için dosya adı, satır ve sütunla açık hata verilir.

## Kaynak paketi denetimi

`SOURCE_AUDIT.md` içinde ZIP envanteri ve özellik sayımları bulunur. İlk denetimde 50 Pine kaynağı (25 v5, 25 v6), 49 gösterge ve kapsam dışı bırakılan 1 strategy kaynağı bulundu. İki Tavan Adayı dosyasının SHA-256 değerleri birebir aynı; başka hiçbir kaynak yalnızca ad benzerliğine göre birleştirilmedi.

## Test

Node.js 20 veya üzeri ile:

```sh
node pine/pine-frontend.test.js
node pine/pine-parser.test.js
node pine/pine-runtime.test.js
```

GitHub Actions, bu klasördeki değişikliklerde üç test dosyasını da çalıştırır.

## Parser durumu

`pine-parser.js` ifade AST'sine ek olarak girinti tabanlı iç içe `if`/`while` blokları, çok satırlı parantezli ifadeler, kullanıcı fonksiyon bildirimi, `var float` ve temel tipli bildirimler, tuple destructuring, `for i = start to end by step`, `for x in collection`, `break` ve `continue` düğümlerini üretir. For-range başlangıç/bitiş/adım ifadeleri ayrı ayrı parse edilir.

Bu yine tam Pine parser değildir: `switch` yapısının tüm biçimleri, `else if` zincirleri, tüm tip/qualifier kombinasyonları, fonksiyonların çok satırlı gövdeleri, local block kuralları, tüm loop/tuple varyantları ve dilin sürüme özel semantiği eksiktir. Eksik sözdizimi desteklenmiş sayılmaz; parser testleri büyütülmeye devam eder.
\n\n### Yeni topluluk testi: POC / VAH / VAL Volume Profile\n\n- Kaynak: https://github.com/mervinj3546/volume-profile (MIT; upstream README lisans beyanı).\n- Test, orijinal Pine v6 kaynak kodunu değiştirmeden 5 dakikalık grafik + gerçek 1 dakikalık alt mum verisiyle çalıştırır.\n- Doğrulanan çıktılar: profil kutuları ve POC, VAH, VAL için üç seviye çizgisi.\n- Hacim-profili dağılımı mum/alt-mum verisinden tahminidir; borsa tick verisi değildir.\n
### Yeni topluluk testi: Support and Resistance Zones [FEELS]
- Kaynak: https://github.com/VolodymyrFilias/feels-indicators (MIT).
- Kaynak dosyası değiştirilmeden korpusa alındı; lisans bildirimi `pine/community/FEELS-INDICATORS-MIT-LICENSE.txt` içinde.
- Bu gösterge, UDT (`Pivot`, `Zone`), UDT dizileri, nesne alanı güncellemeleri, kümelendirme döngüleri ve çizim nesnesi havuzlaması için gerçek dünya uyumluluk testi.
- Derleme/çalıştırma başarısı CI tamamlanınca ayrıca raporlanacak; yalnızca kaynak eklenmesi uyumluluk kanıtı değildir.

### Yeni topluluk testleri: FeelsStrategy Liquidity Magnet ve Air Pocket Profile
- Her iki Pine v6 dosyası MIT lisanslı upstream depodan alındı; kaynak kodu değiştirilmedi, yalnızca dosyanın başına atıf yorumu eklendi.
- Liquidity Magnet testi UDT tabanlı likidite havuzları, geçmiş sonuç takibi ve çizim/panel çıktısını kapsar.
- Air Pocket Profile testi hacim dağıtımı, fiyat aralığı kutuları, POC/HVN çizimleri ve panel çıktısını kapsar.
- İki gösterge de lexer, parser ve sentetik OHLCV üzerinde gerçek interpreter çalıştırmasından geçmeden uyumlu sayılmaz.

### FeelsStrategy korpusunun genişletilmesi
- Power of Three ve Confluence Pivot Zones da MIT lisanslı orijinal Pine v6 kaynaklarıyla eklendi.
- Testler iki yeni dosyayı da lexer, parser ve gerçek interpreter yürütmesinden geçirir; yalnızca parse başarısı yeterli kabul edilmez.
