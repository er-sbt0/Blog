/**
 * Rendering a stored revision: in this process, and with three answers.
 *
 * Two claims, and both are the kind that fail silently.
 *
 * 1. **No HTTP hop.** `src/app/api/utils.ts` used to POST the whole editor
 *    state to `${PUBLIC_URL}/api/embed` — this app fetching itself, up to
 *    ~11 MB of JSON per cache miss (docs/plans/blob-storage.md §3.1) — to reach
 *    a function two imports away. A regression here would not throw anywhere;
 *    it would just be slow, and would quietly re-acquire a dependency on an
 *    origin (`docs/plans/desktop-app.md` §14.3) and on an unauthenticated
 *    route to fetch — `/api/embed` has since been deleted, so a regression
 *    would have to reintroduce one. So the spec asserts `fetch` is never
 *    called.
 * 2. **`empty` is not `error`.** Both used to be `null`, which is why a render
 *    failure and a post with nothing in it were indistinguishable to `/view`
 *    and `/embed`. A reader must never be shown a blank post because rendering
 *    threw, nor "Something went wrong" because the post is genuinely empty.
 *
 * `unstable_cache` is replaced with the identity wrapper: there is no
 * incremental cache outside a Next request, and what is under test is the
 * branching around it, not Next's cache.
 */
import type { SerializedEditorState } from "lexical";

const { getCachedRevision, isPendingProposal, generateServerHtml } = vi.hoisted(
  () => ({
    getCachedRevision: vi.fn(),
    isPendingProposal: vi.fn(),
    generateServerHtml: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}));

vi.mock("@/repositories/revision", () => ({
  getCachedRevision,
  isPendingProposal,
}));

vi.mock("@/editor/utils/generateServerHtml", () => ({ generateServerHtml }));

const { findRevisionHtml, findRevisionThumbnail } = await import("../utils");

const state = (paragraphs: number): SerializedEditorState =>
  ({
    root: {
      type: "root",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      children: Array.from({ length: paragraphs }, () => ({
        type: "paragraph",
        version: 1,
        format: "",
        indent: 0,
        direction: null,
        children: [],
      })),
    },
  }) as unknown as SerializedEditorState;

const revision = (data: SerializedEditorState) => ({
  id: "r1",
  documentId: "d1",
  createdAt: new Date(0),
  proposedAt: null,
  data,
});

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  isPendingProposal.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findRevisionHtml", () => {
  it("renders in process, without an HTTP round-trip", async () => {
    getCachedRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockResolvedValue("<p></p>");

    expect(await findRevisionHtml("r1")).toEqual({
      status: "ok",
      html: "<p></p>",
    });
    expect(generateServerHtml).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a render failure as an error, not as an empty post", async () => {
    getCachedRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockRejectedValue(new Error("parse failed"));

    expect(await findRevisionHtml("r1")).toEqual({ status: "error" });
  });

  it("reports a database failure as an error too", async () => {
    getCachedRevision.mockRejectedValue(new Error("no connection"));

    expect(await findRevisionHtml("r1")).toEqual({ status: "error" });
  });

  it("is empty, not an error, when there is no such revision", async () => {
    getCachedRevision.mockResolvedValue(null);

    expect(await findRevisionHtml("r1")).toEqual({ status: "empty" });
    expect(generateServerHtml).not.toHaveBeenCalled();
  });

  /**
   * docs/plans/archive/agent-gating.md §2.1: `?v=` names a revision directly, so
   * a pending proposal would otherwise be published to anyone who can read the
   * document. It renders as nothing — which is an empty document, not a failure,
   * and must not be reported as one.
   */
  it("is empty for a pending proposal, and renders nothing at all", async () => {
    isPendingProposal.mockResolvedValue(true);
    getCachedRevision.mockResolvedValue(revision(state(1)));

    expect(await findRevisionHtml("r1")).toEqual({ status: "empty" });
    expect(getCachedRevision).not.toHaveBeenCalled();
    expect(generateServerHtml).not.toHaveBeenCalled();
  });

  it("passes an empty render through as ok, not as empty", async () => {
    getCachedRevision.mockResolvedValue(revision(state(0)));
    generateServerHtml.mockResolvedValue("");

    expect(await findRevisionHtml("r1")).toEqual({ status: "ok", html: "" });
  });
});

describe("findRevisionThumbnail", () => {
  it("renders only the first three blocks, in process", async () => {
    getCachedRevision.mockResolvedValue(revision(state(7)));
    generateServerHtml.mockResolvedValue("<p></p>");

    expect(await findRevisionThumbnail("r1")).toBe("<p></p>");
    expect(fetchSpy).not.toHaveBeenCalled();

    const [rendered] = generateServerHtml.mock.calls[0] as [
      SerializedEditorState,
    ];
    expect(rendered.root.children).toHaveLength(3);
  });

  /**
   * A thumbnail stays `string | null`: it is decoration on a card and its
   * absence already renders as a placeholder. What must not happen is the
   * failure going unrecorded, which is what the `catch (_error)` this replaced
   * did.
   */
  it("is null on a render failure, and says so in the log", async () => {
    getCachedRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockRejectedValue(new Error("parse failed"));

    expect(await findRevisionThumbnail("r1")).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("is null for a pending proposal", async () => {
    isPendingProposal.mockResolvedValue(true);

    expect(await findRevisionThumbnail("r1")).toBeNull();
    expect(generateServerHtml).not.toHaveBeenCalled();
  });
});
