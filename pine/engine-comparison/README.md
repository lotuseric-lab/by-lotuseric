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


## Automated candidate smoke workflow

`.github/workflows/pine-engine-candidate-benchmark.yml` checks out the Resin repository, records its exact commit SHA, compiles every checked-in MONEY TRADER fixture, executes each fixture over 500 deterministic bars, and uploads the visualization JSON. This is an integration smoke test only: deterministic synthetic bars prove that the candidate runs and emits output, not that its numbers or drawings match TradingView.

The next gate is to run the same real OHLCV export through TradingView, Resin and PineTS/Vela and compare every bar. For SMART LINES v3, the exact source and matching TradingView data/export are required; similar indicator names are not substitutes.


## First measured findings (2026-11-12)

- Resin was checked out at commit `fa683a0ce81bf54832805f3e386c504c144d451a` in CI (Node 22.18.0).
- The first broad compile correctly failed on the known malformed `MONEY_TRADER_PROJEX.pine` extraction: Resin reported 6/7 compiled and pinpointed `unexpected indented block (L111:1)`. This fixture was already excluded from the previous interpreter fixture set because the Word extraction is damaged.
- After excluding only that damaged extraction, all six verified MONEY TRADER fixtures compiled, ran for 500 deterministic bars, and emitted visualization JSON. CI run: https://github.com/lotuseric-lab/by-lotuseric/actions/runs/43295490040
- The artifact contains plot outputs and captured drawing objects. The ADX fixture emitted 4 plots (DI+, DI-, ADX, RSI), 6 hlines, 1 fill, 3 shapes, and a table plus line/label drawings. Support/Resistance emitted line/label objects. This proves runtime execution and model capture, not chart parity.

### Critical screenshot-specific gap discovered

The user's reference ADX script declares `overlay=false` but uses `force_overlay=true` on price-chart labels, lines and plotshapes. A closer inspection of the actual Resin JSON artifact corrected the initial finding: Resin DOES preserve `forceOverlay: true` for plotshape outputs (and the plot output schema has a forceOverlay field). However, the captured `drawings[]` state records for `line.new` and `label.new` do NOT carry forceOverlay. Thus the specific remaining gap is drawing-object pane routing, not all visual outputs. A renderer can route the plotshapes to the main pane, but cannot yet reliably route the ADX line/label drawings there while leaving DI+/DI- in the indicator pane.

TradingView's official documentation confirms force_overlay applies to plot* outputs and drawing constructors. Resin's drawing-capture limitation is therefore a real compatibility gap for this source. PineTS/Vela can be used as a black-box behavior reference, but the PineTS + Vela-PineTS packages are AGPL-3.0 and require a commercial license or AGPL-compatible product distribution before shipping in BY LOTUSERIC.

### Strongest clean-room architecture to pursue

- Vela chart core/workspace: Apache-2.0, owns the canonical bars, pane routing, chart rendering and a public `ScriptingEngine` port.
- Resin runtime: Apache-2.0, adapted behind the Vela port, with a BY LOTUSERIC-owned patch for `force_overlay` metadata and other proven gaps.
- Live execution: do not advertise streaming until tick rollback / confirmed-bar semantics are implemented and tested. Start with deterministic historical runs; then implement a persistent session or safe full replay on ticks, followed by profiling.
- Keep the current Lightweight Charts page as a fallback until Vela + Resin passes visual acceptance on mobile.

This is not a claim of TradingView equivalence. It is the lowest-license-risk path to a stronger, testable Pine-compatible system. If Vela's integration cost or mobile performance fails, retain the current chart adapter and build the same runtime improvements behind it.


### Artifact-level force_overlay audit

The downloaded `resin-money-trader-smoke-results.zip` was inspected directly (not inferred from source code):
- `viz.plots[*].forceOverlay` exists; ordinary DI+/DI-/RSI plots are false.
- `viz.shapes[*].forceOverlay` exists; the MONEY TRADER ADX AL/SAT/DİP AL plotshapes are true.
- `viz.drawings[*].state` for captured line and label objects has no `forceOverlay` field in this Resin build. Example objects: line id 307 and label id 308.
This narrows the engineering task: preserve drawing-constructor `force_overlay` metadata through Resin's drawing capture and the chart adapter, while keeping existing plotshape routing intact. The earlier blanket statement that Resin did not preserve force_overlay was too broad and has been corrected.
