"use client";
/**
 * The `/agent` block's UI (docs/plans/agent-block.md §3.3): the prompt that
 * locks once sent, follow-ups below it, live status with an interrupt (button
 * and `Esc`), the collapsed log and the folder chip.
 *
 * It talks to the session only through the injected `AgentHost`
 * (`context/AgentHostContext.tsx`). With no host — the VPS build, a browser,
 * read mode — it renders the record and nothing that could start anything.
 *
 * ### What is written to the node, and when
 *
 * Three writes, all tagged `historic` so none of them is an undo step of its
 * own: the prompt when it is sent, the session id and folder once `start`
 * answers, and the turn's log and outcome when the turn ends. A turn's entries
 * live in component state until then — see `model.ts` for why. The agent's
 * *output* is not written here at all: it arrives as ordinary blocks through
 * the doc tools, and those writes are undoable like typing.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getNodeByKey,
  $getState,
  $setState,
  HISTORIC_TAG,
  type NodeKey,
  stopLexicalPropagation,
} from "lexical";
import {
  AlertCircle,
  Bot,
  ChevronRight,
  Folder,
  MessageSquare,
  Send,
  Square,
  TextSelect,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { blockIdState } from "@/lib/content-bridge";
import { mintBlockId } from "@/lib/content-bridge/blockId";
import { ICON_SIZE } from "@/theme/icons";
import {
  type AgentSessionEvent,
  type AgentToolTarget,
  useAgentHost,
} from "../../context/AgentHostContext";
import { ActionButton, Alert, Spinner } from "../../ui";
import { cx } from "../../ui/cx";
import { agentOutlineText } from "../../utils/agentDocTools";
import { takeAgentFocus } from "./focus";
import { $isAgentBlockNode } from ".";
import {
  type AgentBlockData,
  type AgentLiveStatus,
  type AgentLogEntry,
  appendLog,
  entriesForEvent,
  MAX_PROMPT,
  nextLiveStatus,
  outcomeOf,
} from "./model";
import * as css from "./styles.css";

interface Turn {
  index: number;
  events: AgentSessionEvent[];
  entries: AgentLogEntry[];
  interrupted: boolean;
}

/** Events Lexical must not also handle when they come from our controls. */
const ISOLATED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "cut",
  "copy",
  "drop",
  "compositionstart",
  "compositionend",
] as const;

const isControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "TEXTAREA" || target.tagName === "INPUT" ||
    target.tagName === "BUTTON");

const basename = (path: string): string =>
  path.replace(/\/+$/, "").split("/").pop() || path;

function statusLabel(live: AgentLiveStatus): string {
  switch (live.phase) {
    case "starting":
      return "Starting…";
    case "thinking":
      return "Thinking…";
    case "tool":
      return `Running ${live.name}…`;
    default:
      return "";
  }
}

export default function AgentBlockComponent(
  { nodeKey, data }: { nodeKey: NodeKey; data: AgentBlockData },
) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const agentHost = useAgentHost();
  const host = agentHost?.host ?? null;

  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<AgentLiveStatus>({ phase: "idle" });
  const [pending, setPending] = useState<AgentLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnRef = useRef<Turn | null>(null);
  const sessionRef = useRef<string | null>(data.sessionId);
  const connection = useRef<{ sessionId: string; off: () => void } | null>(
    null,
  );
  // Mutable on purpose: the executor records the session's last default
  // insert on it (see `AgentToolTarget.lastInserted`).
  const target = useRef<AgentToolTarget>({ editor, blockKey: nodeKey });
  target.current.editor = editor;
  target.current.blockKey = nodeKey;

  const running = live.phase !== "idle";
  const canRun = Boolean(host) && editable;

  /** Write to this block's node, outside the undo stack. */
  const writeNode = useCallback(
    (change: (data: AgentBlockData) => Partial<AgentBlockData>) => {
      editor.update(
        () => {
          const node = $getNodeByKey(nodeKey);
          if ($isAgentBlockNode(node)) node.setData(change(node.getData()));
        },
        { discrete: true, tag: HISTORIC_TAG },
      );
    },
    [editor, nodeKey],
  );

  const finishTurn = useCallback(() => {
    const turn = turnRef.current;
    turnRef.current = null;
    setPending([]);
    setLive({ phase: "idle" });
    if (!turn) return;
    const entries = turn.interrupted
      ? [...turn.entries, { turn: turn.index, kind: "result" as const, text: "Stopped by you." }]
      : turn.entries;
    writeNode((current) => ({
      log: appendLog(current.log, entries),
      status: outcomeOf(turn.events, turn.interrupted),
    }));
  }, [writeNode]);

  const onEvent = useCallback((event: AgentSessionEvent) => {
    const turn = turnRef.current;
    if (!turn) return; // A straggler from a turn this block already closed.
    turn.events.push(event);
    // A turn the author stopped ends in an error result; that is the stop, not
    // a failure, and `finishTurn` records it as one line instead.
    const stopped = turn.interrupted &&
      (event.type === "error" || (event.type === "result" && event.isError));
    const entries = stopped ? [] : entriesForEvent(event, turn.index);
    if (entries.length) {
      turn.entries.push(...entries);
      setPending([...turn.entries]);
    }
    if (event.type === "error" && !stopped) setError(event.message);
    if (event.type === "turn-end") {
      finishTurn();
      return;
    }
    setLive((current) => nextLiveStatus(current, event));
  }, [finishTurn]);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  /**
   * Route this session's tool calls to this editor and subscribe to its
   * events. Synchronous, so it can run in the same task `start` resolves in —
   * before main's next IPC message (the first tool call) can arrive.
   */
  const connect = useCallback((sessionId: string) => {
    if (!host || connection.current?.sessionId === sessionId) return;
    connection.current?.off();
    const detach = host.attach(sessionId, target.current);
    const unsubscribe = host.onEvent(
      sessionId,
      (event) => onEventRef.current(event),
    );
    connection.current = {
      sessionId,
      off: () => {
        detach();
        unsubscribe();
      },
    };
  }, [host]);

  // A block that already has a session (a reopened post) answers for it, so a
  // resumed turn's tool calls reach this editor.
  useEffect(() => {
    sessionRef.current = data.sessionId;
    if (data.sessionId) connect(data.sessionId);
  }, [connect, data.sessionId]);

  // Closing the post mid-turn interrupts it (§3.2): its writes go to this
  // editor, and there is about to be no editor to take them.
  useEffect(() => () => {
    const sessionId = sessionRef.current;
    if (turnRef.current && sessionId) void host?.interrupt(sessionId);
    connection.current?.off();
    connection.current = null;
  }, [host]);

  // Keystrokes in our controls are ours. Lexical listens on the root element,
  // which a native event reaches before React's handlers run, so the marker
  // has to be set by a native listener below it.
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const isolate = (event: Event) => {
      if (isControl(event.target)) stopLexicalPropagation(event);
    };
    for (const name of ISOLATED_EVENTS) element.addEventListener(name, isolate);
    return () => {
      for (const name of ISOLATED_EVENTS) {
        element.removeEventListener(name, isolate);
      }
    };
  }, []);

  useEffect(() => {
    if (takeAgentFocus(nodeKey)) inputRef.current?.focus();
  }, [nodeKey]);

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!host || !agentHost || !prompt || running) return;
    if (prompt.length > MAX_PROMPT) {
      setError(`That prompt is over ${MAX_PROMPT.toLocaleString()} characters.`);
      return;
    }
    const index = data.prompts.length;
    setError(null);
    setDraft("");

    // The prompt goes in first and the outline is taken after, so the
    // stateHash the model starts from already counts this turn.
    let blockId = "";
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isAgentBlockNode(node)) return;
        blockId = $getState(node, blockIdState);
        if (!blockId) {
          blockId = mintBlockId();
          $setState(node, blockIdState, blockId);
        }
        node.setData({ prompts: [...node.getData().prompts, prompt] });
      },
      { discrete: true, tag: HISTORIC_TAG },
    );
    const context = {
      title: agentHost.postTitle,
      blockId,
      outline: agentOutlineText(editor, nodeKey),
      selection: index === 0 ? data.context : null,
    };

    turnRef.current = { index, events: [], entries: [], interrupted: false };
    setLive({ phase: "starting" });

    const undoPrompt = (message: string | null) => {
      turnRef.current = null;
      setLive({ phase: "idle" });
      writeNode((current) => ({ prompts: current.prompts.slice(0, index) }));
      setDraft(prompt);
      setError(message);
    };

    const sessionId = sessionRef.current;
    if (sessionId) {
      connect(sessionId);
      const sent = await host.send(sessionId, prompt, context);
      if (!sent.ok) undoPrompt(sent.error);
      return;
    }

    const started = await host.start(prompt, context);
    if (!started.ok) {
      undoPrompt(started.cancelled ? null : started.error);
      return;
    }
    // Same task as the resolution: see `connect`.
    sessionRef.current = started.sessionId;
    connect(started.sessionId);
    writeNode(() => ({ sessionId: started.sessionId, cwd: started.cwd }));
  }, [
    agentHost,
    connect,
    data.context,
    data.prompts.length,
    draft,
    editor,
    host,
    nodeKey,
    running,
    writeNode,
  ]);

  const interrupt = useCallback(() => {
    const sessionId = sessionRef.current;
    if (!host || !sessionId || !turnRef.current) return;
    turnRef.current.interrupted = true;
    void host.interrupt(sessionId);
  }, [host]);

  const log = [...data.log, ...pending];
  const status = statusLabel(live);

  return (
    <div
      className={css.card}
      data-running={running}
      onKeyDown={(event) => {
        if (event.key === "Escape" && running) {
          event.preventDefault();
          event.stopPropagation();
          interrupt();
        }
      }}
      ref={cardRef}
    >
      <div className={css.header}>
        <span className={css.title}>
          <Bot aria-hidden size={ICON_SIZE.dense} />
          Agent
        </span>
        {running
          ? (
            <span
              aria-live="polite"
              className={cx(css.chip, css.statusRunning)}
              role="status"
            >
              <Spinner size="sm" />
              <span className={cx(css.chipText, css.live)}>{status}</span>
            </span>
          )
          : data.status === "error"
          ? (
            <span className={cx(css.chip, css.statusError)}>
              <AlertCircle aria-hidden size={ICON_SIZE.micro} />
              Failed
            </span>
          )
          : data.status === "interrupted"
          ? <span className={css.chip}>Interrupted</span>
          : data.status === "done"
          ? <span className={cx(css.chip, css.statusDone)}>Done</span>
          : null}
        <span className={css.spacer} />
        <span
          className={css.chip}
          title={data.cwd
            ? `Working folder: ${data.cwd}`
            : "The agent's working folder is chosen when you send"}
        >
          <Folder aria-hidden size={ICON_SIZE.micro} />
          <span className={css.chipText}>
            {data.cwd ? basename(data.cwd) : "No folder yet"}
          </span>
        </span>
        {running && (
          <ActionButton
            aria-label="Stop the agent (Esc)"
            danger
            onClick={interrupt}
            size="sm"
            title="Stop (Esc)"
            variant="outline"
          >
            <Square aria-hidden size={ICON_SIZE.micro} />
            Stop
          </ActionButton>
        )}
      </div>

      {data.context && (
        <span className={css.chip} title="Selected when this block was added">
          <TextSelect aria-hidden size={ICON_SIZE.micro} />
          <span className={css.chipText}>
            {data.context.kind === "text"
              ? `Selection: “${data.context.text.slice(0, 80)}”`
              : `Selection: ${data.context.ids.length} block${
                data.context.ids.length === 1 ? "" : "s"
              }`}
          </span>
        </span>
      )}

      {data.prompts.map((text, index) => (
        <blockquote className={css.prompt} key={index}>
          <span className={css.promptLabel}>
            {index === 0 ? "You asked" : "Follow-up"}
          </span>
          {text}
        </blockquote>
      ))}

      {data.prompts.length === 0 && (
        <p className={css.hint}>
          {canRun
            ? "Ask Claude to write in this post — paragraphs, lists, tables. " +
              "It edits the post directly, and you choose the folder it works " +
              "in when you send."
            : host
            ? "This post is in read mode."
            : "Agent sessions run in the desktop app."}
        </p>
      )}

      {log.length > 0 && (
        <>
          <button
            aria-expanded={logOpen}
            className={css.logToggle}
            onClick={() => setLogOpen((open) => !open)}
            type="button"
          >
            <ChevronRight aria-hidden className={css.caret} size={ICON_SIZE.inline} />
            Log · {log.length} {log.length === 1 ? "entry" : "entries"}
          </button>
          {logOpen && (
            <ul aria-label="Agent log" className={css.log}>
              {log.map((entry, index) => (
                <li
                  className={cx(
                    css.logEntry,
                    entry.kind === "tool" && css.logTool,
                    entry.kind === "error" && css.logError,
                  )}
                  key={index}
                >
                  {entry.kind === "tool"
                    ? <Wrench aria-hidden className={css.logIcon} size={ICON_SIZE.micro} />
                    : entry.kind === "error"
                    ? <AlertCircle aria-hidden className={css.logIcon} size={ICON_SIZE.micro} />
                    : <MessageSquare aria-hidden className={css.logIcon} size={ICON_SIZE.micro} />}
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && (
        <Alert
          action={
            <ActionButton
              aria-label="Dismiss the error"
              onClick={() => setError(null)}
              size="sm"
            >
              Dismiss
            </ActionButton>
          }
          variant="error"
        >
          {error}
        </Alert>
      )}

      {canRun && (
        <>
          <div className={css.composer}>
            <textarea
              aria-label={data.prompts.length ? "Follow-up for the agent" : "Prompt for the agent"}
              className={css.input}
              maxLength={MAX_PROMPT}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={data.prompts.length
                ? "Follow up…"
                : "What should the agent write?"}
              ref={inputRef}
              rows={data.prompts.length ? 1 : 3}
              value={draft}
            />
            <ActionButton
              aria-label={data.prompts.length ? "Send the follow-up" : "Send the prompt"}
              disabled={running || draft.trim() === ""}
              onClick={() => void send()}
              size="md"
              variant="accent"
            >
              <Send aria-hidden size={ICON_SIZE.inline} />
              Send
            </ActionButton>
          </div>
          <div className={css.footer}>
            <span>
              {running ? "Esc to stop" : "Ctrl+Enter to send"}
            </span>
            {!running && data.prompts.length === 0 && log.length === 0 && (
              <span className={css.empty}>No turns yet</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
