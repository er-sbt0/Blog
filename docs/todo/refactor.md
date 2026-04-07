# Refactor TODO: src/components/

Issues found during April 2026 code review. Sorted by importance level 1–4.

---

## Level 1 — Critical / Bugs / Broken Functionality

*(All resolved)*

---

## Level 2 — High Impact / Structural Debt

### ~~Duplicated revision selector across 4 Share panels~~ ✓ resolved
- Extracted `RevisionSelector` and `PermissionsControl` components in `ShareTabPanels.tsx` (commit 8d890410)

### ~~Parallel state duplication in `StorageChart`~~ ✓ resolved
- Merged into single `StorageState` object with `parseStoragePayload` helper in `Dashboard.tsx` (commit 8d890410)

### ~~`useEditDocumentForm` violates single responsibility~~ ✓ resolved
- Split into `useHandleValidation` (debounce + slug validation) and `useDocumentSubmit` (partial diff + dispatch); `useEditDocumentForm` now orchestrates both (commit pending)

### `Edit.tsx` god form component
- **File**: `src/components/DocumentActions/Edit.tsx` (335 lines)
- **Issue**: Manages 8+ distinct field groups (title, description, handle, dates, status, background image, visibility, coauthors) in a single component. No fields are individually reusable. Any change touches this entire file.
- **Fix**: Split into composed field components: `<EditTitleField>`, `<EditHandleField>`, `<EditDateFields>`, etc.

### Unsafe type casts — root cause is unresolved revision type union
- **Files**:
  - `src/components/DocumentActions/FilterControl.tsx:46` — `(revision as unknown as CloudDocumentRevision)`
  - `src/components/SeriesCard/SeriesCardUnified.tsx:46` — `{...(props as any)}`
  - `src/components/ViewRevisionCard.tsx:279–286` — multiple `as any` on `.author?.image`
  - `src/components/Dashboard.tsx:53–55` — `ReturnType<typeof actions.getLocalStorageUsage.fulfilled>["payload"]`
- **Issue**: The local/cloud revision type union is unresolved at the component level, forcing downstream casts to escape the type system.
- **Fix**: Properly discriminate the union type in `src/types.ts` and eliminate casts at call sites.

---

## Level 3 — Medium Impact / Maintainability

### Local state mirroring in `PostsList` done manually
- **File**: `src/components/PostsList/index.tsx:108–125`
- **Issue**: `viewType`, `showPosts`, `showSeries` are each manually synced to `localStorage` via separate handlers. Fragile — easy to miss one when adding a new filter.
- **Fix**: Use a single `useLocalStoragePref(key, defaultValue)` hook per value, or consolidate into one preferences object.

### Debounce in `useEditDocumentForm` not cancelled on unmount
- **File**: `src/components/DocumentActions/hooks/useEditDocumentForm.ts:92–108`
- **Issue**: `debounce()` is created inside `useCallback` with no cleanup. If the component unmounts before the 500ms delay, the pending API call still fires.
- **Fix**: Use `useDebouncedCallback` from `use-debounce`, or return a cancel call from a `useEffect` cleanup.

### Breadcrumb traversal not memoized
- **File**: `src/components/DocumentActions/hooks/useDirectoryBrowser.ts:67–79`
- **Issue**: `buildBreadcrumbs()` recursively traverses the parent chain on every render with no memoization. Same traversal is repeated if parent renders with identical data.
- **Fix**: Wrap in `useMemo` keyed on `currentDirectoryId` and the documents list.

---

## Level 4 — Low Impact / Polish

### Missing `React.memo` on Share tab panels
- **File**: `src/components/DocumentActions/ShareTabPanels.tsx`
- **Issue**: All 4 panel components re-render on every tab switch even when hidden, and each runs a `.map()` over the revisions array.
- **Fix**: Wrap each panel export with `React.memo()`.

### Error boundary discards `errorInfo`
- **File**: `src/components/EditDocument/index.tsx:12–43`
- **Issue**: `componentDidCatch(error, errorInfo: any)` receives `errorInfo` (component stack) but never logs or uses it, making debugging harder.
- **Fix**: Log `errorInfo.componentStack` alongside the error, or pass it to an error reporting service.
