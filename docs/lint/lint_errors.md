# ESLint Findings

> Run: `source ~/.nvm/nvm.sh && npx eslint .` Date: 2026-04-10 **Total: 479
> problems — 470 errors, 9 warnings**

---

## Summary by Rule

| Rule                                       | Severity | Count (approx.) | Description                                                        |
| ------------------------------------------ | -------- | --------------- | ------------------------------------------------------------------ |
| `@typescript-eslint/no-unused-vars`        | error    | ~230            | Variables, imports, or parameters declared but never used          |
| `react-hooks/exhaustive-deps`              | error    | ~65             | Missing or unnecessary React hook dependencies                     |
| `@typescript-eslint/no-explicit-any`       | error    | ~75             | Use of `any` type instead of a specific type                       |
| `@typescript-eslint/ban-ts-comment`        | error    | ~17             | `@ts-expect-error` / `@ts-ignore` directives without a description |
| `@typescript-eslint/no-unused-expressions` | error    | ~10             | Expression statements that have no side effects                    |
| `no-console`                               | error    | 20              | Disallowed `console.log` calls (only `warn`/`error` are permitted) |
| `@typescript-eslint/no-namespace`          | error    | 1               | ES2015 module syntax preferred over `namespace`                    |
| `@next/next/no-img-element`                | warning  | 3               | `<img>` used instead of Next.js `<Image />`                        |
| Unused `eslint-disable` directive          | warning  | 6               | `eslint-disable` comments suppressing rules that no longer fire    |

---

## 1. `@typescript-eslint/no-unused-vars` (~230 errors)

Unused imports, local variables, destructured values, and function parameters.

**Hotspot files:**

| File                                                           | Examples                                                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/store/app.ts`                                             | `Alert`, `Series`, `data`, `coauthors`, `published`, `collab`, `isPrivate`, `action`                                                                               |
| `src/editor/nodes/KanbanNode/index.tsx`                        | `BaseSelection`, `EditorConfig`, `LexicalEditor`, `$createNodeSelection`, `$getSelection`, `$setSelection`, `isHTMLElement`                                        |
| `src/editor/plugins/KanbanPlugin/index.ts`                     | `LexicalEditor`, `$createRangeSelection`, `$getSelection`, `$isNodeSelection`, `$setSelection`                                                                     |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`         | `MenuItem`, `Select`, `SelectChangeEvent`, `FloatingActionButton`                                                                                                  |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` | Same as above + `sx`                                                                                                                                               |
| `src/editor/utils/docx/mathml2omml/mathml/*.js`                | `previousSibling`, `nextSibling`, `ancestors` (repeated across `math.js`, `menclose.js`, `mglyph.js`, `mrow.js`, `mspace.js`, `msqrt.js`, `mstyle.js`, `table.js`) |
| `src/editor/nodes/DetailsNode/DetailsContentNode.ts`           | `domNode`, `prevNode`, `dom`, `serializedNode`                                                                                                                     |
| `src/editor/plugins/ToolbarPlugin/Menus/BlockFormatSelect.tsx` | `blockTypeToBlockName` (used only as type)                                                                                                                         |
| `src/editor/plugins/FloatingToolbar/FloatingAITools.tsx`       | `LexicalNode`, `AutoAwesome`                                                                                                                                       |
| `src/utils/__tests__/collaborators.test.ts`                    | `any` cast, multiple unused vars                                                                                                                                   |
| `src/store/app/duplicateDocument.ts`                           | `BackupDocument`, `UserDocument`, `error`                                                                                                                          |
| `src/middleware.ts`                                            | `request`                                                                                                                                                          |
| `src/lib/auth.ts`                                              | `account`, `token`                                                                                                                                                 |
| `src/repositories/series.ts`                                   | `Prisma`                                                                                                                                                           |
| `src/repositories/notes.ts`                                    | `authorSelect`                                                                                                                                                     |
| `src/repositories/post.ts`                                     | `anyDocument`                                                                                                                                                      |
| `src/shared/invariant.ts`                                      | `args`                                                                                                                                                             |
| `src/hooks/useNotesStore.ts`                                   | `session`                                                                                                                                                          |
| `src/utils/migrateNotes.ts`                                    | `Note`, `backendCanvas`                                                                                                                                            |

---

## 2. `react-hooks/exhaustive-deps` (~65 errors)

React hooks (`useEffect`, `useCallback`, `useMemo`) with missing, unnecessary,
or unknown dependencies.

**Sub-categories:**

### Missing dependencies

| File                                                            | Hook                                 | Missing                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/editor/nodes/ImageNode/ImageCaption.tsx`                   | `useEffect`                          | `parentEditor`                                                                                                                                               |
| `src/editor/nodes/MathNode/MathComponent.tsx`                   | `useEffect` (×4)                     | `editor`, `nodeKey`, `setSelected`, `clearSelection`, `initialValue`, `isSelected`                                                                           |
| `src/editor/nodes/ImageNode/ImageComponent.tsx`                 | `useEffect` (×2)                     | `editor`, `isResizing`, `onLoad`, `element`, `height`, `width`                                                                                               |
| `src/editor/plugins/ComponentPickerPlugin/index.tsx`            | `useMemo`                            | `openAttachmentDialog`, `openGraphDialog`, `openIFrameDialog`, `openImageDialog`, `openLayoutDialog`, `openOCRDialog`, `openSketchDialog`, `openTableDialog` |
| `src/editor/plugins/FloatingToolbar/FloatingAITools.tsx`        | `useEffect`                          | `convertMarkdownToJSON`, `editor`, `updateDocument`                                                                                                          |
| `src/editor/plugins/MarkdownPlugin/MarkdownShortcutPlugin.tsx`  | `useEffect`                          | `transformers`                                                                                                                                               |
| `src/editor/plugins/ToolbarPlugin/Dialogs/GraphDialog.tsx`      | `useEffect` (×2)                     | `loadGgbBase64`, `handleClose`                                                                                                                               |
| `src/editor/plugins/ToolbarPlugin/Dialogs/Sketch/index.tsx`     | `useEffect` (×2)                     | `loadSceneOrLibrary`, `handleClose`                                                                                                                          |
| `src/editor/plugins/ToolbarPlugin/Dialogs/LinkDialog.tsx`       | `useMemo`, `useEffect`               | `editor`, `figures`                                                                                                                                          |
| `src/editor/plugins/ToolbarPlugin/Menus/FontSelect.tsx`         | `useEffect`, `useCallback` (×2)      | `updateToolbar`, `updateFontFamily`, `restoreFocus`                                                                                                          |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`          | `useEffect` (×3), `useCallback` (×3) | `editor`, `value`, `editor`+`handleClose`                                                                                                                    |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx`  | `useEffect` (×3), `useCallback` (×3) | Same pattern                                                                                                                                                 |
| `src/editor/plugins/ToolbarPlugin/Tools/NoteTools.tsx`          | `useEffect` (×2)                     | `editor`, `node`                                                                                                                                             |
| `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx`         | `useEffect` (×4), `useCallback` (×7) | `getCellStyle`, `handleClose`, `editor`, `applyCellStyle`, etc.                                                                                              |
| `src/editor/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx`  | `useEffect`                          | `openLinkDialog`                                                                                                                                             |
| `src/editor/plugins/ToolbarPlugin/Tools/CodeTools.tsx`          | `useEffect`                          | `editor`                                                                                                                                                     |
| `src/editor/plugins/ToolbarPlugin/Tools/ImageTools.tsx`         | `useEffect`                          | `currentNodeStyle`                                                                                                                                           |
| `src/editor/plugins/ToolbarPlugin/Tools/ImageToolsFloating.tsx` | `useEffect`                          | `currentNodeStyle`                                                                                                                                           |
| `src/editor/plugins/ToolbarPlugin/index.tsx`                    | `useEffect` (×2)                     | `editor`, `activeEditor`                                                                                                                                     |
| `src/hooks/useTimeEditing.ts`                                   | `useCallback`                        | `errorAnnounce`                                                                                                                                              |

### Unnecessary dependencies

| File                                                           | Hook               | Unnecessary                                             |
| -------------------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| `src/editor/nodes/ImageNode/ImageComponent.tsx`                | `useCallback`      | `editor`                                                |
| `src/editor/plugins/ToolbarPlugin/Menus/AlignTextMenu.tsx`     | `useCallback`      | `editor`                                                |
| `src/editor/plugins/ToolbarPlugin/Menus/FontSelect.tsx`        | `useCallback`      | `editor`, `shouldMergeHistoryRef.current` (mutable ref) |
| `src/editor/plugins/ToolbarPlugin/Tools/TextFormatToggles.tsx` | `useCallback`      | `editor`                                                |
| `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx`        | `useCallback` (×3) | `node`                                                  |

### Unknown dependencies (debounced/wrapped functions)

| File                                                     | Hook          |
| -------------------------------------------------------- | ------------- |
| `src/editor/plugins/FloatingToolbar/FloatingAITools.tsx` | `useCallback` |
| `src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx`     | `useCallback` |
| `src/hooks/useHandleValidation.ts`                       | `useCallback` |
| `src/hooks/useNotesStore.ts`                             | `useCallback` |

### Unstable function in deps (causes re-renders)

| File                                                               | Note                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx:216`         | `handleClose` recreated every render, invalidating `useCallback` at line 265 |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx:203` | Same pattern                                                                 |

---

## 3. `@typescript-eslint/no-explicit-any` (~75 errors)

Use of the `any` type where a concrete or generic type should be used.

**Hotspot files:**

| File                                                           | Count |
| -------------------------------------------------------------- | ----- |
| `src/editor/plugins/ToolbarPlugin/Dialogs/GraphDialog.tsx`     | 11    |
| `src/editor/plugins/ToolbarPlugin/Dialogs/Sketch/index.tsx`    | 7     |
| `src/editor/plugins/ToolbarPlugin/Menus/BlockFormatSelect.tsx` | 4     |
| `src/editor/utils/generateServerHtml.ts`                       | 4     |
| `src/editor/plugins/NodeSelectionPlugin/index.tsx`             | 4     |
| `src/editor/plugins/ToolbarPlugin/Dialogs/OCRDialog.tsx`       | 4     |
| `src/editor/utils/docx/mathml2omml/math.ts`                    | 2     |
| `src/editor/nodes/MathNode/MathComponent.tsx`                  | 2     |
| `src/editor/plugins/MathPlugin/index.tsx`                      | 2     |
| `src/editor/plugins/TablePlugin/LexicalTablePluginHelpers.ts`  | 2     |
| `src/editor/utils/getEditorNodes.ts`                           | 2     |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`         | 2     |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` | 2     |
| `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx`        | 2     |
| `src/hooks/useNotesStore.ts`                                   | 3     |
| `src/indexeddb/interfaces.ts`                                  | 3     |
| `src/lib/auth.ts`                                              | 2     |
| `src/utils/__tests__/collaborators.test.ts`                    | 1     |
| Other files (single occurrences)                               | ~15   |

---

## 4. `@typescript-eslint/ban-ts-comment` (~17 errors)

`@ts-expect-error` or `@ts-ignore` directives missing a required explanation
comment (must be ≥ 3 characters).

| File                                                 | Count                                            |
| ---------------------------------------------------- | ------------------------------------------------ |
| `src/editor/nodes/MathNode/mathVirtualKeyboard.ts`   | 14                                               |
| `src/editor/nodes/DetailsNode/utils.ts`              | 2                                                |
| `src/editor/plugins/ComponentPickerPlugin/index.tsx` | 1 (`@ts-ignore` → should use `@ts-expect-error`) |

---

## 5. `@typescript-eslint/no-unused-expressions` (~10 errors)

Expression statements (typically short-circuit evaluations like `a && b()`) that
produce a value but don't assign or call it.

| File                                                           | Line(s) |
| -------------------------------------------------------------- | ------- |
| `src/editor/nodes/ImageNode/ImageComponent.tsx`                | 250     |
| `src/editor/nodes/MathNode/MathComponent.tsx`                  | 226     |
| `src/editor/plugins/ComponentPickerPlugin/index.tsx`           | 159     |
| `src/editor/plugins/ToolbarPlugin/Dialogs/LinkDialog.tsx`      | 239     |
| `src/editor/plugins/ToolbarPlugin/Tools/ColorPicker.tsx`       | 76      |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`         | 168     |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` | 155     |
| `src/editor/plugins/ToolbarPlugin/Tools/NoteTools.tsx`         | 87      |
| `src/editor/utils/docx/mathml2omml/parse-stringify/parse.js`   | 14, 15  |

---

## 6. `no-console` (20 errors)

Disallowed `console.log` statements. Only `console.warn` and `console.error` are
permitted by project rules.

All 20 occurrences are in `src/utils/__tests__/collaborators.test.ts`.

---

## 7. `@typescript-eslint/no-namespace` (1 error)

| File                                          | Line | Note                                               |
| --------------------------------------------- | ---- | -------------------------------------------------- |
| `src/editor/nodes/MathNode/MathComponent.tsx` | 30   | `namespace` used; prefer ES module `export` syntax |

---

## 8. Warnings

### `@next/next/no-img-element` (3 warnings)

Using a plain `<img>` tag instead of Next.js `<Image />`.

| File                                                 | Lines         |
| ---------------------------------------------------- | ------------- |
| `src/editor/plugins/ToolbarPlugin/Tools/AITools.tsx` | 389, 397, 405 |

### Unused `eslint-disable` directive (6 warnings)

`eslint-disable-next-line` comments that suppress rules which no longer trigger
on that line.

| File                                                         | Lines             | Suppressed Rule               |
| ------------------------------------------------------------ | ----------------- | ----------------------------- |
| `src/editor/plugins/MarkdownPlugin/MarkdownTransformers.tsx` | 57, 100, 161, 163 | `no-shadow`                   |
| `src/editor/utils/url.ts`                                    | 19                | `no-script-url`               |
| `src/editor/plugins/ToolbarPlugin/index.tsx`                 | 187               | `react-hooks/exhaustive-deps` |

---

## Files with the Most Errors

| File                                                           | Errors |
| -------------------------------------------------------------- | ------ |
| `src/editor/nodes/MathNode/mathVirtualKeyboard.ts`             | 14     |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`         | ~14    |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` | ~14    |
| `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx`        | ~14    |
| `src/store/app.ts`                                             | ~13    |
| `src/utils/__tests__/collaborators.test.ts`                    | ~21    |
| `src/editor/plugins/ToolbarPlugin/Dialogs/GraphDialog.tsx`     | ~13    |
| `src/editor/nodes/KanbanNode/index.tsx`                        | 7      |
| `src/editor/plugins/KanbanPlugin/index.ts`                     | 5      |
| `src/editor/utils/docx/mathml2omml/mathml/table.js`            | 12     |
