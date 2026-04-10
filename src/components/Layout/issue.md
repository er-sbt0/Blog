# Layout Component Issues

---

## 11. `useKeyboardShortcuts` returns a value no caller uses

**File:** `SideBar/hooks/useKeyboardShortcuts.ts:44`, `SideBar.tsx:57`

The hook returns `{ shortcutHint: "Ctrl+B" }` — a hardcoded string. The only caller destructures nothing:

```tsx
useKeyboardShortcuts({ onToggleSidebar: toggleSidebar, enabled: true });
```

The return value is dead. Either remove it from the hook's return, or use it in `SidebarHeader` to fix issue #2 above (single source of truth for the shortcut string).

---

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
| 11 | `useKeyboardShortcuts.ts` | Low | Unused return value |
| 12 | `AppLayout.tsx` | Low | Redundant `maxWidth` + identical breakpoints |
| 13 | `PostContextMenu.tsx` | Low | Manual partial type instead of `Theme` |
