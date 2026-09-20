"use client";
import { User } from "@/types";
import { signOut } from "next-auth/react";
import { Button } from "@mui/material";
import { useSelector } from "@/store";
import { IS_DESKTOP_CLIENT } from "@/lib/desktop";
import LoginButtons from "./LoginButtons";

/**
 * The sign-in / sign-out half of {@link UserCard}.
 *
 * Split out because `UserCard` also renders on `/user/[id]`, which moved to the
 * `(public)` route group and has no Redux store (plan §8.1). `initialized` is
 * the only store read the card had left, and it only ever mattered under
 * `showActions` — which today means the dashboard, inside the workspace. So the
 * read moves into a component that is only mounted there, rather than the card
 * carrying a store dependency it uses on one of its three call sites.
 *
 * ## Neither affordance exists in the desktop build
 *
 * docs/plans/desktop-app.md §5, and it is a dead end rather than a tidy-up. The
 * desktop build configures no OAuth provider (§4.2), so `LoginButtons` has
 * nothing to offer and `signOut()` is a door that locks behind you: it deletes
 * the `Session` row the Electron shell minted, and there is no flow by which
 * anyone could make another. Phase 3 answered that by having the shell notice,
 * restore the session and say so in a dialog — correct as a safety net, wrong
 * as the product. A button whose only outcome is an apology should not be on
 * screen.
 *
 * The shell's watcher stays, because `/api/auth/signout` is still reachable by
 * other means and the session is still worth repairing when it goes. This is
 * the affordance, not the mechanism.
 *
 * Rendering nothing rather than a disabled button: disabled implies a state in
 * which it would work, and there is none. `IS_DESKTOP_CLIENT` is a build-time
 * literal (see `src/lib/desktop.ts`), so the web bundle is unchanged — the
 * branch folds away.
 */
const UserSessionActions: React.FC<{ user?: User }> = ({ user }) => {
  const initialized = useSelector((state) => state.ui.initialized);

  if (IS_DESKTOP_CLIENT) return null;

  if (user) {
    return (
      <Button size="small" onClick={() => signOut()}>
        Logout
      </Button>
    );
  }
  return initialized ? <LoginButtons size="small" /> : null;
};

export default UserSessionActions;
