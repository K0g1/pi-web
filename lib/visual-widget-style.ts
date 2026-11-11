const tones = ["positive", "negative", "water", "warning", "note", "neutral"];

// A shadow tree keeps widget labels, IDs and layout scoped to their own block.
// This sheet is app-owned; model fragments never create stylesheets.
const css = `
:host { display: block; color: var(--text); font: inherit; line-height: 1.55; }
.pi-visual-content { padding: clamp(0.68em, 2.5vw, 1.05em); max-block-size: min(70vh, 42em); overflow: auto; contain: layout paint; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
:is(p,ul,ol,dl,figure) { margin: 0.48em 0; }
:is(h1,h2,h3,h4,h5,h6) { margin: 0.3em 0 0.4em; line-height: 1.22; font-weight: 650; }
h1 { font-size: 1.35em; } h2 { font-size: 1.25em; } h3 { font-size: 1.14em; }
:is(ul,ol) { padding-inline-start: 1.35em; }
table { border-collapse: collapse; max-inline-size: 100%; font-size: 0.93em; }
td, th { padding: 0.28em 0.5em; border-block-end: 1px solid var(--border); text-align: start; }
svg { display: block; max-inline-size: 100%; height: auto; }
svg text { font-family: inherit; }
:where(svg:not([fill])) { fill: currentColor; }
svg [data-pi-action] { cursor: pointer; }
label { cursor: pointer; }
label:has(input[type=range]) { display: flex; align-items: center; flex-wrap: wrap; gap: 0.42em 0.7em; }
:is(input,button,select) { font: inherit; color: inherit; max-inline-size: 100%; }
:is(input[type=range],input[type=checkbox],input[type=radio]) { accent-color: var(--accent); margin-inline: 0; }
input[type=range] { inline-size: min(14em, 100%); min-inline-size: 5em; }
:is(button,select,input[type=number],input[type=text]) { border: 1px solid var(--border); border-radius: 0.42em; padding: 0.28em 0.62em; background: var(--bg-panel); }
input[type=number] { inline-size: 7em; }
:is(button,select,summary) { cursor: pointer; }
:is(button,summary):hover { background: var(--bg-hover); }
button[aria-pressed=true] { color: var(--accent); border-color: var(--accent); background: var(--bg-selected); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
details { padding: 0.45em 0.6em; border: 1px solid var(--border); border-radius: 0.45em; }
details + details { margin-block-start: 0.38em; }
output { font-variant-numeric: tabular-nums; }
.pi-stack { display: grid; gap: 0.65em; }
.pi-row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.55em 0.8em; }
.pi-grid { display: grid; gap: 0.7em; grid-template-columns: repeat(auto-fit, minmax(min(13em, 100%), 1fr)); }
.pi-card, .pi-callout { border: 1px solid var(--border); border-inline-start-color: var(--pi-tone, var(--border)); border-radius: 0.55em; padding: 0.6em 0.72em; background: var(--bg-panel); min-inline-size: 0; }
.pi-callout { border-inline-start-width: 2px; }
:is(.pi-card,.pi-callout) > :first-child { margin-block-start: 0; }
:is(.pi-card,.pi-callout) > :last-child { margin-block-end: 0; }
.pi-muted { color: var(--text-muted); }
.pi-sm { font-size: 0.88em; } .pi-lg { font-size: 1.18em; } .pi-xl { font-size: 1.4em; }
${tones.map((tone) => `.pi-${tone} { --pi-tone: var(--pi-${tone}); }`).join("\n")}
span[class], output[class] { color: var(--pi-tone, inherit); }
mark { background: var(--bg-selected); background: color-mix(in srgb, var(--pi-tone, var(--pi-warning)) 20%, transparent); border-radius: 0.22em; padding-inline: 0.2em; color: inherit; }
.pi-sourced-image { margin: 0.55em 0; max-inline-size: 100%; }
.pi-image-viewport { overflow: hidden; border-radius: 0.42em; position: relative; }
.pi-image-viewport > img { display: block; max-inline-size: 100%; max-block-size: 34em; object-fit: contain; object-position: top left; }
.pi-image-viewport[data-cropped] > img { position: absolute; inset: 0 auto auto 0; max-inline-size: none; max-block-size: none; }
.pi-sourced-image > figcaption { margin-block-start: 0.28em; font-size: 0.82em; color: var(--text-muted); overflow-wrap: anywhere; }
.pi-image-error { color: var(--text-muted); font-size: 0.88em; }
`;

const sharedSheets = new WeakMap<Document, CSSStyleSheet>();

export function visualWidgetStyle(root: ShadowRoot): HTMLElement | null {
  const { ownerDocument } = root;
  const Sheet = ownerDocument.defaultView?.CSSStyleSheet;
  if (Sheet && "adoptedStyleSheets" in root && "replaceSync" in Sheet.prototype) {
    let sheet = sharedSheets.get(ownerDocument);
    if (!sheet) {
      sheet = new Sheet();
      sheet.replaceSync(css);
      sharedSheets.set(ownerDocument, sheet);
    }
    root.adoptedStyleSheets = [sheet];
    return null;
  }
  const style = ownerDocument.createElement("style");
  style.textContent = css;
  return style;
}
