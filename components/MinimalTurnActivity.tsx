"use client";

import { memo, useLayoutEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentPhase } from "@/hooks/useAgentSession";
import { phaseLabel } from "@/lib/chat-phase-label";
import { activityExcerpt, activityToolInput, splitLiveReply } from "@/lib/minimal-activity";
import type { StreamingStore } from "@/lib/streaming-message";
import type { AssistantMessage, ToolCallContent, ToolResultMessage } from "@/lib/types";
import { MessageView } from "./MessageView";
import styles from "./MinimalTurnActivity.module.css";

// Coalesce network bursts to the next paint. The store keeps all deltas; a
// message commit clears immediately so the streamed and saved views don't overlap.
function useLiveMessage(store: StreamingStore | undefined) {
  const [message, setMessage] = useState(() => store?.getState().streamingMessage ?? null);
  useLayoutEffect(() => {
    if (!store) {
      setMessage(null);
      return;
    }
    let frame: number | null = null;
    const read = () => {
      frame = null;
      setMessage(store.getState().streamingMessage);
    };
    read();
    const unsubscribe = store.subscribe(() => {
      if (!store.getState().streamingMessage) {
        if (frame !== null) cancelAnimationFrame(frame);
        read();
      } else if (frame === null) {
        frame = requestAnimationFrame(read);
      }
    });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [store]);
  return store ? message : null;
}

export interface LiveTurnActivity {
  store: StreamingStore;
  onCommit: () => void;
  phase: AgentPhase;
  isCompacting: boolean;
  queuedCount: number;
  toolResults: Map<string, ToolResultMessage>;
  modelNames: Record<string, string>;
  cwd?: string;
  sessionId?: string;
  onOpenFile?: (filePath: string, page?: number) => void;
  onOpenSubagent?: (sessionId: string, label: string) => void;
}

interface Props {
  process?: ReactNode;
  /** An answer that just committed, before the session finishes reconciling. */
  answer?: ReactNode;
  latestAssistant?: AssistantMessage;
  summary?: string;
  reveal?: boolean;
  live?: LiveTurnActivity;
  command?: { text: string; process?: ReactNode };
}

// The disclosure alone subscribes to tokens. Its children are mounted only
// when opened, so hidden thinking, arguments and output never paint in full.
export const MinimalTurnActivity = memo(function MinimalTurnActivity({
  process, answer, latestAssistant, summary, reveal, live, command,
}: Props) {
  const { t } = useI18n();
  const message = useLiveMessage(live?.store);
  const parts = splitLiveReply(message);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  const open = expanded || Boolean(reveal);

  const hasNewReply = Boolean(message?.content.length);
  const visibleAnswer = parts.answer || (!hasNewReply && answer);
  const canExpand = Boolean(process || parts.process || (hasNewReply && answer) || command?.process);
  const runningTool = live?.phase?.kind === "running_tools" ? live.phase.tools.at(-1) : undefined;
  let label = t("chat.processDetails");
  let preview = "";
  let active = false;

  if (command) {
    active = true;
    label = t("chat.runningCommand");
    preview = activityExcerpt(command.text);
  } else if (live?.isCompacting) {
    active = true;
    label = phaseLabel(live.phase, t, true, live.queuedCount) ?? t("chat.compacting");
  } else if (live && !visibleAnswer) {
    active = true;
    if (runningTool) {
      label = t("chat.runningNamedTool", { name: runningTool.name });
      const call = latestAssistant?.content.find((block): block is ToolCallContent => (
        block.type === "toolCall" && block.toolCallId === runningTool.id
      ));
      preview = runningTool.progress ? activityExcerpt(runningTool.progress, true) : activityToolInput(call);
    } else if (parts.step?.type === "thinking") {
      label = t("chat.thinking");
      preview = activityExcerpt(parts.step.thinking, true);
    } else if (parts.step?.type === "toolCall") {
      label = parts.step.toolName || t("chat.toolCall");
      preview = activityToolInput(parts.step);
    } else {
      label = phaseLabel(live.phase, t) ?? t("chat.waitingModel");
    }
  }

  const detailsName = [t("chat.processDetails"), summary].filter(Boolean).join(" · ");
  const hasRow = canExpand || active;
  const onCommit = live?.onCommit;
  // A collapsed preview has a fixed height. Only measure when the disclosure
  // or answer can change the transcript's layout.
  const answerContent = parts.answer ? message?.content : undefined;
  const expandedMessage = open ? message : null;
  useLayoutEffect(() => { onCommit?.(); }, [onCommit, hasRow, open, process, answer, answerContent, expandedMessage]);
  const row = (
    <>
      {active && <span className={styles.dot} aria-hidden="true" />}
      <span className={styles.label}>{label}</span>
      {preview && (
        <>
          <span aria-hidden="true">·</span>
          <span className={styles.preview} data-activity-preview="" aria-hidden="true"><bdi>{preview}</bdi></span>
        </>
      )}
      {canExpand && (
        <svg className={styles.chevron} width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="4 2.5 7.5 6 4 9.5" />
        </svg>
      )}
    </>
  );

  return (
    <>
      {hasRow && (
        <div className={styles.activity} data-minimal-activity={live || command ? "live" : "settled"}>
          {(live || command) && <span className="sr-only" role="status">{active ? label : ""}</span>}
          {canExpand ? (
            <button
              type="button"
              className={styles.line}
              aria-expanded={open}
              aria-label={detailsName}
              title={t(open ? "chat.collapseProcess" : "chat.expandProcess")}
              onClick={() => setExpanded((value) => !value)}
            >
              {row}
              {summary && <span className={styles.summary} aria-hidden="true">{summary}</span>}
            </button>
          ) : <div className={styles.line} aria-hidden="true">{row}</div>}
          {open && canExpand && (
            <div className={styles.details}>
              {process}
              {hasNewReply && answer}
              {command?.process}
              {live && parts.process && (
                <MessageView message={parts.process} toolResults={live.toolResults} isStreaming modelNames={live.modelNames} cwd={live.cwd} sessionId={live.sessionId} onOpenFile={live.onOpenFile} onOpenSubagent={live.onOpenSubagent} />
              )}
            </div>
          )}
        </div>
      )}
      {live && parts.answer && (
        <MessageView message={parts.answer} isStreaming showStreamingMetrics={false} modelNames={live.modelNames} cwd={live.cwd} sessionId={live.sessionId} onOpenFile={live.onOpenFile} onOpenSubagent={live.onOpenSubagent} />
      )}
      {!hasNewReply && answer}
    </>
  );
});
