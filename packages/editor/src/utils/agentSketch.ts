/**
 * `draw_sketch`, the renderer's half (docs/plans/agent-block.md §2.6, §4.1,
 * §4.2, phase 4): a diagram the agent describes becomes an Excalidraw sketch
 * in the post — one the author opens and edits in the sketch editor exactly
 * like one they drew.
 *
 * Two inputs, both of which exist because the third — raw Excalidraw JSON —
 * is what §2.6 turned down (models get its coordinates and bindings wrong):
 *
 * - **`mermaid`**, converted by `@excalidraw/mermaid-to-excalidraw`, which lays
 *   the graph out itself. The usual case.
 * - **`shapes`**, a short list for when placement matters. Validated here,
 *   strictly and with errors that name the shape, then turned into Excalidraw
 *   *skeleton* elements. An arrow given `from`/`to` is bound to those shapes —
 *   it stays attached when the author drags them — and its geometry is
 *   computed here, edge to edge, because `convertToExcalidrawElements` records
 *   a binding but draws the arrow wherever its points say.
 *
 * Then the same pipeline as the Sketch dialog's Insert: `exportToSvg` with
 * `exportEmbedScene`, so the SVG carries the scene and re-opens as one; then
 * `blobSrcOrFallback`, the paste path, so the node stores `/api/blob/<hash>`
 * (or, for a local post, the data URI the dialog would have stored).
 *
 * **Excalidraw needs a DOM**, so the conversion and the export live behind
 * `SketchRenderer`, injected like the blob store: the headless specs stub it,
 * and the real one (`excalidrawSketch.ts`) is imported only when a sketch is
 * drawn — it and mermaid are large, and the VPS build never draws one.
 *
 * **Sanitized once, on the way in.** The SVG is generated from elements this
 * file built, and labels reach it as text nodes, so it is markup by
 * construction rather than by trust; it still goes through the DOMPurify pass
 * every stored sketch and graph is held to (`sanitizeSvgMarkup`), because a
 * data-URI sketch is inlined into the editor and a mermaid `click` directive
 * is a link. That pass drops comments, and the scene lives in comments — so
 * the payload is lifted out first, checked to be the base64 Excalidraw
 * writes, and put back after.
 */
import { z } from "zod";
import type { AgentToolTarget } from "../context/AgentHostContext";
import { describeScene } from "@/lib/content-bridge/sketchScene";
import {
  type AgentToolResult,
  insertSketchBlock,
  READ_ONLY,
} from "./agentDocTools";

/** The same cap as `POST /api/blob`. */
export const AGENT_SKETCH_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_SHAPES = 200;
export const MAX_LABEL = 500;
export const MAX_MERMAID = 20_000;
const MAX_COORD = 100_000;
const MAX_SIZE = 10_000;

/** Defaults a box gets when the shape names no size. */
const DEFAULT_W = 160;
const DEFAULT_H = 80;
/** Space between an arrow's ends and the shapes it joins. */
const ARROW_GAP = 8;

type Json = Record<string, unknown>;

export interface SketchScene {
  elements: readonly Json[];
  files: Json;
}

/** Excalidraw, behind the seam the specs stub. */
export interface SketchRenderer {
  /** `convertToExcalidrawElements` over skeleton elements. */
  convert(skeleton: readonly Json[]): Promise<readonly Json[]>;
  /** Mermaid → a converted scene. Throws on a definition mermaid rejects. */
  mermaid(definition: string): Promise<SketchScene>;
  /** `exportToSvg` with the scene embedded, serialized, plus its pixel size. */
  exportSvg(scene: SketchScene): Promise<{ markup: string; width: number; height: number }>;
}

export interface AgentSketchDeps {
  renderer: () => Promise<SketchRenderer>;
  store: (file: Blob, dataUri: string, documentId: string | null) => Promise<string>;
  sanitizeSvg: (markup: string) => string;
}

// ---------------------------------------------------------------------------
// Shapes → skeleton
// ---------------------------------------------------------------------------

const KINDS = ["rect", "ellipse", "diamond", "text", "arrow", "line"] as const;
type Kind = (typeof KINDS)[number];

const coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);

export const shapeSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    kind: z.enum(KINDS),
    x: coord.optional(),
    y: coord.optional(),
    w: coord.optional(),
    h: coord.optional(),
    label: z.string().max(MAX_LABEL).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export type Shape = z.infer<typeof shapeSchema>;

const EXCALIDRAW_TYPE: Readonly<Record<Kind, string>> = {
  rect: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
  text: "text",
  arrow: "arrow",
  line: "line",
};

const BOXES: ReadonlySet<Kind> = new Set(["rect", "ellipse", "diamond", "text"]);

interface Box {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Text has no size until Excalidraw measures it; this is close enough to aim at. */
const textBox = (label: string): { w: number; h: number } => {
  const lines = label.split("\n");
  return {
    w: Math.max(...lines.map((line) => line.length)) * 11 + 4,
    h: lines.length * 25,
  };
};

/**
 * Where a ray from the centre of `box` towards (dx, dy) leaves it, as a
 * multiple of (dx, dy).
 */
function exitScale(box: Box, dx: number, dy: number): number {
  const hw = box.w / 2;
  const hh = box.h / 2;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  switch (box.kind) {
    case "ellipse":
      return 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
    case "diamond":
      return 1 / (ax / hw + ay / hh);
    default:
      return Math.min(ax ? hw / ax : Infinity, ay ? hh / ay : Infinity);
  }
}

/** Start and end of a connector from `a`'s edge to `b`'s, `ARROW_GAP` clear. */
export function connect(a: Box, b: Box): { x: number; y: number; dx: number; dy: number } {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const leave = exitScale(a, dx, dy) * length + ARROW_GAP;
  const enter = exitScale(b, -dx, -dy) * length + ARROW_GAP;
  // Overlapping shapes leave no room between them: draw centre to centre.
  const fits = leave + enter < length;
  const start = fits ? leave : 0;
  const end = fits ? length - enter : length;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    x: round(ax + ux * start),
    y: round(ay + uy * start),
    dx: round(ux * (end - start)),
    dy: round(uy * (end - start)),
  };
}

export type ShapesResult =
  | { ok: true; skeleton: Json[] }
  | { ok: false; error: string };

/**
 * Validate a shape list and spell it as Excalidraw skeleton elements.
 *
 * Every refusal names the shape by index and kind — `shapes[3] (arrow)` — and
 * says what to change, because the model's next call is built from it.
 */
export function shapesToSkeleton(input: unknown): ShapesResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "shapes must be a non-empty list." };
  }
  if (input.length > MAX_SHAPES) {
    return {
      ok: false,
      error: `shapes has ${input.length} entries; a sketch takes at most ${MAX_SHAPES}. ` +
        "Split it into several sketches, or use mermaid.",
    };
  }

  const shapes: Shape[] = [];
  for (const [index, raw] of input.entries()) {
    const parsed = shapeSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const kind = raw && typeof raw === "object" && typeof (raw as Json).kind === "string"
        ? ` (${(raw as Json).kind as string})`
        : "";
      const field = issue?.path.join(".") || "";
      const message = issue?.code === "unrecognized_keys"
        ? `unknown field${issue.keys.length > 1 ? "s" : ""} ${issue.keys.join(", ")} — ` +
          "a shape takes id, kind, x, y, w, h, label, from, to"
        : `${field ? `${field}: ` : ""}${issue?.message ?? "unreadable"}`;
      return { ok: false, error: `shapes[${index}]${kind}: ${message}.` };
    }
    shapes.push(parsed.data);
  }

  const name = (index: number) => `shapes[${index}] (${shapes[index].kind})`;
  const seen = new Set<string>();
  for (const [index, shape] of shapes.entries()) {
    if (shape.id === undefined) continue;
    if (seen.has(shape.id)) {
      return { ok: false, error: `${name(index)}: id "${shape.id}" is used twice.` };
    }
    seen.add(shape.id);
  }

  // Pass one: the shapes connectors can point at, so a connector may name one
  // listed after it.
  const boxes = new Map<string, Box>();
  const boxAt: Box[] = [];
  for (const [index, shape] of shapes.entries()) {
    if (!BOXES.has(shape.kind)) continue;
    if (shape.x === undefined || shape.y === undefined) {
      return { ok: false, error: `${name(index)}: needs x and y (its top-left corner).` };
    }
    if (shape.from !== undefined || shape.to !== undefined) {
      return {
        ok: false,
        error: `${name(index)}: from and to are for arrows and lines.`,
      };
    }
    let w = shape.w ?? DEFAULT_W;
    let h = shape.h ?? DEFAULT_H;
    if (shape.kind === "text") {
      if (!shape.label?.trim()) {
        return { ok: false, error: `${name(index)}: a text needs a label — the text itself.` };
      }
      const measured = textBox(shape.label);
      w = shape.w ?? measured.w;
      h = shape.h ?? measured.h;
    }
    if (!(w > 0 && h > 0 && w <= MAX_SIZE && h <= MAX_SIZE)) {
      return {
        ok: false,
        error: `${name(index)}: w and h must be between 0 and ${MAX_SIZE} (got ${w}×${h}).`,
      };
    }
    boxAt[index] = { kind: shape.kind, x: shape.x, y: shape.y, w, h };
    if (shape.id !== undefined) boxes.set(shape.id, boxAt[index]);
  }

  const known = [...boxes.keys()].slice(0, 12).map((id) => `"${id}"`).join(", ");
  const skeleton: Json[] = [];
  for (const [index, shape] of shapes.entries()) {
    const type = EXCALIDRAW_TYPE[shape.kind];
    const id = shape.id === undefined ? {} : { id: shape.id };
    const label = shape.label?.trim() ? shape.label : undefined;

    if (BOXES.has(shape.kind)) {
      const { w, h } = boxAt[index];
      if (shape.kind === "text") {
        skeleton.push({ type, ...id, x: shape.x, y: shape.y, text: label });
      } else {
        skeleton.push({
          type,
          ...id,
          x: shape.x,
          y: shape.y,
          width: w,
          height: h,
          ...(label === undefined ? {} : { label: { text: label } }),
        });
      }
      continue;
    }

    // An arrow or a line.
    if (shape.kind === "line" && label !== undefined) {
      return {
        ok: false,
        error: `${name(index)}: a line has no label. Use an arrow, or a text beside it.`,
      };
    }
    const bound = shape.from !== undefined || shape.to !== undefined;
    let geometry: { x: number; y: number; dx: number; dy: number };
    if (bound) {
      if (shape.from === undefined || shape.to === undefined) {
        return {
          ok: false,
          error: `${name(index)}: give both from and to (shape ids), or neither and x, y, w, h.`,
        };
      }
      for (const end of [shape.from, shape.to]) {
        if (!boxes.has(end)) {
          const connector = shapes.some((s) => s.id === end && !BOXES.has(s.kind));
          return {
            ok: false,
            error: `${name(index)}: "${end}" is not ` +
              (connector
                ? "a shape an arrow can attach to — only rect, ellipse, diamond and text"
                : `the id of any shape in this sketch${known ? ` (ids: ${known})` : ""}`) +
              ".",
          };
        }
      }
      if (shape.from === shape.to) {
        return { ok: false, error: `${name(index)}: from and to are the same shape.` };
      }
      if (shape.x !== undefined || shape.y !== undefined) {
        return {
          ok: false,
          error: `${name(index)}: with from and to the ends are worked out from ` +
            "the shapes — leave x, y, w and h out.",
        };
      }
      const a = boxes.get(shape.from)!;
      const b = boxes.get(shape.to)!;
      if (a.x + a.w / 2 === b.x + b.w / 2 && a.y + a.h / 2 === b.y + b.h / 2) {
        return {
          ok: false,
          error: `${name(index)}: "${shape.from}" and "${shape.to}" have the same ` +
            "centre, so there is no direction to draw it in. Move one of them.",
        };
      }
      geometry = connect(a, b);
    } else {
      if (
        shape.x === undefined || shape.y === undefined ||
        shape.w === undefined || shape.h === undefined
      ) {
        return {
          ok: false,
          error: `${name(index)}: needs from and to (shape ids), or x, y (the start) ` +
            "and w, h (the offset to the end).",
        };
      }
      if (shape.w === 0 && shape.h === 0) {
        return { ok: false, error: `${name(index)}: w and h are both 0, so it has no length.` };
      }
      geometry = { x: shape.x, y: shape.y, dx: shape.w, dy: shape.h };
    }
    skeleton.push({
      type,
      ...id,
      x: geometry.x,
      y: geometry.y,
      // `points` explicitly: `convertToExcalidrawElements` reads `width || 100`,
      // which makes a vertical arrow (width 0) a diagonal one.
      points: [[0, 0], [geometry.dx, geometry.dy]],
      ...(label === undefined ? {} : { label: { text: label } }),
      ...(bound && shape.kind === "arrow"
        ? { start: { id: shape.from }, end: { id: shape.to } }
        : {}),
    });
  }
  return { ok: true, skeleton };
}

// ---------------------------------------------------------------------------
// The SVG
// ---------------------------------------------------------------------------

/**
 * Exactly the metadata Excalidraw writes (`encodeSvgBase64Payload`): the
 * markers its loader looks for, and a base64 body — which is what makes it
 * safe to put back verbatim after the sanitizer has dropped every comment.
 */
const SCENE_PAYLOAD =
  /<!-- payload-type:application\/vnd\.excalidraw\+json -->\s*<!-- payload-version:(\d{1,3}) -->\s*<!-- payload-start -->\s*([A-Za-z0-9+/=]+)\s*<!-- payload-end -->/;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Sanitize an exported sketch, keeping its scene. Null when there is no scene
 * to keep — without one the result would be a picture the sketch editor
 * cannot open, which is the thing §2.6 declined — or nothing survives.
 */
export function sanitizeSketchSvg(
  markup: string,
  sanitize: (markup: string) => string,
): string | null {
  const payload = markup.match(SCENE_PAYLOAD);
  if (!payload) return null;
  let clean = sanitize(markup).trim();
  if (!/^<svg[\s>/]/i.test(clean)) return null;
  if (!/^<svg[^>]*\sxmlns\s*=/i.test(clean)) {
    clean = clean.replace(/^<svg/i, `<svg xmlns="${SVG_NS}"`);
  }
  // The HTML serializer spells U+00A0 `&nbsp;`, which is not XML: an `<img>`
  // given it renders nothing.
  clean = clean.replaceAll("&nbsp;", "&#160;");
  clean = clean.replace(/<metadata\b[^>]*\/>|<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, "");
  const metadata = "<!-- svg-source:excalidraw --><metadata>" +
    "<!-- payload-type:application/vnd.excalidraw+json -->" +
    `<!-- payload-version:${payload[1]} -->` +
    `<!-- payload-start -->${payload[2]}<!-- payload-end --></metadata>`;
  return clean.replace(/^<svg\b[^>]*>/i, (open) => `${open}${metadata}`);
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

const sketchInput = z.object({
  shapes: z.unknown().optional(),
  mermaid: z.string().optional(),
  alt: z.string().max(MAX_LABEL * 2).optional(),
  caption: z.string().optional(),
  id: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  appendTo: z.string().optional(),
  stateHash: z.string().optional(),
});

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim()
    .slice(0, 600);

/** The Excalidraw scene for the input, or the refusal to send the model. */
async function sceneFor(
  input: z.infer<typeof sketchInput>,
  renderer: () => Promise<SketchRenderer>,
): Promise<{ ok: true; scene: SketchScene } | { ok: false; error: string }> {
  if (input.mermaid !== undefined) {
    const definition = input.mermaid.trim();
    if (!definition) return { ok: false, error: "mermaid is empty." };
    if (definition.length > MAX_MERMAID) {
      return { ok: false, error: `mermaid is over ${MAX_MERMAID} characters; split the diagram.` };
    }
    // A `click` line is a link (dropped below anyway), and it also knocks its
    // node out of the layout: mermaid wraps it in an `<a>` the converter
    // does not look inside, and the box lands at the origin.
    const unlinked = definition
      .split("\n")
      .filter((line) => !/^\s*click\s/i.test(line))
      .join("\n");
    try {
      return { ok: true, scene: await (await renderer()).mermaid(unlinked) };
    } catch (error) {
      return {
        ok: false,
        error: `Mermaid could not read that definition: ${errorText(error)}. ` +
          "Fix the syntax (a flowchart starts `flowchart LR` or `flowchart TD`), " +
          "or draw it with shapes instead.",
      };
    }
  }
  const shapes = shapesToSkeleton(input.shapes);
  if (!shapes.ok) return shapes;
  const elements = await (await renderer()).convert(shapes.skeleton);
  return { ok: true, scene: { elements, files: {} } };
}

/** `draw_sketch`: render, sanitize, store, then insert (or redraw in place). */
export async function runDrawSketch(
  target: AgentToolTarget,
  raw: unknown,
  deps: AgentSketchDeps,
): Promise<AgentToolResult> {
  if (!target.editor.isEditable()) return READ_ONLY;
  const parsed = sketchInput.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid draw_sketch call at ${issue?.path.join(".") || "(root)"}: ${
        issue?.message ?? "unreadable input"
      }`,
    };
  }
  const input = parsed.data;
  if ((input.shapes === undefined) === (input.mermaid === undefined)) {
    return {
      ok: false,
      error: "draw_sketch takes exactly one of shapes (a list) or mermaid (a definition).",
    };
  }
  if (input.id !== undefined && (input.after ?? input.before ?? input.appendTo) !== undefined) {
    return {
      ok: false,
      error: "id redraws a sketch where it stands, so it takes no after, before or appendTo.",
    };
  }

  let resolved: Awaited<ReturnType<typeof sceneFor>>;
  try {
    resolved = await sceneFor(input, deps.renderer);
  } catch (error) {
    return { ok: false, error: `The sketch could not be built: ${errorText(error)}` };
  }
  if (!resolved.ok) return resolved;
  // A link on an element is an `<a>` in the export, and nothing an agent's
  // diagram needs — a mermaid `click` directive is the way one arrives.
  const elements = resolved.scene.elements.map((element) =>
    element.link ? { ...element, link: null } : element
  );
  if (!elements.some((element) => element.isDeleted !== true)) {
    return { ok: false, error: "That drew nothing — the diagram has no elements." };
  }

  let exported: Awaited<ReturnType<SketchRenderer["exportSvg"]>>;
  try {
    exported = await (await deps.renderer()).exportSvg({ elements, files: resolved.scene.files });
  } catch (error) {
    return { ok: false, error: `The sketch could not be exported: ${errorText(error)}` };
  }
  const markup = sanitizeSketchSvg(exported.markup, deps.sanitizeSvg);
  if (!markup) {
    return { ok: false, error: "The exported sketch lost its scene in sanitizing, so it was not inserted." };
  }
  const bytes = new TextEncoder().encode(markup);
  if (bytes.length > AGENT_SKETCH_MAX_BYTES) {
    return { ok: false, error: "That sketch is over the 10 MB cap; split it into several." };
  }
  // The Sketch dialog's spelling, so a fallback src is the one it would store.
  const dataUri = `data:image/svg+xml,${encodeURIComponent(markup)}`;
  const blob = new Blob([bytes], { type: "image/svg+xml" });
  const src = await deps.store(blob, dataUri, target.documentId ?? null);
  // Rendering and uploading took a while; the post may be closed or locked now.
  if (!target.editor.isEditable()) return READ_ONLY;

  const size = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
  const result = insertSketchBlock(target, {
    src,
    alt: input.alt?.trim() || `Diagram: ${describeScene(elements)}`,
    caption: input.caption,
    width: size(exported.width),
    height: size(exported.height),
    id: input.id,
    after: input.after,
    before: input.before,
    appendTo: input.appendTo,
    stateHash: input.stateHash,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    text: `Drew ${describeScene(elements)} (${size(exported.width)}×${
      size(exported.height)
    } px). The author can open it in the sketch editor. ${result.text}`,
  };
}

/** The real renderer, loaded the first time a sketch is drawn. */
export const loadSketchRenderer = (): Promise<SketchRenderer> =>
  import("./excalidrawSketch").then((module) => module.excalidrawRenderer());
