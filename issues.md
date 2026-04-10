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

---

## 2. O(n) Linear Scans in Reducers — No Entity Adapter

**Severity: High**

Every `extraReducers` case in `src/store/app.ts` calls
`state.documents.find(...)` for lookups. With many documents this is O(n) on
every dispatch. The idiomatic RTK solution is `createEntityAdapter()`, which
gives O(1) lookup by id and eliminates the duplication of the find/upsert
pattern repeated ~20 times.
