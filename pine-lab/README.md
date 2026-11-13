# LOTUSERIC — isolated Pine engine evaluation

This folder is a **standalone technical evaluation only**. It is not imported by the main application, does not replace the existing Pine interpreter, and must not be merged into the live panel as-is.

## Why this is isolated

The candidate engine is `@heyphat/piner@0.13.0`. Its upstream repository declares **AGPL-3.0-only**. AGPL can impose source-disclosure obligations when covered software is conveyed or used to provide network access. Do not bundle, deploy, or integrate this package into the proprietary/live LOTUSERIC application without first obtaining appropriate legal advice or a separate commercial licence from the author.

Upstream: https://github.com/heyphat/piner

## Run the smoke test in an isolated Codespaces workspace

```sh
cd pine-lab
npm install
npm run smoke
```

The smoke test uses the interpreter backend and synthetic 5-minute OHLCV data. It checks compilation, execution, EMA plots and signal markers. A PASS is only a first technical check; it does not establish full TradingView compatibility.

## Evaluation gates

1. Smoke test passes on Node 18+.
2. Compare output against TradingView for the same symbol, timeframe and closed candles.
3. Add real indicator fixtures from the user's source pack, starting with basic plots, then if/else-if, arrays, drawing APIs and MTF.
4. Verify drawings stay aligned after chart pan, zoom, resize and mobile orientation changes.
5. Do not promote any candidate to the main panel until numeric and visual parity tests pass and licensing is resolved.

The main application and its existing Pine files are intentionally untouched by this experiment.
