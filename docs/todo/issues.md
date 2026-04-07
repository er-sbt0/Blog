# Component Issues

Findings from code review of `src/components/`. Sorted by severity.

---

## 🔴 Bug

### 1. ~~Shared `seriesExpandedState` localStorage key collision~~ ✅ Fixed

Extracted `src/hooks/useExpandedState.ts`. `PostsGrid` now uses
`"postsGridExpandedState"`, `PostsCompactListView` uses
`"seriesViewExpandedState"`.

---

## 🟠 High

### ~~2. Handle validation logic duplicated in three places~~ ✅ Fixed

`useHandleValidation` now accepts a `checkEndpoint` parameter. `UserActionMenu`
passes `"/api/users/check"` and `CreatePostDrawer` passes `"/api/handle"`. Both
inline copies removed; `CreatePostDrawer` also gained the missing UUID and regex
checks.

---

### ~~3. `debounce()` called inside `useCallback` — fragile pattern~~ ✅ Fixed

Replaced `useCallback(debounce(...), deps)` with
`useMemo(() => debounce(...), deps)` in `Editor.tsx` and
`useHandleValidation.ts`. `UserActionMenu.tsx` no longer had a direct debounce
(removed in issue 2 fix).

---

### 4. Raw `localStorage` scattered across components — no shared abstraction

**Locations:**

| File                                          | Keys                                             |
| --------------------------------------------- | ------------------------------------------------ |
| `PostsList/index.tsx:117-139`                 | `postsView`, `postsShowPosts`, `postsShowSeries` |
| `SeriesView/index.tsx:40-48`                  | `seriesPostsView`                                |
| `SeriesView/PostsCompactListView.tsx:57-78`   | `seriesExpandedState`                            |
| `PostsList/PostsGrid.tsx:89-116`              | `seriesExpandedState` (collision with above)     |
| `Home/index.tsx:44-85`                        | `notesCanvasHeight`                              |
| `Layout/SideBar/ActivePostsSection.tsx:32-57` | `sidebarSeriesCollapsedState`                    |

Each uses an ad-hoc `useEffect` to hydrate on mount + manual sync in event
handlers. This causes hydration flicker (SSR renders default, client reads
localStorage, React re-renders). The sidebar already has the right pattern
(`useSidebarFontSize`, `SidebarWidthContext`).

**Fix:** Create a shared `useLocalStorageState<T>(key, defaultValue)` hook and
replace all ad-hoc read/write pairs.

---

## 🟡 Medium

### 5. `Dashboard.tsx` — empty-state Box copy-pasted 5 times

**File:** `src/components/Dashboard.tsx:95,109,180,194,218`

```tsx
<Box sx={{
  display: "flex", flexDirection: "column",
  justifyContent: "center", alignItems: "center",
  height: 300, gap: 2,
}}>
```

This exact structure appears five times (loading spinner, local empty, cloud
unauthenticated, cloud empty). Styling changes require 5 edits.

**Fix:** Extract `<StorageEmptyState icon={...} label="..." />` covering all
variants.

---

### 6. `Dashboard.tsx` — fire-and-forget promises with silent catch

**File:** `src/components/Dashboard.tsx:59-72`

```ts
useEffect(() => {
  dispatch(actions.getLocalStorageUsage()).unwrap().then(payload => {
    setStorageUsage(prev => ({ ...prev, local: parseStoragePayload(payload) }));
  }).catch(() => {});  // errors silently swallowed
  dispatch(actions.getCloudStorageUsage()).unwrap().then(...).catch(() => {});
}, []);  // dispatch missing from deps
```

Problems:

- No cleanup: if the component unmounts before the promises resolve,
  `setStorageUsage` fires on an unmounted component.
- `dispatch` is missing from the `useEffect` deps array.
- Errors are silently swallowed — users see a perpetual loading spinner with no
  feedback.

**Fix:** Add an `isMounted` ref or `AbortController` for cleanup; surface errors
with a fallback UI state.

---

### 7. `useTimeEditing.ts` — raw `fetch` + `router.refresh()` bypasses Redux

**File:** `src/components/SeriesView/hooks/useTimeEditing.ts:62-70`

```ts
const response = await fetch("/api/posts/update-times", { method: "POST", ... });
router.refresh();
```

Every other write in the app goes through a Redux thunk that updates store
state. This hook fires a raw fetch then forces a full server re-render via
`router.refresh()`, which causes a visible content flash on save and is
inconsistent with the rest of the architecture.

**Fix:** Create a Redux thunk for batch time updates and dispatch it instead.

---

## 🟢 Low

### 8. Dead constant `isDirectory = false`

**File:** `src/components/DocumentActions/Edit.tsx:44`

```ts
const isDirectory = false;
```

Hardcoded to `false`, never reassigned. Either the branching that used it was
removed and this wasn't cleaned up, or it's a placeholder. Either way it's
misleading.

**Fix:** Delete it (and any dead branches conditioned on it).
