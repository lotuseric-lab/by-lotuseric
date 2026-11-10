# By LOTUSERIC — Product Roadmap

Goal: build a responsive, installable, multi-exchange charting and analysis workspace inspired by the workflows traders value in TradingView. This is an independent product; it does not use TradingView's proprietary charting platform or promise exact Pine/TradingView parity.

## Product principles
- Public market data first. No exchange API keys are needed for public charts.
- No real order placement in this phase.
- Keep phone, tablet and desktop layouts usable.
- Preserve working features while each release is added and tested.
- Show data source, exchange, symbol, timeframe and connection state clearly.
- Avoid false claims: Pine compatibility is feature-by-feature, not full parity.

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

## Exchange adapter contract
Each adapter must normalize:
- exchange id and market category
- canonical symbol and exchange-native symbol
- instrument discovery and tradability state
- OHLCV candles (time in Unix seconds, numeric OHLCV, closed flag)
- ticker / last price
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
