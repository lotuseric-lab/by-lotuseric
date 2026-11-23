# Smart Grid AI — Spot Engine

Bağımsız spot grid + hızlı al-sat araştırma ve paper-trading motoru.

## Onaylı çalışma kararları
- Hybrid AI: deterministik teknik analiz + makine öğrenmesi + haber LLM katmanı.
- Haber kapsamı: kripto haberleri, borsa duyuruları, makro takvim ve sosyal/sentiment.
- Karar yetkisi: guarded; ilk sürüm yalnızca paper trading.
- Yalnızca SPOT USDT pariteleri; perpetual/futures ve short yok.
- OKX, Binance, Bybit arasından tek aktif borsa seçilir.

## Başlangıç
- Mimari ve veri sözleşmeleri: [ARCHITECTURE.md](ARCHITECTURE.md)
- Bot envanteri: bots/registry.py
- Merkezi karar koordinatörü: ai/brain.py
- Eğitim ve model terfi güvenliği: ai/training.py
- Risk veto kapısı: core/risk.py

## İzolasyon
Bu dizin mevcut uygulama, ai-bot, ai-scanner ve pine dosyalarından bağımsızdır. Mevcut Supabase tabloları değiştirilmez. Yeni veriler için ayrı spot_grid/private şeması tasarlanacaktır.

## Güvenlik
Canlı emir adapter'ı V1'de bulunmaz. LLM tek başına karar veya emir üretemez. Grid ve Scalp ortak portföy/rezervasyon defteri kullanır. Komisyon, spread ve kayma sonrası net PnL izlenir.

## Test
spot-grid-ai dizininde:
python -m unittest discover -s tests -v
