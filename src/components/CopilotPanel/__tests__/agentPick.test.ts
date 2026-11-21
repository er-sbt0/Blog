import {
  type AgentPending,
  advancePending,
  matchPosts,
  type PendingView,
} from "../agentPick";

const pending: AgentPending = { prompt: "hi", docId: "p1", since: 1000 };
const view = (over: Partial<PendingView> = {}): PendingView => ({
  focusedRootId: null,
  focusedDocId: null,
  editorInFocusedPane: false,
  editorState: "none",
  ...over,
});
const opened = (over: Partial<PendingView> = {}) =>
  view({ focusedRootId: "p1", focusedDocId: "p1", ...over });

describe("advancePending", () => {
  it("waits while the route changes and the editor mounts", () => {
    for (
      const v of [
        view(),
        opened({ editorState: "loading" }),
        // The ref still names some other pane's editor.
        opened({ editorState: "ready", editorInFocusedPane: false }),
      ]
    ) {
      expect(advancePending(pending, v, 2000)).toEqual({ pending, effect: null });
    }
  });

  it("sends once, when the picked post's editor is ready", () => {
    const ready = opened({ editorState: "ready", editorInFocusedPane: true });
    const first = advancePending(pending, ready, 2000);
    expect(first).toEqual({
      pending: null,
      effect: { kind: "send", docId: "p1", prompt: "hi" },
    });
    // Whatever re-runs the step afterwards finds nothing to send.
    expect(advancePending(first.pending, ready, 2001)).toEqual({
      pending: null,
      effect: null,
    });
  });

  it("accepts the post as another pane's tab", () => {
    const tab = view({
      focusedRootId: "root",
      focusedDocId: "p1",
      editorInFocusedPane: true,
      editorState: "ready",
    });
    expect(advancePending(pending, tab, 2000).effect?.kind).toBe("send");
  });

  it("fails rather than send into read mode, and never sends to another post", () => {
    expect(
      advancePending(
        pending,
        opened({ editorState: "readonly", editorInFocusedPane: true }),
        2000,
      ).effect,
    ).toEqual({ kind: "fail", message: "the post opened in read mode" });
    const other = view({
      focusedRootId: "p2",
      focusedDocId: "p2",
      editorInFocusedPane: true,
      editorState: "ready",
    });
    // The restored layout shows first on arrival; the picked post follows.
    expect(advancePending(pending, other, 2000)).toEqual({ pending, effect: null });
  });

  it("gives up at the bound", () => {
    const loading = opened({ editorState: "loading" });
    expect(advancePending(pending, loading, 1999 + 1000, 2000).effect).toBeNull();
    expect(advancePending(pending, loading, 3000, 2000)).toEqual({
      pending: null,
      effect: { kind: "fail", message: "the post did not open in time" },
    });
  });
});

describe("matchPosts", () => {
  const posts = [
    { id: "a", title: "Linear algebra notes", updatedAt: "2026-01-01" },
    { id: "b", title: "Algebra II", updatedAt: "2026-03-01" },
    { id: "c", title: "", updatedAt: new Date("2026-02-01") },
  ];

  it("lists the most recent first with no query", () => {
    expect(matchPosts(posts, "  ").map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(matchPosts(posts, "", 1).map((p) => p.id)).toEqual(["b"]);
  });

  it("matches every word, ignoring case", () => {
    expect(matchPosts(posts, "ALGEBRA").map((p) => p.id)).toEqual(["b", "a"]);
    expect(matchPosts(posts, "algebra notes").map((p) => p.id)).toEqual(["a"]);
    expect(matchPosts(posts, "untitled").map((p) => p.id)).toEqual(["c"]);
    expect(matchPosts(posts, "geometry")).toEqual([]);
  });
});
