import { readFile } from "node:fs/promises";
import { compile, Engine, ArrayFeed } from "@heyphat/piner";

const fixture = new URL("./fixtures/AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine", import.meta.url);
const source = await readFile(fixture, "utf8");
const bars = Array.from({ length: 2400 }, (_, i) => {
  const wave = Math.sin(i / 7) * 2.5 + Math.sin(i / 19) * 1.2 + Math.sin(i / 43) * 0.8;
  const base = 100 + i * 0.012 + wave;
  const close = base + Math.sin(i / 3) * 0.45;
  return {
    time: 1_790_000_000 + i * 300,
    open: close - Math.sin(i) * 0.18,
    high: Math.max(base + 0.8, close) + 0.12,
    low: Math.min(base - 0.8, close) - 0.12,
    close,
    volume: 1000 + (i % 17) * 37 + Math.abs(Math.sin(i / 5)) * 300
  };
});

const result = {
  fixture: "AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine",
  sourceBytes: Buffer.byteLength(source),
  sourceLines: source.split("\n").length,
  bars: bars.length,
  compile: "PENDING",
  run: "PENDING"
};

try {
  const compiled = compile(source);
  result.compile = "PASS";
  result.metadata = compiled.metadata ?? null;
  const engine = new Engine(compiled, new ArrayFeed(bars), { backend: "interp" });
  await engine.run({ symbol: "BTCUSDT", timeframe: "5" });
  result.run = "PASS";
  const plots = engine.outputs?.plots;
  const markers = engine.outputs?.markers;
  const drawings = engine.ctx?.drawPool?.objects;
  result.outputKeys = Object.keys(engine.outputs ?? {});
  result.plotCount = plots instanceof Map ? plots.size : Array.isArray(plots) ? plots.length : 0;
  result.markerCount = markers instanceof Map ? markers.size : Array.isArray(markers) ? markers.length : 0;
  result.drawingCount = drawings instanceof Map ? drawings.size : Array.isArray(drawings) ? drawings.length : 0;
  result.securityRequests = engine.outputs?.securityRequests ?? [];
  result.alertEvents = engine.outputs?.alerts ?? engine.outputs?.alertEvents ?? null;
  result.plotDiagnostics = plots instanceof Map
    ? [...plots.values()].map(p => ({
        title: p.title,
        finiteValues: (p.data ?? []).filter(Number.isFinite).length,
        lastValue: [...(p.data ?? [])].reverse().find(Number.isFinite) ?? null
      }))
    : [];
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.compile = result.compile === "PASS" ? "PASS" : "FAIL";
  result.run = result.compile === "PASS" ? "FAIL" : "NOT_RUN";
  result.error = {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack ?? null
  };
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
