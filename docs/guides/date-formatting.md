# Date Formatting Best Practices - Avoiding Hydration Errors

## The Problem

React hydration errors (#418) occur when the HTML rendered on the server doesn't
match what React expects on the client. This commonly happens with date
formatting because:

### Why Date Formatting Causes Hydration Mismatches

```tsx
// ❌ PROBLEM: Different output on server vs client
<div>{new Date().toLocaleDateString()}</div>;
```

**Server (e.g., UTC timezone):**

```
January 31, 2026
```

**Client (e.g., PST timezone):**

```
January 30, 2026
```

**Result:** React throws Error #418 - Hydration mismatch

### Root Causes

1. **`toLocaleDateString()`** - Uses system locale and timezone
2. **`toLocaleString()`** - Uses system locale and timezone
3. **`toLocaleTimeString()`** - Uses system locale and timezone
4. **Server timezone ≠ Client timezone** - Different geographical locations
5. **Server locale ≠ Client locale** - Different language/region settings

## The Solution: Consistent Formatting with date-fns

Use a date formatting library with fixed timezone to ensure identical output on
server and client.

### Installation

```bash
npm install date-fns date-fns-tz
```

### Implementation

#### 1. Create DateDisplay Component

**File:** `src/components/DateDisplay.tsx`

```tsx
import { format } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

interface DateDisplayProps {
  date: Date | string;
  variant?: "short" | "medium" | "long" | "full";
  className?: string;
}

/**
 * DateDisplay - Renders dates consistently on server and client
 *
 * Uses UTC timezone to avoid hydration mismatches.
 * All dates are formatted consistently regardless of server/client timezone.
 *
 * @example
 * <DateDisplay date={post.updatedAt} variant="short" />
 */
export function DateDisplay({
  date,
  variant = "medium",
  className,
}: DateDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Convert to UTC to ensure consistent formatting everywhere
  const utcDate = utcToZonedTime(dateObj, "UTC");

  // Format strings that match across all timezones
  const formats = {
    short: "MMM d", // Jan 31
    medium: "MMM d, yyyy", // Jan 31, 2026
    long: "MMMM d, yyyy", // January 31, 2026
    full: "MMMM d, yyyy, h:mm a", // January 31, 2026, 3:45 PM
  };

  const formatted = format(utcDate, formats[variant]);

  return (
    <time dateTime={dateObj.toISOString()} className={className}>
      {formatted}
    </time>
  );
}
```

#### 2. Create RelativeDate Component (Optional)

**File:** `src/components/RelativeDate.tsx`

```tsx
import { formatDistanceToNow } from "date-fns";

interface RelativeDateProps {
  date: Date | string;
  addSuffix?: boolean;
  className?: string;
}

/**
 * RelativeDate - Shows relative time (e.g., "2 hours ago")
 *
 * Relative time calculations are consistent on server/client,
 * making this hydration-safe.
 *
 * @example
 * <RelativeDate date={post.createdAt} addSuffix />
 */
export function RelativeDate({
  date,
  addSuffix = true,
  className,
}: RelativeDateProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const relative = formatDistanceToNow(dateObj, { addSuffix });

  return (
    <time
      dateTime={dateObj.toISOString()}
      title={dateObj.toLocaleDateString()}
      className={className}
    >
      {relative}
    </time>
  );
}
```

### Usage Examples

#### Basic Usage

```tsx
import { DateDisplay } from "@/components/DateDisplay";

export function BlogPost({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <DateDisplay date={post.publishedAt} variant="medium" />
      <div>{post.content}</div>
    </article>
  );
}
```

#### With Different Variants

```tsx
// Short format: "Jan 31"
<DateDisplay date={post.updatedAt} variant="short" />

// Medium format: "Jan 31, 2026"
<DateDisplay date={post.updatedAt} variant="medium" />

// Long format: "January 31, 2026"
<DateDisplay date={post.updatedAt} variant="long" />

// Full format: "January 31, 2026, 3:45 PM"
<DateDisplay date={post.updatedAt} variant="full" />
```

#### Relative Time

```tsx
import { RelativeDate } from "@/components/RelativeDate";

// Shows "2 hours ago", "3 days ago", etc.
<RelativeDate date={comment.createdAt} />;
```

## Migration Guide

### Step 1: Identify Problem Areas

Search for date formatting patterns in your codebase:

```bash
# Search for problematic date methods
grep -r "toLocaleDateString" src/
grep -r "toLocaleString" src/
grep -r "toLocaleTimeString" src/
```

### Step 2: Replace Existing Code

**Before:**

```tsx
{
  new Date(post.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
```

**After:**

```tsx
<DateDisplay date={post.updatedAt} variant="medium" />;
```

### Step 3: Common Replacements

| Old Code                                                               | New Code                                      |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| `date.toLocaleDateString()`                                            | `<DateDisplay date={date} />`                 |
| `date.toLocaleDateString("en-US", { month: "short", day: "numeric" })` | `<DateDisplay date={date} variant="short" />` |
| `formatDistanceToNow(date)`                                            | `<RelativeDate date={date} />`                |

### Step 4: Update Components

Search for components that format dates:

```bash
# Find components that might need updating
grep -r "toLocale" src/components/
```

Common files to update:

- Post cards/previews
- Comment sections
- User profile pages
- Activity logs
- Kanban boards
- Document metadata

## Why This Approach Works

### ✅ Benefits

1. **No Hydration Errors** - Same output on server and client
2. **No Loading States** - Content renders immediately
3. **SEO Friendly** - Search engines see real dates
4. **Semantic HTML** - Uses proper `<time>` elements with ISO `dateTime`
5. **Accessible** - Screen readers get proper semantic markup
6. **Performant** - No client-side re-rendering needed
7. **Type Safe** - Full TypeScript support
8. **Maintainable** - Single source of truth for date formatting
9. **Testable** - Predictable output in all environments

### 📊 Comparison

| Approach                        | Hydration Safe | SEO | UX | Performance |
| ------------------------------- | -------------- | --- | -- | ----------- |
| `toLocaleDateString()`          | ❌             | ✅  | ✅ | ✅          |
| Client-only with "Loading..."   | ✅             | ❌  | ❌ | ⚠️          |
| date-fns with UTC (Recommended) | ✅             | ✅  | ✅ | ✅          |
| `suppressHydrationWarning`      | ✅             | ✅  | ✅ | ✅          |

## Advanced: Custom Format Strings

You can extend the component with custom format strings:

```tsx
interface DateDisplayProps {
  date: Date | string;
  variant?: "short" | "medium" | "long" | "full";
  customFormat?: string; // date-fns format string
  className?: string;
}

export function DateDisplay({
  date,
  variant = "medium",
  customFormat,
  className,
}: DateDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const utcDate = utcToZonedTime(dateObj, "UTC");

  const formats = {
    short: "MMM d",
    medium: "MMM d, yyyy",
    long: "MMMM d, yyyy",
    full: "MMMM d, yyyy, h:mm a",
  };

  const formatStr = customFormat || formats[variant];
  const formatted = format(utcDate, formatStr);

  return (
    <time dateTime={dateObj.toISOString()} className={className}>
      {formatted}
    </time>
  );
}

// Usage:
<DateDisplay date={post.createdAt} customFormat="yyyy-MM-dd" />;
```

## Testing

After implementing these changes:

1. **Hard Refresh** - Press Ctrl+Shift+R to clear cache
2. **Check Console** - Verify no hydration errors appear
3. **Test SSR** - View page source to confirm dates are rendered
4. **Test Timezones** - Change system timezone and verify consistency
5. **Lighthouse Audit** - Check for CLS (Cumulative Layout Shift) improvements

## date-fns Format Reference

Common format strings:

| Pattern        | Result           | Description            |
| -------------- | ---------------- | ---------------------- |
| `MMM d`        | Jan 31           | Short month and day    |
| `MMM d, yyyy`  | Jan 31, 2026     | Short month, day, year |
| `MMMM d, yyyy` | January 31, 2026 | Full month, day, year  |
| `yyyy-MM-dd`   | 2026-01-31       | ISO date               |
| `h:mm a`       | 3:45 PM          | 12-hour time           |
| `HH:mm:ss`     | 15:45:30         | 24-hour time           |

Full reference:
[date-fns format documentation](https://date-fns.org/docs/format)

## Related Documentation

- [React Hydration Errors](https://react.dev/errors/418)
- [date-fns Documentation](https://date-fns.org/)
- [hydration.md](./hydration.md) - General hydration troubleshooting

## When You Need Localized Dates

For most blog/content sites, **UTC-based consistent dates are preferable** to
avoid complexity. If you need dates in the user's local timezone, render them
client-only inside a `useEffect` and show a neutral placeholder (`—`) during SSR
to avoid hydration mismatches.

---

**Last Updated:** April 10, 2026
