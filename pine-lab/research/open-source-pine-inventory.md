# BY LOTUSERIC Pine v6 Engine — Open-source Research Inventory

> Research snapshot: 2026-11-13. This is an evaluation document, not an approval to copy code into the proprietary runtime. Each candidate must be checked at file level before reuse.

## Decision summary

Build the production Pine-compatible runtime as an independently maintained, proprietary BY LOTUSERIC component. Keep third-party code isolated behind adapters and preserve all required notices. Do not bundle AGPL/GPL code in the closed engine without a separate legal/licensing decision. No paid license is assumed.

## Candidate inventory

| Candidate | Verified license | What it can contribute | Decision |
|---|---|---|---|
| [mihakralj/pinescript](https://github.com/mihakralj/pinescript) | MIT; LICENSE blob `8206fff6321dc55bb412cb672f83fd46b21cd09f`; copyright Miha Kralj, 2025 | 416 Pine indicator sources across filters, momentum, oscillators, volatility, volume, trends, statistics and other families. README says sources are aligned to QuanTAlib and calls out warm-up/runtime behavior. | Best candidate for an indicator-by-indicator reference corpus. Select individual scripts only after source review, attribution retention, and numerical tests. |
| [VolodymyrFilias/feels-indicators](https://github.com/VolodymyrFilias/feels-indicators) | MIT; LICENSE blob `ddc9d6c3be2575e7fee8fc8f1031ae8236ce6ba5`; copyright Volodymyr Filias, 2026 | Pine v6 market-structure, liquidity, volume and support/resistance examples. README describes confirmed-pivot/no-repaint principles and bounded drawing pools. | Strong V14 reference for pivots, support/resistance, liquidity and drawing-object lifecycle. Verify each file and its repaint behavior. |
| [s7cret/pine2ast](https://github.com/s7cret/pine2ast) | MIT; LICENSE blob `e13518031f587c1eef69f1ae2dcc08cdd8840752`; copyright Interpipe Solutions, 2026 | Pine v5/v6 lexer/parser, AST JSON, static diagnostics and compatibility contracts. README explicitly says it does not execute Pine or emulate TradingView runtime. | Useful parser/AST architecture and test-corpus reference; not a runtime dependency decision. |
| [pineforge-4pass/pineforge-engine](https://github.com/pineforge-4pass/pineforge-engine) | Engine/native runner Apache-2.0; compiler is separately licensed under PineForge Source License 1.2 from v1.3.0 (commercial use requires a separate license). | C++17 execution/backtest engine, C ABI, and detailed compatibility/validation material. README claims a large parity corpus, but those figures are maintainer-reported and do not substitute for our V14 test. The public code generator is not Apache-2.0. | Research the Apache engine/runtime only; do not use the separately licensed compiler for our commercial app without permission and a commercial license. Runtime is Linux-focused and would need a substantial integration port to our browser/mobile chart stack. |
| [PyneSys/pynecore](https://github.com/PyneSys/pynecore) | Apache-2.0; repository README and pyproject identify Apache-2.0. | Python runtime with Pine-style bar-by-bar semantics, persistent variables, series history, `na`, and broad `ta.*` support. README says existing `.pine` files require the separate PyneComp service/API key for conversion; the runtime executes Pyne/Python-transformed scripts, not raw Pine text. | Strong independent semantic/reference test candidate, but not a drop-in raw Pine compiler. No paid conversion service assumed; manually translate a small V14 test fixture only if useful. |
| [heyphat/piner](https://github.com/heyphat/piner) | AGPL-3.0-only (verified LICENSE) | Existing Pine v5/v6 interpreter/transpiler; already used in isolated V14 evaluation harness. | Research/test oracle only for now. Do not ship inside closed-source BY LOTUSERIC without legal review or a separate license. |
| [LuxAlgo/PineTS](https://github.com/LuxAlgo/PineTS) | Dual AGPL-3.0 / commercial (previously verified) | Useful feature and edge-case reference for Pine execution semantics. | Do not make it a closed-runtime dependency under the current no-budget constraint. |

## V14 compatibility target

The untouched V14 fixture `pine-lab/fixtures/AL_ONAY_SCALP_V14_EREN_SAT_GUNCEL.pine` is the primary acceptance fixture. Required surface includes:

- `ta.atr`, `ta.barssince`, `ta.crossover`, `ta.crossunder`, `ta.dmi`, `ta.ema`, `ta.highest`, `ta.lowest`, `ta.pivothigh`, `ta.pivotlow`, `ta.roc`, `ta.rsi`, `ta.sma`
- `request.security` across 1–10 minute and 15 minute timeframes; lookahead/repaint behavior must be tested explicitly
- arrays and drawing lifecycle: `array.new_box`, `array.push/pop/shift/size`, `box.new/delete`, `label.new/delete`
- `table.new/cell/clear/merge_cells`, `plotshape`, `alertcondition`, `ticker.heikinashi`, typed inputs
- closed-bar signal confirmation and non-repainting mode as a separately testable behavior

The current Piner V14 evaluation previously compiled and ran 2,400 synthetic bars, producing EMA9/21/55 series, plot/marker/drawing outputs and MTF requests. This is a harness result only—not proof of TradingView parity, live OKX data, or browser rendering.

## Reuse and licensing gate

1. Record repository, exact path, immutable commit/blob SHA, author, license, and date for every reused source file.
2. Check the root license and any file-level header/license before copying.
3. MIT: retain copyright and permission notice in distributions containing the source or substantial portions.
4. Apache-2.0: include the license, retain applicable notices, and mark modified files prominently.
5. MPL-2.0: isolate and track covered files; modifications to MPL-covered files carry source-disclosure obligations when distributed.
6. GPL/AGPL: exclude from the proprietary engine unless counsel confirms a compliant architecture or a separate commercial license is obtained.
7. No license file or unclear provenance: reference only; do not copy.
8. Independently implement mathematical behavior where possible, then compare output against known-good reference vectors. Do not copy an implementation merely because it is publicly visible.

## Engineering sequence

1. Expand the V14 fixture into a per-feature acceptance matrix and identify exact unsupported constructs.
2. Add independent golden tests for TA functions and edge cases (warm-up, `na`, first bar, gaps, confirmed pivots).
3. Implement missing own-engine parser/runtime features in small isolated modules; do not replace the current engine wholesale.
4. Differential-test interpreter/transpiler outputs and our own runtime against deterministic fixtures.
5. Complete browser smoke tests for the preview renderer, including pan/zoom, markers, tables, drawings and error reporting.
6. Only after compatibility and licensing gates pass, package the proprietary runtime and implement BY LOTUSERIC entitlement checks.

## Product/IP boundary

The goal is a closed-source BY LOTUSERIC runtime with app-specific script execution and licensing. Client-side obfuscation or app checks cannot guarantee that code will never be extracted or reused. Stronger protection usually requires keeping critical execution server-side, which introduces hosting cost and availability dependencies. The no-paid-server constraint therefore means we should design a separable proprietary core, signed releases, license checks and reasonable tamper resistance without promising absolute copy prevention.

## Newly verified integration caveats (2026-11-13)

- PyneCore README and `pyproject.toml` were inspected at commit `1307d3381f29ffe822f0694d929838e6c9e117c3`; version `6.13.5`, Python 3.11+, core dependencies empty. Its runtime is Apache-2.0, but raw `.pine` conversion is handled by PyneComp, a separate API-key service. Therefore it does not solve free, local Pine-source compilation by itself. Its published TradingView parity figures are project claims; we should verify relevant functions and scripts independently.
- PineForge README and `LICENSE` were inspected at commit `a9c58cfa90db861ad559d4b5e48f79e5b6275e21`. The engine/native runner is Apache-2.0, but the compiler/codegen repository is separately source-available under PineForge Source License 1.2 for v1.3.0+ and requires a separate commercial license for commercial use. Do not assume the entire PineForge toolchain is Apache-2.0 or include the codegen in BY LOTUSERIC.
- PineForge advertises a Linux-focused engine and a C ABI. It could inform future native execution architecture, but it is not a ready-made browser/mobile runtime for our current UI.

## Sources checked

- https://github.com/mihakralj/pinescript
- https://github.com/mihakralj/pinescript/blob/main/LICENSE
- https://github.com/VolodymyrFilias/feels-indicators
- https://github.com/VolodymyrFilias/feels-indicators/blob/main/LICENSE
- https://github.com/s7cret/pine2ast
- https://github.com/s7cret/pine2ast/blob/main/LICENSE
- https://github.com/pineforge-4pass/pineforge-engine
- https://github.com/pineforge-4pass/pineforge-engine/blob/main/LICENSE
- https://github.com/pineforge-4pass/pineforge-engine/blob/main/docs/pine_v6_coverage_detail.md
- https://github.com/PyneSys/pynecore
- https://github.com/PyneSys/pynecore/blob/main/LICENSE
- https://github.com/heyphat/piner
- https://github.com/heyphat/piner/blob/main/LICENSE
- https://github.com/LuxAlgo/PineTS
