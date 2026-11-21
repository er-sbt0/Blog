"use client";
/**
 * The desktop bar's composer: the input to the focused post's agent session
 * (docs/plans/archive/agent-bar.md §2.1, §2.4, §4.2).
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
 * With no post open, a send asks where to work first (§2.7, §4.3): a new post
 * or one from the library (`AgentPostPicker`). It opens in a pane, and the
 * prompt goes to that pane's editor — as a new session, with no selection —
 * once the editor can take it (`agentPick.ts`).
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
import { usePathname, useRouter } from "next/navigation";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
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
import { buildPostCreateInput } from "@/lib/newPost";
import { actions, postsSelectors, useDispatch, useSelector } from "@/store";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
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
import { type AgentPending, advancePending, PICK_OPEN_TIMEOUT_MS } from "./agentPick";
import AgentPostPicker, { type AgentPostChoice } from "./AgentPostPicker";

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
  /**
   * The focused document, or `null` with no post focused. Only read on the
   * workspace route: the layout is remembered elsewhere too, and a pane that
   * is not on screen is no post (the phase 2 log's `/posts` caveat).
   */
  documentId: string | null;
  /** The idle one-row form; the bar drives it off focus. */
  compact: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

const AgentComposer: React.FC<AgentComposerProps> = (
  { documentId: focusedDocId, compact, inputRef },
) => {
  const dispatch = useDispatch();
  const run = useCommandRun();
  const router = useRouter();
  const inWorkspace = usePathname().startsWith("/edit");
  const documentId = inWorkspace ? focusedDocId : null;
  const focusedPane = useSelector(selectFocusedPane);
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

  // Set when the error is about a picked post that never took the prompt: the
  // editor changing is how that failure arrives, so it must not clear it.
  const pickFailed = useRef(false);

  // "New session" and a stale error belong to the post they were set in.
  useEffect(() => {
    setFresh(false);
    if (!pickFailed.current) setError(null);
    pickFailed.current = false;
  }, [editor]);

  // The no-post hand-off (§4.3). The ref is the authority, so the send
  // happens once whatever re-runs the effect; the state is for rendering.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const pendingRef = useRef<AgentPending | null>(null);
  const [pending, setPending] = useState<AgentPending | null>(null);
  const [tick, setTick] = useState(0);

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

  const availability = pending
    ? { state: "loading" as const, reason: "Opening the post…" }
    : agentBarAvailability(hostState, editorState);
  const ready = availability.state === "ready";
  const picking = availability.state === "pick";
  const stoppable = turnToStop(turns, editor, session?.nodeKey ?? null);
  const waiting = turnWaitingOnYou(turns, editor);
  const tooLong = promptProblem(draft, MAX_AGENT_PROMPT);
  const chip = sessionChipLabel(session, fresh);
  const canSend = (ready || picking) && !stoppable && !tooLong &&
    Boolean(draft.trim());

  // Another post's card names that post; the DOM is where its id is.
  const waitingDocId = waiting && !waiting.here
    ? locateEditor(waiting.turn.editor).docId
    : null;
  const waitingTitle = useSelector((state) =>
    waitingDocId ? postsSelectors.selectById(state, waitingDocId)?.title : null
  );

  /** Hand `prompt` to the post's node; `false` when the command refused it. */
  const handOff = useCallback(
    (
      target: LexicalEditor,
      prompt: string,
      selection: ReturnType<typeof captureSelection>,
      newSession: boolean,
    ) => {
      const sent = target.dispatchCommand(SEND_AGENT_PROMPT_COMMAND, {
        prompt,
        selection,
        newSession,
      });
      if (!sent) return false;
      lastSent.current = { editor: target, prompt };
      // Only what was sent: the author may have kept typing while it opened.
      setDraft((current) => (current.trim() === prompt ? "" : current));
      setFresh(false);
      setError(null);
      return true;
    },
    [],
  );

  const send = useCallback(() => {
    if (!canSend) return;
    if (picking) {
      setPickError(null);
      setPickerOpen(true);
      return;
    }
    if (!editor) return;
    const prompt = draft.trim();
    // Before the dispatch: the command inserts a new node after the block
    // holding the selection, and the selection it names is this one.
    const selection = captureSelection(editor);
    if (!handOff(editor, prompt, selection, fresh)) {
      // Every refusal the bar can foresee is already a disabled Send; this is
      // the race — a turn that started between render and click.
      setError("Not sent — the agent is busy in this post. Try again when it finishes.");
    }
  }, [canSend, draft, editor, fresh, handOff, picking]);

  const openForPrompt = useCallback((docId: string) => {
    const next = { prompt: draft.trim(), docId, since: Date.now() };
    pendingRef.current = next;
    setPending(next);
    setPickerOpen(false);
    setError(null);
    if (inWorkspace) {
      void run(documentCommands.open, { id: docId });
      return;
    }
    // From outside the workspace, through the deep-link entry rather than
    // `document.open`'s bare `/edit`. `WorkspacePanes` closes every pane on
    // unmount, and StrictMode's replayed effects run that cleanup as the
    // route mounts — so in development a pane opened before the navigation
    // was gone on arrival, and the stored layout came back in its place. The
    // entry is replayed by the seam after the restore whatever happened
    // before it; the `openPane` first is what makes it an open by a person,
    // not a URL, wherever that cleanup does not run.
    dispatch(actions.openPane({ rootId: docId, mode: "write" }));
    router.push(`/edit/${docId}`);
  }, [dispatch, draft, inWorkspace, router, run]);

  const pick = useCallback(async (choice: AgentPostChoice) => {
    if (choice.kind === "existing") return openForPrompt(choice.id);
    const payload = buildPostCreateInput({
      // A draft, as the sidebar's one-click "+" makes one: publishing stays a
      // decision taken on purpose, from the post's own settings.
      published: false,
      private: false,
      collab: false,
      placement: "start",
    });
    setCreating(true);
    setPickError(null);
    try {
      await dispatch(actions.createPost(payload)).unwrap();
      openForPrompt(payload.id);
    } catch {
      setPickError("Could not create the post. Try again, or pick an existing one.");
    } finally {
      setCreating(false);
    }
  }, [dispatch, openForPrompt]);

  // Watch the picked post open, and send into it once it can take a prompt.
  const editorPaneId = editor ? locateEditor(editor).paneId : null;
  useEffect(() => {
    if (!pendingRef.current) return;
    const { pending: next, effect } = advancePending(pendingRef.current, {
      focusedRootId: inWorkspace ? focusedPane?.rootId ?? null : null,
      focusedDocId: documentId,
      editorInFocusedPane: Boolean(focusedPane) && editorPaneId === focusedPane?.id,
      editorState,
    }, Date.now());
    pendingRef.current = next;
    if (!next) setPending(null);
    if (effect?.kind === "fail") {
      pickFailed.current = true;
      setError(`Not sent: ${effect.message}`);
    }
    if (effect?.kind === "send" && editor) {
      // A new session with no selection: nothing in this post was selected
      // when the prompt was written.
      if (!handOff(editor, effect.prompt, null, true)) {
        setError("Not sent — the post could not take the prompt. Try again.");
      } else {
        // The node went at the end of a post the author has not looked at
        // yet; show it, once the insert has committed.
        setTimeout(() => {
          const session = getCurrentAgentSession(editor);
          if (session) {
            revealAgentNode(editor, session.nodeKey, dispatch, { toCard: false });
          }
        }, 0);
      }
    }
    if (!next) return;
    // Look again when the bound runs out, in case nothing else changes.
    const left = next.since + PICK_OPEN_TIMEOUT_MS - Date.now();
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, left) + 50);
    return () => clearTimeout(timer);
  }, [
    pending,
    tick,
    inWorkspace,
    focusedPane,
    documentId,
    editor,
    editorPaneId,
    editorState,
    handOff,
    dispatch,
  ]);

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

  const reason = "reason" in availability ? availability.reason : undefined;
  // Not `null`: an absent `tools` is Copilot's toolbar.
  const tools = picking
    ? <></>
    : !ready
    ? (
      <Box
        role="status"
        sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.5, minWidth: 0 }}
      >
        {availability.state === "loading"
          ? <CircularProgress size={12} aria-hidden />
          : <Bot size={ICON_SIZE.inline} aria-hidden />}
        <Typography variant="micro" color="text.secondary" noWrap>
          {reason}
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
          : "Ask Claude — you'll pick the post it works in"}
        compact={compact}
        compactPlaceholder="Ask Claude…"
        disabledReason={reason}
        inputRef={inputRef}
        tools={tools}
        inputLabel="Message the agent"
        stopLabel="Stop the agent (Esc)"
        editableWhileBusy
      />
      <AgentPostPicker
        open={pickerOpen}
        creating={creating}
        error={pickError}
        onPick={pick}
        // The draft stays in the bar: nothing was sent.
        onCancel={() => setPickerOpen(false)}
      />
    </>
  );
};

export default AgentComposer;
