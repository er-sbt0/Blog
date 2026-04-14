Read [](file:///home/eransa/code/blog-simple/.github/instructions/env.instructions.md)

Read [](file:///home/eransa/code/blog-simple/DESIGN.md#1-1), lines 1 to 50

Created 7 todos

Let me start by examining the core files in parallel to get a broad picture of the codebase. 

Ran terminal command:  wc -l /home/eransa/code/blog-simple/src/store/app.ts

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#1-1), lines 1 to 120

Read [](file:///home/eransa/code/blog-simple/src/repositories)

Read [](file:///home/eransa/code/blog-simple/src/app/api)

Read [](file:///home/eransa/code/blog-simple/src/components)

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#120-120), lines 120 to 300

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#300-300), lines 300 to 600

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#600-600), lines 600 to 900

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#900-900), lines 900 to 1291

Starting: *Review repositories layer* (2/7)

Now let me examine repositories, API routes, key components, and other areas in parallel using sub-agents for efficiency. 

Review repositories layer

Read [](file:///home/eransa/code/blog-simple/.github/instructions/env.instructions.md)

Ran terminal command:  wc -l /home/eransa/code/blog-simple/src/repositories/*.ts

Read [](file:///home/eransa/code/blog-simple/src/repositories/document.ts#1-1), lines 1 to 399

Read [](file:///home/eransa/code/blog-simple/src/repositories/series.ts#1-1), lines 1 to 463

Read [](file:///home/eransa/code/blog-simple/src/repositories/revision.ts#1-1), lines 1 to 65

Read [](file:///home/eransa/code/blog-simple/src/repositories/user.ts#1-1), lines 1 to 34

Read [](file:///home/eransa/code/blog-simple/src/repositories/notes.ts#1-1), lines 1 to 289

Searched for files matching `**/src/repositories/post*`, no matches

Review API routes and middleware

Read [](file:///home/eransa/code/blog-simple/.github/instructions/env.instructions.md)

Read [](file:///home/eransa/code/blog-simple/src/middleware.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/utils.ts)

Searched for files matching `**/src/app/api/**/route.ts`, 32 matches

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/%5Bid%5D/status/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/new/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/update-times/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/check/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/%5Bid%5D/attachments/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/%5Bid%5D/background/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/series/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/series/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/series/%5Bid%5D/posts/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/series/available-posts/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/revisions/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/revisions/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/users/%5Bid%5D/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/users/check/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/series/%5Bid%5D/posts/route.ts#100-100), lines 100 to 257

Read [](file:///home/eransa/code/blog-simple/src/app/api/users/%5Bid%5D/route.ts#100-100), lines 100 to 125

Read [](file:///home/eransa/code/blog-simple/src/app/api/notes/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/notes/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/notes/%5Bid%5D/bring-to-front/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/notes/canvas/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/notes/canvas/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/completion/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/lib/api-utils.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/auth/%5B...nextauth%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/revalidate/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/usage/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/embed/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/export/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/import/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/thumbnails/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/export/route.ts#100-100), lines 100 to 219

Read [](file:///home/eransa/code/blog-simple/src/app/api/import/route.ts#100-100), lines 100 to 284

Read [](file:///home/eransa/code/blog-simple/src/app/api/docx/%5Bid%5D/route.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/attachments/%5Bfilename%5D/route.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/app/api/attachments/%5Bfilename%5D/content/route.ts#1-1), lines 1 to 100

Searched for files matching `**/src/app/api/documents/utils.ts`, 1 match

Searched for files matching `**/src/app/api/users/utils.ts`, 1 match

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/utils.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/users/utils.ts)

Read [](file:///home/eransa/code/blog-simple/src/app/api/attachments/%5Bfilename%5D/route.ts#100-100), lines 100 to 200

Read [](file:///home/eransa/code/blog-simple/src/app/api/attachments/%5Bfilename%5D/content/route.ts#100-100), lines 100 to 221

Read [](file:///home/eransa/code/blog-simple/src/app/api/documents/%5Bid%5D/attachments/route.ts#95-95), lines 95 to 104

Review components and editor

Read [](file:///home/eransa/code/blog-simple/.github/instructions/env.instructions.md)

Ran terminal command:  find /home/eransa/code/blog-simple/src/components/ -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | head -16

Ran terminal command:  find /home/eransa/code/blog-simple/src/editor/ -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | head -11

Ran terminal command:  find /home/eransa/code/blog-simple/src/store/ -name '*.ts' | xargs wc -l | sort -rn | head -6

Read [](file:///home/eransa/code/blog-simple/src/components/posts/components/SeriesGroupCard.tsx#1-1), lines 1 to 423

Read [](file:///home/eransa/code/blog-simple/src/components/shared/EditorSkeleton.tsx#1-1), lines 1 to 397

Read [](file:///home/eransa/code/blog-simple/src/components/NotesCanvas/DraggableNote.tsx#1-1), lines 1 to 389

Read [](file:///home/eransa/code/blog-simple/src/components/EditDocument/EditRevisionCard.tsx#1-1), lines 1 to 366

Read [](file:///home/eransa/code/blog-simple/src/components/NotesCanvas/BoardSelector.tsx#1-1), lines 1 to 338

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/MarkdownPlugin/MarkdownTransformers.tsx#1-1), lines 1 to 600

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx#1-1), lines 1 to 500

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx#1-1), lines 1 to 400

Read [](file:///home/eransa/code/blog-simple/src/types.ts#1-1), lines 1 to 200

Read [](file:///home/eransa/code/blog-simple/src/api/client.ts#1-1), lines 1 to 200

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/MarkdownPlugin/MarkdownTransformers.tsx#601-601), lines 601 to 1132

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx#501-501), lines 501 to 944

Read [](file:///home/eransa/code/blog-simple/src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx#401-401), lines 401 to 667

Read [](file:///home/eransa/code/blog-simple/src/types.ts#201-201), lines 201 to 327

Read [](file:///home/eransa/code/blog-simple/src/api/client.ts#201-201), lines 201 to 398

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#1-1), lines 1 to 150

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#151-151), lines 151 to 400

Read [](file:///home/eransa/code/blog-simple/src/api)

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#401-401), lines 401 to 700

Read [](file:///home/eransa/code/blog-simple/src/api/types.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#701-701), lines 701 to 1000

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#1001-1001), lines 1001 to 1291

Ran terminal command:  grep -rn 'as any' src/components/ src/editor/ src/store/ --include='*.ts' --include='*.tsx' | head -30

Ran terminal command:  grep -rn 'action\.payload as {' src/store/ --include='*.ts' | wc -l

Ran terminal command:  grep -rn 'React\.memo\|memo(' src/components/ --include='*.tsx' | wc -l && echo "---" && grep -rn 'useCallback\|useMemo' src/components/ --include='*.tsx' | wc -l && echo "---" && find src/components/ -name '*.tsx' | wc -l

Ran terminal command:  grep -rn 'ErrorBoundary\|error.boundary\|errorboundary' src/ --include='*.tsx' --include='*.ts' -i | head -10

Ran terminal command:  grep -rn 'Something went wrong' src/store/app.ts | wc -l

Ran terminal command:  grep -rn 'console\.error' src/store/app.ts | wc -l

Ran terminal command:  grep -rn 'useSelector' src/components/EditDocument/EditRevisionCard.tsx | wc -l

Review indexeddb, hooks, store thunks

Read [](file:///home/eransa/code/blog-simple/.github/instructions/env.instructions.md)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb)

Read [](file:///home/eransa/code/blog-simple/src/store)

Read [](file:///home/eransa/code/blog-simple/src/hooks)

Read [](file:///home/eransa/code/blog-simple/src/contexts)

Read [](file:///home/eransa/code/blog-simple/src/shared)

Read [](file:///home/eransa/code/blog-simple/src/utils)

Read [](file:///home/eransa/code/blog-simple/src/store/thunks)

Read [](file:///home/eransa/code/blog-simple/src/store/app)

Read [](file:///home/eransa/code/blog-simple/src/store/selectors)

Read [](file:///home/eransa/code/blog-simple/src/utils/posts)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/idb.ts#1-1), lines 1 to 200

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/index.ts)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/interfaces.ts)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/utils.ts)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/constants.ts)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/LICENSE)

Read [](file:///home/eransa/code/blog-simple/src/indexeddb/idb.ts#200-200), lines 200 to 373

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#1-1), lines 1 to 500

Read [](file:///home/eransa/code/blog-simple/src/store/index.ts#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/store/StoreProvider.tsx)

Read [](file:///home/eransa/code/blog-simple/src/store/thunks/exportThunks.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/thunks/seriesThunks.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#500-500), lines 500 to 1000

Read [](file:///home/eransa/code/blog-simple/src/store/thunks/userThunks.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/app/duplicateDocument.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/selectors/layoutSelectors.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/selectors/postsSelectors.ts)

Read [](file:///home/eransa/code/blog-simple/src/store/app.ts#1000-1000), lines 1000 to 1291

Read [](file:///home/eransa/code/blog-simple/src/contexts/DocumentURLContext.tsx)

Read [](file:///home/eransa/code/blog-simple/src/contexts/DragContext.tsx)

Read [](file:///home/eransa/code/blog-simple/src/contexts/FloatingActionsContext.ts)

Read [](file:///home/eransa/code/blog-simple/src/contexts/NotesClipboardContext.tsx)

Read [](file:///home/eransa/code/blog-simple/src/contexts/SidebarWidthContext.tsx#1-1), lines 1 to 100

Read [](file:///home/eransa/code/blog-simple/src/contexts/SidebarWidthContext.tsx#100-100), lines 100 to 139

Ran terminal command:  wc -l /home/eransa/code/blog-simple/src/hooks/*.ts | sort -rn | head -20

Read [](file:///home/eransa/code/blog-simple/src/hooks/useNotesStore.ts#1-1), lines 1 to 334

Read [](file:///home/eransa/code/blog-simple/src/hooks/useNotesBoards.ts#1-1), lines 1 to 185

Read [](file:///home/eransa/code/blog-simple/src/hooks/useTimeEditing.ts#1-1), lines 1 to 106

Read [](file:///home/eransa/code/blog-simple/src/hooks/useBlog.ts#1-1), lines 1 to 104

Read [](file:///home/eransa/code/blog-simple/src/hooks/useExportImportActions.ts#1-1), lines 1 to 93

Ran terminal command:  wc -l /home/eransa/code/blog-simple/src/shared/*.ts /home/eransa/code/blog-simple/src/utils/*.ts /home/eransa/code/blog-simple/src/utils/posts/*.ts 2>/dev/null | sort -rn | head -20

Read [](file:///home/eransa/code/blog-simple/src/utils/languageDetection.ts#1-1), lines 1 to 414

Read [](file:///home/eransa/code/blog-simple/src/utils/posts/seriesGrouping.ts#1-1), lines 1 to 355

Read [](file:///home/eransa/code/blog-simple/src/utils/posts/dateHelpers.ts#1-1), lines 1 to 152

Read [](file:///home/eransa/code/blog-simple/src/utils/migrateNotes.ts#1-1), lines 1 to 130

Read [](file:///home/eransa/code/blog-simple/src/utils/posts/timeGrouping.ts#1-1), lines 1 to 119

Read [](file:///home/eransa/code/blog-simple/src/hooks/useAsyncEffect.ts#1-1), lines 1 to 40

Read [](file:///home/eransa/code/blog-simple/src/hooks/useAsyncOp.ts#1-1), lines 1 to 33

Read [](file:///home/eransa/code/blog-simple/src/hooks/useLocalStorage.ts#1-1), lines 1 to 42

Read [](file:///home/eransa/code/blog-simple/src/hooks/useDocuments.ts#1-1), lines 1 to 56

Read [](file:///home/eransa/code/blog-simple/src/hooks/useErrorAnnounce.ts#1-1), lines 1 to 37

Read [](file:///home/eransa/code/blog-simple/src/store/index.ts#95-95), lines 95 to 111

Starting: *Compile findings report* (7/7)

Completed: *Compile findings report* (7/7)

# Code Smells & Anti-Patterns Report — Ranked by Severity

---

## CRITICAL

### 1. Security: Unauthenticated Mutable Endpoints
- **Attachment PUT** ([src/app/api/attachments/[filename]/route.ts](src/app/api/attachments/%5Bfilename%5D/route.ts)) — **zero auth check**. Anyone can overwrite files on disk.
- **AI Completion** (route.ts) — no auth. Public internet can burn through your Anthropic/Google API keys.
- **Notes PATCH/DELETE** ([src/app/api/notes/[id]/route.ts](src/app/api/notes/%5Bid%5D/route.ts)) — authenticated, but **no ownership check** — any logged-in user can edit/delete other users' notes.
- **Revision GET** ([src/app/api/revisions/[id]/route.ts](src/app/api/revisions/%5Bid%5D/route.ts)) — no auth. Full private document content exposed to anyone with a revision ID.

### 2. Security: Stored XSS via File Upload
[src/app/api/documents/[id]/attachments/route.ts](src/app/api/documents/%5Bid%5D/attachments/route.ts) accepts arbitrary file extensions (`.html`, `.svg`). Combined with the unauthenticated attachment GET, an attacker can upload malicious HTML/SVG and serve it from your domain.

### 3. God File: app.ts (1,291 lines)
A single slice file containing ~25 async thunks, all reducers, and all `extraReducers`. The string `"Something went wrong"` appears **44 times** via an identical try/catch pattern repeated in every thunk. `toErrorMessage()` is duplicated in **4 files**. This is the single biggest maintainability bottleneck — any change risks breaking unrelated features.

### 4. IndexedDB Connection Leak
Every operation in idb.ts opens a **new** `IDBOpenDBRequest` and never closes it. Over a long session, this accumulates open connections. Additionally, `patch()` reads then writes in **separate transactions** (TOCTOU race), and `waitUntil()` in utils.ts rejects with the literal string `"your error msg"` — a copy-paste leftover that surfaces to users.

### 5. `alert` Thunk Hangs Forever
userThunks.ts line 43–63: The `alert` thunk resolves by attaching a global `document.addEventListener("click")` that inspects MUI dialog DOM structure. If the dialog is never clicked, **the thunk never resolves** — a memory/state leak. It also couples Redux to DOM structure, breaking on any MUI upgrade.

---

## HIGH

### 6. No Input Validation Anywhere
Zero use of Zod, Yup, or any schema validation. API routes cast `await request.json()` directly to TypeScript types. Examples:
- `parseInt(searchParams.get("limit")!)` with no NaN/bounds check (route.ts)
- `body` cast to `DocumentUpdateInput` with no field validation ([src/app/api/documents/[id]/route.ts](src/app/api/documents/%5Bid%5D/route.ts))
- `provider` directly cast to `AIProviderType` from unvalidated body

### 7. Repository Layer: Duplicated Queries & Wasted DB Round-Trips
- **~250 lines of copy-pasted select objects** in series.ts — the same 50-line post select is duplicated 5 times.
- **Double-fetch after write**: `createDocument` → `findDocument`, `updateDocument` → `findDocument`, `createSeries` → `findSeriesById`. Every write is followed by a full re-read.
- **Wasted query** in `findDocument` (document.ts line 130–134): a `findFirst` DB call whose result is **never used**.
- **`as unknown as` double-casts** bypass type safety in document.ts.

### 8. Missing Memoization → Unnecessary Re-renders
- **`useBlog` hook** (useBlog.ts line 18–28): `useSelector` with inline `.filter()` creates a new array every render, defeating React-Redux equality checks. Should use `createSelector`.
- **`DragContext`** (DragContext.tsx): value object not wrapped in `useMemo` — every consumer re-renders on every parent render.
- **`EditRevisionCard`** (EditRevisionCard.tsx): 6 async handler functions with **zero `useCallback`**, plus 15+ unmemoized derived booleans. Wrapped in `memo()` but the props include these unstable references, defeating memoization.

### 9. Module-Scope Singleton Store
index.ts exports `const store = configureStore(...)` at module level. In Next.js SSR, this means **all concurrent requests share the same store instance** — a data leak between users.

### 10. Auth Boilerplate Duplication & Inconsistency
The same 4-line auth pattern appears in **23+ handlers** (`getServerSession` → check `!session` → check `user.disabled`). But some routes check `!session`, others check `!session?.user`, and several skip auth entirely. A single `requireAuth()` utility would fix both duplication and inconsistency.

---

## MEDIUM

### 11. Self-Fetch Anti-Pattern
utils.ts: `getRevisionHtml` makes the server **HTTP-fetch itself** (`fetch(\`${PUBLIC_URL}/api/embed\``)) instead of calling the function directly. Adds latency, fails during build/SSG.

### 12. Debounced API Calls Not Cancelled on Unmount
useNotesStore.ts: debounced `setTimeout` for note updates is never cleaned up — state-update-after-unmount bugs.

### 13. N+1 Queries & Missing Pagination
- route.ts: individual `findUnique` + `update` per document in `Promise.all`.
- `findAllSeries`, `findAllDocuments` return **unbounded** result sets with no pagination.
- `loadLocalDocuments` (app.ts line 130) loads **all revisions** into memory, then filters per document — O(n × m).

### 14. Dead Code
- **Entire background route** ([src/app/api/documents/[id]/background/route.ts](src/app/api/documents/%5Bid%5D/background/route.ts)) — throws unconditionally at line 58; ~50 lines of unreachable code after it.
- **`TransactionOptions` interface** in interfaces.ts — unused.
- **Empty middleware** (middleware.ts) — no-op pass-through.

### 15. `force-dynamic` on Every Route
Every single API route exports `export const dynamic = "force-dynamic"`, defeating Next.js caching on public read-only routes (series list, user profile, thumbnails, embed).

### 16. Incorrect ISO Week Calculation
dateHelpers.ts line 56–67: `getWeekKey` uses a naive week algorithm instead of ISO 8601 week numbering. `date-fns` (already a dependency) has a correct `getISOWeek`.

### 17. Editor Performance
- **AITools** (AITools.tsx): creates a new `createHeadlessEditor` on every streaming chunk. 5 identical AI action handlers duplicated verbatim.
- **TableTools** (TableTools.tsx): 14 inline SVG icon components + missing `useCallback` on most handlers.
- **DraggableNote** (DraggableNote.tsx): mounts a **full Lexical editor per note**. 20 notes = 20 editor instances with no virtualization.

---

## LOW

### 18. Inconsistent Response Shapes
API responses alternate between `{ data }`, `{ success, data }`, `{ success, message, results }`, `{ revalidated, now }` — no standard envelope.

### 19. HTTP Semantics
- DELETE with request body ([src/app/api/series/[id]/posts/route.ts](src/app/api/series/%5Bid%5D/posts/route.ts))
- GET with side effects (revalidate endpoint)

### 20. Type System Weaknesses
- `LocalDocumentRevision = Partial<EditorDocumentRevision>` — makes everything optional, allowing revisions with no ID.
- ~20 API response types in types.ts all duplicate `{ data?: T; error?: { title; subtitle? } }` — should be a generic `ApiResponse<T>`.
- `coauthor.id` comparison typed as `any` in the documents PATCH route.

---

**Recommended triage**: items 1–2 (security) and 5 (hanging thunk) are the highest-impact fixes for the least effort. Items 3, 6, and 7 (god file, validation, repository duplication) are the biggest long-term maintainability wins.