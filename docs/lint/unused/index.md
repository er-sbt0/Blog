# Unused Vars — Fix Plan

> Rule: `@typescript-eslint/no-unused-vars` Total: **238 errors** across **108
> files** Generated: 2026-04-10

Each file below is a separate commit scope. Fixes fall into three mechanical
categories — use the one that fits the context:

| Category                             | Fix                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Unused import                        | Delete the import line (or the single named specifier)                           |
| Unused function parameter            | Prefix with `_` (e.g. `_node`) or remove if trailing                             |
| Unused local / destructured variable | Remove the assignment, or prefix with `_` if the destructuring pattern must stay |

---

## Commit groups

| File                                                   | Scope                                | Errors (original) | Status                               |
| ------------------------------------------------------ | ------------------------------------ | ----------------- | ------------------------------------ |
| [group-1-store.md](group-1-store.md)                   | `src/store/`                         | 20                | ✅ committed — 1 residual (see file) |
| [group-2-components.md](group-2-components.md)         | `src/components/`                    | 67                | ✅ committed — 0 remaining           |
| [group-3-editor-nodes.md](group-3-editor-nodes.md)     | `src/editor/nodes/`                  | 41                | ✅ committed — 0 remaining           |
| [group-4-editor-plugins.md](group-4-editor-plugins.md) | `src/editor/plugins/`                | 47                | ⏳ pending — all 47 remain           |
| [group-5-mathml2omml.md](group-5-mathml2omml.md)       | `src/editor/utils/docx/mathml2omml/` | 32                | ⏳ pending — all 32 remain           |
| [group-6-misc.md](group-6-misc.md)                     | everything else                      | 31                | ⏳ pending — ~21 remain              |

---

## Quick stats by error kind

| Kind                                 | Count (approx.) |
| ------------------------------------ | --------------- |
| Unused import / named specifier      | ~130            |
| Unused function parameter            | ~55             |
| Unused local variable / destructured | ~53             |
