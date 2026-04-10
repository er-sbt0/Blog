# Layout Component Issues

## 12. Redundant `maxWidth` and identical responsive breakpoints in `AppLayout`

**File:** `AppLayout.tsx:42-56`

```tsx
<Container
  maxWidth={false}         // disables MUI's responsive cap
  sx={{
    maxWidth: "100%",      // redundant — maxWidth={false} already does this
    px: {
      xs: 1,
      sm: 1,
      md: 1,              // all three breakpoints are identical — just write px: 1
    },
  }}
>
```

Both issues are minor but indicate copy-paste without cleanup.

---

## 13. Partial manual type instead of `Theme` in `PostContextMenu`

**File:** `SideBar/PostContextMenu.tsx:28-31`

```ts
const borderBottomSx = {
  borderBottom: (theme: { palette: { mode: string } }) => ...
};
```

The theme parameter is typed as a hand-rolled partial object instead of the MUI `Theme` type. This bypasses type safety and is non-idiomatic.

---

## Summary Table

| # | File | Severity | Category |
|---|------|----------|----------|
| 12 | `AppLayout.tsx` | Low | Redundant `maxWidth` + identical breakpoints |
| 13 | `PostContextMenu.tsx` | Low | Manual partial type instead of `Theme` |
