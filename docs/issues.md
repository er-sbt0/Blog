## Code Review: Smells & Anti-Patterns (sorted by severity)

### 1. **CRITICAL — XSS via `dangerouslySetInnerHTML`**
PostThumbnail.tsx

The regex-based "sanitization" (replacing `<a` → `<span>`, `<script` → `<span>`) is trivially bypassed. Vectors like `<img onerror="alert(1)">`, `<svg onload="...">`, `<iframe>`, `<style>`, event attributes on any tag, `javascript:` URLs, etc. are all unblocked. Use a proper HTML sanitizer (e.g. DOMPurify).

---

### 2. **HIGH — `isAuthor` check is a truthy object, not a boolean comparison**
StatusActions.tsx

```ts
const isAuthor = cloudDocument ? cloudDocument.author : true;
```

This evaluates to the author **object** (always truthy), not a proper ownership check. Compare with the correct pattern used everywhere else: `cloudDocument.author.id === user?.id`. This means non-authors can change document status.

---

### 3. **HIGH — Non-null assertions without guards**
Restore.tsx: `userDocument.local!` and `userDocument.cloud!` are asserted at the top level, but the component can be rendered when either is null/undefined.
PostCard.tsx: `userDocument!.local!.head !== userDocument!.cloud!.head` — if either is undefined, this crashes.

---

### 4. **HIGH — `navigator.share()` called without feature detection**
useShareDocument.ts

```ts
await navigator.share({ title: name, url: url.toString() });
```

`navigator.share` is undefined on many desktop browsers. This will throw an unhandled error. Guard with `if (navigator.share) { ... } else { /* fallback */ }`.

---

### 5. **HIGH — Identical functions: `loadFromLocalDocument` ≡ `loadFromIndexedDB`**
postHelpers.ts

Both functions call `documentDB.getByID(documentId)`, check `document?.data`, then generate HTML from the first 3 children. The "local" fallback and "IndexedDB" fallback are the same code path, so step 3 in `loadThumbnailWithFallbacks` always repeats step 2 for no benefit.

---

### 6. **HIGH — Inconsistent status colors between `StatusActions` and `StatusToggle`**
StatusActions.tsx uses `#1976d2` (blue) for ACTIVE / `#2e7d32` (green) for DONE.
StatusToggle.tsx uses `#ff9800` (orange) for ACTIVE / `#9e9e9e` (grey) for DONE.

These are different color schemes for the same concept, violating consistency. Also, both hard-code hex instead of using theme tokens (violating DESIGN.md).

---

### 7. **MEDIUM — Memory leak: `URL.createObjectURL` never revoked**
BackgroundImageUploader.tsx

`URL.createObjectURL(file)` is called but `URL.revokeObjectURL()` is never called — not when the preview changes, not on unmount, and not on error reset. Each upload leaks a blob URL.

---

### 8. **MEDIUM — `useEffect` with missing/incorrect dependencies**
useEditDocumentForm.ts: Effect depends on `[userDocument, editDialogOpen]` but reads `name`, `handle`, `isPrivate`, `isPublished`, `isCollab`, `currentStatus`, `document`, `cloudDocument`, `resetValidation` — all missing. This violates the enforced `exhaustive-deps` rule.

usePostContent.ts: `loadContent` and `errorAnnounce` are referenced inside the effect but missing from deps. `loadContent` captures stale state.

---

### 9. **MEDIUM — Setting state in cleanup function**
usePostContent.ts

```ts
return () => {
  isMounted = false;
  setThumbnail(null);  // state update during unmount
  setIsLoading(false);
  setError(null);
};
```

Setting state in cleanup fires during unmount, which is the exact problem the `isMounted` flag is supposed to prevent. Remove these `setState` calls from cleanup.

---

### 10. **MEDIUM — Pervasive dead code from removed directory system**
Dozens of lines across many files are vestigial from a removed directory feature:

| File | Dead code |
|------|-----------|
| useBreadcrumbs.ts | Entire hook always returns `[]` |
| BrowserBreadcrumbs.tsx | Accepts `breadcrumbs` prop, ignores it (`_breadcrumbs`) |
| useDocumentFiltering.ts | Returns `directories: []` and `currentDirectory: null` always |
| useDocumentNavigation.ts | `createDirectory` does nothing but `console.warn` |
| Edit.tsx | `const isDirectory = false;` + dead conditional block |
| DeleteBoth.tsx | `const itemType = "Post";` with comment about no directories |

This is significant tech debt that adds cognitive load.

---

### 11. **MEDIUM — `@typescript-eslint/no-explicit-any` violations**
sortDocuments.ts: `compareObjectsByKey` takes `(objectA: any, objectB: any)`.
LoadingCard.tsx: `shimmerStyles: any`.

ESLint config bans `any`. These bypass type safety.

---

### 12. **MEDIUM — Over-engineered `ThumbnailCache` (232 lines)**
thumbnailCache.ts

A full LRU cache with TTL, memory budgeting, periodic cleanup intervals, and stats reporting — for storing a small number of HTML string previews. A simple `Map` with a size cap would suffice. The cache also leaks its `setInterval` if the module is ever unloaded.

---

### 13. **LOW — Bitwise flags for filter state**
FilterControl.tsx

Using `value ^ (1 << optionKey)` and `value & (1 << option.key)` for filter state is obscure and hard to maintain. A `Set<string>` of selected keys would be clearer and less error-prone.

---

### 14. **LOW — Unnecessary synthetic `MouseEvent` for download**
Download.tsx

Creates a synthetic `MouseEvent` and dispatches it. Just call `link.click()`.

---

### 15. **LOW — `uuid()` for ephemeral dialog button IDs**
DeleteBoth.tsx

Generates v4 UUIDs solely for confirmation dialog button identifiers that are compared once and discarded. Simple string constants would suffice.

---

### 16. **LOW — Unused `title` prop in `CardBase`**
CardBase.tsx

`title` is declared in the props interface but never used in the component body.

---

### 17. **LOW — Commented-out dead code**
usePostMeta.ts: `createAuthorChip(author, showAuthor)` is commented out but `author` is still in the deps array.
PostContent.tsx: A commented-out `<Chip>` block.

---

### 18. **LOW — Flawed perf-monitoring hook**
useDocumentGridPerformance.ts

Uses two `useEffect` calls (one without deps, one without deps) trying to measure render time. Effects run asynchronously after paint, so `startTime` and the measurement don't capture actual render duration — only the time between effects firing.

---

### 19. **LOW — Redundant upload guard split between options array and JSX**
ActionMenu.tsx

`"upload"` is pushed into `options` based on `isAuthor`, but the JSX render adds *additional* conditions (`isLocal && !isUpToDate`). These should be consolidated into the options computation for clarity.
