import { AsyncLocalStorage } from "node:async_hooks";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { InteractiveUiMode } from "./interactive-ui";

const richText = `Use plain Markdown by default. When an accent improves understanding, use <span class="pi-positive">yes</span> (colored text), <mark class="pi-water">water</mark> (highlight), or <div class="pi-callout pi-warning">…</div> (short callout). Tones: pi-positive (green/yes), pi-negative (red/no), pi-water (blue/water), pi-warning (amber/caution), pi-note (violet), pi-neutral. Sizes: pi-sm, pi-lg, pi-xl. Use labels as well as color. Avoid decorating whole paragraphs or repeating information.`;

const widgets = `
When exploration helps or is requested, add one compact \`\`\`pi-html fence with an HTML fragment and a short Markdown takeaway. Use labeled controls, responsive SVG, and pi-row, pi-stack, pi-grid, pi-card, pi-muted as needed. Theme colors: var(--pi-text), var(--pi-muted), var(--pi-surface), var(--pi-accent) and the tone names above as CSS variables. No scripts, libraries, style tags or forms.
Named inputs/selects provide variables (range/number → number, checkbox → boolean, radio/text/select → string). Example: <label>Speed <input name="speed" type="range" min="1" max="20" value="5"></label><output data-pi-text="'Distance: '+speed*2+' m'"></output>. data-pi-show="condition" toggles a panel; data-pi-bind="width: speed*2; x: 5" updates SVG. Clickable states: <input type="hidden" name="stage" value="start"><button data-pi-set="stage: 'next'">Next</button>. Use formulas over lookup tables: ceil(80/weekly), fixed(x,1), sin(angle*pi/180), min/max, sqrt, arithmetic, comparisons, ternary. Escape &lt; and &amp;&amp; in HTML attributes. Native details/summary work.
If an image helps, use <img src="./figure.png" alt="What to notice" data-pi-source="Lecture.pdf" data-pi-page="4"> in the widget or on its own. Use a real local image or verified public HTTPS image URL. For a document excerpt, export the region as PNG with available tools and credit the original file and page when known. Never invent paths or sources. The UI adds the caption.`;

export function interactiveUiInstructions(mode: InteractiveUiMode): string | undefined {
  if (mode === "off") return undefined;
  return mode === "rich" ? richText : richText + widgets;
}

/** Scope the preference to the submitting request: another browser or queued
 * message cannot overwrite the options of a run that is already starting. */
export function createInteractiveUiPromptContext() {
  const scope = new AsyncLocalStorage<InteractiveUiMode>();
  const extension: InlineExtension = {
    name: "pi-web-interactive-ui",
    hidden: true,
    factory: (pi) => {
      pi.on("before_agent_start", ({ systemPromptOptions }) => {
        const instructions = interactiveUiInstructions(scope.getStore() ?? "off");
        if (!instructions) return;
        if (systemPromptOptions.forceSystemPrompt !== undefined) {
          systemPromptOptions.forceSystemPrompt = [systemPromptOptions.forceSystemPrompt, instructions].filter(Boolean).join("\n\n");
        } else {
          systemPromptOptions.sections.pi_web_visuals = instructions;
        }
      });
    },
  };
  return { extension, run<T>(mode: InteractiveUiMode, callback: () => T): T { return scope.run(mode, callback); } };
}
