import { resolveLocalFileHref } from "./file-links";
import { encodeFilePathForApi } from "./file-paths";
import { getFileExt, IMAGE_EXT_TO_MIME } from "./file-types";
import type { TranslationParams } from "./i18n/types";

export interface VisualImageInput {
  src: string;
  alt: string;
  source: string;
  page: string;
  crop: string;
}

interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseCrop(value: string): ImageCrop | undefined {
  if (!/^\s*\d{1,3}(?:\.\d{1,2})?(?:[ ,]+\d{1,3}(?:\.\d{1,2})?){3}\s*$/.test(value)) return;
  const [x, y, width, height] = value.trim().split(/[ ,]+/).map(Number);
  if (width < 1 || height < 1 || x + width > 100 || y + height > 100) return;
  return { x, y, width, height };
}

function publicHttpsImage(value: string, appHostname?: string): URL | undefined {
  if (!/^https:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    // Use the browser's image loader, never a server-side proxy. Do not turn a
    // local service, nonstandard port, raw IP or the app itself into an image source.
    if (url.protocol !== "https:" || url.port || url.username || url.password || !host.includes(".")
      || /(^|\.)(?:localhost|local|internal|lan|home\.arpa|test|invalid)$/.test(host)
      || /^[\d.]+$|[\[\]]/.test(host) || host === appHostname?.toLowerCase().replace(/\.$/, "")) return;
    return url;
  } catch { /* malformed URL */ }
}

export function resolveVisualImage(image: VisualImageInput, cwd?: string, sessionId?: string, appHostname?: string) {
  const raw = image.src.trim();
  const online = publicHttpsImage(raw, appHostname);
  const local = online ? null : resolveLocalFileHref(raw, cwd);
  const session = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : "";
  const url = online?.href ?? (local && Object.hasOwn(IMAGE_EXT_TO_MIME, getFileExt(local))
    ? `/api/files/${encodeFilePathForApi(local)}?type=read${session}` : null);
  if (!url) return null;
  const source = image.source.trim();
  const defaultSource = local ? local.split(/[\\/]/).pop() : online?.hostname;
  const name = source && online && source !== defaultSource ? `${source} · ${defaultSource}` : source || defaultSource;
  const page = /^\d{1,6}$/.test(image.page.trim()) ? Number(image.page) || undefined : undefined;
  return {
    url,
    alt: image.alt.trim(),
    name: name || "",
    page,
    crop: parseCrop(image.crop),
  };
}

export function visualImageCaption(image: { name: string; page?: number }, t: (key: string, params?: TranslationParams) => string): string {
  const source = t("interactiveUi.imageSource", { name: image.name });
  return image.page ? `${source} · ${t("interactiveUi.imagePage", { page: image.page })}` : source;
}
