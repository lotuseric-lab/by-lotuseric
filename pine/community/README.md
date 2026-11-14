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
- Included coverage samples: Hull Moving Average (HMA), Ehlers Fisher Transform, and QQE.
- Upstream source paths:
  - `lib/trends_FIR/hma/hma.pine`
  - `lib/oscillators/fisher/fisher.pine`
  - `lib/oscillators/qqe/qqe.pine`

## Additional MPL-2.0 Pine v6 compatibility fixtures
- Volume Profile (Regard Hodler): `volume-profile-regard-hodler-v6.pine`
  - Source: https://github.com/regardhodler/tradingview-volume-profile/blob/master/volume-profile.pine
  - License: MPL-2.0 as declared in the source header; see `MPL-2.0.txt`.
  - Exercises: array bins, loops, while loops, box/line/label creation and deletion, barstate.islast.
- MTF Checklist Dashboard (EliasVictor): `mtf-checklist-eliasvictor-v6.pine`
  - Source: https://github.com/eliasvictor-trading/multi-time-frame/blob/main/matrix_v7.pine
  - License: MPL-2.0; see `MPL-2.0.txt`.
  - Exercises: `request.security`, tuple returns, dynamic timeframe loops, table operations, sessions, alerts, arrays and helper functions.
