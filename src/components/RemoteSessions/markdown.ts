/**
 * A tokenizer for the Markdown subset assistant turns use — paragraphs,
 * headings, fenced code, lists, blockquotes, and inline code, bold, italic and
 * links (docs/plans/remote-claude.md §4.7).
 *
 * It produces data, never markup: the renderer (`TranscriptMarkdown.tsx`) maps
 * every token to a React element whose strings are text children, which is the
 * whole of §2.4's rule. A link keeps its raw target here; deciding whether it
 * may become an `href` is `safeExternalHref`'s job at render time, so this file
 * stays import-free and the decision has one home.
 *
 * Modelled on `CopilotPanel/MarkdownText.tsx`, deliberately not shared with it:
 * that component renders as it parses, and a transcript needs the parse on its
 * own to be pinned by a spec.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "link"; text: string; target: string };

export type Block =
  | { t: "paragraph"; lines: Inline[][] }
  | { t: "heading"; level: number; c: Inline[] }
  | { t: "code"; lang: string; text: string }
  | { t: "list"; ordered: boolean; items: Inline[][] }
  | { t: "quote"; c: Inline[] };

const INLINE: { t: "code" | "bold" | "italic" | "link"; re: RegExp }[] = [
  { t: "code", re: /`([^`]+)`/ },
  { t: "bold", re: /\*\*([^*]+)\*\*/ },
  { t: "italic", re: /\*([^*\s][^*]*)\*|\b_([^_]+)_\b/ },
  { t: "link", re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
];

/** Recursion is bounded by the input shrinking; this bounds pathological nesting. */
const MAX_DEPTH = 8;

export function tokenizeInline(text: string, depth = 0): Inline[] {
  if (!text) return [];
  if (depth > MAX_DEPTH) return [{ t: "text", v: text }];
  let best: { t: (typeof INLINE)[number]["t"]; m: RegExpExecArray } | null = null;
  for (const { t, re } of INLINE) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.m.index)) best = { t, m };
  }
  if (!best) return [{ t: "text", v: text }];

  const { t, m } = best;
  const out: Inline[] = [];
  if (m.index > 0) out.push({ t: "text", v: text.slice(0, m.index) });
  switch (t) {
    case "code":
      out.push({ t: "code", v: m[1] });
      break;
    case "bold":
      out.push({ t: "bold", c: tokenizeInline(m[1], depth + 1) });
      break;
    case "italic":
      out.push({ t: "italic", c: tokenizeInline(m[1] ?? m[2], depth + 1) });
      break;
    case "link":
      out.push({ t: "link", text: m[1], target: m[2] });
      break;
  }
  out.push(...tokenizeInline(text.slice(m.index + m[0].length), depth));
  return out;
}

const FENCE_RE = /^\s*```\s*([\w+-]*)/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

const startsBlock = (line: string) =>
  FENCE_RE.test(line) || HEADING_RE.test(line) || BULLET_RE.test(line) ||
  NUMBERED_RE.test(line) || QUOTE_RE.test(line);

export function tokenizeMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++; // the closing fence, or past the end when it is missing
      blocks.push({ t: "code", lang: fence[1] ?? "", text: code.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ t: "heading", level: heading[1].length, c: tokenizeInline(heading[2]) });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(QUOTE_RE.exec(lines[i++])![1]);
      }
      blocks.push({ t: "quote", c: tokenizeInline(quote.join(" ")) });
      continue;
    }

    if (BULLET_RE.test(line) || NUMBERED_RE.test(line)) {
      const ordered = NUMBERED_RE.test(line);
      const re = ordered ? NUMBERED_RE : BULLET_RE;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (!m) break;
        items.push(tokenizeInline(m[1]));
        i++;
      }
      blocks.push({ t: "list", ordered, items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: Inline[][] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      para.push(tokenizeInline(lines[i++]));
    }
    blocks.push({ t: "paragraph", lines: para });
  }
  return blocks;
}
