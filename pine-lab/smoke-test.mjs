import { compile, Engine, ArrayFeed } from "@heyphat/piner";

const source = `//@version=6
indicator("LOTUSERIC Piner Smoke Test", overlay=true)
fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
plot(fast, title="EMA 9", color=color.aqua)
plot(slow, title="EMA 21", color=color.orange)
bull = ta.crossover(fast, slow)
bear = ta.crossunder(fast, slow)
plotshape(bull, title="LONG", style=shape.triangleup, location=location.belowbar, color=color.lime)
plotshape(bear, title="SHORT", style=shape.triangledown, location=location.abovebar, color=color.red)
`;

const bars = Array.from({ length: 240 }, (_, i) => {
  const base = 100 + i * 0.08 + Math.sin(i / 7) * 2.5 + Math.sin(i / 19) * 1.2;
  return {
    time: 1_790_000_000 + i * 300,
    open: base - 0.25,
    high: base + 0.8,
    low: base - 0.8,
    close: base + Math.sin(i / 3) * 0.45,
    volume: 1000 + (i % 17) * 37
  };
});

const compiled = compile(source);
const engine = new Engine(compiled, new ArrayFeed(bars), { backend: "interp" });
await engine.run({ symbol: "BTCUSDT", timeframe: "5" });

const plots = engine.outputs?.plots;
const plotCount = plots instanceof Map ? plots.size : Array.isArray(plots) ? plots.length : 0;
if (plotCount < 2) {
  throw new Error(`Beklenen en az 2 plot; alınan: ${plotCount}`);
}

console.log(JSON.stringify({
  status: "PASS",
  backend: "interp",
  bars: bars.length,
  plotCount,
  outputKeys: Object.keys(engine.outputs ?? {})
}, null, 2));
