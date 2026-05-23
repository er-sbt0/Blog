# Fix `@typescript-eslint/no-explicit-any` Plan

Total `no-explicit-any` errors: ~80 across 30+ files. Also includes
`ban-ts-comment` errors (missing descriptions on `@ts-expect-error`).

---

## Group 1 — Error boundaries / app-level

**Files:** 2 | **Errors:** 4

| File                            | Lines  |
| ------------------------------- | ------ |
| `src/app/(appLayout)/error.tsx` | 13, 14 |
| `src/app/error.tsx`             | 13, 14 |

**Pattern:** Next.js error boundary props typed as `any`. **Fix:** Use
`{ error: Error & { digest?: string }, reset: () => void }` — the standard
Next.js error boundary signature.

---

## Group 2 — API routes & utilities

**Files:** 4 | **Errors:** 4

| File                                  | Lines |
| ------------------------------------- | ----- |
| `src/app/api/documents/[id]/route.ts` | 46    |
| `src/app/api/notes/[id]/route.ts`     | 44    |
| `src/app/api/og/route.tsx`            | 64    |
| `src/app/api/utils.ts`                | 34    |

**Pattern:** `catch (e: any)` or loosely typed return values in API helpers.
**Fix:** Use `unknown` in catch clauses and narrow with `instanceof Error`; use
concrete return types.

---

## Group 3 — Plumbing: sort / IndexedDB / auth / hooks

**Files:** 6 | **Errors:** 13

| File                                               | Lines       |
| -------------------------------------------------- | ----------- |
| `src/components/DocumentControls/sortDocuments.ts` | 4, 5, 6     |
| `src/indexeddb/interfaces.ts`                      | 23, 24, 25  |
| `src/indexeddb/utils.ts`                           | 13          |
| `src/lib/auth.ts`                                  | 18, 23      |
| `src/types/prismjs.d.ts`                           | 3           |
| `src/hooks/useNotesStore.ts`                       | 9, 141, 184 |

**Pattern:** Comparator functions, IDB interfaces, NextAuth callbacks, Prism
type stubs. **Fix:** Type comparator params with `EditorDocument` or `unknown`;
define IDB value types; use NextAuth's own types for session callbacks; use
`unknown` in Prism stub.

---

## Group 4 — Component-level UI

**Files:** 5 | **Errors:** 9

| File                                                     | Lines  |
| -------------------------------------------------------- | ------ |
| `src/components/DocumentCard/components/LoadingCard.tsx` | 101    |
| `src/components/DocumentGrid/types.ts`                   | 85, 90 |
| `src/components/NotesCanvas/StaticNoteCard.tsx`          | 18     |
| `src/components/User/UserDocuments.tsx`                  | 20     |
| `src/editor/config.tsx`                                  | 59     |

**Pattern:** Prop/state/callback types that need concrete interfaces instead of
`any`. **Fix:** Introduce or reuse existing interfaces; use `unknown` + type
guards where identity is unclear.

---

## Group 5 — Editor nodes & plugins: math / image / selection / picker

**Files:** 8 | **Errors:** 18

| File                                                           | Lines            |
| -------------------------------------------------------------- | ---------------- |
| `src/editor/nodes/MathNode/MathComponent.tsx`                  | 150, 157         |
| `src/editor/plugins/ImagePlugin/index.tsx`                     | 143              |
| `src/editor/plugins/MathPlugin/index.tsx`                      | 124, 127         |
| `src/editor/plugins/NodeSelectionPlugin/index.tsx`             | 39, 46, 163, 376 |
| `src/editor/plugins/ToolbarPlugin/Tools/MathTools.tsx`         | 106, 304         |
| `src/editor/plugins/ToolbarPlugin/Tools/MathToolsFloating.tsx` | 109, 292         |
| `src/editor/plugins/ToolbarPlugin/Tools/TableTools.tsx`        | 498, 535         |
| `src/editor/plugins/ComponentPickerPlugin/index.tsx`           | 440              |

**Pattern:** Lexical API event/command handlers, MathLive keyboard event
payloads. **Fix:** Use Lexical's own command/event types; define a
`MathLiveKeyboardEvent` interface for MathLive payloads.

---

## Group 6 — Editor dialog plugins (largest group)

**Files:** 7 | **Errors:** 25

| File                                                               | Lines                                    |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `src/editor/plugins/ToolbarPlugin/Dialogs/GraphDialog.tsx`         | 28, 48, 78, 175, 197, 200, 253, 257, 263 |
| `src/editor/plugins/ToolbarPlugin/Dialogs/ImageDialog.tsx`         | 77                                       |
| `src/editor/plugins/ToolbarPlugin/Dialogs/LinkDialog.tsx`          | 51, 166                                  |
| `src/editor/plugins/ToolbarPlugin/Dialogs/OCRDialog.tsx`           | 36, 62, 113                              |
| `src/editor/plugins/ToolbarPlugin/Dialogs/Sketch/index.tsx`        | 146, 203, 264, 332, 337, 402, 405        |
| `src/editor/plugins/ToolbarPlugin/Dialogs/Sketch/AddLibraries.tsx` | 32                                       |
| `src/editor/plugins/ToolbarPlugin/Menus/BlockFormatSelect.tsx`     | 97, 111, 151, 168                        |

**Pattern:** GeoGebra `window.ggbApplet` API, Excalidraw element/library types,
generic event handlers. **Fix:** Define `GeoGebraApplet` and `ExcalidrawElement`
interfaces (or import from `@excalidraw/excalidraw`); type menu event handlers
with `React.ChangeEvent` / `React.MouseEvent`.

---

## Group 7 — Docx export & server HTML utilities

**Files:** 9 | **Errors:** 14

| File                                     | Lines             |
| ---------------------------------------- | ----------------- |
| `src/editor/utils/docx/details.ts`       | 34                |
| `src/editor/utils/docx/image.ts`         | 32                |
| `src/editor/utils/docx/layout.ts`        | 10                |
| `src/editor/utils/docx/link.ts`          | 11                |
| `src/editor/utils/docx/math.ts`          | 15, 18            |
| `src/editor/utils/docx/table.ts`         | 153               |
| `src/editor/utils/generateServerHtml.ts` | 36, 109, 144, 147 |
| `src/editor/utils/getEditorNodes.ts`     | 12, 20            |
| `src/editor/utils/htmlConfig.tsx`        | 18                |

**Pattern:** Lexical `SerializedLexicalNode` subtypes passed as `any` to docx
converters. **Fix:** Use `SerializedLexicalNode` (or specific subtypes like
`SerializedElementNode`) from `@lexical/html`; create a discriminated union or
local interfaces for serialized node shapes.

---

## Group 8 — `ban-ts-comment` (missing descriptions)

**Files:** 2 | **Errors:** 15

| File                                               | Lines                                                   |
| -------------------------------------------------- | ------------------------------------------------------- |
| `src/editor/nodes/DetailsNode/utils.ts`            | 9, 14                                                   |
| `src/editor/nodes/MathNode/mathVirtualKeyboard.ts` | 8, 25, 30, 32, 37, 39, 41, 46, 48, 53, 55, 93, 117, 124 |

Also: `src/editor/plugins/ComponentPickerPlugin/index.tsx` line 306 — replace
`@ts-ignore` with `@ts-expect-error` + description.

**Pattern:** `@ts-expect-error` without a description; one stray `@ts-ignore`.
**Fix:** Add a short rationale comment after each directive (≥ 3 chars
required).

---

## Execution Order

1. **Group 1** — Error boundaries (trivial, well-known types)
2. **Group 2** — API routes (catch clause `unknown`)
3. **Group 3** — Plumbing / sort / IDB / auth
4. **Group 4** — Component UI types
5. **Group 8** — `ban-ts-comment` quick wins
6. **Group 7** — Docx / server HTML utilities (Lexical serialized types)
7. **Group 5** — Editor nodes & plugins
8. **Group 6** — Dialog plugins (GeoGebra / Excalidraw last, most complex)
