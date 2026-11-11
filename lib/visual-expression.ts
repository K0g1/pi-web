/** A bounded expression language for model-authored interactive visuals. */

export type VisualValue = string | number | boolean;

type Compiled = (values: Readonly<Record<string, VisualValue>>) => VisualValue | undefined;

const LIMIT = { source: 256, tokens: 128, nodes: 128, depth: 20, args: 8, string: 1024 } as const;
const RESERVED = new Set(
  "__proto__ prototype constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf __defineGetter__ __defineSetter__ __lookupGetter__ __lookupSetter__".split(" "),
);

type Token =
  | { kind: "number"; value: number }
  | { kind: "string" | "identifier" | "operator" | "eof"; value: string };

const ESCAPES: Record<string, string> = { "\\": "\\", "'": "'", '"': '"', n: "\n", r: "\r", t: "\t" };

function decodeString(raw: string): string {
  let result = "";
  for (let i = 1; i < raw.length - 1; i++) {
    const char = raw[i];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const escaped = raw[++i];
    if (!Object.prototype.hasOwnProperty.call(ESCAPES, escaped)) throw new Error("Invalid escape");
    result += ESCAPES[escaped];
  }
  return result;
}

function scan(source: string): Token[] {
  const tokenRe =
    /(?:\s+)|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|(?:'(?:\\.|[^'\\\x00-\x1f\x7f])*')|(?:"(?:\\.|[^"\\\x00-\x1f\x7f])*")|(?:[A-Za-z_$][\w$]*)|(?:===|!==|\*\*|<=|>=|==|!=|&&|\|\||[+\-*/%<>!?:(),])/y;
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    tokenRe.lastIndex = index;
    const match = tokenRe.exec(source);
    if (!match) throw new Error("Unexpected character");
    const raw = match[0];
    index = tokenRe.lastIndex;
    if (/^\s+$/.test(raw)) continue;
    if (tokens.length >= LIMIT.tokens) throw new Error("Too many tokens");
    const first = raw[0];
    if (first === "'" || first === '"') {
      tokens.push({ kind: "string", value: decodeString(raw) });
    } else if (first === "." || (first >= "0" && first <= "9")) {
      const number = Number(raw);
      if (!Number.isFinite(number)) throw new Error("Number must be finite");
      tokens.push({ kind: "number", value: number });
    } else if (first === "_" || first === "$" || (first >= "A" && first <= "Z") || (first >= "a" && first <= "z")) {
      tokens.push({ kind: "identifier", value: raw });
    } else {
      tokens.push({ kind: "operator", value: raw });
    }
  }
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

type UnaryOp = "!" | "-" | "+";
type LogicOp = "&&" | "||";
type BinaryOp = "+" | "-" | "*" | "/" | "%" | "**" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "===" | "!==";

type Node =
  | { kind: "lit"; value: VisualValue; depth: number }
  | { kind: "id"; name: string; depth: number }
  | { kind: "unary"; op: UnaryOp; arg: Node; depth: number }
  | { kind: "binary"; op: BinaryOp; left: Node; right: Node; depth: number }
  | { kind: "logic"; op: LogicOp; left: Node; right: Node; depth: number }
  | { kind: "cond"; test: Node; yes: Node; no: Node; depth: number }
  | { kind: "call"; name: FunctionName; args: readonly Node[]; depth: number };

const BP: Record<string, number> = {
  "||": 1, "&&": 2, "==": 3, "!=": 3, "===": 3, "!==": 3,
  "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6, "**": 8,
};
const TERNARY_BP = 0;
const UNARY_BP = 7;

const FUNCTIONS = {
  abs: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.abs(x) },
  min: { arity: [1, LIMIT.args], fn: (xs: readonly number[]) => Math.min(...xs) },
  max: { arity: [1, LIMIT.args], fn: (xs: readonly number[]) => Math.max(...xs) },
  clamp: { arity: [3, 3], fn: ([x, min, max]: readonly number[]) => min > max ? NaN : Math.min(Math.max(x, min), max) },
  round: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.round(x) },
  floor: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.floor(x) },
  ceil: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.ceil(x) },
  sqrt: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.sqrt(x) },
  pow: { arity: [2, 2], fn: ([x, y]: readonly number[]) => Math.pow(x, y) },
  sin: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.sin(x) },
  cos: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.cos(x) },
  tan: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.tan(x) },
  log: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.log(x) },
  exp: { arity: [1, 1], fn: ([x]: readonly number[]) => Math.exp(x) },
  fixed: { arity: [2, 2], fn: undefined },
} as const;
type FunctionName = keyof typeof FUNCTIONS;

const isFunctionName = (name: string): name is FunctionName => Object.prototype.hasOwnProperty.call(FUNCTIONS, name);

class Parser {
  private readonly tokens: readonly Token[];
  private index = 0;
  private nodes = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): Node {
    const node = this.expression(0, 0);
    if (this.peek().kind !== "eof") throw new Error("Unexpected token");
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  private take(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.index++;
    return token;
  }

  private is(operator: string): boolean {
    const token = this.peek();
    return token.kind === "operator" && token.value === operator;
  }

  private expect(operator: string): void {
    if (!this.is(operator)) throw new Error(`Expected ${operator}`);
    this.index++;
  }

  private node(node: Node): Node {
    if (++this.nodes > LIMIT.nodes || node.depth > LIMIT.depth) throw new Error("Expression too large");
    return node;
  }

  private expression(min: number, depth: number): Node {
    if (depth > LIMIT.depth) throw new Error("Expression too deep");
    let left = this.prefix(depth);
    while (true) {
      const token = this.peek();
      if (token.kind === "operator" && token.value === "?") {
        if (TERNARY_BP < min) break;
        this.index++;
        const yes = this.expression(0, depth + 1);
        this.expect(":");
        const no = this.expression(TERNARY_BP, depth + 1);
        left = this.node({ kind: "cond", test: left, yes, no, depth: 1 + Math.max(left.depth, yes.depth, no.depth) });
        continue;
      }
      if (token.kind !== "operator") break;
      const binding = BP[token.value];
      if (binding === undefined || binding < min) break;
      const op = token.value;
      this.index++;
      const right = this.expression(binding + (op === "**" ? 0 : 1), depth + 1);
      const nodeDepth = 1 + Math.max(left.depth, right.depth);
      left = op === "&&" || op === "||"
        ? this.node({ kind: "logic", op, left, right, depth: nodeDepth })
        : this.node({ kind: "binary", op: op as BinaryOp, left, right, depth: nodeDepth });
    }
    return left;
  }

  private prefix(depth: number): Node {
    const token = this.take();
    if (token.kind === "number" || token.kind === "string") {
      return this.node({ kind: "lit", value: token.value, depth: 1 });
    }
    if (token.kind === "identifier") {
      if (token.value === "true" || token.value === "false") {
        return this.node({ kind: "lit", value: token.value === "true", depth: 1 });
      }
      if (token.value === "pi") return this.node({ kind: "lit", value: Math.PI, depth: 1 });
      if (token.value === "e") return this.node({ kind: "lit", value: Math.E, depth: 1 });
      if (RESERVED.has(token.value)) throw new Error("Reserved identifier");
      if (this.is("(")) return this.call(token.value, depth);
      return this.node({ kind: "id", name: token.value, depth: 1 });
    }
    if (token.kind === "operator") {
      if (token.value === "(") {
        const node = this.expression(0, depth + 1);
        this.expect(")");
        return node;
      }
      if (token.value === "!" || token.value === "-" || token.value === "+") {
        const arg = this.expression(UNARY_BP, depth + 1);
        return this.node({ kind: "unary", op: token.value, arg, depth: 1 + arg.depth });
      }
    }
    throw new Error("Expected expression");
  }

  private call(name: string, depth: number): Node {
    if (!isFunctionName(name)) throw new Error("Unknown function");
    const [minimum, maximum] = FUNCTIONS[name].arity;
    this.expect("(");
    const args: Node[] = [];
    if (!this.is(")")) {
      while (true) {
        if (args.length >= LIMIT.args) throw new Error("Too many arguments");
        args.push(this.expression(0, depth + 1));
        if (!this.is(",")) break;
        this.index++;
        if (this.is(")")) throw new Error("Trailing comma");
      }
    }
    this.expect(")");
    if (args.length < minimum || args.length > maximum) throw new Error("Wrong argument count");
    const argumentDepth = args.reduce((max, arg) => Math.max(max, arg.depth), 0);
    return this.node({ kind: "call", name, args, depth: 1 + argumentDepth });
  }
}

function visual(value: unknown): VisualValue | undefined {
  if (typeof value === "string") return value.length <= LIMIT.string ? value : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return typeof value === "boolean" ? value : undefined;
}

function own(values: unknown, name: string): VisualValue | undefined {
  if (values === null || typeof values !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(values, name);
  return descriptor && "value" in descriptor ? visual(descriptor.value) : undefined;
}

const truthy = (value: VisualValue | undefined): boolean =>
  value === undefined ? false : typeof value === "boolean" ? value : typeof value === "number" ? value !== 0 : value.length > 0;
const textValue = (value: VisualValue): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : value ? "true" : "false";
const finite = (value: number): number | undefined => Number.isFinite(value) ? value : undefined;
const numeric = (left: VisualValue, right: VisualValue, fn: (a: number, b: number) => number): number | undefined =>
  typeof left === "number" && typeof right === "number" ? finite(fn(left, right)) : undefined;
const compare = (left: VisualValue, right: VisualValue, fn: (a: number, b: number) => boolean): boolean | undefined =>
  typeof left === "number" && typeof right === "number" ? fn(left, right) : undefined;

function applyBinary(operator: BinaryOp, left: VisualValue | undefined, right: VisualValue | undefined): VisualValue | undefined {
  if (left === undefined || right === undefined) return undefined;
  switch (operator) {
    case "+":
      if (typeof left === "number" && typeof right === "number") return finite(left + right);
      if (typeof left === "string" || typeof right === "string") {
        const result = textValue(left) + textValue(right);
        return result.length <= LIMIT.string ? result : undefined;
      }
      return undefined;
    case "-": return numeric(left, right, (a, b) => a - b);
    case "*": return numeric(left, right, (a, b) => a * b);
    case "/": return typeof right === "number" && right === 0 ? undefined : numeric(left, right, (a, b) => a / b);
    case "%": return typeof right === "number" && right === 0 ? undefined : numeric(left, right, (a, b) => a % b);
    case "**": return numeric(left, right, (a, b) => Math.pow(a, b));
    case "<": return compare(left, right, (a, b) => a < b);
    case "<=": return compare(left, right, (a, b) => a <= b);
    case ">": return compare(left, right, (a, b) => a > b);
    case ">=": return compare(left, right, (a, b) => a >= b);
    case "==": case "===": return left === right;
    case "!=": case "!==": return left !== right;
    default: return undefined;
  }
}

function applyCall(name: FunctionName, args: readonly (VisualValue | undefined)[]): VisualValue | undefined {
  const numbers: number[] = [];
  for (const argument of args) {
    if (typeof argument !== "number") return undefined;
    numbers.push(argument);
  }
  if (name === "fixed") {
    const [value, digitsValue] = numbers;
    const digits = Math.max(0, Math.min(6, Math.trunc(digitsValue)));
    const result = value.toFixed(digits);
    return result.length <= LIMIT.string ? result : undefined;
  }
  const fn = FUNCTIONS[name].fn;
  return fn ? finite(fn(numbers)) : undefined;
}

function evaluate(node: Node, values: unknown): VisualValue | undefined {
  switch (node.kind) {
    case "lit": return node.value;
    case "id": return own(values, node.name);
    case "unary": {
      const argument = evaluate(node.arg, values);
      if (argument === undefined) return undefined;
      if (node.op === "!") return !truthy(argument);
      if (typeof argument !== "number") return undefined;
      return finite(node.op === "-" ? -argument : argument);
    }
    case "binary": return applyBinary(node.op, evaluate(node.left, values), evaluate(node.right, values));
    case "logic": {
      const left = evaluate(node.left, values);
      if (node.op === "&&") return truthy(left) ? evaluate(node.right, values) : left;
      return truthy(left) ? left : evaluate(node.right, values);
    }
    case "cond": return evaluate(truthy(evaluate(node.test, values)) ? node.yes : node.no, values);
    case "call": return applyCall(node.name, node.args.map((argument) => evaluate(argument, values)));
    default: return undefined;
  }
}

export function compileVisualExpression(source: string): Compiled | undefined {
  if (typeof source !== "string" || source.length === 0 || source.length > LIMIT.source) return undefined;
  try {
    const expression = new Parser(scan(source)).parse();
    return (values) => {
      if (values === null || typeof values !== "object") return undefined;
      try {
        return evaluate(expression, values);
      } catch {
        return undefined;
      }
    };
  } catch {
    return undefined;
  }
}
