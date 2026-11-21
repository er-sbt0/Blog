"use client";
/**
 * The session node's UI (docs/plans/archive/agent-block.md §3.3, slimmed by
 * docs/plans/agent-bar.md §4.1): the prompts as read-only lines, live status
 * with an interrupt (button and `Esc`), permission cards, the session's
 * "always" grants, the collapsed log and the folder chip.
 *
 * There is no prompt editor: the bar is the input (agent-bar §2.1). A prompt
 * arrives through `SEND_AGENT_PROMPT_COMMAND`, which queues it under this
 * node's key (`handoff.ts`); the component claims it on mount or when
 * notified, and runs the turn exactly as the block's own Send used to. Each
 * turn carries the selection the bar captured for it; only the first is
 * stored, for display. The turn's phase is published to `turns.ts`, which is
 * all the bar can see of it.
 *
 * A card is main's question, shown here: allow once, always for this session,
 * or deny. A click sends the answer and disables the card; only main's
 * `permission-resolved` closes it. `Esc` (or Stop) interrupts the turn, and
 * main denies every open card when it does.
 *
 * It talks to the session only through the injected `AgentHost`
 * (`context/AgentHostContext.tsx`). With no host — the VPS build, a browser,
 * read mode — it renders the record and nothing that could start anything.
 *
 * ### What is written to the node, and when
 *
 * The block's own record — the prompt when it is sent, the session id and
 * folder once `start` answers, the turn's log and outcome when it ends, the
 * grants when main reports them — goes through `writeAgentBookkeeping`
 * (`bookkeeping.ts`): off the undo history, and re-asserted after an undo or
 * redo, so taking back the agent's work never takes back the record of the
 * turn that did it. A turn's entries live in component state until its end —
 * see `model.ts` for why. The agent's *output* is not written here at all: it
 * arrives as ordinary blocks through the doc tools, one undo step per turn
 * (`utils/agentHistory.ts`).
 *
 * ### Lifecycle (phase 6, §6 q3)
 *
 * The turn belongs to this component. Unmounting it — the pane closing, the
 * block being deleted, an undo that removes it — interrupts the turn and
 * detaches its target, so a slow tool that comes back afterwards refuses
 * rather than writes. A reload is interrupted by main, which sees the page go
 * (`agentIpc.js`); the prompt is written with the outcome `interrupted` up
 * front, so a turn that never reaches its end — a reload, a crash — is
 * recorded as the stop it was rather than as the previous turn's outcome.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getState,
  $setState,
  type NodeKey,
  stopLexicalPropagation,
} from "lexical";
import {
  AlertCircle,
  Bot,
  ChevronRight,
  FileText,
  Folder,
  MessageSquare,
  ShieldCheck,
  ShieldQuestion,
  Square,
  TextSelect,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { blockIdState } from "@/lib/content-bridge";
import { mintBlockId } from "@/lib/content-bridge/blockId";
import { ICON_SIZE } from "@/theme/icons";
import {
  type AgentPermissionDecision,
  type AgentSessionEvent,
  type AgentToolTarget,
  useAgentHost,
} from "../../context/AgentHostContext";
import { useEditorDocumentId } from "../../context/DocumentContext";
import { ActionButton, Alert, Spinner } from "../../ui";
import { cx } from "../../ui/cx";
import { agentOutlineText } from "../../utils/agentDocTools";
import { writeAgentBookkeeping } from "./bookkeeping";
import {
  type AgentPromptHandOff,
  onAgentPrompt,
  returnAgentPrompt,
  takeAgentPrompt,
} from "./handoff";
import { publishAgentTurn, touchAgentBlock, withdrawAgentTurn } from "./turns";
import {
  type AgentBlockData,
  type AgentLiveStatus,
  type AgentLogEntry,
  type AgentPermissionCard,
  appendCounted,
  applyCardEvent,
  displayedStatus,
  droppedSummary,
  entriesForEvent,
  grantLabel,
  markAnswering,
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
  target instanceof HTMLElement && target.tagName === "BUTTON";

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
    case "waiting":
      return "Waiting on you";
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
  const documentId = useEditorDocumentId();

  const [live, setLive] = useState<AgentLiveStatus>({ phase: "idle" });
  const [pending, setPending] = useState<AgentLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [cards, setCards] = useState<AgentPermissionCard[]>([]);

  const cardRef = useRef<HTMLDivElement>(null);
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
  // Where `insert_image` uploads to (see `AgentToolTarget.documentId`).
  target.current.documentId = documentId;

  const running = live.phase !== "idle";
  const canRun = Boolean(host) && editable;

  /** Write to this block's record, outside the undo history (`bookkeeping.ts`). */
  const writeNode = useCallback(
    (change: (data: AgentBlockData) => Partial<AgentBlockData>) =>
      writeAgentBookkeeping(editor, nodeKey, change),
    [editor, nodeKey],
  );

  const finishTurn = useCallback(() => {
    const turn = turnRef.current;
    turnRef.current = null;
    setPending([]);
    setCards([]);
    setLive({ phase: "idle" });
    if (!turn) return;
    const entries = turn.interrupted
      ? [...turn.entries, { turn: turn.index, kind: "result" as const, text: "Stopped by you." }]
      : turn.entries;
    writeNode((current) => ({
      ...appendCounted(current, entries),
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
    if (event.type === "permission" || event.type === "permission-resolved") {
      setCards((current) => applyCardEvent(current, event));
    }
    // Main's word on what it applies; the block's copy follows it.
    if (event.type === "grants") writeNode(() => ({ grants: event.grants }));
    if (event.type === "turn-end") {
      finishTurn();
      return;
    }
    setLive((current) => nextLiveStatus(current, event));
  }, [finishTurn, writeNode]);
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

  /**
   * Run one turn from a handed-off prompt. The node's record is written as
   * before; a turn that fails to start takes its prompt back out and shows
   * why here — the bar has already let go of it.
   */
  const runTurn = useCallback(async ({ prompt, selection }: AgentPromptHandOff) => {
    if (!host || !agentHost) return;
    if (prompt.length > MAX_PROMPT) {
      setError(`That prompt is over ${MAX_PROMPT.toLocaleString()} characters.`);
      return;
    }
    setError(null);
    touchAgentBlock(editor, nodeKey);

    // The prompt goes in first and the outline is taken after, so the
    // stateHash the model starts from already counts this turn. The outcome
    // is `interrupted` until the turn's end says otherwise: a turn that never
    // gets there (a reload, a crash) was one. Only the first turn's selection
    // is kept on the node, for display; every turn's is sent.
    // Read from the node, not from props: a prompt claimed as the previous
    // turn ends can run before this component has re-rendered.
    let blockId = "";
    let index = 0;
    let previous: AgentBlockData["status"] = "idle";
    let previousContext: AgentBlockData["context"] = null;
    let grants: string[] = [];
    writeAgentBookkeeping(editor, nodeKey, (current, node) => {
      index = current.prompts.length;
      previous = current.status;
      previousContext = current.context;
      grants = current.grants;
      blockId = $getState(node, blockIdState);
      if (!blockId) {
        blockId = mintBlockId();
        $setState(node, blockIdState, blockId);
      }
      return {
        prompts: [...current.prompts, prompt],
        status: "interrupted",
        ...(index === 0 && !current.context && selection
          ? { context: selection }
          : {}),
      };
    });
    const context = {
      title: agentHost.postTitle,
      blockId,
      outline: agentOutlineText(editor, nodeKey),
      selection,
    };

    turnRef.current = { index, events: [], entries: [], interrupted: false };
    // Every write this turn makes shares one undo step (`agentHistory.ts`).
    target.current.turn = `${nodeKey}:${index}:${Date.now()}`;
    setLive({ phase: "starting" });

    const undoPrompt = (message: string | null) => {
      turnRef.current = null;
      setLive({ phase: "idle" });
      writeNode((current) => ({
        prompts: current.prompts.slice(0, index),
        status: previous,
        context: previousContext,
      }));
      setError(message && `Not sent: ${message}`);
      // The bar let go of this prompt when the command answered; offer it back.
      returnAgentPrompt({ editor, nodeKey, prompt, message });
    };

    const sessionId = sessionRef.current;
    if (sessionId) {
      connect(sessionId);
      const sent = await host.send(sessionId, prompt, context, grants);
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
  }, [agentHost, connect, editor, host, nodeKey, writeNode]);

  // Claim a handed-off prompt: on mount, when notified, and when a turn ends
  // (a prompt queued while one ran waits for it). Never two turns at once.
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;
  const [claimTick, setClaimTick] = useState(0);
  useEffect(
    () => onAgentPrompt(editor, nodeKey, () => setClaimTick((t) => t + 1)),
    [editor, nodeKey],
  );
  useEffect(() => {
    if (!canRun || running || turnRef.current) return;
    const turn = takeAgentPrompt(editor, nodeKey);
    if (turn) void runTurnRef.current(turn);
  }, [canRun, claimTick, editor, nodeKey, running]);

  const interrupt = useCallback(() => {
    const sessionId = sessionRef.current;
    if (!host || !sessionId || !turnRef.current) return;
    turnRef.current.interrupted = true;
    void host.interrupt(sessionId);
  }, [host]);

  const answer = useCallback(
    (requestId: string, decision: AgentPermissionDecision) => {
      if (!host) return;
      setCards((current) => markAnswering(current, requestId));
      host.answerPermission(requestId, decision);
    },
    [host],
  );

  /** Withdraw a grant. Main drops it on the next send, which names the rest. */
  const revokeGrant = useCallback((grant: string) => {
    writeNode((current) => ({
      grants: current.grants.filter((g) => g !== grant),
    }));
  }, [writeNode]);

  const log = [...data.log, ...pending];
  const openTranscript = agentHost?.host.openTranscript;
  const transcript = data.sessionId && openTranscript
    ? () => openTranscript(data.sessionId as string)
    : null;
  const notShown = droppedSummary(data.dropped, transcript !== null);
  const shown = displayedStatus(live, cards);
  const waiting = shown.phase === "waiting";
  const status = statusLabel(shown);

  // What the bar sees of this turn (`turns.ts`): Stop, and "waiting on you".
  const phase = !running ? "idle" : waiting ? "waiting" : "running";
  useEffect(() => {
    publishAgentTurn(
      { editor, nodeKey, sessionId: data.sessionId, phase },
      interrupt,
    );
  }, [data.sessionId, editor, interrupt, nodeKey, phase]);
  useEffect(() => () => withdrawAgentTurn(editor, nodeKey), [editor, nodeKey]);

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
              className={cx(css.chip, waiting ? css.statusWaiting : css.statusRunning)}
              role="status"
            >
              {waiting
                ? <ShieldQuestion aria-hidden size={ICON_SIZE.micro} />
                : <Spinner size="sm" />}
              <span className={cx(css.chipText, !waiting && css.live)}>
                {status}
              </span>
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

      {cards.map((card) => (
        <PermissionCard
          card={card}
          key={card.requestId}
          onAnswer={(decision) => answer(card.requestId, decision)}
        />
      ))}

      {data.grants.length > 0 && (
        <div aria-label="Always allowed in this session" className={css.grants} role="group">
          <span className={css.grantsLabel}>
            <ShieldCheck aria-hidden size={ICON_SIZE.micro} />
            Always allowed
          </span>
          {data.grants.map((grant) => (
            <span className={css.grant} key={grant} title={grant}>
              <span className={css.chipText}>{grantLabel(grant)}</span>
              {canRun && (
                <button
                  aria-label={`Stop always allowing ${grantLabel(grant)}`}
                  className={css.grantRemove}
                  disabled={running}
                  onClick={() => revokeGrant(grant)}
                  title={running
                    ? "Can be withdrawn once the turn ends"
                    : "Withdraw — the next turn asks again"}
                  type="button"
                >
                  <X aria-hidden size={ICON_SIZE.micro} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {data.prompts.length === 0 && (
        <p className={css.hint}>
          {canRun
            ? "Ask Claude in the bar below to write in this post — " +
              "paragraphs, lists, tables. It edits the post directly. You " +
              "choose the folder it works in when you send, and approve each " +
              "command or file change it makes there."
            : host
            ? "This post is in read mode."
            : "Agent sessions run in the desktop app."}
        </p>
      )}

      {(log.length > 0 || transcript) && (
        <>
          <div className={css.logHeader}>
            {log.length > 0 && (
              <button
                aria-expanded={logOpen}
                className={css.logToggle}
                onClick={() => setLogOpen((open) => !open)}
                type="button"
              >
                <ChevronRight aria-hidden className={css.caret} size={ICON_SIZE.inline} />
                Log · {log.length} {log.length === 1 ? "entry" : "entries"}
                {notShown && <span className={css.logCapped}>(capped)</span>}
              </button>
            )}
            <span className={css.spacer} />
            {transcript && (
              <ActionButton
                onClick={transcript}
                size="sm"
                title="Everything the session did, read from Claude Code's own record"
                variant="ghost"
              >
                <FileText aria-hidden size={ICON_SIZE.micro} />
                Full transcript
              </ActionButton>
            )}
          </div>
          {logOpen && notShown && <p className={css.logNote}>{notShown}</p>}
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
                    : entry.kind === "permission"
                    ? <ShieldCheck aria-hidden className={css.logIcon} size={ICON_SIZE.micro} />
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

      {running && (
        <div className={css.footer}>
          <span>
            {waiting
              ? "Esc stops the turn and denies open requests"
              : "Esc to stop"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One permission card. Three states: pending (the choices), answered (what the
 * author chose) and expired (denied without an answer — the timeout, a stop,
 * the window going). Every string in it came from main and is rendered as
 * text; an MCP server's name is configuration, not markup.
 */
function PermissionCard(
  { card, onAnswer }: {
    card: AgentPermissionCard;
    onAnswer: (decision: AgentPermissionDecision) => void;
  },
) {
  const resume = card.kind === "resume";
  const heading = card.title ||
    (resume ? "Resume this session?" : `Claude wants to use ${card.tool}`);
  const minutes = Math.max(1, Math.round(card.expiresInMs / 60_000));
  const always = card.always && card.always.length ? card.always : null;
  const busy = card.state === "pending" && card.answering;

  const deny = (
    <ActionButton
      disabled={busy}
      onClick={() => onAnswer("deny")}
      size="sm"
      variant="outline"
    >
      {resume ? "Cancel" : "Deny"}
    </ActionButton>
  );

  return (
    <div
      aria-label={resume ? "Resume confirmation" : "Permission request"}
      className={css.permission}
      data-state={card.state}
      role="group"
    >
      <div className={css.permissionHead}>
        {card.state === "pending"
          ? <ShieldQuestion aria-hidden className={css.permissionIcon} size={ICON_SIZE.dense} />
          : <ShieldCheck aria-hidden className={css.permissionIcon} size={ICON_SIZE.dense} />}
        <span>{heading}</span>
      </div>
      {!resume && card.summary && <code className={css.permissionSummary}>{card.summary}</code>}
      {card.detail && <p className={css.permissionDetail}>{card.detail}</p>}
      {card.reason && <p className={css.permissionDetail}>{card.reason}</p>}

      {card.state === "pending"
        ? (
          <div className={css.permissionActions}>
            {card.defaultToNo && deny}
            <ActionButton
              disabled={busy}
              onClick={() => onAnswer("allow")}
              size="sm"
              variant="accent"
            >
              {resume ? "Resume" : "Allow once"}
            </ActionButton>
            {always && (
              <ActionButton
                disabled={busy}
                onClick={() => onAnswer("always")}
                size="sm"
                title={`Always allow for this session: ${always.join(", ")}`}
                variant="outline"
              >
                Always: {always.map(grantLabel).join(", ")}
              </ActionButton>
            )}
            {!card.defaultToNo && deny}
            <span className={css.permissionNote}>
              {busy ? "Sending…" : `Denied automatically after ${minutes} min`}
            </span>
          </div>
        )
        : (
          <p
            className={cx(
              css.permissionOutcome,
              card.decision === "deny" && css.permissionDenied,
            )}
          >
            {card.text}
          </p>
        )}
    </div>
  );
}
