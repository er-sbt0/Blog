import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import withPWA from "./next-pwa";

const IS_VERCEL = !!process.env.NEXT_PUBLIC_VERCEL_URL;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const withBundleAnalyzerConfig = {
  enabled: process.env.ANALYZE === "true",
};

const withPWAConfig = {
  dest: "public",
  disable: !IS_PRODUCTION,
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
          maxAgeSeconds: 365 * 24 * 60 * 60,
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
          maxAgeSeconds: 7 * 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
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
          maxAgeSeconds: 24 * 60 * 60,
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
};

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: false,
  distDir: process.env.BUILD_DIR || ".next",
  // Skip ESLint during build - run separately with `npm run lint`
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip TypeScript errors during build for faster builds (optional)
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  experimental: {
    turbo: {
      rules: {},
    },
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Use webpack for consistency
    webpackBuildWorker: true,
  },
  // Add modularizeImports for deterministic MUI component imports
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
    "@mui/icons-material": {
      transform: "@mui/icons-material/{{member}}",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("canvas");
    }
    if (IS_VERCEL) {
      config.externals.push("puppeteer");
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
        config.optimization.minimizer.forEach((plugin: { constructor: { name: string }, options: { terserOptions?: any } }) => {
          if (plugin.constructor.name === 'TerserPlugin') {
            plugin.options.terserOptions = {
              ...plugin.options.terserOptions,
              keep_classnames: true,
              keep_fnames: true,
            };
          }
        });
      }
    }
    
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)\.woff2",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,OPTIONS,PATCH,DELETE,POST,PUT",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(withBundleAnalyzerConfig)(
  withPWA(withPWAConfig)(nextConfig),
);
