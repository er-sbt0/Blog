# Code Block Dynamic Width Feature

## Overview

Enable dynamic width adjustment for code blocks in the Lexical editor. Currently, code blocks have a fixed width of 100%, which may not be optimal for all use cases (e.g., short command snippets, narrow code examples, or wide data tables).

## Current Implementation

The code block is implemented via a custom `CodeNode` that extends Lexical's `CodeNode`:

- **Location:** `src/editor/nodes/CodeNode/index.tsx`
- **Current Features:**
  - Line numbering support for empty lines
  - Syntax highlighting via CodeHighlightNode
  - Fixed 100% width with horizontal scrolling
- **Styling:** `src/editor/theme.css` (`.LexicalTheme__code`)

## Solution Options

### Option 1: Width Property in Node Data ⭐ Recommended

**Description:** Extend the `CodeNode` to store width as part of its serialized data.

**Pros:**
- Width persists in the document JSON
- Survives page reloads, exports, and copy/paste operations
- Clean separation of concerns (data vs. presentation)
- Consistent with Lexical's architecture
- Easy to implement undo/redo

**Cons:**
- Requires extending the serialization format
- Need to handle migration for existing code blocks
- Slightly more complex implementation

**Implementation Details:**
```typescript
// Extend SerializedCodeNode interface
interface SerializedCodeNodeWithWidth extends SerializedCodeNode {
  width?: string; // e.g., "80%", "600px", "100%"
}

// Add to CodeNode class
class CodeNode extends LexicalCodeNode {
  __width?: string;

  setWidth(width: string): void
  getWidth(): string | undefined
  exportJSON(): SerializedCodeNodeWithWidth
  static importJSON(serializedNode: SerializedCodeNodeWithWidth): CodeNode
  exportDOM(editor: LexicalEditor): DOMExportOutput // Apply width via inline styles
}
```

**Migration Strategy:**
- Default to `100%` for existing code blocks
- Gradually add width controls to UI

---

### Option 2: CSS Custom Properties with Inline Styles

**Description:** Apply width directly as inline styles or CSS custom properties on the DOM element.

**Pros:**
- Simple and straightforward implementation
- No schema changes needed
- Flexible - supports any CSS width value
- Responsive and works with existing CSS

**Cons:**
- Width not persisted in document data (lost on copy/paste)
- Harder to track in version history
- May conflict with global styles
- No undo/redo support without additional work

**Implementation Details:**
```typescript
exportDOM(editor: LexicalEditor): DOMExportOutput {
  const output = super.exportDOM(editor);
  return {
    ...output,
    after: (element) => {
      if (element instanceof HTMLElement) {
        element.style.width = this.__width || '100%';
        // or using CSS custom property:
        // element.style.setProperty('--code-width', this.__width || '100%');
      }
      return element;
    },
  };
}
```

---

### Option 3: Preset Width Classes

**Description:** Define a set of preset width classes (e.g., small, medium, large, full) instead of arbitrary values.

**Pros:**
- Consistent sizing across all code blocks
- Easy to maintain and update globally
- Simpler UI (dropdown instead of free input)
- Good for enforcing design system consistency
- Easy theme support

**Cons:**
- Less flexible than arbitrary width values
- Users cannot set custom exact widths
- May not cover all use cases

**Implementation Details:**
```css
/* theme.css */
.LexicalTheme__code.code-width-small {
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.LexicalTheme__code.code-width-medium {
  max-width: 800px;
}

.LexicalTheme__code.code-width-large {
  max-width: 1200px;
}

.LexicalTheme__code.code-width-full {
  width: 100%;
}
```

```typescript
// In CodeNode
__widthClass?: 'small' | 'medium' | 'large' | 'full';
```

---

### Option 4: Decorator Pattern with Resize Handle

**Description:** Add interactive resize handles (similar to image resizing) using Lexical's decorator system.

**Pros:**
- Intuitive and familiar UX (drag-to-resize)
- Visual feedback during resizing
- Direct manipulation feels natural
- Can show width value while dragging
- Works well with Option 1 for persistence

**Cons:**
- More complex implementation
- Requires handling drag events and edge cases
- May have performance considerations
- Touch device support needed

**Implementation Details:**
```typescript
// Create ResizableCodeDecorator component
const ResizableCodeDecorator: React.FC = () => {
  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState('100%');

  return (
    <div style={{ width, position: 'relative' }}>
      <code>{/* code content */}</code>
      <div
        className="resize-handle-left"
        onMouseDown={handleResizeStart}
      />
      <div
        className="resize-handle-right"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};
```

---

### Option 5: Context Menu / Toolbar Control

**Description:** Add width controls to the code block toolbar or context menu.

**Pros:**
- Discoverable and accessible interface
- Can combine with other code block options (language, line numbers, theme)
- No visual clutter when not editing
- Accessible via keyboard
- Can provide both presets and custom input

**Cons:**
- Requires additional UI components
- Takes up toolbar space
- Less immediate than drag handles

**Implementation Details:**
```typescript
// Add to CodePlugin toolbar
<ToolbarButton
  icon={<WidthIcon />}
  onClick={openWidthDialog}
/>

// Width dialog/dropdown
<WidthPicker
  presets={['50%', '75%', '100%']}
  allowCustom={true}
  value={currentWidth}
  onChange={handleWidthChange}
/>
```

---

## Recommended Implementation

**Combined Approach: Option 1 + Option 4 + Option 5**

1. **Data Layer (Option 1):** Store width in node data for persistence
2. **UI Layer (Option 4 + 5):** Provide both resize handles and toolbar controls
3. **Support both percentage and pixel values** (e.g., "80%", "600px")
4. **Default to 100%** for backward compatibility

### Implementation Steps

1. **Phase 1: Data Layer**
   - Extend `CodeNode` with `__width` property
   - Update serialization (importJSON/exportJSON)
   - Apply width in exportDOM

2. **Phase 2: Basic UI**
   - Add width dropdown to code block toolbar
   - Support preset values: 50%, 75%, 100%
   - Add custom width input option

3. **Phase 3: Advanced UI (Optional)**
   - Add resize handles to code blocks
   - Implement drag-to-resize functionality
   - Add visual feedback during resize

4. **Phase 4: Polish**
   - Add keyboard shortcuts
   - Responsive behavior on mobile
   - Accessibility improvements (ARIA labels)

### Width Value Format

Support multiple formats:
- **Percentage:** `"80%"`, `"100%"`
- **Pixels:** `"600px"`, `"1200px"`
- **Keywords:** `"auto"`, `"fit-content"`
- **Default:** `"100%"` (maintains current behavior)

### Edge Cases to Consider

- **Minimum width:** Don't allow code blocks narrower than 300px
- **Maximum width:** Respect container bounds
- **Responsive behavior:** Consider how width behaves on mobile devices
- **RTL support:** Ensure resize handles work in right-to-left layouts
- **Copy/paste:** Preserve width when copying between documents
- **Export:** Include width in HTML export for blog posts

---

## Alternative Considerations

### Container-Based Width
Instead of per-block width, could use container/column layouts where code blocks respect their parent width. This would be more in line with modern layout systems but requires broader architectural changes.

### Breakpoint-Specific Widths
Allow setting different widths for different screen sizes (mobile, tablet, desktop). More complex but more responsive.

---

## Related Files

- `src/editor/nodes/CodeNode/index.tsx` - Main node implementation
- `src/editor/theme.css` - Code block styling (`.LexicalTheme__code`)
- `src/editor/config.tsx` - Editor configuration with node registration
- `src/editor/plugins/CodeActionMenuPlugin/` - Code block toolbar (if exists)

---

## Timeline Estimate

- **Phase 1 (Data Layer):** 2-4 hours
- **Phase 2 (Basic UI):** 4-6 hours
- **Phase 3 (Advanced UI):** 8-12 hours
- **Phase 4 (Polish):** 4-6 hours

**Total:** 18-28 hours for full implementation

---

**Date Created:** January 30, 2026
**Status:** Planning / Design Phase
