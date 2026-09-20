/**
 * electron-builder's `afterPack` hook: run the packaging gate.
 *
 * A hook rather than a step after `electron-builder` in the `package` script,
 * because it has to be impossible to skip. This runs once per arch on the
 * directory both targets are built from, so an AppImage and a `.deb` carrying a
 * `.env` cannot be produced by invoking `electron-builder` directly.
 *
 * Throwing here fails the build (docs/plans/desktop-app.md §5).
 */
import { verifyPackage } from "./verify-package.mjs";

export default async function afterPack(context) {
  console.warn(`[verify] ${context.appOutDir}\n${verifyPackage(context.appOutDir)}`);
}
