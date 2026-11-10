const NATIVE_FOLDER_PICKER_PATH = "/api/cwd/pick-native";

/** What the native picker route can tell the client. */
export type NativeFolderPickerResult =
  | { kind: "selected"; cwd: string }
  | { kind: "cancelled" }
  | { kind: "busy" }
  | { kind: "unavailable" }
  | { kind: "aborted" };

interface NativeFolderPickerOptions {
  /** Passed as written: the server owns path normalization. */
  initialPath?: string;
  prompt?: string;
  signal?: AbortSignal;
}

/**
 * Ask the local server to open its native folder chooser. Every outcome other
 * than a selection, cancellation or busy panel means the caller should use
 * the in-app directory picker instead.
 */
export async function pickNativeFolder({
  initialPath,
  prompt,
  signal,
}: NativeFolderPickerOptions): Promise<NativeFolderPickerResult> {
  let response: Response;
  try {
    response = await fetch(NATIVE_FOLDER_PICKER_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(initialPath !== undefined ? { initialPath } : {}),
        ...(prompt !== undefined ? { prompt } : {}),
      }),
      signal,
    });
  } catch {
    return signal?.aborted ? { kind: "aborted" } : { kind: "unavailable" };
  }

  if (signal?.aborted) return { kind: "aborted" };
  if (response.status === 409) return { kind: "busy" };
  if (response.status !== 200) return { kind: "unavailable" };

  const data = await response.json().catch(() => null) as { cwd?: unknown; cancelled?: unknown } | null;
  if (signal?.aborted) return { kind: "aborted" };
  if (data?.cancelled === true) return { kind: "cancelled" };
  if (typeof data?.cwd === "string" && data.cwd.length > 0) return { kind: "selected", cwd: data.cwd };
  return { kind: "unavailable" };
}
