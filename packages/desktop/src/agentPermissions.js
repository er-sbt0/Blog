import { randomUUID } from "node:crypto";

/**
 * The permission half of an agent session (docs/plans/agent-block.md §2.7,
 * §3.3, phase 2): which tool calls need the author, what the card says, and
 * the broker that holds each question until the author — or a timeout, an
 * interrupt or a closed window — answers it.
 *
 * No `electron` and no SDK import, so every rule here is pinned by a spec
 * (`__tests__/agentPermissions.test.ts`) without a window or a `claude`.
 *
 * ### Grants: "always for this session", enforced here
 *
 * A grant is a Claude Code permission rule string (`Bash(npm test *)`,
 * `WebFetch(domain:example.com)`) or {@link ACCEPT_EDITS}. Every turn is its
 * own `query()` — its own `claude` process — so the CLI's session-scoped rules
 * die with the turn (measured, SDK 0.3.309: a rule added through
 * `updatedPermissions` covers the rest of its turn and nothing after). Main
 * therefore keeps the session's grants itself, persists them next to the
 * session's folder in `agent-sessions.json`, and hands them to each turn as
 * `allowedTools` (and `permissionMode: "acceptEdits"`), where the CLI's own
 * matcher applies them. The rule strings come from the CLI's suggestions, not
 * from the renderer, and the destination is rewritten to `session`: a
 * suggestion says `localSettings`, which would write the grant into the
 * folder's `.claude/settings.local.json` and outlive the block.
 *
 * The block stores its grants too, **for display only**. On every send it
 * names the grants it still shows, and main keeps the intersection of that and
 * its own record ({@link reconcileGrants}): a renderer can withdraw a grant
 * (the chip's ×), never add one main did not record.
 */

/** How long a card waits for the author before it is denied. */
export const PERMISSION_TIMEOUT_MS = 10 * 60_000;

/** The one grant that is a mode rather than a rule: "accept edits in the folder". */
export const ACCEPT_EDITS = "@acceptEdits";

/** Grants kept per session; a block claiming more is refused the rest. */
export const MAX_GRANTS = 50;

export const DECISIONS = ["allow", "always", "deny"];

const RULE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,120}(?:\((?<content>[^\n\r\0]{1,500})\))?$/;

/** True for a string this module would have produced as a grant. */
export function isGrant(value) {
  return typeof value === "string" && (value === ACCEPT_EDITS || RULE_RE.test(value));
}

const ruleString = ({ toolName, ruleContent }) =>
  ruleContent ? `${toolName}(${ruleContent})` : String(toolName);

/**
 * What "always" would grant for this call, or `[]` when it should not be
 * offered at all.
 *
 * Taken from the CLI's own suggestions — it knows that `touch a.txt` wants
 * `Bash(touch *)` and that a `Write` wants accept-edits mode — and nothing is
 * invented when there are none: a bare tool name would grant every call of
 * that tool anywhere, which is more than any single card asked about.
 * `addDirectories` suggestions are dropped: a block's folder is the picker's
 * decision, never a card's.
 */
export function grantsFromSuggestions(suggestions, { suppress = false } = {}) {
  if (suppress || !Array.isArray(suggestions)) return [];
  const grants = [];
  for (const update of suggestions) {
    if (!update || typeof update !== "object") continue;
    if (update.type === "setMode" && update.mode === "acceptEdits") {
      grants.push(ACCEPT_EDITS);
    } else if (update.type === "addRules" && update.behavior === "allow") {
      for (const rule of Array.isArray(update.rules) ? update.rules : []) {
        if (rule && typeof rule.toolName === "string") grants.push(ruleString(rule));
      }
    }
  }
  return [...new Set(grants.filter(isGrant))];
}

/** A turn's options for a set of grants. */
export function grantsToOptions(grants) {
  const valid = (grants ?? []).filter(isGrant);
  return {
    allowedRules: valid.filter((grant) => grant !== ACCEPT_EDITS),
    permissionMode: valid.includes(ACCEPT_EDITS) ? "acceptEdits" : "default",
  };
}

/** The same grants, as the SDK's `updatedPermissions` — scoped to the session. */
export function grantsToUpdates(grants) {
  const { allowedRules, permissionMode } = grantsToOptions(grants);
  const updates = [];
  if (allowedRules.length) {
    updates.push({
      type: "addRules",
      behavior: "allow",
      destination: "session",
      rules: allowedRules.map((rule) => {
        const match = RULE_RE.exec(rule);
        const content = match?.groups?.content;
        return content
          ? { toolName: rule.slice(0, rule.indexOf("(")), ruleContent: content }
          : { toolName: rule };
      }),
    });
  }
  if (permissionMode === "acceptEdits") {
    updates.push({ type: "setMode", mode: "acceptEdits", destination: "session" });
  }
  return updates;
}

/**
 * Main's record, narrowed by what the block still claims. Order is the
 * record's; a claim main never recorded is ignored, not added.
 */
export function reconcileGrants(recorded, claimed) {
  const claims = new Set(Array.isArray(claimed) ? claimed.filter(isGrant) : []);
  return (Array.isArray(recorded) ? recorded : []).filter(
    (grant) => isGrant(grant) && claims.has(grant),
  );
}

/** Add to a record, keeping it unique and capped. */
export function addGrants(recorded, grants) {
  return [...new Set([...(recorded ?? []), ...grants.filter(isGrant)])].slice(0, MAX_GRANTS);
}

const clip = (value, limit) => {
  const text = typeof value === "string" ? value : "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

/**
 * One line naming what a built-in or MCP tool call asked for: the command,
 * the file, the URL. Shared by the card and the log (`describeToolCall`).
 */
export function summarizeToolInput(name, input) {
  const args = input && typeof input === "object" ? input : {};
  const str = (key) => (typeof args[key] === "string" ? args[key] : "");
  switch (name) {
    case "Bash":
      return clip(str("command"), 600);
    case "Read":
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return clip(str("file_path") || str("notebook_path"), 300);
    case "WebFetch":
      return clip(str("url"), 300);
    case "WebSearch":
      return clip(str("query"), 300);
    case "Glob":
    case "Grep":
      return clip([str("pattern"), str("path")].filter(Boolean).join(" in "), 300);
    default: {
      let text = "";
      try {
        text = JSON.stringify(args);
      } catch {
        text = "";
      }
      return text === "{}" ? "" : clip(text, 300);
    }
  }
}

/**
 * A second, optional line of context: a Bash call's own description, or what
 * an edit changes. Text only — the card renders it as text.
 */
function detailOf(name, input) {
  const args = input && typeof input === "object" ? input : {};
  if (name === "Bash" && typeof args.description === "string") return clip(args.description, 300);
  if (name === "Edit" && typeof args.new_string === "string") return clip(args.new_string, 600);
  if (name === "Write" && typeof args.content === "string") return clip(args.content, 600);
  return "";
}

/**
 * The card for one `canUseTool` call. Everything is plain text; `title` and
 * `reason` come from the CLI, and an MCP server name from configuration is
 * untrusted text the block renders as text, never as markup.
 */
export function describePermission(toolName, input, options = {}) {
  const tool = String(toolName);
  const summary = summarizeToolInput(tool, input);
  return {
    kind: "tool",
    tool: clip(tool, 160),
    title: clip(typeof options.title === "string" ? options.title : "", 300),
    summary,
    detail: detailOf(tool, input),
    reason: clip(typeof options.decisionReason === "string" ? options.decisionReason : "", 300),
    blockedPath: clip(typeof options.blockedPath === "string" ? options.blockedPath : "", 300),
    defaultToNo: Boolean(options.defaultToNo),
    label: summary ? `${clip(tool, 60)} · ${clip(summary, 120)}` : clip(tool, 60),
  };
}

/** The card a restored session shows before its first turn runs. */
export function describeResume(cwd) {
  return {
    kind: "resume",
    tool: "",
    title: `Resume this session in ${cwd}?`,
    summary: cwd,
    detail:
      "It can run commands and edit files in this folder once you allow them. " +
      "This is the first turn since the app restarted (or since another " +
      "window last held it).",
    reason: "",
    blockedPath: "",
    defaultToNo: false,
    label: "Resume session",
  };
}

/** What the model is told when a call is not allowed. */
const DENIAL = {
  answered:
    "The author denied this in the agent block. Do not retry it or work around " +
    "it; if you need it, say why in one sentence and stop.",
  expired:
    "No one answered the permission request in time, so it was denied. Stop and " +
    "say what you were waiting for.",
  interrupted: "The author stopped the turn.",
  closed: "The post's window closed.",
  cancelled: "The request was cancelled.",
};

/**
 * `canUseTool` for one session, given how to ask the author.
 *
 * The doc tools are the session's own (an in-process `sdk` server main
 * registered) and are allowed here without a card. They are deliberately not
 * in `allowedTools` once `canUseTool` exists (`agent.js` says why), so this is
 * the only thing allowing them. A call from a configured MCP server
 * that happens to be *named* `doc` is not one of them — trust is keyed on the
 * SDK's `source`, never on the name (the SDK's own advice).
 */
export function createCanUseTool({ docServer, ask, onGrant }) {
  const prefix = `mcp__${docServer}__`;
  return async function canUseTool(toolName, input, options = {}) {
    const fromSdk = !options.mcpServer || options.mcpServer.source === "sdk";
    if (String(toolName).startsWith(prefix) && fromSdk) {
      return { behavior: "allow", updatedInput: input };
    }
    const grants = grantsFromSuggestions(options.suggestions, {
      suppress: Boolean(options.suppressAlwaysAllowRule),
    });
    const card = { ...describePermission(toolName, input, options), always: grants };
    const { decision, reason } = await ask(card, options.signal);
    if (decision === "allow") return { behavior: "allow", updatedInput: input };
    if (decision === "always" && grants.length) {
      onGrant(grants);
      return { behavior: "allow", updatedInput: input, updatedPermissions: grantsToUpdates(grants) };
    }
    // Never `interrupt: true`. An interrupt or a closed window already stops
    // the turn by its own path, and an SDK-side interrupt ends the turn in an
    // error result the block would show as a failure (measured, SDK 0.3.309)
    // — for an expired card the model is told to stop instead, and does.
    return { behavior: "deny", message: DENIAL[reason] ?? DENIAL.answered };
  };
}

/**
 * Pending questions, one per card, each owned by the window it was sent to.
 *
 * Shaped like `agentIpc.js`'s tool-call round trip: the id is minted here, an
 * answer counts only from the owner and only for a pending id, and every way a
 * question can end without an answer — the timeout, an interrupt, the window
 * or its page going away, the SDK cancelling — ends it as **deny**.
 *
 * `notify(owner, event)` sends `permission` when a card opens and
 * `permission-resolved` when it closes, on the session's event stream. The
 * clock and the id are injectable so the spec can turn them by hand.
 *
 * @param {{
 *   notify: (owner: any, event: Record<string, unknown>) => void,
 *   timeoutMs?: number,
 *   mintId?: () => string,
 *   setTimer?: (fire: () => void, ms: number) => any,
 *   clearTimer?: (timer: any) => void,
 * }} options
 */
export function createPermissionBroker({
  notify,
  timeoutMs = PERMISSION_TIMEOUT_MS,
  mintId = randomUUID,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  /** requestId -> { owner, sessionId, always, label, resolve, timer, cleanup } */
  const pending = new Map();

  function settle(requestId, decision, reason) {
    const request = pending.get(requestId);
    if (!request) return false;
    pending.delete(requestId);
    clearTimer(request.timer);
    request.cleanup();
    notify(request.owner, {
      sessionId: request.sessionId,
      type: "permission-resolved",
      requestId,
      decision,
      reason,
      label: request.label,
    });
    request.resolve({ decision, reason });
    return true;
  }

  function denyWhere(predicate, reason) {
    let count = 0;
    for (const [requestId, request] of [...pending]) {
      if (predicate(request) && settle(requestId, "deny", reason)) count += 1;
    }
    return count;
  }

  return {
    /**
     * Ask; resolves `{ decision, reason }`, never rejects.
     *
     * @param {{ owner: any, sessionId: string, card: Record<string, any>, signal?: AbortSignal }} request
     * @returns {Promise<{ decision: string, reason: string }>}
     */
    request({ owner, sessionId, card, signal }) {
      const requestId = mintId();
      const always = Array.isArray(card.always) ? card.always : [];
      return new Promise((resolve) => {
        if (signal?.aborted || owner?.isDestroyed?.()) {
          resolve({ decision: "deny", reason: signal?.aborted ? "cancelled" : "closed" });
          return;
        }
        const onAbort = () => settle(requestId, "deny", "cancelled");
        signal?.addEventListener?.("abort", onAbort, { once: true });
        const timer = setTimer(() => settle(requestId, "deny", "expired"), timeoutMs);
        pending.set(requestId, {
          owner,
          sessionId,
          always,
          label: card.label ?? "",
          resolve,
          timer,
          cleanup: () => signal?.removeEventListener?.("abort", onAbort),
        });
        notify(owner, {
          sessionId,
          type: "permission",
          requestId,
          ...card,
          always: always.length ? always : null,
          expiresInMs: timeoutMs,
        });
      });
    },

    /**
     * The author's answer. False — and nothing happens — unless it names a
     * pending request, comes from the window that request was sent to, and
     * is a decision that card offered.
     */
    answer(owner, requestId, decision) {
      if (typeof requestId !== "string") return false;
      const request = pending.get(requestId);
      if (!request || request.owner !== owner) return false;
      if (!DECISIONS.includes(decision)) return false;
      if (decision === "always" && request.always.length === 0) return false;
      return settle(requestId, decision, "answered");
    },

    /** Deny a session's open cards (the author interrupted). */
    denySession: (sessionId, reason = "interrupted") =>
      denyWhere((request) => request.sessionId === sessionId, reason),

    /** Deny a window's open cards (it closed, or its page navigated away). */
    denyOwner: (owner, reason = "closed") =>
      denyWhere((request) => request.owner === owner, reason),

    /** Deny everything (the app is closing). */
    denyAll: (reason = "closed") => denyWhere(() => true, reason),

    pendingFor: (sessionId) =>
      [...pending].filter(([, request]) => request.sessionId === sessionId).map(([id]) => id),
  };
}
