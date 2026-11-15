# Community Pine compatibility corpus

This directory contains unmodified, publicly published Pine sources used as compatibility tests. Each source is accompanied by its license and provenance. Do not edit the source to make tests pass; fix the interpreter or classify a genuine source/runtime limitation.

## Smart Money Concepts Engine [Quantum Algo]
- Source: https://github.com/quantumalgo-official/smart-money-concepts-indicator/blob/main/smart-money-concepts.pine
- Upstream revision at import: `98b09b1c5c11acd55685dc6926a946212417531d`
- Pine version: v6
- License: MIT; see `QUANTUM-ALGO-LICENSE.txt`
- Copyright: Quantum Algo (2026)
- Features exercised: swing/internal pivots, BOS/CHoCH, order blocks, FVG/inversions, liquidity levels/sweeps, arrays of drawings, drawing mutation/deletion, table dashboard, inputs and alerts.

## QuanTAlib Pine v6 compatibility samples
- Upstream: https://github.com/mihakralj/QuanTAlib
- Documentation lists 447 self-contained Pine v6 scripts: https://github.com/mihakralj/QuanTAlib/blob/main/docs/pinescript.md
- License: Apache-2.0; see `QUANTALIB-APACHE-2.0.txt`
- Copyright headers retained in each unmodified script.
- Included coverage samples: Hull Moving Average (HMA), Ehlers Fisher Transform, QQE, OBV, VWAP, Bollinger Bands, and KAMA.
- Upstream source paths:
  - `lib/trends_FIR/hma/hma.pine`
  - `lib/oscillators/fisher/fisher.pine`
  - `lib/oscillators/qqe/qqe.pine`
  - `lib/volume/obv/obv.pine`
  - `lib/volume/vwap/vwap.pine`
  - `lib/volatility/bollinger-bands/bollinger-bands.pine`
  - `lib/trends_IIR/kama/kama.pine`

## Additional MPL-2.0 Pine v6 compatibility fixtures
- Volume Profile (Regard Hodler): `volume-profile-regard-hodler-v6.pine`
  - Source: https://github.com/regardhodler/tradingview-volume-profile/blob/master/volume-profile.pine
  - License: MPL-2.0 as declared in the source header; see `MPL-2.0.txt`.
  - Exercises: array bins, loops, while loops, box/line/label creation and deletion, barstate.islast.
- MTF Checklist Dashboard (EliasVictor): `mtf-checklist-eliasvictor-v6.pine`
  - Source: https://github.com/eliasvictor-trading/multi-time-frame/blob/main/matrix_v7.pine
  - License: MPL-2.0; see `MPL-2.0.txt`.
  - Exercises: `request.security`, tuple returns, dynamic timeframe loops, table operations, sessions, alerts, arrays and helper functions.

## Additional MIT Pine v6 compatibility fixture
- Volume Profile with POC / VAH / VAL (mervinj3546): `volume-profile-poc-vah-val-mervinj3546-v6.pine`
  - Source: https://github.com/mervinj3546/volume-profile
  - License: MIT, as declared in the upstream README; source attribution is retained in the fixture header.
  - Exercises: typed arrays and methods, loops/while, `request.security_lower_tf` tuple arrays, volume-at-price row distribution, POC and value-area expansion, box/line lifecycle.
  - Test context: 5-minute chart bars with supplied 1-minute intrabars; the fast profile mode is used by default, while the lower-timeframe request is still parsed and evaluated.

## Additional MIT Pine v6 compatibility fixture — FeelsStrategy
- Support and Resistance Zones [FEELS]: `support-resistance-zones-feelsstrategy-v6.pine`
- Source: https://github.com/VolodymyrFilias/feels-indicators
- License: MIT; exact upstream notice is preserved in `FEELS-INDICATORS-MIT-LICENSE.txt`.
- Copyright: © 2026 Volodymyr Filias (FeelsStrategy).
- Exercises: Pine v6 user-defined types (`Pivot`, `Zone`), typed UDT arrays, UDT methods/field mutation, function parameters with UDT types, nested loops, pivot confirmation, zone clustering, drawing-object lifecycle and alerts.
- Source file is retained unchanged; test harness asserts lexer/parser success and executes the original source against synthetic OHLCV data.


## Additional MIT Pine v6 compatibility fixtures — FeelsStrategy
- Liquidity Magnet: `liquidity-magnet-feelsstrategy-v6.pine`
  - Source: https://github.com/VolodymyrFilias/feels-indicators/blob/main/indicators/liquidity-magnet.pine
  - License: MIT; exact upstream notice in `FEELS-INDICATORS-MIT-LICENSE.txt`.
  - Exercises: UDT pools/history, nested UDT field mutation, typed arrays, timeframe-aware scoring, loops, drawing object lifecycle, historical tracking and table dashboard.
- Air Pocket Profile: `air-pocket-profile-feelsstrategy-v6.pine`
  - Source: https://github.com/VolodymyrFilias/feels-indicators/blob/main/indicators/air-pocket-profile.pine
  - License: MIT; exact upstream notice in `FEELS-INDICATORS-MIT-LICENSE.txt`.
  - Exercises: range-distributed volume profile, nested loops, array buffers, box/line/label pooling, color gradients, dashboard and anchor history.
- Both original Pine v6 sources are retained unchanged apart from the leading attribution comment; tests require clean lexing/parsing and execute them against synthetic OHLCV bars.


## Additional MIT Pine v6 compatibility fixtures — FeelsStrategy (continued)
- Power of Three: `power-of-three-feelsstrategy-v6.pine`
  - Source: https://github.com/VolodymyrFilias/feels-indicators/blob/main/indicators/power-of-three.pine
  - Exercises: accumulation/manipulation/distribution cycle detection, historical cycle statistics, stateful arrays and projected paths.
- Confluence Pivot Zones: `confluence-pivot-zones-feelsstrategy-v6.pine`
  - Source: https://github.com/VolodymyrFilias/feels-indicators/blob/main/indicators/confluence-pivot-zones.pine
  - Exercises: pivot clustering, confluence scoring, typed UDT/array state, cooldowns, zone drawings and entry signals.
- Both are MIT © Volodymyr Filias (FeelsStrategy); retain the shared upstream notice in `FEELS-INDICATORS-MIT-LICENSE.txt`. Original logic is unchanged; only the leading attribution comment is added.
