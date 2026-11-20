/**
 * A one-line description of an Excalidraw scene: what shapes, what they say,
 * what points at what (docs/plans/agent-block.md §4.2, phase 4).
 *
 * Two callers, one vocabulary. The sketch codec uses it to describe a stored
 * sketch whose node still carries its elements as `value` (the deprecated
 * field; most sketches keep their scene only inside the SVG, where it is
 * deflated and out of reach of a synchronous read). `draw_sketch` uses it on
 * the elements it just converted, to write the sketch's default alt text — so
 * a drawing an agent made reads back, to the next agent and to a screen
 * reader, as what it shows.
 *
 * Pure and import-free: it reads element JSON, never Excalidraw.
 */

type Element = Record<string, unknown>;

const NOUNS: Readonly<Record<string, [string, string]>> = {
  rectangle: ["box", "boxes"],
  ellipse: ["ellipse", "ellipses"],
  diamond: ["diamond", "diamonds"],
  arrow: ["arrow", "arrows"],
  line: ["line", "lines"],
  text: ["text", "texts"],
  image: ["picture", "pictures"],
  freedraw: ["freehand stroke", "freehand strokes"],
  frame: ["frame", "frames"],
};

const isElement = (value: unknown): value is Element =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const oneLine = (text: unknown): string =>
  typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";

const boundId = (binding: unknown): string =>
  isElement(binding) && typeof binding.elementId === "string"
    ? binding.elementId
    : "";

/** `3 boxes, 2 arrows · Client, Server, DB · Client → Server, Server → DB`. */
export function describeScene(elements: readonly unknown[], limit = 300): string {
  const live = elements.filter(isElement).filter((e) => e.isDeleted !== true);
  const labelOf = new Map<string, string>();
  const freeTexts: string[] = [];
  for (const element of live) {
    if (element.type !== "text") continue;
    // `text` is wrapped to the container's width; `originalText` is what was
    // typed, which is what a description should say.
    const text = oneLine(element.originalText) || oneLine(element.text);
    if (!text) continue;
    const container = typeof element.containerId === "string"
      ? element.containerId
      : "";
    if (container) labelOf.set(container, text);
    else freeTexts.push(text);
  }

  const counts = new Map<string, number>();
  const labels: string[] = [];
  const edges: string[] = [];
  for (const element of live) {
    const type = typeof element.type === "string" ? element.type : "";
    // A bound label is its container's text, not a text of its own.
    if (type === "text" && typeof element.containerId === "string" && element.containerId) {
      continue;
    }
    counts.set(type, (counts.get(type) ?? 0) + 1);
    const id = typeof element.id === "string" ? element.id : "";
    if (type === "arrow" || type === "line") {
      const from = labelOf.get(boundId(element.startBinding));
      const to = labelOf.get(boundId(element.endBinding));
      if (from || to) {
        const own = labelOf.get(id);
        edges.push(`${from ?? "?"} → ${to ?? "?"}${own ? ` (${own})` : ""}`);
      }
    } else if (type !== "text" && labelOf.has(id)) {
      labels.push(labelOf.get(id)!);
    }
  }

  const shape = [...counts]
    .map(([type, n]) => {
      const [one, many] = NOUNS[type] ?? [type || "element", `${type || "element"}s`];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(", ");
  const parts = [
    shape || "empty",
    [...labels, ...freeTexts].join(", "),
    edges.join(", "),
  ].filter(Boolean);
  const out = parts.join(" · ");
  return out.length > limit ? `${out.slice(0, limit - 1)}…` : out;
}
