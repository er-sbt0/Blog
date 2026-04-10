# Architecture Overview

This document describes the layered architecture of the application and the
rules each layer must follow. Read this before making structural changes or
adding new features.

---

## Layer map

```
┌─────────────────────────────────────────────────────┐
│  Next.js App Router pages  (src/app/)               │
│  Server Components · RSC fetch · generateMetadata   │
├─────────────────────────────────────────────────────┤
│  React Components  (src/components/, src/editor/)   │
│  Client Components · UI state · dispatch actions    │
├─────────────────────────────────────────────────────┤
│  State layer  (src/store/)                          │
│  Redux Toolkit · async thunks · single app slice    │
├──────────────────────┬──────────────────────────────┤
│  API client          │  IndexedDB                   │
│  src/api/client.ts   │  src/indexeddb/              │
│  HTTP → /api/*       │  Local-first storage         │
├──────────────────────┴──────────────────────────────┤
│  API routes  (src/app/api/)                         │
│  Route handlers · validation · auth checks          │
├─────────────────────────────────────────────────────┤
│  Repositories  (src/repositories/)                  │
│  Business logic · Prisma queries                    │
├─────────────────────────────────────────────────────┤
│  Database  (PostgreSQL via Prisma)                  │
└─────────────────────────────────────────────────────┘
```

---

## Storage duality

Every document has two independent storage paths that are merged in Redux.

|                    | Local                                | Cloud                            |
| ------------------ | ------------------------------------ | -------------------------------- |
| Storage            | Browser IndexedDB (`src/indexeddb/`) | PostgreSQL via Prisma            |
| Auth required      | No                                   | Yes                              |
| Redux thunk prefix | `createLocal*`, `updateLocal*` …     | `createCloud*`, `updateCloud*` … |
| Works offline      | Yes                                  | No                               |

The `load` thunk in `store/app.ts` boots both sources in parallel and merges
them into `AppState.documents` as `UserDocument[]` where each entry has an
optional `local` and `optional`cloud` field.

**Rule:** Always dispatch paired thunks for operations that should persist to
both stores, unless the feature is intentionally local-only or cloud-only.

---

## API client

See [api-client.md](./api-client.md) for the full contract.

**Rule:** No file under `src/` (outside of `src/app/api/` itself) may call
`fetch('/api/...')` directly. Use `apiClient` from `@/api`.

---

## Redux store

Single slice in `src/store/app.ts`. Shape:

```ts
{
  user?: User;
  documents: UserDocument[];
  series: Series[];
  ui: { ... };
}
```

Async thunks use `thunkAPI.fulfillWithValue` / `thunkAPI.rejectWithValue` and
delegate HTTP work to `apiClient`. They must **not** contain inline `fetch`
calls.

Series and user thunks live in dedicated files under `src/store/thunks/` and are
re-exported from `store/app.ts`.

**Rule:** Components that need data should read from the Redux store via
`useSelector`. Direct API fetches in components are only acceptable for data
that is transient, not global, and not needed by other components — and even
then must go through `apiClient`.

---

## Cache revalidation

After any client-side mutation:

1. The **API route** calls `revalidatePath()` (forward-compat, currently inert
   because `dynamic = "force-dynamic"`).
2. The **component or thunk** calls `router.refresh()` after a successful
   mutation to trigger a server re-fetch of the current page.

`router.refresh()` is the only mechanism that actually causes RSC data to update
today. Do not skip it.

---

## Repositories

Business logic belongs in `src/repositories/`, not in API routes or components.
API routes call repository functions; they do not contain Prisma queries
themselves.

```
src/repositories/
├── document.ts   – CRUD, forking, archiving
├── post.ts       – Post-specific ops with series support
├── series.ts     – Series management
├── revision.ts   – Version control
└── user.ts       – Profile operations
```

---

## Component organisation

```
src/components/
├── <Feature>/
│   ├── index.tsx          – public component export
│   ├── hooks/             – feature-scoped hooks
│   └── components/        – private sub-components
```

Components must not:

- Call `fetch` directly — use `apiClient`
- Contain Prisma queries or server-only imports
- Manage global state — dispatch Redux actions instead

---

## Editor (Lexical)

Custom nodes live in `src/editor/nodes/`. Plugins live in `src/editor/plugins/`.
The editor is client-only; never import editor internals in server components or
API routes.

---

## Naming conventions

| Thing               | Convention                                                           |
| ------------------- | -------------------------------------------------------------------- |
| Cloud thunk         | `createCloudDocument`, `updateCloudDocument` …                       |
| Local thunk         | `createLocalDocument`, `updateLocalDocument` …                       |
| API client method   | `apiClient.<resource>.<verb>()`                                      |
| Repository function | verb-first: `createDocument`, `getDocumentById` …                    |
| Response type       | `Get*Response`, `Post*Response`, `Patch*Response`, `Delete*Response` |

---

## Checklist for new features

- [ ] HTTP calls use `apiClient` — no bare `fetch('/api/...')`
- [ ] New routes have a corresponding `apiClient` method added to
      `src/api/client.ts`
- [ ] New request/response types are in `src/api/types.ts` or `src/types.ts`,
      not inline
- [ ] Mutations that should persist call both `*Local` and `*Cloud` thunks (or
      document why only one is needed)
- [ ] Mutations in components call `router.refresh()` after success
- [ ] Business logic is in `src/repositories/`, not in route handlers
- [ ] No `console.log` — only `console.warn` and `console.error` (ESLint rule)
- [ ] No `any` types (ESLint rule `@typescript-eslint/no-explicit-any`)
- [ ] `react-hooks/exhaustive-deps` is satisfied — no disabled eslint comments
      without a written explanation
