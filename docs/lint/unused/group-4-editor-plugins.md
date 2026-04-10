# Group 4 — Editor Plugins (`src/editor/plugins/`)

> Suggested commit message: `fix(lint): remove unused vars in editor plugins`
> Errors: **47**

---

## `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx` — 4 errors

### Unused imports (4)

| Line | Symbol                 | Fix    |
| ---- | ---------------------- | ------ |
| L23  | `MenuItem`             | Remove |
| L25  | `Select`               | Remove |
| L26  | `SelectChangeEvent`    | Remove |
| L37  | `FloatingActionButton` | Remove |

---

## `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` — 4 errors

### Unused imports (3)

| Line | Symbol              | Fix    |
| ---- | ------------------- | ------ |
| L23  | `MenuItem`          | Remove |
| L25  | `Select`            | Remove |
| L26  | `SelectChangeEvent` | Remove |

### Unused parameter (1)

| Line | Symbol | Fix          |
| ---- | ------ | ------------ |
| L79  | `sx`   | Prefix `_sx` |

---

## `src/editor/plugins/KanbanPlugin/index.ts` — 5 errors

### Unused imports (5)

| Line | Symbol                  | Fix    |
| ---- | ----------------------- | ------ |
| L15  | `LexicalEditor`         | Remove |
| L20  | `$createRangeSelection` | Remove |
| L21  | `$getSelection`         | Remove |
| L22  | `$isNodeSelection`      | Remove |
| L23  | `$setSelection`         | Remove |

---

## `src/editor/plugins/MarkdownPlugin/MarkdownTransformers.tsx` — 5 errors

### Unused imports (2)

| Line | Symbol          | Fix    |
| ---- | --------------- | ------ |
| L33  | `$isRootNode`   | Remove |
| L37  | `ParagraphNode` | Remove |

### Unused parameters (3)

| Line | Symbol         | Fix                    |
| ---- | -------------- | ---------------------- |
| L547 | `exportFormat` | Prefix `_exportFormat` |
| L808 | `match`        | Prefix `_match`        |
| L865 | `isImport`     | Prefix `_isImport`     |

---

## `src/editor/plugins/ToolbarPlugin/Tools/ColorPicker.tsx` — 4 errors

### Unused parameters (`e` in event handlers) (4)

| Line | Symbol | Fix         |
| ---- | ------ | ----------- |
| L127 | `e`    | Prefix `_e` |
| L137 | `e`    | Prefix `_e` |
| L147 | `e`    | Prefix `_e` |
| L162 | `e`    | Prefix `_e` |

---

## `src/editor/plugins/FloatingToolbar/FloatingAITools.tsx` — 2 errors

### Unused imports (2)

| Line | Symbol        | Fix    |
| ---- | ------------- | ------ |
| L11  | `LexicalNode` | Remove |
| L18  | `AutoAwesome` | Remove |

---

## `src/editor/plugins/ToolbarPlugin/index.tsx` — 2 errors

### Unused parameters (2)

| Line | Symbol      | Fix                 |
| ---- | ----------- | ------------------- |
| L92  | `onDiscard` | Prefix `_onDiscard` |
| L92  | `onSave`    | Prefix `_onSave`    |

---

## `src/editor/plugins/MathPlugin/index.tsx` — 2 errors

### Unused parameters (2)

| Line | Symbol  | Fix             |
| ---- | ------- | --------------- |
| L56  | `event` | Prefix `_event` |
| L79  | `event` | Prefix `_event` |

---

## `src/editor/plugins/ToolbarPlugin/Dialogs/ImageDialog.tsx` — 2 errors

### Unused catch variables (2)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L83  | `e`    | Bare `catch {` |
| L109 | `e`    | Bare `catch {` |

---

## `src/editor/plugins/ToolbarPlugin/Dialogs/LinkDialog.tsx` — 2 errors

### Unused import (1)

| Line | Symbol | Fix    |
| ---- | ------ | ------ |
| L12  | `Box`  | Remove |

### Unused parameter (1)

| Line | Symbol | Fix           |
| ---- | ------ | ------------- |
| L74  | `key`  | Prefix `_key` |

---

## `src/editor/plugins/TablePlugin/LexicalTablePluginHelpers.ts` — 2 errors

### Unused locals (2)

| Line | Symbol                                | Fix                           |
| ---- | ------------------------------------- | ----------------------------- |
| L188 | `$findParentTableCellNodeInTable`     | Remove assignment (dead code) |
| L206 | `$getObserverCellFromCellNodeOrThrow` | Remove assignment (dead code) |

---

## `src/editor/plugins/ToolbarPlugin/Menus/AlignTextMenu.tsx` — 3 errors

### Unused imports (2)

| Line | Symbol             | Fix    |
| ---- | ------------------ | ------ |
| L6   | `$isParagraphNode` | Remove |
| L8   | `$isTextNode`      | Remove |

### Unused parameter (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L87  | `tags` | Prefix `_tags` |

---

## `src/editor/plugins/ToolbarPlugin/Tools/CodeTools.tsx` — 2 errors

### Unused imports (2)

| Line | Symbol              | Fix    |
| ---- | ------------------- | ------ |
| L6   | `ElementFormatType` | Remove |
| L21  | `$patchStyle`       | Remove |

---

## `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx` — 1 error

### Unused local (1)

| Line | Symbol                | Fix               |
| ---- | --------------------- | ----------------- |
| L339 | `clearTableSelection` | Remove assignment |

---

## Single-error files (1 error each)

| File                                                           | Line | Symbol                 | Kind              | Fix                               |
| -------------------------------------------------------------- | ---- | ---------------------- | ----------------- | --------------------------------- |
| `src/editor/plugins/FloatingToolbar/index.tsx`                 | L56  | `e`                    | param             | `_e`                              |
| `src/editor/plugins/HorizontalRulePlugin/index.ts`             | L28  | `type`                 | param             | `_type`                           |
| `src/editor/plugins/LinkPlugin/AutoLinkPlugin.tsx`             | L18  | `e`                    | catch var         | Bare `catch {`                    |
| `src/editor/plugins/SavePlugin/index.tsx`                      | L5   | `IS_APPLE`             | import            | Remove                            |
| `src/editor/plugins/ToolbarPlugin/Dialogs/GraphDialog.tsx`     | L127 | `reject`               | param             | `_reject`                         |
| `src/editor/plugins/ToolbarPlugin/Dialogs/OCRDialog.tsx`       | L108 | `err`                  | param             | `_err`                            |
| `src/editor/plugins/ToolbarPlugin/Menus/BlockFormatSelect.tsx` | L74  | `blockTypeToBlockName` | local (type-only) | Use `type` import or remove const |
| `src/editor/plugins/ToolbarPlugin/Menus/FontSelect.tsx`        | L243 | `e`                    | param             | `_e`                              |
| `src/editor/plugins/ToolbarPlugin/Menus/InsertToolMenu.tsx`    | L37  | `ImageSearch`          | import            | Remove                            |
| `src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx`           | L73  | `sx`                   | param             | `_sx`                             |
| `src/editor/plugins/ToolbarPlugin/Tools/ImageTools.tsx`        | L21  | `FloatingActionButton` | import            | Remove                            |
