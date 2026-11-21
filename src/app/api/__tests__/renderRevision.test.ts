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
 * `unstable_cache` is replaced with an in-memory memo keyed by the arguments,
 * cleared before each test: there is no incremental cache outside a Next
 * request. What it lets the spec pin is the key, which is the third claim:
 *
 * 3. **A rewritten row renders again.** Autosaves fold a writing stretch into
 *    one revision row, so an id alone does not name content. The key carries
 *    the row's `createdAt` stamp, and a fold that moves it is a miss.
 */
import type { SerializedEditorState } from "lexical";

const { findRevision, findRevisionStamp, generateServerHtml, memo } = vi
  .hoisted(() => ({
    findRevision: vi.fn(),
    findRevisionStamp: vi.fn(),
    generateServerHtml: vi.fn(),
    memo: new Map<string, Promise<unknown>>(),
  }));

// Like Next's: keyed by the arguments, and a rejection is not kept.
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
  ) =>
  (...args: A): Promise<R> => {
    const key = `${fn.name}:${JSON.stringify(args)}`;
    if (!memo.has(key)) {
      const pending = fn(...args);
      pending.catch(() => memo.delete(key));
      memo.set(key, pending);
    }
    return memo.get(key) as Promise<R>;
  },
}));

vi.mock("@/repositories/revision", () => ({
  findRevision,
  findRevisionStamp,
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
  memo.clear();
  findRevisionStamp.mockResolvedValue({ stamp: "t0", pending: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("findRevisionHtml", () => {
  it("renders in process, without an HTTP round-trip", async () => {
    findRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockResolvedValue("<p></p>");

    expect(await findRevisionHtml("r1")).toEqual({
      status: "ok",
      html: "<p></p>",
    });
    expect(generateServerHtml).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a render failure as an error, not as an empty post", async () => {
    findRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockRejectedValue(new Error("parse failed"));

    expect(await findRevisionHtml("r1")).toEqual({ status: "error" });
  });

  it("reports a database failure as an error too", async () => {
    findRevision.mockRejectedValue(new Error("no connection"));

    expect(await findRevisionHtml("r1")).toEqual({ status: "error" });
  });

  it("is empty, not an error, when there is no such revision", async () => {
    findRevision.mockResolvedValue(null);

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
    findRevisionStamp.mockResolvedValue({ stamp: "t0", pending: true });
    findRevision.mockResolvedValue(revision(state(1)));

    expect(await findRevisionHtml("r1")).toEqual({ status: "empty" });
    expect(findRevision).not.toHaveBeenCalled();
    expect(generateServerHtml).not.toHaveBeenCalled();
  });

  it("renders a folded rewrite again rather than serving the first render", async () => {
    findRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockResolvedValueOnce("<p>first</p>");
    expect(await findRevisionHtml("r1")).toEqual({ status: "ok", html: "<p>first</p>" });

    // Same row, same stamp: the cache answers.
    expect(await findRevisionHtml("r1")).toEqual({ status: "ok", html: "<p>first</p>" });
    expect(generateServerHtml).toHaveBeenCalledTimes(1);

    // The editor folded another autosave into r1, which moved its stamp.
    findRevisionStamp.mockResolvedValue({ stamp: "t1", pending: false });
    generateServerHtml.mockResolvedValueOnce("<p>second</p>");
    expect(await findRevisionHtml("r1")).toEqual({ status: "ok", html: "<p>second</p>" });
  });

  it("passes an empty render through as ok, not as empty", async () => {
    findRevision.mockResolvedValue(revision(state(0)));
    generateServerHtml.mockResolvedValue("");

    expect(await findRevisionHtml("r1")).toEqual({ status: "ok", html: "" });
  });
});

describe("findRevisionThumbnail", () => {
  it("renders only the first three blocks, in process", async () => {
    findRevision.mockResolvedValue(revision(state(7)));
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
    findRevision.mockResolvedValue(revision(state(1)));
    generateServerHtml.mockRejectedValue(new Error("parse failed"));

    expect(await findRevisionThumbnail("r1")).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("is null for a pending proposal", async () => {
    findRevisionStamp.mockResolvedValue({ stamp: "t0", pending: true });

    expect(await findRevisionThumbnail("r1")).toBeNull();
    expect(generateServerHtml).not.toHaveBeenCalled();
  });
});
