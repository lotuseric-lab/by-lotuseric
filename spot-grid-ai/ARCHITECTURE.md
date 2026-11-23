# Smart Grid AI — ortak mimari

## Onaylanan kararlar
- AI: hybrid (teknik kurallar + ML + LLM).
- Haber kapsamı: all (kripto medyası, borsa duyuruları, makro takvim, sosyal/sentiment).
- Yetki: guarded. V1 yalnızca paper trading; canlı emir kapalı.
- Piyasa: yalnızca SPOT, aktif USDT pariteleri; short/perpetual/futures yok.
- Borsa: OKX, Binance veya Bybit arasından tek aktif borsa.

## Ortak karar akışı
1. Seçili borsanın salt-okunur adaptörü market metadata, ticker, order book ve OHLCV toplar.
2. Haber adaptörleri haberleri zaman, kaynak güveni, varlık ve olay türüyle normalize eder.
3. Scanner, Market Regime, Technical, Volume/Liquidity, Whale/Flow ve Anomaly botları ortak MarketSnapshot üzerinde analiz üretir.
4. HBR/News botu LLM ile haber özeti, etkilenen varlık ve olası etki sınıfı çıkarır. LLM emir veremez.
5. Grid ve Scalp/Exit stratejileri yalnızca yapılandırılmış öneri üretir.
6. AI Brain; bot sinyalleri, ML tahmini ve haber kanıtını birleştirir. Yetersiz uzlaşma veya eski veri varsa HOLD üretir.
7. Risk Engine zorunlu son kapıdır; veto edilemez. Portföy defteri aynı bakiyenin iki kez kullanılmasını engellemek için atomik rezervasyon yapar.
8. V1 Paper Broker; kısmi dolum, komisyon ve kaymayı simüle eder. Karar ve sonuçlar event ledger'a yazılır.
9. Performance/Learning botu sonuçları etiketler ve eğitim veri seti oluşturur. Model otomatik terfi etmez.

## Bot görevleri
| Bot | Görev | Emir yetkisi |
|---|---|---|
| HBR / News | Haber, borsa duyurusu, makro takvim, sosyal sentiment | Yok |
| Market Regime | Trend/range/volatilite rejimi | Yok |
| Spot Scanner | Tüm uygun aktif USDT spot çiftlerini keşfetme | Yok |
| Technical | Trend, momentum, çoklu zaman dilimi | Yok |
| Volume & Liquidity | Hacim, spread, derinlik, kayma | Yok |
| Whale / Flow | Büyük işlem ve sıra dışı akış gözlemi | Yok |
| Anomaly | Olağandışı hareket ve veri kalitesi | Yok |
| Grid | Dinamik grid seviyeleri önerisi | Öneri |
| Scalp / Exit | Kısa vadeli spot giriş/çıkış önerisi | Öneri |
| Portfolio | Ortak bakiye, pozisyon ve rezervasyon | Yetki kontrolü |
| Order Monitor | Emir/kısmi dolum mutabakatı | Paper V1 |
| Risk Engine | Günlük zarar, drawdown, coin/emir limitleri, acil durdurma | Veto |
| Performance & Learning | Net PnL, etiket, model değerlendirme | Yok |

## Hybrid AI katmanları
- Deterministic: teknik kurallar, piyasa filtreleri ve risk limitleri. Modelden bağımsız çalışır.
- ML: ilk aşamada LightGBM/XGBoost ile rejim, hedefe ulaşma olasılığı, volatilite ve kayma tahmini. Veri yeterliyse ileride PyTorch.
- LLM: haberleri özetler, varlık/olay çıkarır, etki sınıfı ve gerekçe üretir. Serbest metin emir parametresi olamaz.
- AI Brain: katmanların yapılandırılmış çıktısını birleştirir; düşük güven veya veri eskiliğinde HOLD.
- Risk Engine: AI Brain sonrasında ve emir adaptörü öncesinde zorunlu veto katmanı.

## Eğitilebilir AI yaşam döngüsü
1. Ham market/news verisi kaynak ve zaman damgasıyla saklanır.
2. Her karar için snapshot, bot çıktıları, model sürümü, özellikler, haber kimlikleri ve risk sonucu kaydedilir.
3. Sonuçlar komisyon + spread + kayma sonrası net PnL ile etiketlenir. Henüz kapanmamış işlemler etiketlenmez.
4. Eğitim verisi zaman sıralı train/validation/test bölünür. Gelecek verisinin geçmişe sızması yasaktır.
5. Aday model geçmiş test, walk-forward ve paper shadow testlerinden geçer.
6. Model sürümü, veri aralığı, metrikler ve checksum kaydedilir.
7. Otomatik terfi yoktur. İnsan onayı gerekir; kötüleşmede önceki sürüme rollback yapılır. Model risk limitlerini değiştiremez.

## Ortak veri sözleşmeleri
- MarketSnapshot: exchange, symbol, timestamp, bid/ask, spread, OHLCV, depth, fee assumptions.
- BotSignal: bot, symbol, BUY/SELL/HOLD, confidence, horizon, evidence, created_at, expiry.
- NewsEvent: source, published_at, fetched_at, symbols, event_type, sentiment, confidence, canonical_url, dedupe_key.
- DecisionRecord: signal IDs, model versions, decision, reason codes, risk verdict.
- OrderIntent: unique client ID, exchange, symbol, side, amount, limit price, strategy, reservation ID, paper/live.
- TradeOutcome: fills, fees, slippage, realized net PnL, label horizon.

## Güvenlik
- V1 yalnızca paper broker; canlı emir adapter'ı yok.
- API anahtarları frontend/loglara yazılmaz; withdrawal izni kapalı tutulur.
- Grid ve Scalp aynı serbest bakiyeyi iki kez kullanamaz.
- Günlük zarar, maksimum drawdown, coin başı sermaye, açık emir ve toplam maruziyet limitleri zorunludur.
- Bağlantı/veri sağlığı bozulursa yeni emirler durur; acil durdurma yeni emirleri engeller.
- Haber içeriği güvenilmeyen girdidir; içerikteki talimatlar yok sayılır.
- Eski public tablolarına dokunulmaz. Yeni veri ayrı spot_grid/private şemasında tasarlanır; RLS ve açık grant politikaları uygulanır. Service-role anahtarı yalnızca sunucuda kalır.

## Uygulama sırası
A. Ortak event sözleşmeleri + risk kapısı + bot registry.
B. Salt-okunur spot market ve haber toplayıcıları.
C. Ortak portföy/rezervasyon defteri + paper broker.
D. AI Brain ve karar günlüğü.
E. Outcome etiketleme + eğitim/evaluation pipeline.
F. Mobil panel, Telegram ve operasyon izleme.
