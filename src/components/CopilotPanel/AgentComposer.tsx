"use client";
/**
 * The desktop bar's composer: the input to the focused post's agent session
 * (docs/plans/agent-bar.md §2.1, §2.4, §4.2).
 *
 * It dispatches `SEND_AGENT_PROMPT_COMMAND` into the focused post's editor and
 * does nothing else to the session: the node in the post owns it (§3) — it
 * runs the turn, shows its progress, holds its cards and its log. So there is
 * no thread here and no expand-to-transcript; what the bar adds is:
 *
 * - the selection, captured on every send (§2.9), as `CopilotChat` does;
 * - a session chip ("session · N turns") and a **New session** toggle (§2.6);
 * - Stop and `Esc` while a turn of this post runs;
 * - "waiting on you", loudly and from any post (§6.5), jumping to the card.
 *
 * Everything else is quiet: a running turn is the node's to show.
 *
 * ### Which editor
 *
 * The focused pane's, from `ActiveEditorContext`. That context is a ref, and
 * the panel publishes it when its pane takes focus — which, on a fresh open,
 * is before the post has loaded and its editor exists. A ref changing is not a
 * render, so while a post is focused and no editor has turned up the bar polls
 * the ref; once it has one it follows that editor's root (an unmount is a
 * `null` root) and its editable flag. See the phase 2 log.
 */
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { Bot, MessageSquarePlus, ShieldQuestion } from "lucide-react";
import type { LexicalEditor } from "lexical";
import { ActiveEditorContext } from "@/contexts/ActiveEditorContext";
import { AgentBlockNode } from "@/editor/nodes/AgentBlockNode";
import {
  type AgentSessionSummary,
  getAgentTurns,
  getCurrentAgentSession,
  interruptAgentTurn,
  MAX_AGENT_PROMPT,
  onAgentPromptReturned,
  SEND_AGENT_PROMPT_COMMAND,
  subscribeAgentTurns,
} from "@/editor/plugins/AgentPlugin";
import { captureSelection } from "@/editor/utils/captureSelection";
import { getAgentHost } from "@/lib/agentHost";
import { postsSelectors, useDispatch, useSelector } from "@/store";
import { ICON_SIZE } from "@/theme/icons";
import Composer, { composerPillSx, composerToolButtonSx } from "./Composer";
import {
  agentBarAvailability,
  type AgentEditorState,
  type AgentHostState,
  promptProblem,
  sessionChipLabel,
  turnToStop,
  turnWaitingOnYou,
} from "./agentBar";
import { locateEditor, revealAgentNode } from "./agentJump";

/** How often to look for a focused post's editor that has not mounted yet. */
const EDITOR_POLL_MS = 250;

/** A connected editor that can hold a session node, or `null`. */
const usable = (editor: LexicalEditor | null): LexicalEditor | null =>
  editor && editor.getRootElement()?.isConnected &&
    editor.hasNodes([AgentBlockNode])
    ? editor
    : null;

/**
 * The focused post's editor, and whether it can take a prompt. `documentId`
 * is the focused document (`selectFocusedDocId`); `null` means no post.
 */
function useFocusedEditor(
  documentId: string | null,
): { editor: LexicalEditor | null; state: AgentEditorState } {
  const ref = useContext(ActiveEditorContext);
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [editable, setEditable] = useState(false);

  useEffect(() => {
    let current: LexicalEditor | null = null;
    let offs: (() => void)[] = [];
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const check = () => {
      const next = documentId ? usable(ref.current) : null;
      if (next && timer) stopPolling();
      if (!next && documentId && !timer) timer = setInterval(check, EDITOR_POLL_MS);
      if (next === current) return;
      for (const off of offs) off();
      offs = [];
      current = next;
      setEditor(next);
      if (!next) return;
      setEditable(next.isEditable());
      offs = [
        next.registerEditableListener(setEditable),
        // The panel unmounting (a route change, the pane closing) takes the
        // root away; look again rather than hold an editor nobody can see.
        next.registerRootListener((root) => {
          if (!root) queueMicrotask(check);
        }),
      ];
    };
    check();
    return () => {
      stopPolling();
      for (const off of offs) off();
    };
  }, [ref, documentId]);

  const state: AgentEditorState = !documentId
    ? "none"
    : !editor
    ? "loading"
    : editable
    ? "ready"
    : "readonly";
  return { editor, state };
}

/** The current session of `editor`'s post, kept current across its updates. */
function useCurrentSession(
  editor: LexicalEditor | null,
  turnsVersion: unknown,
): AgentSessionSummary | null {
  const [session, setSession] = useState<AgentSessionSummary | null>(null);
  useEffect(() => {
    if (!editor) {
      setSession(null);
      return;
    }
    const read = () => {
      const next = getCurrentAgentSession(editor);
      setSession((prev) =>
        prev && next && prev.nodeKey === next.nodeKey &&
          prev.sessionId === next.sessionId && prev.turns === next.turns
          ? prev
          : next
      );
    };
    read();
    return editor.registerUpdateListener(read);
  }, [editor, turnsVersion]);
  return session;
}

interface AgentComposerProps {
  /** The focused document, or `null` with no post focused. */
  documentId: string | null;
  /** The idle one-row form; the bar drives it off focus. */
  compact: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

const AgentComposer: React.FC<AgentComposerProps> = (
  { documentId, compact, inputRef },
) => {
  const dispatch = useDispatch();
  const { editor, state: editorState } = useFocusedEditor(documentId);
  const title = useSelector((state) =>
    documentId ? postsSelectors.selectById(state, documentId)?.title : undefined
  ) || "Untitled";

  // Read in an effect: the server pass has no bridge (`getAgentHost`).
  const [hostState, setHostState] = useState<AgentHostState>("pending");
  useEffect(() => setHostState(getAgentHost() ? "present" : "missing"), []);

  const turns = useSyncExternalStore(
    subscribeAgentTurns,
    getAgentTurns,
    getAgentTurns,
  );
  const session = useCurrentSession(editor, turns);

  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What this bar last handed to a node, so only its own prompt is restored.
  const lastSent = useRef<{ editor: LexicalEditor; prompt: string } | null>(
    null,
  );

  // "New session" and a stale error belong to the post they were set in.
  useEffect(() => {
    setFresh(false);
    setError(null);
  }, [editor]);

  // A prompt the node took and could not send — the folder dialog cancelled,
  // an IPC error. The node says "Not sent: …"; the bar gives the draft back,
  // unless the author has started another one since.
  useEffect(
    () =>
      onAgentPromptReturned(({ editor: from, prompt, message }) => {
        const sent = lastSent.current;
        if (!sent || sent.editor !== from || sent.prompt !== prompt) return;
        lastSent.current = null;
        setDraft((current) => (current.trim() ? current : prompt));
        if (message) setError(`Not sent: ${message}`);
      }),
    [],
  );

  const availability = agentBarAvailability(hostState, editorState);
  const ready = availability.state === "ready";
  const stoppable = turnToStop(turns, editor, session?.nodeKey ?? null);
  const waiting = turnWaitingOnYou(turns, editor);
  const tooLong = promptProblem(draft, MAX_AGENT_PROMPT);
  const chip = sessionChipLabel(session, fresh);
  const canSend = ready && !stoppable && !tooLong && Boolean(draft.trim());

  // Another post's card names that post; the DOM is where its id is.
  const waitingDocId = waiting && !waiting.here
    ? locateEditor(waiting.turn.editor).docId
    : null;
  const waitingTitle = useSelector((state) =>
    waitingDocId ? postsSelectors.selectById(state, waitingDocId)?.title : null
  );

  const send = useCallback(() => {
    if (!editor || !canSend) return;
    const prompt = draft.trim();
    // Before the dispatch: the command inserts a new node after the block
    // holding the selection, and the selection it names is this one.
    const selection = captureSelection(editor);
    const sent = editor.dispatchCommand(SEND_AGENT_PROMPT_COMMAND, {
      prompt,
      selection,
      newSession: fresh,
    });
    if (!sent) {
      // Every refusal the bar can foresee is already a disabled Send; this is
      // the race — a turn that started between render and click.
      setError("Not sent — the agent is busy in this post. Try again when it finishes.");
      return;
    }
    lastSent.current = { editor, prompt };
    setDraft("");
    setFresh(false);
    setError(null);
  }, [canSend, draft, editor, fresh]);

  const stop = useCallback(() => {
    if (stoppable) interruptAgentTurn(stoppable.editor, stoppable.nodeKey);
  }, [stoppable]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && stoppable) {
      // Stopping consumes the key; the bar would otherwise also step away.
      e.preventDefault();
      e.stopPropagation();
      stop();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      send();
    }
  };

  const tools = !ready
    ? (
      <Box
        role="status"
        sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.5, minWidth: 0 }}
      >
        {availability.state === "loading"
          ? <CircularProgress size={12} aria-hidden />
          : <Bot size={ICON_SIZE.inline} aria-hidden />}
        <Typography variant="micro" color="text.secondary" noWrap>
          {availability.reason}
        </Typography>
      </Box>
    )
    : (
      <>
        {chip && (
          <Tooltip
            title={fresh
              ? "The next prompt starts its own session"
              : "Show this session in the post"}
          >
            <ButtonBase
              aria-label={fresh ? "New session armed" : `Show the ${chip}`}
              disabled={fresh || !session || !editor}
              onClick={() =>
                editor && session &&
                revealAgentNode(editor, session.nodeKey, dispatch, { toCard: false })}
              sx={composerPillSx}
            >
              <Bot size={ICON_SIZE.inline} aria-hidden />
              {chip}
            </ButtonBase>
          </Tooltip>
        )}
        {session && (
          <Tooltip
            title={fresh
              ? "Continue the current session instead"
              : "New session — the next prompt starts its own"}
          >
            <IconButton
              aria-label="New session"
              aria-pressed={fresh}
              onClick={() => setFresh((on) => !on)}
              sx={{
                ...composerToolButtonSx,
                ...(fresh ? { bgcolor: "action.selected", color: "text.primary" } : {}),
              }}
            >
              <MessageSquarePlus size={ICON_SIZE.dense} />
            </IconButton>
          </Tooltip>
        )}
      </>
    );

  return (
    <>
      {waiting && (
        // The one loud state (§3): a card nobody can see is a silent stall.
        <Box role="status" aria-live="polite" sx={{ flexShrink: 0 }}>
          <Button
            fullWidth
            size="small"
            variant="contained"
            color="warning"
            startIcon={<ShieldQuestion size={ICON_SIZE.inline} aria-hidden />}
            onClick={() =>
              revealAgentNode(
                waiting.turn.editor,
                waiting.turn.nodeKey,
                dispatch,
                { toCard: true },
              )}
            sx={{ justifyContent: "flex-start", typography: "dense", fontWeight: 600 }}
          >
            {waiting.here
              ? "The agent is waiting on you — answer its request"
              : `The agent is waiting on you in “${waitingTitle ?? "another post"}”`}
          </Button>
        </Box>
      )}
      {(error || tooLong) && (
        <Alert
          severity="error"
          onClose={error ? () => setError(null) : undefined}
          sx={{ py: 0, typography: "dense", flexShrink: 0 }}
        >
          {error ?? `Too long to send: ${tooLong}`}
        </Alert>
      )}
      <Composer
        value={draft}
        onChange={(value) => {
          setDraft(value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        onSend={send}
        onStop={stop}
        busy={Boolean(stoppable)}
        canSend={canSend}
        placeholder={documentId
          ? `Ask Claude to work in “${title}” — it writes into the post`
          : "Ask Claude…"}
        compact={compact}
        compactPlaceholder="Ask Claude…"
        disabledReason={ready ? undefined : availability.reason}
        inputRef={inputRef}
        tools={tools}
        inputLabel="Message the agent"
        stopLabel="Stop the agent (Esc)"
        editableWhileBusy
      />
    </>
  );
};

export default AgentComposer;
