import assert from "node:assert/strict";
import test from "node:test";
import { compileVisualExpression } from "./visual-expression.ts";

function compile(source) {
  const expression = compileVisualExpression(source);
  assert.ok(expression, `expected ${JSON.stringify(source)} to compile`);
  return expression;
}

function evaluate(source, values = {}) {
  return compile(source)(values);
}

test("evaluates calculator expressions from slider values", () => {
  const calculator = compile("clamp(slider, 0, 100) * scale + offset");
  assert.equal(calculator({ slider: 42, scale: 2, offset: 1 }), 85);
  assert.equal(calculator({ slider: -10, scale: 2, offset: 1 }), 1);
  assert.equal(calculator({ slider: 150, scale: 0.5, offset: -2 }), 48);
});

test("reuses one compiled expression across value updates", () => {
  const expression = compile("x * 2 + 1");
  assert.equal(expression({ x: 1 }), 3);
  assert.equal(expression({ x: 4 }), 9);
  assert.equal(expression({ x: 4 }), 9);
});

test("renders strings, booleans, and fixed decimals", () => {
  const display = compile(
    "enabled ? name + ': ' + fixed(value, 1) : 'disabled'",
  );
  assert.equal(
    display({ enabled: true, name: "Speed", value: 12.34 }),
    "Speed: 12.3",
  );
  assert.equal(
    display({ enabled: false, name: "Speed", value: 12.34 }),
    "disabled",
  );
  assert.equal(evaluate("enabled && 'Enabled'", { enabled: true }), "Enabled");
  assert.equal(evaluate("enabled && 'Enabled'", { enabled: false }), false);
  assert.equal(evaluate("name || 'unnamed'", { name: "" }), "unnamed");
  assert.equal(evaluate("!enabled", { enabled: false }), true);
  assert.equal(evaluate("'M ' + x + ' ' + y", { x: 10, y: 0.5 }), "M 10 0.5");
});

test("short-circuits logical and conditional branches", () => {
  assert.equal(evaluate("true ? 7 : 1 / 0"), 7);
  assert.equal(evaluate("false ? 1 / 0 : 'fallback'"), "fallback");
  assert.equal(evaluate("false && (1 / 0)"), false);
  assert.equal(evaluate("true || (1 / 0)"), true);
  assert.equal(evaluate("missing || 'default'"), "default");
  assert.equal(evaluate("missing && 'default'"), undefined);
});

test("uses ordinary numeric precedence and strict comparisons", () => {
  const cases = [
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["2 ** 3 ** 2", 512],
    ["-2 ** 2", -4],
    ["2 ** -2", 0.25],
    [".5 + 1e2", 100.5],
    ["10 % 4", 2],
    ["1 < 2 == true", true],
    ["1 == '1'", false],
    ["1 === 1", true],
    ["1 !== '1'", true],
    ["!false", true],
    ["true && false || true", true],
    ["false || true && false", false],
    ["false ? 1 : true ? 2 : 3", 2],
  ];
  for (const [source, expected] of cases) {
    assert.equal(evaluate(source), expected, source);
  }

  const range = compile("x >= 0 && x <= 10 ? 'in range' : 'outside'");
  assert.equal(range({ x: 5 }), "in range");
  assert.equal(range({ x: 11 }), "outside");
});

test("supports the math allow-list and explicit constants", () => {
  const cases = [
    ["abs(-3)", 3],
    ["min(4, 2, 8)", 2],
    ["max(4, 2, 8)", 8],
    ["clamp(12, 0, 10)", 10],
    ["round(2.6)", 3],
    ["floor(2.9)", 2],
    ["ceil(2.1)", 3],
    ["sqrt(81)", 9],
    ["pow(2, 10)", 1024],
    ["sin(pi / 2)", 1],
    ["cos(0)", 1],
    ["tan(0)", 0],
    ["log(e)", 1],
    ["exp(0)", 1],
    ["fixed(1.23456, 2)", "1.23"],
    ["fixed(1.5, 9)", "1.500000"],
    ["fixed(1.5, -2)", "2"],
    ["fixed(1.5, 2.9)", "1.50"],
  ];
  for (const [source, expected] of cases) {
    assert.equal(evaluate(source), expected, source);
  }
});

test("supports quoted strings with simple escapes", () => {
  assert.equal(evaluate("'it\\'s' + \"\\t\" + \"ok\""), "it's\tok");
  assert.equal(evaluate("'x' + 2 + true"), "x2true");
  assert.equal(evaluate("true + '!'"), "true!");
});

test("uses only exact own data properties", () => {
  const inherited = Object.create({ x: 5 });
  inherited.y = 2;
  assert.equal(evaluate("x", inherited), undefined);
  assert.equal(evaluate("y", inherited), 2);

  const nullPrototype = Object.create(null);
  nullPrototype.x = 3;
  assert.equal(evaluate("x", nullPrototype), 3);

  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "x", {
    enumerable: true,
    get() {
      reads++;
      return 4;
    },
  });
  assert.equal(evaluate("x", accessor), undefined);
  assert.equal(reads, 0);
});

test("rejects prototype-shaped identifiers", () => {
  for (const name of [
    "__proto__",
    "prototype",
    "constructor",
    "toString",
    "hasOwnProperty",
  ]) {
    assert.equal(compileVisualExpression(name), undefined, name);
  }

  const values = {};
  Object.defineProperty(values, "constructor", { value: 7 });
  assert.equal(compileVisualExpression("constructor"), undefined);
});

test("rejects malformed and disallowed syntax", () => {
  const invalid = [
    "",
    "   ",
    "1 +",
    "(1 + 2",
    "1 2",
    "x.y",
    "x[0]",
    "x = 1",
    "x++",
    "alert(1)",
    "Math.abs(1)",
    "abs.call(null, 1)",
    "1; 2",
    "1, 2",
    "'unterminated",
    '"bad\\q"',
    "true ? 1",
    "true ? 1 :",
    "x &&",
    "()",
    "abs()",
    "abs(1, 2)",
    "clamp(1, 2)",
    "min()",
    "unknown(1)",
    "min(1,2,3,4,5,6,7,8,9)",
    "new Date()",
    "x => x",
    "1 // 2",
  ];
  for (const source of invalid) {
    assert.equal(compileVisualExpression(source), undefined, source);
  }
});

test("rejects oversized, overly deep, and token-heavy sources", () => {
  assert.equal(compileVisualExpression(" ".repeat(257) + "1"), undefined);
  assert.equal(
    compileVisualExpression("(".repeat(21) + "1" + ")".repeat(21)),
    undefined,
  );
  assert.equal(compileVisualExpression("-".repeat(30) + "1"), undefined);
  assert.equal(
    compileVisualExpression(Array.from({ length: 22 }, () => "1").join("+")),
    undefined,
  );

  const tokenHeavy = Array.from({ length: 65 }, () => "1").join("+");
  assert.ok(tokenHeavy.length <= 256);
  assert.equal(compileVisualExpression(tokenHeavy), undefined);

  const longInput = "a + b";
  assert.equal(
    evaluate(longInput, { a: "x".repeat(1025), b: "y" }),
    undefined,
  );
  assert.equal(
    evaluate(longInput, { a: "x".repeat(600), b: "y".repeat(600) }),
    undefined,
  );
});

test("fails cleanly on invalid math and non-finite values", () => {
  const invalidMath = [
    "1 / 0",
    "1 % 0",
    "sqrt(-1)",
    "log(0)",
    "log(-1)",
    "exp(1000)",
    "pow(-1, 0.5)",
    "0 ** -1",
    "clamp(1, 5, 0)",
    "min(1, '2')",
    "1 + true",
    "1e308 * 1e308",
  ];
  for (const source of invalidMath) {
    assert.equal(evaluate(source), undefined, source);
  }

  assert.equal(evaluate("x + 1", { x: Infinity }), undefined);
  assert.equal(evaluate("x + 1", { x: NaN }), undefined);
  assert.equal(evaluate("x", { x: 10n }), undefined);
});
