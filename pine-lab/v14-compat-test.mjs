import { readFile } from "node:fs/promises";
import { compile, Engine, ArrayFeed } from "@heyphat/piner";

const fixture = new URL("./fixtures/AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine", import.meta.url);
const source = await readFile(fixture, "utf8");
const startMs = 1_790_000_000_000;
const bars = Array.from({ length: 2400 }, (_, i) => {
  const wave = Math.sin(i / 7) * 2.5 + Math.sin(i / 19) * 1.2 + Math.sin(i / 43) * 0.8;
  const base = 100 + i * 0.012 + wave;
  const close = base + Math.sin(i / 3) * 0.45;
  return {
    time: startMs + i * 300_000,
    open: close - Math.sin(i) * 0.18,
    high: Math.max(base + 0.8, close) + 0.12,
    low: Math.min(base - 0.8, close) - 0.12,
    close,
    volume: 1000 + (i % 17) * 37 + Math.abs(Math.sin(i / 5)) * 300
  };
});

const count = (value) => {
  if (value instanceof Map || value instanceof Set) return value.size;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
};

const result = {
  fixture: "AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine",
  sourceBytes: Buffer.byteLength(source),
  sourceLines: source.split("\\n").length,
  bars: bars.length,
  timestampUnit: "Unix milliseconds",
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
  const drawings = engine.drawings;
  result.outputKeys = Object.keys(engine.outputs ?? {});
  result.plotCount = count(plots);
  result.markerSeriesCount = count(markers);
  result.drawingCount = count(drawings);
  result.securityRequests = engine.outputs?.securityRequests ?? [];
  result.alertEvents = engine.outputs?.alerts ?? [];
  result.plotDiagnostics = plots instanceof Map
    ? [...plots.values()].map(p => ({
        title: p.title,
        finiteValues: (p.data ?? []).filter(Number.isFinite).length,
        lastValue: [...(p.data ?? [])].reverse().find(Number.isFinite) ?? null
      }))
    : [];
  result.nonEmptyPlots = result.plotDiagnostics.filter(p => p.finiteValues > 0).length;
  result.hasExpectedMtfRequests = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "15"]
    .every(tf => result.securityRequests.some(r => r.timeframe === tf));
  result.assertions = {
    compilePassed: result.compile === "PASS",
    runtimePassed: result.run === "PASS",
    hasPlots: result.plotCount > 0,
    hasMtfRequests: result.hasExpectedMtfRequests
  };
  result.overall = Object.values(result.assertions).every(Boolean) ? "PASS" : "FAIL";
  console.log(JSON.stringify(result, null, 2));
  if (result.overall !== "PASS") process.exitCode = 1;
} catch (error) {
  result.compile = result.compile === "PASS" ? "PASS" : "FAIL";
  result.run = result.compile === "PASS" ? "FAIL" : "NOT_RUN";
  result.overall = "FAIL";
  result.error = {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack ?? null
  };
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
