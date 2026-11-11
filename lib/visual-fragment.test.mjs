import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { buildVisualFragment, MAX_VISUAL_SOURCE, safeVisualPaint, safeVisualStyle } from "./visual-fragment.ts";

// Use the same HTML parser rehype-raw already installs. Resolve relative to its
// actual importer so npm's hoisting layout does not silently skip the DOM cases.
const require = createRequire(import.meta.url);
const rawRequire = createRequire(require.resolve("rehype-raw"));
const parserRequire = createRequire(rawRequire.resolve("hast-util-raw"));
const { parseFragment } = parserRequire("parse5");

const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";

class FakeNode {
  constructor(nodeType) { this.nodeType = nodeType; this.childNodes = []; this.parentNode = null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
}
class FakeFragment extends FakeNode { constructor() { super(11); this.namespaceURI = null; this.localName = ""; } }
class FakeText extends FakeNode { constructor(data) { super(3); this.data = data; this.namespaceURI = null; this.localName = ""; } }
class FakeComment extends FakeNode { constructor() { super(8); this.namespaceURI = null; this.localName = ""; } }
class FakeElement extends FakeNode {
  constructor(namespaceURI, localName, attributes = []) {
    super(1);
    this.namespaceURI = namespaceURI;
    this.localName = localName;
    this.attributes = attributes.map((attribute) => ({
      name: attribute.name,
      value: attribute.value,
      namespaceURI: attribute.namespace ?? null,
      prefix: attribute.prefix ?? null,
    }));
  }
  getAttribute(name) { return this.attributes.find((attribute) => attribute.name === name)?.value ?? null; }
  setAttribute(name, value) {
    const existing = this.attributes.find((attribute) => attribute.name === name);
    if (existing) existing.value = String(value);
    else this.attributes.push({ name, value: String(value), namespaceURI: null, prefix: null });
  }
}
class FakeTemplate extends FakeElement {
  constructor() { super(HTML_NS, "template"); this.content = new FakeFragment(); }
  set innerHTML(value) { this.content = astToNode(parseFragment(value)); }
}

function astToNode(ast) {
  if (ast.nodeName === "#text") return new FakeText(ast.value ?? "");
  if (ast.nodeName === "#comment") return new FakeComment();
  if (ast.nodeName === "#document-fragment") {
    const fragment = new FakeFragment();
    for (const child of ast.childNodes ?? []) fragment.appendChild(astToNode(child));
    return fragment;
  }
  const element = new FakeElement(ast.namespaceURI ?? HTML_NS, ast.tagName ?? ast.nodeName, ast.attrs ?? []);
  if (ast.content) element.content = astToNode(ast.content);
  for (const child of ast.childNodes ?? []) element.appendChild(astToNode(child));
  return element;
}

function fakeDocument() {
  const document = {
    createElement(tag) { return tag === "template" ? new FakeTemplate() : new FakeElement(HTML_NS, tag); },
    createElementNS(namespace, tag) { return new FakeElement(namespace, tag); },
    createDocumentFragment() { return new FakeFragment(); },
    createTextNode(data) { return new FakeText(data); },
  };
  return document;
}

function elements(root) {
  const found = [];
  const stack = [...root.childNodes];
  while (stack.length) {
    const node = stack.pop();
    if (node.nodeType === 1) found.push(node);
    stack.push(...node.childNodes);
  }
  return found;
}

function byTag(root, tag) { return elements(root).filter((element) => element.localName === tag); }

test("enforces the source cap before parsing", () => {
  assert.equal(MAX_VISUAL_SOURCE, 24_000);
  assert.equal(buildVisualFragment("x".repeat(MAX_VISUAL_SOURCE + 1), {}), null);
  assert.equal(buildVisualFragment("x".repeat(MAX_VISUAL_SOURCE + 1), undefined), null);
});

test("paint accepts simple colors and rejects resource references", () => {
  for (const value of ["red", "#fff", "rgb(1 2 3 / 50%)", "rgba(1,2,3,.5)", "hsl(120 50% 50%)", "hsla(120,50%,50%,.5)", "var(--pi-text)", "none", "currentColor"]) {
    assert.ok(safeVisualPaint(value), value);
  }
  for (const value of ["url(#arrowBlue)", "url(https://x)", "var(--border)", "var(--pi-text, red)", "linear-gradient(red,blue)", "context-fill", "rgb(calc(1),0,0)", "red/**/", "red\\75 rl(x)", "inherit"]) {
    assert.equal(safeVisualPaint(value), null, value);
  }
});

test("style keeps useful declarations and rejects resource or positioning syntax", () => {
  assert.ok(safeVisualStyle("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;background-color:var(--pi-surface);color:var(--pi-text);border:1px solid var(--pi-border);border-radius:8px;padding:8px 12px;max-width:100%;font-size:1.2em;text-align:center;fill:none;stroke:currentColor;stroke-width:2;transform:translate(10px,20px) rotate(30deg) scale(1.2);opacity:.8"));
  for (const value of [
    "position:fixed", "background:url(https://x)", "background:linear-gradient(red,blue)", "background:var(--border)",
    "color:var(--pi-text, red)", "color:rgb(calc(1),0,0)", "animation:pulse 1s", "filter:blur(2px)",
    "pointer-events:none", "transform:matrix(1,0,0,1,0,0)", "transform:skew(10deg)",
    "background:red/**/", "background:red\\75 rl(x)", "content:'x'", "@import url(x)", "--x:red", "background:inherit", "background:red blue",
    "grid-template-columns:repeat(5000,1fr)",
  ]) assert.equal(safeVisualStyle(value), null, value);
  assert.equal(safeVisualStyle("padding:8px; position:fixed; background:url(x); color:red"), "padding: 8px; color: red");
});

test("rebuilds safe HTML controls and drops resource syntax", () => {
  const document = fakeDocument();
  let imageInput;
  const fragment = buildVisualFragment(`
    <div id="root" class="pi-card pi-warning" onclick="x()" style="display:flex;gap:8px;background:url(x)">
      <h2>Hello</h2><p><strong>bold</strong> <em>em</em> <mark>mark</mark></p>
      <label for="speed">Speed <input type="range" name="speed" min="0" max="100" value="50" autofocus></label>
      <output data-pi-text="'Distance: '+speed*2+' m'"></output>
      <button type="submit" autofocus data-pi-set="stage: 'next'">Go</button>
      <input type="file" name="bad"><input type="text" name="bad-name" value="ok">
      <input type="number" value="1e999"><input type="number" min="0" max="10" step="1" value="5">
      <select name="mode"><option value="a" selected>A</option></select>
      <details open><summary>More</summary><table><tr><th scope="col">H</th><td colspan="2">C</td></tr></table></details>
      <figure><figcaption>Caption</figcaption></figure>
      <img src="./figure.png" alt="Plot" data-pi-source="Deck.pdf" data-pi-page="4" data-pi-crop="0,0,50,50" onerror="x()" srcset="bad">
      <a href="https://example.com">bad</a><form><input name="inside-form"></form><iframe></iframe><object></object><script>alert(1)</script><style>*{}</style>
    </div>`, document, {
    createImage(image) { imageInput = image; const figure = document.createElement("figure"); figure.setAttribute("class", "trusted"); return figure; },
  });
  assert.ok(fragment);
  const all = elements(fragment);
  const root = all.find((element) => element.getAttribute("id") === "root");
  assert.ok(root);
  assert.equal(root.getAttribute("onclick"), null);
  assert.equal(root.getAttribute("style"), "display: flex; gap: 8px");
  assert.equal(root.getAttribute("class"), "pi-card pi-warning");
  const button = byTag(fragment, "button")[0];
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.getAttribute("autofocus"), null);
  assert.equal(button.getAttribute("data-pi-set"), "stage: 'next'");
  const range = byTag(fragment, "input").find((input) => input.getAttribute("type") === "range");
  assert.equal(range.getAttribute("name"), "speed");
  assert.equal(range.getAttribute("min"), "0");
  assert.equal(range.getAttribute("max"), "100");
  assert.equal(range.getAttribute("value"), "50");
  assert.equal(range.getAttribute("autofocus"), null);
  assert.equal(byTag(fragment, "input").some((input) => input.getAttribute("type") === "file"), false);
  assert.equal(byTag(fragment, "input").find((input) => input.getAttribute("value") === "ok").getAttribute("name"), null);
  assert.equal(byTag(fragment, "input").some((input) => input.getAttribute("value") === "1e999"), false);
  assert.equal(byTag(fragment, "output")[0].getAttribute("data-pi-text"), "'Distance: '+speed*2+' m'");
  assert.equal(byTag(fragment, "a").length, 0);
  assert.equal(byTag(fragment, "form").length, 0);
  assert.equal(byTag(fragment, "script").length, 0);
  assert.equal(byTag(fragment, "style").length, 0);
  assert.equal(byTag(fragment, "iframe").length, 0);
  assert.equal(byTag(fragment, "object").length, 0);
  assert.deepEqual(imageInput, { src: "./figure.png", alt: "Plot", source: "Deck.pdf", page: "4", crop: "0,0,50,50" });
  assert.equal(byTag(fragment, "img").length, 0);
  assert.equal(byTag(fragment, "figure").some((figure) => figure.getAttribute("class") === "trusted"), true);
});

test("keeps simple SVG and drops unsafe SVG subtrees", () => {
  const fragment = buildVisualFragment(`
    <svg viewBox="0 0 100 100" role="img" aria-label="Chart">
      <title>Chart</title><desc>Description</desc><g transform="rotate(5 50 50)">
        <circle cx="50" cy="50" r="40" fill="red" font-size="12" pathLength="360"/><rect x="1" y="2" width="3" height="4" rx="1"/>
        <path d="M0 0L10 10" stroke="currentColor" stroke-width="2"/><text x="10" y="20">Hi</text><tspan dx="1">!</tspan>
      </g>
      <foreignObject><div>bad</div></foreignObject><animate attributeName="x"/><filter/><style>*{}</style><use href="#x"/>
      <defs><marker id="arrowBlue"><path d="M0 0L5 5"/></marker></defs><image href="x.png"/><a href="x">bad</a>
    </svg>`, fakeDocument());
  assert.ok(fragment);
  assert.equal(byTag(fragment, "svg")[0].getAttribute("viewBox"), "0 0 100 100");
  assert.equal(byTag(fragment, "circle")[0].getAttribute("fill"), "red");
  assert.equal(byTag(fragment, "circle")[0].namespaceURI, SVG_NS);
  assert.equal(byTag(fragment, "circle")[0].getAttribute("font-size"), "12");
  assert.equal(byTag(fragment, "circle")[0].getAttribute("pathLength"), "360");
  assert.equal(byTag(fragment, "g")[0].getAttribute("transform"), "rotate(5 50 50)");
  for (const tag of ["foreignObject", "animate", "filter", "style", "use", "image", "a"]) {
    assert.equal(byTag(fragment, tag).length, 0, tag);
  }
  for (const element of elements(fragment)) {
    assert.equal(element.attributes.some((attribute) => attribute.name === "href" || attribute.name === "src"), false);
  }
});

test("SVG arrows resolve only to a unique marker inside the same diagram", () => {
  const fragment = buildVisualFragment(`
    <svg viewBox="0 0 100 100">
      <defs><marker id="arrow" markerWidth="8" refX="6" orient="auto"><path d="M0 0 L6 3 L0 6Z" marker-end="url(#arrow)"/></marker></defs>
      <line id="local" marker-end="url(#arrow)" marker-start="url(https://example.invalid/a.svg#arrow)"/>
    </svg>
    <svg><line id="other" marker-end="url(#arrow)"/></svg>
    <svg><defs><marker id="double"/><marker id="double"/></defs><line id="ambiguous" marker-end="url(#double)"/></svg>`, fakeDocument());
  const marker = byTag(fragment, "marker").find((element) => element.getAttribute("orient") === "auto");
  assert.match(marker.getAttribute("id"), /^pi-visual-marker\./);
  assert.equal(marker.getAttribute("markerWidth"), "8");
  assert.equal(byTag(fragment, "path")[0].getAttribute("marker-end"), null, "markers cannot refer to themselves");
  const lines = Object.fromEntries(byTag(fragment, "line").map((line) => [line.getAttribute("id"), line]));
  assert.equal(lines.local.getAttribute("marker-end"), `url(#${marker.getAttribute("id")})`);
  assert.equal(lines.local.getAttribute("marker-start"), null);
  assert.equal(lines.other.getAttribute("marker-end"), null);
  assert.equal(lines.ambiguous.getAttribute("marker-end"), null);
});

test("image callback receives bounded HTML img fields and is capped", () => {
  const document = fakeDocument();
  const seen = [];
  const fragment = buildVisualFragment(`
    <img src="a.png" alt="A" data-pi-source="S" data-pi-page="1" data-pi-crop="0,0,10,10" onerror="x()" srcset="bad">
    <img src="b.png" alt="B"><img src="c.png"><img src="d.png"><img src="e.png">
    <img src="${"x".repeat(2_049)}"><img src="f.png" alt="${"a".repeat(221)}"><img src="g.png" data-pi-page="1234567890123">
    <svg><image href="svg.png"/><foreignObject><img src="hidden.png"></foreignObject></svg>`, document, {
    createImage(image) { seen.push(image); return document.createElement("figure"); },
  });
  assert.ok(fragment);
  assert.equal(seen.length, 4);
  assert.deepEqual(seen[0], { src: "a.png", alt: "A", source: "S", page: "1", crop: "0,0,10,10" });
  assert.deepEqual(seen[1], { src: "b.png", alt: "B", source: "", page: "", crop: "" });
  assert.equal(byTag(fragment, "figure").length, 4);
  assert.equal(byTag(fragment, "img").length, 0);
  assert.equal(byTag(fragment, "image").length, 0);
  assert.equal(buildVisualFragment("<img src=\"x.png\">", document), null);
  assert.equal(buildVisualFragment("<img src=\"x.png\">", document, { createImage: () => null }), null);
});

test("enforces node, depth, and usable-node bounds", () => {
  const document = fakeDocument();
  assert.equal(buildVisualFragment(`<div>${"<span></span>".repeat(300)}</div>`, document), null);
  assert.equal(buildVisualFragment(`${"<div>".repeat(21)}x${"</div>".repeat(21)}`, document), null);
  assert.ok(buildVisualFragment(`${"<div>".repeat(20)}x${"</div>".repeat(20)}`, document));
  assert.ok(buildVisualFragment("x".repeat(MAX_VISUAL_SOURCE), document));
  assert.equal(buildVisualFragment("<script>x</script>", document), null);
  assert.equal(buildVisualFragment("   ", document), null);
  assert.equal(buildVisualFragment(`<script>${"x".repeat(MAX_VISUAL_SOURCE)}</script>`, document), null);
});
