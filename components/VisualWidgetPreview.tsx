"use client";

import { memo, useEffect, useRef } from "react";
import { useI18n } from "@/hooks/useI18n";
import { bindVisualControls } from "@/lib/visual-bindings";
import { buildVisualFragment } from "@/lib/visual-fragment";
import { resolveVisualImage, visualImageCaption, type VisualImageInput } from "@/lib/visual-image";
import { visualWidgetStyle } from "@/lib/visual-widget-style";

interface Props {
  code: string;
  cwd?: string;
  sessionId?: string;
  onUnavailable: () => void;
}

function makeImage(
  document: Document,
  image: NonNullable<ReturnType<typeof resolveVisualImage>>,
  caption: string,
  unavailable: string,
) {
  const figure = document.createElement("figure");
  figure.className = "pi-sourced-image";
  const viewport = document.createElement("div");
  viewport.className = "pi-image-viewport";
  const img = document.createElement("img");
  img.alt = image.alt;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  const label = document.createElement("figcaption");
  label.textContent = caption;
  viewport.append(img);
  figure.append(viewport, label);

  if (image.crop) {
    const { x, y, width, height } = image.crop;
    viewport.dataset.cropped = "";
    viewport.style.aspectRatio = "16 / 9";
    img.style.width = `${10000 / width}%`;
    img.style.transform = `translate(${-x}%, ${-y}%)`;
    img.addEventListener("load", () => {
      const ratio = img.naturalWidth * width / (img.naturalHeight * height);
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      viewport.style.aspectRatio = String(ratio);
      viewport.style.maxInlineSize = `${34 * ratio}em`;
    }, { once: true });
  }
  img.addEventListener("error", () => {
    const fallback = document.createElement("span");
    fallback.className = "pi-image-error";
    fallback.textContent = image.alt ? `${unavailable}: ${image.alt}` : unavailable;
    viewport.replaceWith(fallback);
  }, { once: true });
  // A rejected fragment must never initiate requests for any of its images.
  return { figure, load: () => { img.src = image.url; } };
}

export default memo(function VisualWidgetPreview({ code, cwd, sessionId, onUnavailable }: Props) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { ownerDocument } = host;
    const loads: Array<() => void> = [];
    const fragment = buildVisualFragment(code, ownerDocument, {
      createImage(input: VisualImageInput) {
        const image = resolveVisualImage(input, cwd, sessionId, ownerDocument.location?.hostname);
        if (!image) return null;
        const { figure, load } = makeImage(ownerDocument, image, visualImageCaption(image, t), t("interactiveUi.imageUnavailable"));
        loads.push(load);
        return figure;
      },
    });
    if (!fragment) {
      onUnavailable();
      return;
    }
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const content = ownerDocument.createElement("div");
    content.className = "pi-visual-content";
    content.append(fragment);
    const stylesheet = visualWidgetStyle(root);
    root.replaceChildren(...(stylesheet ? [stylesheet, content] : [content]));
    const unbind = bindVisualControls(content);
    loads.forEach((load) => load());
    return () => {
      unbind();
      root.replaceChildren();
    };
  }, [code, cwd, sessionId, onUnavailable, t]);

  return <div ref={hostRef} data-pi-visual-preview />;
});
