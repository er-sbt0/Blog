# Layout Component Issues

Critical and notable code-quality findings across `src/components/Layout/`.

---

## 1. `"use client"` in `styles.ts` — forces all consumers to be client components

**File:** `styles.ts:1`

`styles.ts` starts with `"use client"`. The file only exports static `SxProps` objects — no hooks, no browser APIs. This directive is entirely unnecessary and silently forces every component that imports from it (`SideBar.tsx`, `ActivePostsSection.tsx`, etc.) to be a client component, even if they otherwise could be server components.

**Fix:** Remove `"use client"` from `styles.ts`.

---

## 2. Wrong keyboard shortcut displayed in tooltip

**File:** `SideBar/SidebarHeader.tsx:107`, `SideBar/hooks/useKeyboardShortcuts.ts:27`

The sidebar toggle tooltip reads `"Ctrl+Alt+S"` but the actual shortcut registered in `useKeyboardShortcuts` is `Ctrl+B` (`event.ctrlKey && event.key === "b"`). These are out of sync — the UI is lying to the user.

```tsx
// SidebarHeader.tsx — what the tooltip says
title={`${open ? "Collapse" : "Expand"} sidebar (Ctrl+Alt+S)`}

// useKeyboardShortcuts.ts — what actually fires
if (isModifierPressed && event.key === "b") { ... }
```

---

## 3. `setTimeout` navigation hack in `SafeNavigationLink` — data-loss risk

**File:** `SideBar/SafeNavigationLink.tsx:36`

```tsx
setTimeout(() => router.push(href), 100);
```

The autosave action is dispatched and then navigation is scheduled 100 ms later with no guarantee the save has completed. If the save is async (network call), the navigation will race and potentially lose content. This is a fundamentally incorrect pattern — the correct approach is to `await` the dispatched thunk before navigating.

---

## 4. Deprecated no-op API kept in `SidebarWidthContext`

**File:** `SideBar/SidebarWidthContext.tsx:33-38, 138-140`

`setSidebarWidth` is exported as part of the context interface but its implementation is an explicit no-op:

```ts
const setSidebarWidth = useCallback((newWidth: number) => {
  // No-op for backward compatibility - width is managed internally
}, []);
```

`sidebarWidth` is also kept as an alias. Both are tagged `@deprecated`. There are no remaining callers — these should be removed, not preserved. Keeping a no-op in a public API is worse than removing it; callers believe they are doing something when they aren't.

---

## 5. Redundant wrapper function — `getWidth` in `SideBar.tsx`

**File:** `SideBar.tsx:64`

```tsx
const getWidth = (isOpen: boolean) => getEffectiveWidth(isOpen);
```

This is a one-liner wrapper that does nothing but delegate to `getEffectiveWidth` with the same signature. It adds indirection with no benefit. `getEffectiveWidth` should be used directly.

---

## 6. `isDirty` computed but not used for the dirty dot indicator

**File:** `SideBar/PostItem.tsx:46-48, 110-112`

`isDirty` is derived on line 46:

```tsx
const isDirty = Boolean(post.local) && Boolean(post.cloud) && post.local!.head !== post.cloud!.head;
```

But the dirty-dot indicator (the small blue circle) on line 110 re-evaluates the same condition inline instead of using the variable:

```tsx
{post.local && post.cloud && post.local.head !== post.cloud.head && ( <Box ... /> )}
```

The variable `isDirty` is only used for the `CloudUpload` button further below. The dot and the button should both use `isDirty`.

---

## 7. Hydration mismatch risk in `useSidebarFontSize`

**File:** `SideBar/hooks/useSidebarFontSize.ts:9-14`

```ts
const [sidebarFontSize, setSidebarFontSize] = useState<number>(() => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_FONT_SIZE;
  }
  return DEFAULT_FONT_SIZE;
});
```

Reading `localStorage` inside `useState`'s initializer causes a hydration mismatch: the server renders with `DEFAULT_FONT_SIZE`, but the client immediately renders with the persisted value. This is the exact pattern `SidebarWidthContext` correctly avoids by reading in a `useEffect`. Both should follow the same approach.

---

## 8. `navigationItems` in `useMemo` with empty deps — should be a module constant

**File:** `SideBar.tsx:92-98`

```tsx
const navigationItems = useMemo(
  () => [
    { text: "Home", icon: <Home />, path: "/" },
    ...
  ],
  [],
);
```

A `useMemo` with empty deps `[]` is equivalent to a module-level constant but slower (React still calls the factory once and stores the result). JSX elements created here are also re-created each time the component mounts. This should be a `const` at module scope.

---

## 9. Complement conditions instead of ternary

**File:** `SideBar.tsx:193-204`

```tsx
{user && activeDocuments.length > 0 && (
  <ActivePostsSection ... />
)}
{(!user || activeDocuments.length === 0) && (
  <Box sx={{ flex: "1 1 auto", minHeight: 0 }} />
)}
```

These two blocks are exact logical complements. They should be a single ternary `{condition ? <ActivePostsSection /> : <Box />}`. The current pattern is non-idiomatic and requires reading both conditions mentally to understand they're mutually exclusive.

---

## 10. Unused ref in `DocumentInfoDrawerArrow`

**File:** `DocumentInfoDrawerArrow.tsx:21`

```tsx
const arrowRef = useRef<HTMLDivElement>(null);
```

`arrowRef` is attached to `<Paper ref={arrowRef}>` but its `.current` value is never read anywhere in the component. It's dead code.

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
| 1 | `styles.ts` | High | Unnecessary `"use client"` |
| 2 | `SidebarHeader.tsx` | High | Wrong shortcut hint (user-facing bug) |
| 3 | `SafeNavigationLink.tsx` | High | `setTimeout` navigation race (data-loss risk) |
| 4 | `SidebarWidthContext.tsx` | Medium | Dead no-op API (`setSidebarWidth`) |
| 5 | `SideBar.tsx` | Low | Redundant wrapper `getWidth` |
| 6 | `PostItem.tsx` | Medium | `isDirty` variable not used for dot indicator |
| 7 | `useSidebarFontSize.ts` | Medium | Hydration mismatch pattern |
| 8 | `SideBar.tsx` | Low | `useMemo([])` instead of module constant |
| 9 | `SideBar.tsx` | Low | Complement conditions instead of ternary |
| 10 | `DocumentInfoDrawerArrow.tsx` | Low | Unused `arrowRef` |
| 11 | `useKeyboardShortcuts.ts` | Low | Unused return value |
| 12 | `AppLayout.tsx` | Low | Redundant `maxWidth` + identical breakpoints |
| 13 | `PostContextMenu.tsx` | Low | Manual partial type instead of `Theme` |
