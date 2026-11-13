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
const mapValues = (value) => value instanceof Map ? [...value.values()] : Array.isArray(value) ? value : [];
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const result = {
  fixture: "AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine",
  sourceBytes: Buffer.byteLength(source),
  sourceLines: source.split("\n").length,
  bars: bars.length,
  timestampUnit: "Unix milliseconds",
  compile: "PENDING",
  backends: {}
};

try {
  const compiled = compile(source);
  result.compile = "PASS";
  result.metadata = compiled.metadata ?? null;

  for (const backend of ["interp", "js"]) {
    const engine = new Engine(compiled, new ArrayFeed(bars), { backend });
    await engine.run({ symbol: "BTCUSDT", timeframe: "5" });
    const plots = mapValues(engine.outputs?.plots);
    const markers = mapValues(engine.outputs?.markers);
    const drawings = engine.drawings;
    result.backends[backend] = {
      run: "PASS",
      plotCount: count(engine.outputs?.plots),
      markerSeriesCount: count(engine.outputs?.markers),
      markerCount: markers.reduce((n, m) => n + (m.data ?? []).filter(Boolean).length, 0),
      drawingCount: count(drawings),
      securityRequests: engine.outputs?.securityRequests ?? [],
      alertCount: count(engine.outputs?.alerts),
      plotDiagnostics: plots.map(p => ({
        title: p.title,
        finiteValues: (p.data ?? []).filter(Number.isFinite).length,
        lastValue: [...(p.data ?? [])].reverse().find(Number.isFinite) ?? null
      })),
      outputs: engine.outputs
    };
  }

  const interp = result.backends.interp;
  const js = result.backends.js;
  const parity = {
    plots: sameJson([...compiledPlotData(interp.outputs)], [...compiledPlotData(js.outputs)]),
    markers: sameJson([...compiledMarkerData(interp.outputs)], [...compiledMarkerData(js.outputs)]),
    alerts: sameJson(interp.outputs.alerts, js.outputs.alerts),
    securityRequests: sameJson(interp.securityRequests, js.securityRequests),
    drawings: sameJson(interp.drawingCount, js.drawingCount)
  };
  result.backendParity = parity;
  result.hasExpectedMtfRequests = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "15"]
    .every(tf => interp.securityRequests.some(r => r.timeframe === tf));
  result.assertions = {
    compilePassed: result.compile === "PASS",
    interpRuntimePassed: interp.run === "PASS",
    jsRuntimePassed: js.run === "PASS",
    hasPlots: interp.plotCount > 0 && js.plotCount > 0,
    hasExpectedMtfRequests: result.hasExpectedMtfRequests,
    backendParityPassed: Object.values(parity).every(Boolean)
  };
  result.overall = Object.values(result.assertions).every(Boolean) ? "PASS" : "FAIL";
  delete result.backends.interp.outputs;
  delete result.backends.js.outputs;
  console.log(JSON.stringify(result, null, 2));
  if (result.overall !== "PASS") process.exitCode = 1;
} catch (error) {
  result.compile = result.compile === "PASS" ? "PASS" : "FAIL";
  result.overall = "FAIL";
  result.error = {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error),
    stack: error?.stack ?? null
  };
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}

function compiledPlotData(outputs) {
  return mapValues(outputs.plots).map(p => ({ id: p.id, title: p.title, data: p.data, colors: p.colors }));
}
function compiledMarkerData(outputs) {
  return mapValues(outputs.markers).map(m => ({ id: m.id, title: m.title, kind: m.kind, location: m.location, glyph: m.glyph, data: m.data }));
}
