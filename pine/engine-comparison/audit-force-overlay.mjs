import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
const viz = JSON.parse(fs.readFileSync(file, "utf8"));
const shapes = viz.shapes || [];
const drawings = viz.drawings || [];
const forcedShapes = shapes.filter(x => x.forceOverlay === true).length;
const lineDrawings = drawings.filter(x => x.kind === "line");
const labelDrawings = drawings.filter(x => x.kind === "label");
const drawingForceOverlayCount = [...lineDrawings, ...labelDrawings]
  .filter(x => Object.hasOwn(x.state || {}, "forceOverlay")).length;

if (forcedShapes === 0) {
  throw new Error("Expected forceOverlay=true plotshape output in MONEY_TRADER_ADX fixture.");
}
if (drawingForceOverlayCount !== 0) {
  throw new Error("Resin drawing forceOverlay behavior changed; review and update the compatibility audit.");
}
const report = [
  "# Resin force_overlay fixture audit",
  "",
  `- Source: ${path.basename(file)}`,
  `- Script overlay: ${viz.overlay}`,
  `- plotshape outputs with forceOverlay=true: ${forcedShapes}`,
  `- line drawing objects: ${lineDrawings.length}`,
  `- label drawing objects: ${labelDrawings.length}`,
  `- line/label drawing states carrying forceOverlay: ${drawingForceOverlayCount}`,
  "",
  "Interpretation: plotshape routing metadata is preserved; line.new/label.new drawing routing metadata is not present in this Resin artifact.",
].join("\n");
fs.writeFileSync("benchmark-output/force-overlay-audit.md", report + "\n");
console.log(report);
