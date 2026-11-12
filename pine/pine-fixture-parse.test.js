const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");

for (const file of [
  "MONEY_TRADER_ADX.pine",
  "MONEY_TRADER_GOLDEN_ROSE.pine",
  "MONEY_TRADER_SNIPER.pine",
  "MONEY_TRADER_WIZZARD.pine",
  "MONEY_TRADER_FIBO_TRADE_ARCHIVE.pine",
]) {
  const source = fs.readFileSync(path.join(__dirname, "fixtures", file), "utf8");
  const lexical = lexPine(source);
  assert.deepEqual(lexical.diagnostics, [], file + " lexer diagnostics");
  const parsed = parsePine(lexical.tokens);
  assert.deepEqual(parsed.diagnostics, [], file + " parser diagnostics");
  assert.ok(parsed.body.length > 0, file + " must produce an AST");
}
console.log("MONEY TRADER fixture parse tests: OK");
