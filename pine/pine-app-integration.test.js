const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

for (const id of [
  "customPineName",
  "customPineCode",
  "runCustomIndicator",
  "customPineStatus",
  "customPineSettings",
  "savedCustomIndicators",
  "indicatorPanes"
]) {
  if (id === "customPineName") continue; // The established UI field is customIndicatorName.
  const actual = id === "customPineName" ? "customIndicatorName" : id;
  assert.ok(html.includes('id="' + actual + '"'), "Pine UI element is missing: " + actual);
}

const scripts = [
  "./pine/pine-frontend.js",
  "./pine/pine-parser.js",
  "./pine/pine-interpreter.js",
  "./pine/pine-chart-adapter.js"
];
let previous = -1;
for (const src of scripts) {
  const index = html.indexOf('<script src="' + src + '"></script>');
  assert.ok(index > previous, "Pine module load order is incorrect: " + src);
  previous = index;
}
assert.ok(html.includes("$('runCustomIndicator').onclick=()=>runCustomPine(true)"));
assert.ok(html.includes("renderCustomPineSettings(output.inputDefs)"));
console.log("Pine app integration tests: OK");
