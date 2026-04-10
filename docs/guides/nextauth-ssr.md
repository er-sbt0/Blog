# NextAuth Session Handling in Server Components

## The Problem

When using `getServerSession()` in Next.js App Router server components with
`dynamic = "force-dynamic"`, the session may not be available during server-side
rendering, even when the user is authenticated. This causes components that rely
on user data to render incorrectly on initial page load (hard refresh).

### Symptoms

- Hard refresh (Ctrl+Shift+R): User-dependent UI elements don't appear
- Client-side navigation: Everything works correctly
- `getServerSession()` returns `null` during SSR even though user is logged in

## The Solution Pattern

For any client component that needs user data, use a **hybrid approach**:

### 1. Server Component (Page)

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const session = await getServerSession(authOptions);

  // Serialize user object (optional but recommended for complex objects)
  const user = session?.user
    ? {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      handle: session.user.handle,
      role: session.user.role,
    }
    : undefined;

  return <MyClientWrapper user={user} />;
}
```

### 2. Client Component Wrapper

```typescript
"use client";
import { useSession } from "next-auth/react";
import { User } from "@/types";

interface MyClientWrapperProps {
  user?: User; // From server
}

const MyClientWrapper: React.FC<MyClientWrapperProps> = ({
  user: serverUser,
}) => {
  // Fetch session on client-side as fallback
  const { data: session } = useSession();
  const clientUser = session?.user as User | undefined;

  // Use server user if available, otherwise fall back to client user
  const user = serverUser || clientUser;

  return <MyActualComponent user={user} />;
};
```

## Why This Works

1. **Server attempt**: Tries to get session on server (may fail during SSR)
2. **Client fallback**: Uses `useSession()` hook to fetch session on client if
   server failed
3. **Graceful degradation**: Component works regardless of which source provides
   the user data

## When to Apply This Pattern

Apply this pattern whenever:

- ✅ Server component passes user data to client component
- ✅ Page uses `dynamic = "force-dynamic"`
- ✅ UI elements depend on user authentication/authorization
- ✅ Component needs to work correctly on hard refresh

Don't apply this pattern when:

- ❌ API routes (server-only, sessions work fine)
- ❌ Server-only logic (no client component involved)
- ❌ Client component that already uses `useSession()` and doesn't receive
  server props

## Alternative Approaches Considered

### Why not just use client-side session?

- Slower initial render (requires extra API call)
- SEO/metadata may need user data on server
- When server session works, it's faster

### Why not fix `getServerSession()`?

- This appears to be a NextAuth + App Router interaction issue
- The hybrid approach is more resilient regardless

## Testing Checklist

When implementing this pattern, verify:

1. ✅ Hard refresh shows user-dependent UI correctly
2. ✅ Client-side navigation works
3. ✅ Logged out state handled correctly
4. ✅ Logged in state handled correctly
5. ✅ No console errors during hydration

## Related Documentation

- [hydration.md](./hydration.md) — General hydration error troubleshooting
- [../architecture/overview.md](../architecture/overview.md) — Application layer rules including server/client component boundaries
