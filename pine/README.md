# BY LOTUSERIC Pine Script uyumluluk motoru

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
