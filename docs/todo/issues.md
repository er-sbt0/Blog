# Component Issues

## P1 — Latent Bugs / Correctness

### 1. `useEffect` with suppressed dependency — `NewDocument.tsx:116`
`baseId` is used inside a `useEffect` with an empty dep array, bypassed with `eslint-disable-next-line react-hooks/exhaustive-deps`. If `baseId` changes after mount, the document won't reload.
**Fix:** Add `baseId` to dependency array, or explicitly document why it must run once.

### 2. Multiple sources of truth for saved state — `EditDocument/Editor.tsx`
Three parallel mechanisms track whether content is saved: `hasUnsavedChanges` local state, `lastSavedCloud` ref, and Redux document state. Divergence between them can cause silent data loss or incorrect dirty indicators.
**Fix:** Consolidate into a single Redux-based dirty state.

---

## P2 — Architectural / Structural

### 3. Raw `fetch` vs Redux `dispatch` inconsistency — `SeriesCard/variants/*.tsx`
Series delete operations call `fetch('/api/series/{id}')` directly inside component handlers. All document operations go through Redux thunks. Series bypasses Redux entirely — no loading state, no store update, no consistent error handling.
**Fix:** Add series delete thunk in the Redux slice and dispatch it.

### 4. `NotesCanvas/index.tsx` — God component (508 lines)
Single file handles: canvas rendering, zoom controls, keyboard shortcuts, drag/drop, clipboard, preview mode, full-canvas mode, and contains an inline `PasteButton` sub-component (lines 33–106).
**Fix:** Extract `PasteButton` to its own file; extract `useNotesZoom` hook; split preview/full-canvas into sub-components.

### 5. `Dashboard.tsx` — Mixed state ownership in `StorageChart`
Storage data is fetched via Redux thunks (`dispatch(actions.getLocalStorageUsage())`) but the result is stored in local `useState` — never lands in Redux. Errors are swallowed silently (`.catch(() => {})`).
**Fix:** Store storage usage in Redux slice, or skip dispatch and fetch directly with proper error handling.

### 6. Prop drilling zoom state — `Home/index.tsx`
The zoom object (`scale`, `zoomIn`, `zoomOut`, `resetZoom`, `canZoomIn`, `canZoomOut`) is drilled from `Home` down to `NotesCanvas`.
**Fix:** Move zoom state into a context or a hook consumed directly by `NotesCanvas`.

---

## P3 — Duplicated Logic

### 7. Duplicated delete + menu logic — `SeriesCard/variants/CompactVariant.tsx` & `DetailedVariant.tsx`
Both variants independently implement:
- `anchorEl`/`menuOpen` state pattern
- Delete handler with `window.confirm` + `fetch` + `router.refresh()`
- `formatDate` utility function (copy-pasted identically)
- `useMemo` post-sorting block

Any bug fix or behavior change must be applied in both places.
**Fix:** Extract `useSeriesActions` hook, `useSortedPosts` hook, and a shared `formatDate` utility.

### 8. `anchorEl`/`menuOpen` pattern duplicated broadly
Same boilerplate (`const [anchorEl, setAnchorEl] = useState(null); const menuOpen = Boolean(anchorEl)`) appears in at least 3 components.
**Fix:** Extract `useMenuState()` hook returning `{ anchorEl, menuOpen, openMenu, closeMenu }`.

---

## P4 — Type Safety

### 9. Double cast in `EditRevisionCard.tsx:75, 108`
Two different casting strategies used for the same object on adjacent lines:
```ts
(cloudRevision as unknown as CloudDocumentRevision).author?.id
(cloudRevision as any)?.author?.name
```
Indicates an unresolved type mismatch papered over with casts.
**Fix:** Fix the `CloudDocumentRevision` type definition so no cast is needed.

### 10. `extractText(node: any)` — `StaticNoteCard.tsx`
Recursive Lexical node traversal typed as `any`, losing all type safety.
**Fix:** Use Lexical's `LexicalNode` / `SerializedLexicalNode` types.

### 11. `tutorialTemplate as unknown as EditorDocument` — `Tutorial/Editor.tsx`
Double cast signals real type incompatibility between tutorial template shape and `EditorDocument`.
**Fix:** Align the template's type with `EditorDocument` or introduce a proper conversion function.

### 12. Untyped react-rnd event handlers — `NotesCanvas/DraggableNote.tsx:71, 76–78`
`_e: any`, `_direction: any`, `_delta: any` in drag/resize handlers.
**Fix:** Import and use the proper event/callback types from `react-rnd`.

---

## P5 — Patterns / Consistency

### 13. Inconsistent error handling across components
- `.catch(() => {})` — silent swallow (`Dashboard.tsx:99, 105`)
- `console.error(...)` — logs but no user feedback (multiple files)
- `alert(...)` — blocking UI alert (`SeriesCard` variants)

No consistent pattern for surfacing errors to users.
**Fix:** Establish a standard: log via `console.error` + show non-blocking toast/snackbar. Remove `alert()` calls.

### 14. Class component `EditorErrorBoundary` — `EditDocument/index.tsx:12–43`
Only class component in an otherwise fully functional codebase.
**Fix:** Replace with `react-error-boundary` or a functional wrapper using error context.

### 15. Missing `useCallback` on handlers passed to memoized children
Handlers (`handleEdit`, `handleDelete`, `handleToggle`, etc.) are recreated on every render in multiple components, defeating child `memo()` wrappers.
**Fix:** Wrap handlers in `useCallback` wherever they are passed to memoized children.
