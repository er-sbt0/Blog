# Hydration Error Troubleshooting

This document helps you diagnose and fix common hydration errors in the Blog
Editor.

## What is Hydration?

Hydration is the process where React attaches event listeners to server-rendered
HTML. Errors occur when the server-rendered HTML doesn't match what React
expects on the client.

## Common Causes

### 1. Browser Extensions

Browser extensions can modify the DOM before React hydrates, causing mismatches.

**Solution**: Test in incognito mode or disable extensions.

### 2. Date/Time Differences

Server and client may render different dates/times due to timezone or locale
differences between the server environment and the user's browser.

**Solution**: Format dates with a fixed timezone (UTC) using `date-fns` so the
output is identical on server and client. Avoid `toLocaleDateString()`,
`toLocaleString()`, and `toLocaleTimeString()`.

See [date-formatting.md](./date-formatting.md) for
the full guide including the `DateDisplay` and `RelativeDate` components.

### 3. Random Values

Using `Math.random()` or `Date.now()` during render produces different values.

**Solution**: Generate random values in `useEffect` or use seeded random
generators.

### 4. Window/Document Access

Accessing `window` or `document` during server render causes issues.

**Solution**: Wrap browser-only code in `useEffect` or check
`typeof window !== 'undefined'`.

## Debugging Steps

1. Check the browser console for specific hydration warnings
2. Look for components that render differently on server vs client
3. Use React DevTools to inspect component state
4. Test with extensions disabled

## Getting Help

If you continue to experience issues, please open an issue on the repository
with:

- Browser and version
- Steps to reproduce
- Console error messages

## Related Documentation

- [date-formatting.md](./date-formatting.md) — Consistent UTC-based date rendering
- [nextauth-ssr.md](./nextauth-ssr.md) — Session availability issues during SSR
