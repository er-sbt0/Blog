// @vitest-environment jsdom
/**
 * docs/plans/remote-claude.md §2.4 and §7 phase 3: **no transcript byte
 * reaches the DOM as markup.** The window that renders a transcript can also
 * type into a running Claude Code, so a script here is input to an agent with a
 * shell — not ordinary XSS.
 *
 * Feeds the real entry components a hand-written transcript carrying the usual
 * payloads — `<img onerror>` in a prompt, assistant text and a tool result, a
 * `javascript:` Markdown link, `<script>` inside an HTML file's Write content,
 * the same inside an Edit diff, a thinking block and a slash command — every
 * row expanded, and asserts on the rendered DOM: no `img`/`script`/`iframe`, no
 * `on*` attribute anywhere, no anchor that is not http(s). It also asserts the
 * payloads are *there*, as text — a renderer that dropped them would pass the
 * first half and be wrong.
 *
 * Phase 4 (§4.9) adds two more ways transcript bytes reach the DOM — a search
 * hit's snippet in the sidebar, and find-in-session's highlight splitting text
 * around `<mark>` — and the last block holds both to the same rule.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RemoteEntryRow } from "@/lib/claudeSessions/types";
import { TranscriptEntry } from "../TranscriptEntry";
import { buildRows } from "../transcriptModel";
import { HighlightContext } from "../Highlight";
import { SearchHitGroup } from "../SessionSearch";
import { groupHits } from "../searchModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMG = "<img src=x onerror=alert(1)>";
const SCRIPT = "<script>alert(document.cookie)</script>";

let idx = 0;
const entry = (kind: RemoteEntryRow["kind"], body: RemoteEntryRow["body"], tool: string | null = null): RemoteEntryRow => ({
  idx: idx++,
  kind,
  uuid: null,
  parentUuid: null,
  at: null,
  tool,
  body,
});

const transcript: RemoteEntryRow[] = [
  entry("prompt", { text: `look at this ${IMG}\n[image]` }),
  entry("assistant", {
    text: [
      `Here: ${IMG}`,
      "",
      "A [bad link](javascript:alert(1)) and a [data one](data:text/html,<script>x</script>) and [ok](https://example.com/a).",
      "",
      "```html",
      SCRIPT,
      "```",
      "- **bold <b onmouseover=alert(1)>x</b>**",
    ].join("\n"),
  }),
  entry("thinking", { text: `<svg onload=alert(1)></svg>` }),
  entry("meta", { label: "system", text: `<iframe srcdoc="${SCRIPT}"></iframe>` }),
  entry("command", { name: "/review", args: IMG }),
  entry("tool_use", {
    id: "w1",
    name: "Write",
    input: { file_path: "/tmp/index.html", content: `<!doctype html><html><body>${SCRIPT}${IMG}</body></html>` },
  }, "Write"),
  entry("tool_result", { toolUseId: "w1", content: `wrote ${IMG}`, isError: false }, "Write"),
  entry("tool_use", {
    id: "e1",
    name: "Edit",
    input: { file_path: "/tmp/a.html", old_string: "<p>old</p>", new_string: SCRIPT },
  }, "Edit"),
  entry("tool_result", { toolUseId: "e1", content: IMG, isError: true }, "Edit"),
  entry("tool_use", { id: "b1", name: "Bash", input: { command: `echo '${IMG}'` } }, "Bash"),
  entry("tool_result", { toolUseId: "b1", content: `${IMG}\n${SCRIPT}`, isError: false }, "Bash"),
  entry("tool_result", { toolUseId: "orphan", content: SCRIPT, isError: false, agentId: "nope" }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const rows = buildRows(transcript, { showThinking: true, showMeta: true });
  act(() => {
    root.render(
      <>
        {rows.map((row) => (
          <TranscriptEntry key={row.entry.idx} row={row} expanded onToggle={() => {}} subagents={[]} />
        ))}
      </>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("renders no transcript markup as elements", () => {
  expect(container.querySelectorAll("img, script, iframe, object, embed, b, p[onmouseover]")).toHaveLength(0);
  // lucide's own icons are <svg>; none may carry an attribute from the payload.
  for (const svg of container.querySelectorAll("svg")) {
    expect(svg.getAttribute("onload")).toBeNull();
  }
});

it("puts no event-handler attribute on any element", () => {
  const offenders = [...container.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes].filter((a) => a.name.toLowerCase().startsWith("on")).map((a) => `${el.tagName}[${a.name}]`)
  );
  expect(offenders).toEqual([]);
});

it("lets only http(s) links become anchors", () => {
  const anchors = [...container.querySelectorAll("a")];
  expect(anchors.length).toBeGreaterThan(0);
  for (const a of anchors) {
    expect(new URL(a.getAttribute("href")!).protocol).toMatch(/^https?:$/);
    expect(a.getAttribute("rel")).toContain("noopener");
  }
  expect(anchors.map((a) => a.textContent)).toEqual(["ok"]);
  // The refused links are still readable, as their text.
  expect(container.textContent).toContain("bad link");
  expect(container.textContent).toContain("data one");
});

it("shows every payload as text rather than dropping it", () => {
  const text = container.textContent ?? "";
  expect(text).toContain(IMG);
  expect(text).toContain(SCRIPT);
  expect(text).toContain("<svg onload=alert(1)></svg>");
  expect(text).toContain("<b onmouseover=alert(1)>x</b>");
  expect(text).toContain("/tmp/index.html");
});

describe("search snippets and highlights (§4.9)", () => {
  let box: HTMLDivElement;
  let r: Root;

  const render = (node: React.ReactNode) => {
    box = document.createElement("div");
    document.body.append(box);
    r = createRoot(box);
    act(() => r.render(node));
  };

  afterEach(() => {
    act(() => r.unmount());
    box.remove();
  });

  const onAttributes = (root: Element) =>
    [...root.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].filter((a) => a.name.toLowerCase().startsWith("on")).map((a) => `${el.tagName}[${a.name}]`)
    );

  it("renders a hit whose snippet is markup as text, with the match marked", () => {
    const snippet = `before ${IMG} after`;
    const start = snippet.indexOf("onerror");
    const [group] = groupHits([{
      sessionId: "s1",
      hostId: "h1",
      title: `title ${IMG}`,
      projectDir: "-p",
      cwd: `/tmp/${IMG}`,
      isSubagent: false,
      endedAt: null,
      idx: 7,
      kind: "tool_result",
      tool: "Bash",
      snippet,
      matchStart: start,
      matchLength: "onerror".length,
    }]);
    render(<ul><SearchHitGroup group={group} q={IMG} /></ul>);

    expect(box.querySelectorAll("img, script, iframe, object, embed")).toHaveLength(0);
    expect(onAttributes(box)).toEqual([]);
    expect(box.textContent).toContain(snippet);
    expect(box.textContent).toContain(`title ${IMG}`);
    const marks = [...box.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["onerror"]);
    // The link is the app's own route, with the query encoded rather than spliced.
    const href = box.querySelector("a")!.getAttribute("href")!;
    const url = new URL(href, "http://app");
    expect(url.pathname).toBe("/sessions/s1");
    expect(url.searchParams.get("q")).toBe(IMG);
  });

  it("highlights a find query inside transcript rows without creating markup", () => {
    const rows = buildRows(transcript, { showThinking: true, showMeta: true });
    render(
      <HighlightContext.Provider value="<img">
        {rows.map((row) => (
          <TranscriptEntry key={row.entry.idx} row={row} expanded onToggle={() => {}} subagents={[]} />
        ))}
      </HighlightContext.Provider>,
    );
    expect(box.querySelectorAll("img, script, iframe, object, embed, b")).toHaveLength(0);
    expect(onAttributes(box)).toEqual([]);
    const marks = [...box.querySelectorAll("mark")];
    expect(marks.length).toBeGreaterThan(3);
    for (const m of marks) {
      expect(m.textContent).toBe("<img");
      expect(m.children).toHaveLength(0);
    }
    expect(box.textContent).toContain(IMG);
  });
});
