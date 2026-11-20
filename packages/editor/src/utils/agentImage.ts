/**
 * `insert_image`, the renderer's half (docs/plans/agent-block.md §4.1, §4.2,
 * phase 3), and the async entry point every doc-tool call goes through.
 *
 * Main has already done the part that touches the disk: a `{ path }` call
 * arrives here as `file` — bytes main read from inside the session's folder,
 * with the type main sniffed from their content (`packages/desktop/src/
 * agentFiles.js`). No path ever reaches this file. What is left is what the
 * image plugin does with a picture the author pastes:
 *
 * - **Upload through the app's own blob path** — `blobSrcOrFallback`, the
 *   function the paste and the image dialog call — against the document this
 *   editor is editing. The node then stores `/api/blob/<hash>`, and the save
 *   that follows writes `blobHashes` and reconciles `BlobRef` exactly as it
 *   does for a pasted picture, because it *is* that save.
 * - **Fall back to a data URI** where that function does: a local
 *   (signed-out) post has no server document, so the upload is refused and the
 *   picture is stored inline, which is the form a local post's pictures take
 *   anyway (CLAUDE.md, "a local document carries its own").
 *
 * **SVG is sanitized, not refused.** A plot saved as SVG is the ordinary case
 * for matplotlib and friends, so refusing it would cost the tool's main use.
 * The markup goes through `sanitizeSvgMarkup` — the DOMPurify pass sketches and
 * graphs already rely on — before it is stored, and an SVG the pass empties is
 * refused. It is rendered through `<img>`, where scripts do not run anyway;
 * the sanitize is for every other way the bytes can be opened (the blob route
 * serves them sandboxed, a data URI copied out of a post is not).
 *
 * **A `url` is stored as given**, which is what the image codec does with
 * `src` for every agent surface: the post then loads it from that origin, as
 * it would a URL pasted into the image dialog. Fetching it here would make the
 * renderer a fetcher of agent-chosen URLs for no gain the author asked for.
 * Only http(s) and the app's own `/api/blob/<hash>` are accepted.
 */
import type { AgentToolTarget } from "../context/AgentHostContext";
import { blobSrcOrFallback } from "./uploadBlob";
import { sanitizeSvgMarkup, standaloneSvg } from "./sanitizeSvg";
import {
  type AgentToolResult,
  insertImageBlock,
  READ_ONLY,
  runAgentDocTool,
} from "./agentDocTools";
import { loadSketchRenderer, runDrawSketch, type SketchRenderer } from "./agentSketch";
import { type GraphRenderer, loadGraphRenderer, runPlotGraph } from "./agentGraph";

/** The same cap as `POST /api/blob` and main's read. */
export const AGENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** The types main's sniff can answer, and the blob route stores. */
const IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const BLOB_PATH = /^\/api\/blob\/[0-9a-f]{64}$/;
const MAX_URL = 2048;

export interface AgentImageDeps {
  /** `blobSrcOrFallback`, injectable so the spec needs no server. */
  store: (file: Blob, dataUri: string, documentId: string | null) => Promise<string>;
  /** `sanitizeSvgMarkup`, injectable because a test has no DOMPurify window. */
  sanitizeSvg: (markup: string) => string;
  /**
   * `draw_sketch`'s Excalidraw, loaded on first use (`agentSketch.ts`).
   * Optional so a spec of the other tools need not name it.
   */
  sketchRenderer?: () => Promise<SketchRenderer>;
  /** `plot_graph`'s hidden GeoGebra applet (`agentGraph.ts`), likewise. */
  graphRenderer?: () => Promise<GraphRenderer>;
}

const defaultDeps: AgentImageDeps = {
  store: blobSrcOrFallback,
  sanitizeSvg: sanitizeSvgMarkup,
  sketchRenderer: loadSketchRenderer,
  graphRenderer: loadGraphRenderer,
};

type Field = string | undefined;
const text = (value: unknown): Field => (typeof value === "string" ? value : undefined);

/** Base64 without `Buffer` or `FileReader`, in slices `fromCharCode` can take. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The SVG to store, or null (`standaloneSvg`). */
function cleanSvg(bytes: Uint8Array, sanitize: (markup: string) => string): Uint8Array | null {
  let markup: string;
  try {
    markup = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  const clean = standaloneSvg(sanitize(markup));
  return clean === null ? null : new TextEncoder().encode(clean);
}

/** Bytes main read → the `src` to store. */
async function srcFromFile(
  file: unknown,
  documentId: string | null,
  deps: AgentImageDeps,
): Promise<{ ok: true; src: string } | { ok: false; error: string }> {
  const raw = file && typeof file === "object" ? file as Record<string, unknown> : {};
  const mime = text(raw.mime) ?? "";
  // `isView` rather than `instanceof`: the bytes were structured-cloned over
  // IPC and through the context bridge, and a realm check is the wrong test.
  let bytes = ArrayBuffer.isView(raw.bytes)
    ? new Uint8Array(raw.bytes.buffer, raw.bytes.byteOffset, raw.bytes.byteLength)
    : null;
  if (!bytes || bytes.length === 0 || !IMAGE_TYPES.has(mime)) {
    return { ok: false, error: "The app could not read that picture." };
  }
  if (bytes.length > AGENT_IMAGE_MAX_BYTES) {
    return { ok: false, error: "That picture is over the 10 MB cap." };
  }
  if (mime === "image/svg+xml") {
    bytes = cleanSvg(bytes, deps.sanitizeSvg);
    if (!bytes) {
      return {
        ok: false,
        error: "That SVG has nothing left once scripts and external " +
          "references are removed, so it was not inserted. Save a PNG instead.",
      };
    }
  }
  const dataUri = `data:${mime};base64,${base64(bytes)}`;
  // A fresh buffer, so the Blob owns exactly these bytes and nothing else the
  // view might be a window onto.
  const blob = new Blob([bytes.slice()], { type: mime });
  return { ok: true, src: await deps.store(blob, dataUri, documentId) };
}

/** A URL the agent named → the `src` to store, as given, or a refusal. */
function srcFromUrl(url: string): { ok: true; src: string } | { ok: false; error: string } {
  if (url.length > MAX_URL) return { ok: false, error: "That URL is too long." };
  if (BLOB_PATH.test(url)) return { ok: true, src: url };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "url must be an absolute http(s) URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      error: "url must be http(s). For a file on disk, use path instead.",
    };
  }
  return { ok: true, src: parsed.href };
}

async function insertImageTool(
  target: AgentToolTarget,
  input: unknown,
  deps: AgentImageDeps,
): Promise<AgentToolResult> {
  if (!target.editor.isEditable()) return READ_ONLY;
  const args = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const url = text(args.url);
  const resolved = args.file !== undefined
    ? await srcFromFile(args.file, target.documentId ?? null, deps)
    : url !== undefined
    ? srcFromUrl(url)
    : { ok: false as const, error: "insert_image takes path or url." };
  if (!resolved.ok) return resolved;
  // The upload took a while; the post may have been closed or locked since.
  if (!target.editor.isEditable()) return READ_ONLY;
  const name = args.file && typeof args.file === "object"
    ? text((args.file as Record<string, unknown>).name)
    : undefined;
  return insertImageBlock(target, {
    src: resolved.src,
    alt: text(args.alt) ?? name?.replace(/\.[^/.]+$/, "") ?? "",
    caption: text(args.caption),
    after: text(args.after),
    before: text(args.before),
    appendTo: text(args.appendTo),
    stateHash: text(args.stateHash),
  });
}

/**
 * Run one doc-tool call. What the router calls: every tool but `insert_image`,
 * `draw_sketch` and `plot_graph` is the synchronous `runAgentDocTool`,
 * answered as a resolved promise.
 */
export async function executeAgentDocTool(
  target: AgentToolTarget | null,
  name: string,
  input: unknown,
  deps: AgentImageDeps = defaultDeps,
): Promise<AgentToolResult> {
  if (!target) return runAgentDocTool(target, name, input);
  if (name === "insert_image") return insertImageTool(target, input, deps);
  if (name === "draw_sketch") {
    return runDrawSketch(target, input, {
      store: deps.store,
      sanitizeSvg: deps.sanitizeSvg,
      renderer: deps.sketchRenderer ?? loadSketchRenderer,
    });
  }
  if (name === "plot_graph") {
    return runPlotGraph(target, input, {
      store: deps.store,
      sanitizeSvg: deps.sanitizeSvg,
      renderer: deps.graphRenderer ?? loadGraphRenderer,
    });
  }
  return runAgentDocTool(target, name, input);
}
