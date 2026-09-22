import DOMPurify, {
  type Config,
  type DOMPurify as Purifier,
  type WindowLike,
} from "dompurify";

/**
 * The one sanitizer for sketch and graph SVG, and the reason it is one file.
 *
 * `SketchNode.exportDOM` and `GraphNode.exportDOM` decode an author-controlled
 * `data:image/svg+xml,…` src and hand the result to `innerHTML`. That output is
 * cached as the stored HTML of a revision and injected on the **public**
 * `/view/[id]` and `/embed/[id]` pages with `dangerouslySetInnerHTML`. Both used
 * to strip `<style>` and nothing else, so `<image onerror=…>`, `<svg onload=…>`
 * and `<a xlink:href="javascript:…">` all survived into every reader's session
 * on this app's own origin — registration is open, so publishing one post was
 * the whole attack.
 *
 * Two exportDOM bodies that are near-identical would be two places to forget a
 * security control, hence one helper rather than a copy in each class.
 *
 * **This runs in two environments.** In the browser (copy/paste and client-side
 * export) `window` is the real one. On the server,
 * `utils/generateServerHtml.ts` points `global.window` / `global.document` at a
 * JSDOM instance for the duration of the call. DOMPurify's default export is
 * bound to whatever `window` existed *at import time*, which on the server is
 * none — `isSupported` is then `false` and `sanitize` returns its input
 * **unchanged**, which is to say it silently leaves the hole open. So nothing
 * here touches the default instance: `DOMPurify(root)` mints one against the
 * window that is live at call time, cached per window in a `WeakMap` so a
 * request's JSDOM is collected with it.
 *
 * Failure is closed. No usable window, or an instance that reports
 * `isSupported: false`, yields an empty string rather than the raw markup.
 */

/** Excalidraw's scene payload, stripped before the picture is published. */
const PAYLOAD_COMMENT = /<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/;

const XLINK_NS = "http://www.w3.org/1999/xlink";

/** A same-document reference, `#id`. Anything else is an external fetch. */
const LOCAL_REFERENCE = /^#[^\s<>"'()]+$/;

/**
 * `svg` + `svgFilters`, plus `use` — which DOMPurify's svg profile deliberately
 * excludes, and which this content genuinely needs: Excalidraw exports an
 * embedded picture as a `<symbol>` in `<defs>` plus a `<use href="#image-…">`,
 * so dropping the tag loses every image inside a sketch. The tag is put back
 * and the dangerous half of it — referencing a *foreign* document, which is
 * what made it unsafe — is taken away by the hook below, leaving only
 * same-document `#id` references into markup this pass has already cleaned.
 */
const SVG_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ["use"],
};

const purifiers = new WeakMap<WindowLike, Purifier>();

function purifierFor(win: WindowLike): Purifier | null {
  const cached = purifiers.get(win);
  if (cached) return cached;
  const instance = DOMPurify(win);
  // A window that cannot carry DOMPurify sanitizes nothing; say so by
  // returning null rather than caching an instance that passes markup through.
  if (!instance.isSupported) return null;
  instance.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName?.toLowerCase() !== "use") return;
    const href = node.getAttribute("href") ??
      node.getAttributeNS(XLINK_NS, "href");
    if (!href || !LOCAL_REFERENCE.test(href)) node.remove();
  });
  purifiers.set(win, instance);
  return instance;
}

function currentPurifier(): Purifier | null {
  const win = (globalThis as { window?: unknown }).window as
    | WindowLike
    | undefined;
  if (!win || typeof win.DOMParser !== "function") return null;
  return purifierFor(win);
}

/**
 * An allowlist pass over SVG markup. Returns "" when no sanitizer is available,
 * which is the safe direction for this to fail.
 */
export function sanitizeSvgMarkup(markup: string): string {
  const purify = currentPurifier();
  if (!purify) return "";
  return purify.sanitize(markup, SVG_CONFIG);
}

/**
 * Decode a `data:image/svg+xml,…` src, drop the scene payload, sanitize, and
 * put the result inside `element`.
 *
 * Returns the `<svg>` root for the caller's width/height/viewBox work, or
 * `null` when there is nothing renderable — a malformed percent-escape, a
 * base64 body, or markup the sanitizer emptied. Callers must handle `null`:
 * the previous `element.firstElementChild!` threw on exactly those inputs, and
 * a throw here fails the whole `/view` render.
 */
export function renderSvgDataUri(
  element: HTMLElement,
  src: string,
): Element | null {
  const encoded = src.split(",")[1];
  if (!encoded) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  element.innerHTML = sanitizeSvgMarkup(decoded.replace(PAYLOAD_COMMENT, ""));
  const svg = element.firstElementChild;
  if (!svg) return null;
  svg.querySelectorAll("style").forEach((style) => {
    style.remove();
  });
  return svg;
}
