import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin";
import withPWA from "./next-pwa";

const withVanillaExtract = createVanillaExtractPlugin();

// Cache duration constants (in seconds)
const ONE_DAY = 24 * 60 * 60;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * The Electron build (docs/plans/desktop-app.md §5), set by `pnpm build:desktop`.
 *
 * It is a *separate build* rather than a runtime flag, and two things force
 * that. The service worker below is injected into the client entry by a webpack
 * plugin, so whether it exists is settled when the bundle is written; and
 * `NEXT_PUBLIC_*` is inlined as a string literal at build time, so no runtime
 * variable can ever reach a client component. One flag decides both, and
 * `BUILD_DIR` keeps the output beside `.next` rather than on top of it — the
 * VPS bundle is produced by an unchanged `pnpm build` and is byte-for-byte what
 * it was.
 */
const IS_DESKTOP = process.env.DESKTOP === "1";

const withBundleAnalyzerConfig = {
  enabled: process.env.ANALYZE === "true",
};

const withPWAConfig = {
  dest: "public",
  // Off in development as before, and off in the desktop build whatever
  // NODE_ENV says. A packaged Electron app *is* NODE_ENV=production, so without
  // this it would register a service worker whose `runtimeCaching` puts a
  // NetworkFirst rule over `/api/.*` — against a server on an ephemeral
  // loopback port that changes every launch. That is a stale-data hazard with
  // nothing to gain: there is no network between the window and the server, and
  // `/offline` (the `fallbacks.document` below) can never be the honest answer.
  disable: !IS_PRODUCTION || IS_DESKTOP,
  register: true,
  buildExcludes: ["app-build-manifest.json"],
  skipWaiting: true,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: ONE_YEAR,
        },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-font-assets",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: ONE_WEEK,
        },
      },
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-image-assets",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:mp3|wav|ogg)$/i,
      handler: "CacheFirst",
      options: {
        rangeRequests: true,
        cacheName: "static-audio-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-js-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-style-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-data",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/api\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "apis",
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: ONE_DAY,
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "others",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
};

const nextConfig: NextConfig = {
  // Emit `.next/standalone` — a self-contained server bundling only the
  // dependencies actually traced, which is what the Dockerfile's runner stage
  // copies. Production is a container on a single VPS
  // (docs/plans/production-deployment.md), so this has a consumer again.
  output: "standalone",
  devIndicators: false,
  reactStrictMode: true,
  distDir: process.env.BUILD_DIR || ".next",
  // The one build-time flag the client half of the app can see. Derived from
  // `DESKTOP` rather than set alongside it, so `pnpm build:desktop` cannot
  // produce a bundle whose server thinks it is desktop and whose client does
  // not. Read through `IS_DESKTOP_CLIENT` in `src/lib/desktop.ts`.
  env: {
    NEXT_PUBLIC_DESKTOP: IS_DESKTOP ? "1" : "",
  },
  // Skip ESLint during build - run separately with `npm run lint`
  //
  // `dirs` is what `npm run lint` (`next lint`) actually walks. Its default is
  // app/pages/components/lib/src, of which only `src` exists here — so
  // `packages/` would be linted by nothing at all. Named explicitly ahead of
  // the editor extraction (docs/plans/archive/haklex-adoption.md §4.3).
  //
  // `mcp/` and `scripts/` are deliberately *not* listed. Neither has ever been
  // linted, and `mcp/smoke.ts` is a CLI that legitimately prints (26 pre-existing
  // `no-console` errors). Bringing them in is a separate decision from this one.
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ["src", "packages"],
  },
  // Type checking is the default build's job, and the desktop build must not
  // repeat it — not to go faster, but because it *cannot*.
  //
  // `next build` generates per-route type validators into `<distDir>/types` and
  // adds that directory to `tsconfig.json`'s `include` itself. Run a second
  // build under a second `distDir` and the project has two generated `types`
  // trees in scope at once, declaring the same globals; the first attempt failed
  // on `PageProps` from a `.next/types` written by an older Next. Mutating a
  // committed `tsconfig.json` as a side effect of a build is the actual defect
  // here, and `.next-desktop` is in `exclude` so `pnpm exec tsc --noEmit` never
  // sees either.
  //
  // Nothing is lost. The desktop build compiles the *same source* as the default
  // one — what differs is an inlined `NEXT_PUBLIC_DESKTOP` and a webpack plugin
  // that does not run, neither of which has a type. `pnpm build` and
  // `pnpm exec tsc --noEmit` both still check it, and both are repo gates.
  typescript: {
    ignoreBuildErrors: IS_DESKTOP,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Use webpack for consistency
    webpackBuildWorker: true,
  },
  // Deterministic MUI component imports: rewrite the `@mui/material` barrel to
  // per-component paths so the barrel's whole surface is not pulled in.
  //
  // Still earning its keep after the editor came off MUI
  // (docs/plans/archive/haklex-adoption.md §5): the app shell keeps MUI, and 131 files
  // under `src/` still import from the barrel. What changed is its reach —
  // `packages/**` is now MUI-free and lint-enforced, so this transform no
  // longer touches the editor at all.
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("canvas");
    }
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: "asset/resource",
      resourceQuery: /url/,
    });

    // Ensure consistent class names between server and client
    if (config.optimization) {
      config.optimization.realContentHash = false;

      // Additional optimization settings for consistent builds
      if (config.optimization.minimizer) {
        config.optimization.minimizer.forEach(
          (
            plugin: {
              constructor: { name: string };
              options: { terserOptions?: any };
            },
          ) => {
            if (plugin.constructor.name === "TerserPlugin") {
              plugin.options.terserOptions = {
                ...plugin.options.terserOptions,
                keep_classnames: true,
                keep_fnames: true,
              };
            }
          },
        );
      }
    }

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)\.woff2",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, OPTIONS",
          },
        ],
      },
    ];
  },
};

/**
 * Wrapper order matters, and both of the inner two *chain* rather than replace.
 *
 * `withVanillaExtract` is innermost so that the `webpack:` fn above still runs:
 * the plugin installs its loaders and `VanillaExtractPlugin`, then hands the
 * config on —
 *
 *   if (typeof nextConfig.webpack === 'function') {
 *     return nextConfig.webpack(config, options);
 *   }
 *
 * (`@vanilla-extract/next-plugin/dist/…cjs.dev.js:261-263`). The vendored
 * `next-pwa/index.js:63-64` does the same for whatever it wraps, so all three
 * webpack contributions survive.
 *
 * **This build is webpack, deliberately.** `next dev` and `next build` are both
 * run without `--turbopack` (see `package.json`). Adding that flag would drop
 * every vanilla-extract style silently: the plugin's Turbopack support is
 * `unstable_turbopack.mode: "off"` by default and requires Next >= 16 even when
 * switched on (`…cjs.dev.js:159-163`), so on Next 15 it configures no Turbopack
 * rule at all and `.css.ts` files compile to nothing.
 */
export default withBundleAnalyzer(withBundleAnalyzerConfig)(
  withPWA(withPWAConfig)(withVanillaExtract(nextConfig)),
);
