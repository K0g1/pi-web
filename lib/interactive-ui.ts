export const INTERACTIVE_UI_MODES = ["off", "rich", "interactive"] as const;
export type InteractiveUiMode = (typeof INTERACTIVE_UI_MODES)[number];
export const INTERACTIVE_UI_FENCE = "pi-html";
export const INTERACTIVE_UI_MODE_EVENT = "pi-interactive-ui-mode";
const storageKey = "pi-interactive-ui";

export function parseInteractiveUiMode(value: unknown): InteractiveUiMode {
  return value === "rich" || value === "interactive" ? value : "off";
}

export const INTERACTIVE_UI_COMMANDS = [
  { name: "interactive-ui", description: "interactiveUi.commandCycle", mode: null },
  { name: "interactive-ui-off", description: "interactiveUi.commandOff", mode: "off" },
  { name: "interactive-ui-rich", description: "interactiveUi.commandRich", mode: "rich" },
  { name: "interactive-ui-live", description: "interactiveUi.commandLive", mode: "interactive" },
] as const;

/** undefined is another command; null is a recognized command with invalid arguments. */
export function resolveInteractiveUiCommand(name: string, args: string, current: InteractiveUiMode): InteractiveUiMode | null | undefined {
  const command = INTERACTIVE_UI_COMMANDS.find((item) => item.name === name);
  if (!command) return undefined;
  if (command.mode) return args ? null : command.mode;
  if (!args) return INTERACTIVE_UI_MODES[(INTERACTIVE_UI_MODES.indexOf(current) + 1) % INTERACTIVE_UI_MODES.length];
  switch (args.toLowerCase()) {
    case "off": return "off";
    case "rich": case "format": return "rich";
    case "live": case "interactive": return "interactive";
    default: return null;
  }
}

export function getInteractiveUiMode(): InteractiveUiMode {
  return typeof document === "undefined" ? "off" : parseInteractiveUiMode(document.documentElement?.dataset?.interactiveUi);
}

export function interactiveUiPromptPreference() {
  const interactiveUiMode = getInteractiveUiMode();
  return interactiveUiMode === "off" ? {} : { interactiveUiMode };
}

export function setInteractiveUiMode(mode: InteractiveUiMode): void {
  if (getInteractiveUiMode() === mode || typeof window === "undefined") return;
  document.documentElement.dataset.interactiveUi = mode;
  try { window.localStorage.setItem(storageKey, mode); } catch { /* stays usable in this tab */ }
  window.dispatchEvent(new Event(INTERACTIVE_UI_MODE_EVENT));
}

/** Apply the setting before paint, and sync tabs even if there are no widgets mounted. */
export const INTERACTIVE_UI_INIT_SCRIPT = `(()=>{
const key=${JSON.stringify(storageKey)}, event=${JSON.stringify(INTERACTIVE_UI_MODE_EVENT)};
const apply=value=>{document.documentElement.dataset.interactiveUi=value==='rich'||value==='interactive'?value:'off'};
try{apply(localStorage.getItem(key))}catch{apply(null)}
addEventListener('storage',e=>{if(e.key===key||e.key===null){apply(e.newValue);dispatchEvent(new Event(event))}})
})()`;
