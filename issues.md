# Code Review: Issues Found

Sorted by importance/severity.

---

## 1. Monolithic 1258-line `store/app.ts` — God File

**Severity: Critical**

`src/store/app.ts` contains every async thunk (30+), the Redux slice reducers,
and utility functions for local + cloud operations in a single file. This
violates SRP massively and makes the file nearly unmaintainable. Thunks were
partially split into `seriesThunks` and `userThunks` but hundreds of lines
remain in the root file.
