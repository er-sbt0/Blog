# Component consolidation opportunities

Findings from April 2026 audit of `src/components/`.

---

## 1. Merge `common/` into `shared/`

**Effort:** S — no logic changes, ~50 import-path updates.

There is no enforced distinction between `common/` and `shared/`. Both hold app-wide reusable primitives. Merge everything into `shared/`:

```
shared/
  AuthProvider.tsx          ← from common/
  DateDisplay.tsx           ← from common/ (see also #5)
  EditorSkeleton.tsx        ← from common/
  EmptyState.tsx            ← already here
  granularityOptions.ts     ← already here
  LoadingState.tsx          ← from common/
  PrintTrigger.tsx          ← from common/
  RelativeDate.tsx          ← from common/ (see also #5)
  SearchField.tsx           ← already here
  SplashScreen.tsx          ← from common/
  SyncToCloudFab.tsx        ← from common/
  TimeGroupHeader.tsx       ← already here
  ToolsContainer.tsx        ← from common/
  ViewToggle.tsx            ← already here
```

Delete `src/components/common/` entirely after updating imports.

---

## 2. Three card-shaped error boundaries → one

**Effort:** S — delete 2 files, update ~5 call sites.

Three components implement the same "card that failed to render" pattern:

| File | Capability |
|---|---|
| `ErrorBoundary/CardErrorBoundary.tsx` | `onError` callback, dev-mode error detail, `fallback` prop — **keep this one** |
| `Home/ErrorBoundaryCard.tsx` | simpler class component, no callback |
| fallback inside `AppErrorBoundary` | inline card-shaped JSX, duplicates CardErrorBoundary |

**Action:**
- Delete `Home/ErrorBoundaryCard.tsx`; replace its usages in `Home/` with `<CardErrorBoundary>`.
- Remove the duplicate inline card fallback from `AppErrorBoundary` — use `<CardErrorBoundary>` as the fallback prop instead.

---

## 3. Four "nothing here" empty states → one upgraded `EmptyState`

**Effort:** M — upgrade one component, delete two files, update call sites.

| Component | Icon | CTA button | Used by |
|---|---|---|---|
| `shared/EmptyState` | emoji string | ✗ | `PostsView` |
| `DocumentGrid/DocumentGridEmpty` | `ReactNode` | ✓ optional | `DocumentGrid` |
| `DocumentBrowser/BlogPostsEmptyState` | hardcoded `PostAdd` | ✓ hardcoded | `DocumentBrowser` |
| `DocumentBrowser/ErrorState` | hardcoded `Folder` | ✓ hardcoded | `DocumentBrowser` |

Upgrade `shared/EmptyState` to a single flexible primitive:

```ts
interface EmptyStateProps {
  icon?: React.ReactNode;  // MUI icon element OR omit for emoji fallback
  emoji?: string;          // kept for backward compat
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  variant?: "page" | "card";  // controls padding/font scale
}
```

`BlogPostsEmptyState` becomes a one-liner at the call site:

```tsx
<EmptyState
  icon={<PostAdd />}
  title="No blog posts yet"
  description="Create your first post to get started"
  action={{ label: "New Post", onClick: onCreateDocument }}
/>
```

**Delete:**
- `DocumentBrowser/components/BlogPostsEmptyState.tsx`
- `DocumentGrid/DocumentGridEmpty.tsx`

`DocumentBrowser/ErrorState` can be replaced with a call to `EmptyState` (with a `variant="page"` wrapper) and the `Back to Posts` link passed as `action`, or handled by Next.js `not-found.tsx`.

---

## 4. Extract `DrawerShell` from the two create drawers

**Effort:** M — extract +1 shared component, each drawer drops ~80 lines of layout boilerplate.

`CreatePostDrawer` and `CreateSeriesDrawer` share identical 3-zone structure:

```
Drawer (anchor=right, responsive width)
  └─ Box[form]
       ├─ Header (title + optional subtitle + close button)
       ├─ Body   (flex: 1, overflowY: auto, p: 3)
       └─ Footer (cancel + submit buttons, border-top)
```

Extract into `shared/DrawerShell.tsx`:

```ts
interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: { xs?: string | number; sm?: number; md?: number };
  disabled?: boolean;     // disables close button and propagates to children
  children: React.ReactNode;   // body content
  actions: React.ReactNode;    // footer buttons
}
```

Each drawer then contains only its form fields and submit logic. Applies to any future form drawer automatically.

---

## 5. Merge `RelativeDate` into `DateDisplay`

**Effort:** S — delete 1 file, update 3–4 call sites.

Both components live in `common/`, export a `<time>` element, and use `date-fns`. Add a `relative` prop to `DateDisplay`:

```ts
interface DateDisplayProps {
  date: Date | string;
  relative?: boolean;       // if true → formatDistanceToNow
  addSuffix?: boolean;      // passed through to relative mode
  variant?: "short" | "medium" | "long" | "full";
  customFormat?: string;
  className?: string;
}
```

Delete `RelativeDate.tsx`. All existing `<RelativeDate date={x} addSuffix />` calls become `<DateDisplay date={x} relative addSuffix />`.

---

## 6. Delete dead `DocumentGridHeader`

**Effort:** XS — delete 1 file.

`DocumentGrid/DocumentGridHeader.tsx` has every prop `_`-prefixed (intentionally unused). The render output is an empty `Box` with a conditionally-rendered icon that shows nothing but a margin. Grep confirms it is imported by nothing outside its own directory. Delete it.

---

## 7. Consolidate the two error-display components

**Effort:** S — delete 1 file, update 1–2 call sites.

- `DocumentGrid/DocumentGridError` — accepts `error`, `onRetry`, `message`; generic.
- `DocumentBrowser/ErrorState` — hardcoded "Post not found" with a Back link; specific.

`DocumentBrowser/ErrorState` is doing the job of a `not-found.tsx` page. Either:
- Move its content to `app/(blog)/browse/not-found.tsx`, or
- Replace with the upgraded `EmptyState` from #3 passing the back-link as `action`.

Delete `DocumentBrowser/components/ErrorState.tsx` after migrating.

---

## Summary

| # | Description | Files removed | Effort |
|---|---|---|---|
| 1 | Merge `common/` into `shared/` | dir removed (~10 files moved) | S |
| 2 | Three error boundaries → `CardErrorBoundary` | −2 | S |
| 3 | Four empty states → one upgraded `EmptyState` | −2 | M |
| 4 | Extract `DrawerShell` | +1 shared | M |
| 5 | Merge `RelativeDate` into `DateDisplay` | −1 | S |
| 6 | Delete dead `DocumentGridHeader` | −1 | XS |
| 7 | Consolidate error displays | −1 | S |

**Total: up to −7 files, 1 directory eliminated, 2 components upgraded.**
