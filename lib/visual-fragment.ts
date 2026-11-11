/** Model-authored visual fragments: allow-list tags/attributes, rebuild from strings. */

export const MAX_VISUAL_SOURCE = 24_000;
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_NODES = 300, MAX_DEPTH = 20, MAX_IMAGES = 4, MAX_STYLE = 2_048, MAX_VALUE = 512;
const MAX_ID = 64, MAX_CLASS = 256, MAX_TITLE = 512, MAX_PI = 1_024;
const MAX_IMAGE_SRC = 2_048, MAX_IMAGE_ALT = 220, MAX_IMAGE_SOURCE = 180, MAX_IMAGE_PAGE = 12, MAX_IMAGE_CROP = 80;

const HTML_TAGS = new Set(`h1 h2 h3 h4 h5 h6 p section div span strong em b i u s mark ul ol li dl dt dd table caption thead tbody tfoot tr th td colgroup col details summary label output figure figcaption abbr blockquote pre code kbd samp var small sub sup br hr wbr main article header footer nav aside button input select option optgroup`.trim().split(/\s+/));
const SVG_TAGS = new Set(`svg title desc g circle rect ellipse line polyline polygon path text tspan defs marker`.trim().split(/\s+/));
const MARKER_ATTRIBUTES = new Set(["marker-start", "marker-mid", "marker-end"]);
const MARKER_TARGETS = new Set(["line", "polyline", "polygon", "path"]);
const SVG_PATH_LENGTH = new Set([...MARKER_TARGETS, "circle", "ellipse", "rect"]);
const MARKER_REFERENCE = /^url\(#([A-Za-z_][A-Za-z0-9_-]{0,63})\)$/;
type SvgScope = {
  markers: Map<string, string | null>;
  references: Array<{ element: Element; name: string; id: string }>;
};
let nextMarkerId = 0;
const PI_ATTRIBUTES = new Set(["data-pi-text", "data-pi-show", "data-pi-bind", "data-pi-set"]);
const HTML_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  button: new Set(["disabled"]),
  input: new Set(["name", "value", "min", "max", "step", "checked", "disabled", "readonly", "required", "placeholder", "maxlength", "minlength"]),
  select: new Set(["name", "multiple", "disabled", "required", "size"]),
  option: new Set(["value", "selected", "disabled", "label"]),
  optgroup: new Set(["label", "disabled"]), label: new Set(["for"]), output: new Set(["for", "name"]),
  ol: new Set(["start", "reversed"]), li: new Set(["value"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]), td: new Set(["colspan", "rowspan", "headers"]),
  col: new Set(["span"]), colgroup: new Set(["span"]), details: new Set(["open"]),
};
const SVG_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  svg: new Set(["viewBox", "width", "height", "preserveAspectRatio"]),
  marker: new Set(["viewBox", "markerWidth", "markerHeight", "markerUnits", "orient", "refX", "refY"]),
  circle: new Set(["cx", "cy", "r"]), rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]), line: new Set(["x1", "y1", "x2", "y2"]),
  polyline: new Set(["points"]), polygon: new Set(["points"]), path: new Set(["d"]),
  text: new Set(["x", "y", "dx", "dy"]), tspan: new Set(["x", "y", "dx", "dy"]),
};
const SVG_PRESENTATION = new Set(`fill stroke color opacity fill-opacity stroke-opacity stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit fill-rule clip-rule vector-effect paint-order text-anchor dominant-baseline font-size font-weight font-style transform`.trim().split(/\s+/));
const ARIA_ATTRIBUTES = new Set(`aria-label aria-labelledby aria-describedby aria-description aria-hidden aria-expanded aria-selected aria-checked aria-pressed aria-disabled aria-required aria-readonly aria-invalid aria-live aria-atomic aria-busy aria-current aria-orientation aria-sort aria-level aria-valuemin aria-valuemax aria-valuenow aria-valuetext aria-controls aria-owns aria-details aria-errormessage aria-flowto aria-activedescendant aria-haspopup aria-autocomplete aria-placeholder aria-roledescription aria-posinset aria-setsize aria-colcount aria-colindex aria-colspan aria-rowcount aria-rowindex aria-rowspan`.trim().split(/\s+/));
const ROLES = new Set(`alert button checkbox combobox dialog document figure grid group heading img link list listbox listitem main meter navigation none note option presentation progressbar radio region row separator slider status switch tab tablist tabpanel table textbox timer toolbar tooltip tree treeitem`.trim().split(/\s+/));
const CSS_PROPERTIES = new Set(`color background background-color font-size font-weight font-style font-variant-numeric text-align vertical-align text-transform text-wrap text-decoration text-decoration-line text-decoration-style text-decoration-color line-height letter-spacing word-spacing white-space word-break overflow-wrap text-overflow display flex flex-direction flex-wrap flex-grow flex-shrink flex-basis justify-content justify-items justify-self align-items align-self align-content place-items place-content place-self order gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-columns grid-auto-rows grid-auto-flow grid-column grid-row aspect-ratio width height min-width max-width min-height max-height inline-size block-size min-inline-size max-inline-size min-block-size max-block-size margin margin-top margin-right margin-bottom margin-left margin-inline margin-block margin-inline-start margin-inline-end margin-block-start margin-block-end padding padding-top padding-right padding-bottom padding-left padding-inline padding-block padding-inline-start padding-inline-end padding-block-start padding-block-end border border-top border-right border-bottom border-left border-width border-style border-color border-radius border-inline-start border-inline-end border-block-start border-block-end border-inline-start-width border-inline-end-width border-block-start-width border-block-end-width border-inline-start-style border-inline-end-style border-block-start-style border-block-end-style border-inline-start-color border-inline-end-color border-block-start-color border-block-end-color opacity overflow overflow-x overflow-y visibility list-style-type list-style-position table-layout border-collapse border-spacing caption-side empty-cells box-sizing accent-color caret-color fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit fill-opacity stroke-opacity fill-rule clip-rule vector-effect paint-order text-anchor dominant-baseline transform`.trim().split(/\s+/));
const SAFE_THEME_VARIABLES = new Set(`--pi-positive --pi-negative --pi-water --pi-warning --pi-note --pi-neutral --pi-accent --pi-text --pi-muted --pi-surface --pi-border`.trim().split(/\s+/));
const SAFE_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla", "min", "max", "clamp", "repeat", "minmax"]);
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const TRANSFORM_FUNCTIONS = new Set(`rotate rotatex rotatey rotatez translate translatex translatey translatez scale scalex scaley scalez`.trim().split(/\s+/));
const SAFE_CSS_CHARS = /^[A-Za-z0-9#.%(),\s/+\-]+$/;
const BANNED_CSS_WORD = /\b(?:url|href|src|expression|javascript|import|filter|position|fixed|sticky|absolute|relative|animation|transition|pointer-events|behavior|binding)\b/i;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER = /^[+-]?\d{1,12}$/;
const INPUT_TYPES = new Set(["range", "number", "checkbox", "radio", "hidden", "text"]);
const BOOLEAN_ATTRIBUTES = new Set(["checked", "disabled", "readonly", "required", "multiple", "selected", "open", "reversed"]);

function bounded(value: string, max: number): string | null {
  if (value.length > max) return null;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f) return null;
  }
  return value;
}
function numberValue(value: string, min = -1_000_000_000, max = 1_000_000_000): number | null {
  const text = value.trim();
  const number = NUMBER.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function integerValue(value: string, min: number, max: number): string | null {
  const text = value.trim();
  const number = INTEGER.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) && number >= min && number <= max ? String(number) : null;
}
function safeId(value: string): string | null {
  const text = value.trim();
  return text.length <= MAX_ID && /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(text) ? text : null;
}
function safeIdList(value: string): string | null {
  const ids = value.trim().split(/\s+/).filter(Boolean).map(safeId);
  return ids.length >= 1 && ids.length <= 8 && ids.every(Boolean) ? ids.join(" ") : null;
}
function safeClass(value: string): string | null {
  const text = value.trim(), tokens = text.split(/\s+/);
  return text && text.length <= MAX_CLASS && tokens.length <= 12 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(token)) ? tokens.join(" ") : null;
}
function safeAria(name: string, value: string): string | null {
  const text = value.trim();
  return ARIA_ATTRIBUTES.has(name.toLowerCase()) && text && text.length <= MAX_VALUE && bounded(text, MAX_VALUE) !== null ? text : null;
}
function safeRole(value: string): string | null {
  const role = value.trim().toLowerCase();
  return ROLES.has(role) ? role : null;
}
function set(target: Element, name: string, value: string | null): void {
  if (value !== null) target.setAttribute(name, value);
}

function safeCssValue(value: string, extraFunctions?: ReadonlySet<string>): string | null {
  const text = value.trim();
  if (!text || text.length > MAX_VALUE || !SAFE_CSS_CHARS.test(text) || BANNED_CSS_WORD.test(text)) return null;
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth < 0 || depth > 8) return null;
  }
  if (depth !== 0) return null;
  for (const repeat of text.matchAll(/\brepeat\(\s*(\d+)/gi)) if (Number(repeat[1]) > 64) return null;
  let match: RegExpExecArray | null;
  const variables = /var\(([^()]*)\)/gi;
  while ((match = variables.exec(text)) !== null) if (!SAFE_THEME_VARIABLES.has(match[1].trim())) return null;
  if (/\bvar\b/i.test(text.replace(/var\([^()]*\)/gi, ""))) return null;
  const functions = /([A-Za-z][A-Za-z0-9-]*)\(/g;
  while ((match = functions.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (name !== "var" && !SAFE_FUNCTIONS.has(name) && !extraFunctions?.has(name)) return null;
  }
  return text;
}

/** A color-only paint value. Resource references and paint servers are rejected. */
export function safeVisualPaint(value: string): string | null {
  const safe = safeCssValue(value);
  if (!safe) return null;
  const lower = safe.toLowerCase();
  if (lower === "none" || lower === "transparent" || lower === "currentcolor") return safe;
  if (/^[a-z]+$/i.test(safe)) return CSS_WIDE_KEYWORDS.has(lower) ? null : safe;
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(safe)) return safe;
  return /^(?:rgb|rgba|hsl|hsla)\(/i.test(safe) || /^var\(--pi-[a-z-]+\)$/i.test(safe) ? safe : null;
}

function safeTransform(value: string): string | null {
  const safe = safeCssValue(value, TRANSFORM_FUNCTIONS);
  if (!safe) return null;
  let last = 0, count = 0, match: RegExpExecArray | null;
  const functions = /([A-Za-z]+)\(([^()]*)\)/g;
  while ((match = functions.exec(safe)) !== null) {
    if (safe.slice(last, match.index).trim() || !TRANSFORM_FUNCTIONS.has(match[1].toLowerCase())) return null;
    count += 1;
    last = functions.lastIndex;
  }
  return count > 0 && !safe.slice(last).trim() ? safe : null;
}

/** Bounded inline declarations from a small property allow-list. */
export function safeVisualStyle(value: string): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_STYLE) return null;
  const declarations: string[] = [];
  for (const raw of value.split(";")) {
    const declaration = raw.trim();
    if (!declaration) continue;
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase(), rawValue = declaration.slice(colon + 1).trim();
    if (!CSS_PROPERTIES.has(property) || !rawValue || rawValue.length > MAX_VALUE) continue;
    const valid = ["background", "background-color", "color", "fill", "stroke"].includes(property)
      ? safeVisualPaint(rawValue) !== null
      : property === "transform" ? safeTransform(rawValue) !== null : safeCssValue(rawValue) !== null;
    if (!valid) continue;
    declarations.push(`${property}: ${rawValue}`);
    if (declarations.length > 24) return null;
  }
  return declarations.length ? declarations.join("; ") : null;
}

function safeSvgLength(value: string, min: number, max: number): string | null {
  const text = value.trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(px|%|em|rem)?$/i.exec(text);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return (match[2] ?? "").toLowerCase() === "%"
    ? number >= 0 && number <= 100 ? text : null
    : number >= min && number <= max ? text : null;
}
function safeViewBox(value: string): string | null {
  const parts = value.trim().split(/[\s,]+/);
  const numbers = parts.map((part) => numberValue(part, -100_000, 100_000));
  return parts.length === 4 && numbers.every((number) => number !== null) && (numbers[2] ?? 0) > 0 && (numbers[3] ?? 0) > 0 ? numbers.join(" ") : null;
}
function safePoints(value: string): string | null {
  const parts = value.trim().split(/[\s,]+/);
  const numbers = parts.map((part) => numberValue(part, -100_000, 100_000));
  return parts.length >= 2 && parts.length <= 512 && parts.length % 2 === 0 && numbers.every((number) => number !== null) ? numbers.join(" ") : null;
}
function safePath(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 8_192 || !/^[Mm]/.test(text) || !/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\-\s]+$/.test(text)) return null;
  return (text.match(/[MmZzLlHhVvCcSsQqTtAa]/g)?.length ?? 0) <= 256 ? text : null;
}
function safePreserveAspectRatio(value: string): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  return /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: (?:meet|slice))?$/.test(text) ? text : null;
}
function safeInputValue(type: string, value: string): string | null {
  return type === "range" || type === "number" ? numberValue(value) !== null ? value.trim() : null : bounded(value, MAX_VALUE);
}

function copyHtmlAttribute(target: Element, name: string, value: string, tag: string, inputType: string | null): void {
  if (!HTML_ATTRIBUTES[tag]?.has(name)) return;
  if (BOOLEAN_ATTRIBUTES.has(name)) {
    if (name === "checked" && !(tag === "input" && (inputType === "checkbox" || inputType === "radio"))) return;
    if (name === "readonly" && !(tag === "input" && (inputType === "text" || inputType === "number"))) return;
    if (name === "required" && tag === "input" && inputType === "hidden") return;
    set(target, name, "");
  } else if (name === "name" && (tag === "input" || tag === "select" || tag === "output")) {
    const safe = value.trim();
    if (/^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(safe)) set(target, name, safe);
  } else if (name === "for" && (tag === "label" || tag === "output")) set(target, name, tag === "label" ? safeId(value) : safeIdList(value));
  else if (name === "value" && tag === "input" && inputType) set(target, name, safeInputValue(inputType, value));
  else if (name === "value" && tag === "option") set(target, name, bounded(value, MAX_VALUE));
  else if (name === "value" && tag === "li") set(target, name, integerValue(value, -1_000_000, 1_000_000));
  else if ((name === "min" || name === "max" || name === "step") && tag === "input" && (inputType === "range" || inputType === "number")) {
    const text = value.trim(), number = numberValue(text);
    if ((name === "step" && text === "any") || (number !== null && (name !== "step" || number > 0))) set(target, name, text);
  } else if (name === "placeholder" && tag === "input" && (inputType === "text" || inputType === "number")) set(target, name, bounded(value, 256));
  else if ((name === "maxlength" || name === "minlength") && tag === "input" && inputType === "text") set(target, name, integerValue(value, 1, MAX_VALUE));
  else if (name === "size" && tag === "select") set(target, name, integerValue(value, 1, 20));
  else if (name === "label" && (tag === "option" || tag === "optgroup")) set(target, name, bounded(value, 220));
  else if (name === "start" && tag === "ol") set(target, name, integerValue(value, -1_000_000, 1_000_000));
  else if ((name === "colspan" || name === "rowspan" || name === "span") && (tag === "th" || tag === "td" || tag === "col" || tag === "colgroup")) set(target, name, integerValue(value, 1, 100));
  else if (name === "headers" && (tag === "th" || tag === "td")) set(target, name, safeIdList(value));
  else if (name === "scope" && tag === "th") {
    const scope = value.trim().toLowerCase();
    set(target, name, ["row", "col", "rowgroup", "colgroup"].includes(scope) ? scope : null);
  } else if (name === "abbr" && tag === "th") set(target, name, bounded(value, 220));
}

function copySvgAttribute(target: Element, name: string, value: string, tag: string): void {
  let safe: string | null;
  if (name === "fill" || name === "stroke" || name === "color") safe = safeVisualPaint(value);
  else if (name === "transform") safe = safeTransform(value);
  else if (name === "viewBox") safe = safeViewBox(value);
  else if (name === "preserveAspectRatio") safe = safePreserveAspectRatio(value);
  else if (name === "markerWidth" || name === "markerHeight") safe = numberValue(value, 0, 64) === null ? null : value.trim();
  else if (name === "refX" || name === "refY") safe = numberValue(value, -1000, 1000) === null ? null : value.trim();
  else if (name === "markerUnits") safe = ["strokeWidth", "userSpaceOnUse"].includes(value.trim()) ? value.trim() : null;
  else if (name === "orient") safe = ["auto", "auto-start-reverse"].includes(value.trim()) || numberValue(value, -360, 360) !== null ? value.trim() : null;
  else if (name === "points") safe = safePoints(value);
  else if (name === "d") safe = safePath(value);
  else if (name === "pathLength") safe = numberValue(value, 0.000001, 1_000_000) === null ? null : value.trim();
  else if (name === "width" || name === "height") safe = safeSvgLength(value, 0, tag === "svg" ? 2_000 : 100_000);
  else if (["cx", "cy", "x", "y", "x1", "y1", "x2", "y2", "dx", "dy"].includes(name)) safe = safeSvgLength(value, -100_000, 100_000);
  else if (name === "r" || name === "rx" || name === "ry") safe = safeSvgLength(value, 0, 100_000);
  else safe = safeCssValue(value);
  set(target, name, safe);
}

function copyAttributes(source: Element, target: Element, namespace: string, tag: string, inputType: string | null, svg?: SvgScope, inDefs = false): void {
  for (let index = 0; index < source.attributes.length; index++) {
    const attribute = source.attributes[index];
    if (attribute.namespaceURI !== null || attribute.prefix !== null || attribute.name.includes(":")) continue;
    const name = attribute.name, value = attribute.value;
    if (name === "id" && tag === "marker" && svg) {
      const id = safeId(value);
      if (!id) continue;
      // Authored IDs cannot contain a dot. Keep each diagram's markers unique,
      // even when many replies use the same common names like `arrow`.
      const scoped = `pi-visual-marker.${++nextMarkerId}`;
      svg.markers.set(id, svg.markers.has(id) ? null : scoped);
      target.setAttribute("id", scoped);
    } else if (name === "id") set(target, name, safeId(value));
    else if (name === "class") set(target, name, safeClass(value));
    else if (name === "style") set(target, name, safeVisualStyle(value));
    else if (name === "hidden") set(target, name, "");
    else if (name === "title") set(target, name, bounded(value, MAX_TITLE));
    else if (name === "role") set(target, name, safeRole(value));
    else if (name.startsWith("aria-")) set(target, name, safeAria(name, value));
    else if (PI_ATTRIBUTES.has(name)) set(target, name, bounded(value, MAX_PI));
    else if (namespace === HTML_NS) copyHtmlAttribute(target, name, value, tag, inputType);
    else if (svg && !inDefs && MARKER_TARGETS.has(tag) && MARKER_ATTRIBUTES.has(name)) {
      const match = MARKER_REFERENCE.exec(value.trim());
      if (match) svg.references.push({ element: target, name, id: match[1] });
    }
    else if (SVG_PRESENTATION.has(name) || SVG_ATTRIBUTES[tag]?.has(name) || (name === "pathLength" && SVG_PATH_LENGTH.has(tag))) copySvgAttribute(target, name, value, tag);
  }
  if (namespace === HTML_NS && tag === "button") target.setAttribute("type", "button");
  if (namespace === HTML_NS && tag === "input" && inputType) {
    target.setAttribute("type", inputType);
    if (inputType === "text" || inputType === "number") target.setAttribute("autocomplete", "off");
  }
}

function withinBounds(root: DocumentFragment): boolean {
  let count = 0;
  const stack: Array<{ node: Node; depth: number }> = [];
  for (let index = root.childNodes.length - 1; index >= 0; index--) stack.push({ node: root.childNodes[index], depth: 1 });
  while (stack.length) {
    const entry = stack.pop();
    if (!entry || ++count > MAX_NODES || (entry.node.nodeType === 1 && entry.depth > MAX_DEPTH)) return false;
    const childDepth = entry.node.nodeType === 1 ? entry.depth + 1 : entry.depth;
    for (let index = entry.node.childNodes.length - 1; index >= 0; index--) stack.push({ node: entry.node.childNodes[index], depth: childDepth });
  }
  return true;
}
function namespaceAllows(namespace: string, tag: string, parent: Node, fragment: DocumentFragment): boolean {
  if (namespace === HTML_NS) return parent === fragment || (parent.nodeType === 1 && (parent as Element).namespaceURI === HTML_NS);
  if (namespace !== SVG_NS) return false;
  return tag === "svg"
    ? parent === fragment || (parent.nodeType === 1 && (parent as Element).namespaceURI === HTML_NS)
    : parent.nodeType === 1 && (parent as Element).namespaceURI === SVG_NS;
}

/** Parse inertly, rebuild only allow-listed nodes, and return null on any bound failure. */
export function buildVisualFragment(
  source: string,
  document: Document,
  options?: { createImage?: (image: { src: string; alt: string; source: string; page: string; crop: string }) => HTMLElement | null },
): DocumentFragment | null {
  if (typeof source !== "string" || source.length > MAX_VISUAL_SOURCE || !document
    || typeof document.createElement !== "function" || typeof document.createElementNS !== "function"
    || typeof document.createDocumentFragment !== "function" || typeof document.createTextNode !== "function") return null;
  try {
    const template = document.createElement("template");
    if (!template?.content) return null;
    template.innerHTML = source;
    const parsed = template.content;
    if (!parsed || parsed.nodeType !== 11 || !withinBounds(parsed)) return null;
    const fragment = document.createDocumentFragment();
    let usable = false, imageCalls = 0;
    const scopes: SvgScope[] = [];
    const stack: Array<{ node: Node; parent: Node; svg?: SvgScope; inDefs?: boolean }> = [];
    for (let index = parsed.childNodes.length - 1; index >= 0; index--) stack.push({ node: parsed.childNodes[index], parent: fragment });
    while (stack.length) {
      const entry = stack.pop();
      if (!entry) return null;
      const { node, parent } = entry;
      if (node.nodeType === 3) {
        const data = (node as Text).data;
        if (data) {
          parent.appendChild(document.createTextNode(data));
          if (data.trim()) usable = true;
        }
        continue;
      }
      if (node.nodeType !== 1) continue;
      const element = node as Element, namespace = element.namespaceURI, tag = element.localName;
      if (!namespace || !tag || !namespaceAllows(namespace, tag, parent, fragment)) continue;
      if (namespace === HTML_NS && tag === "img") {
        if (!options?.createImage || imageCalls >= MAX_IMAGES) continue;
        const src = element.getAttribute("src");
        if (!src || src.length > MAX_IMAGE_SRC || !src.trim() || bounded(src, MAX_IMAGE_SRC) === null) continue;
        const alt = element.getAttribute("alt") ?? "", sourceLabel = element.getAttribute("data-pi-source") ?? "";
        const page = element.getAttribute("data-pi-page") ?? "", crop = element.getAttribute("data-pi-crop") ?? "";
        if (bounded(alt, MAX_IMAGE_ALT) === null || bounded(sourceLabel, MAX_IMAGE_SOURCE) === null
          || bounded(page, MAX_IMAGE_PAGE) === null || bounded(crop, MAX_IMAGE_CROP) === null) continue;
        imageCalls += 1;
        let image: HTMLElement | null = null;
        try { image = options.createImage({ src, alt, source: sourceLabel, page, crop }); } catch { image = null; }
        if (image?.nodeType === 1) { parent.appendChild(image); usable = true; }
        continue;
      }
      const allowed = namespace === HTML_NS ? HTML_TAGS.has(tag) : namespace === SVG_NS && SVG_TAGS.has(tag);
      if (!allowed) continue;
      if ((tag === "defs" && (parent as Element).localName !== "svg") || (tag === "marker" && (parent as Element).localName !== "defs")) continue;
      let { svg } = entry;
      if (namespace === SVG_NS && tag === "svg") {
        svg = { markers: new Map(), references: [] };
        scopes.push(svg);
      }
      const inDefs = entry.inDefs || tag === "defs";
      let inputType: string | null = null;
      if (namespace === HTML_NS && tag === "input") {
        const raw = element.getAttribute("type");
        inputType = raw === null || !raw.trim() ? "text" : raw.trim().toLowerCase();
        if (!INPUT_TYPES.has(inputType)) continue;
      }
      const output = namespace === SVG_NS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
      copyAttributes(element, output, namespace, tag, inputType, svg, inDefs);
      parent.appendChild(output);
      usable = true;
      for (let index = element.childNodes.length - 1; index >= 0; index--) stack.push({ node: element.childNodes[index], parent: output, svg, inDefs });
    }
    // No authored URL reaches the DOM. Create a fragment reference only for a
    // unique sanitized marker in the same SVG, after all its nodes are known.
    for (const { markers, references } of scopes) {
      for (const { element, name, id } of references) {
        const marker = markers.get(id);
        if (marker) element.setAttribute(name, `url(#${marker})`);
      }
    }
    return usable ? fragment : null;
  } catch { return null; }
}
