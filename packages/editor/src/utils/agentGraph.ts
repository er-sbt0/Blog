/**
 * `plot_graph`, the renderer's half (docs/plans/archive/agent-block.md §4.1, §4.2,
 * phase 5): GeoGebra commands the agent writes become a graph in the post —
 * one the author opens and edits in the Graph dialog exactly like one they
 * made there.
 *
 * The input is what an author would type into GeoGebra's input bar, one
 * command per entry (`f(x)=sin(x)`, `A=(1,2)`, `a=Slider(0,5,0.1)`,
 * `ZoomIn(-7,-2,7,2)`). They run in order in a **hidden applet**
 * (`geogebraGraph.ts`), and then the dialog's own Insert path takes over:
 * `getBase64` for `value` — the `.ggb` the dialog reopens — and `exportSVG`
 * for the picture; then `blobSrcOrFallback`, the paste path, so the node
 * stores `/api/blob/<hash>` (or, for a local post, the data URI the dialog
 * would have stored).
 *
 * **A failing command is the tool's error, named by its index**, the way a
 * bad shape is in `draw_sketch`: `commands[2] ("Foo(1,2)"): Unknown command :
 * Foo`. GeoGebra's `evalCommand` answers `false` both for a command it
 * rejected and for one that ran and simply defines nothing (`SetValue`,
 * `ZoomIn`), so the boolean is not the signal. The error dialog GeoGebra
 * raises is — the renderer reads it out of the hidden applet's frame and
 * removes it (§12).
 *
 * **GeoGebra needs a DOM and 22 MB of applet**, so it lives behind
 * `GraphRenderer`, injected like the blob store: the headless specs stub it,
 * and the real one is imported only when a graph is plotted. The applet is
 * loaded once per window and reused, reset to an empty construction before
 * every call.
 *
 * **Sanitized once, on the way in**, through the DOMPurify pass every stored
 * sketch and graph is held to. GeoGebra's SVG carries no scene — the scene is
 * `value` — so there is nothing to lift out first, unlike a sketch's.
 */
import { z } from "zod";
import type { AgentToolTarget } from "../context/AgentHostContext";
import { standaloneSvg } from "./sanitizeSvg";
import { type AgentToolResult, insertGraphBlock, READ_ONLY, unavailable } from "./agentDocTools";

/** The same cap as `POST /api/blob`. */
export const AGENT_GRAPH_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_COMMANDS = 100;
export const MAX_COMMAND = 2_000;
/** The applet's size when the call names none: a post column, landscape. */
export const DEFAULT_GRAPH_SIZE = { width: 720, height: 480 } as const;
const MIN_SIDE = 200;
const MAX_SIDE = 1_600;
const MAX_ALT = 300;

/** One finished plot, as the hidden applet hands it back. */
export interface GraphPlot {
  /** `exportSVG`, serialized. */
  svg: string;
  /** `getBase64`: the `.ggb` the Graph dialog reopens. */
  ggb: string;
  /** `getXML`, for the checks below; never stored or returned. */
  xml: string;
  /** `getAllObjectNames`, for the answer the model reads. */
  objects: string[];
}

export type GraphPlotResult =
  | { ok: true; plot: GraphPlot }
  | { ok: false; index: number; error: string };

/** GeoGebra, behind the seam the specs stub. */
export interface GraphRenderer {
  /**
   * Reset the applet, size it, and run `commands` in order. Stops at the
   * first command GeoGebra rejects and answers with its index and message.
   */
  plot(
    commands: readonly string[],
    size: { width: number; height: number },
  ): Promise<GraphPlotResult>;
}

export interface AgentGraphDeps {
  renderer: () => Promise<GraphRenderer>;
  store: (file: Blob, dataUri: string, documentId: string | null) => Promise<string>;
  sanitizeSvg: (markup: string) => string;
}

const graphInput = z.object({
  commands: z.array(z.string()),
  alt: z.string().max(MAX_ALT * 2).optional(),
  caption: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  id: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  appendTo: z.string().optional(),
  stateHash: z.string().optional(),
});

const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim()
    .slice(0, 600);

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** `commands[i] ("…")`, the way every refusal names the command it is about. */
const named = (commands: readonly string[], index: number): string =>
  `commands[${index}] (${JSON.stringify(clip(commands[index] ?? "", 80))})`;

/**
 * GeoGebra scripting. A command that attaches a script to an object makes a
 * `.ggb` that *does* something when the author opens it in the Graph dialog —
 * not what a plot is for, and not something an agent's graph needs. The
 * applet's own XML is checked as well (`SCRIPTED_XML`); this is the early,
 * nameable refusal.
 */
const SCRIPT_COMMAND =
  /\b(SetClickScript|SetUpdateScript|RunClickScript|RunUpdateScript|Execute|SetPerspective)\s*[([]/i;
const SCRIPTED_XML = /<(javascript|ggbscript)\b/i;

/** The validated command list, or the refusal to send the model. */
export function checkCommands(
  raw: readonly string[],
): { ok: true; commands: string[] } | { ok: false; error: string } {
  if (raw.length === 0) {
    return { ok: false, error: "commands is empty — give at least one GeoGebra command, e.g. \"f(x)=sin(x)\"." };
  }
  if (raw.length > MAX_COMMANDS) {
    return { ok: false, error: `That is ${raw.length} commands; the most one graph takes is ${MAX_COMMANDS}.` };
  }
  const commands = raw.map((command) => command.trim());
  for (const [index, command] of commands.entries()) {
    if (!command) {
      return { ok: false, error: `commands[${index}] is empty. Remove it or give a command.` };
    }
    if (/[\r\n]/.test(command)) {
      return {
        ok: false,
        error: `${named(commands, index)} holds a line break. Give one command per entry ` +
          "— GeoGebra's input bar takes one line at a time.",
      };
    }
    if (command.length > MAX_COMMAND) {
      return { ok: false, error: `commands[${index}] is over ${MAX_COMMAND} characters.` };
    }
    if (SCRIPT_COMMAND.test(command)) {
      return {
        ok: false,
        error: `${named(commands, index)} scripts the applet or changes its layout, ` +
          "which plot_graph does not do. Define objects and set the view " +
          "(ZoomIn(xmin, ymin, xmax, ymax)) instead.",
      };
    }
  }
  return { ok: true, commands };
}

const side = (value: number | undefined, fallback: number): number =>
  value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(value)));

/** The default alt text: what was plotted, which is also what reads back. */
export const graphAlt = (commands: readonly string[]): string =>
  clip(`Graph: ${commands.join("; ")}`, MAX_ALT);

/** The label a command defines by name — `f` of `f(x)=…`, `A` of `A=(1,2)` — or null. */
const DEFINED_LABEL = /^([A-Za-z][A-Za-z0-9']*(?:_\{?[A-Za-z0-9]+\}?)?)\s*(?:\([^()=]*\))?\s*(?::=|=)(?!=)/;

/**
 * Objects the commands named that the finished construction no longer has.
 *
 * GeoGebra redefines on a name clash, silently, and deletes what depended on
 * the old object: `Polygon(A,B,C)` names its sides `a`, `b`, `c`, so a later
 * `c=Circle(A,B,C)` replaces a side and the triangle vanishes with it. The
 * real-SDK run hit exactly that (§12). Not a refusal — GeoGebra also renames
 * on its own (`z(x)=…` becomes `z_{1}` in the suite), and the plot may be
 * what was wanted — but the model is told, so it can replot by `id`.
 */
export function missingLabels(commands: readonly string[], objects: readonly string[]): string[] {
  const present = new Set(objects);
  const named = commands
    .map((command) => DEFINED_LABEL.exec(command)?.[1])
    .filter((label): label is string => label !== undefined);
  return [...new Set(named)].filter((label) => !present.has(label));
}

/** `plot_graph`: plot, sanitize, store, then insert (or replot in place). */
export async function runPlotGraph(
  target: AgentToolTarget,
  raw: unknown,
  deps: AgentGraphDeps,
): Promise<AgentToolResult> {
  if (!target.editor.isEditable()) return READ_ONLY;
  const parsed = graphInput.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Invalid plot_graph call at ${issue?.path.join(".") || "(root)"}: ${
        issue?.message ?? "unreadable input"
      }`,
    };
  }
  const input = parsed.data;
  if (input.id !== undefined && (input.after ?? input.before ?? input.appendTo) !== undefined) {
    return {
      ok: false,
      error: "id replots a graph where it stands, so it takes no after, before or appendTo.",
    };
  }
  const checked = checkCommands(input.commands);
  if (!checked.ok) return checked;
  const { commands } = checked;
  const size = {
    width: side(input.width, DEFAULT_GRAPH_SIZE.width),
    height: side(input.height, DEFAULT_GRAPH_SIZE.height),
  };

  let result: GraphPlotResult;
  try {
    result = await (await deps.renderer()).plot(commands, size);
  } catch (error) {
    return { ok: false, error: `GeoGebra could not plot that: ${errorText(error)}` };
  }
  if (!result.ok) {
    return {
      ok: false,
      error: `${named(commands, result.index)}: ${result.error || "GeoGebra rejected it"}. ` +
        "Nothing was inserted. Fix that command (GeoGebra's input-bar syntax, " +
        "English command names) and call again with the whole list.",
    };
  }
  const { plot } = result;
  if (SCRIPTED_XML.test(plot.xml)) {
    return { ok: false, error: "That construction carries a script, which plot_graph does not insert." };
  }
  if (!plot.ggb) {
    return { ok: false, error: "GeoGebra returned no construction to save." };
  }
  const markup = standaloneSvg(deps.sanitizeSvg(plot.svg));
  if (!markup) {
    return { ok: false, error: "The exported graph had nothing left once sanitized, so it was not inserted." };
  }
  const bytes = new TextEncoder().encode(markup);
  if (bytes.length + plot.ggb.length > AGENT_GRAPH_MAX_BYTES) {
    return { ok: false, error: "That graph is over the 10 MB cap; plot fewer objects." };
  }
  const svgSize = (name: "width" | "height", fallback: number): number => {
    const value = Number(markup.match(new RegExp(`^<svg[^>]*\\s${name}="([\\d.]+)"`, "i"))?.[1]);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  };
  const width = svgSize("width", size.width);
  const height = svgSize("height", size.height);
  // Not worth uploading for a block that is already gone.
  const gone = unavailable(target);
  if (gone) return gone;
  // The Graph dialog's spelling, so a fallback src is the one it would store.
  const dataUri = `data:image/svg+xml,${encodeURIComponent(markup)}`;
  const blob = new Blob([bytes], { type: "image/svg+xml" });
  const src = await deps.store(blob, dataUri, target.documentId ?? null);
  // Plotting and uploading took a while: the post may be closed or locked now,
  // or the block deleted, which interrupted the turn (§6 q3).
  const late = unavailable(target);
  if (late) return late;

  const inserted = insertGraphBlock(target, {
    src,
    value: plot.ggb,
    alt: input.alt?.trim() || graphAlt(commands),
    caption: input.caption,
    width,
    height,
    id: input.id,
    after: input.after,
    before: input.before,
    appendTo: input.appendTo,
    stateHash: input.stateHash,
  });
  if (!inserted.ok) return inserted;
  const objects = plot.objects.length > 0
    ? ` (objects: ${clip(plot.objects.join(", "), 200)})`
    : "";
  const missing = missingLabels(commands, plot.objects);
  const warning = missing.length === 0 ? "" :
    ` Check it: ${missing.join(", ")} ${missing.length === 1 ? "was" : "were"} defined ` +
    "but the finished construction no longer has " +
    `${missing.length === 1 ? "it" : "them"} — usually a later command reused a ` +
    "name GeoGebra had given something else (Polygon(A,B,C) names its sides " +
    "a, b, c) and replaced it, deleting what depended on it. Replot with id " +
    "and different names if that was not intended.";
  return {
    ok: true,
    text: `Plotted ${commands.length} command${commands.length === 1 ? "" : "s"}${objects}, ` +
      `${width}×${height} px. The author can open it in the Graph dialog.${warning} ${inserted.text}`,
  };
}

/** The real renderer, loaded the first time a graph is plotted. */
export const loadGraphRenderer = (): Promise<GraphRenderer> =>
  import("./geogebraGraph").then((module) => module.geogebraRenderer());
