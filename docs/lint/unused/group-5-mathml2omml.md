# Group 5 — mathml2omml JS Helpers (`src/editor/utils/docx/mathml2omml/mathml/`)

> Suggested commit message:
> `fix(lint): prefix unused params in mathml2omml helpers` Errors: **32**

---

## Overview

Every file in this folder exports conversion functions that share the same
callback signature:

```js
function convert(node, previousSibling, nextSibling, ancestors) { … }
```

The parameters `previousSibling`, `nextSibling`, and `ancestors` are unused in
most (or all) of the handlers. The uniform fix is to prefix each unused
positional parameter with `_`.

> **Note:** These are plain `.js` files. The ESLint rule is enforced because the
> project's ESLint config applies `@typescript-eslint/no-unused-vars` to JS
> files too. Alternatively, a targeted `/* eslint-disable */` per-file comment
> could suppress the rule here if the callback signature is part of a required
> interface.

---

## `src/editor/utils/docx/mathml2omml/mathml/math.js` — 6 errors

Two separate handler functions, each with 3 unused params:

| Lines  | Symbols                                       | Fix                       |
| ------ | --------------------------------------------- | ------------------------- |
| L4–6   | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |
| L20–22 | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/table.js` — 9 errors

Three separate handler functions:

| Lines    | Symbols                                       | Fix                       |
| -------- | --------------------------------------------- | ------------------------- |
| L4–6     | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |
| L84–86   | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |
| L102–104 | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/menclose.js` — 3 errors

| Lines | Symbols                                       | Fix                       |
| ----- | --------------------------------------------- | ------------------------- |
| L4–6  | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/mglyph.js` — 3 errors

| Lines | Symbols                                       | Fix                       |
| ----- | --------------------------------------------- | ------------------------- |
| L4–6  | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/mspace.js` — 3 errors

| Lines | Symbols                                       | Fix                       |
| ----- | --------------------------------------------- | ------------------------- |
| L4–6  | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/msqrt.js` — 3 errors

| Lines | Symbols                                       | Fix                       |
| ----- | --------------------------------------------- | ------------------------- |
| L4–6  | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/mstyle.js` — 3 errors

| Lines | Symbols                                       | Fix                       |
| ----- | --------------------------------------------- | ------------------------- |
| L4–6  | `previousSibling`, `nextSibling`, `ancestors` | Prefix all three with `_` |

---

## `src/editor/utils/docx/mathml2omml/mathml/mrow.js` — 2 errors

Only `nextSibling` and `ancestors` are unused (`previousSibling` is used):

| Lines | Symbols                    | Fix             |
| ----- | -------------------------- | --------------- |
| L5–6  | `nextSibling`, `ancestors` | Prefix with `_` |
