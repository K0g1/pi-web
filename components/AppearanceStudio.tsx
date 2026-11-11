"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useI18n } from "@/hooks/useI18n";
import { useInteractiveUiMode } from "@/hooks/useInteractiveUi";
import { INTERACTIVE_UI_MODES, parseInteractiveUiMode, setInteractiveUiMode } from "@/lib/interactive-ui";
import {
  useAppearanceChoice,
  useAppearancePreferences,
} from "@/hooks/useAppearancePreferences";
import { useTheme } from "@/hooks/useTheme";
import {
  APPEARANCE_CHOICES,
  APPEARANCE_COLORS,
  APPEARANCE_SLIDERS,
  DEFAULT_APPEARANCE,
  normalizeAppearancePreferences,
  type AppearanceChoice,
  type AppearanceChoiceKey,
  type AppearanceColor,
  type AppearancePreferences,
  type AppearanceSliderKey,
} from "@/lib/appearance-preferences";
import { isThemePreference, type ThemePreference } from "@/lib/theme";
import styles from "./AppearanceStudio.module.css";

const SLIDER_KEYS = Object.keys(APPEARANCE_SLIDERS) as AppearanceSliderKey[];
const CHOICE_KEYS = Object.keys(APPEARANCE_CHOICES) as AppearanceChoiceKey[];
const TABS = [
  { id: "layout", labelKey: "appearance.layout" },
  { id: "colors", labelKey: "appearance.colors" },
  { id: "controls", labelKey: "appearance.controls" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const APPEARANCE_FILE_FORMAT = "pi-web-appearance";
const APPEARANCE_FILE_VERSION = 1;
const MAX_IMPORT_BYTES = 64 * 1024;

const SLIDER_LABEL_KEYS: Record<AppearanceSliderKey, string> = {
  interfaceSize: "appearance.slider.interfaceSize",
  sidebarSize: "appearance.slider.sidebarSize",
  messageSpacing: "appearance.slider.messageSpacing",
  lineHeight: "appearance.slider.lineHeight",
  radius: "appearance.slider.radius",
  toolbarHeight: "appearance.slider.toolbarHeight",
  composerInset: "appearance.slider.composerInset",
  borderStrength: "appearance.slider.borderStrength",
};

const CHOICE_LABEL_KEYS: Record<AppearanceChoiceKey, string> = {
  topBar: "appearance.choice.topBar",
  minimap: "appearance.choice.minimap",
  messageMetadata: "appearance.choice.messageMetadata",
  extensionStatus: "appearance.choice.extensionStatus",
  composerControls: "appearance.choice.composerControls",
  messageStyle: "appearance.choice.messageStyle",
  chatAlignment: "appearance.choice.chatAlignment",
  motion: "appearance.choice.motion",
};

const OPTION_LABEL_KEYS: Record<AppearanceChoice, string> = {
  auto: "appearance.option.auto",
  always: "appearance.option.always",
  hover: "appearance.option.hover",
  hidden: "appearance.option.hidden",
  bubble: "appearance.option.bubble",
  flat: "appearance.option.flat",
  outline: "appearance.option.outline",
  center: "appearance.option.center",
  left: "appearance.option.left",
  system: "appearance.option.system",
  reduced: "appearance.option.reduced",
};

const COLOR_LABEL_KEYS: Record<AppearanceColor, string> = {
  bg: "appearance.color.bg",
  "bg-panel": "appearance.color.bgPanel",
  "bg-hover": "appearance.color.bgHover",
  "bg-selected": "appearance.color.bgSelected",
  border: "appearance.color.border",
  text: "appearance.color.text",
  "text-muted": "appearance.color.textMuted",
  "text-dim": "appearance.color.textDim",
  accent: "appearance.color.accent",
  "accent-hover": "appearance.color.accentHover",
  "accent-contrast": "appearance.color.accentContrast",
  "user-bg": "appearance.color.userBg",
  "assistant-bg": "appearance.color.assistantBg",
  "tool-bg": "appearance.color.toolBg",
};

const COLOR_GROUPS: ReadonlyArray<{ labelKey: string; tokens: readonly AppearanceColor[] }> = [
  {
    labelKey: "appearance.colorGroup.surfaces",
    tokens: ["bg", "bg-panel", "bg-hover", "bg-selected", "border"],
  },
  {
    labelKey: "appearance.colorGroup.text",
    tokens: ["text", "text-muted", "text-dim"],
  },
  {
    labelKey: "appearance.colorGroup.accent",
    tokens: ["accent", "accent-hover", "accent-contrast"],
  },
  {
    labelKey: "appearance.colorGroup.messages",
    tokens: ["user-bg", "assistant-bg", "tool-bg"],
  },
];

const PRESETS: ReadonlyArray<{
  id: string;
  labelKey: string;
  hintKey: string;
  preferences: AppearancePreferences;
}> = [
  {
    id: "default",
    labelKey: "appearance.preset.default",
    hintKey: "appearance.preset.defaultHint",
    preferences: DEFAULT_APPEARANCE,
  },
  {
    id: "compact",
    labelKey: "appearance.preset.compact",
    hintKey: "appearance.preset.compactHint",
    preferences: {
      ...DEFAULT_APPEARANCE,
      interfaceSize: 12,
      sidebarSize: 10,
      messageSpacing: 8,
      lineHeight: 1.3,
      radius: 4,
      toolbarHeight: 30,
      composerInset: 8,
      borderStrength: 70,
      topBar: "hover",
      minimap: "hidden",
      messageMetadata: "hidden",
      extensionStatus: "hidden",
      composerControls: "hover",
      messageStyle: "flat",
      chatAlignment: "left",
      motion: "system",
      colors: {},
    },
  },
  {
    id: "roomy",
    labelKey: "appearance.preset.roomy",
    hintKey: "appearance.preset.roomyHint",
    preferences: {
      ...DEFAULT_APPEARANCE,
      interfaceSize: 15,
      sidebarSize: 13,
      messageSpacing: 28,
      lineHeight: 1.8,
      radius: 16,
      toolbarHeight: 46,
      composerInset: 28,
      borderStrength: 100,
      topBar: "always",
      minimap: "always",
      messageMetadata: "always",
      extensionStatus: "auto",
      composerControls: "always",
      messageStyle: "bubble",
      chatAlignment: "center",
      motion: "system",
      colors: {},
    },
  },
  {
    id: "focused",
    labelKey: "appearance.preset.focused",
    hintKey: "appearance.preset.focusedHint",
    preferences: {
      ...DEFAULT_APPEARANCE,
      interfaceSize: 14,
      sidebarSize: 11,
      messageSpacing: 24,
      lineHeight: 1.7,
      radius: 8,
      toolbarHeight: 32,
      composerInset: 20,
      borderStrength: 35,
      topBar: "hover",
      minimap: "hidden",
      messageMetadata: "hover",
      extensionStatus: "hidden",
      composerControls: "hover",
      messageStyle: "flat",
      chatAlignment: "center",
      motion: "reduced",
      colors: {},
    },
  },
];
type Preset = (typeof PRESETS)[number];

type Translate = ReturnType<typeof useI18n>["t"];
type SetPreferences = ReturnType<typeof useAppearancePreferences>["setPreferences"];
type Status = { tone: "success" | "error" | "info"; message: string };

function cloneAppearance(value: AppearancePreferences): AppearancePreferences {
  return { ...value, colors: { ...value.colors } };
}

function sameColors(
  left: AppearancePreferences["colors"],
  right: AppearancePreferences["colors"],
): boolean {
  const leftKeys = Object.keys(left) as AppearanceColor[];
  const rightKeys = Object.keys(right) as AppearanceColor[];
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => left[key] === right[key]);
}

function samePreferences(left: AppearancePreferences, right: AppearancePreferences): boolean {
  return SLIDER_KEYS.every((key) => left[key] === right[key])
    && CHOICE_KEYS.every((key) => left[key] === right[key])
    && sameColors(left.colors, right.colors);
}

function withSlider(
  current: AppearancePreferences,
  key: AppearanceSliderKey,
  value: number,
): AppearancePreferences {
  return { ...current, [key]: value } as AppearancePreferences;
}

function withChoice(
  current: AppearancePreferences,
  key: AppearanceChoiceKey,
  value: AppearanceChoice,
): AppearancePreferences {
  return { ...current, [key]: value } as AppearancePreferences;
}

function withColor(
  current: AppearancePreferences,
  token: AppearanceColor,
  value: string,
): AppearancePreferences {
  return { ...current, colors: { ...current.colors, [token]: value } };
}

function withoutColor(
  current: AppearancePreferences,
  token: AppearanceColor,
): AppearancePreferences {
  const colors = { ...current.colors };
  delete colors[token];
  return { ...current, colors };
}

function withSliderDefaults(current: AppearancePreferences): AppearancePreferences {
  const next = { ...current };
  const values = next as unknown as Record<AppearanceSliderKey, number>;
  for (const key of SLIDER_KEYS) values[key] = APPEARANCE_SLIDERS[key].default;
  return next;
}

function withChoiceDefaults(current: AppearancePreferences): AppearancePreferences {
  const next = { ...current };
  const values = next as unknown as Record<AppearanceChoiceKey, AppearanceChoice>;
  for (const key of CHOICE_KEYS) values[key] = APPEARANCE_CHOICES[key][0];
  return next;
}

function formatSliderValue(key: AppearanceSliderKey, value: number): string {
  const slider = APPEARANCE_SLIDERS[key];
  const decimals = String(slider.step).includes(".") ? 2 : 0;
  const formatted = decimals > 0
    ? value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
    : String(Math.round(value));
  return `${formatted}${slider.unit}`;
}

function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    const [red, green, blue] = candidate.slice(1).split("");
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return null;
}

function computedColorToHex(value: string): string | null {
  const direct = normalizeHex(value);
  if (direct) return direct;
  const match = value.trim().match(
    /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*(?:,|\/)\s*([\d.]+))?\s*\)$/i,
  );
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const channels = [match[1], match[2], match[3]].map(Number);
  if (!Number.isFinite(alpha) || alpha < 1 || !channels.every(Number.isFinite)) return null;
  return `#${channels
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ParsedAppearanceFile =
  | { ok: true; preferences: AppearancePreferences; theme: ThemePreference }
  | { ok: false; reason: "version" | "invalid" };

function parseAppearanceFile(value: unknown): ParsedAppearanceFile {
  if (!isRecord(value) || value.format !== APPEARANCE_FILE_FORMAT) {
    return { ok: false, reason: "invalid" };
  }
  if (value.version !== APPEARANCE_FILE_VERSION) {
    return { ok: false, reason: "version" };
  }
  if (!isThemePreference(value.theme) || !isRecord(value.appearance)) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    preferences: normalizeAppearancePreferences(value.appearance),
    theme: value.theme,
  };
}

function createAppearanceFile(preferences: AppearancePreferences, theme: ThemePreference) {
  return {
    format: APPEARANCE_FILE_FORMAT,
    version: APPEARANCE_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    theme,
    appearance: normalizeAppearancePreferences(preferences),
  };
}

function ResetIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
    </svg>
  );
}

function HexColorInput({
  value,
  label,
  invalidMessage,
  onCommit,
}: {
  value: string;
  label: string;
  invalidMessage: string;
  onCommit: (value: string) => void;
}) {
  const errorId = useId();
  const [invalid, setInvalid] = useState(false);

  const commit = (input: HTMLInputElement) => {
    const normalized = normalizeHex(input.value);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    input.value = normalized;
    onCommit(normalized);
  };

  return (
    <>
      <input
        key={value}
        type="text"
        className={styles.hexInput}
        defaultValue={value}
        maxLength={7}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onInput={() => {
          if (invalid) setInvalid(false);
        }}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget);
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.currentTarget.value = value;
            setInvalid(false);
            event.currentTarget.blur();
          }
        }}
      />
      {invalid && (
        <span id={errorId} className={styles.visuallyHidden}>
          {invalidMessage}
        </span>
      )}
    </>
  );
}

function SliderField({
  sliderKey,
  value,
  setPreferences,
  t,
}: {
  sliderKey: AppearanceSliderKey;
  value: number;
  setPreferences: SetPreferences;
  t: Translate;
}) {
  const id = useId();
  const slider = APPEARANCE_SLIDERS[sliderKey];
  const label = t(SLIDER_LABEL_KEYS[sliderKey]);
  const valueText = formatSliderValue(sliderKey, value);
  const isDefault = value === slider.default;

  return (
    <div className={styles.sliderRow} data-appearance-slider={sliderKey}>
      <div className={styles.sliderHeader}>
        <label htmlFor={id} className={styles.sliderLabel}>
          {label}
        </label>
        <output htmlFor={id} className={styles.sliderValue}>
          {valueText}
        </output>
        <button
          type="button"
          className={styles.iconButton}
          data-appearance-slider-reset={sliderKey}
          aria-label={t("appearance.resetSlider", { name: label })}
          title={t("appearance.resetSlider", { name: label })}
          disabled={isDefault}
          onClick={() => setPreferences((current) => withSlider(current, sliderKey, slider.default))}
        >
          <ResetIcon />
        </button>
      </div>
      <input
        id={id}
        className={styles.sliderInput}
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => {
          setPreferences((current) => withSlider(current, sliderKey, Number(event.target.value)));
        }}
      />
    </div>
  );
}

function ChoiceField({
  choiceKey,
  setPreferences,
  t,
}: {
  choiceKey: AppearanceChoiceKey;
  setPreferences: SetPreferences;
  t: Translate;
}) {
  const id = useId();
  const value = useAppearanceChoice(choiceKey);
  const options = APPEARANCE_CHOICES[choiceKey] as readonly AppearanceChoice[];
  const defaultValue = options[0];
  const label = t(CHOICE_LABEL_KEYS[choiceKey]);

  return (
    <div className={styles.choiceRow} data-appearance-choice={choiceKey}>
      <label htmlFor={id} className={styles.choiceLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => {
          const next = event.target.value as AppearanceChoice;
          setPreferences((current) => withChoice(current, choiceKey, next));
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(OPTION_LABEL_KEYS[option])}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.iconButton}
        data-appearance-choice-reset={choiceKey}
        aria-label={t("appearance.resetChoice", { name: label })}
        title={t("appearance.resetChoice", { name: label })}
        disabled={value === defaultValue}
        onClick={() => setPreferences((current) => withChoice(current, choiceKey, defaultValue))}
      >
        <ResetIcon />
      </button>
    </div>
  );
}

function ColorField({
  token,
  override,
  effective,
  setPreferences,
  t,
}: {
  token: AppearanceColor;
  override: string | undefined;
  effective: string;
  setPreferences: SetPreferences;
  t: Translate;
}) {
  const colorId = useId();
  const label = t(COLOR_LABEL_KEYS[token]);
  const resolved = normalizeHex(override ?? effective) ?? "#808080";

  return (
    <div
      className={styles.colorRow}
      data-appearance-color={token}
      data-custom={override ? "true" : undefined}
    >
      <div className={styles.colorTop}>
        <label htmlFor={colorId} className={styles.colorName}>
          {label}
        </label>
        <span className={styles.colorSource}>
          {override ? t("appearance.colorCustom") : t("appearance.colorTheme")}
        </span>
      </div>
      <div className={styles.colorControls}>
        <input
          id={colorId}
          className={styles.colorInput}
          type="color"
          value={resolved}
          title={resolved}
          aria-label={t("appearance.colorInputLabel", { name: label })}
          data-appearance-color-input={token}
          onChange={(event) => {
            const next = normalizeHex(event.target.value);
            if (next) setPreferences((current) => withColor(current, token, next));
          }}
        />
        <HexColorInput
          value={resolved}
          label={t("appearance.hexInputLabel", { name: label })}
          invalidMessage={t("appearance.colorInvalid")}
          onCommit={(next) => setPreferences((current) => withColor(current, token, next))}
        />
        <button
          type="button"
          className={styles.iconButton}
          data-appearance-color-reset={token}
          aria-label={t("appearance.resetColor", { name: label })}
          title={t("appearance.resetColor", { name: label })}
          disabled={!override}
          onClick={() => setPreferences((current) => withoutColor(current, token))}
        >
          <ResetIcon />
        </button>
      </div>
    </div>
  );
}

function AppearancePreview({
  preferences,
  t,
}: {
  preferences: AppearancePreferences;
  t: Translate;
}) {
  const style = {
    "--preview-interface-size": `${preferences.interfaceSize}px`,
    "--preview-sidebar-size": `${preferences.sidebarSize}px`,
    "--preview-message-spacing": `${preferences.messageSpacing}px`,
    "--preview-line-height": String(preferences.lineHeight),
    "--preview-radius": `${preferences.radius}px`,
    "--preview-toolbar-height": `${preferences.toolbarHeight}px`,
    "--preview-composer-inset": `${preferences.composerInset}px`,
    "--preview-border-strength": `${preferences.borderStrength}%`,
  } as CSSProperties;

  return (
    <div
      className={styles.preview}
      style={style}
      data-appearance-preview
      data-pi-top-bar={preferences.topBar}
      data-pi-minimap={preferences.minimap}
      data-pi-message-metadata={preferences.messageMetadata}
      data-pi-extension-status={preferences.extensionStatus}
      data-pi-composer-controls={preferences.composerControls}
      data-pi-message-style={preferences.messageStyle}
      data-pi-chat-alignment={preferences.chatAlignment}
      data-pi-motion={preferences.motion}
      role="img"
      aria-label={t("appearance.previewLabel")}
    >
      <div className={styles.previewSidebar} aria-hidden="true">
        <span className={styles.previewBrand}>{t("appearance.previewSidebar")}</span>
        <span className={styles.previewSidebarRow} />
        <span className={styles.previewSidebarRow} />
        <span className={styles.previewSidebarRowShort} />
      </div>
      <div className={styles.previewMain} aria-hidden="true">
        <div className={styles.previewTopBar}>
          <span className={styles.previewTitle}>{t("appearance.previewTitle")}</span>
          <span className={styles.previewStatus}>{t("appearance.previewStatus")}</span>
        </div>
        <div className={styles.previewContent}>
          <span className={styles.previewMinimap} />
          <div className={styles.previewMessages}>
            <div className={styles.previewMessage} data-role="user">
              <span>{t("appearance.previewUser")}</span>
              <span className={styles.previewMeta}>{t("appearance.previewMessageMeta")}</span>
            </div>
            <div className={styles.previewMessage} data-role="assistant">
              <span>{t("appearance.previewAssistant")}</span>
              <span className={styles.previewMeta}>{t("appearance.previewMessageMeta")}</span>
            </div>
          </div>
          <div className={styles.previewComposer}>
            <span className={styles.previewComposerText}>{t("appearance.previewComposer")}</span>
            <span className={styles.previewComposerControls}>{t("appearance.previewSend")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractiveUiChoice() {
  const { t } = useI18n();
  const id = useId();
  const mode = useInteractiveUiMode();
  return (
    <div className={styles.choiceList}>
      <div className={styles.choiceRow}>
        <label className={styles.choiceLabel} htmlFor={id}>{t("interactiveUi.label")}</label>
        <select id={id} aria-describedby={`${id}-description`} className={styles.select} value={mode} onChange={(event) => setInteractiveUiMode(parseInteractiveUiMode(event.target.value))}>
          {INTERACTIVE_UI_MODES.map((value) => <option key={value} value={value}>{t(`interactiveUi.mode.${value}`)}</option>)}
        </select>
      </div>
      <p id={`${id}-description`} className={styles.paneDescription}>{t("interactiveUi.description")}</p>
    </div>
  );
}

export function AppearanceStudio() {
  const { t } = useI18n();
  const { preference, theme, setThemePreference } = useTheme();
  const { preferences, setPreferences } = useAppearancePreferences();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("layout");
  const [status, setStatus] = useState<Status | null>(null);
  const [effectiveColors, setEffectiveColors] = useState<Partial<Record<AppearanceColor, string>>>({});
  const [importing, setImporting] = useState(false);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expanded || activeTab !== "colors") return;
    // A nested palette provides the base colors even when the document has
    // overrides. Resetting a token immediately shows its true theme value.
    const sample = document.createElement("span");
    sample.hidden = true;
    sample.dataset.theme = theme;
    document.body.append(sample);
    const computed = getComputedStyle(sample);
    const next: Partial<Record<AppearanceColor, string>> = {};
    for (const token of APPEARANCE_COLORS) {
      next[token] = computedColorToHex(computed.getPropertyValue(`--${token}`)) ?? "#808080";
    }
    sample.remove();
    setEffectiveColors(next);
  }, [activeTab, expanded, theme]);

  const activePreset = PRESETS.find((preset) => samePreferences(preferences, preset.preferences));
  const isDefault = samePreferences(preferences, DEFAULT_APPEARANCE);
  const slidersAreDefault = SLIDER_KEYS.every(
    (key) => preferences[key] === APPEARANCE_SLIDERS[key].default,
  );
  const colorsAreDefault = Object.keys(preferences.colors).length === 0;
  const choicesAreDefault = CHOICE_KEYS.every(
    (key) => preferences[key] === APPEARANCE_CHOICES[key][0],
  );
  const summary = activePreset
    ? t("appearance.summaryPreset", { name: t(activePreset.labelKey) })
    : t("appearance.summaryCustomized");

  const applyPreset = (preset: Preset) => {
    setPreferences((current) => ({ ...preset.preferences, colors: current.colors }));
    setStatus({
      tone: "success",
      message: t("appearance.status.preset", { name: t(preset.labelKey) }),
    });
  };

  const resetAll = () => {
    setPreferences(cloneAppearance(DEFAULT_APPEARANCE));
    setStatus({ tone: "success", message: t("appearance.status.reset") });
  };

  const resetSliders = () => {
    setPreferences(withSliderDefaults);
    setStatus({ tone: "success", message: t("appearance.status.slidersReset") });
  };

  const resetColors = () => {
    setPreferences((current) => ({ ...current, colors: {} }));
    setStatus({ tone: "success", message: t("appearance.status.colorsReset") });
  };

  const resetChoices = () => {
    setPreferences(withChoiceDefaults);
    setStatus({ tone: "success", message: t("appearance.status.controlsReset") });
  };

  const saveFile = () => {
    try {
      const payload = createAppearanceFile(preferences, preference);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "pi-web-appearance.json";
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus({ tone: "success", message: t("appearance.status.saved") });
    } catch {
      setStatus({ tone: "error", message: t("appearance.status.saveFailed") });
    }
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus({ tone: "error", message: t("appearance.status.tooLarge") });
      input.value = "";
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      if (text.length > MAX_IMPORT_BYTES || new Blob([text]).size > MAX_IMPORT_BYTES) {
        setStatus({ tone: "error", message: t("appearance.status.tooLarge") });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setStatus({ tone: "error", message: t("appearance.status.invalidFile") });
        return;
      }

      const result = parseAppearanceFile(parsed);
      if (!result.ok) {
        setStatus({
          tone: "error",
          message: result.reason === "version"
            ? t("appearance.status.versionUnsupported")
            : t("appearance.status.invalidFile"),
        });
        return;
      }

      setPreferences(result.preferences);
      setThemePreference(result.theme);
      setStatus({ tone: "success", message: t("appearance.status.loaded") });
    } catch {
      setStatus({ tone: "error", message: t("appearance.status.readFailed") });
    } finally {
      setImporting(false);
      input.value = "";
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    setActiveTab(next.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={styles.studio} data-appearance-studio data-open={expanded ? "true" : "false"}>
      <button
        type="button"
        className={styles.toggle}
        data-appearance-toggle
        aria-expanded={expanded}
        aria-controls={`${baseId}-body`}
        onClick={() => setExpanded((open) => !open)}
      >
        <span className={styles.toggleIcon} aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3a9 9 0 1 0 0 18h1.5a1.8 1.8 0 0 0 0-3.6H13a1.7 1.7 0 0 1 0-3.4h4a4 4 0 0 0 4-4A7 7 0 0 0 12 3Z" />
            <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="10" cy="6.8" r="1" fill="currentColor" stroke="none" />
            <circle cx="14.5" cy="6.8" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span className={styles.toggleText}>
          <span className={styles.toggleTitle}>{t("appearance.customize")}</span>
          <span className={styles.toggleSummary}>{summary}</span>
        </span>
        <svg
          className={styles.chevron}
          width="14"
          height="14"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>

      <div id={`${baseId}-body`} className={styles.body} hidden={!expanded}>
        <div className={styles.introRow}>
          <p className={styles.description}>{t("appearance.description")}</p>
          <button
            type="button"
            className={styles.button}
            data-appearance-reset-all
            disabled={isDefault}
            onClick={resetAll}
          >
            {t("appearance.resetAll")}
          </button>
        </div>

        <div className={styles.presetSection}>
          <span className={styles.sectionLabel}>{t("appearance.presets")}</span>
          <div className={styles.presets}>
            {PRESETS.map((preset) => {
              const active = samePreferences(preferences, preset.preferences);
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={styles.preset}
                  data-appearance-preset={preset.id}
                  data-active={active ? "true" : undefined}
                  aria-pressed={active}
                  onClick={() => applyPreset(preset)}
                >
                  <span className={styles.presetName}>{t(preset.labelKey)}</span>
                  <span className={styles.presetHint}>{t(preset.hintKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AppearancePreview preferences={preferences} t={t} />

        <div className={styles.tabs} role="tablist" aria-label={t("appearance.sections")}>
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              className={styles.tab}
              data-appearance-tab={tab.id}
              aria-selected={activeTab === tab.id}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <section
          id={`${baseId}-panel-layout`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-layout`}
          className={styles.pane}
          data-appearance-pane="layout"
          hidden={activeTab !== "layout"}
        >
          <div className={styles.paneHeader}>
            <div>
              <h4 className={styles.paneTitle}>{t("appearance.layout")}</h4>
              <p className={styles.paneDescription}>{t("appearance.layoutDescription")}</p>
            </div>
            <button
              type="button"
              className={styles.paneAction}
              data-appearance-slider-reset-all
              disabled={slidersAreDefault}
              onClick={resetSliders}
            >
              {t("appearance.resetSliders")}
            </button>
          </div>
          <div className={styles.sliderList}>
            {SLIDER_KEYS.map((key) => (
              <SliderField
                key={key}
                sliderKey={key}
                value={preferences[key]}
                setPreferences={setPreferences}
                t={t}
              />
            ))}
          </div>
        </section>

        <section
          id={`${baseId}-panel-colors`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-colors`}
          className={styles.pane}
          data-appearance-pane="colors"
          hidden={activeTab !== "colors"}
        >
          <div className={styles.paneHeader}>
            <div>
              <h4 className={styles.paneTitle}>{t("appearance.colors")}</h4>
              <p className={styles.paneDescription}>{t("appearance.colorsDescription")}</p>
            </div>
            <button
              type="button"
              className={styles.paneAction}
              data-appearance-color-reset-all
              disabled={colorsAreDefault}
              onClick={resetColors}
            >
              {t("appearance.resetColors")}
            </button>
          </div>
          <div className={styles.colorGroups}>
            {COLOR_GROUPS.map((group) => (
              <div key={group.labelKey} className={styles.colorGroup}>
                <h5 className={styles.colorGroupTitle}>{t(group.labelKey)}</h5>
                <div className={styles.colorList}>
                  {group.tokens.map((token) => (
                    <ColorField
                      key={token}
                      token={token}
                      override={preferences.colors[token]}
                      effective={effectiveColors[token] ?? "#808080"}
                      setPreferences={setPreferences}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id={`${baseId}-panel-controls`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-controls`}
          className={styles.pane}
          data-appearance-pane="controls"
          hidden={activeTab !== "controls"}
        >
          <div className={styles.paneHeader}>
            <div>
              <h4 className={styles.paneTitle}>{t("appearance.controls")}</h4>
              <p className={styles.paneDescription}>{t("appearance.controlsDescription")}</p>
            </div>
            <button
              type="button"
              className={styles.paneAction}
              data-appearance-controls-reset-all
              disabled={choicesAreDefault}
              onClick={resetChoices}
            >
              {t("appearance.resetControls")}
            </button>
          </div>
          <div className={styles.choiceList}>
            {CHOICE_KEYS.map((key) => (
              <ChoiceField
                key={key}
                choiceKey={key}
                setPreferences={setPreferences}
                t={t}
              />
            ))}
            <InteractiveUiChoice />
          </div>
        </section>

        <div className={styles.fileActions}>
          <button type="button" className={styles.button} data-appearance-save onClick={saveFile}>
            {t("appearance.save")}
          </button>
          <button
            type="button"
            className={styles.button}
            data-appearance-load
            disabled={importing}
            aria-busy={importing || undefined}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("appearance.load")}
          </button>
          <input
            ref={fileInputRef}
            className={styles.visuallyHidden}
            type="file"
            accept=".json,application/json"
            data-appearance-file
            aria-label={t("appearance.fileInputLabel")}
            onChange={loadFile}
          />
          <p className={styles.fileNote}>{t("appearance.fileDescription")}</p>
          <p
            className={styles.status}
            data-appearance-status
            data-tone={status?.tone ?? "info"}
            role={status?.tone === "error" ? "alert" : "status"}
            aria-live="polite"
            aria-atomic="true"
          >
            {status?.message ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
