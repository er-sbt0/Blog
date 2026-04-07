# Code Block Toolbar Controls Implementation Guide

## Overview

Implement toolbar controls to adjust code block width, similar to how ImageTools
provides controls for images. This approach is simpler and more reliable than
drag-to-resize handles.

## Architecture

Follow the existing pattern used by ImageTools:

- **Detection:** Identify when cursor is inside a code block
- **Toolbar:** Display width control buttons when code block is selected
- **Update:** Call `node.setWidth()` when user clicks a width option

## Implementation Steps

### Step 1: Create CodeTools Component

**File:** `src/editor/plugins/ToolbarPlugin/Tools/CodeTools.tsx`

```typescript
import { LexicalEditor } from "lexical";
import { $isCodeNode, CodeNode } from "@/editor/nodes/CodeNode";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { SxProps, Theme } from "@mui/material/styles";

export default function CodeTools({
  editor,
  node,
  sx,
}: {
  editor: LexicalEditor;
  node: CodeNode;
  sx?: SxProps<Theme> | undefined;
}) {
  const currentWidth = node.getWidth() || "100%";

  const handleWidthChange = (width: string) => {
    editor.update(() => {
      if ($isCodeNode(node)) {
        node.setWidth(width);
      }
    });
  };

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={currentWidth}
      sx={{ bgcolor: "background.default", ...sx }}
    >
      <ToggleButton
        value="50%"
        onClick={() => handleWidthChange("50%")}
      >
        50%
      </ToggleButton>
      <ToggleButton
        value="75%"
        onClick={() => handleWidthChange("75%")}
      >
        75%
      </ToggleButton>
      <ToggleButton
        value="100%"
        onClick={() => handleWidthChange("100%")}
      >
        100%
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
```

### Step 2: Update ToolbarPlugin to Show CodeTools

**File:** `src/editor/plugins/ToolbarPlugin/index.tsx`

Look for where ImageTools is conditionally rendered (search for `$isImageNode`),
and add similar logic for CodeNode:

```typescript
import { $isCodeNode } from "@/editor/nodes/CodeNode";
import CodeTools from "./Tools/CodeTools";

// Inside the toolbar component, after ImageTools section:

// Add this where other node-specific tools are rendered
{
  $isCodeNode(selectedNode) && (
    <CodeTools
      editor={editor}
      node={selectedNode as CodeNode}
    />
  );
}
```

### Step 3: Ensure Code Block Selection Works

The key is detecting when the cursor is inside a code block. Look at how
ToolbarPlugin detects the selected node:

```typescript
const updateToolbar = useCallback(() => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchorNode = selection.anchor.getNode();

    // Walk up to find parent code block
    let element = anchorNode.getKey() === "root"
      ? anchorNode
      : anchorNode.getTopLevelElementOrThrow();

    // Check if it's a code block
    if ($isCodeNode(element)) {
      setSelectedNode(element);
      return;
    }
  }
}, []);
```

### Step 4: Add Width Styling Support

The CodeNode already has width support in `exportDOM()`, but ensure the DOM
element receives the width:

**File:** `src/editor/nodes/CodeNode/index.tsx` (already implemented)

The current implementation applies width via inline styles in `exportDOM()`,
which should work for rendering.

### Step 5: Optional - Add Custom Width Input

Extend CodeTools to include a custom width input:

```typescript
import { InputAdornment, TextField } from "@mui/material";
import { useState } from "react";

// Add to CodeTools:
const [customWidth, setCustomWidth] = useState("");

<TextField
  size="small"
  value={customWidth}
  onChange={(e) => setCustomWidth(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter" && customWidth) {
      handleWidthChange(customWidth);
      setCustomWidth("");
    }
  }}
  placeholder="Custom"
  InputProps={{
    endAdornment: <InputAdornment position="end">px/%</InputAdornment>,
  }}
  sx={{ width: 100 }}
/>;
```

## Integration Points

### Files to Modify

1. **Create:** `src/editor/plugins/ToolbarPlugin/Tools/CodeTools.tsx`
2. **Modify:** `src/editor/plugins/ToolbarPlugin/index.tsx`
   - Import CodeTools
   - Add detection for code blocks
   - Render CodeTools when code block is selected

### Existing Code to Reference

- **ImageTools:** `src/editor/plugins/ToolbarPlugin/Tools/ImageTools.tsx`
  - Shows how to create node-specific toolbar controls
  - Pattern for updating node properties

- **ToolbarPlugin:** `src/editor/plugins/ToolbarPlugin/index.tsx`
  - Shows how to detect selected nodes
  - Pattern for conditional toolbar rendering

## Testing

1. Create a code block in the editor
2. Click inside the code block
3. Toolbar should appear with width buttons (50%, 75%, 100%)
4. Click a width button
5. Code block should resize
6. Reload page - width should persist
7. Copy/paste code block - width should be preserved

## Advantages Over Drag Handles

✅ Simpler implementation ✅ More discoverable UI ✅ Works consistently across
browsers ✅ Easier to maintain ✅ Keyboard accessible ✅ Mobile friendly ✅
Follows existing patterns in codebase

## Fallback: FloatingToolbar Alternative

If the main ToolbarPlugin is complex to modify, you can alternatively show width
controls in the FloatingToolbar (the one that appears on text selection):

**File:** `src/editor/plugins/FloatingToolbar/index.tsx`

Add code block detection and show width controls when inside a code block:

```typescript
if ($isCodeNode(parent)) {
  return <CodeTools editor={editor} node={parent} />;
}
```

This would show width controls in a floating toolbar when text is selected
inside a code block.

## Next Steps

1. Start with Step 1 - Create CodeTools.tsx
2. Find where ToolbarPlugin renders node-specific tools
3. Add CodeNode detection and render CodeTools
4. Test with a simple code block
5. Refine UI/UX as needed

---

**Date:** January 30, 2026 **Status:** Implementation Guide
