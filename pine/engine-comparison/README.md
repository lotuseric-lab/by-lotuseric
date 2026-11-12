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

### Resin — primary candidate for the first integration spike
- Repository: https://github.com/nullarch/resin
- License: Apache-2.0 (verify the exact release/tag and included notices before adoption).
- Compiler/runtime, not a charting library. It returns plot series and captured visualization data; BY LOTUSERIC must render those outputs.
- README currently documents Pine v5/v6, historical execution, series semantics, arrays/maps/matrices, request.security, and captured plot/drawing/table output.
- Explicit limitations documented by the project: no realtime tick-by-tick execution; drawings/viz are not included in its TradingView differential verification; polyline, linefill, alert and alertcondition are no-ops; external feeds/timezone/symbol metadata must be supplied by the host.
- Node 22.18+ is required for the source/CLI workflow described in its README.

### PineTS — secondary candidate / behavioral comparison
- Repository: https://github.com/LuxAlgo/PineTS
- License: AGPL-3.0 with a commercial licensing option. Because BY LOTUSERIC is a closed-source hosted app, do not ship PineTS unless legal review confirms the AGPL obligations are acceptable or a commercial license is obtained.
- Supports Pine v5/v6 execution, series/lookbacks, TA functions, MTF requests and live-streaming APIs according to its documentation.
- Its chart integration is a separate adapter/add-on; PineTS alone does not render a TradingView-like chart.

## Required benchmark corpus

Run the same closed OHLCV input, symbol metadata, timeframe and indicator inputs through each candidate. Compare against TradingView exports/screenshots from the same symbol/timeframe/date.

1. A minimal EMA/RSI plot fixture (baseline values and plot series).
2. MONEY TRADER ADX (including separate pane and DI plots).
3. MONEY TRADER Golden Rose and Sniper (signals, labels, levels).
4. MONEY TRADER Support/Resistance (line/box/linefill lifecycle and right/left extension).
5. MONEY TRADER Wizzard and Fibo Trade (drawing density and historical indexing).
6. MONEY TRADER SMART LINES v3, once its exact original Pine source is available (must include table, signal labels, levels and any secondary pane).

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
