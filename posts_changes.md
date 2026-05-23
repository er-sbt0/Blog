# Posts View — Redesign Plan

> **For the implementing agent:** This document is self-contained. Read it fully
> before touching any file. The reference design lives in `blog_posts.html` at
> the repo root — open it in a browser to see the intended result interactively.

---

## 1. Goal

Replace the current card-grid posts page with a compact, flat-list layout that
matches the design in `blog_posts.html`. The new layout is:

- A **flat list of post rows** (status dot · title · date) replacing the MUI
  card grid.
- **Collapsible section headers** separating "Posts" (standalone) from "Series".
- **Expandable series accordion cards** (chevron → numbered sub-rows) replacing
  the `SeriesGroupCard` grid tiles.
- A **minimal browse topbar** (48 px) with hamburger + "Posts" title + icon
  buttons: Search · New Post (⌘N) · Focus · Toggle rail.
- **Progressive disclosure** for all other actions: New Series and Sort live
  behind hover-revealed buttons on section headers; per-row `···` appears on
  row hover.

The right rail and left sidebar are **out of scope** for this task. Focus only
on the main content area and the browse topbar.

---

## 2. Visual Reference (ASCII)

```
┌───────────────────────────────────────────────────────────────┐
│ ☰  Posts                               🔍  +  ⤢  ▣           │  ← browse topbar (48px)
├───────────────────────────────────────────────────────────────┤
│                                                               │
│   POSTS  3  ──────────────────────────────  Recent ▾  ···    │  ← section header (hover)
│                                                               │
│   ·  Untitled                               just now         │  ← draft dot (amber)
│      README                                 Apr 12           │  ← published (no dot)
│▌     Toolchain Upgrade                      May 18           │  ← selected (accent bar)
│                                                               │
│   SERIES  4  ─────────────────────  Expand all  ···          │  ← section header (hover)
│                                                               │
│   ▼  LLVM Data Layout   4 posts             May 21           │  ← expanded scard
│   │  D1  Runtime Data Layout Profiler       Apr 02           │
│   │  D2  Memory Layout                      Apr 18           │
│   │▌ D3  Data Access Visualization          May 06           │  ← selected srow
│   │  D4  D3                           ●     May 21           │  ← draft dot in srow
│                                                               │
│   ▷  ChatGPT Summarize  132 posts           2h ago           │  ← collapsed scard
│   ▷  Incremental        5 posts             May 19           │
│   ▷  Notes              2 posts             Apr 30           │
│                                                               │
└───────────────────────────────────────────────────────────────┘

Legend:
  ▌  3 px accent-color left bar  (selected row)
  ·  6 px amber circle           (draft status)
  ●  5 px amber circle           (draft in series sub-row)
  ▷  chevron pointing right      (collapsed series)
  ▼  chevron pointing down       (expanded series)
  │  1 px vertical rule          (series indent connector)
```

---

## 3. Current Architecture (what exists today)

### Entry point
- **`src/components/posts/PostsView.tsx`** — the main component rendered at
  `/posts` and `/posts/[id]`. Currently:
  - Has a `ViewToggle` to switch between "grid" and "compact" views.
  - Renders action buttons (New Post, New Series) inline above the content.
  - Renders `PostsGrid` (MUI Grid2 with `DocumentCard` tiles) for standalone posts.
  - Renders `SeriesSection` (another MUI Grid2) for series.
  - Has a `SectionDivider` local helper.

### Existing post-list components (partial reuse)
| File | What it does | Fate |
|------|-------------|------|
| `src/components/posts/components/PostCompactListItem.tsx` | Compact list row (MUI ListItem). Has time-edit mode complexity. | **Replace** with new `PostRow` |
| `src/components/posts/components/PostsCompactListView.tsx` | Wrapper list for compact items, handles time-edit and series groups | **Replace** with new `PostListSection` |
| `src/components/posts/components/SeriesSection.tsx` | Renders series as a MUI Grid of `SeriesGroupCard` tiles | **Replace** with new `SeriesListSection` |
| `src/components/posts/components/SeriesGroupCard.tsx` | Card tile for a series group | **Keep** (used elsewhere), but not used in the new list view |
| `src/components/posts/components/SeriesSearchAndControls.tsx` | Search + time-edit controls bar | **Keep** for series detail page; remove from all-posts view |

### DocumentCard (keep, not replaced)
The `DocumentCard` / `PostCard` component and its `CardBase` exist for other
views. Do not delete them. The new list view creates new, simpler row components
instead.

### DocumentGrid (keep, not replaced)
`src/components/DocumentGrid/DocumentGrid.tsx` is used in other contexts
(e.g. document browser). Do not modify it. The posts page will stop using it.

### Action drawers (keep as-is, wire up differently)
- `src/components/drawers/CreatePostDrawer.tsx`
- `src/components/drawers/CreateSeriesDrawer.tsx`
- `src/components/posts/AddPostsDialog.tsx`

These stay unchanged. The new topbar and section headers will open them via
callbacks passed down from `PostsView`.

### Selectors (no changes needed)
- `src/store/selectors/postsSelectors.ts` — `selectStandalonePosts` already
  returns exactly what the Posts section needs.
- `state.series` from Redux — already what the Series section needs.

---

## 4. New Components to Create

Create all new files inside `src/components/posts/components/`. Do **not**
create a new top-level component directory.

### 4.1 `BrowseTopbar.tsx`
A 48 px bar sitting above the scroll area.

```
Props:
  title: string                       // "Posts"
  onToggleSidebar?: () => void        // hamburger click
  onSearch?: () => void               // ⌘K
  onNewPost?: () => void              // ⌘N — opens CreatePostDrawer
  onFocus?: () => void                // hides sidebars
  onToggleRail?: () => void           // right rail toggle
```

Layout (flex row, space-between):
- **Left:** 30×30 hamburger icon-button + bold 13.5 px "Posts" label
- **Right:** 4 × 30×30 icon-buttons — Search · Plus (New Post) · Maximize
  (Focus) · Panel (Toggle rail)

Styling (translate from `blog_posts.html`):
```
height: 48px
border-bottom: 1px solid divider
background: background.paper
padding: 0 16px 0 12px
```

Icon buttons: transparent border, `border-radius: 7px`, hover → `action.hover`
background.

### 4.2 `BrowseSectionHeader.tsx`
The uppercase section label with count and trailing rule.

```
Props:
  label: string                       // "POSTS" | "SERIES"
  count: number
  collapsed?: boolean
  onToggleCollapse?: () => void
  // Hover-revealed action slots
  sortControl?: React.ReactNode       // "Recent ▾" dropdown (Posts only)
  expandAllControl?: React.ReactNode  // "Expand all" button (Series only)
  moreControl?: React.ReactNode       // "···" overflow menu
```

Layout (flex row, align-center, gap 12px):
```
[LABEL]  [count]  [────────────── rule]  [sort?]  [expand-all?]  [···?]
```

Styling:
- `LABEL`: `font-size: 11px`, `font-weight: 600`, `letter-spacing: 0.12em`,
  `text-transform: uppercase`, color `text.secondary`; on hover → `text.primary`
- `count`: `font-size: 11px`, color `text.disabled`, tabular-nums
- rule: `flex: 1`, `height: 1px`, `bgcolor: divider`
- Hover-revealed controls: `opacity: 0` → `1` on section header hover,
  `font-size: 13px`, color `text.secondary`

When `collapsed` is true, render `count` as `"3 · hidden"` and hide the body
(handled by the parent section via the `collapsed` prop, not this component).

### 4.3 `PostRow.tsx`
A single post list row.

```
Props:
  post: UserDocument
  selected?: boolean
  onClick?: (post: UserDocument) => void
```

Layout — CSS grid `14px 1fr auto` with gap 14px, padding `11px 12px`,
border-bottom `1px solid divider` (first row gets border-top too):

```
[dot]  [title…………………………………]  [date]
```

- **dot column (14px):** 6 px amber circle if draft; nothing (transparent) if
  published. Draft = `document.status === DocumentStatus.ACTIVE` and no cloud
  head, or derive from `document.status`. Match logic in `usePostState`.
- **title:** `font-size: 14.5px`, `font-weight: 500`, `letter-spacing: -0.005em`,
  overflow ellipsis. Italic + `color: text.disabled` if name is empty/untitled.
  When `selected` → `color: primary.main`.
- **date:** `font-size: 12.5px`, `color: text.disabled`, tabular-nums. Format:
  `"just now"` / `"Apr 12"` / `"May 18"` — use relative if < 24 h, else `MMM D`.

Selected state: `background: action.hover`, plus a `::before` pseudo-equivalent
(`Box` with `position: absolute`, `left: -2px`, `width: 3px`, `height: 18px`,
`bgcolor: primary.main`, `border-radius: 2px`, vertically centered).

Hover state: `background: action.hover` (same as selected background, only
the left bar distinguishes).

On row hover, show a `···` icon-button at the far right (in addition to the
date). Use `opacity: 0` → `1` on parent hover. Wire it to `PostActionMenu`.

### 4.4 `SeriesAccordionCard.tsx`
An expandable series accordion row.

```
Props:
  series: Series
  expanded?: boolean
  onToggle?: () => void
  selectedPostId?: string
  onPostClick?: (postId: string) => void
  user?: User
```

**Header row** — CSS grid `14px 1fr auto` gap 14px, padding `11px 12px`,
border-bottom `1px solid divider` (first gets border-top):

```
[▷/▼ chev]  [title  N posts]  [date]
```

- chevron: 13×13 px, `color: text.disabled`; rotate 90° when expanded
  (CSS transition 150 ms).
- `title`: 14.5 px, weight 500, `letter-spacing: -0.005em`
- `N posts`: 12.5 px, `color: text.disabled`, displayed inline after title
  with a gap of 10px (baseline-aligned)
- `date`: 12.5 px, `color: text.disabled`

**Body** (visible when expanded) — `padding: 2px 0 10px 28px`, position
`relative`. Left vertical connector:

```css
::before {
  content: "";
  position: absolute;
  left: 18px;
  top: 2px; bottom: 10px;
  width: 1px;
  background: divider;
}
```

### 4.5 `SeriesSubRow.tsx`
A numbered sub-row inside an expanded series card.

```
Props:
  ordinal: string          // "D1", "01", "02", etc.
  post: Document           // cloud Document (from series.posts)
  selected?: boolean
  onClick?: () => void
```

Layout — CSS grid `22px 1fr auto` gap 14px, padding `7px 12px` with left
padding 28px (to sit inside the accordion indent):

```
[D1]  [● title………………………]  [Apr 02]
```

- ordinal: `font-size: 11px`, `color: text.disabled`, tabular-nums,
  `letter-spacing: 0.06em`
- title: `font-size: 13.5px`, `color: text.secondary`, weight 400.
  A 5 px amber dot appears **inside** the title span before the text if draft.
  When `selected` → `color: primary.main`, weight 500.
- date: `font-size: 12px`, `color: text.disabled`

Selected state: same left bar pattern as `PostRow` but 2 px wide, 14 px tall,
`left: 14px`.

### 4.6 `PostListSection.tsx`
Wraps `BrowseSectionHeader` + list of `PostRow` components.

```
Props:
  posts: UserDocument[]
  selectedId?: string
  onSelect?: (post: UserDocument) => void
  onNewPost?: () => void
  user?: User
```

Handles the collapsed state internally (`useState`). Passes `sortControl`
and `moreControl` nodes to `BrowseSectionHeader` (hover-revealed).

### 4.7 `SeriesListSection.tsx`
Wraps `BrowseSectionHeader` + list of `SeriesAccordionCard` components.

```
Props:
  series: Series[]
  selectedPostId?: string
  onPostSelect?: (postId: string) => void
  onNewSeries?: () => void
  user?: User
```

Handles:
- Collapsed state of the section itself.
- Expanded/collapsed state per series card (persisted in `localStorage` via
  the existing `useExpandedState` hook from `src/hooks/useExpandedState.ts`).
- "Expand all / Collapse all" logic for the section header control.

---

## 5. Modifications to Existing Files

### 5.1 `src/components/posts/PostsView.tsx` — Major refactor

Replace the current layout with:

```tsx
return (
  <Box component="main" sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
    <BrowseTopbar
      title="Posts"
      onNewPost={canEdit ? () => setCreatePostDrawerOpen(true) : undefined}
      onToggleSidebar={...}
    />
    <Box sx={{ flex: 1, overflowY: "auto" }}>
      <Box sx={{ maxWidth: 680, mx: "auto", py: "48px", px: "36px", display: "flex", flexDirection: "column", gap: "40px" }}>
        {hasPosts && (
          <PostListSection
            posts={sortedStandalonePosts}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNewPost={canEdit ? () => setCreatePostDrawerOpen(true) : undefined}
            user={user}
          />
        )}
        {hasSeries && (
          <SeriesListSection
            series={seriesList}
            selectedPostId={selectedId}
            onPostSelect={handleSelect}
            onNewSeries={canEdit ? () => setCreateSeriesDrawerOpen(true) : undefined}
            user={user}
          />
        )}
        {!hasPosts && !hasSeries && <EmptyState ... />}
      </Box>
    </Box>

    {/* Drawers — unchanged */}
    <CreatePostDrawer ... />
    <CreateSeriesDrawer ... />
  </Box>
);
```

**Remove from `PostsView`:**
- `ViewToggle` and the `viewType` localStorage state (grid/compact toggle is
  gone — the new list view is the only view).
- `PostsGrid` local component.
- `SectionDivider` local helper (replaced by `BrowseSectionHeader`).
- The inline `ToggleButtonGroup` action buttons (moved to topbar / section headers).

**Keep in `PostsView`:**
- All Redux selectors (`selectStandalonePosts`, `state.series`).
- `sortByDate` helper.
- Drawer/dialog state and components (`CreatePostDrawer`, `CreateSeriesDrawer`,
  `AddPostsDialog`).
- `useTimeEditing` (still needed for series detail page — series mode path
  in `PostsView` is largely unchanged; only all-posts mode changes).
- Series-mode rendering path (when `series` prop is provided) — this is the
  `/posts/[id]` detail page; only refactor the all-posts mode (`!isSeries` branch).

### 5.2 `src/components/DocumentGrid/DocumentGrid.tsx` — Bug fix only

Fix the silent title-drop bug (line 156–175): the `headerComponent` memoizes
`title` and `titleIcon` but never renders the `title` string. Add:

```tsx
{title && (
  <Typography variant="h6" sx={{ fontWeight: 600 }}>
    {title}
  </Typography>
)}
```

This is a separate, small fix. Do not change any other behavior of `DocumentGrid`.

---

## 6. Styling Guidelines

Translate the reference's CSS custom properties to MUI sx props:

| Reference token | MUI equivalent |
|----------------|----------------|
| `--bg` / `--bg-soft` | `background.paper` / `action.hover` |
| `--ink` | `text.primary` |
| `--ink-2` | `text.secondary` |
| `--muted` | `text.secondary` |
| `--faint` | `text.disabled` |
| `--rule` / `--rule-soft` | `divider` |
| `--accent` (`#4f46e5`) | `primary.main` |
| `--amber` (`#d97706`) | `warning.main` |
| `border-radius: 7–8px` | `borderRadius: 1` (MUI default = 4px × 2 = 8px) |

**Do not** introduce new CSS files or `styled` components. Use `sx` props
throughout to stay consistent with the existing codebase.

**Fonts:** Do not change the font stack. The app already uses Inter via MUI
theme. JetBrains Mono is not needed — ordinals are plain text.

---

## 7. Data Contracts

### How to determine draft status in a `UserDocument`
```ts
const doc = userDocument.cloud || userDocument.local;
const isDraft = doc?.status === DocumentStatus.ACTIVE
  && !doc?.head;          // no content yet
// or simply use the status field — ACTIVE = in-progress/draft, DONE = published
```
Check `src/components/DocumentCard/hooks/usePostState.ts` for the existing
`status` derivation to stay consistent.

### Ordinal label for series sub-rows
Series posts have `seriesOrder` on the `Document` model. Format as:
- If it looks like a number: zero-pad to 2 digits → `"01"`, `"02"`
- Or use the existing convention from sidebar HTML: `"D1"`, `"D2"` — but the
  reference uses both; default to numeric zero-padded unless the series already
  has alphanumeric ordinals.

Derive from `post.seriesOrder` (number). If null, use the array index + 1.

### Date formatting
Use the existing `formatFullDate` from `src/utils/dateFormat.ts` for consistency
with the rest of the app. For relative display ("just now", "2h ago", "Apr 12"),
add a small local helper or extend dateFormat:

```ts
function browseDate(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  // else: "Apr 12" format
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

---

## 8. What NOT to Change

- `src/components/DocumentGrid/` — except the one title-render bug fix.
- `src/components/DocumentCard/` — PostCard, CardBase, etc. are used elsewhere.
- `src/components/posts/components/SeriesGroupCard.tsx` — used in other views.
- `src/components/posts/components/SeriesSearchAndControls.tsx` — used in
  series detail page (`isSeries` mode).
- `src/components/drawers/` — drawer implementations are correct as-is.
- Redux store, selectors, repositories — no changes needed.
- Right sidebar / rail — out of scope.
- Left sidebar — out of scope.

---

## 9. Implementation Order

1. **Create `BrowseTopbar.tsx`** and render it at the top of `PostsView` (both
   modes). Verify it looks right before proceeding.

2. **Create `BrowseSectionHeader.tsx`**. Test in isolation with static props.

3. **Create `PostRow.tsx`**. Wire the status dot and date. Verify selected state
   and hover `···` menu.

4. **Create `PostListSection.tsx`**. Compose header + rows. Verify collapse.

5. **Create `SeriesSubRow.tsx`** and **`SeriesAccordionCard.tsx`**. Verify
   expand/collapse animation and selected sub-row state.

6. **Create `SeriesListSection.tsx`**. Wire `useExpandedState` for per-series
   persistence. Verify "Expand all / Collapse all".

7. **Refactor `PostsView.tsx`** (all-posts mode only): replace `PostsGrid` +
   `SectionDivider` + inline action buttons with the new section components.
   Keep the `isSeries` branch untouched.

8. **Fix `DocumentGrid.tsx`** title-render bug.

9. Run `npm run lint` and fix any issues. There is no test runner — verify
   visually in the browser with `npm run dev`.

---

## 10. Open Questions (decide before implementing)

1. **Selected state persistence:** Should `selectedId` be stored in Redux `ui`,
   in URL params, or in local component state? Currently clicking a post
   navigates away (router push). If the new design shows the right rail inline,
   you need a selected ID. Check whether the right rail is in scope before
   adding selection state.

2. **Series detail page (`isSeries` mode):** The brief says leave it alone, but
   consider whether the `BrowseTopbar` should also appear there (title would be
   the series name instead of "Posts"). If yes, lift the topbar higher.

3. **`ViewToggle` removal:** Confirm the grid/compact toggle is intentionally
   removed. If some users rely on it, add a migration path (clear the
   `postsView` localStorage key on mount).

4. **Time-edit mode:** Currently only available in series detail view. Confirm
   it is not needed in the new all-posts list view before removing the
   `SeriesSearchAndControls` from the all-posts path.
