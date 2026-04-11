# Component consolidation opportunities

Findings from April 2026 audit of `src/components/`.

---

## 4. Extract `DrawerShell` from the two create drawers

**Effort:** M — extract +1 shared component, each drawer drops ~80 lines of
layout boilerplate.

`CreatePostDrawer` and `CreateSeriesDrawer` share identical 3-zone structure:

```
Drawer (anchor=right, responsive width)
  └─ Box[form]
       ├─ Header (title + optional subtitle + close button)
       ├─ Body   (flex: 1, overflowY: auto, p: 3)
       └─ Footer (cancel + submit buttons, border-top)
```

Extract into `shared/DrawerShell.tsx`:

```ts
interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: { xs?: string | number; sm?: number; md?: number };
  disabled?: boolean; // disables close button and propagates to children
  children: React.ReactNode; // body content
  actions: React.ReactNode; // footer buttons
}
```

Each drawer then contains only its form fields and submit logic. Applies to any
future form drawer automatically.

---

## 5. Merge `RelativeDate` into `DateDisplay`

**Effort:** S — delete 1 file, update 3–4 call sites.

Both components live in `common/`, export a `<time>` element, and use
`date-fns`. Add a `relative` prop to `DateDisplay`:

```ts
interface DateDisplayProps {
  date: Date | string;
  relative?: boolean; // if true → formatDistanceToNow
  addSuffix?: boolean; // passed through to relative mode
  variant?: "short" | "medium" | "long" | "full";
  customFormat?: string;
  className?: string;
}
```

Delete `RelativeDate.tsx`. All existing `<RelativeDate date={x} addSuffix />`
calls become `<DateDisplay date={x} relative addSuffix />`.

---

## Summary

| # | Description                             | Files removed | Effort |
| - | --------------------------------------- | ------------- | ------ |
| 4 | Extract `DrawerShell`                   | +1 shared     | M      |
| 5 | Merge `RelativeDate` into `DateDisplay` | −1            | S      |

**Total: up to −7 files, 1 directory eliminated, 2 components upgraded.**
