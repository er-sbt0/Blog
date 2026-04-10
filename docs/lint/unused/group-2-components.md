# Group 2 — UI Components (`src/components/`)

> Suggested commit message: `fix(lint): remove unused vars in components`
> ~~Errors: **67**~~ → **4 remaining** (verified 2026-04-10)

## ✅ Remaining errors (do these next)

| File | Line | Symbol | Fix |
| ---- | ---- | ------ | --- |
| `src/components/ViewDocumentInfo.tsx` | L11 | `useScrollTrigger` | Remove import |
| `src/components/ViewDocumentInfo.tsx` | L43 | `revisionId` | Remove assignment |
| `src/components/DocumentBrowser/index.tsx` | L37 | `directories` | Remove assignment |
| `src/components/EditDocument/EditRevisionCard.tsx` | L59 | `isCloudOnlyRevision` | Remove assignment |

> All other entries below were fixed in the previous pass.

---

---

## `src/components/ViewDocumentInfo.tsx` — 8 errors

### Unused imports (5)

| Line | Symbol                 | Fix    |
| ---- | ---------------------- | ------ |
| L7   | `Badge`                | Remove |
| L10  | `Fab`                  | Remove |
| L12  | `Portal`               | Remove |
| L17  | `FileCopy`             | Remove |
| L26  | `FloatingActionButton` | Remove |

### Unused locals (3)

| Line | Symbol                   | Fix               |
| ---- | ------------------------ | ----------------- |
| L31  | `slideTrigger`           | Remove assignment |
| L49  | `href`                   | Remove assignment |
| L53  | `cloudDocumentRevisions` | Remove assignment |

---

## `src/components/DocumentCardNew/components/LoadingCard.tsx` — 4 errors

### Unused imports (4)

| Line | Symbol       | Fix    |
| ---- | ------------ | ------ |
| L2   | `Chip`       | Remove |
| L2   | `IconButton` | Remove |
| L3   | `MoreVert`   | Remove |
| L3   | `Share`      | Remove |

---

## `src/components/DocumentBrowser/index.tsx` — 3 errors

### Unused locals (3)

| Line | Symbol              | Fix               |
| ---- | ------------------- | ----------------- |
| L37  | `currentDirectory`  | Remove assignment |
| L43  | `createDirectory`   | Remove assignment |
| L55  | `sortedDirectories` | Remove assignment |

---

## `src/components/DocumentBrowser/components/BrowserHeader.tsx` — 3 errors

### Unused imports (3)

| Line | Symbol            | Fix    |
| ---- | ----------------- | ------ |
| L5   | `CreateNewFolder` | Remove |
| L8   | `Settings`        | Remove |
| L10  | `Link`            | Remove |

---

## `src/components/DocumentCardNew/PostChips.tsx` — 3 errors

### Unused local and parameters (3)

| Line | Symbol                 | Fix                  |
| ---- | ---------------------- | -------------------- |
| L228 | `renderPostChips`      | Remove assignment    |
| L230 | `author` parameter     | Prefix `_author`     |
| L233 | `showAuthor` parameter | Prefix `_showAuthor` |

---

## `src/components/DocumentControls/SortControl.tsx` — 3 errors

### Unused import (1)

| Line | Symbol         | Fix    |
| ---- | -------------- | ------ |
| L4   | `ListItemIcon` | Remove |

### Unused parameters (2)

| Line | Symbol  | Fix             |
| ---- | ------- | --------------- |
| L43  | `theme` | Prefix `_theme` |
| L64  | `theme` | Prefix `_theme` |

---

## `src/components/DocumentGrid/DocumentGridHeader.tsx` — 4 errors

### Unused import (1)

| Line | Symbol       | Fix    |
| ---- | ------------ | ------ |
| L2   | `Typography` | Remove |

### Unused parameters (3)

| Line | Symbol      | Fix                 |
| ---- | ----------- | ------------------- |
| L21  | `title`     | Prefix `_title`     |
| L23  | `isLoading` | Prefix `_isLoading` |
| L24  | `itemCount` | Prefix `_itemCount` |

---

## `src/components/EditDocument/EditRevisionCard.tsx` — 2 errors

### Unused import (1)

| Line | Symbol   | Fix    |
| ---- | -------- | ------ |
| L20  | `Delete` | Remove |

### Unused local (1)

| Line | Symbol       | Fix               |
| ---- | ------------ | ----------------- |
| L61  | `isLastCopy` | Remove assignment |

---

## `src/components/EditDocument/EditDocumentInfo.tsx` — 2 errors

### Unused imports (2)

| Line | Symbol        | Fix    |
| ---- | ------------- | ------ |
| L3   | `actions`     | Remove |
| L3   | `useDispatch` | Remove |

---

## `src/components/DocumentControls/ImportExportControl.tsx` — 2 errors

### Unused catch variables (2)

| Line | Symbol  | Fix                                |
| ---- | ------- | ---------------------------------- |
| L56  | `error` | Bare `catch {` or `catch (_error)` |
| L110 | `error` | Bare `catch {` or `catch (_error)` |

---

## `src/components/DocumentBrowser/components/EmptyState.tsx` — 2 errors

### Unused imports (2)

| Line | Symbol            | Fix    |
| ---- | ----------------- | ------ |
| L4   | `CreateNewFolder` | Remove |
| L4   | `Folder`          | Remove |

---

## `src/components/DocumentCardNew/DraggablePostCard.tsx` — 2 errors

### Unused import (1)

| Line | Symbol    | Fix    |
| ---- | --------- | ------ |
| L7   | `actions` | Remove |

### Unused local (1)

| Line | Symbol     | Fix               |
| ---- | ---------- | ----------------- |
| L27  | `dispatch` | Remove assignment |

---

## `src/components/Layout/styles.ts` — 2 errors

### Unused imports (2)

| Line | Symbol    | Fix    |
| ---- | --------- | ------ |
| L4   | `SxProps` | Remove |
| L4   | `Theme`   | Remove |

---

## `src/components/NotesCanvas/index.tsx` — 2 errors

### Unused parameters (2)

| Line | Symbol       | Fix                  |
| ---- | ------------ | -------------------- |
| L39  | `canZoomIn`  | Prefix `_canZoomIn`  |
| L40  | `canZoomOut` | Prefix `_canZoomOut` |

---

## Single-error files (1 error each)

| File                                                               | Line | Symbol             | Kind      | Fix            |
| ------------------------------------------------------------------ | ---- | ------------------ | --------- | -------------- |
| `src/components/DocumentActions/DeleteBoth.tsx`                    | L4   | `Delete`           | import    | Remove         |
| `src/components/DocumentActions/DeleteBoth.tsx`                    | L32  | `document`         | local     | Remove         |
| `src/components/DocumentActions/DeleteBoth.tsx`                    | L33  | `isDirectory`      | local     | Remove         |
| `src/components/DocumentActions/Edit.tsx`                          | L2   | `useDispatch`      | import    | Remove         |
| `src/components/DocumentActions/Restore.tsx`                       | L94  | `cloudDocument`    | local     | Remove         |
| `src/components/DocumentBrowser/components/BrowserBreadcrumbs.tsx` | L20  | `breadcrumbs`      | param     | `_breadcrumbs` |
| `src/components/DocumentBrowser/hooks/useBreadcrumbs.ts`           | L3   | `UserDocument`     | import    | Remove         |
| `src/components/DocumentCardNew/PostCard.tsx`                      | L35  | `document`         | local     | Remove         |
| `src/components/DocumentCardNew/components/PostActions.tsx`        | L41  | `router`           | local     | Remove         |
| `src/components/DocumentCardNew/components/PostContent.tsx`        | L2   | `Chip`             | import    | Remove         |
| `src/components/DocumentCardNew/hooks/usePostMeta.ts`              | L4   | `createAuthorChip` | import    | Remove         |
| `src/components/DocumentControls/FilterControl.tsx`                | L10  | `Folder`           | import    | Remove         |
| `src/components/DocumentControls/FilterControl.tsx`                | L22  | `filterDocuments`  | local     | Remove         |
| `src/components/DocumentGrid.tsx`                                  | L4   | `Typography`       | import    | Remove         |
| `src/components/DocumentGrid/DocumentGridError.tsx`                | L2   | `Typography`       | import    | Remove         |
| `src/components/DocumentGrid/DocumentGridError.tsx`                | L3   | `ErrorOutline`     | import    | Remove         |
| `src/components/EditDocument/Editor.tsx`                           | L72  | `children`         | param     | `_children`    |
| `src/components/ErrorBoundary/CardErrorBoundary.tsx`               | L5   | `Box`              | import    | Remove         |
| `src/components/Home/RecentPostsPreviewCard.tsx`                   | L82  | `index`            | param     | `_index`       |
| `src/components/Layout/Breadcrumbs.tsx`                            | L15  | `Home`             | import    | Remove         |
| `src/components/Layout/SaveDocumentButton.tsx`                     | L12  | `success`          | local     | Remove         |
| `src/components/Layout/ScrollTop.tsx`                              | L2   | `Zoom`             | import    | Remove         |
| `src/components/Layout/SideBar.tsx`                                | L4   | `RouterLink`       | import    | Remove         |
| `src/components/NotesCanvas/NotesMigrationBanner.tsx`              | L21  | `session`          | local     | Remove         |
| `src/components/NotesCanvas/NotesToolbar.tsx`                      | L14  | `onClearAll`       | param     | `_onClearAll`  |
| `src/components/Playground/Editor.tsx`                             | L9   | `children`         | param     | `_children`    |
| `src/components/PostsList/components/PostsHeader.tsx`              | L81  | `loading`          | param     | `_loading`     |
| `src/components/PostsView/index.tsx`                               | L118 | `searchResults`    | local     | Remove         |
| `src/components/Tutorial/Editor.tsx`                               | L28  | `children`         | param     | `_children`    |
| `src/components/User/UserCard.tsx`                                 | L40  | `err`              | catch var | Bare `catch {` |
