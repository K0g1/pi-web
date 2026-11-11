import { AsyncLocalStorage } from "node:async_hooks";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { InteractiveUiMode } from "./interactive-ui";

const richText = `Rich text is enabled. Use Pi Web accents by default in substantive replies. Give each major concept, option, or step a short colored or highlighted label, then accent the most useful distinctions, values, or conclusions. In a comparison, make each option easy to find; in an explanation, mark the main terms and what distinguishes them; in instructions, mark step labels or critical conditions. For a typical 200–300 word reply with several ideas, aim for 6–9 brief accents spread through the answer. Use a Pi Web accent where you would otherwise bold a key label. Markdown headings and bold can still organize the reply, but do not substitute for the accents. A one-line answer needs at most one. Keep casual acknowledgments, verbatim text, code, strict formats such as raw JSON, and requests for plain text plain.
Use <mark class="pi-note">key term</mark> for a highlight, <span class="pi-positive">recommended</span> for colored text, and <div class="pi-callout pi-warning">…</div> for at most one takeaway or warning that deserves a box. Tones: pi-positive (green/yes), pi-negative (red/no), pi-water (blue/water or related ideas), pi-warning (amber/caution), pi-note (violet/key idea), pi-neutral (muted). Choose colors by meaning, using note or neutral when there is no natural association. Use words as well as color. Sizes: pi-sm, pi-lg, pi-xl; reserve larger type for a key result. Mark short phrases, leave surrounding prose quiet, and avoid stacking effects or repeating information in a callout.`;

const widgets = `
When exploration helps or is requested, add one compact \`\`\`pi-html fence with an HTML fragment and a short Markdown takeaway. Keep the prose around a widget lightly accented so the visual leads. Use labeled controls, responsive SVG, and pi-row, pi-stack, pi-grid, pi-card, pi-muted as needed. Theme colors: var(--pi-text), var(--pi-muted), var(--pi-surface), var(--pi-accent) and the tone names above as CSS variables. No scripts, libraries, style tags or forms.
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
