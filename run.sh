#!/bin/bash
# Build and run blog-simple.
# Usage: ./run.sh [dev|build|start|migrate|install|desktop|desktop:build|desktop:package]
set -e

cd "$(dirname "$0")"

[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
[ -f .env ] && set -a && source .env && set +a

migrate() { pnpm exec prisma migrate deploy; }

# The desktop shell serves .next-desktop; it refuses the VPS bundle in .next.
# See packages/desktop/README.md, "Two builds, and why".
desktop_build() {
  pnpm exec prisma generate
  pnpm build:desktop
}

# Electron's SUID sandbox helper cannot be extracted setuid by pnpm, and on
# Ubuntu 23.10+ the namespace sandbox that would stand in for it is closed, so
# `electron .` aborts. Fall back to --no-sandbox for a working-tree run and say
# how to fix it properly (packages/desktop/README.md, "Chromium's sandbox").
desktop_start() {
  local dist helper
  dist=$(cd packages/desktop && node -p "require('electron')")
  helper="${dist%/electron}/chrome-sandbox"
  if [ -u "$helper" ] && [ "$(stat -c %U "$helper")" = root ]; then
    pnpm desktop
  else
    echo "warning: $helper is not setuid root; running without the Chromium sandbox." >&2
    echo "  fix once: sudo chown root:root '$helper' && sudo chmod 4755 '$helper'" >&2
    pnpm --filter @blog/desktop start:no-sandbox
  fi
}

case "${1:-dev}" in
  install)
    pnpm install
    pnpm exec prisma generate
    ;;
  dev)
    pnpm exec prisma migrate dev
    pnpm dev
    ;;
  build)
    pnpm install --frozen-lockfile
    pnpm exec prisma generate
    pnpm build
    ;;
  start)
    # No migrate here on purpose: schema changes are applied out-of-band, before
    # the server starts, so a rollback is a deploy rather than a restore.
    pnpm start
    ;;
  migrate)
    migrate
    ;;
  desktop:build)
    desktop_build
    ;;
  desktop)
    # Builds only when there is no desktop bundle yet; rerun desktop:build after
    # changing src/. The shell runs its own embedded Postgres, never :5432.
    [ -f .next-desktop/standalone/server.js ] || desktop_build
    desktop_start
    ;;
  desktop:package)
    # An AppImage and a .deb into packages/desktop/.dist/, from a fresh bundle.
    desktop_build
    pnpm package:desktop
    ;;
  *)
    echo "usage: $0 [dev|build|start|migrate|install|desktop|desktop:build|desktop:package]" >&2
    exit 1
    ;;
esac
