import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".pine": "text/plain; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(4173, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto("http://127.0.0.1:4173/v14.html", { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200, "V14 lab page should load");
  await page.waitForFunction(() => document.querySelector("#run")?.disabled === false, null, { timeout: 30000 });
  await page.locator("#run").click();
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("V14 çalıştı"), null, { timeout: 120000 });

  const metrics = await page.evaluate(() => ({
    bars: Number(document.querySelector("#bars").textContent),
    plots: Number(document.querySelector("#plots").textContent),
    signals: Number(document.querySelector("#signals").textContent),
    drawings: Number(document.querySelector("#drawings").textContent),
    alerts: Number(document.querySelector("#alerts").textContent),
    tables: document.querySelectorAll("#tableOverlay table").length,
    tableRows: document.querySelectorAll("#tableOverlay tr").length,
    canvasHasInk: (() => {
      const canvas = document.querySelector("#chart");
      const ctx = canvas.getContext("2d");
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonBackground = 0;
      for (let i = 0; i < pixels.length; i += 4 * 97) {
        if (pixels[i] !== 10 || pixels[i + 1] !== 19 || pixels[i + 2] !== 32) nonBackground++;
      }
      return nonBackground > 100;
    })(),
    overlayInsideChart: document.querySelector(".chart-wrap").contains(document.querySelector("#tableOverlay")),
    overlayPosition: getComputedStyle(document.querySelector("#tableOverlay")).position,
    status: document.querySelector("#status").textContent
  }));

  assert.equal(metrics.bars, 2400, "expected all 2,400 bars");
  assert.ok(metrics.plots >= 3, "expected EMA plots");
  assert.ok(metrics.signals > 0, "expected marker signals");
  assert.ok(metrics.drawings > 0, "expected Pine drawing objects");
  assert.ok(metrics.alerts > 0, "expected alert events");
  assert.ok(metrics.tables > 0 && metrics.tableRows > 0, "expected rendered Pine table");
  assert.equal(metrics.overlayInsideChart, false, "table must not cover the chart canvas");
  assert.notEqual(metrics.overlayPosition, "absolute", "table must participate in normal layout");
  assert.ok(metrics.canvasHasInk, "chart canvas should contain rendered candles/plots/drawings");

  await page.locator("#toggleTable").click();
  assert.equal(await page.locator("#tableOverlay").evaluate(el => el.hidden), true, "table hide control should hide panel");
  await page.locator("#toggleTable").click();
  assert.equal(await page.locator("#tableOverlay").evaluate(el => el.hidden), false, "table show control should restore panel");
  assert.deepEqual(pageErrors, [], "browser must not emit uncaught page errors");

  console.log("V14 UI TEST PASS");
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
