# PineTS vs Resin — MONEY TRADER engine evaluation

Status: isolated research branch. No production/runtime switch has been made.

## Decision constraints

BY LOTUSERIC is a closed-source application delivered to users. A runtime must be evaluated for:
- Pine v5/v6 execution semantics and historical series behavior;
- drawing output and object lifecycle (line, box, label, linefill, table);
- separate panes for `overlay=false`;
- realtime bar updates / rollback behavior;
- request.security / multi-timeframe behavior;
- browser integration and mobile performance;
- license obligations for a distributed hosted application.

## Candidates

### Resin — best permissive-license runtime candidate
- Repository: https://github.com/nullarch/resin
- License: Apache-2.0.
- Current project page advertises v0.3.0, 10,311 tests, 5,000 generated scenarios checked bar-by-bar against a reference engine certified against TradingView, and matching TradingView exports for selected scenarios. These are project-reported claims, not our own independent verification.
- Compiler/runtime, not a charting library. It returns plot series and captured visualization data; BY LOTUSERIC must render those outputs.
- README currently documents Pine v5/v6, historical execution, series semantics, arrays/maps/matrices, request.security, and captured plot/drawing/table output.
- Important limitations: no realtime tick-by-tick recalculation; drawing/viz capture (`label`, `line`, `box`, `table`) is not included in the published TradingView differential verification; chart rendering is our responsibility; the same-symbol HTF aggregation path has a documented one-chart-bar delay; external feeds and symbol properties must be supplied by the host.
- Node 22.18+ is required for the source workflow described in its README.
- The current GitHub README and npm package listing have shown different snapshots/version states; pin an exact commit and verify package availability before integration.

### PineTS + Vela — best live-chart integration candidate
- Repository: https://github.com/LuxAlgo/PineTS
- PineTS is an AGPL-3.0 runtime with a commercial license option. BY LOTUSERIC must not ship it closed-source without a commercial license or a legal decision to comply with AGPL.
- Vela is an Apache-2.0 charting/workspace library with a public scripting-engine port. It supports panes, chart rendering, drawings and pluggable engines.
- Vela-PineTS is the official adapter and advertises streaming execution, visible-range execution, inputs and `request.security` feed resolution. However, the addon is also AGPL-3.0; same licensing gate applies.
- This is the most direct existing chart+Pine integration to prototype, but it is not automatically compatible with BY LOTUSERIC's current chart/data/UI.

### Vela — charting engine alternative
- Repository: https://github.com/luxalgo/vela
- License: Apache-2.0.
- Unlike PineTS/Resin, Vela is a chart renderer/workspace, not a Pine runtime. It can host an engine via its documented `ScriptingEngine` port.
- We can use Vela without Vela-PineTS and implement/plug Resin or a purpose-built engine against the port, avoiding AGPL in the charting layer.

## Updated recommendation
1. Prototype Vela + PineTS only in a disposable branch to measure the reference behavior and visual result; do not deploy it to BY LOTUSERIC until commercial licensing is confirmed.
2. In parallel, prototype Vela + Resin. Resin's permissive license is attractive, but its no-realtime and unverified drawing behavior must be closed before it can replace the current runtime.
3. If neither passes the actual MONEY TRADER fixtures, retain Vela's charting layer (or current chart) and build a Pine-compatible engine with a strict conformance suite. Do not claim full TradingView parity without bar-by-bar and pixel/geometry checks.

## Required benchmark corpus

Run the same closed OHLCV input, symbol metadata, timeframe and indicator inputs through each candidate. Compare against TradingView exports/screenshots from the same symbol/timeframe/date.

1. A minimal EMA/RSI plot fixture (baseline values and plot series).
2. MONEY TRADER ADX (including separate pane and DI plots).
3. MONEY TRADER Golden Rose and Sniper (signals, labels, levels).
4. MONEY TRADER Support/Resistance (line/box/linefill lifecycle and right/left extension).
5. MONEY TRADER Wizzard and Fibo Trade (drawing density and historical indexing).
6. MONEY TRADER SMART LINES v3, using the exact source file from the user's archive/library (must include table, signal labels, levels and any secondary pane). Do not substitute a different similarly named script.

For every fixture record:
- parse/compile success and unsupported API calls;
- numeric series parity (bar-by-bar, with an explicit tolerance);
- signal bar indexes and prices;
- drawing type, x/y coordinates, colors, styles, extend behavior and deletion;
- pane placement and scale;
- historical vs realtime behavior.

## Acceptance gates

- No engine is selected based on README claims or compile success alone.
- Any drawing or pane feature not tested against a TradingView reference is marked unverified.
- Do not silently approximate unsupported Pine behavior.
- Do not connect exchange order execution or enable automatic trading.
- Do not merge this experiment or deploy it to the main site without explicit approval.

## References
- Resin: https://github.com/nullarch/resin
- PineTS: https://github.com/LuxAlgo/PineTS
- PineTS license and chart integration: https://github.com/LuxAlgo/PineTS/blob/main/README.md
