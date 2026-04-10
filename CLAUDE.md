# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a modern blog platform built with Next.js 15, featuring a rich
Lexical-based editor with support for mathematical content, interactive
visualizations, and series organization. The application uses Prisma with
PostgreSQL for data persistence, NextAuth for authentication, and Redux Toolkit
for state management.

## Development Commands

### Core Development

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
```

### Maintenance

```bash
npm run clean        # Remove .next and cached files
npm run rebuild      # Clean and rebuild
npx prisma generate  # Generate Prisma client
npx prisma migrate dev # Run database migrations
npx prisma studio    # Browse database in browser UI
```

### Testing

There is no test runner configured in `package.json`. A single test file exists
at `src/utils/__tests__/collaborators.test.ts` but there is no Jest/Vitest setup
to run it. Lint with `npm run lint`.

## Architecture

### Database Schema (Prisma)

The application uses PostgreSQL with the following core models:

- **User**: User accounts with NextAuth integration, supports handles for
  profile URLs
- **Document**: Main content model that represents blog posts (type: DOCUMENT)
  - Supports hierarchical structure (parent/children relationships)
  - Includes fork relationships (base/forks)
  - Has status field (ACTIVE/DONE) for workflow management
  - Supports series organization via `seriesId` and `seriesOrder`
  - Has optional background images
- **Series**: Organizes posts into multi-part content series
- **Revision**: Version history for documents, stored as JSON
- **DocumentCoauthers**: Many-to-many relationship for collaborative editing
- **Account/Session/VerificationToken**: NextAuth models

### Local vs Cloud Storage

Documents have a dual-storage architecture:

- **Local**: Stored in browser IndexedDB (`src/indexeddb/`). Accessible without
  authentication, supports offline use.
- **Cloud**: Stored in PostgreSQL via Prisma. Requires authentication.

Redux thunks have paired local/cloud variants (e.g., `createLocalDocument` /
`createCloudDocument`, `createLocalRevision` / `createCloudRevision`). The
`load` thunk initializes both sources and merges them into the Redux store.

### State Management (Redux Toolkit)

Single app slice at `src/store/app.ts`. State shape:

```typescript
{ documents: EditorDocument[], posts: UserPost[], series: Series[], ui: { ... } }
```

Key async thunks:

- Document operations: load, create, update, delete, fork, duplicate (both local
  and cloud)
- Post operations: loadPosts, createPost, updatePost, deletePost
- Series operations: loadSeries, createSeries, updateSeries, deleteSeries
- Revision operations: create, get, delete revisions (both local and cloud)
- User operations: updateUser
- Storage: getLocalStorageUsage, getCloudStorageUsage

### Repository Pattern

Business logic is organized in repository files (`src/repositories/`):

- `document.ts`: Document CRUD operations, forking, archiving
- `post.ts`: Post-specific operations with series support
- `series.ts`: Series management and post organization
- `revision.ts`: Version control operations
- `user.ts`: User profile operations

### API Routes (Next.js App Router)

API routes are in `src/app/api/`:

- `/api/documents/*`: Document management
- `/api/posts/*`: Post-specific endpoints
- `/api/series/*`: Series management
- `/api/revisions/*`: Revision history
- `/api/users/*`: User profiles
- `/api/auth/[...nextauth]`: NextAuth authentication
- `/api/completion`: AI completion endpoint (supports Anthropic, Google, Ollama,
  Azure OpenAI)
- `/api/docx/*`, `/api/pdf/*`: Export functionality
- `/api/og`: Open Graph image generation
- `/api/thumbnails/*`: Document thumbnails

Server actions have a 2MB body size limit (configured in `next.config.ts`).

### Lexical Editor

The rich text editor is built with Lexical (`src/editor/`):

**Editor Structure:**

- `Editor.tsx`: Main editor component
- `config.tsx`: Editor configuration and theme
- `theme.css` / `theme.tsx`: Styling and theming

**Custom Nodes** (`src/editor/nodes/`):

- Math equations (MathLive integration)
- Graphs (Geogebra integration)
- Sketches (Excalidraw integration)
- Images, Tables, Code blocks
- Horizontal rules, Page breaks
- Collapsible sections, Sticky notes

**Plugins** (`src/editor/plugins/`):

- Core: FloatingToolbar, DragDropPastePlugin, SavePlugin
- Content: MathPlugin, GraphPlugin, SketchPlugin, ImagePlugin, AttachmentPlugin
- Formatting: CodePlugin, ListPlugin, MarkdownPlugin
- Layout: LayoutPlugin, TablePlugin, KanbanPlugin
- Features: LinkPlugin, ComponentPickerPlugin, NodeSelectionPlugin

### Component Organization

Key UI components (`src/components/`):

- **Playground**: Standalone editor component
- **BlogManager**: Main blog management interface
- **PostsList**: Display and manage posts
- **SeriesGrid** / **SeriesView** / **SeriesCard**: Series organization UI
- **DocumentBrowser**: Browse and search documents
- **EditDocument**: Document editing interface
- **DocumentActions** / **SeriesActions**: Action menus
- **TrashBin**: Soft delete management
- **NotesCanvas**: Canvas for sticky notes
- **Auth**: Authentication components
- **Layout**: Page layouts and structure

### Path Aliases

TypeScript path aliases are configured:

- `@/*` → `src/*`
- `@public/*` → `public/*`

### Environment Variables

Required environment variables (see `.env.example`):

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET`: NextAuth configuration
- `PUBLIC_URL`: Public base URL of the app
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth

Optional:

- AI APIs: `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OLLAMA_API_URL`
- Azure OpenAI: `AZURE_API_KEY`, `AZURE_OPENAI_BASE_URL`,
  `AZURE_OPENAI_API_VERSION`
- `NEXT_PUBLIC_FASTAPI_URL`: External FastAPI backend URL
- `BROWSERLESS_URL`: For PDF generation (falls back to local Puppeteer)

## Important Notes

### Build Configuration

- ESLint is skipped during build (`eslint.ignoreDuringBuilds: true`)
- Bundle analyzer available with `ANALYZE=true npm run build`
- PWA support enabled in production
- Webpack configured for MUI modular imports and font handling
- `npm install` automatically applies patches via `patch-package` (see
  `/patches/`)

### ESLint Rules

Key rules enforced by `eslint.config.mjs`:

- `no-console`: only `console.warn` and `console.error` are allowed
- `@typescript-eslint/no-explicit-any`: disallowed
- `react-hooks/exhaustive-deps`: enforced

### Documentation

Additional documentation is in the `/docs/` directory, including guides on
hydration issues, component architecture, and implementation-specific notes.

### AI Integration

The application supports multiple AI providers for completion:

- Anthropic (Claude)
- Google (Gemini)
- Ollama (local models)
- Azure OpenAI

Configuration is in `src/lib/ai/`.

## Debugging

- Hydration errors: see `docs/guides/hydration.md`. Common causes are browser
  extensions, date/time SSR mismatches, and `window`/`document` access during
  SSR.
- Use React DevTools for component inspection
