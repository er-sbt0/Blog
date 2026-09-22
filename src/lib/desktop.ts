/**
 * Which build this is — the app on a public server, or the Electron desktop
 * shell (docs/plans/desktop-app.md §5).
 *
 * Import-free on purpose, like `blobPath.ts` and `dragGeometry.ts`, so the
 * gating logic is exercisable without a Next runtime. Every function takes its
 * environment so a spec can hand it one.
 *
 * ## Two names, and why there have to be two
 *
 * `DESKTOP` is a server variable: the desktop shell builds a closed environment
 * for the Next child process (`packages/desktop/src/server.js`) and sets it
 * there. Server code — route handlers, `robots.ts`, `sitemap.ts` — reads it at
 * request time, which is the same way it reads `PUBLIC_URL` or `BLOB_DIR`.
 *
 * A **client** component cannot read it. `process.env` does not exist in the
 * browser bundle except for the `NEXT_PUBLIC_*` names webpack inlines as string
 * literals **at build time**, so a runtime variable can never reach one. That is
 * why phase 5 builds the desktop bundle separately (`pnpm build:desktop`, which
 * is `DESKTOP=1 BUILD_DIR=.next-desktop next build`): `next.config.ts` derives
 * `NEXT_PUBLIC_DESKTOP` from `DESKTOP` at build time, so the two cannot disagree
 * by being set differently — they are set once, by one command.
 *
 * The same build step is what turns `next-pwa` off, which is the other thing
 * that can only be decided at build time: the service-worker registration is
 * injected into the client entry by a webpack plugin.
 *
 * ## Gate on `DESKTOP`, never on the absence of something else
 *
 * §4.2 and §13.2 both record why. "No OAuth is configured" and "no S3 is
 * configured" are conditions a *misconfigured VPS* also satisfies, and a build
 * that infers desktop-ness from one of them fails silently in the expensive
 * direction. The flag is explicit, or there is no flag.
 */

/**
 * Just the variables this module reads, so a spec can pass a literal.
 *
 * The index signature is what makes `process.env` assignable to it — without
 * one, `ProcessEnv` and a two-field interface have "no properties in common"
 * and every default argument is a type error.
 */
export interface DesktopEnv {
  DESKTOP?: string | undefined;
  PUBLIC_URL?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * True in the Electron build, false everywhere else.
 *
 * Server-side only — see the docblock. The value is `"1"` exactly; anything
 * else, including `"true"` and `"0"`, is not the desktop build. A flag that
 * accepts several spellings is a flag two places can disagree about.
 */
export function isDesktopBuild(env: DesktopEnv = process.env): boolean {
  return env.DESKTOP === "1";
}

/**
 * The same answer, for client components.
 *
 * A literal after webpack's `DefinePlugin` has run, which is what makes it
 * readable in the browser at all. Do not replace it with a function call on
 * `process.env` — the inlining is textual, and `process` is not a thing on the
 * client.
 */
export const IS_DESKTOP_CLIENT: boolean =
  process.env.NEXT_PUBLIC_DESKTOP === "1";

/**
 * The address this site is published at, or `null` when it has none.
 *
 * This is **not** "the origin this server answers on". The two are the same on
 * the VPS and different on desktop, where the server answers on a loopback port
 * that changes every launch and nothing is published anywhere. Callers that want
 * the first want `PUBLIC_URL` directly — `src/app/layout.tsx`'s `metadataBase`
 * is the one left, and the shell gives it a real loopback origin. (The louder
 * one used to be `src/app/api/utils.ts`, which fetched `${PUBLIC_URL}/api/embed`
 * to render `/view` and `/embed`; it calls `generateServerHtml` in-process now.)
 *
 * `null` rather than `""` or `undefined` so a caller has to answer for it: §5's
 * instruction is a defined answer for the local case, and the string-concat that
 * produced `undefined/view/…` in a sitemap is what an unset value gets you
 * otherwise.
 */
export function publicSiteUrl(env: DesktopEnv = process.env): string | null {
  // A desktop build has no public address, whatever PUBLIC_URL says — the shell
  // sets it to the loopback origin so `metadataBase` resolves, and advertising
  // `http://127.0.0.1:41234/` to a crawler would be worse than saying nothing.
  if (isDesktopBuild(env)) return null;
  return env.PUBLIC_URL || null;
}
