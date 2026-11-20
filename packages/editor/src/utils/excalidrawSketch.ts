/**
 * The real `SketchRenderer` (docs/plans/archive/agent-block.md §4.2, phase 4):
 * Excalidraw and mermaid, in the renderer, where there is a DOM.
 *
 * Nothing imports this file statically. `agentSketch.ts` reaches it through a
 * dynamic `import()` the first time a sketch is drawn, and it reaches
 * Excalidraw and `@excalidraw/mermaid-to-excalidraw` the same way, so all
 * three are async chunks: a page that never draws a sketch — every page on
 * the VPS — never loads them.
 */
import type { SketchRenderer, SketchScene } from "./agentSketch";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
  }
}

type Excalidraw = typeof import("@excalidraw/excalidraw");
type Skeleton = Parameters<Excalidraw["convertToExcalidrawElements"]>[0];
type ExportInput = Parameters<Excalidraw["exportToSvg"]>[0];

export async function excalidrawRenderer(): Promise<SketchRenderer> {
  // Where Excalidraw fetches the fonts `exportToSvg` inlines: `public/fonts`,
  // as the Sketch dialog sets it. Unset, it would fetch them from a CDN.
  if (!window.EXCALIDRAW_ASSET_PATH) window.EXCALIDRAW_ASSET_PATH = "/";
  const excalidraw = await import("@excalidraw/excalidraw");

  const convert = (skeleton: readonly Record<string, unknown>[]) =>
    excalidraw.convertToExcalidrawElements(
      skeleton as unknown as Skeleton,
      { regenerateIds: true },
    ) as unknown as readonly Record<string, unknown>[];

  return {
    convert: async (skeleton) => convert(skeleton),

    async mermaid(definition) {
      const { parseMermaidToExcalidraw } = await import(
        "@excalidraw/mermaid-to-excalidraw"
      );
      // Called as Excalidraw's own text-to-diagram calls it: no config (a
      // smaller font lays boxes out too narrow for Excalifont, and labels
      // wrap mid-word), and once more with `"` as `'` if the first parse
      // fails, which is the quoting mistake mermaid is strictest about.
      let result: Awaited<ReturnType<typeof parseMermaidToExcalidraw>>;
      try {
        result = await parseMermaidToExcalidraw(definition);
      } catch (error) {
        if (!definition.includes('"')) throw error;
        // The first error is about what the agent wrote; report that one.
        result = await parseMermaidToExcalidraw(definition.replace(/"/g, "'"))
          .catch(() => Promise.reject(error));
      }
      const { elements, files } = result;
      return {
        elements: convert(elements as unknown as Record<string, unknown>[]),
        files: (files ?? {}) as SketchScene["files"],
      };
    },

    async exportSvg({ elements, files }) {
      const svg = await excalidraw.exportToSvg({
        appState: { exportEmbedScene: true },
        elements: elements as unknown as ExportInput["elements"],
        files: files as unknown as ExportInput["files"],
        exportPadding: 16,
      } as ExportInput);
      return {
        markup: new XMLSerializer().serializeToString(svg),
        width: Number(svg.getAttribute("width")),
        height: Number(svg.getAttribute("height")),
      };
    },
  };
}
