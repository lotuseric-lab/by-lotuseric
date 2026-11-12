/* BY LOTUSERIC Pine front-end — lexical analysis only.
 * No code is executed by this module. Unsupported syntax is reported explicitly.
 * Copyright (c) BY LOTUSERIC project contributors.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByLotusericPineFrontend = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const OPERATORS = [
    "and", "or", "not", "=>", ":=", "==", "!=", "<=", ">=", "+=", "-=",
    "*=", "/=", "%=", "++", "--", "=", "+", "-", "*", "/", "%", "<", ">",
    "?", ":", ".", ",", ";", "(", ")", "[", "]", "{", "}"
  ].sort((a, b) => b.length - a.length);

  function lexPine(source) {
    const text = String(source == null ? "" : source).replace(/\r\n?/g, "\n");
    const tokens = [];
    const diagnostics = [];
    let i = 0, line = 1, column = 1;
    const push = (type, value, startLine, startColumn) =>
      tokens.push({ type, value, line: startLine, column: startColumn });

    while (i < text.length) {
      const ch = text[i];
      if (ch === " " || ch === "\t" || ch === "\f") {
        i++; column++; continue;
      }
      if (ch === "\n") {
        push("NEWLINE", "\n", line, column);
        i++; line++; column = 1; continue;
      }
      if (ch === "/" && text[i + 1] === "/") {
        const startLine = line, startColumn = column;
        let end = text.indexOf("\n", i);
        if (end < 0) end = text.length;
        const comment = text.slice(i, end);
        if (startLine === 1 && /^\/\/\s*@version\s*=\s*\d+/.test(comment)) {
          push("DIRECTIVE", comment.trim(), startLine, startColumn);
        }
        column += end - i; i = end; continue;
      }
      if (ch === "#") {
        const match = text.slice(i).match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])/);
        if (match) {
          const startLine = line, startColumn = column;
          push("STRING", "#" + match[1].toLowerCase(), startLine, startColumn);
          i += match[0].length; column += match[0].length;
          continue;
        }
      }
      if (ch === '"' || ch === "'") {
        const quote = ch, startLine = line, startColumn = column;
        let value = "", closed = false;
        i++; column++;
        while (i < text.length) {
          const c = text[i];
          if (c === "\n") break;
          if (c === quote) { i++; column++; closed = true; break; }
          if (c === "\\") {
            const next = text[i + 1];
            if (next === undefined || next === "\n") break;
            const escapes = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
            value += Object.prototype.hasOwnProperty.call(escapes, next) ? escapes[next] : next;
            i += 2; column += 2; continue;
          }
          value += c; i++; column++;
        }
        if (!closed) diagnostics.push({
          code: "PINE_LEX_UNTERMINATED_STRING",
          message: "Kapatılmamış metin dizgesi.",
          line: startLine, column: startColumn
        });
        push("STRING", value, startLine, startColumn);
        continue;
      }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(text[i + 1] || ""))) {
        const startLine = line, startColumn = column, start = i;
        if (text.slice(i, i + 2).toLowerCase() === "0x") {
          i += 2; column += 2;
          while (/[0-9a-f]/i.test(text[i] || "")) { i++; column++; }
        } else {
          while (/[0-9]/.test(text[i] || "")) { i++; column++; }
          if (text[i] === ".") {
            i++; column++;
            while (/[0-9]/.test(text[i] || "")) { i++; column++; }
          }
          if (/[eE]/.test(text[i] || "")) {
            const expStart = i, expColumn = column;
            i++; column++;
            if (/[+-]/.test(text[i] || "")) { i++; column++; }
            const digits = i;
            while (/[0-9]/.test(text[i] || "")) { i++; column++; }
            if (digits === i) { i = expStart; column = expColumn; }
          }
        }
        push("NUMBER", text.slice(start, i), startLine, startColumn);
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const startLine = line, startColumn = column, start = i;
        i++; column++;
        while (/[A-Za-z0-9_]/.test(text[i] || "")) { i++; column++; }
        const word = text.slice(start, i);
        push(word === "true" || word === "false" ? "LITERAL" : (word === "and" || word === "or" || word === "not") ? "OPERATOR" : "IDENTIFIER",
          word, startLine, startColumn);
        continue;
      }
      const op = OPERATORS.find(candidate => text.startsWith(candidate, i));
      if (op) {
        push("OPERATOR", op, line, column);
        i += op.length; column += op.length; continue;
      }
      diagnostics.push({
        code: "PINE_LEX_UNKNOWN_CHARACTER",
        message: "Desteklenmeyen karakter: " + ch,
        line, column
      });
      i++; column++;
    }
    tokens.push({ type: "EOF", value: "", line, column });
    return { tokens, diagnostics };
  }

  function analyzePineSource(source) {
    const result = lexPine(source);
    const tokens = result.tokens;
    const calls = Object.create(null);
    const namespaces = Object.create(null);
    for (let n = 0; n < tokens.length; n++) {
      if (tokens[n].type !== "IDENTIFIER") continue;
      let name = tokens[n].value, end = n;
      if (tokens[n + 1] && tokens[n + 1].value === "." &&
          tokens[n + 2] && tokens[n + 2].type === "IDENTIFIER") {
        name += "." + tokens[n + 2].value;
        end = n + 2;
      }
      if (tokens[end + 1] && tokens[end + 1].value === "(") {
        calls[name] = (calls[name] || 0) + 1;
        if (name.includes(".")) {
          const ns = name.split(".")[0];
          namespaces[ns] = (namespaces[ns] || 0) + 1;
        }
      }
    }
    const directive = tokens.find(t => t.type === "DIRECTIVE");
    const versionMatch = directive && directive.value.match(/@version\s*=\s*(\d+)/);
    const version = versionMatch ? Number(versionMatch[1]) : null;
    const errors = result.diagnostics.slice();
    if (version !== 5 && version !== 6) {
      errors.push({
        code: "PINE_VERSION_UNSUPPORTED",
        message: version == null
          ? "Pine sürümü belirtilmemiş. //@version=5 veya //@version=6 bekleniyor."
          : "Pine v" + version + " bu motorun hedef sürümleri arasında değil.",
        line: 1, column: 1
      });
    }
    const firstCall = name => !!calls[name];
    return {
      version,
      tokenCount: tokens.length - 1,
      calls,
      namespaces,
      requirements: {
        multiTimeframe: firstCall("request.security") || firstCall("request.security_lower_tf"),
        arrays: Object.keys(calls).some(k => k.startsWith("array.")),
        tables: Object.keys(calls).some(k => k.startsWith("table.")),
        labels: Object.keys(calls).some(k => k.startsWith("label.")),
        lines: Object.keys(calls).some(k => k.startsWith("line.")),
        boxes: Object.keys(calls).some(k => k.startsWith("box.")),
        plots: ["plot", "plotshape", "plotchar", "plotbar", "plotcandle"].some(firstCall),
        alerts: firstCall("alert") || firstCall("alertcondition"),
        loops: tokens.some(t => t.type === "IDENTIFIER" && (t.value === "for" || t.value === "while")),
        functions: tokens.some((t, n) => t.value === "=>" && n > 0)
      },
      diagnostics: errors
    };
  }

  return { lexPine, analyzePineSource };
});
