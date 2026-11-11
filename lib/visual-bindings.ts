import { compileVisualExpression, type VisualValue } from "./visual-expression";
import { safeVisualPaint } from "./visual-fragment";

const svgNamespace = "http://www.w3.org/2000/svg";
const validName = /^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/;
const svgNumbers = new Set([
  "x", "y", "x1", "x2", "y1", "y2", "dx", "dy", "cx", "cy", "r", "rx", "ry", "width", "height",
  "opacity", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-dashoffset", "font-size",
]);
const allowedAria = new Set(["aria-pressed", "aria-selected", "aria-expanded", "aria-checked"]);
const coordinates = /^[\d ,.eE+-]+$/;
const svgPath = /^[MmZzLlHhVvCcSsQqTtAa\d ,.eE+-]+$/;
const svgTransform = /^(?:\s*(?:translate|scale|rotate|skewX|skewY|matrix)\([\d ,.eE+-]{1,80}\)\s*){1,4}$/;
const interactiveShapes = new Set(["g", "circle", "rect", "ellipse", "line", "polyline", "polygon", "path", "text"]);
const MAX_BINDINGS = 128;
const MAX_CONTROLS = 48;
const MAX_BUTTONS = 48;

type Values = Record<string, VisualValue>;
type Control = HTMLInputElement | HTMLSelectElement;
type Update = (values: Values) => void;

function controlValue(control: Control): VisualValue | undefined {
  switch (control.type) {
    case "range": case "number": {
      const { valueAsNumber } = control as HTMLInputElement;
      return Number.isFinite(valueAsNumber) ? valueAsNumber : undefined;
    }
    case "checkbox": return (control as HTMLInputElement).checked;
    case "radio": if (!(control as HTMLInputElement).checked) return undefined;
  }
  return control.value.slice(0, 256);
}

function reflectValue(control: Control, value: VisualValue): void {
  if (control.type === "checkbox") (control as HTMLInputElement).checked = Boolean(value);
  else if (control.type === "radio") (control as HTMLInputElement).checked = control.value === String(value);
  else control.value = String(value);
}

function canBindAttribute(element: Element, attr: string): boolean {
  if (allowedAria.has(attr) || attr === "class" || attr === "title") return true;
  return element.namespaceURI === svgNamespace && (
    svgNumbers.has(attr) || ["fill", "stroke", "stroke-dasharray", "d", "points", "transform"].includes(attr)
  );
}

function attributeValue(attr: string, value: VisualValue | undefined): string | null {
  if (value === undefined) return null;
  const text = String(value);
  if (allowedAria.has(attr)) return value === true || value === false ? text : null;
  if (attr === "class") return /^[a-z\d_ -]{0,180}$/i.test(text) ? text : null;
  if (attr === "title") return text.slice(0, 220);
  if (svgNumbers.has(attr)) {
    if (typeof value === "number") return Math.abs(value) <= 1e6 ? text : null;
    return /^[+-]?\d{1,6}(?:\.\d{1,5})?(?:%|px|em|rem)?$/.test(text) ? text : null;
  }
  if (attr === "fill" || attr === "stroke") return safeVisualPaint(text) || null;
  if (attr === "d") return text.length <= 1024 && svgPath.test(text) ? text : null;
  if (attr === "points" || attr === "stroke-dasharray") return text.length <= 512 && coordinates.test(text) ? text : null;
  if (attr === "transform") return text.length <= 256 && svgTransform.test(text) ? text : null;
  return null;
}

function pair(value: string): [string, string] | undefined {
  const colon = value.indexOf(":");
  if (colon < 1) return undefined;
  return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
}

/** All parsed inputs are from the allow-listed fragment. Bind once per widget,
 * and coalesce control events into one bounded DOM update per animation frame. */
export function bindVisualControls(content: HTMLElement): () => void {
  const window = content.ownerDocument.defaultView!;
  const values: Values = Object.create(null);
  const controls = new Map<Element, Control>();
  const byName = new Map<string, Control[]>();
  for (const element of content.querySelectorAll<Control>("input[name], select[name]")) {
    if (controls.size >= MAX_CONTROLS) break;
    if (!validName.test(element.name)) continue;
    controls.set(element, element);
    const group = byName.get(element.name);
    if (group) group.push(element);
    else byName.set(element.name, [element]);
    const value = controlValue(element);
    if (value !== undefined) values[element.name] = value;
  }

  const updates: Update[] = [];
  for (const element of content.querySelectorAll("[data-pi-text], [data-pi-show], [data-pi-bind]")) {
    if (updates.length >= MAX_BINDINGS) break;
    const text = !element.childElementCount && compileVisualExpression(element.getAttribute("data-pi-text") ?? "");
    if (text) {
      const fallback = element.textContent ?? "";
      updates.push((values) => {
        const value = text(values);
        const next = value === undefined ? fallback : String(value);
        if (element.textContent !== next) element.textContent = next;
      });
    }
    const show = compileVisualExpression(element.getAttribute("data-pi-show") ?? "");
    if (show && updates.length < MAX_BINDINGS) {
      const fallback = !element.hasAttribute("hidden");
      updates.push((values) => {
        const value = show(values);
        const visible = value === undefined ? fallback : Boolean(value);
        if (visible === element.hasAttribute("hidden")) element.toggleAttribute("hidden", !visible);
      });
    }
    const spec = element.getAttribute("data-pi-bind");
    if (!spec) continue;
    for (const part of spec.split(";", 8)) {
      if (updates.length >= MAX_BINDINGS) break;
      const item = pair(part);
      if (!item || !canBindAttribute(element, item[0])) continue;
      const [attr, expression] = item;
      const evaluate = compileVisualExpression(expression);
      if (!evaluate) continue;
      const fallback = element.getAttribute(attr);
      updates.push((values) => {
        const next = attributeValue(attr, evaluate(values)) ?? fallback;
        if (element.getAttribute(attr) === next) return;
        if (next === null) element.removeAttribute(attr);
        else element.setAttribute(attr, next);
      });
    }
  }

  const render = () => { for (const update of updates) update(values); };
  render();
  if (!updates.length) return () => {};

  const buttons = new Map<Element, { name: string; evaluate: NonNullable<ReturnType<typeof compileVisualExpression>> }>();
  for (const element of content.querySelectorAll("button[data-pi-set], svg [data-pi-set]")) {
    if (buttons.size >= MAX_BUTTONS) break;
    const svg = element.namespaceURI === svgNamespace;
    if (svg && (!interactiveShapes.has(element.localName) || element.closest("button, defs") || !element.getAttribute("aria-label"))) continue;
    const action = pair(element.getAttribute("data-pi-set") ?? "");
    if (!action || !validName.test(action[0])) continue;
    const evaluate = compileVisualExpression(action[1]);
    if (!evaluate) continue;
    if (svg) {
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute("data-pi-action", "svg");
      // An SVG with role="img" flattens its descendants for assistive tech.
      element.closest("svg")?.setAttribute("role", "group");
    }
    buttons.set(element, { name: action[0], evaluate });
  }

  let frame: number | null = null;
  function assign(name: string, value: VisualValue | undefined) {
    if (values[name] === value) return;
    if (value === undefined) delete values[name];
    else values[name] = value;
    if (frame === null) frame = window.requestAnimationFrame(() => { frame = null; render(); });
  }
  function onInput(event: Event) {
    const control = controls.get(event.target as Element);
    if (control && (control.type !== "radio" || (control as HTMLInputElement).checked)) {
      assign(control.name, controlValue(control));
    }
  }
  function activate(element: Element | null) {
    const action = element && buttons.get(element);
    if (!action) return;
    const value = action.evaluate(values);
    if (value === undefined) return;
    let reflected: VisualValue | undefined;
    for (const control of byName.get(action.name) ?? []) {
      reflectValue(control, value);
      reflected ??= controlValue(control);
    }
    assign(action.name, reflected ?? value);
  }
  function onClick(event: Event) {
    activate((event.target as Element)?.closest?.("button, [data-pi-action]") ?? null);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const element = (event.target as Element)?.closest?.("[data-pi-action]");
    if (!element) return;
    event.preventDefault();
    if (!event.repeat) activate(element);
  }
  content.addEventListener("input", onInput);
  content.addEventListener("change", onInput);
  content.addEventListener("click", onClick);
  content.addEventListener("keydown", onKeyDown);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    content.removeEventListener("input", onInput);
    content.removeEventListener("change", onInput);
    content.removeEventListener("click", onClick);
    content.removeEventListener("keydown", onKeyDown);
  };
}
