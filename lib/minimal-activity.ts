import { stripAnsi } from "./ansi";
import type { AssistantMessage, ThinkingContent, ToolCallContent } from "./types";

/** Tool requests and the text before them belong in the disclosure. A response
 * without tools can stream its trailing answer while thinking stays folded. */
export function splitLiveReply(message: AssistantMessage | null) {
  if (!message) return { process: null, answer: null, step: undefined };
  const content = message.content;
  const lastStep = content.findLastIndex((block) => block?.type === "thinking" || block?.type === "toolCall");
  const usesTools = message.stopReason === "toolUse" || content.some((block) => block.type === "toolCall");
  const answerStart = usesTools ? content.length : lastStep + 1;
  const tail = content.slice(answerStart);
  const hasAnswer = tail.some((block) => block.type === "image" || (block.type === "text" && block.text.trim().length > 0));
  return {
    process: answerStart > 0 ? { ...message, content: content.slice(0, answerStart) } : null,
    answer: hasAnswer ? (answerStart === 0 ? message : { ...message, content: tail }) : null,
    step: content[lastStep] as ThinkingContent | ToolCallContent | undefined,
  };
}

const PREVIEW_CHARS = 104;
const SCAN_CHARS = PREVIEW_CHARS * 4;

/** Keep the work per chunk bounded even if the reasoning is very long. */
export function activityExcerpt(text: string, latest = false): string {
  const sample = latest ? text.slice(-SCAN_CHARS) : text.slice(0, SCAN_CHARS);
  const flat = stripAnsi(sample).replace(/\s+/gu, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= PREVIEW_CHARS) return flat;
  return latest
    ? `…${chars.slice(1 - PREVIEW_CHARS).join("")}`
    : `${chars.slice(0, PREVIEW_CHARS - 1).join("")}…`;
}

/** A useful hint without exposing the tool's raw JSON, file contents or code. */
export function activityToolInput(block: ToolCallContent | undefined): string {
  if (!block?.input) return "";
  for (const key of ["path", "file_path", "query", "pattern", "command"]) {
    const value = block.input[key];
    if (typeof value === "string") {
      const preview = activityExcerpt(value);
      if (preview) return preview;
    }
  }
  return "";
}
