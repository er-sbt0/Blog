// Shared icons + sample data for the three Posts list variations.

const Icon = {
  Hamburger: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
    </svg>
  ),
  Book: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v13H5.5A1.5 1.5 0 0 1 4 14.5v-10Z" />
      <path d="M4 14.5A1.5 1.5 0 0 1 5.5 13H16" />
    </svg>
  ),
  Grid: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
  ),
  List: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M7 5h10M7 10h10M7 15h10" strokeLinecap="round" />
      <circle cx="4" cy="5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  Plus: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  ),
  Search: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <circle cx="9" cy="9" r="5" />
      <path d="m13 13 3.5 3.5" strokeLinecap="round" />
    </svg>
  ),
  Sidebar: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M12 4v12" />
    </svg>
  ),
  Trash: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M4 6h12M8 6V4.5A.5.5 0 0 1 8.5 4h3a.5.5 0 0 1 .5.5V6M6 6l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Chevron: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="m7 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  More: (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <circle cx="5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15" cy="10" r="1.4" />
    </svg>
  ),
  Drag: (props) => (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <circle cx="8" cy="5" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="12" cy="10" r="1" />
      <circle cx="8" cy="15" r="1" />
      <circle cx="12" cy="15" r="1" />
    </svg>
  ),
  Pencil: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="m13 4 3 3-9 9H4v-3l9-9Z" strokeLinejoin="round" />
    </svg>
  ),
  Folder: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 2h6A1.5 1.5 0 0 1 17 8.5v6A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-8Z" />
    </svg>
  ),
  Check: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m5 10 3.5 3.5L15 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowDown: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M10 4v12m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Tag: (props) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}>
      <path d="M4 4h6l6 6-6 6-6-6V4Z" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
};

// Sample data — title, when updated, tags. Mirrors the screenshot then expands.
const POSTS = [
  { id: "p1", title: "Untitled", updated: "2h", tags: [] },
  { id: "p2", title: "README", updated: "Yesterday", tags: ["meta"] },
  { id: "p3", title: "Toolchain Upgrade", updated: "3d", tags: ["infra", "notes"] },
  { id: "p4", title: "Why static dispatch wins", updated: "Apr 18", tags: ["draft", "perf"] },
  { id: "p5", title: "Notes on cache-line packing", updated: "Apr 11", tags: ["notes"] },
];

const SERIES = [
  {
    id: "s1",
    title: "LLVM Data Layout",
    updated: "1d",
    tags: ["llvm", "viz"],
    posts: [
      { id: "s1a", title: "LLVM Data Access Visualization — Summary", updated: "1d", tags: ["summary"] },
      { id: "s1b", title: "LLVM Memory Layout", updated: "3d", tags: [] },
      { id: "s1c", title: "LLVM Runtime Data Layout Profiler", updated: "1w", tags: ["tooling"] },
      { id: "s1d", title: "D3", updated: "2w", tags: ["viz"] },
    ],
  },
  {
    id: "s2",
    title: "ChatGPT Summarize",
    updated: "12h",
    tags: ["ai", "ongoing"],
    posts: Array.from({ length: 132 }, (_, i) => ({
      id: `s2-${i}`,
      title: [
        "Daily digest — May 24",
        "Daily digest — May 23",
        "Long-form: tokenization tradeoffs",
        "Repro: streaming generation",
        "Bench notes",
      ][i % 5] + (i > 4 ? ` (${i})` : ""),
      updated: i < 3 ? `${i + 1}d` : `${Math.floor(i / 3)}w`,
      tags: ["ai"],
    })),
  },
  {
    id: "s3",
    title: "Incremental",
    updated: "Apr 30",
    tags: ["build", "research"],
    posts: Array.from({ length: 12 }, (_, i) => ({
      id: `s3-${i}`,
      title: ["Incremental: pitch", "Salsa internals", "Adapton vs Salsa", "Demand-driven rebuilds"][i % 4] + ` (${i + 1})`,
      updated: `${i + 1}w`,
      tags: ["build"],
    })),
  },
];

// Tag color (deterministic from name) — same scheme across variations so users
// can compare apples to apples.
const TAG_HUE = {
  meta: 220, infra: 32, notes: 280, draft: 8, perf: 160, llvm: 250,
  viz: 200, summary: 190, tooling: 120, ai: 320, ongoing: 340, build: 60, research: 100,
};
function tagColor(name, alpha = 1) {
  const h = TAG_HUE[name] ?? 240;
  return `oklch(0.65 0.08 ${h} / ${alpha})`;
}
function tagBg(name) {
  const h = TAG_HUE[name] ?? 240;
  return `oklch(0.96 0.02 ${h})`;
}

Object.assign(window, { Icon, POSTS, SERIES, tagColor, tagBg });
