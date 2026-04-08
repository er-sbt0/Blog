# Component Issues

## P4 — Type Safety

### 10. `extractText(node: any)` — `StaticNoteCard.tsx`

Recursive Lexical node traversal typed as `any`, losing all type safety.
**Fix:** Use Lexical's `LexicalNode` / `SerializedLexicalNode` types.

### 11. `tutorialTemplate as unknown as EditorDocument` — `Tutorial/Editor.tsx`

Double cast signals real type incompatibility between tutorial template shape
and `EditorDocument`. **Fix:** Align the template's type with `EditorDocument`
or introduce a proper conversion function.

### 12. Untyped react-rnd event handlers — `NotesCanvas/DraggableNote.tsx:71, 76–78`

`_e: any`, `_direction: any`, `_delta: any` in drag/resize handlers. **Fix:**
Import and use the proper event/callback types from `react-rnd`.

---

## P5 — Patterns / Consistency

### 13. Inconsistent error handling across components

- `.catch(() => {})` — silent swallow (`Dashboard.tsx:99, 105`)
- `console.error(...)` — logs but no user feedback (multiple files)
- `alert(...)` — blocking UI alert (`SeriesCard` variants)

No consistent pattern for surfacing errors to users. **Fix:** Establish a
standard: log via `console.error` + show non-blocking toast/snackbar. Remove
`alert()` calls.

### 14. Class component `EditorErrorBoundary` — `EditDocument/index.tsx:12–43`

Only class component in an otherwise fully functional codebase. **Fix:** Replace
with `react-error-boundary` or a functional wrapper using error context.

### 15. Missing `useCallback` on handlers passed to memoized children

Handlers (`handleEdit`, `handleDelete`, `handleToggle`, etc.) are recreated on
every render in multiple components, defeating child `memo()` wrappers. **Fix:**
Wrap handlers in `useCallback` wherever they are passed to memoized children.
