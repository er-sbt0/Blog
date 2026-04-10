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

---

## 3. Non-idiomatic RTK: Manual `.type` String Comparison

**Severity: High**

In `src/components/EditDocument/hooks/useCloudSave.ts`:

```ts
if (revisionResponse.type === actions.createCloudRevision.fulfilled.type) {
```

The RTK-idiomatic pattern is `dispatch(action).unwrap()` — which throws on
rejection and returns the payload on success. Manual `.type` comparison is
fragile (brittle strings), loses type safety, and is an anti-pattern explicitly
called out in RTK docs. The same pattern appears in `useDocumentLoader.ts` and
`syncLocalToCloud` in `store/app.ts`.

---

## 5. Direct Mutation of IDB-Fetched Object in `forkLocalDocument`

**Severity: High**

In `src/store/app.ts` inside `forkLocalDocument`:

```ts
document.head = revision.id;
document.updatedAt = revision.createdAt;
document.data = revision.data;
return thunkAPI.fulfillWithValue(document);
```

The IndexedDB object is mutated in place before being passed as a payload. This
violates immutability principles and can silently corrupt the IDB cache object
since IndexedDB may return a live-ish reference.

---

## 6. Global Mutable Module-Level Singleton `saveRegistry`

**Severity: Medium**

`src/components/EditDocument/saveRegistry.ts` stores a single `saveCallback` in
module-level mutable state. This breaks if multiple editor instances exist,
leaks across tests, is incompatible with SSR, and entirely bypasses React's
model. The proper pattern is React Context or passing the callback explicitly
via props.

---

## 8. Empty Reducer Body Used as Action Signal

**Severity: Medium**

In `src/store/app.ts`:

```ts
triggerAutosaveBeforeNavigation: ((state, action) => {
  // This is intentionally empty as we'll handle this action in middleware
});
```

A reducer is a state-transition function. Having one that does nothing to state
— used purely as a "signal" — is an anti-pattern. Standalone action creators
should be created with `createAction()` outside the slice for this purpose.

---

## 10. No Error Recovery in `EditorErrorBoundary`

**Severity: Medium**

`src/components/EditDocument/index.tsx` has no key-based reset mechanism or
`getDerivedStateFromProps` for recovery. Once the error boundary triggers, it
permanently shows the error screen — navigating to a different document won't
recover it since `hasError` is never reset to `false`.

---

## Summary Table

| #  | Issue                                           | File                                                | Severity |
| -- | ----------------------------------------------- | --------------------------------------------------- | -------- |
| 1  | God-file `store/app.ts` (1258 lines)            | `src/store/app.ts`                                  | Critical |
| 2  | O(n) reducer lookups, no entity adapter         | `src/store/app.ts`                                  | High     |
| 3  | `.type` string comparison instead of `unwrap()` | `src/components/EditDocument/hooks/useCloudSave.ts` | High     |
| 4  | `string \| Date` union type                     | `src/types.ts`                                      | High     |
| 5  | Mutation of IDB object in thunk                 | `src/store/app.ts`                                  | High     |
| 6  | Global singleton save registry                  | `src/components/EditDocument/saveRegistry.ts`       | Medium   |
| 7  | `isClient` + `dynamic(ssr:false)` double guard  | `src/components/EditDocument/index.tsx`             | Medium   |
| 8  | Empty reducer as action signal                  | `src/store/app.ts`                                  | Medium   |
| 9  | `errorInfo: any` in error boundary              | `src/components/EditDocument/index.tsx`             | Medium   |
| 10 | No error boundary reset mechanism               | `src/components/EditDocument/index.tsx`             | Medium   |
