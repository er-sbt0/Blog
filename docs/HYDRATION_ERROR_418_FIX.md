# React Hydration Error #418 - Date Formatting Issue

## Problem

Application was throwing **React Error #418** (Minified React error), which is a
hydration mismatch error. This occurs when the HTML rendered on the server
doesn't match what React expects on the client during hydration.

### Error Message

```
Uncaught Error: Minified React error #418
at MessagePort.x (3628-594a94f4dd75a941.js:1:52153)
```

Full error explanation:
[https://react.dev/errors/418](https://react.dev/errors/418)

## Root Cause

The hydration mismatch was caused by **date formatting functions** that produce
different outputs between server and client:

1. **`toLocaleString()`** - Formats dates based on user's locale
2. **`toLocaleDateString()`** - Formats dates based on user's locale and
   timezone

These functions were being called during component render in:

- `ViewDocumentInfo.tsx` - Created/Updated timestamps
- `RecentPostsPreviewCard.tsx` - Post update dates
- `ReadmePreviewCard.tsx` - README update dates
- `KanbanBoard.tsx` - Task update dates

### Why This Causes Hydration Errors

- **Server**: Renders with server's timezone/locale settings
- **Client**: Renders with user's browser timezone/locale settings
- **Result**: Different HTML output → React hydration error

Additionally, **stale cookies** can cause the browser to have cached
authentication or session state that differs from the server's expectations,
leading to additional hydration mismatches.

## Solution

### 1. Created `ClientOnlyDate` Component

Created a new component that prevents hydration mismatches by only rendering
dates after client-side hydration:

**File**: `src/components/ClientOnlyDate.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";

export default function ClientOnlyDate({
  date,
  format = "medium",
  showTime = false,
  locale = undefined,
  customFormat,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span suppressHydrationWarning>Loading...</span>;
  }

  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (customFormat) {
    return <>{dateObj.toLocaleString(locale, customFormat)}</>;
  }

  // Format date based on props...
}
```

**How it works:**

- During SSR and initial hydration: Shows "Loading..." placeholder
- After mount: Renders the actual formatted date
- Ensures consistent output between server and client

### 2. Updated Components

Replaced direct date formatting with `ClientOnlyDate` in:

- ✅ `ViewDocumentInfo.tsx`
- ✅ `RecentPostsPreviewCard.tsx`
- ✅ `ReadmePreviewCard.tsx`
- ✅ `KanbanBoard.tsx`

**Before:**

```tsx
{
  new Date(post.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
```

**After:**

```tsx
<ClientOnlyDate
  date={post.updatedAt}
  customFormat={{ month: "short", day: "numeric" }}
  locale="en-US"
/>;
```

### 3. Fixed `HydrationManager` Component

Simplified the `HydrationManager` to avoid creating its own hydration
mismatches:

```tsx
// Before: Rendered different content during SSR vs client
if (!isHydrated) {
  return <div style={{ visibility: "hidden" }}>Loading...</div>;
}
return <>{children}</>;

// After: Consistent rendering with suppressHydrationWarning
return <div suppressHydrationWarning>{children}</div>;
```

### 4. Clear Browser Cookies

**Critical Step**: After deploying the fixes, users needed to **clear browser
cookies** to resolve cached state that was causing persistent hydration issues.

**Why cookies needed clearing:**

- Old session cookies may have cached authentication state
- Stale cookies can cause server/client state mismatches
- Browser extensions may have injected cookies that modify the DOM

## Resolution Steps

If you encounter this error:

1. **Check for date formatting** in your components
2. **Use `ClientOnlyDate`** for any date displays
3. **Clear browser cookies** and cache
4. **Test in incognito mode** to rule out browser extensions
5. **Check server vs client state** for any mismatches

## Prevention

To prevent hydration errors in the future:

### ✅ Do's

- Use `ClientOnlyDate` for all date formatting
- Wrap client-only code in `useEffect`
- Use `suppressHydrationWarning` sparingly and only when needed
- Test with hard refresh (Ctrl+Shift+R) to catch SSR issues
- Test in incognito mode to rule out cookies/extensions

### ❌ Don'ts

- Don't use `toLocaleString()` or `toLocaleDateString()` directly in render
- Don't use `Date.now()` or `Math.random()` during render
- Don't access `window` or `document` outside of `useEffect`
- Don't assume server and client have the same timezone/locale

## Related Documentation

- [React Hydration Errors](https://react.dev/errors/418)
- [HYDRATION.md](./HYDRATION.md) - General hydration troubleshooting
- [NEXTAUTH_SSR_SESSION.md](./NEXTAUTH_SSR_SESSION.md) - Session handling
  patterns

## Testing

After implementing these fixes:

1. Hard refresh the page (Ctrl+Shift+R)
2. Clear cookies and cache
3. Open browser DevTools console
4. Verify no hydration errors appear
5. Test in both light and dark mode
6. Test with different timezones/locales

## Date Fixed

January 31, 2026
