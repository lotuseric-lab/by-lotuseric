# MONEY TRADER Pine kaynak denetimi

Kaynak: `🧨 TM Money Trader.zip` (74 arşiv girdisi; 50 adet Pine v5/v6 kaynak dosyası).

## Sayısal sonuç

- Pine v5: 25 dosya
- Pine v6: 25 dosya
- Gösterge kaynakları: 49
- Strategy kaynakları: 1 — gösterge motoru kapsamı dışında tutulacak
- Birebir aynı içerikli tek çift:
  - `MONEY TRADER - TAVAN ADAYI.txt`
  - `MONEY TRADER - TAVAN ADAYI (1).txt`
  - Her ikisinin SHA-256 değeri: `e885f7a559d3` ile başlıyor (tam hash kaynak ZIP'inden hesaplandı).
- Diğer dosyalar benzer ad/amaç taşısa bile ayrı kaynak olarak korunur.

## Kaynakların gösterdiği zorunlu yetenekler

| Özellik | Kaynak dosya sayısı |
|---|---:|
| label çizimleri | 50 |
| line çizimleri | 48 |
| alert / alertcondition | 40 |
| array | 34 |
| plot ailesi | 33 |
| table | 28 |
| box | 21 |
| request.security | 17 |
| döngüler | 36 |
| kullanıcı fonksiyonları | 27 |
| ta namespace | 50 |
| math namespace | 44 |

Bu sayılar regex tabanlı ilk envanterdir; tam AST/çağrı grafiği veya uyumluluk kanıtı değildir.

## Geliştirme sonucu

Basit bir EMA/RSI örneğini çalıştırmak yeterli olmayacak. Kaynak paketin gerçek gereksinimleri; seri geçmişi, fonksiyonlar, döngüler, diziler, çoklu zaman dilimi, çizgi/etiket/kutu/tablo nesneleri ve alarm koşullarıdır. Bu nedenle motor bu yetenekleri ayrı ayrı uygulayıp test edecek.

Strategy kaynağı, otomatik emir/strateji çalıştırma talebi olmadığı için indicator runtime'a taşınmayacak. ZIP arşivindeki orijinal dosyalar değiştirilmedi.
