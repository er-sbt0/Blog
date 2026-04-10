# Series → Document Hierarchy Refactor

## Decision Summary

**Verdict: Option A** — collapse the `Series` table into `Document` by adding `SERIES` to the
`DocumentType` enum and using the existing `parentId` FK for membership.

Rationale:
- `Series` is structurally identical to `Document` minus content fields — the separation
  was always redundant
- `parentId` has never been wired up in application code (all queries hardcode `parentId:
  null`; `DocumentBrowser` ignores it entirely) — it is schema-only dead code with zero live
  rows
- Unifying under `Document` gives series capabilities the old table lacked: rich Lexical
  content (`head`), custom slug (`handle`), cover image (`background_image`), published/private
  flag, forks, co-authors
- The `type` discriminant cleanly expresses what a document *is*; `parent.type = SERIES`
  defines the relationship semantics without a new FK

---

## Phase 1 — Prisma Schema

### 1.1  Edit `prisma/schema.prisma`

**`DocumentType` enum** — add `SERIES`:

```prisma
enum DocumentType {
  DOCUMENT
  SERIES
}
```

**`Document` model** — remove series columns and legacy sort_order, add `position`:

Remove:
- `seriesId    String? @db.Uuid`
- `seriesOrder Int?`
- `sort_order  Int?`  (labeled "legacy, may be removed")
- `series    Series? @relation("SeriesPosts", ...)`
- `@@index([seriesId])`
- `@@index([seriesId, seriesOrder])`

Add:
- `position   Int?    // order among siblings within parent container`
- `@@index([parentId])`
- `@@index([parentId, position])`

The `parentId / parent / children` self-referential relation is already present — no change.

**Remove the `Series` model entirely.**

**`User` model** — remove `series Series[]` relation (it references the dropped table).

Final `Document` field order (for clarity):

```prisma
model Document {
  id               String         @id @default(uuid()) @db.Uuid
  handle           String?        @unique
  name             String
  description      String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  authorId         String         @db.Uuid
  published        Boolean        @default(false)
  private          Boolean        @default(false)
  head             String?        @db.Uuid
  collab           Boolean        @default(false)
  status           DocumentStatus @default(ACTIVE)
  background_image String?
  type             DocumentType

  // Ordering within parent container
  position         Int?

  // Hierarchical / container relationship
  parentId         String?    @db.Uuid
  parent           Document?  @relation("DocumentHierarchy", fields: [parentId], references: [id])
  children         Document[] @relation("DocumentHierarchy")

  // Fork relationship
  baseId           String?    @db.Uuid
  base             Document?  @relation("BaseForks", fields: [baseId], references: [id])
  forks            Document[] @relation("BaseForks")

  // Relations
  author    User                @relation(fields: [authorId], references: [id], onDelete: Cascade)
  coauthors DocumentCoauthors[]
  revisions Revision[]

  @@index([authorId, published])
  @@index([published, type])
  @@index([parentId])
  @@index([parentId, position])
}
```

---

### 1.2  Generate the migration

```bash
npx prisma migrate dev --name collapse_series_into_documents
```

Prisma will emit a `.sql` file. **Before applying**, manually edit it to insert the data
migration SQL (Prisma cannot generate this automatically):

```sql
-- Step 1: add SERIES to enum (Prisma generates this)
ALTER TYPE "DocumentType" ADD VALUE 'SERIES';

-- Step 2: create a Document row for every existing Series
-- (preserves all IDs so existing /posts/[id] URLs continue to work)
INSERT INTO "Document" (
  id, name, description, "authorId",
  "createdAt", "updatedAt",
  type, published, private, collab,
  status
)
SELECT
  id, title, description, "authorId",
  "createdAt", "updatedAt",
  'SERIES'::"DocumentType", false, false, false,
  'ACTIVE'::"DocumentStatus"
FROM "Series";

-- Step 3: migrate membership — copy seriesId → parentId, seriesOrder → position
UPDATE "Document"
SET "parentId" = "seriesId",
    position   = COALESCE("seriesOrder", "sort_order")
WHERE "seriesId" IS NOT NULL;

-- Step 4: for documents that had only sort_order (no seriesId), preserve position
UPDATE "Document"
SET position = "sort_order"
WHERE "seriesId" IS NULL AND "sort_order" IS NOT NULL;

-- Step 5: drop columns and table (Prisma generates column drops, but add table drop)
ALTER TABLE "Document" DROP COLUMN "seriesId";
ALTER TABLE "Document" DROP COLUMN "seriesOrder";
ALTER TABLE "Document" DROP COLUMN "sort_order";
DROP TABLE "Series";
-- Also drop the Series-related index on User if Prisma doesn't catch it
```

After editing the SQL file:

```bash
npx prisma migrate deploy   # applies the edited migration
npx prisma generate         # regenerates client
```

---

## Phase 2 — TypeScript Types (`src/types.ts`)

### Remove
- `Series` type
- `SeriesCreateInput` type
- `SeriesUpdateInput` type
- `PostCreateInput` / `PostUpdateInput` (unused leftover wrappers that duplicate Document inputs)
- `GetPostsResponse` / `PostPostsResponse` / `GetPostResponse` (unused, wraps UserDocument)

### Update `EditorDocument`
- Remove `seriesId?: string`
- Remove `seriesOrder?: number`
- Add `position?: number`
- `parentId` is likely already present; confirm it is

### Update `Document`
- Remove `seriesId?: string`
- Remove `seriesOrder?: number`
- Remove `series?: Series`
- Add `position?: number`
- Ensure `children?: Document[]` is present

### Update `DocumentCreateInput` / `DocumentUpdateInput`
- Remove `seriesId` / `seriesOrder` fields
- Add `position?: number`
- Ensure `parentId?: string` is present
- Add `type?: DocumentType` to create input (so SERIES documents can be created)

### Add
```typescript
export type DocumentType = "DOCUMENT" | "SERIES";
```
(or import from Prisma client once `@prisma/client` is regenerated)

---

## Phase 3 — Repositories (`src/repositories/`)

### 3.1  Delete `src/repositories/series.ts` entirely

### 3.2  Update `src/repositories/post.ts`

**`documentCoreSelect`** — remove `seriesId`, `seriesOrder`; add `position`, `parentId`:
```typescript
const documentCoreSelect = {
  id: true, handle: true, name: true, description: true,
  createdAt: true, updatedAt: true, published: true, collab: true,
  private: true, baseId: true, head: true, type: true, status: true,
  background_image: true,
  position: true,   // ← replaces seriesOrder
  parentId: true,   // ← replaces seriesId
};
```

**`createPost`** — remove the `parentId: null` hardcode; allow it to be passed from caller.

**Add new functions** that replace the series repository functions:

```typescript
/** Fetch a SERIES-type document with its children ordered by position */
findContainerDocument(id: string): Promise<Document | null>

/** Author's DOCUMENT-type posts with no parent (available to add to a container) */
getAvailableChildPosts(authorId: string): Promise<Document[]>

/** Add a post to a container (set parentId + position) */
addPostToContainer(containerId: string, postId: string, position: number): Promise<void>

/** Remove a post from its container (set parentId = null, position = null) */
removePostFromContainer(postId: string): Promise<void>

/** Batch add/remove posts from a container (single transaction) */
batchUpdateContainerChildren(
  containerId: string,
  postsToAdd: { postId: string; position: number }[],
  postsToRemove: string[]
): Promise<void>

/** Reorder children within a container */
updateContainerChildOrder(
  containerId: string,
  postOrders: { postId: string; position: number }[]
): Promise<void>
```

---

## Phase 4 — API Routes

### 4.1  Delete `src/app/api/series/` directory entirely (6 route files)

### 4.2  Update `src/app/api/documents/route.ts`
- `POST` handler: accept `type` in body (defaults to `DOCUMENT`; allows creating `SERIES`)
- Remove `seriesId`/`seriesOrder` from accepted body fields; accept `parentId`, `position`

### 4.3  Update `src/app/api/documents/[id]/route.ts`
- `PATCH` handler: remove `seriesId`/`seriesOrder`; ensure `parentId`, `position` are accepted
- Replace `revalidatePath('/series/${seriesId}')` → `revalidatePath('/posts/${parentId}')` (when parentId present)

### 4.4  Add `src/app/api/documents/[id]/children/route.ts`

```
GET    → findContainerDocument(id).children ordered by position
POST   → addPostToContainer(id, postId, position)
PATCH  → batchUpdateContainerChildren(id, postsToAdd, postsToRemove)
         OR updateContainerChildOrder(id, postOrders) — discriminate on body shape
DELETE → removePostFromContainer(postId)
```

Cache revalidation on all mutations (per cache-revalidation.instructions.md):
```typescript
revalidatePath("/posts");
revalidatePath(`/posts/${id}`);
revalidatePath("/");
```

### 4.5  Add `src/app/api/documents/available-children/route.ts`

```
GET (authenticated) → getAvailableChildPosts(session.user.id)
```

### 4.6  Delete `src/app/api/posts/update-times/route.ts` or update it
This updates `createdAt` on posts — if it references `seriesId` internally, update to use
`parentId`. Otherwise keep as-is (it is a standalone utility endpoint).

---

## Phase 5 — Redux Store

### 5.1  Delete `src/store/thunks/seriesThunks.ts`

### 5.2  Update `src/store/app.ts`

Remove:
- `series: Series[]` from initial state and `AppState` type
- All `series` extraReducers blocks: `loadSeries`, `createSeries`, `updateSeries`, `deleteSeries`
- The `series.posts` cleanup inside `deleteLocalDocument.fulfilled` and `deleteCloudDocument.fulfilled`
- `loadSeries` call inside the `load` thunk

Update document-delete reducers:
- The `series.posts` array cleanup is no longer needed — when a child document is deleted,
  its `parentId` simply ceases to exist. No secondary cleanup required.

SERIES-type documents load through the existing document load path — no new thunk needed.
`loadCloudDocuments` fetches all documents including `type: SERIES`.

### 5.3  Update `src/store/selectors/postsSelectors.ts`

Rewrite `selectAllPosts`:
```typescript
// Before: complex merge of series.posts + Redux documents
// After: simple filter — posts are DOCUMENT type with no parent, OR all DOCUMENT type
export const selectAllPosts = createSelector(
  documentsSelectors.selectAll,
  (docs) => docs.filter(d =>
    (d.cloud?.type ?? d.local?.type) === "DOCUMENT"
  )
);
```

Add new selector:
```typescript
export const selectAllContainers = createSelector(
  documentsSelectors.selectAll,
  (docs) => docs.filter(d =>
    (d.cloud?.type ?? d.local?.type) === "SERIES"
  )
);
```

---

## Phase 6 — API Client (`src/api/`)

Remove `apiClient.series.*` methods.

Add `apiClient.documents.children.*`:
```typescript
children: {
  list:   (containerId) => GET  `/api/documents/${containerId}/children`
  add:    (containerId, body) => POST `/api/documents/${containerId}/children`
  batch:  (containerId, body) => PATCH `/api/documents/${containerId}/children`
  remove: (containerId, body) => DELETE `/api/documents/${containerId}/children`
}

availableChildren: {
  list: () => GET `/api/documents/available-children`
}
```

---

## Phase 7 — Utility Functions

### 7.1  Rename/rewrite `src/utils/posts/seriesGrouping.ts` → `src/utils/posts/containerGrouping.ts`

| Old export | New export | Change |
|---|---|---|
| `getPostSeriesId(doc)` | `getPostParentId(doc)` | reads `parentId` instead of `seriesId` |
| `getPostSeriesOrder(doc)` | `getPostPosition(doc)` | reads `position` instead of `seriesOrder` |
| `buildSeriesMap(series[])` | `buildContainerMap(containers[])` | input is `UserDocument[]` filtered to SERIES type |
| `groupPostsBySeries(posts, map)` | `groupPostsByContainer(posts, map)` | uses `parentId` |
| `flattenGroupedPosts(groups)` | unchanged signature | |
| `groupPostsBySeriesAndTime(...)` | `groupPostsByContainerAndTime(...)` | |

### 7.2  Update re-export stub

`src/components/PostsList/utils/seriesGrouping.ts` — update re-export path:
```typescript
export * from "@/utils/posts/containerGrouping";
```

### 7.3  Update `src/components/PostsList/hooks/usePostsFiltering.ts`

Replace any `series.posts` / `seriesId` references with `container.children` / `parentId`.

---

## Phase 8 — Components

### 8.1  `PostsView` (`src/components/PostsView/index.tsx`)

- Change prop `series?: Series` → `container?: Document` (where `document.type === "SERIES"`)
- Container mode: use `container.children` (sorted by `position`) instead of `series.posts`
- All-posts mode: unchanged except `selectAllPosts` now comes from the simplified selector
- Update `localStorage` key `"postsView"` to `"postsView"` (no rename needed)
- Replace imports from `SeriesView/SeriesHeader` → `ContainerView/ContainerHeader`
- Replace imports from `SeriesView/SeriesSearchAndControls` → `ContainerView/ContainerSearchAndControls`

### 8.2  Rename `src/components/SeriesView/` → `src/components/ContainerView/`

File renames and prop type changes:

| Old file | New file | Key prop change |
|---|---|---|
| `SeriesHeader.tsx` | `ContainerHeader.tsx` | `series: Series` → `container: Document` |
| `SeriesSearchAndControls.tsx` | `ContainerSearchAndControls.tsx` | `series: Series` → `container: Document` |
| `AddPostsDialog.tsx` | `AddChildrenDialog.tsx` | calls `/api/documents/available-children` and `/api/documents/[id]/children` |
| `PostsCompactListView.tsx` | unchanged | no series-specific props |
| `PostCompactListItem.tsx` | unchanged | no series-specific props |
| `TimeStepperControls.tsx` | unchanged | |
| `ViewToggle.tsx` | unchanged | |
| `hooks/useTimeEditing.ts` | unchanged | update any `seriesId`/`seriesOrder` references |
| `hooks/useAvailablePostsSelector.ts` | `hooks/useAvailableChildrenSelector.ts` | calls `apiClient.documents.availableChildren.list()` |

### 8.3  `SeriesCard` → `ContainerCard` (`src/components/SeriesCard/` → `src/components/ContainerCard/`)

**`DetailedVariant`:**
- Prop `series: Series` → `container: Document`
- Read `container.name` (was `series.title`), `container.description`, `container.children`
- Link: `/posts/${container.id}` (unchanged URL pattern)
- Post count: `container.children.length`

**`CompactVariant`:**
- Prop `series: Series` → `container: Document`
- Read `container.name`, `container.id`
- `posts: UserDocument[]` prop is passed in from parent — no change

**`SeriesCardUnified.tsx` → `ContainerCardUnified.tsx`**

### 8.4  `PostsGrid` (`src/components/PostsList/components/PostsGrid.tsx`)

- Replace `buildSeriesMap` / `groupPostsBySeries` → `buildContainerMap` / `groupPostsByContainer`
- Replace `SeriesCardUnified` import → `ContainerCardUnified`
- Replace series prop on card → container prop

### 8.5  `NewDocument.tsx` (`src/components/NewDocument.tsx`)

- Replace `?seriesId=` URL query param → `?parentId=`
- Remove series-fetching and `nextSeriesOrder` computation
- Compute `position` as: fetch container's current children count + 1 via
  `GET /api/documents/[parentId]/children` then use `children.length + 1`

### 8.6  Delete `src/components/SeriesActions/`

`EditSeriesForm.tsx` and `SeriesActions.tsx` are replaced by:
- Inline edit form inside `ContainerCard` (or reuse existing `DocumentActions` component)
- Container title/description editing goes through `PATCH /api/documents/[id]` (same as posts)

### 8.7  Delete `src/components/BlogManager/`

No live page renders it. Safe to remove.

---

## Phase 9 — Pages & Routes

### 9.1  Update `src/app/(appLayout)/posts/[[...id]]/page.tsx`

```typescript
// Before
const series = await findSeriesById(id[0]);
if (!series) return notFound();
return <PostsView series={series} user={user} />;

// After
const container = await findContainerDocument(id[0]);
if (!container || container.type !== "SERIES") return notFound();
return <PostsView container={container} user={user} />;
```

Update `generateMetadata`: read `container.name` / `container.description`.

### 9.2  Update `src/app/(appLayout)/series/[id]/edit/page.tsx`

This page imports `EditSeriesForm`. Options:
- **Delete it** — edit the container title/description inline from the container detail page
- **Redirect** → `/posts/[id]` (consistent with the existing 308 redirect on `/series/[id]`)

Recommended: delete and add inline editing to `ContainerHeader`.

### 9.3  Verify `src/app/(appLayout)/series/` redirect

The existing 308 redirect from `/series/[id]` → `/posts/[id]` should be kept permanently
for URL backwards compatibility.

---

## Phase 10 — Cache Revalidation Audit

Per `cache-revalidation.instructions.md`, all mutation components must call `router.refresh()`
after dispatching Redux thunks that affect server data. After this refactor:

- Any component that creates/deletes a container document must call `router.refresh()`
- Any component that adds/removes a post from a container must call `router.refresh()`
- API routes for `/api/documents/[id]/children` must call `revalidatePath()` on:
  - `revalidatePath("/")`
  - `revalidatePath("/posts")`
  - `revalidatePath(\`/posts/${containerId}\`)`

---

## Phase 11 — Cleanup

- Delete `src/store/thunks/seriesThunks.ts`
- Delete `src/repositories/series.ts`
- Delete `src/app/api/series/` directory
- Delete `src/components/SeriesView/` (replaced by `ContainerView/`)
- Delete `src/components/SeriesCard/` (replaced by `ContainerCard/`)
- Delete `src/components/SeriesActions/`
- Delete `src/components/BlogManager/`
- Delete `src/app/(appLayout)/series/[id]/edit/page.tsx`
- Remove unused re-export stub `src/components/PostsList/utils/seriesGrouping.ts`
  (once all imports updated to `containerGrouping`)
- Remove `series` key from `src/hooks/useBlog.ts`
- Remove `Series` export from `src/store/index.ts`

---

## Verification Checklist

```bash
npx prisma generate         # schema compiles, Prisma client updated
npm run build               # catches all TS errors from removed types
npm run lint                # no ESLint violations
```

**Manual QA:**
- [ ] Create a SERIES-type document via UI → appears at `/posts`
- [ ] Add posts to container → appear at `/posts/[containerId]` ordered by `position`
- [ ] Reorder posts in container → `position` updates, order reflects correctly
- [ ] Delete a container → its children get `parentId = null` (via `onDelete: SetNull`)
- [ ] Delete a child post → disappears from container view without touching container
- [ ] `/posts` all-posts view shows container-grouped posts using `parentId`
- [ ] Old `/series/[id]` URLs redirect to `/posts/[id]`
- [ ] `DocumentBrowser` at `/browse` unaffected

---

## Phased Execution Order

The phases above are sequenced so that each phase compiles independently:

```
Phase 1 (schema)
  → Phase 2 (types) — requires regenerated Prisma client
  → Phase 3 (repositories) — depends on updated types
  → Phase 4 (API routes) — depends on updated repositories
  → Phase 5 (Redux) — can be done in parallel with Phase 4
  → Phase 6 (API client) — depends on Phase 4
  → Phase 7 (utils) — can be done in parallel with Phases 4–6
  → Phase 8 (components) — depends on Phases 6 + 7
  → Phase 9 (pages) — depends on Phase 8
  → Phase 10 (cache audit) — can be done alongside Phase 9
  → Phase 11 (delete dead files) — last, after all imports updated
```
