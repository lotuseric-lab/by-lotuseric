import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const frontend = require("../pine/pine-frontend.js");
const parser = require("../pine/pine-parser.js");
const interpreter = require("../pine/pine-interpreter.js");

const fixturePath = new URL("./fixtures/AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine", import.meta.url);
const source = await readFile(fixturePath, "utf8");
const lexical = frontend.lexPine(source);
const report = {
  fixture: "AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine",
  sourceLines: source.split("\n").length,
  lexicalDiagnostics: lexical.diagnostics,
  parse: "PENDING",
  runtime: "NOT_STARTED",
  blockers: []
};

if (lexical.diagnostics.length) {
  report.parse = "FAIL";
  report.blockers.push(...lexical.diagnostics);
} else {
  try {
    const ast = parser.parsePine(lexical.tokens);
    report.astStatements = ast.body.length;
    if (ast.diagnostics?.length) {
      report.parse = "FAIL";
      report.blockers.push(...ast.diagnostics);
    } else {
      report.parse = "PASS";
      const bars = Array.from({ length: 2400 }, (_, i) => {
        const wave = Math.sin(i / 7) * 2.5 + Math.sin(i / 19) * 1.2 + Math.sin(i / 43) * 0.8;
        const base = 100 + i * 0.012 + wave;
        const close = base + Math.sin(i / 3) * 0.45;
        return {
          time: 1_790_000_000 + i * 60,
          open: close - Math.sin(i) * 0.18,
          high: Math.max(base + 0.8, close) + 0.12,
          low: Math.min(base - 0.8, close) - 0.12,
          close,
          volume: 1000 + (i % 17) * 37 + Math.abs(Math.sin(i / 5)) * 300
        };
      });
      try {
        const output = interpreter.runPine(ast, bars, { symbol: "BTCUSDT", timeframe: "1" });
        report.runtime = "PASS";
        report.output = {
          bars: output.barCount,
          plots: output.plots.length,
          shapes: output.shapes.length,
          labels: output.labels.length,
          boxes: output.boxes.length,
          tables: output.tables.length,
          alerts: output.alerts.length
        };
      } catch (error) {
        report.runtime = "FAIL";
        report.blockers.push({
          stage: "runtime",
          name: error?.name || "Error",
          code: error?.code || null,
          message: error?.message || String(error),
          line: error?.line || null,
          column: error?.column || null
        });
      }
    }
  } catch (error) {
    report.parse = "FAIL";
    report.blockers.push({
      stage: "parser",
      name: error?.name || "Error",
      code: error?.code || null,
      message: error?.message || String(error),
      line: error?.line || null,
      column: error?.column || null
    });
  }
}

report.overall = report.parse === "PASS" && report.runtime === "PASS" ? "PASS" : "FAIL";
console.log(JSON.stringify(report, null, 2));
if (report.overall !== "PASS") process.exitCode = 1;
