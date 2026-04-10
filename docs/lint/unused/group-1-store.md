# Group 1 — State Management (`src/store/`)

> ✅ **Committed** — `fix(lint): remove unused vars in store`

> ⚠️ **Residual:** `src/store/app/duplicateDocument.ts` L53 — the catch variable
> was prefixed `_error` but the rule still flags it because catch bindings need
> `catch {` (bare), not `catch (_error)`. Fix: change `catch (_error)` →
> `catch {` in that file.

> ~~Errors: **20**~~

---

## `src/store/app.ts` — 17 errors

### Unused imports (2)

| Line | Symbol   | Fix                |
| ---- | -------- | ------------------ |
| L12  | `Alert`  | Remove from import |
| L26  | `Series` | Remove from import |

### Unused destructured locals — repeated destructuring pattern (9)

Two thunks each destructure a spread of document fields, but never use
`coauthors`, `published`, `collab`, `isPrivate`.

| Lines    | Symbols                                         | Fix                                                       |
| -------- | ----------------------------------------------- | --------------------------------------------------------- |
| L480–483 | `coauthors`, `published`, `collab`, `isPrivate` | Remove from destructure (use rest `...rest` or just omit) |
| L661–664 | `coauthors`, `published`, `collab`, `isPrivate` | Same as above                                             |

### Unused `data` variables (5)

| Line | Context                                   | Fix                                |
| ---- | ----------------------------------------- | ---------------------------------- |
| L129 | `const data = ...` (assigned, never read) | Remove assignment or `const _data` |
| L137 | `data` parameter                          | Prefix `_data`                     |
| L494 | `const data = ...`                        | Remove or `_data`                  |
| L497 | `data` parameter                          | Prefix `_data`                     |
| L529 | `const data = ...`                        | Remove or `_data`                  |
| L682 | `data` parameter                          | Prefix `_data`                     |

### Unused parameter (1)

| Line | Symbol             | Fix                                    |
| ---- | ------------------ | -------------------------------------- |
| L908 | `action` parameter | Prefix `_action` or remove if trailing |

---

## `src/store/app/duplicateDocument.ts` — 3 errors

### Unused imports (2)

| Line | Symbol           | Fix                |
| ---- | ---------------- | ------------------ |
| L4   | `BackupDocument` | Remove from import |
| L4   | `UserDocument`   | Remove from import |

### Unused local (1)

| Line | Symbol                  | Fix                                   |
| ---- | ----------------------- | ------------------------------------- |
| L54  | `error` in catch clause | Prefix `_error` or use bare `catch {` |
