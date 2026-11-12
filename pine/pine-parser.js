/* BY LOTUSERIC Pine expression parser and statement AST builder.
 * Parsing only: this module never evaluates source code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByLotusericPineParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRECEDENCE = {
    "or": 1, "and": 2,
    "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3,
    "+": 4, "-": 4,
    "*": 5, "/": 5, "%": 5
  };
  const ASSIGNMENTS = new Set(["=", ":=", "+=", "-=", "*=", "/=", "%="]);

  class PineParseError extends Error {
    constructor(message, token) {
      super(message);
      this.name = "PineParseError";
      this.code = "PINE_PARSE_UNEXPECTED_TOKEN";
      this.line = token ? token.line : 1;
      this.column = token ? token.column : 1;
    }
  }

  class ExpressionParser {
    constructor(tokens, start, end) {
      this.tokens = tokens;
      this.index = start || 0;
      this.end = end == null ? tokens.length : end;
    }
    peek(offset) { return this.tokens[this.index + (offset || 0)] || null; }
    take() { return this.tokens[this.index++] || null; }
    match(value) {
      if (this.peek() && this.peek().value === value) { this.index++; return true; }
      return false;
    }
    expect(value) {
      if (!this.match(value)) throw new PineParseError("Beklenen '" + value + "'.", this.peek());
    }
    parse() {
      const expression = this.parseExpression(0);
      if (this.index < this.end) throw new PineParseError("İfade sonunda beklenmeyen token: " + this.peek().value, this.peek());
      return expression;
    }
    parseExpression(minPrecedence) {
      let left = this.parsePrefix();
      left = this.parsePostfix(left);
      while (this.index < this.end) {
        const token = this.peek();
        if (!token) break;
        if (token.value === "?" && minPrecedence <= 0) {
          this.take();
          const consequent = this.parseExpression(0);
          this.expect(":");
          const alternate = this.parseExpression(0);
          left = { type: "ConditionalExpression", test: left, consequent, alternate, loc: loc(token) };
          continue;
        }
        if (token.value === "=>" && minPrecedence <= 0) {
          this.take();
          const body = this.parseExpression(0);
          const params = left.type === "Identifier" ? [left] :
            left.type === "TupleExpression" ? left.elements : [left];
          left = { type: "ArrowFunctionExpression", params, body, loc: loc(token) };
          continue;
        }
        const precedence = PRECEDENCE[token.value];
        if (precedence == null || precedence < minPrecedence) break;
        this.take();
        const right = this.parseExpression(precedence + 1);
        left = { type: "BinaryExpression", operator: token.value, left, right, loc: loc(token) };
      }
      return left;
    }
    parsePrefix() {
      const token = this.take();
      if (!token) throw new PineParseError("İfade bekleniyordu.", null);
      if (token.type === "NUMBER") return { type: "NumericLiteral", value: Number(token.value), raw: token.value, loc: loc(token) };
      if (token.type === "STRING") return { type: "StringLiteral", value: token.value, loc: loc(token) };
      if (token.type === "LITERAL") return { type: "Literal", value: token.value === "na" ? null : token.value === "true", raw: token.value, loc: loc(token) };
      if (token.type === "IDENTIFIER") return { type: "Identifier", name: token.value, loc: loc(token) };
      if (token.value === "+" || token.value === "-" || token.value === "not") {
        return { type: "UnaryExpression", operator: token.value, argument: this.parseExpression(6), loc: loc(token) };
      }
      if (token.value === "(") {
        if (this.match(")")) return { type: "TupleExpression", elements: [], loc: loc(token) };
        const first = this.parseExpression(0);
        if (this.match(",")) {
          const elements = [first];
          do { elements.push(this.parseExpression(0)); } while (this.match(","));
          this.expect(")");
          return { type: "TupleExpression", elements, loc: loc(token) };
        }
        this.expect(")");
        return { type: "GroupExpression", expression: first, loc: loc(token) };
      }
      if (token.value === "[") {
        const elements = [];
        if (!this.match("]")) {
          do { elements.push(this.parseExpression(0)); } while (this.match(","));
          this.expect("]");
        }
        return { type: "ArrayExpression", elements, loc: loc(token) };
      }
      throw new PineParseError("İfade başında beklenmeyen token: " + token.value, token);
    }
    parsePostfix(base) {
      let node = base;
      while (this.index < this.end) {
        const token = this.peek();
        if (token.value === ".") {
          this.take();
          const property = this.take();
          if (!property || property.type !== "IDENTIFIER") throw new PineParseError("Nokta sonrasında alan adı bekleniyor.", property || token);
          node = { type: "MemberExpression", object: node, property: { type: "Identifier", name: property.value, loc: loc(property) }, computed: false, loc: loc(token) };
        } else if (token.value === "[") {
          this.take();
          const property = this.parseExpression(0);
          this.expect("]");
          node = { type: "MemberExpression", object: node, property, computed: true, loc: loc(token) };
        } else if (token.value === "(") {
          this.take();
          const args = [];
          if (!this.match(")")) {
            do {
              const key = this.peek();
              if (key && key.type === "IDENTIFIER" && this.peek(1) && this.peek(1).value === "=") {
                this.take();
                this.take();
                args.push({ type: "NamedArgument", name: key.value,
                  value: this.parseExpression(0), loc: loc(key) });
              } else {
                args.push(this.parseExpression(0));
              }
            } while (this.match(","));
            this.expect(")");
          }
          node = { type: "CallExpression", callee: node, arguments: args, loc: loc(token) };
        } else break;
      }
      return node;
    }
  }

  function loc(token) { return { line: token.line, column: token.column }; }

  function parsePine(tokens) {
    const body = [], diagnostics = [];
    let i = 0;
    while (i < tokens.length) {
      while (tokens[i] && (tokens[i].type === "NEWLINE" || tokens[i].type === "EOF" || tokens[i].type === "DIRECTIVE")) i++;
      if (i >= tokens.length || tokens[i].type === "EOF") break;
      const line = tokens[i].line, indent = tokens[i].column;
      let end = i;
      let depth = 0;
      while (end < tokens.length && tokens[end].type !== "EOF") {
        const t = tokens[end];
        if (t.value === "(" || t.value === "[" || t.value === "{") depth++;
        if (t.value === ")" || t.value === "]" || t.value === "}") depth--;
        if (t.type === "NEWLINE" && depth <= 0) break;
        end++;
      }
      const segment = tokens.slice(i, end);
      if (segment.length) {
        try {
          const first = segment[0];
          let node;
          if (first.value === "if" || first.value === "while") {
            const parser = new ExpressionParser(segment, 1);
            const test = parser.parse();
            node = { type: first.value === "if" ? "IfStatement" : "WhileStatement", test, body: [], alternate: [], loc: loc(first), indent };
          } else if (first.value === "for") {
            const inAt = segment.findIndex(t => t.value === "in");
            if (inAt < 2) throw new PineParseError("for döngüsü 'değişken in aralık' biçiminde olmalı.", first);
            const variable = segment[1];
            const iterable = new ExpressionParser(segment, inAt + 1).parse();
            node = { type: "ForStatement", variable: variable.value, iterable, body: [], loc: loc(first), indent };
          } else {
            const assignmentAt = segment.findIndex(t => ASSIGNMENTS.has(t.value));
            if (assignmentAt === 1 && segment[0].type === "IDENTIFIER") {
              const value = new ExpressionParser(segment, 2).parse();
              node = { type: "AssignmentStatement", operator: segment[1].value,
                target: { type: "Identifier", name: segment[0].value, loc: loc(segment[0]) },
                value, loc: loc(segment[0]), indent };
            } else if (segment.length > 1 && segment[0].type === "IDENTIFIER" &&
                       segment[1].type === "IDENTIFIER" && segment[2] && segment[2].value === "=") {
              const value = new ExpressionParser(segment, 3).parse();
              node = { type: "DeclarationStatement", qualifier: segment[0].value, name: segment[1].value,
                value, loc: loc(segment[0]), indent };
            } else {
              const expression = new ExpressionParser(segment, 0).parse();
              node = { type: "ExpressionStatement", expression, loc: loc(first), indent };
            }
          }
          body.push(node);
        } catch (error) {
          diagnostics.push({ code: error.code || "PINE_PARSE_ERROR", message: error.message,
            line: error.line || line, column: error.column || indent });
        }
      }
      i = end + (tokens[end] && tokens[end].type === "NEWLINE" ? 1 : 0);
    }
    return { type: "Program", body, diagnostics };
  }

  return { PineParseError, ExpressionParser, parsePine };
});
