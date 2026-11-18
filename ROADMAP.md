# By LOTUSERIC — Product Roadmap

Goal: build a responsive, installable, multi-exchange charting and analysis workspace inspired by the workflows traders value in TradingView. This is an independent product; it does not use TradingView's proprietary charting platform or promise exact Pine/TradingView parity.

## Product principles
- Public market data first. No exchange API keys are needed for public charts.
- No real order placement in this phase.
- Keep phone, tablet and desktop layouts usable.
- Preserve working features while each release is added and tested.
- Show data source, exchange, symbol, timeframe and connection state clearly.
- Avoid false claims: Pine compatibility is feature-by-feature, not full parity.
- Spot and perpetual markets are analyzed separately; their risk and signal rules must not be mixed.

## Release plan

### Phase 1 — Workspace foundation
- Exchange selector and normalized market-data adapter.
- Initial public linear perpetual support: OKX, Binance USDⓈ-M Futures, Bybit linear.
- Market selector / symbol mapping per exchange.
- Independent chart panels with 1 / 2 / 4 chart layouts.
- Per-panel symbol and timeframe selection.
- Expand one panel to fullscreen and restore the layout.
- Persist workspace layout and panel selections locally.

### Phase 2 — Chart interaction
- Crosshair, zoom, pan, price/time scales.
- Drawing tools: horizontal/vertical line, trend line, ray, rectangle, text and measurement.
- Per-panel indicator overlays and lower indicator panes.
- Indicator settings, visibility, reorder and remove.
- Save/load chart templates globally and per symbol.

### Phase 3 — Indicator engine
- Built-in indicators: EMA/SMA/WMA, VWAP, Bollinger Bands, RSI, MACD, Stochastic, CCI, MFI, ATR, ADX, volume and OBV.
- Parameter controls and visual style controls.
- Multi-timeframe values with closed-candle confirmation options.
- Strategy/signal backtesting with explicit assumptions, fees and slippage.

### Phase 4 — Pine Studio
- Editor, syntax highlighting, save/open scripts, compile diagnostics.
- PineTS-based compatibility layer where supported.
- Implement and test common Pine v5/v6 constructs incrementally.
- Clearly report unsupported functions, drawing calls, request.security behavior and repainting differences.
- Never claim complete TradingView Pine compatibility unless proven by a conformance suite.

### Phase 5 — Alerts and workflow
- Price, indicator, cross and multi-timeframe alerts.
- Alert history, cooldowns and per-symbol rules.
- Foreground alerts first; reliable background/push/Telegram requires a secure relay service.
- Demo trade journal and replay tools; no live order execution by default.

### Phase 6 — AI analysis layer (new priority)
- Two-stage pipeline: indicator/source scan first, independent AI scoring second. The AI layer must not invent a signal when the source scan found none.
- Keep the AI decision settings in a dedicated panel with editable weights, minimum score and clear score explanations.
- Reference weighting from the supplied design: ADX trend strength 25%, RSI momentum 20%, volume participation 20%, signal consistency 15%, HTF/MTF alignment 10%. The supplied values total 90%; reserve the remaining 10% for ATR/volatility health so the scoring model totals 100%.
- Display a factor-by-factor score, positive/negative evidence, missing data, confidence, invalidation level and a concise Turkish explanation on every approved candidate.
- Separate "candidate", "watch", "confirmed" and "rejected" states. A high score is not a guarantee and must not be presented as a buy/sell instruction.
- Use closed candles for confirmation, record the candle timestamp and data source, and label provisional live-candle readings as provisional.
- Add a BTC/ETH market-regime check, liquidity/spread checks, volatility and abnormal-move filters, and duplicate/cooldown controls.
- Store every evaluated candidate, including rejected candidates, so later outcome analysis is not biased toward only successful alerts.
- Evaluate outcomes at 1h, 4h and 24h with fees/slippage assumptions; keep model training disabled until there is enough clean, labeled data and out-of-sample validation.

### Phase 7 — Spot opportunity scanner (new priority)
- Add spot as a separate market mode, not as a perpetual-market toggle over the same rules.
- Discover active spot instruments dynamically for each supported exchange; exclude inactive, delisted, leveraged-token and unsupported quote pairs.
- Configurable exchange, quote currency (default USDT), minimum 24h quote volume, maximum coin price (optional), scan limit and result count.
- Rank a "Top 6 spot candidates" list by liquidity, spread, trend, momentum, volume expansion, breakout quality, volatility health and broader BTC/market regime.
- Spot is long-only: no SHORT cards, leverage fields or perpetual funding logic. Show entry zone, invalidation/stop reference, staged target zones and estimated risk/reward only when the data supports them.
- Price ceiling is an optional preference filter, never a quality score; a low nominal coin price does not mean a coin is cheap or undervalued.
- Display the exchange-native pair, last price, 24h quote volume, spread, score, timeframe, signal age and the reason it ranked.
- Support both one-shot scans and an explicitly enabled foreground refresh loop; report stale data and partial exchange failures.

## AI scoring reference from the supplied UI
- ADX trend strength: 25
- RSI momentum: 20
- Volume participation: 20
- Signal consistency: 15
- HTF/MTF alignment: 10
- ATR / volatility health: 10 (added to close the 90-point gap in the reference weights)
- Default approval threshold: 70/100, adjustable by the user.
These are initial product defaults, not empirically validated trading parameters. They must be calibrated using logged outcomes and out-of-sample tests before being described as predictive.

## Exchange adapter contract
Each adapter must normalize:
- exchange id and market category (spot / linear perpetual)
- canonical symbol and exchange-native symbol
- instrument discovery and tradability state
- OHLCV candles (time in Unix seconds, numeric OHLCV, closed flag)
- ticker / last price
- 24h quote volume and best bid/ask or spread where available
- WebSocket subscription and reconnect behavior

## Initial exchange documentation
- OKX public market API: https://www.okx.com/docs-v5/en/
- Binance USDⓈ-M Futures klines: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data
- Binance Futures market streams: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams
- Bybit V5 kline: https://bybit-exchange.github.io/docs/v5/market/kline
- Bybit public linear WebSocket: https://bybit-exchange.github.io/docs/v5/websocket/public/kline

## Current known baseline
- OKX public USDT-linear SWAP list, candles and live candle updates.
- Responsive PWA shell.
- EMA 9/21/55 visibility controls.
- Basic EMA 9/21 + RSI 14 closed-candle signal panel.
- 1m / 5m / 15m / 1H / 4H trend snapshot.
- Local signal history.

This roadmap is a target, not a statement that unimplemented features already work.
