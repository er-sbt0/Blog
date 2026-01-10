# Attachment Feature Refactor & Enhancement Plan

**Purpose**: Transform Lexical attachments from download-only cards into interactive, previewable content with inline viewing, editing, and sidebar support.

**Status**: Planning Phase  
**Start Date**: 2026-01-10  
**Estimated Duration**: 13-17 days

---

## Current State Analysis

### Existing Implementation
- **Location**: `src/editor/nodes/AttachmentNode/`
- **Type**: DecoratorNode with card-based UI
- **Features**: Upload, download, delete
- **Storage**: Files in `public/uploads/attachments/`
- **API**: 
  - `POST /api/documents/[id]/attachments` - Upload
  - `GET /api/attachments/[filename]` - Download

### Limitations
- ❌ Download-only interaction, no preview
- ❌ No content viewing for text/code files
- ❌ No inline editing capability
- ❌ Fixed card display, no expand/collapse
- ❌ No sidebar integration
- ❌ No syntax highlighting
- ❌ Duplicated download logic in AttachmentComponent and ViewDocument

### Available Infrastructure to Leverage
- ✅ **Prism.js** already integrated for syntax highlighting
- ✅ **DetailsNode** pattern for collapsible content
- ✅ **ImageNode** pattern for complex DecoratorNode
- ✅ **AppDrawer** component for sidebar UI
- ✅ **IndexedDB** setup for caching
- ✅ **Redux** for global UI state
- ✅ **MUI components** for consistent UI

---

## Phase 1: Foundation & Refactoring (2-3 days)

### 1.1 Extract Shared Download Utility
**Goal**: Eliminate code duplication  
**Files to Create**: `src/utils/downloadFile.ts`

```typescript
// Create utility function
export async function downloadFile(url: string, filename: string): Promise<void>
```

**Files to Modify**:
- `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx` (line 138-170)
- `src/components/ViewDocument.tsx` (line 35-61)

**Pattern**: Remove duplicated XHR download logic, replace with utility call.

### 1.2 Extend AttachmentNode with State
**Goal**: Support expand/collapse functionality  
**Files to Modify**: `src/editor/nodes/AttachmentNode/index.tsx`

**Add to `AttachmentPayload`**:
```typescript
export interface AttachmentPayload {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  key?: NodeKey;
  // New fields:
  expanded?: boolean;
  editing?: boolean;
}
```

**Add to `AttachmentNode` class**:
```typescript
__expanded: boolean;
__editing: boolean;

getExpanded(): boolean;
toggleExpanded(): void;
getEditing(): boolean;
setEditing(editing: boolean): void;
```

**Pattern**: Follow `DetailsContainerNode.__open` pattern from `src/editor/nodes/DetailsNode/DetailsContainerNode.ts`.

### 1.3 Create Content Fetching API
**Goal**: Enable reading file contents as text  
**Files to Create**: `src/app/api/attachments/[filename]/content/route.ts`

**Endpoint**: `GET /api/attachments/[filename]/content`

**Response**:
```typescript
{
  content: string;
  encoding: "utf-8";
  size: number;
  mimetype: string;
}
```

**Logic**:
- Reuse security checks from `src/app/api/attachments/[filename]/route.ts`
- Only support text-based files (check mimetype)
- Return 415 Unsupported Media Type for binary files
- Max size: 1MB for inline preview

### 1.4 Add IndexedDB Cache Store
**Goal**: Cache file contents to reduce API calls  
**Files to Modify**: `src/indexeddb/config.ts`

**Add store**:
```typescript
{
  name: "attachmentContent",
  id: { keyPath: "id", autoIncrement: false },
  indices: [
    { name: "url", keyPath: "url", options: { unique: true } },
    { name: "cachedAt", keyPath: "cachedAt", options: { unique: false } }
  ]
}
```

**Schema**:
```typescript
interface AttachmentContentCache {
  id: string;           // filename
  url: string;
  content: string;
  mimetype: string;
  size: number;
  cachedAt: number;     // timestamp
}
```

**Pattern**: Follow existing store patterns in `src/indexeddb/config.ts`.

---

## Phase 2: Inline Preview (3-4 days)

### 2.1 Create AttachmentPreview Component
**Goal**: Show file contents inline with expand/collapse  
**Files to Create**: `src/editor/nodes/AttachmentNode/AttachmentPreview.tsx`

**Props**:
```typescript
interface AttachmentPreviewProps {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  expanded: boolean;
  nodeKey: NodeKey;
}
```

**Features**:
- Lazy load content on expand
- Show loading spinner during fetch
- Check IndexedDB cache first
- Display syntax-highlighted code
- Support plain text, markdown preview
- Collapsible with smooth animation

**UI Structure**:
```
┌─────────────────────────────────────────┐
│ 📄 config.ts • TypeScript • 2.4 KB  [▼] │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ export const config = {             │ │  ← Syntax highlighted
│ │   apiUrl: "https://api.example.com",│ │
│ │   timeout: 5000,                    │ │
│ │ };                                  │ │
│ └─────────────────────────────────────┘ │
│        [Download] [Edit] [Sidebar]      │
└─────────────────────────────────────────┘
```

### 2.2 Add Syntax Highlighting
**Goal**: Highlight code with existing Prism theme  
**Files to Create**: `src/utils/languageDetection.ts`

**Function**:
```typescript
export function detectLanguageFromFilename(filename: string): string | null;
export function detectLanguageFromMimetype(mimetype: string): string | null;
export function isPrismLanguageSupported(language: string): boolean;
```

**Mapping**:
```typescript
const extensionToLanguage = {
  'js': 'javascript',
  'jsx': 'jsx',
  'ts': 'typescript',
  'tsx': 'tsx',
  'py': 'python',
  'sh': 'bash',
  'json': 'json',
  'html': 'html',
  'css': 'css',
  'md': 'markdown',
  // ... etc
};
```

**Integration**: Use Lexical's code highlight theme classes from `src/editor/theme.ts`.

### 2.3 Support Previewable File Types
**Goal**: Handle multiple content types gracefully  
**Implementation**: Update `AttachmentPreview.tsx`

**Categories**:
1. **Text files**: `.txt`, `.md`, `.csv`, `.log` → Plain text display
2. **Code files**: `.js`, `.ts`, `.py`, `.json`, `.sh`, `.html`, `.css`, `.xml`, `.yaml` → Syntax highlighted
3. **Documents**: `.pdf` → iframe preview (Phase 5)
4. **Binary/Archives**: `.zip`, `.tar`, `.gz`, `.exe`, `.bin` → "Preview not available" message

**Size limits**:
- < 100KB: Show full content
- 100KB - 1MB: Show truncated with "Show full in sidebar" button
- > 1MB: No inline preview, sidebar only

### 2.4 Update Node Serialization
**Goal**: Persist expanded state across editor sessions  
**Files to Modify**: `src/editor/nodes/AttachmentNode/index.tsx`

**Update `exportDOM()`** (around line 84):
```typescript
element.setAttribute("data-expanded", this.__expanded.toString());
element.setAttribute("data-editing", this.__editing.toString());
```

**Update `importDOM()`** (around line 105):
```typescript
const expanded = element.dataset.expanded === "true";
const editing = element.dataset.editing === "true";
// Pass to $createAttachmentNode
```

**Update `SerializedAttachmentNode`**:
```typescript
export type SerializedAttachmentNode = Spread<
  {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
    expanded: boolean;
    editing: boolean;
  },
  SerializedLexicalNode
>;
```

---

## Phase 3: Sidebar Integration (2-3 days)

### 3.1 Create AttachmentDrawer Component
**Goal**: Full-screen file viewing in sidebar  
**Files to Create**: `src/components/AttachmentDrawer.tsx`

**Props**:
```typescript
interface AttachmentDrawerProps {
  url: string | null;
  filename: string | null;
  mimetype: string | null;
  nodeKey: string | null;
  onEdit?: () => void;
}
```

**Features**:
- Full height with scroll
- Syntax highlighting
- Download button
- Edit button (if editable)
- Close button
- Copy to clipboard button

**Pattern**: Extend `AppDrawer` from `src/components/AppDrawer.tsx`.

### 3.2 Add Redux State
**Goal**: Manage active attachment in sidebar  
**Files to Modify**: `src/store/appSlice.ts`

**Add to UI state**:
```typescript
attachmentPreview: {
  open: boolean;
  nodeKey: string | null;
  url: string | null;
  filename: string | null;
  mimetype: string | null;
} | null;
```

**Actions**:
```typescript
openAttachmentPreview(state, action: PayloadAction<AttachmentPreviewPayload>);
closeAttachmentPreview(state);
```

**Selectors**:
```typescript
export const selectAttachmentPreview = (state: AppState) => state.ui.attachmentPreview;
```

### 3.3 Integrate Drawer into Layouts
**Goal**: Add drawer to edit/view pages  
**Files to Modify**:
- `src/components/EditDocument/EditDocumentInfo.tsx`
- `src/components/ViewDocumentInfo.tsx`

**Pattern**: Add `<AttachmentDrawer />` alongside existing `<AppDrawer>` components.

**Note**: Consider whether to use separate drawer or share with existing document info drawer.

---

## Phase 4: Inline Editing (4-5 days)

### 4.1 Add Edit Mode State
**Goal**: Toggle between view and edit mode  
**Files to Modify**: 
- `src/editor/nodes/AttachmentNode/index.tsx` (already added in Phase 1.2)
- `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx`

**UI Changes**:
- Add "Edit" button (only for text/code files)
- Show only when user is document author
- Disable in view-only mode

### 4.2 Create AttachmentEditor Component
**Goal**: Inline text editing with save/cancel  
**Files to Create**: `src/editor/nodes/AttachmentNode/AttachmentEditor.tsx`

**Props**:
```typescript
interface AttachmentEditorProps {
  initialContent: string;
  filename: string;
  mimetype: string;
  language?: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}
```

**Implementation**:
- Start with `<textarea>` styled with monospace font
- Add line numbers (optional)
- Auto-resize to content
- Basic syntax coloring (CSS only, no runtime highlighting)
- Save/Cancel buttons
- Dirty state indicator
- Confirm on cancel if modified

**Future enhancement**: Replace `<textarea>` with Monaco Editor via dynamic import if advanced features needed.

### 4.3 Add Update API Endpoint
**Goal**: Save edited content back to file  
**Files to Modify**: `src/app/api/attachments/[filename]/route.ts`

**Add PUT handler**:
```typescript
export async function PUT(
  request: Request,
  props: { params: Promise<{ filename: string }> }
)
```

**Logic**:
- Validate user is document author
- Parse `{ content: string }` from body
- Write to file (overwrite existing)
- Return updated size
- Security: Only allow editing text files (check mimetype)
- Security: Prevent directory traversal in filename

**Authorization**: Check document ownership similar to `POST /api/documents/[id]/attachments`.

### 4.4 Implement Save Flow
**Goal**: Complete edit → save → update UI cycle  
**Files to Modify**: `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx`

**Steps**:
1. User clicks Save in `AttachmentEditor`
2. Call `PUT /api/attachments/[filename]` with new content
3. On success:
   - Invalidate IndexedDB cache for this file
   - Update node's `__size` property if changed
   - Exit edit mode
   - Show success notification via `ANNOUNCE_COMMAND`
4. On error:
   - Show error notification
   - Keep in edit mode
   - Optionally save draft to localStorage

**Edge cases**:
- Handle concurrent edits (last write wins, warn user)
- Handle file deleted by another user
- Handle network errors with retry

---

## Phase 5: Polish & Edge Cases (2-3 days)

### 5.1 Add PDF Preview
**Goal**: Show PDF content inline  
**Files to Modify**: `src/editor/nodes/AttachmentNode/AttachmentPreview.tsx`

**Implementation (Simple)**:
```tsx
{mimetype === 'application/pdf' && (
  <iframe 
    src={url} 
    style={{ width: '100%', height: '600px', border: 'none' }}
    title={filename}
  />
)}
```

**Implementation (Advanced)**: 
- Consider `react-pdf` if iframe approach insufficient
- Lazy load via `next/dynamic` to avoid bundle bloat
- Add page navigation for multi-page PDFs

### 5.2 Handle Large Files
**Goal**: Performance optimization for large files  
**Implementation**: Update preview components

**Thresholds**:
- < 100KB: Full inline preview
- 100KB - 1MB: Truncated preview (first 100 lines) with "Show full" button → opens sidebar
- > 1MB: No inline preview, show message "File too large, open in sidebar" with button

**UI Indicators**:
```
┌─────────────────────────────────────────┐
│ 📄 large_file.js • JavaScript • 2.8 MB  │
│                                          │
│ ⚠️  File too large for inline preview   │
│        [Open in Sidebar] [Download]     │
└─────────────────────────────────────────┘
```

### 5.3 Add Loading & Error States
**Goal**: Better UX during async operations  
**Files to Modify**: All new components

**Loading states**:
- Fetching content: Skeleton loader or spinner
- Saving edits: Disable buttons, show spinner
- Downloading: Progress indicator

**Error states**:
- Failed to fetch: "Unable to load preview" with Retry button
- Failed to save: "Save failed" with error message and Retry
- File not found: "File may have been deleted"
- Permission denied: "You don't have permission to edit this file"

**Pattern**: Use MUI `CircularProgress`, `Alert` components.

### 5.4 Add Keyboard Shortcuts
**Goal**: Power user efficiency  
**Files to Modify**: `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx`

**Shortcuts** (when attachment node selected):
- `Enter`: Toggle expanded state
- `e`: Enter edit mode (if editable)
- `s`: Open in sidebar
- `Escape`: Close preview/exit edit mode
- `Cmd/Ctrl+S`: Save (when editing)

**Pattern**: Follow `ImageComponent` keyboard command pattern from `src/editor/nodes/ImageNode/ImageComponent.tsx`.

**Implementation**:
```typescript
editor.registerCommand(
  KEY_ENTER_COMMAND,
  (event: KeyboardEvent) => {
    if (isSelected && $isNodeSelection($getSelection())) {
      event.preventDefault();
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isAttachmentNode(node)) {
          node.toggleExpanded();
        }
      });
      return true;
    }
    return false;
  },
  COMMAND_PRIORITY_LOW
)
```

---

## Testing Checklist

### Functionality Tests
- [ ] Upload attachment
- [ ] Download attachment (via button and click in view mode)
- [ ] Delete attachment
- [ ] Expand/collapse inline preview
- [ ] Open in sidebar
- [ ] Edit text file
- [ ] Save edited content
- [ ] Cancel edit with confirmation
- [ ] Syntax highlighting for all supported languages
- [ ] PDF preview
- [ ] Large file handling
- [ ] Cache invalidation after edit
- [ ] Keyboard shortcuts

### Edge Cases
- [ ] Binary file preview fallback
- [ ] Unsupported file type
- [ ] File deleted externally
- [ ] Concurrent edit conflict
- [ ] Network error during fetch/save
- [ ] File > 1MB
- [ ] Empty file
- [ ] File with no extension
- [ ] File with Unicode filename
- [ ] Permission denied

### Browser Testing
- [ ] Chrome/Edge (Chrome-specific details handling)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile Safari
- [ ] Mobile Chrome

### Performance
- [ ] IndexedDB caching working
- [ ] No memory leaks on expand/collapse
- [ ] Smooth animations
- [ ] No bundle size regression

---

## Dependencies

### Existing (Already Available)
- `prismjs` - Syntax highlighting
- `@lexical/code` - Code block support
- `@mui/material` - UI components
- `@reduxjs/toolkit` - State management

### To Consider Adding
- **Monaco Editor** or **CodeMirror** - Advanced code editing (optional, Phase 4+)
- **react-pdf** - Better PDF preview (optional, Phase 5)
- **react-syntax-highlighter** - Alternative to Prism (only if Prism insufficient)

**Recommendation**: Start without new dependencies, add only if needed.

---

## Migration Notes

### Backward Compatibility
- Existing attachments will work without changes
- Old `data-attachment` HTML will import correctly
- No database migration needed (files stored on filesystem)

### User Impact
- Enhanced UX, no breaking changes
- Users will see new expand/edit buttons on existing attachments
- Old documents with attachments render correctly

---

## Future Enhancements (Post-Launch)

### Version Control
- Track edit history for attachments
- Restore previous versions
- Show diff between versions

### Collaboration
- Real-time collaborative editing (via Y.js)
- Show who's currently viewing/editing
- Lock mechanism to prevent conflicts

### Advanced Features
- Drag-and-drop reorder attachments
- Attach multiple files at once
- Search within attachment content
- Link to specific line in attachment
- Attach from URL (external files)
- Convert attachment to inline code block

### Performance Optimizations
- Virtual scrolling for large files
- Stream large file content
- WebWorker for syntax highlighting
- Progressive image loading for image attachments

---

## References

### Key Files
- `src/editor/nodes/AttachmentNode/index.tsx` - Main node implementation
- `src/editor/nodes/AttachmentNode/AttachmentComponent.tsx` - UI component
- `src/editor/nodes/DetailsNode/DetailsContainerNode.ts` - Collapsible pattern
- `src/editor/nodes/ImageNode/ImageComponent.tsx` - Complex DecoratorNode pattern
- `src/components/AppDrawer.tsx` - Sidebar pattern
- `src/indexeddb/config.ts` - Caching infrastructure
- `src/store/appSlice.ts` - Redux state management

### Patterns to Follow
- Node state management: `DetailsContainerNode`
- Complex UI interactions: `ImageComponent`
- Keyboard shortcuts: `ImageComponent` command handlers
- Sidebar UI: `AppDrawer` + `EditDocumentInfo`
- Syntax highlighting: Existing Prism integration in `CodeNode`

---

**Last Updated**: 2026-01-10  
**Next Review**: After Phase 1 completion
