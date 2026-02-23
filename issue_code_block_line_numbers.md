# Code Block Line Numbers Issue

## Status: ✅ RESOLVED

## Problem Description

Line numbers in code blocks (triggered by `/code`) were only displayed for lines that contained text content. Empty lines did not show line numbers, creating a confusing visual gap in the numbering sequence.

**Example of the bug:**
```
1  | Install
   |                          ← Line 2 missing!
3  | cargo install cargo-udeps
4  | Run (requires nightly Rust)
   |                          ← Line 5 missing!
6  | cargo +nightly udeps
```

## Root Cause

### The Fundamental Issue
**`<br>` elements cannot have `::before` or `::after` pseudo-elements** because they are void (self-closing) HTML elements. Browsers simply ignore pseudo-elements on `<br>` tags.

### HTML Structure Problem
Lexical's CodeNode rendered lines as:
- **Lines with content:** `<span>text content</span><br>`
- **Empty lines:** `<br><br>` (consecutive BR tags with no span)

### CSS That Couldn't Work
The CSS attempted to display line numbers using `::before` on both spans and BR elements:

```css
.LexicalTheme__code > br + br {
  counter-increment: line-number;
}

.LexicalTheme__code > br + br:before {
  content: counter(line-number);  /* This never renders! */
}
```

Since `br::before` doesn't work in browsers, empty lines never displayed their line numbers.

## Solution

### Approach: Custom CodeNode with DOM Post-Processing

Created a custom `CodeNode` class that extends Lexical's `CodeNode` and injects `<span>&nbsp;</span>` elements for empty lines.

**Transformation:**
- **Before:** `<br><br>` (empty line with no element for `::before`)
- **After:** `<br><span>&nbsp;</span><br>` (empty line with span that supports `::before`)

### Implementation Details

**File:** `src/editor/nodes/CodeNode/index.tsx`

Key method that fixes the issue:

```typescript
private processCodeBlockDOM(element: HTMLElement): void {
  const children = Array.from(element.childNodes);

  for (let i = 0; i < children.length - 1; i++) {
    const current = children[i];
    const next = children[i + 1];

    // Look for consecutive <br> tags (empty line pattern)
    if (current.nodeName === "BR" && next.nodeName === "BR") {
      // Insert a span with non-breaking space between them
      const span = document.createElement("span");
      span.innerHTML = "&nbsp;";
      element.insertBefore(span, next);
      i++; // Skip the next element since we just processed it
    }
  }
}
```

### Critical Discovery: The `after` Callback

Initially tried overriding `createDOM()` and calling the processing immediately, but **the element had 0 children** at that point.

**The solution:** Use the `after` callback in `exportDOM()` which is called **after all child nodes are rendered**:

```typescript
exportDOM(editor: LexicalEditor): DOMExportOutput {
  const output = super.exportDOM(editor);

  return {
    ...output,
    after: (element) => {
      if (element instanceof HTMLElement) {
        this.processCodeBlockDOM(element);
        return element;
      }
      return element as HTMLElement | Text | null | undefined;
    },
  };
}
```

### Configuration Changes

**File:** `src/editor/config.tsx`

Added node replacement to swap Lexical's CodeNode with our custom one:

```typescript
import { CodeNode as LexicalCodeNode } from "@lexical/code";
import { CodeNode } from "./nodes/CodeNode";

nodes: [
  {
    replace: LexicalCodeNode,
    with: (node: LexicalCodeNode) => new CodeNode(node.getLanguage()),
  },
  CodeNode,
  // ... other nodes
]
```

### Result

**Before:**
```html
<span>1</span><br>
<span>2</span><br>
<br>                    <!-- Empty line, no element for ::before -->
<span>1</span>
```

**After:**
```html
<span>1</span><br>
<span>2</span><br>
<span>&nbsp;</span><br> <!-- Empty line with span! -->
<span>1</span>
```

Now the existing CSS `> br + span:before` selector can display the line number for empty lines.

## Files Modified

1. **`src/editor/nodes/CodeNode/index.tsx`** (new file)
   - Custom CodeNode implementation with `processCodeBlockDOM()` method
   - Overrides `exportDOM()` with `after` callback for post-processing
   - Includes helper functions `$createCodeNode()` and `$isCodeNode()`

2. **`src/editor/config.tsx`**
   - Imports custom CodeNode (renames Lexical's to `LexicalCodeNode`)
   - Adds node replacement configuration

## Key Learnings

1. **`<br>` elements cannot have pseudo-elements** - This is a fundamental browser limitation
2. **Timing matters** - DOM children aren't available immediately; use the `after` callback
3. **Node replacement works** - Lexical's `replace` directive successfully swaps node implementations
4. **`exportDOM()` is used for published content** - Not just clipboard operations
