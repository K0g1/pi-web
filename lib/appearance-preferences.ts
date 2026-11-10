export const APPEARANCE_STORAGE_KEY = "pi-web:appearance";
export const APPEARANCE_STORAGE_VERSION = 1;

export const APPEARANCE_SLIDERS = {
  interfaceSize: { min: 12, max: 18, step: 1, default: 13, unit: "px", css: "--pi-interface-size" },
  sidebarSize: { min: 10, max: 18, step: 1, default: 12, unit: "px", css: "--pi-sidebar-size" },
  messageSpacing: { min: 8, max: 36, step: 1, default: 16, unit: "px", css: "--pi-message-spacing" },
  lineHeight: { min: 1.3, max: 2, step: 0.05, default: 1.7, unit: "", css: "--pi-line-height" },
  radius: { min: 0, max: 24, step: 1, default: 12, unit: "px", css: "--pi-radius" },
  toolbarHeight: { min: 30, max: 58, step: 1, default: 36, unit: "px", css: "--pi-toolbar-height" },
  composerInset: { min: 8, max: 40, step: 1, default: 16, unit: "px", css: "--pi-composer-inset" },
  borderStrength: { min: 0, max: 100, step: 5, default: 100, unit: "%", css: "--pi-border-strength" },
} as const;

export type AppearanceSliderKey = keyof typeof APPEARANCE_SLIDERS;
type AppearanceSlider = (typeof APPEARANCE_SLIDERS)[AppearanceSliderKey];

export const APPEARANCE_CHOICES = {
  topBar: ["auto", "always", "hover"],
  minimap: ["auto", "always", "hover", "hidden"],
  messageMetadata: ["auto", "always", "hover", "hidden"],
  extensionStatus: ["auto", "always", "hover", "hidden"],
  composerControls: ["auto", "always", "hover"],
  messageStyle: ["bubble", "flat", "outline"],
  chatAlignment: ["center", "left"],
  motion: ["system", "reduced"],
} as const satisfies Record<string, readonly string[]>;

export type AppearanceChoiceKey = keyof typeof APPEARANCE_CHOICES;
export type AppearanceChoice = (typeof APPEARANCE_CHOICES)[AppearanceChoiceKey][number];

export const APPEARANCE_COLORS = [
  "bg",
  "bg-panel",
  "bg-hover",
  "bg-selected",
  "border",
  "text",
  "text-muted",
  "text-dim",
  "accent",
  "accent-hover",
  "accent-contrast",
  "user-bg",
  "assistant-bg",
  "tool-bg",
] as const;

export type AppearanceColor = (typeof APPEARANCE_COLORS)[number];

export type AppearancePreferences = {
  [Key in AppearanceSliderKey]: number;
} & {
  [Key in AppearanceChoiceKey]: (typeof APPEARANCE_CHOICES)[Key][number];
} & {
  colors: Partial<Record<AppearanceColor, string>>;
};

const SLIDER_DEFAULTS = Object.fromEntries(
  Object.entries(APPEARANCE_SLIDERS).map(([key, spec]) => [key, spec.default]),
) as Record<AppearanceSliderKey, number>;

const CHOICE_DEFAULTS = Object.fromEntries(
  Object.entries(APPEARANCE_CHOICES).map(([key, values]) => [key, values[0]]),
) as { [Key in AppearanceChoiceKey]: (typeof APPEARANCE_CHOICES)[Key][number] };

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  ...SLIDER_DEFAULTS,
  ...CHOICE_DEFAULTS,
  colors: {},
};

const RGB_HEX = /^#[0-9a-fA-F]{6}$/;

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Storage and Studio imports use `{ version, preferences }`; flat objects remain importable. */
function appearanceSource(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  if (hasOwn(input, "version") && hasOwn(input, "preferences")) {
    if (input.version !== APPEARANCE_STORAGE_VERSION || !isRecord(input.preferences)) return {};
    return input.preferences;
  }
  return input;
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const point = text.indexOf(".");
  return point < 0 ? 0 : text.length - point - 1;
}

function normalizeSlider(value: unknown, spec: AppearanceSlider): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return spec.default;
  const clamped = Math.min(spec.max, Math.max(spec.min, numeric));
  const snapped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
  const rounded = Number(snapped.toFixed(decimalPlaces(spec.step)));
  return Math.min(spec.max, Math.max(spec.min, rounded));
}

export function normalizeAppearancePreferences(input: unknown): AppearancePreferences {
  const source = appearanceSource(input);
  const result = { ...DEFAULT_APPEARANCE, colors: {} } as AppearancePreferences;

  for (const key of Object.keys(APPEARANCE_SLIDERS) as AppearanceSliderKey[]) {
    result[key] = normalizeSlider(source[key], APPEARANCE_SLIDERS[key]);
  }

  const choiceValues = result as unknown as Record<AppearanceChoiceKey, AppearanceChoice>;
  for (const key of Object.keys(APPEARANCE_CHOICES) as AppearanceChoiceKey[]) {
    const values = APPEARANCE_CHOICES[key];
    const value = source[key];
    choiceValues[key] = ((values as readonly unknown[]).includes(value) ? value : values[0]) as AppearanceChoice;
  }

  if (isRecord(source.colors)) {
    for (const color of APPEARANCE_COLORS) {
      if (!hasOwn(source.colors, color)) continue;
      const value = source.colors[color];
      if (typeof value === "string" && RGB_HEX.test(value)) result.colors[color] = value;
    }
  }

  return result;
}

export function parseAppearancePreferences(raw: string | null): AppearancePreferences {
  if (typeof raw !== "string" || raw.length === 0) return normalizeAppearancePreferences(null);
  try {
    return normalizeAppearancePreferences(JSON.parse(raw));
  } catch {
    return normalizeAppearancePreferences(null);
  }
}

/** Appearance-only export. The existing `pi-theme` preference stays untouched. */
export function serializeAppearancePreferences(value: AppearancePreferences): string {
  return JSON.stringify({
    version: APPEARANCE_STORAGE_VERSION,
    preferences: normalizeAppearancePreferences(value),
  });
}

function choiceAttribute(key: AppearanceChoiceKey): string {
  return `data-pi-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** Apply only validated values. Defaults remove overrides so base and mobile styles win. */
export function applyAppearancePreferences(input: unknown): void {
  if (typeof document === "undefined") return;
  const preferences = normalizeAppearancePreferences(input);
  const root = document.documentElement;

  for (const key of Object.keys(APPEARANCE_SLIDERS) as AppearanceSliderKey[]) {
    const spec = APPEARANCE_SLIDERS[key];
    const value = preferences[key];
    if (value === spec.default) root.style.removeProperty(spec.css);
    else root.style.setProperty(spec.css, `${value}${spec.unit}`);
  }

  for (const key of Object.keys(APPEARANCE_CHOICES) as AppearanceChoiceKey[]) {
    const attribute = choiceAttribute(key);
    const value = preferences[key];
    if (value === APPEARANCE_CHOICES[key][0]) root.removeAttribute(attribute);
    else root.setAttribute(attribute, value);
  }

  for (const color of APPEARANCE_COLORS) {
    const value = preferences.colors[color];
    if (value) root.style.setProperty(`--${color}`, value);
    else root.style.removeProperty(`--${color}`);
  }
}

// Runs before first paint. The schema is serialized from the same constants used
// by the runtime; user strings never become CSS or HTML.
export const APPEARANCE_INIT_SCRIPT = `(function(){
var key=${JSON.stringify(APPEARANCE_STORAGE_KEY)};
var version=${JSON.stringify(APPEARANCE_STORAGE_VERSION)};
var sliders=${JSON.stringify(APPEARANCE_SLIDERS)};
var choices=${JSON.stringify(APPEARANCE_CHOICES)};
var colors=${JSON.stringify(APPEARANCE_COLORS)};
function has(value,key){return Object.prototype.hasOwnProperty.call(value,key)}
function isObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)}
function decimals(value){var text=String(value),point=text.indexOf(".");return point<0?0:text.length-point-1}
function number(value,spec){
  if(typeof value!=="number"&&!(typeof value==="string"&&value.trim()!==""))return spec.default;
  var numeric=Number(value);
  if(!isFinite(numeric))return spec.default;
  numeric=Math.min(spec.max,Math.max(spec.min,numeric));
  var snapped=spec.min+Math.round((numeric-spec.min)/spec.step)*spec.step;
  return Math.min(spec.max,Math.max(spec.min,Number(snapped.toFixed(decimals(spec.step)))))
}
function normalize(input){
  var source=input;
  if(isObject(source)&&has(source,"version")&&has(source,"preferences")){
    source=source.version===version&&isObject(source.preferences)?source.preferences:{}
  }else if(!isObject(source)){source={}}
  var out={colors:{}},key;
  for(key in sliders)out[key]=number(source[key],sliders[key]);
  for(key in choices)out[key]=choices[key].indexOf(source[key])>=0?source[key]:choices[key][0];
  if(isObject(source.colors)){
    for(var index=0;index<colors.length;index++){
      var color=colors[index],value=source.colors[color];
      if(has(source.colors,color)&&typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value))out.colors[color]=value
    }
  }
  return out
}
function apply(preferences){
  var root=document.documentElement,style=root.style,key;
  for(key in sliders){
    var spec=sliders[key],value=preferences[key];
    if(value===spec.default)style.removeProperty(spec.css);
    else style.setProperty(spec.css,String(value)+spec.unit)
  }
  for(key in choices){
    var attribute="data-pi-"+key.replace(/[A-Z]/g,function(letter){return "-"+letter.toLowerCase()});
    if(preferences[key]===choices[key][0])root.removeAttribute(attribute);
    else root.setAttribute(attribute,preferences[key])
  }
  for(var index=0;index<colors.length;index++){
    var color=colors[index],value=preferences.colors[color];
    if(value)style.setProperty("--"+color,value);
    else style.removeProperty("--"+color)
  }
}
function read(){
  try{
    var raw=localStorage.getItem(key);
    return raw?normalize(JSON.parse(raw)):normalize(null)
  }catch(error){return normalize(null)}
}
apply(read());
try{
  window.addEventListener("storage",function(event){
    if(event.key===null||event.key===key)apply(read())
  })
}catch(error){}
})();`;
