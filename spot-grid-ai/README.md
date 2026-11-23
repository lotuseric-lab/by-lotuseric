# Smart Grid AI — Spot Engine

Bağımsız spot grid botu çalışma alanı.

## Kapsam
- Yalnızca spot piyasalar ve USDT kotasyonlu aktif işlem çiftleri.
- Seçilebilir borsa: OKX, Binance, Bybit (tek seferde bir borsa).
- Dinamik grid + kısa vadeli fırsat analizi; ücret, spread ve kayma sonrası net kâr kontrolü.
- İlk aşamada yalnızca paper trading. Canlı emir varsayılan olarak kapalıdır.
- Her işlem için bakiye rezervasyonu, tekil emir kimliği, kısmi dolum ve yeniden başlatma sonrası mutabakat planlanır.

## İzolasyon
Bu dizin mevcut uygulama, `ai-bot`, `ai-scanner` ve `pine` dosyalarından bağımsızdır. Mevcut Supabase tabloları değiştirilmez.

## Geliştirme aşamaları
1. Salt okunur borsa adaptörleri ve spot parite keşfi.
2. Likidite, spread ve volatilite filtreleri.
3. Ücret duyarlı grid stratejisi ve paper emir simülatörü.
4. Risk limitleri, kalıcı emir günlüğü ve yeniden başlatma mutabakatı.
5. Testler, mobil panel ve ayrı canlı işlem güvenlik kilidi.

> Uyarı: Grid stratejileri kâr garantilemez. Sert düşüşte varlık birikimi ve gerçekleşmemiş zarar oluşabilir.
