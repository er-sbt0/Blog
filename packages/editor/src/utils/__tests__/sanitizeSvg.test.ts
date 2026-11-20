// @vitest-environment jsdom
/**
 * The browser half of the SVG sanitizer.
 *
 * `exportDOM` runs in two environments, and the node specs
 * (`packages/editor/src/nodes/__tests__/svgExport.test.ts`) drive the server
 * one, where `global.window` is a JSDOM instance installed *after* the module
 * graph loaded. This file is the other one: a real `window` that already exists
 * at import time, which is what copy/paste and client-side export get. Both
 * have to clean the same markup, and the failure mode that motivates covering
 * them separately is a sanitizer that is bound to whichever window happened to
 * be there when the module was first evaluated.
 */
import { renderSvgDataUri, sanitizeSvgMarkup } from "../sanitizeSvg";
import { sanitizeSketchSvg } from "../agentSketch";

const dataUri = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

describe("sanitizeSvgMarkup, in a browser", () => {
  it("removes script, event handlers and javascript: URLs", () => {
    const clean = sanitizeSvgMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>` +
        `<image href="x" onerror="alert(2)"/><svg onload="alert(3)"></svg>` +
        `<a xlink:href="javascript:alert(4)"><text>go</text></a>` +
        `<rect width="1" height="1"/></svg>`,
    );

    expect(clean).not.toMatch(/\son[a-z]+\s*=/i);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("<rect");
  });

  it("keeps the SVG vocabulary a sketch and a graph are made of", () => {
    const clean = sanitizeSvgMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20">` +
        `<defs><clipPath id="c"><rect width="1" height="1"/></clipPath>` +
        `<symbol id="s"><image href="data:image/png;base64,iVBORw0KGgo=" width="100%" height="100%"/></symbol>` +
        `<filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs>` +
        `<g clip-path="url(#c)" filter="url(#f)" opacity="0.5">` +
        `<path d="M0 0 L1 1" stroke="#000" fill="none" stroke-linecap="round"/>` +
        `<use href="#s" width="4" height="4"/><text x="1" y="2">t</text>` +
        `<ellipse cx="1" cy="2" rx="3" ry="4"/><polygon points="0,0 1,1 2,0"/>` +
        `</g></svg>`,
    );

    expect(clean).toContain('viewBox="0 0 10 20"');
    expect(clean).toContain("<clipPath");
    expect(clean).toContain("<symbol");
    expect(clean).toContain("feGaussianBlur");
    expect(clean).toContain('href="#s"');
    expect(clean).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(clean).toContain("<ellipse");
    expect(clean).toContain("<polygon");
    expect(clean).toContain('d="M0 0 L1 1"');
  });

  it("allows `use` only into the same document", () => {
    const external = sanitizeSvgMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg">` +
        `<use href="https://evil.example/a.svg#x"/>` +
        `<use xlink:href="data:image/svg+xml;base64,PHN2Zy8+"/>` +
        `<use href="#local"/></svg>`,
    );

    expect(external).not.toContain("evil.example");
    expect(external).not.toContain("data:image/svg+xml");
    expect(external).toContain('href="#local"');
  });
});

describe("renderSvgDataUri", () => {
  it("strips the scene payload and every <style>", () => {
    const host = document.createElement("figure");
    const svg = renderSvgDataUri(
      host,
      dataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="9">` +
          `<!-- payload-start --><!-- {"elements":[]} --><!-- payload-end -->` +
          `<style>.a{fill:red}</style><rect width="1" height="1"/></svg>`,
      ),
    );

    expect(svg).not.toBeNull();
    expect(host.innerHTML).not.toContain("payload-start");
    expect(host.innerHTML).not.toContain("<style");
    expect(host.innerHTML).toContain("<rect");
    expect(svg?.getAttribute("width")).toBe("8");
  });

  it("answers null instead of throwing on a src it cannot decode", () => {
    const host = document.createElement("figure");

    // A truncated percent-escape: `decodeURIComponent` throws on this, and the
    // previous code let that escape into the caller — on the server that is the
    // whole `/view` render, not one picture.
    expect(renderSvgDataUri(host, "data:image/svg+xml,%E0%A4%A")).toBeNull();
    // No comma at all, and a body the sanitizer empties.
    expect(renderSvgDataUri(host, "data:image/svg+xml")).toBeNull();
    expect(renderSvgDataUri(host, dataUri("<script>alert(1)</script>")))
      .toBeNull();
  });
});

/** `draw_sketch`'s export, as Excalidraw shapes it (agent-block.md phase 4). */
const PAYLOAD = "eyJ0eXBlIjoiZXhjYWxpZHJhdyJ9";
const sceneComments = () =>
  "<!-- svg-source:excalidraw --><metadata>" +
  "<!-- payload-type:application/vnd.excalidraw+json -->" +
  "<!-- payload-version:2 --><!-- payload-start -->" +
  `${PAYLOAD}<!-- payload-end --></metadata>`;
const exported = (inner = '<rect x="1" y="1" width="10" height="10"/>') =>
  `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" ` +
  `width="200" height="100">${sceneComments()}<defs/>${inner}</svg>`;

describe("sanitizeSketchSvg, with the real DOMPurify pass", () => {
  it("strips script, handlers and javascript: links, and keeps the scene", () => {
    const clean = sanitizeSketchSvg(
      exported(
        '<script>alert(1)</script><rect onload="alert(2)" width="5" height="5"/>' +
          '<a href="javascript:alert(3)"><text x="1" y="1">go &amp; see now</text></a>',
      ),
      sanitizeSvgMarkup,
    )!;
    expect(clean).not.toContain("<script");
    expect(clean).not.toMatch(/\son[a-z]+\s*=/i);
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("go &amp; see&#160;now");
    // Back where Excalidraw's loader looks for it, byte for byte.
    expect(clean.startsWith("<svg")).toBe(true);
    expect(clean).toContain(sceneComments());
    expect(clean.match(/<metadata/g)).toHaveLength(1);
    // And the whole thing is still XML an `<img>` can render.
    const parsed = new DOMParser().parseFromString(clean, "image/svg+xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(parsed.documentElement.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
  });

  it("refuses an export with no scene, or a scene that is not base64", () => {
    expect(sanitizeSketchSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', sanitizeSvgMarkup))
      .toBeNull();
    const smuggled = exported().replace(PAYLOAD, '--><script>alert(1)</script><!--');
    expect(sanitizeSketchSvg(smuggled, sanitizeSvgMarkup)).toBeNull();
  });
});

