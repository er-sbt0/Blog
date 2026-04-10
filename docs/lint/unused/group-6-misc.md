# Group 6 — Miscellaneous (`src/app/`, `src/api/`, `src/repositories/`, `src/hooks/`, `src/lib/`, `src/middleware.ts`, `src/shared/`, `src/utils/`, `src/editor/config.tsx`, `src/editor/utils/`)

> Suggested commit message: `fix(lint): remove unused vars in misc/infra files`
> Errors: **31**

---

## `src/api/client.ts` — 2 errors

### Unused imports / type exports (2)

| Line | Symbol                   | Fix                                 |
| ---- | ------------------------ | ----------------------------------- |
| L43  | `CreateNoteResponse`     | Remove (unused exported type alias) |
| L45  | `GetNotesCanvasResponse` | Remove (unused exported type alias) |

---

## `src/app/(appLayout)/browse/[id]/page.tsx` — 1 error

### Unused parameter (1)

| Line | Symbol   | Fix              |
| ---- | -------- | ---------------- |
| L22  | `params` | Prefix `_params` |

---

## `src/app/(appLayout)/view/ViewContainerWrapper.tsx` — 1 error

### Unused local (1)

| Line | Symbol         | Fix               |
| ---- | -------------- | ----------------- |
| L20  | `centerOffset` | Remove assignment |

---

## `src/app/(appLayout)/view/[id]/page.tsx` — 1 error

### Unused import (1)

| Line | Symbol             | Fix    |
| ---- | ------------------ | ------ |
| L11  | `DocumentRevision` | Remove |

---

## `src/app/api/utils.ts` — 1 error

### Unused catch variable (1)

| Line | Symbol  | Fix            |
| ---- | ------- | -------------- |
| L98  | `error` | Bare `catch {` |

---

## `src/components/Diff/WordSplitter.ts` — 1 error

### Unused parameter (1)

| Line | Symbol             | Fix                        |
| ---- | ------------------ | -------------------------- |
| L10  | `blockExpressions` | Prefix `_blockExpressions` |

---

## `src/editor/config.tsx` — 1 error

### Unused parameter (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L59  | `node` | Prefix `_node` |

---

## `src/editor/utils/docx/code.ts` — 1 error

### Unused parameter (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L4   | `node` | Prefix `_node` |

---

## `src/editor/utils/docx/math.ts` — 1 error

### Unused catch variable (1)

| Line | Symbol | Fix            |
| ---- | ------ | -------------- |
| L30  | `e`    | Bare `catch {` |

---

## `src/editor/utils/generateServerHtml.ts` — 1 error

### Unused local (1)

| Line | Symbol          | Fix                                                                   |
| ---- | --------------- | --------------------------------------------------------------------- |
| L87  | `setStateError` | Remove — likely a leftover `useState` setter that is no longer needed |

---

## `src/hooks/useNotesStore.ts` — 1 error

### Unused local (1)

| Line | Symbol    | Fix               |
| ---- | --------- | ----------------- |
| L21  | `session` | Remove assignment |

---

## `src/lib/auth.ts` — 2 errors

### Unused parameters (2)

| Line | Symbol    | Fix               |
| ---- | --------- | ----------------- |
| L17  | `account` | Prefix `_account` |
| L33  | `token`   | Prefix `_token`   |

---

## `src/middleware.ts` — 1 error

### Unused parameter (1)

| Line | Symbol    | Fix               |
| ---- | --------- | ----------------- |
| L3   | `request` | Prefix `_request` |

---

## `src/repositories/notes.ts` — 1 error

### Unused local (1)

| Line | Symbol         | Fix                    |
| ---- | -------------- | ---------------------- |
| L5   | `authorSelect` | Remove — dead constant |

---

## `src/repositories/post.ts` — 1 error

### Unused local (1)

| Line | Symbol        | Fix               |
| ---- | ------------- | ----------------- |
| L140 | `anyDocument` | Remove assignment |

---

## `src/repositories/series.ts` — 1 error

### Unused import (1)

| Line | Symbol   | Fix    |
| ---- | -------- | ------ |
| L1   | `Prisma` | Remove |

---

## `src/shared/invariant.ts` — 1 error

### Unused rest parameter (1)

| Line | Symbol                        | Fix                                                          |
| ---- | ----------------------------- | ------------------------------------------------------------ |
| L15  | `args` (rest param `...args`) | Prefix `_args` or remove if not part of a required signature |

---

## `src/utils/migrateNotes.ts` — 2 errors

### Unused import (1)

| Line | Symbol | Fix    |
| ---- | ------ | ------ |
| L2   | `Note` | Remove |

### Unused local (1)

| Line | Symbol          | Fix               |
| ---- | --------------- | ----------------- |
| L73  | `backendCanvas` | Remove assignment |
