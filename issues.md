# Code Quality Issues — src/components/

> Review date: 2026-04-10. Focused on: god components, anti-patterns, TypeScript
> safety, state management, consistency.

## High

### H1 — God components (>350 lines, multiple responsibilities)

| File                                                    | Lines | Responsibilities                                              |
| ------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `src/components/Home/ReadmePreviewCard.tsx`             | 462   | Fetch doc, fetch HTML, create doc, manage 4 UI states, render |
| `src/components/EditDocument/Editor.tsx`                | 415   | Load, auto-save, diff, dirty tracking, cloud sync, render     |
| `src/components/SeriesCard/variants/CompactVariant.tsx` | 437   | Sort posts, manage menus, render collapsed + expanded         |
| `src/components/SeriesView/AddPostsDialog.tsx`          | 422   | Fetch available posts, selection state, API calls, render     |
| `src/components/NotesCanvas/BoardSelector.tsx`          | 398   | Board CRUD, zoom controls, render                             |

**Pattern fix**: Extract logic into custom hooks (`useDocumentLoader`,
`useAutoSave`, `useAvailablePostsSelector`) and split large render trees into
smaller subcomponents.

---

### H3 — Hardcoded API paths scattered across components

**Files** (partial list):

- `src/components/Home/ReadmePreviewCard.tsx` lines 60, 115, 126
- `src/components/SeriesView/AddPostsDialog.tsx` line 64
- `src/components/CreatePostDrawer/index.tsx` line 81

Components call `fetch('/api/documents')`,
`fetch('/api/series/available-posts')` etc. directly. No central API client.

**Fix**: Create `src/api/client.ts` with typed methods. Enables mocking in tests
and a single refactor point if routes change.

---

## Medium

### M1 — Inline JSX callbacks without useCallback causing unnecessary re-renders

**Files**:

- `src/components/NotesCanvas/DraggableNote.tsx` lines 216–218, 233–235, 305,
  327
- `src/components/SeriesView/components/PostCompactListItem.tsx` lines 107–112,
  138–150
- `src/components/PostsList/components/PostsHeader.tsx` lines 120–122, 184–192

Pattern:

```tsx
<IconButton onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
```

Each render creates a new function reference. Memo on child components becomes
ineffective.

**Fix**: Wrap in `useCallback` with stable deps.

---

### M2 — Missing `useMemo` for derived theme values

**File**: `src/components/DocumentGrid.tsx` ~line 93

```tsx
const theme = useTheme();
const cardTheme = createCardTheme(theme); // re-created every render
```

**Fix**:

```tsx
const cardTheme = useMemo(() => createCardTheme(theme), [theme]);
```

---

### M4 — Inconsistent error handling across components

| File                                         | Pattern                                 |
| -------------------------------------------- | --------------------------------------- |
| `src/components/Home/ReadmePreviewCard.tsx`  | `console.error()` only — silent to user |
| `src/components/DocumentActions/Edit.tsx`    | `dispatch(actions.announce())`          |
| `src/components/BackgroundImageUploader.tsx` | both `console.error` AND dispatch       |

**Fix**: Create a `useErrorAnnounce` hook that always dispatches to the
snackbar. Ban `console.error` for user-facing errors.

---

### M5 — Inconsistent loading state representations

Three different patterns in use for the same concept:

- `src/components/PostsList/index.tsx` — custom `PostsLoadingState` component
- `src/components/DocumentCardNew/PostThumbnail.tsx` — `ThumbnailSkeleton`
- `src/components/SeriesView/AddPostsDialog.tsx` — bare `<CircularProgress>` in
  `<Box>`

**Fix**: Standardise on one `<LoadingOverlay>` or `<ContentSkeleton>` component.

---

### M6 — Inconsistent menu anchor state management

- `src/components/NotesCanvas/DraggableNote.tsx` — two separate `useState`
  anchors
- `src/components/NotesCanvas/BoardSelector.tsx` — `menuAnchor` + `menuBoardId`
  pair
- `src/components/SeriesCard/variants/CompactVariant.tsx` — `useSeriesActions`
  hook

A `useMenuState` hook likely already exists. Use it consistently everywhere.

---

### M7 — Over-specified `useMemo` dependencies

**File**: `src/components/SeriesCard/variants/DetailedVariant.tsx` ~line 159

```tsx
const topContent = useMemo(
  () => (...),
  [series, formattedDate, postCount, showMetadata], // postCount derives from series
);
```

`postCount` is `series.posts.length` — redundant when `series` is already a dep.
Clutters the deps array and makes reasoning harder.

---

### M8 — `window.location.reload()` in async callback

**File**: `src/components/Home/ReadmePreviewCard.tsx` ~line 232

Hard page reload after creating a README document. All in-memory state is lost
and the user experiences a flash.

**Fix**: Dispatch a Redux action to update state and navigate with
`router.push()` instead.

---

## Low

---

### L2 — `dynamic()` loading prop instead of `<Suspense>`

**File**: `src/components/EditDocument/index.tsx` ~lines 45–67

```tsx
const DocumentEditor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />, // old pattern
});
```

React 18 + Next.js 13+ prefer wrapping with `<Suspense fallback={...}>`
directly.

**Fix**:

```tsx
const DocumentEditor = dynamic(() => import("./Editor"), { ssr: false });
// ...
<Suspense fallback={<EditorSkeleton />}>
  <DocumentEditor ... />
</Suspense>
```

---

### L3 — Missing response typing on `fetch` calls

**File**: `src/components/SeriesView/AddPostsDialog.tsx` ~lines 65, 125

```tsx
const { data, error } = await response.json(); // untyped
if (error) setError(error.title || "Failed"); // assumes shape
```

**Fix**: Define
`interface SeriesApiResponse { data?: Post[]; error?: { title: string } }` and
assert the type on `.json()`.

---

## Totals

| Severity  | Open   | Fixed | Total  |
| --------- | ------ | ----- | ------ |
| Critical  | 3      | 0     | 3      |
| High      | 2      | 3     | 5      |
| Medium    | 6      | 2     | 8      |
| Low       | 2      | 1     | 3      |
| **Total** | **14** | **5** | **19** |
