import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";
import { isLoopbackHost } from "./open-in-file-manager";
import { isApiRequestAllowed } from "./request-security";

const execFileAsync = promisify(execFile);
const DEFAULT_PROMPT = "Choose a folder to open as a project";
const PICKER_TIMEOUT_MS = 5 * 60_000;

// Run Standard Additions in osascript itself, so no other app or Automation
// permission is needed. Paths and prompts are passed as data, never as code.
const CHOOSE_FOLDER = `
on run argv
  set promptText to item 1 of argv
  set startPath to item 2 of argv
  set startFolder to missing value
  if startPath is not "" then
    try
      set startFolder to (POSIX file startPath) as alias
    end try
  end if
  activate
  try
    if startFolder is missing value then
      set chosenFolder to choose folder with prompt promptText
    else
      set chosenFolder to choose folder with prompt promptText default location startFolder
    end if
    return POSIX path of chosenFolder
  on error messageText number errorNumber
    if errorNumber is -128 then return ""
    error messageText number errorNumber
  end try
end run
`;

/** The launcher sets the bind address on its Next child. Do not enable a
 * native side effect on a LAN server just because a client sends a local Host. */
export function canPickNativeFolder(
  request: Request,
  platform = process.platform,
  bindHost = process.env.PI_WEB_HOSTNAME,
): boolean {
  if (platform !== "darwin" || !isLoopbackHost(bindHost) || !isApiRequestAllowed(request)) return false;
  const host = request.headers.get("host");
  if (!isLoopbackHost(host) || request.headers.has("forwarded")) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost !== null && forwardedHost.toLowerCase() !== host?.toLowerCase()) return false;

  // Next fills this from the socket for a direct request. It can only narrow
  // access here: a supplied header cannot override the server's bind guard.
  const address = request.headers.get("x-forwarded-for")?.trim().replace(/^::ffff:/i, "");
  if (address !== undefined && !(/^(?:127(?:\.\d{1,3}){3}|::1)$/.test(address) && isLoopbackHost(address))) return false;
  return true;
}

interface PickerOptions {
  initialPath?: unknown;
  prompt?: unknown;
  signal: AbortSignal;
}

type PickerResult =
  | { kind: "selected"; cwd: string }
  | { kind: "cancelled" | "busy" | "unavailable" };

async function chooseFolder(prompt: string, initialPath: string, signal: AbortSignal): Promise<string> {
  let start = "";
  if (initialPath) {
    try {
      if ((await stat(initialPath)).isDirectory()) start = initialPath;
    } catch { /* A folder that went away doesn't stop the picker opening. */ }
  }
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", CHOOSE_FOLDER, "--", prompt, start], {
    encoding: "utf8",
    maxBuffer: 32 * 1024,
    timeout: PICKER_TIMEOUT_MS,
    signal,
  });
  return stdout;
}

export function createNativeFolderPicker(run = chooseFolder) {
  let active = false;
  return async ({ initialPath, prompt, signal }: PickerOptions): Promise<PickerResult> => {
    if (signal.aborted) return { kind: "cancelled" };
    if (active) return { kind: "busy" };

    const start = typeof initialPath === "string" && initialPath.length <= 4096
      && !initialPath.includes("\0") && isAbsolute(initialPath) ? initialPath : "";
    const label = typeof prompt === "string" && prompt.length <= 180
      && !prompt.includes("\0") && prompt.trim() ? prompt.trim() : DEFAULT_PROMPT;

    active = true;
    try {
      // osascript terminates its output with one newline. Remove just that and
      // the final POSIX folder separator; whitespace can be part of a name.
      const path = (await run(label, start, signal)).replace(/\n$/, "");
      if (signal.aborted || !path) return { kind: "cancelled" };
      if (!isAbsolute(path) || path.includes("\0")) return { kind: "unavailable" };
      return { kind: "selected", cwd: path.replace(/\/+$/, "") || "/" };
    } catch {
      return { kind: signal.aborted ? "cancelled" : "unavailable" };
    } finally {
      active = false;
    }
  };
}

declare global {
  var __piWebPickNativeFolder: ReturnType<typeof createNativeFolderPicker> | undefined;
}

export const pickNativeFolder = globalThis.__piWebPickNativeFolder ??= createNativeFolderPicker();
