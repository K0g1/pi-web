"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme, type ThemePreference } from "@/hooks/useTheme";
import { THEME_OPTIONS } from "@/lib/theme";
import styles from "./ThemeBrowser.module.css";

type ThemeFilter = "all" | "light" | "dark";

const THEME_FILTERS: readonly { id: ThemeFilter; label: string }[] = [
  { id: "all", label: "settings.themeFilterAll" },
  { id: "light", label: "settings.themeFilterLight" },
  { id: "dark", label: "settings.themeFilterDark" },
];

function PreviewCanvas() {
  return (
    <span className={styles.previewCanvas}>
      <span className={styles.previewSidebar}>
        <span className={styles.previewAccent} />
      </span>
      <span className={styles.previewMain}>
        <span className={styles.previewBubble} />
        <span className={styles.previewLine} />
        <span className={styles.previewLineShort} />
      </span>
    </span>
  );
}

const ThemePreview = memo(function ThemePreview({ id }: { id: string }) {
  if (id === "auto") {
    return (
      <span
        className={styles.systemPreview}
        data-theme-preview
        data-theme-preview-id={id}
        aria-hidden="true"
      >
        <span className={styles.systemPane} data-theme="light">
          <PreviewCanvas />
        </span>
        <span className={styles.systemPane} data-theme="dark">
          <PreviewCanvas />
        </span>
      </span>
    );
  }

  return (
    <span
      className={styles.preview}
      data-theme={id}
      data-theme-preview
      data-theme-preview-id={id}
      aria-hidden="true"
    >
      <PreviewCanvas />
    </span>
  );
});

export const ThemeBrowser = memo(function ThemeBrowser() {
  const { t } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ThemeFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);

  const currentOption = THEME_OPTIONS.find((option) => option.id === preference) ?? THEME_OPTIONS[0];
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return THEME_OPTIONS.filter((option) => {
      if (filter !== "all" && option.scheme !== filter) return false;
      if (!needle) return true;
      return option.id.toLowerCase().includes(needle) || t(option.label).toLowerCase().includes(needle);
    });
  }, [filter, query, t]);

  const selectTheme = useCallback((id: ThemePreference) => {
    const origin = pointerOriginRef.current;
    pointerOriginRef.current = null;
    setThemePreference(id, origin ?? undefined);
  }, [setThemePreference]);

  const clearSearch = () => {
    pointerOriginRef.current = null;
    setQuery("");
    searchRef.current?.focus();
  };

  const resetFilters = () => {
    pointerOriginRef.current = null;
    setQuery("");
    setFilter("all");
    searchRef.current?.focus();
  };

  const toggleBrowser = () => {
    pointerOriginRef.current = null;
    if (open) {
      setOpen(false);
      setQuery("");
      setFilter("all");
      return;
    }
    setOpen(true);
  };

  return (
    <div className={styles.browserRoot} data-theme-browser data-open={open ? "true" : "false"}>
      <div className={styles.currentCard} data-theme-current data-theme-current-id={currentOption.id}>
        <div className={styles.currentPreview}>
          <ThemePreview id={currentOption.id} />
        </div>
        <div className={styles.currentInfo}>
          <span className={styles.kicker}>{t("settings.themeCurrent")}</span>
          <span className={styles.currentName}>{t(currentOption.label)}</span>
          <button
            type="button"
            className={styles.browseButton}
            data-theme-browser-toggle
            aria-expanded={open}
            aria-controls="settings-theme-browser"
            onClick={toggleBrowser}
          >
            {t(open ? "settings.themeHide" : "settings.themeBrowse")}
            <svg
              className={styles.chevron}
              width="12"
              height="12"
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
        </div>
      </div>

      <div
        id="settings-theme-browser"
        className={styles.browser}
        data-theme-browser-content
        hidden={!open}
      >
        <div className={styles.controls}>
          <div className={styles.controlBlock}>
            <label className={styles.fieldLabel} htmlFor="settings-theme-search">
              {t("settings.themeSearch")}
            </label>
            <div className={styles.searchRow}>
              <input
                ref={searchRef}
                id="settings-theme-search"
                className={styles.searchInput}
                data-theme-search
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings.themeSearchPlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className={styles.clearButton}
                  data-theme-search-clear
                  onClick={clearSearch}
                >
                  {t("settings.themeClearSearch")}
                </button>
              )}
            </div>
          </div>

          <div className={styles.controlBlock}>
            <span id="settings-theme-filter-label" className={styles.fieldLabel}>
              {t("settings.themeFilterLabel")}
            </span>
            <div
              className={styles.filterGroup}
              role="radiogroup"
              aria-labelledby="settings-theme-filter-label"
              data-theme-filter
            >
              {THEME_FILTERS.map((item) => {
                const selected = filter === item.id;
                return (
                  <label
                    key={item.id}
                    className={styles.filterOption}
                    data-selected={selected ? "true" : undefined}
                  >
                    <input
                      type="radio"
                      name="settings-theme-filter"
                      value={item.id}
                      checked={selected}
                      onChange={() => setFilter(item.id)}
                      className={styles.radio}
                      data-theme-filter-value={item.id}
                    />
                    <span>{t(item.label)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.resultsRow}>
          <h4 id="settings-theme-grid-label" className={styles.gridHeading}>
            {t("settings.themeGridLabel")}
          </h4>
          <p
            id="settings-theme-results"
            className={styles.results}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-theme-results
          >
            {t("settings.themeResults", { count: filteredOptions.length })}
          </p>
        </div>

        {filteredOptions.length > 0 ? (
          <div
            id="settings-theme-grid"
            className={styles.grid}
            role="radiogroup"
            aria-labelledby="settings-theme-grid-label"
            aria-describedby="settings-theme-results"
            data-theme-grid
            onPointerDownCapture={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              const target = event.target;
              const card = target instanceof Element ? target.closest<HTMLElement>("[data-theme-card]") : null;
              if (card && card.dataset.selected !== "true") {
                pointerOriginRef.current = { x: event.clientX, y: event.clientY };
              }
            }}
            onPointerCancelCapture={() => { pointerOriginRef.current = null; }}
            onKeyDownCapture={() => { pointerOriginRef.current = null; }}
          >
            {filteredOptions.map((option) => {
              const selected = preference === option.id;
              return (
                <label
                  key={option.id}
                  className={styles.card}
                  data-theme-card
                  data-theme-id={option.id}
                  data-scheme={option.scheme ?? "system"}
                  data-selected={selected ? "true" : undefined}
                >
                  <input
                    type="radio"
                    name="settings-theme"
                    value={option.id}
                    checked={selected}
                    onChange={() => selectTheme(option.id)}
                    className={styles.radio}
                    data-theme-radio
                  />
                  <ThemePreview id={option.id} />
                  <span className={styles.cardMeta}>
                    <span className={styles.cardName}>{t(option.label)}</span>
                    {selected && (
                      <span className={styles.selectedBadge} data-theme-selected aria-hidden="true">
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m2.5 6.2 2.2 2.2 4.8-4.8" />
                        </svg>
                        {t("settings.themeSelected")}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty} data-theme-empty>
            <p>{t("settings.themeNoResults")}</p>
            <button type="button" className={styles.resetButton} data-theme-reset onClick={resetFilters}>
              {t("settings.themeReset")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
