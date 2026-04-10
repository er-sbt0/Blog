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

## Summary Table

| # | File | Severity | Category |
|---|------|----------|----------|
| 12 | `AppLayout.tsx` | Low | Redundant `maxWidth` + identical breakpoints |
