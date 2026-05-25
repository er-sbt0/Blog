# Icon Migration Plan: `@mui/icons-material` → `lucide-react`

## Current State

| | Count |
|---|---|
| Files using `@mui/icons-material` | **107** |
| Files using `lucide-react` | **8** (recently introduced) |
| Unique MUI icons in use | **~76** |
| Import lines (MUI) | 114 (105 barrel + 9 per-icon) |

**Bundle note:** `modularizeImports` in `next.config.ts` already tree-shakes the
barrel imports, so there is no bundle emergency. The drive here is visual
consistency and eliminating a 130 MB dev dependency.

**Keep after migration:**
- `SvgIcon` from `@mui/material` (not `@mui/icons-material`) — used for custom
  SVG paths in `TableTools.tsx`. This stays.
- `Google` icon from `@mui/icons-material` — brand icon, no lucide equivalent.
  Replace with an inline SVG `<svg>` in `UserCard.tsx`, then the dep can be
  dropped entirely.

---

## Icon Mapping Reference

All MUI icons found in the codebase with their lucide replacement.
Icons marked **✓** are already available and a clean match.
Icons marked **~** need a visual judgment call.

| MUI icon | Lucide replacement | Notes |
|---|---|---|
| `AccessTime` | `Clock` | |
| `Add` | `Plus` | |
| `ArrowBack` | `ArrowLeft` | |
| `ArrowDownward` | `ArrowDown` | |
| `ArrowDropDown` | `ChevronDown` | |
| `ArrowUpward` | `ArrowUp` | |
| `Article` / `ArticleOutlined` | `FileText` | |
| `AttachFile` | `Paperclip` | |
| `Cached` | `RefreshCcw` | |
| `Cancel` | `X` | use `XCircle` if circle shape is needed |
| `CheckBox` | `SquareCheck` | |
| `CheckBoxOutlineBlank` | `Square` | |
| `ChevronRight` | `ChevronRight` ✓ | already in use |
| `Clear` / `Close` | `X` | |
| `Cloud` | `Cloud` ✓ | |
| `CloudOff` | `CloudOff` ✓ | |
| `CloudSync` | `RefreshCcw` ~ | no exact match; represents sync |
| `CloudUpload` | `CloudUpload` ✓ | |
| `ContentCopy` | `Copy` | |
| `ContentPaste` | `ClipboardPaste` | |
| `Delete` / `DeleteForever` | `Trash2` | already in use |
| `Description` | `FileText` | |
| `Download` | `Download` ✓ | |
| `DragIndicator` | `GripVertical` ✓ | already in use |
| `Draw` | `PenLine` | |
| `DriveFileRenameOutline` | `FilePen` | |
| `Edit` / `EditNote` | `Pencil` | already in use |
| `ErrorOutline` | `AlertCircle` | |
| `ExpandLess` | `ChevronUp` | |
| `ExpandMore` | `ChevronDown` | |
| `FileCopy` | `Copy` | |
| `FilterList` | `ListFilter` | |
| `Google` | **inline SVG** | brand icon — see Stage 7 |
| `History` | `History` ✓ | |
| `Home` | `Home` ✓ | |
| `Info` | `Info` ✓ | |
| `LibraryBooks` | `BookOpen` | |
| `Link` (as `LinkIcon`) | `Link` ✓ | |
| `LinkOff` | `Unlink` | |
| `Login` | `LogIn` | |
| `Menu` | `Menu` ✓ | already in use |
| `MobileFriendly` | `Smartphone` ~ | used in RevisionsSection for "local" state |
| `MoreHoriz` | `MoreHorizontal` | |
| `MoreVert` | `MoreVertical` | already in use |
| `Note` | `StickyNote` | |
| `OpenInNew` | `ExternalLink` | |
| `Pageview` | `FileSearch` | |
| `Palette` | `Palette` ✓ | |
| `Person` | `User` | |
| `PostAdd` | `FilePlus` | |
| `Print` | `Printer` | |
| `Redo` | `Redo` ✓ | |
| `Refresh` | `RefreshCw` | |
| `Remove` | `Minus` | |
| `Restore` | `RotateCcw` | |
| `Save` | `Save` ✓ | |
| `Search` | `Search` ✓ | already in use |
| `Settings` | `Settings` ✓ | |
| `Share` | `Share2` | |
| `StickyNote2` / `StickyNote2Outlined` | `StickyNote` ~ | Outlined becomes the same icon; fine |
| `Storage` | `Database` | |
| `TableChart` | `Table` | |
| `TextDecrease` | `AArrowDown` | |
| `TextIncrease` | `AArrowUp` | |
| `Undo` | `Undo` ✓ | |
| `UploadFile` | `FileUp` | |
| `ViewHeadline` | `AlignLeft` | used in AI dialog for "summarise" |
| `ViewKanbanOutlined` | `Kanban` ✓ | |
| `ZoomIn` | `ZoomIn` ✓ | |
| `ZoomOut` | `ZoomOut` ✓ | |

---

## Prop Mapping

MUI icons accept component-level props that don't exist on lucide icons.
Apply these substitutions mechanically during each stage.

| MUI prop | Lucide equivalent |
|---|---|
| `fontSize="small"` | `size={18}` |
| `fontSize="medium"` (default) | omit — both default to 24 |
| `fontSize="large"` | `size={32}` |
| `fontSize="inherit"` | omit — lucide inherits from CSS naturally |
| `color="action"` | `style={{ color: 'var(--mui-palette-action-active)' }}` |
| `color="disabled"` | `style={{ color: 'var(--mui-palette-action-disabled)' }}` |
| `color="error"` | `style={{ color: 'var(--mui-palette-error-main)' }}` |
| `color="primary"` | `style={{ color: 'var(--mui-palette-primary-main)' }}` |
| `color="inherit"` | omit |
| `sx={{ ... }}` | convert to `style={{ ... }}` or `className` |

> In practice, ~90 % of icon usages carry no explicit props at all, or only
> `fontSize="small"`. The color-prop cases total fewer than 10 files.

---

## Stages

### Stage 0 — Groundwork *(do before touching any files)*

**Goal:** establish conventions so every contributor migrates consistently.

1. Add an **Icons section** to `DESIGN.md`:
   - Standard import: `import { IconName } from 'lucide-react'`
   - Default size: `24` (no prop needed). Use `size={18}` inside dense UI
     (toolbars, chips, table rows).
   - Color: inherit from parent by default. Pass `style` for explicit overrides.
   - Stroke width: default (`2`). Use `strokeWidth={1.5}` for large decorative
     icons only.
2. Extract the Google brand SVG path into
   `src/components/User/GoogleIcon.tsx` (inline SVG, ~5 lines) so `UserCard`
   can drop the MUI icons dep in Stage 7 without a special case.
3. Verify the mapping table above against the installed lucide version:
   ```
   grep -r "export.*AArrowDown\|export.*SquareCheck\|export.*Kanban" \
     node_modules/lucide-react/dist/lucide-react.d.ts
   ```
   Any missing icons need an alternative chosen before that stage begins.
4. No code changes beyond the two files above. No lint, no commit needed yet.

---

### Stage 1 — Shared & utility components

**Files (5):**
- `src/components/shared/EditorSkeleton.tsx`
- `src/components/shared/PrintTrigger.tsx`
- `src/components/shared/SyncToCloudFab.tsx`
- `src/components/shared/ViewToggle.tsx` *(already lucide — verify clean)*
- `src/components/DocumentControls/SortControl.tsx`

These are small leaf components with 1–2 icons each and no complex prop
usage. Good first batch to validate the approach.

**Completion check:** `grep "icons-material" src/components/shared/ src/components/DocumentControls/` returns empty.

---

### Stage 2 — Layout: sidebar & rails

**Files (11):**
- `src/components/Layout/Announcer.tsx`
- `src/components/Layout/FloatingOutlinePill.tsx`
- `src/components/Layout/SideBar/index.tsx`
- `src/components/Layout/SideBar/ActivePostsSection.tsx`
- `src/components/Layout/SideBar/PostContextMenu.tsx`
- `src/components/Layout/SideBar/PostItem.tsx`
- `src/components/Layout/SideBar/SeriesGroup.tsx` *(already lucide — verify clean)*
- `src/components/Layout/SideBar/SidebarHeader.tsx` *(already lucide — verify clean)*
- `src/components/Layout/RightRail/index.tsx`
- `src/components/Layout/RightRail/BacklinksSection.tsx`
- `src/components/Layout/RightRail/OutlineSection.tsx`
- `src/components/Layout/RightRail/PropertiesSection.tsx`
- `src/components/Layout/RightRail/RailSection.tsx`
- `src/components/Layout/RightRail/RevisionsSection.tsx`
- `src/components/Layout/EditorTopBar.tsx` *(already mixed — remove MUI half)*

`RevisionsSection` uses `MobileFriendly` → `Smartphone` (see mapping).

**Completion check:** `grep "icons-material" src/components/Layout/` returns empty.

---

### Stage 3 — Posts & series UI

**Files (11):**
- `src/components/posts/components/NewPostSplitButton.tsx` *(already lucide — verify clean)*
- `src/components/posts/components/PostCompactListItem.tsx`
- `src/components/posts/components/PostsCompactListView.tsx`
- `src/components/posts/components/SeriesGroupCard.tsx`
- `src/components/posts/components/SeriesSearchAndControls.tsx`
- `src/components/posts/components/TimeStepperControls.tsx`
- `src/components/posts/components/PostsListView/components/BulkActionBar.tsx` *(already mixed — remove MUI half)*
- `src/components/posts/components/PostsListView/components/PostRow.tsx` *(already lucide — verify clean)*
- `src/components/posts/components/PostsListView/components/PostRowContextMenu.tsx` *(already mixed — remove MUI half)*
- `src/components/posts/components/PostsListView/components/SeriesRow.tsx`
- `src/components/posts/AddPostsDialog.tsx`
- `src/components/SeriesActions/SeriesActions.tsx`

**Completion check:** `grep "icons-material" src/components/posts/ src/components/SeriesActions/` returns empty.

---

### Stage 4 — Document actions & cards

**Files (10):**
- `src/components/DocumentActions/ActionMenu.tsx`
- `src/components/DocumentActions/DeleteBoth.tsx`
- `src/components/DocumentActions/Download.tsx`
- `src/components/DocumentActions/Edit.tsx`
- `src/components/DocumentActions/Fork.tsx`
- `src/components/DocumentActions/Restore.tsx`
- `src/components/DocumentActions/Share.tsx`
- `src/components/DocumentActions/ShareTabPanels.tsx`
- `src/components/DocumentActions/Upload.tsx`
- `src/components/DocumentCard/CardBase.tsx`
- `src/components/DocumentCard/PostActionMenu.tsx`
- `src/components/DocumentCard/PostChips.tsx`
- `src/components/DocumentCard/components/PostActions.tsx`

`Share.tsx` uses both `Share` and `CloudOff` — both have clean lucide equivalents
(`Share2`, `CloudOff`).

**Completion check:** `grep "icons-material" src/components/DocumentActions/ src/components/DocumentCard/` returns empty.

---

### Stage 5 — Home widgets & drawers

**Files (14):**
- `src/components/Home/FooterWithFloatingAction.tsx`
- `src/components/Home/FullViewDialog.tsx`
- `src/components/Home/index.tsx`
- `src/components/Home/KanbanBoard.tsx`
- `src/components/Home/KanbanPreviewCard.tsx`
- `src/components/Home/ReadmePreviewCard.tsx`
- `src/components/Home/ReadmeViewer.tsx`
- `src/components/Home/RecentPostsPreviewCard.tsx`
- `src/components/Home/TrashBin.tsx`
- `src/components/drawers/AttachmentDrawer/AttachmentContentViewer.tsx`
- `src/components/drawers/AttachmentDrawer/AttachmentToolbar.tsx`
- `src/components/drawers/AttachmentDrawer/index.tsx`
- `src/components/drawers/CreatePostDrawer.tsx`
- `src/components/drawers/CreateSeriesDrawer.tsx`

**Completion check:** `grep "icons-material" src/components/Home/ src/components/drawers/` returns empty.

---

### Stage 6 — Browse, views, EditDocument, ErrorBoundary, misc

**Files (12):**
- `src/components/views/ViewTabBar.tsx`
- `src/components/views/ViewAttachment.tsx`
- `src/components/EditDocument/EditorTabBar.tsx`
- `src/components/EditDocument/TabContextMenu.tsx`
- `src/components/DocumentBrowser/index.tsx`
- `src/components/DocumentBrowser/components/BrowserBreadcrumbs.tsx`
- `src/components/DocumentBrowser/components/BrowserHeader.tsx`
- `src/components/ErrorBoundary/AppErrorBoundary.tsx`
- `src/components/ErrorBoundary/CardErrorBoundary.tsx`
- `src/components/DocumentGrid/DocumentGridError.tsx`
- `src/app/(appLayout)/browse/not-found.tsx`
- `src/components/Dashboard.tsx`
- `src/components/NewDocument.tsx`

**Completion check:** `grep -r "icons-material" src/components/views/ src/components/EditDocument/ src/components/DocumentBrowser/ src/components/ErrorBoundary/ src/components/DocumentGrid/ src/app/ src/components/Dashboard.tsx src/components/NewDocument.tsx` returns empty.

---

### Stage 7 — User, NotesCanvas, ExportImport

**Files (17):**
- `src/components/User/UserActionMenu.tsx`
- `src/components/User/UserCard.tsx` *(needs `GoogleIcon` component from Stage 0)*
- `src/components/User/UserDocuments.tsx`
- `src/components/User/UserNotFound.tsx`
- `src/components/User/UsersAutocomplete.tsx`
- `src/components/NotesCanvas/BoardSelector.tsx`
- `src/components/NotesCanvas/DraggableNote.tsx`
- `src/components/NotesCanvas/NotesMigrationBanner.tsx`
- `src/components/NotesCanvas/NotesCanvasPreview.tsx`
- `src/components/NotesCanvas/NotesToolbar.tsx`
- `src/components/NotesCanvas/PasteButton.tsx`
- `src/components/NotesCanvas/ZoomControls.tsx`
- `src/components/ExportImportPanel/index.tsx`
- `src/components/ExportImportPanel/ExportTab.tsx`
- `src/components/ExportImportPanel/ImportTab.tsx`
- `src/components/ExportImportPanel/ImportSummaryDisplay.tsx`
- `src/app/(appLayout)/notes/page.tsx`

`UsersAutocomplete` uses `CheckBox` / `CheckBoxOutlineBlank` from MUI to render
checkbox-style options inside an Autocomplete — replace with `SquareCheck` /
`Square` from lucide.

**Completion check:** `grep -r "icons-material" src/components/User/ src/components/NotesCanvas/ src/components/ExportImportPanel/` returns empty.

---

### Stage 8 — Editor toolbar & nodes *(highest complexity)*

**Files (20):**

Editor nodes:
- `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx`
- `src/editor/nodes/AttachmentNode/AttachmentEditor.tsx`
- `src/editor/nodes/AttachmentNode/AttachmentPreview.tsx`
- `src/editor/nodes/StickyNode/StickyComponent.tsx`

Toolbar tools:
- `src/editor/plugins/ToolbarPlugin/index.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/ColorPicker.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/FontSizePicker.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/ImageTools.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/NoteTools.tsx`
- `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx` *(special — see below)*
- `src/editor/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx`
- `src/editor/plugins/ToolbarPlugin/Menus/AlignTextMenu.tsx`
- `src/editor/plugins/ToolbarPlugin/Menus/BlockFormatSelect.tsx`
- `src/editor/plugins/ToolbarPlugin/Menus/InsertToolMenu.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/AIDialog.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/AttachmentDialog.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/ImageDialog.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/LinkDialog.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/OCRDialog.tsx`
- `src/editor/plugins/ToolbarPlugin/Dialogs/TableDialog.tsx`
- `src/editor/plugins/ComponentPickerPlugin/index.tsx`

**`TableTools.tsx` special case:** this file contains 31 custom SVG icons
rendered via `SvgIcon` from `@mui/material` (not `@mui/icons-material`) with
custom `viewBox="0 -960 960 960"` paths. These are Google Material Symbols
not present in either library. Action: migrate the MUI icon imports in this
file to lucide, but leave `SvgIcon` from `@mui/material` in place for the
custom paths. The import `from "@mui/icons-material"` should disappear; the
import `from "@mui/material"` stays.

**Completion check:** `grep -r "icons-material" src/editor/` returns empty.

---

### Stage 9 — Final cleanup

Once all 8 stages are complete:

1. **Remove `@mui/icons-material`** from `package.json` and run
   `npm install`.
2. **Remove `modularizeImports["@mui/icons-material"]`** from `next.config.ts`.
3. **Run `npm run build`** — confirm zero `icons-material` references appear in
   build output or warnings.
4. **Run `npm run lint`** — fix any unused import warnings introduced during
   migration.
5. Update `DESIGN.md` Icons section to mark the migration complete and note
   the `SvgIcon` carve-out for `TableTools`.

**Final verification:**
```bash
grep -r "icons-material" src/  # must return empty
grep -r "lucide-react" src/ --include="*.tsx" -l | wc -l  # should be ~107
```

---

## Summary

| Stage | Files | Complexity |
|---|---|---|
| 0 — Groundwork | 2 new files | low |
| 1 — Shared/utility | 5 | low |
| 2 — Layout | 15 | low–medium |
| 3 — Posts & series | 12 | low (area already partly migrated) |
| 4 — Document actions/cards | 13 | medium |
| 5 — Home & drawers | 14 | low–medium |
| 6 — Browse/views/misc | 13 | medium |
| 7 — User/NotesCanvas/Export | 17 | medium |
| 8 — Editor toolbar & nodes | 23 | high |
| 9 — Cleanup | config + lock file | low |
| **Total** | **~107 files** | |

Stages 1–7 can be done in any order and independently. Stage 8 should come
last because the editor has the highest density of icons and the `TableTools`
special case. Stage 9 is a gate — only run it once `grep -r "icons-material" src/` is clean.
