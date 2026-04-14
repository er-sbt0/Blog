## Code Review: Smells & Anti-Patterns (sorted by severity)

### 1. **CRITICAL — XSS via `dangerouslySetInnerHTML`**

PostThumbnail.tsx

The regex-based "sanitization" (replacing `<a` → `<span>`, `<script` → `<span>`)
is trivially bypassed. Vectors like `<img onerror="alert(1)">`,
`<svg onload="...">`, `<iframe>`, `<style>`, event attributes on any tag,
`javascript:` URLs, etc. are all unblocked. Use a proper HTML sanitizer (e.g.
DOMPurify).

---

### 2. **HIGH — `isAuthor` check is a truthy object, not a boolean comparison**

StatusActions.tsx

```ts
const isAuthor = cloudDocument ? cloudDocument.author : true;
```

This evaluates to the author **object** (always truthy), not a proper ownership
check. Compare with the correct pattern used everywhere else:
`cloudDocument.author.id === user?.id`. This means non-authors can change
document status.

---

### 4. **HIGH — `navigator.share()` called without feature detection**

useShareDocument.ts

```ts
await navigator.share({ title: name, url: url.toString() });
```

`navigator.share` is undefined on many desktop browsers. This will throw an
unhandled error. Guard with
`if (navigator.share) { ... } else { /* fallback */ }`.

---

### 8. **MEDIUM — `useEffect` with missing/incorrect dependencies**

useEditDocumentForm.ts: Effect depends on `[userDocument, editDialogOpen]` but
reads `name`, `handle`, `isPrivate`, `isPublished`, `isCollab`, `currentStatus`,
`document`, `cloudDocument`, `resetValidation` — all missing. This violates the
enforced `exhaustive-deps` rule.

usePostContent.ts: `loadContent` and `errorAnnounce` are referenced inside the
effect but missing from deps. `loadContent` captures stale state.

---

### 11. **MEDIUM — `@typescript-eslint/no-explicit-any` violations**

sortDocuments.ts: `compareObjectsByKey` takes `(objectA: any, objectB: any)`.
LoadingCard.tsx: `shimmerStyles: any`.

ESLint config bans `any`. These bypass type safety.

---

### 12. **MEDIUM — Over-engineered `ThumbnailCache` (232 lines)**

thumbnailCache.ts

A full LRU cache with TTL, memory budgeting, periodic cleanup intervals, and
stats reporting — for storing a small number of HTML string previews. A simple
`Map` with a size cap would suffice. The cache also leaks its `setInterval` if
the module is ever unloaded.


