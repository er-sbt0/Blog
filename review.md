# Code Quality Review

**Date:** 2026-03-01
**Codebase:** blog-simple (Next.js 15 blog platform)
**Source files scanned:** 434

---

## Summary Metrics

| Metric | Count |
|---|---|
| `: any` type usages | 84 |
| Unsafe `as X` casts | 456 |
| `@ts-expect-error` / `@ts-ignore` | 17 |
| `eslint-disable` suppressions | 10 |
| API routes missing auth on write operations | 3 |
| `request.json()` calls without validation | 17 |
| Duplicated error response patterns | 78 |
| Silent `catch (e) {}` blocks | 2+ |
| TODO / FIXME comments | 10 |

---

## CRITICAL

### C1 — Unprotected write API routes

Three routes that mutate data or invoke paid external APIs have no authentication check whatsoever. Any anonymous HTTP client can call them.

**`src/app/api/completion/route.ts`** (entire file)
Accepts POST with `{ provider, model, prompt }` and proxies directly to Anthropic, Google, or Ollama. No session check. Anyone who can reach the server can consume API keys at will.

**`src/app/api/attachments/[filename]/route.ts`** (PUT handler, ~line 155)
Accepts PUT with `{ content: string }` and overwrites any file in `public/uploads/attachments/`. No auth check. The directory traversal guard (`..` check) is present but the endpoint is still open to the public.

**`src/app/api/embed/route.ts`** (entire file)
No authentication. Performs external fetch on behalf of the caller.

**Fix:** Add `getServerSession(authOptions)` at the top of each POST/PUT/DELETE handler. A shared `withAuth` wrapper would prevent this class of bug recurring.

---

### C2 — Silent error swallowing in the editor save path

**`src/components/EditDocument/Editor.tsx:129`**
```ts
try {
  const payload = JSON.parse(tags.values().next().value as string);
  if (payload.id === document.id) {
    Object.assign(updatedDocument, payload.partial);
  }
} catch (e) {}   // ← failure is silently ignored
debouncedUpdateLocalDocument(document.id, updatedDocument);
```
This is inside the auto-save handler. If the JSON parse fails, the document is saved with stale/wrong data and the user receives no feedback.

**`src/editor/plugins/ToolbarPlugin/index.tsx:226`**
```ts
} catch (e) {}   // ← revision save failure silently ignored
```
Same pattern in the revision-save path. A failure here means a revision the user thought was saved is silently dropped.

**Fix:** At minimum log the error. Ideally surface it to the user via the existing `actions.announce` mechanism.

---

## HIGH

### H1 — `src/store/app.ts` is a 1242-line god slice

The entire Redux state — documents, posts, series, UI, user — lives in one slice with 26 `createAsyncThunk` calls.

```
65:  export const load
77:  export const loadSession
108: export const loadLocalDocuments
161: export const loadCloudDocuments
189: export const getLocalStorageUsage
229: export const getCloudStorageUsage
254: export const getCloudDocumentThumbnail
279: export const getLocalDocument
304: export const getLocalRevision
326: export const getLocalDocumentRevisions
342: export const getCloudDocument
370: export const getCloudRevision
398: export const forkLocalDocument
441: export const forkCloudDocument
475: export const createLocalDocument
518: export const createLocalRevision
541: export const createCloudDocument
573: export const createCloudRevision
605: export const updateLocalDocument
654: export const updateCloudDocument
690: export const deleteLocalDocument
707: export const deleteLocalRevision
723: export const deleteCloudDocument
753: export const deleteCloudRevision
784: export const getDocumentById
```

Every local/cloud operation pair is implemented inline in the same file. The `extraReducers` section (lines 883–1242) handles all 50+ action cases in sequence with no grouping.

Additional problems:
- `documents` state and `posts` state partially overlap — no clear ownership boundary
- Any state update (even a UI toggle) triggers `extraReducers` evaluation for all 50 cases
- Impossible to code-split or lazy-load any slice of this

**Suggested split:**
- `src/store/slices/documentSlice.ts` — local document operations
- `src/store/slices/postSlice.ts` — cloud post operations
- `src/store/slices/seriesSlice.ts` — series operations
- `src/store/slices/uiSlice.ts` — drawer, diff, announcements
- `src/store/slices/userSlice.ts` — session and user profile

---

### H2 — `SideBar.tsx` is a 1247-line component with 34 hook calls

`src/components/Layout/SideBar.tsx` is a single component that implements:
- Document list with search (`activePostsSearch` state)
- Series tree with expand/collapse (`collapsedSeries` Set state)
- Rename-in-place (`renamingPostId`, `renameValue` state)
- Context menu (`contextMenu` state)
- Font size preference with localStorage persistence (`sidebarFontSize` state)
- All document/series action handlers (delete, fork, duplicate, move, archive…)
- Redux selectors for documents, series, user, UI state

34 hook calls in one component means 34 potential re-render triggers. Combined with no `React.memo` on child items (see H4), any keystroke in the search box re-renders the entire sidebar.

**Suggested split:**
- `<SidebarHeader>` — search input, font controls
- `<SeriesTree>` — collapsible series list with own expand state
- `<PostItem>` — memoized single post row with context menu
- `<SidebarActions>` — extracted action handlers as a custom hook

---

### H3 — Type system breakdown: `CloudDocument` / `UserDocument` / `EditorDocument`

The three core document types are not properly distinguished at component boundaries. Evidence:

**`src/components/BlogManager/index.tsx:43`**
```ts
} as any; // Cast to maintain compatibility during transition
```
```ts
(post.cloud as any)?.name        // line 91
(post.cloud as any)?.published   // line 92
(post.cloud as any)?.private     // line 95
(post.cloud as any)?.updatedAt   // line 100
```

**`src/components/PostsList/utils/seriesGrouping.ts:86`**
```ts
cloud: post as any, // Series posts are CloudDocument format
```

**`src/components/PostsList/hooks/usePostsFiltering.ts:24`**
```ts
cloud: post as any, // Series posts are CloudDocument format
```

**`src/components/DocumentCardNew/hooks/usePostState.ts:52`**
```ts
const cloudDoc = userDocument?.cloud as any; // TODO: Add proper Series type to UserDocument
```

**`src/components/EditDocument/Editor.tsx:157`** — 6 separate `as any` casts against `doc.data` because `EditorDocument.data` is typed too loosely to allow accessing `.root.children`.

The `as unknown as CloudDocument` pattern (found in 14 places across repositories and components) indicates the type at the definition site and the type at the callsite genuinely disagree, and the gap is being papered over rather than fixed.

**Root cause:** `UserDocument = { local?: EditorDocument, cloud?: CloudDocument }` is a hybrid that forces every consumer to defensively cast. The type for `CloudDocument.data` (Prisma `JsonValue`) is too broad to match `EditorDocument.data`.

**Fix:** Define a `SeriesPost` type distinct from `UserDocument`. Type the Prisma `data` field as `EditorDocumentData` using a branded type or Zod parse at the API boundary, so the rest of the app gets a typed value.

---

### H4 — Zero `React.memo` usage across all components

A grep for `React.memo` across `src/components/**/*.tsx` returns no matches. Every component re-renders on every parent render. Combined with the monolithic Redux slice (all state in one object), updating any document property triggers re-renders in every component that calls `useSelector`.

Most affected:
- `<PostCard>` / `<DocumentCardNew>` — rendered in long lists, no memoization
- `<SeriesCard>` — complex rendering, re-renders on every sidebar interaction
- `<SideBar>` child items — re-rendered on every search keystroke

---

### H5 — No API input validation

17 routes call `request.json()` and pass the result directly to Prisma or business logic with no structural validation.

Examples:
- `src/app/api/documents/route.ts` — `body.data` passed directly as `Prisma.JsonObject`
- `src/app/api/revisions/route.ts` — `body.data` passed as `Prisma.JsonObject`
- `src/app/api/series/[id]/posts/route.ts` — no validation on POST/PUT/DELETE body

If a client sends `{ "data": null }` or omits required fields, Prisma throws an uncontrolled error that leaks a stack trace in the 500 response.

**Fix:** Add Zod schemas at each route entry point. Parse with `schema.safeParse(await request.json())` and return 400 on failure.

---

### H6 — 78 copy-pasted error response blocks

Every API route implements its own `try/catch` with the same structure:
```ts
} catch (error) {
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

Problems:
- Adding structured error logging (e.g., Sentry, Datadog) requires touching 30+ files
- Error shape is inconsistent — some return `{ error: string }`, some return `{ error: { title, subtitle } }`, some return bare objects
- No way to distinguish Prisma constraint errors from unexpected exceptions

**Fix:** Create a shared `withApiHandler(handler)` wrapper or a typed `ApiError` class with a `.toResponse()` method.

---

### H7 — Inconsistent API response shapes

API responses have no consistent envelope. Examples:
- Notes canvas routes: `{ data: canvas }` with error `{ error: { title, subtitle } }`
- Series routes: bare `{ series }` on success, `{ error: string }` on failure
- Document routes: `{ document }` on success
- Attachment route: `{ success: true, size, filename }` on success

The symptom: `src/components/Home/ReadmeViewer.tsx:109`:
```ts
if (!docData.data?.data?.root || !docData.data?.cloudDocument)
```
`data.data.data` — three levels of nesting because the HTTP response wrapper, the API response wrapper, and the document data field are all named `data`.

---

## MEDIUM

### M1 — `useNotesStore.ts` duplicates debounce utility with `any` typing

`src/hooks/useNotesStore.ts:9`
```ts
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
```
```ts
const apiUpdates: any = {};   // line 181
```

A debounce utility is inlined in a hook file instead of coming from a shared util or library. The internal `apiUpdates` variable is typed as `any` — this is the object sent to the PATCH API, so the actual payload structure is invisible to TypeScript.

---

### M2 — `@ts-expect-error` cluster in MathNode

`src/editor/nodes/MathNode/mathVirtualKeyboard.ts` has 14 consecutive `@ts-expect-error` directives (lines 8–124) suppressing MathLive integration types.

This is integration/vendor code so some suppression is expected. However, the suppressions should be consolidated into a `.d.ts` declaration file for the MathLive global rather than scattered inline.

---

### M3 — `as unknown as X` double-cast pattern (14 occurrences)

The double-cast `value as unknown as TargetType` is TypeScript's escape hatch for when the source and target types share no overlap. Each occurrence represents a place where the actual runtime type is not reflected in the declared type.

Key instances:
- `src/repositories/post.ts` — `} as unknown as CloudDocument` (repository return type mismatch)
- `src/repositories/revision.ts` — `revision.data as unknown as EditorDocumentRevision["data"]`
- `src/components/EditDocument/EditRevisionCard.tsx` — `cloudRevision as unknown as CloudDocumentRevision` (3 occurrences)
- `src/components/PostsList/utils/seriesGrouping.ts` — `} as unknown as T`

---

### M4 — Floating dispatches in React effects

Several `useEffect` hooks call async Redux thunks without awaiting or handling rejection:

**`src/components/Layout/TopAppBar.tsx:41`**
```ts
if (!initialized) dispatch(actions.load());  // fire and forget
```

**`src/components/Dashboard.tsx:51`**
```ts
dispatch(actions.getLocalStorageUsage()).then((response) => { ... });
// .catch() not present — rejection unhandled
```

If these thunks reject (e.g., IndexedDB unavailable, network offline), the error is silently discarded.

---

### M5 — Missing `React.memo` on list item components

**`src/components/DocumentCardNew/index.tsx`** and **`src/components/DocumentCardNew/PostCard.tsx`** are rendered in potentially long lists but are not memoized. Every sidebar search keystroke or any Redux state update causes all cards to re-render.

Same issue in `src/components/SeriesCard/variants/CompactVariant.tsx` (484 lines, renders in grid views).

---

### M6 — `src/hooks/useNotesBoards.ts` and `useNotesStore.ts` are parallel state managers

`useNotesBoards.ts` (185 lines) manages the list of boards. `useNotesStore.ts` (331 lines) manages a single canvas with its notes. Both fetch from the same `/api/notes` prefix, both manage loading/error state independently, both are used together in `NotesCanvas`.

There is no shared caching — switching boards re-fetches even if the data was loaded moments ago. This is a candidate for RTK Query or SWR.

---

## LOW

### L1 — TODO / FIXME comments (10 items)

| File | Line | Comment |
|---|---|---|
| `src/components/DocumentCardNew/hooks/usePostState.ts` | 52 | `TODO: Add proper Series type to UserDocument` |
| `src/components/PostsList/hooks/usePostsSearch.ts` | 54 | `TODO: Search in post content` |
| `src/editor/nodes/ImageNode/ImageComponent.tsx` | 161 | `TODO This is just a temporary workaround for FF` |
| `src/editor/plugins/TablePlugin/LexicalTablePluginHelpers.ts` | 80, 89, 116, 140 | 4× future tbody/thead support notes |
| `src/editor/plugins/MarkdownPlugin/MarkdownTransformers.tsx` | 222, 701 | `TODO: should be an option`, `TODO: Get rid of isImport flag` |
| `src/editor/utils/url.ts` | 34 | `TODO Fix UI for link insertion` |

---

### L2 — Inconsistent React import style

Some files use `import * as React from "react"` (namespace import) while the majority use named imports. The namespace import style is unnecessary in React 17+ with the automatic JSX transform.

Files still using namespace import: `NewDocument.tsx`, `CreatePostDrawer/index.tsx`, `EditRevisionCard.tsx`, `SeriesView/index.tsx`, `DocumentCardNew/PostCard.tsx`, and others (~15 files).

---

### L3 — `SideBar.tsx` font size stored in ephemeral state

`src/components/Layout/SideBar.tsx:140`
```ts
const [sidebarFontSize, setSidebarFontSize] = useState<number>(() => {
  // reads from localStorage on init
});
```

The font size is initialized from `localStorage` but mutations go through local `useState`. This means the preference is read once at mount but any other tab or page navigation resets the component. The preference should either be in a persistent Redux slice (with rehydration) or managed purely in localStorage via a hook.

---

### L4 — `inline style` objects recreated on every render

27 `style={{ ... }}` inline object literals found in components. Each creates a new object reference on every render, defeating React's shallow-equality bailout. These should be `const` declarations outside the render function or replaced with CSS class names.

---

## Refactor Priority Order

| # | Action | Severity | Effort |
|---|---|---|---|
| 1 | Add `getServerSession` auth to `/api/completion`, `/api/attachments` PUT, `/api/embed` | Critical | Low |
| 2 | Replace `catch (e) {}` in Editor.tsx and ToolbarPlugin with error handling | Critical | Low |
| 3 | Define typed `SeriesPost`, fix `CloudDocument.data` typing, remove `as any` in BlogManager/PostsList | High | Medium |
| 4 | Split `src/store/app.ts` into per-domain slices | High | High |
| 5 | Break `SideBar.tsx` into focused sub-components | High | Medium |
| 6 | Create shared `withApiHandler` / `ApiError` for API routes | High | Medium |
| 7 | Add Zod schemas to all API routes that call `request.json()` | High | Medium |
| 8 | Add `React.memo` to list item components (`PostCard`, `SeriesCard`) | Medium | Low |
| 9 | Consolidate notes state management (`useNotesBoards` + `useNotesStore`) | Medium | Medium |
| 10 | Standardize API response envelope (`{ data, error }`) | Medium | High |
