# Posts — Design Notes

A refresh of the Posts list. The original surfaced three rows of plain titles
plus a Series section where every series row carried a permanent trash icon
on the right. This redesign tightens the toolbar, moves destructive actions
out of the resting state, and adds the interactions you'd expect from a list
that's meant to be both browsed and managed.

Files of interest:
- `Posts.html` — the focused full-bleed prototype (this is the design).
- `Posts refinement.html` — three-up exploration (A, B, C) for comparison.
- `variant-a.jsx` — the component that powers the chosen direction (A).
- `common.jsx` — sample data + icon set shared across explorations.

---

## Problems the redesign solves

1. **Permanent trash icon on every series row.** Resting state shouldn't
   advertise the most destructive action. The trash should appear only when
   the user is signaling intent (hover, selection, menu).
2. **No multi-select.** The list will hold hundreds of posts and series of
   100+ entries — there must be a way to delete, tag, or move several at
   once without N round-trips.
3. **A 132-post series breaks inline expansion.** Dumping that many rows
   into the page is hostile to both performance and orientation.
4. **Toolbar bloat.** Five icons crowded the top-right (grid/list, new
   post, new series, fullscreen, sidebar) with overlapping intents.
5. **No metadata.** Just titles. Users asked for date-updated and tags as
   minimum useful signal.

## Design system

Built on the existing visual language from the screenshot — same blue and
purple section keys, same neutral type stack — but applied more
systematically. No new accent colors, no decorative iconography.

| Token            | Value                           | Used for                  |
| ---------------- | ------------------------------- | ------------------------- |
| `ink`            | `#1a1a1a`                       | Primary text, primary btn |
| `mute`           | `#6a6a6a`                       | Metadata, inactive icons  |
| `rule`           | `#ececec`                       | Dividers, borders         |
| `hover`          | `#f6f6f5`                       | Row hover                 |
| `postKey`        | `oklch(0.62 0.14 245)` (blue)   | Posts section header      |
| `seriesKey`      | `oklch(0.55 0.18 305)` (purple) | Series section header     |
| `accent`         | same as postKey                 | Selection, drop targets   |

Type stack: `"Inter", system-ui, -apple-system, sans-serif`. Section labels
are 11px / 700 / +1.2 letter-spacing, all-caps. Row titles are 14px / 600.
Metadata is 11.5–12px / 500 in `mute`. Tabular numerals on dates.

Tag styling is tweakable — the default is `filled` (soft tinted pill), but
the design supports `outline` and `dot` (color swatch + monochrome label).
The dot style is the lowest-noise option and works well at scale.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ☰ 📖 Posts                          🔍  + New  ⊞ ☰   ┃       │  Header
├──────────────────────────────────────────────────────────────┤
│  POSTS · 5 ─────────────────────────────────────────         │
│   ☐ Untitled                                    2h     ⋯     │
│   ☐ README                              [meta]  Yesterday    │
│   ☐ Toolchain Upgrade            [infra][notes] 3d           │
│   …                                                          │
│                                                              │
│  SERIES · 3 ────────────────────────────────────────         │
│   ☐ ▼ LLVM Data Layout              [llvm][viz] 1d    ⋯     │
│         series · 4 posts · updated 1d                        │
│   │  LLVM Data Access Visualization — Summary  1d            │
│   │  LLVM Memory Layout                        3d            │
│   │  LLVM Runtime Data Layout Profiler         1w            │
│   │  D3                                        2w            │
│   ☐ ▸ ChatGPT Summarize               [ai]     12h           │
│         series · 132 posts · updated 12h                     │
│   ☐ ▸ Incremental                  [build]     Apr 30        │
└──────────────────────────────────────────────────────────────┘
                  ┌─────────────────────────────┐
                  │ 2 selected  Move Tag Delete │  Bulk bar (only when ≥1)
                  └─────────────────────────────┘
```

- Header is sticky, single row.
- Sections render as `[label, count] ───────────`. The thin rule continues
  the original treatment but is now slightly tighter and includes a count.
- Rows are 36–44px tall (compact / comfortable). Padding scales with
  density.

## Header — what changed and why

| Old (5 buttons)         | New (4 buttons)       | Rationale                                              |
| ----------------------- | --------------------- | ------------------------------------------------------ |
| Grid / list toggle      | Kept (grouped)        | Useful, but grouped so it reads as one control         |
| `+` (new post)          | `+ New` (split)       | One affordance with a dropdown for Post / Series       |
| `+ folder` (new series) | Folded into `+ New`   | Two new-buttons fought for the same mental slot        |
| Fullscreen              | **Removed**           | Rare action; reachable from the OS / app shell         |
| Sidebar toggle          | Kept                  | Frequent                                               |
| —                       | 🔍 Search             | Added — at hundreds of posts you need it visible       |

## Row anatomy

```
[gutter] [title]                              [tags]    [date]    [actions]
   ↑                                                                  ↑
checkbox / drag handle                                       hover-revealed
(hidden until hover or selected)                              "···" menu
```

- **Gutter** (22px) is empty at rest. On hover it shows a drag handle
  outside the row (left) and an empty checkbox inside. On selection the
  checkbox stays filled.
- **Title** is the click target for opening the post. Double-click to
  rename inline.
- **Tags** are inline next to the title, max ~3 before they ellipsize.
- **Date** sits right-aligned. It fades out on hover so the actions don't
  feel cluttered against it.
- **Actions** are a single `⋯` button that opens Rename / Move to series /
  Edit tags / —— / Delete. No always-on icons.

## Series anatomy

A series is just a row with a chevron and a metadata sub-line
(`series · N posts · updated X`). Behavior:

- **≤ 20 posts** → inline expand on chevron click.
- **> 20 posts** → expand shows the 3 most-recent + a "View all 132 posts →"
  drill-in target. We never inline a 132-row list.
- Series row itself supports the same `⋯` menu (Rename / Add post / Delete
  series) and is a drop target — drag any post onto it and it lights up
  with `+ Add to {Series}`.

## Interactions

| Action                  | Trigger                                  |
| ----------------------- | ---------------------------------------- |
| Open post               | Click row                                |
| Rename                  | Double-click title, or `⋯` → Rename      |
| Delete one              | `⋯` → Delete  (or select + ⌫)            |
| Multi-select            | Hover-checkbox, or ⌘/Shift-click rows    |
| Bulk delete / move / tag| Floating bar at the bottom               |
| Clear selection         | Esc, or "Clear" in the bulk bar          |
| Reorder posts           | Drag row by handle, drop on another row  |
| Move post into series   | Drag row onto a series row               |
| Expand / collapse series| Click the row (anywhere)                 |

Drop targets show a 2px accent line between rows for reorder, and a
soft-fill accent ring around the whole series row for "drop into series."
Series auto-expand on drop so the user sees where the post landed.

## Where the trash icon went

It's gone from the resting state entirely. The destructive action lives
in three places, all of which require the user to express intent first:

1. **Row `⋯` menu** — appears on hover; Delete is the last item, separated
   by a rule, and rendered in danger color.
2. **Bulk action bar** — appears only when ≥1 row is selected; Delete is
   the rightmost action.
3. **⌫ key** — operates on the current selection.

This is the same pattern the rest of a productivity surface should use,
and it's the single biggest visual win in the redesign — every row is
quieter at rest.

## Empty / scale states (recommended)

Not in the prototype yet, but the system supports them:

- **No posts** — friendly empty in the Posts band with a single `+ New post`
  call-to-action; the Series band still renders if any exist.
- **Search no-results** — show the empty pattern with the query echoed back
  and a "Clear search" affordance.
- **Series drill-in** — replace the list view with a focused single-series
  page. Same row anatomy, plus a back arrow and the series title at the top.

## Tweaks

The prototype exposes two:

- **Density** — `comfortable` (default) vs `compact`. Compact tightens row
  padding by ~4px without changing type sizes. Useful for power users with
  hundreds of items.
- **Tag style** — `filled` (default) / `outline` / `dot`. `dot` is the
  lowest-visual-weight option and is best when tag counts are dense.

Both are wired to the persistence protocol so they survive reload.

## What's intentionally not in this prototype

- **Sort / filter UI.** The right place for these is inline above the list
  once the user opens search — not in the resting toolbar.
- **Per-series sort / arrangement.** Same reason; revisit in the drill-in.
- **Bulk move target picker.** The bulk bar shows the action, not the
  picker; a popover series picker is the obvious next step.
- **Drag handle for series.** Series themselves should be drag-reorderable
  too — left as a follow-up because it interacts with sort-by-updated.

## Open questions

1. Should ⌘-click on a series checkbox select *all of its posts* or just
   the series row? (Currently: just the row.)
2. Where does "Archive" live — is it a tag, a state, or a separate bin? The
   menu has space for it but I held off until we know.
3. Date column: is `"3d"` the right format, or do we want absolute on
   anything older than a week? Easy to swap.

