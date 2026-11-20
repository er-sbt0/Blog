// @vitest-environment jsdom
/**
 * An `/agent` block's full transcript (docs/plans/archive/agent-block.md
 * phase 6): the session's own `.jsonl`, as the desktop shell hands it over,
 * through `localTranscript` → the source `TranscriptView` reads → the real
 * `TranscriptEntry`. Hand-written, never a real transcript.
 *
 * The rule is `TranscriptEntry.test.tsx`'s, and it holds here for the same
 * reason: a transcript is whatever the session read and wrote — a web page, a
 * file in the folder, a tool's output — rendered in a window that can type
 * into a running Claude Code. No byte of it may become markup.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TranscriptEntry } from "@/components/RemoteSessions/TranscriptEntry";
import { buildRows } from "@/components/RemoteSessions/transcriptModel";
import { localTranscript, localTranscriptSource } from "../localTranscript";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IMG = "<img src=x onerror=alert(1)>";
const SCRIPT = "<script>alert(document.cookie)</script>";
const SESSION = "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10";

const at = (s: number) => new Date(Date.UTC(2026, 10, 20, 12, 0, s)).toISOString();
const lines = [
  { type: "user", cwd: "/w/post", timestamp: at(0), uuid: "u1", message: { content: `draw it ${IMG}` } },
  {
    type: "assistant",
    timestamp: at(1),
    message: {
      id: "m1",
      content: [
        { type: "text", text: `Sure ${SCRIPT} [x](javascript:alert(1))` },
        { type: "tool_use", id: "t1", name: "mcp__doc__apply_ops", input: { ops: [{ text: IMG }] } },
      ],
    },
  },
  {
    type: "user",
    timestamp: at(2),
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: `Applied ${SCRIPT}` }] },
  },
  { type: "ai-title", aiTitle: `Title ${IMG}` },
];
const text = `${lines.map((l) => JSON.stringify(l)).join("\n")}\nnot json\n`;

describe("localTranscript", () => {
  it("builds the header and rows TranscriptView reads, from the file alone", async () => {
    const transcript = localTranscript({ sessionId: SESSION, text, size: text.length, truncated: false });
    expect(transcript.unparseable).toBe(1);
    expect(transcript.detail).toMatchObject({
      id: SESSION,
      title: `Title ${IMG}`,
      cwd: "/w/post",
      userMsgs: 1,
      assistantMsgs: 1,
      toolCalls: 1,
      size: text.length,
      subagents: [],
      parent: null,
    });
    const source = localTranscriptSource(transcript);
    expect(source.local).toBe(true);
    await expect(source.detail()).resolves.toBe(transcript.detail);
    const page = await source.entries(1, 1);
    expect(page.total).toBe(transcript.entries.length);
    expect(page.entries.map((e) => e.idx)).toEqual([1]);
    expect((await source.entries(50, 10)).entries).toEqual([]);
  });

  it("says nothing of a folder it was not told", () => {
    const bare = `${JSON.stringify({ type: "user", message: { content: "hi" } })}\n`;
    expect(localTranscript({ sessionId: SESSION, text: bare, size: 1, truncated: false }).detail.cwd)
      .toBeNull();
  });
});

describe("rendering a local transcript", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    const transcript = localTranscript({ sessionId: SESSION, text, size: text.length, truncated: false });
    const page = await localTranscriptSource(transcript).entries(0, 500);
    const rows = buildRows(page.entries, { showThinking: true, showMeta: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <>
          {rows.map((row) => (
            <TranscriptEntry key={row.entry.idx} row={row} expanded onToggle={() => {}} subagents={[]} />
          ))}
        </>,
      )
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("makes no transcript byte markup, and still shows every one as text", () => {
    expect(container.querySelectorAll("img, script, iframe, object, embed")).toHaveLength(0);
    const handlers = [...container.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].filter((a) => a.name.toLowerCase().startsWith("on")).map((a) => a.name)
    );
    expect(handlers).toEqual([]);
    for (const a of container.querySelectorAll("a")) {
      expect(new URL(a.getAttribute("href")!, "http://app").protocol).toMatch(/^https?:$/);
    }
    const shown = container.textContent ?? "";
    expect(shown).toContain(IMG);
    expect(shown).toContain(SCRIPT);
  });
});
