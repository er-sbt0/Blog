# Group 3 — Editor Nodes (`src/editor/nodes/`)

> ✅ **Committed** — `fix(lint): remove unused vars in editor nodes`
> All 41 errors resolved. ESLint finds **0** `@typescript-eslint/no-unused-vars`
> in `src/editor/nodes/`.

> ~~Errors: **41**~~

---

## `src/editor/nodes/AttachmentNode/AttachmentPreview.tsx` — 14 errors

### Unused imports (7)

| Line | Symbol             | Fix    |
| ---- | ------------------ | ------ |
| L6   | `Button`           | Remove |
| L7   | `CircularProgress` | Remove |
| L11  | `TextField`        | Remove |
| L15  | `Cancel`           | Remove |
| L16  | `ExpandLess`       | Remove |
| L17  | `ExpandMore`       | Remove |
| L20  | `Save`             | Remove |

### Unused locals (7)

| Line | Symbol                | Fix                     |
| ---- | --------------------- | ----------------------- |
| L65  | `INLINE_MAX_SIZE`     | Remove assignment       |
| L178 | `isSaving`            | Remove from destructure |
| L179 | `saveError`           | Remove from destructure |
| L189 | `languageDisplayName` | Remove assignment       |
| L303 | `handleToggleExpand`  | Remove assignment       |
| L312 | `handleSave`          | Remove assignment       |
| L347 | `handleCancelEdit`    | Remove assignment       |

---

## `src/editor/nodes/KanbanNode/index.tsx` — 7 errors

### Unused imports (7)

| Line | Symbol                 | Fix    |
| ---- | ---------------------- | ------ |
| L2   | `BaseSelection`        | Remove |
| L4   | `EditorConfig`         | Remove |
| L5   | `LexicalEditor`        | Remove |
| L13  | `$createNodeSelection` | Remove |
| L14  | `$getSelection`        | Remove |
| L15  | `$setSelection`        | Remove |
| L17  | `isHTMLElement`        | Remove |

---

## `src/editor/nodes/DetailsNode/DetailsContentNode.ts` — 4 errors

### Unused parameters (4)

| Line | Symbol           | Fix                      |
| ---- | ---------------- | ------------------------ |
| L27  | `domNode`        | Prefix `_domNode`        |
| L74  | `dom`            | Prefix `_dom`            |
| L74  | `prevNode`       | Prefix `_prevNode`       |
| L100 | `serializedNode` | Prefix `_serializedNode` |

---

## `src/editor/nodes/DetailsNode/DetailsSummaryNode.ts` — 2 errors

### Unused parameters (2)

| Line | Symbol    | Fix               |
| ---- | --------- | ----------------- |
| L31  | `domNode` | Prefix `_domNode` |
| L90  | `domNode` | Prefix `_domNode` |

---

## `src/editor/nodes/HorizontalRuleNode/index.tsx` — 2 errors

### Unused import (1)

| Line | Symbol | Fix    |
| ---- | ------ | ------ |
| L18  | `lazy` | Remove |

### Unused parameter (1)

| Line | Symbol           | Fix                      |
| ---- | ---------------- | ------------------------ |
| L36  | `serializedNode` | Prefix `_serializedNode` |

---

## `src/editor/nodes/ImageNode/index.tsx` — 2 errors

### Unused parameter (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L160 | `node` | Prefix `_node` |

### Unused catch variable (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L336 | `e`    | Bare `catch {` |

---

## `src/editor/nodes/MathNode/index.tsx` — 2 errors

### Unused parameter (1)

| Line | Symbol   | Fix              |
| ---- | -------- | ---------------- |
| L73  | `editor` | Prefix `_editor` |

### Unused catch variable (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L148 | `e`    | Bare `catch {` |

---

## `src/editor/nodes/TableNode/TableCellNode.ts` — 2 errors

### Unused parameters (2)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L57  | `node` | Prefix `_node` |
| L61  | `node` | Prefix `_node` |

---

## Single-error files (1 error each)

| File                                                   | Line | Symbol           | Kind      | Fix               |
| ------------------------------------------------------ | ---- | ---------------- | --------- | ----------------- |
| `src/editor/nodes/AttachmentNode/AttachmentEditor.tsx` | L29  | `language`       | param     | `_language`       |
| `src/editor/nodes/DetailsNode/DetailsContainerNode.ts` | L125 | `domNode`        | param     | `_domNode`        |
| `src/editor/nodes/KanbanNode/KanbanComponent.tsx`      | L6   | `updateTask`     | import    | Remove            |
| `src/editor/nodes/PageBreakNode/index.tsx`             | L31  | `serializedNode` | param     | `_serializedNode` |
| `src/editor/nodes/StickyNode/config.tsx`               | L48  | `node`           | param     | `_node`           |
| `src/editor/nodes/StickyNode/index.tsx`                | L175 | `e`              | catch var | Bare `catch {`    |
| `src/editor/nodes/TableNode/TableNode.ts`              | L208 | `e`              | catch var | Bare `catch {`    |
