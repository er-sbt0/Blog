# Code Block Language Indicator Feature

## Feature Request

Add a visual CSS/UI indicator to code blocks that displays the file type/programming language. This would improve user experience by making it immediately clear what language is being shown in each code block.

## Current State

The CodeNode supports language syntax highlighting and has a `__language` property that stores the programming language, but there's no visual indicator showing the language to users.

## Implementation Approaches

### Approach 1: Language Badge (Recommended) ⭐

Add a small language badge in the top-right corner of the code block. This is clean, non-intrusive, and commonly used in popular documentation sites like GitHub, MDN, and Stack Overflow.

#### Benefits
- ✅ Clear and professional appearance
- ✅ Non-intrusive design
- ✅ Easy to implement with CSS
- ✅ Customizable colors per language
- ✅ Works well with existing code structure
- ✅ Mobile-friendly

#### Implementation Steps

**1. Modify CodeNode to add language data attribute:**

```typescript
createDOM(config: EditorConfig): HTMLElement {
  const element = super.createDOM(config);
  if (this.__width) {
    element.style.width = this.__width;
  }
  // Add language as data attribute for CSS styling
  if (this.__language) {
    element.setAttribute('data-language', this.__language);
  }
  return element;
}

updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
  const isUpdated = super.updateDOM(prevNode, dom, config);

  // Update width if it changed
  if (prevNode.__width !== this.__width) {
    if (this.__width) {
      dom.style.width = this.__width;
    } else {
      dom.style.width = "";
    }
  }

  // Update language data attribute if it changed
  if (prevNode.__language !== this.__language) {
    if (this.__language) {
      dom.setAttribute('data-language', this.__language);
    } else {
      dom.removeAttribute('data-language');
    }
  }

  return isUpdated;
}
```

**2. Add CSS for the language badge:**

```css
/* Position the code block container */
pre[data-language] {
  position: relative;
  padding-top: 2.5rem; /* Make room for the badge */
}

/* Language badge */
pre[data-language]::before {
  content: attr(data-language);
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.05em;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

/* Language-specific colors */
pre[data-language="javascript"]::before,
pre[data-language="js"]::before {
  background: rgba(247, 223, 30, 0.15);
  color: #f7df1e;
  border-color: rgba(247, 223, 30, 0.3);
}

pre[data-language="typescript"]::before,
pre[data-language="ts"]::before,
pre[data-language="tsx"]::before {
  background: rgba(49, 120, 198, 0.15);
  color: #3178c6;
  border-color: rgba(49, 120, 198, 0.3);
}

pre[data-language="python"]::before,
pre[data-language="py"]::before {
  background: rgba(53, 114, 165, 0.15);
  color: #3572a5;
  border-color: rgba(53, 114, 165, 0.3);
}

pre[data-language="rust"]::before {
  background: rgba(222, 165, 132, 0.15);
  color: #dea584;
  border-color: rgba(222, 165, 132, 0.3);
}

pre[data-language="css"]::before {
  background: rgba(86, 61, 124, 0.15);
  color: #563d7c;
  border-color: rgba(86, 61, 124, 0.3);
}

pre[data-language="java"]::before {
  background: rgba(176, 114, 25, 0.15);
  color: #b07219;
  border-color: rgba(176, 114, 25, 0.3);
}

pre[data-language="go"]::before {
  background: rgba(0, 173, 216, 0.15);
  color: #00add8;
  border-color: rgba(0, 173, 216, 0.3);
}

pre[data-language="ruby"]::before,
pre[data-language="rb"]::before {
  background: rgba(112, 21, 22, 0.15);
  color: #cc342d;
  border-color: rgba(204, 52, 45, 0.3);
}

pre[data-language="php"]::before {
  background: rgba(79, 93, 149, 0.15);
  color: #4f5d95;
  border-color: rgba(79, 93, 149, 0.3);
}

pre[data-language="c"]::before,
pre[data-language="cpp"]::before,
pre[data-language="c++"]::before {
  background: rgba(85, 85, 85, 0.15);
  color: #555555;
  border-color: rgba(85, 85, 85, 0.3);
}

pre[data-language="shell"]::before,
pre[data-language="bash"]::before,
pre[data-language="sh"]::before {
  background: rgba(137, 224, 81, 0.15);
  color: #89e051;
  border-color: rgba(137, 224, 81, 0.3);
}

pre[data-language="json"]::before {
  background: rgba(41, 128, 185, 0.15);
  color: #2980b9;
  border-color: rgba(41, 128, 185, 0.3);
}

pre[data-language="html"]::before {
  background: rgba(227, 76, 38, 0.15);
  color: #e34c26;
  border-color: rgba(227, 76, 38, 0.3);
}

pre[data-language="sql"]::before {
  background: rgba(224, 153, 0, 0.15);
  color: #e09900;
  border-color: rgba(224, 153, 0, 0.3);
}
```

---

### Approach 2: File Tab Style

Make the language indicator look like an IDE tab at the top of the code block.

#### Benefits
- ✅ Familiar IDE-like appearance
- ✅ Clear visual separation
- ✅ Good for users coming from IDEs

#### Drawbacks
- ❌ Takes more vertical space
- ❌ May conflict with code block toolbar

#### CSS Implementation

```css
pre[data-language] {
  position: relative;
  padding-top: 2.5rem;
  margin-top: 1.5rem; /* Space for the tab */
}

pre[data-language]::before {
  content: attr(data-language);
  position: absolute;
  top: -1.5rem;
  left: 0;
  padding: 0.5rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-top-left-radius: 0.5rem;
  border-top-right-radius: 0.5rem;
  font-size: 0.8rem;
  font-family: 'Monaco', 'Courier New', monospace;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 2px solid #3178c6; /* Language-specific color */
}
```

---

### Approach 3: Colored Left Border Accent

Subtle colored border on the left side indicating the language type.

#### Benefits
- ✅ Very subtle and clean
- ✅ No space overhead
- ✅ Color-coding at a glance

#### Drawbacks
- ❌ Not immediately obvious what language it is
- ❌ Requires learning the color scheme

#### CSS Implementation

```css
pre[data-language] {
  border-left: 4px solid;
  position: relative;
}

pre[data-language="javascript"],
pre[data-language="js"] {
  border-left-color: #f7df1e;
}

pre[data-language="typescript"],
pre[data-language="ts"],
pre[data-language="tsx"] {
  border-left-color: #3178c6;
}

pre[data-language="python"] {
  border-left-color: #3572a5;
}

/* Small tooltip showing language name on hover */
pre[data-language]::after {
  content: attr(data-language);
  position: absolute;
  top: 0.5rem;
  left: -0.5rem;
  opacity: 0;
  transition: opacity 0.2s;
  background: black;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;
}

pre[data-language]:hover::after {
  opacity: 1;
}
```

---

### Approach 4: Icon-based Indicators

Use language-specific icons (emoji or SVG icons).

#### Benefits
- ✅ Fun and engaging
- ✅ Recognizable at a glance
- ✅ Space-efficient

#### Drawbacks
- ❌ Requires icon library or emoji (not all languages have obvious icons)
- ❌ May not be professional enough for some contexts
- ❌ Accessibility concerns

#### Implementation

```typescript
// Language to icon mapping
const LANGUAGE_ICONS: Record<string, string> = {
  javascript: '📜',
  typescript: '🔷',
  python: '🐍',
  rust: '🦀',
  go: '🐹',
  java: '☕',
  ruby: '💎',
  php: '🐘',
  swift: '🦅',
  kotlin: '🅺',
  csharp: '#️⃣',
  bash: '🐚',
  sql: '🗄️',
};

// In createDOM:
if (this.__language) {
  element.setAttribute('data-language', this.__language);
  if (LANGUAGE_ICONS[this.__language]) {
    element.setAttribute('data-icon', LANGUAGE_ICONS[this.__language]);
  }
}
```

```css
pre[data-icon]::before {
  content: attr(data-icon) ' ' attr(data-language);
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0.25rem;
  font-size: 0.85rem;
  backdrop-filter: blur(10px);
}
```

---

## Recommendation

**Implement Approach 1: Language Badge**

This approach offers the best balance of:
- Professional appearance
- Clear communication
- Easy implementation
- Customizability
- Mobile responsiveness
- Compatibility with existing features (toolbar, line numbers, etc.)

### Integration Points

1. **CodeNode** (`src/editor/nodes/CodeNode/index.tsx`)
   - Add `data-language` attribute in `createDOM()`
   - Update attribute in `updateDOM()` when language changes
   - Also update `exportDOM()` to include the attribute for exported content

2. **Styling**
   - Add CSS to global styles or component-specific stylesheet
   - Consider dark/light theme variants
   - Ensure it doesn't conflict with the code block toolbar

3. **Testing Considerations**
   - Test with various languages
   - Test with and without line numbers
   - Test with different width settings
   - Test in read-only vs editable mode
   - Test on mobile devices

## Future Enhancements

- Allow users to toggle language indicators on/off
- Add custom language mappings
- Support for file extensions (e.g., `.tsx`, `.py`)
- Animate on hover
- Click to copy language name
- Support for multiple languages in one block (rare but possible)
