# Code Quality Issues — src/components/

> Review date: 2026-04-10. Focused on: god components, anti-patterns, TypeScript
> safety, state management, consistency.

## High

### H1 — God components (>350 lines, multiple responsibilities)

| File                                                    | Lines | Responsibilities                                              |
| ------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `src/components/Home/ReadmePreviewCard.tsx`             | 462   | Fetch doc, fetch HTML, create doc, manage 4 UI states, render |
| `src/components/EditDocument/Editor.tsx`                | 415   | Load, auto-save, diff, dirty tracking, cloud sync, render     |
| `src/components/SeriesCard/variants/CompactVariant.tsx` | 437   | Sort posts, manage menus, render collapsed + expanded         |
| `src/components/SeriesView/AddPostsDialog.tsx`          | 422   | Fetch available posts, selection state, API calls, render     |
| `src/components/NotesCanvas/BoardSelector.tsx`          | 398   | Board CRUD, zoom controls, render                             |

**Pattern fix**: Extract logic into custom hooks (`useDocumentLoader`,
`useAutoSave`, `useAvailablePostsSelector`) and split large render trees into
smaller subcomponents.
