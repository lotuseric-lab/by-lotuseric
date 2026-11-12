const fs = require("node:fs");
const path = require("node:path");
const htmlPath = path.join(process.cwd(), "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [];
const pattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = pattern.exec(html))) {
  const code = match[1];
  if (!code.trim()) continue;
  const before = html.slice(0, match.index);
  const line = before.split("\n").length;
  scripts.push({ code, line });
}
if (!scripts.length) throw new Error("No inline JavaScript blocks found in index.html");
for (let i = 0; i < scripts.length; i++) {
  try {
    new Function(scripts[i].code);
  } catch (error) {
    throw new Error("Inline script " + (i + 1) + " (HTML line " + scripts[i].line + "): " + error.message);
  }
}
console.log("Inline JavaScript syntax checks: OK (" + scripts.length + " blocks)");
