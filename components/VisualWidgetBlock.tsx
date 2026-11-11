"use client";

import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useInteractiveUiMode } from "@/hooks/useInteractiveUi";
import { CodeBlock } from "./MermaidBlock";

const Preview = lazy(() => import("./VisualWidgetPreview"));

interface Props {
  code: string;
  isStreaming?: boolean;
  cwd?: string;
  sessionId?: string;
}

const LiveWidget = memo(function LiveWidget({ code, cwd, sessionId }: Props) {
  const { t } = useI18n();
  const frame = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const markUnavailable = useCallback(() => setUnavailable(true), []);
  useEffect(() => {
    if (nearby || !frame.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setNearby(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearby(true);
      observer.disconnect();
    }, { rootMargin: "240px 0px" });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [nearby]);

  const placeholder = <div className="pi-visual-frame-header pi-visual-frame-placeholder" role="status">{t("interactiveUi.preparing")}</div>;
  return (
    <section ref={frame} className="pi-visual-frame" aria-label={t("interactiveUi.visual")}>
      <div className="pi-visual-frame-header">
        <span>{t(unavailable ? "interactiveUi.unavailable" : "interactiveUi.visual")}</span>
        <button type="button" aria-expanded={showSource} onClick={() => setShowSource((value) => !value)}>
          {t(showSource ? "interactiveUi.hideSource" : "interactiveUi.viewSource")}
        </button>
      </div>
      <div className="pi-visual-frame-body" hidden={showSource || unavailable}>
        {nearby ? <Suspense fallback={placeholder}><Preview code={code} cwd={cwd} sessionId={sessionId} onUnavailable={markUnavailable} /></Suspense> : placeholder}
      </div>
      {showSource && <CodeBlock lang="html" code={code} />}
    </section>
  );
});

export const VisualWidgetBlock = memo(function VisualWidgetBlock({ isStreaming, ...props }: Props) {
  const { t } = useI18n();
  const mode = useInteractiveUiMode();
  const [showSource, setShowSource] = useState(false);
  if (mode !== "interactive") {
    return (
      <details className="pi-visual-frame" onToggle={(event) => setShowSource(event.currentTarget.open)}>
        <summary className="pi-visual-inactive">{t("interactiveUi.previewOff")}</summary>
        {showSource && <CodeBlock lang="html" code={props.code} isStreaming={isStreaming} />}
      </details>
    );
  }
  if (isStreaming) {
    return <div className="pi-visual-frame pi-visual-frame-header" role="status">{t("interactiveUi.building")}</div>;
  }
  return <LiveWidget {...props} />;
});
