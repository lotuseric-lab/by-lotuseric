const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const htmlPath = path.resolve(process.argv[2] || path.join(process.cwd(), "ai-scanner", "index.html"));
const html = fs.readFileSync(htmlPath, "utf8");
const scripts = [];
const pattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = pattern.exec(html))) {
  const attrs = match[1] || "";
  const code = match[2];
  if (!code.trim()) continue;
  const before = html.slice(0, match.index);
  const line = before.split("\n").length;
  scripts.push({ code, line, attrs });
}
if (!scripts.length) throw new Error("No inline JavaScript blocks found in index.html");
for (let i = 0; i < scripts.length; i++) {
  try {
    if (/\btype\s*=\s*["']module["']/i.test(scripts[i].attrs || "")) {
      const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: scripts[i].code, encoding: "utf8" });
      if (checked.status !== 0) throw new Error((checked.stderr || checked.stdout || "Module syntax check failed").trim());
    } else {
      new Function(scripts[i].code);
    }
  } catch (error) {
    throw new Error("Inline script " + (i + 1) + " (HTML line " + scripts[i].line + "): " + error.message);
  }
}
console.log("Inline JavaScript syntax checks: OK (" + scripts.length + " blocks)");
