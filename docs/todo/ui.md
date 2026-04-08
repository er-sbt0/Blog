> **Scope note**: Mobile support is **out of scope** for the current phase. All
> mobile/touch-specific items are excluded from the active backlog.

---

## Executive Summary

This blog platform has strong technical foundations — a Lexical-based editor
with math/graph support, a dual local/cloud storage model, and solid server-side
rendering. However, it suffers from **critical mobile navigation breakage** (no
way to open the sidebar after it closes), **competing/dead layout systems**
(unused CSS variables, an orphaned TopAppBar component), and **insufficient
save-state feedback** in the editor. The visual design leans heavily on default
MUI with minimal customization — the theme has no custom palette, no custom
typography scale, and no brand identity beyond "Editor." The reading experience
on the view page uses hardcoded inline styles (`paddingRight: "80px"`) instead
of responsive MUI layout, and scrollbar hiding globally harms usability. The
information architecture is reasonable for an author dashboard, but confusing
for public readers — there is no discoverable sign-in path for unauthenticated
visitors. The card system (PostCard, SeriesCard) is well-abstracted but the home
page is author-centric (Kanban board, sticky notes, README viewer) when it
should prioritize content discovery. Accessibility gaps include missing ARIA
labels on several interactive elements, the drag-to-resize sidebar being
keyboard-inaccessible, and the floating toolbar being entirely hidden on mobile.

---

## Dimension Reviews

### 1. INFORMATION ARCHITECTURE & NAVIGATION

**1.1** ~~🔴 **Mobile users have no way to open the sidebar.**~~ _(OUT OF SCOPE
— mobile not supported)_ The sidebar uses `variant="temporary"` on mobile and
auto-closes on navigation, but there is no hamburger menu, FAB, or any other UI
affordance to reopen it. `TopAppBar` (which would provide a top-bar with
navigation) exists in source but is **not mounted anywhere** — it is dead code.
The only toggle is the keyboard shortcut `Ctrl+Alt+S`, which is undiscoverable
and unavailable on phones. This makes the app essentially navigation-dead on
mobile after any route change.

**1.2** 🟠 **The home page is a personal dashboard, not a blog landing page.** A
first-time visitor sees a notes canvas, a Kanban board, a README viewer, and
recent posts tucked into the bottom third. This is an author's workspace, not a
public blog homepage. For a blog platform, the hero content should be
posts/series, not sticky notes.

**1.3** 🟡 **Breadcrumbs are functional but shallow.** `Breadcrumbs.tsx` never
renders a "Home" link as the root segment — it only renders route-specific
items. A breadcrumb trail without a consistent root anchor point is less useful.
The view page shows "Posts > View Post" — the "View Post" label is generic when
it should show the document title.

**1.5** 🟡 **URL structure is inconsistent.** Posts use `/view/[id]` for reading
and `/edit/[id]` for editing, but the browse page is at `/browse` while the
posts list is at `/posts`. The `/browse` page renders `DocumentBrowser` which is
functionally similar to `/posts`. This creates confusion about which is the
canonical post listing.

### 2. VISUAL DESIGN & CONSISTENCY

**2.1** 🟠 **The MUI theme is virtually uncustomized.** `ThemeProvider.tsx`
creates a theme with only `colorSchemes`, `cssVariables`, and a container width
override. There is no custom palette, no typography scale, no component default
overrides for buttons/cards/etc. The entire app renders in stock MUI blue
(`#1976d2`) with default Roboto sizing. This produces a generic, unbranded feel.

**2.2** 🟡 **Card theme tokens in `theme.ts` are extensive but exist in
isolation.** The `cardTheme` object defines its own typography sizes, spacing,
colors, and shadow tokens that are not derived from the MUI theme. This creates
a parallel design system — changes to MUI theme won't propagate to cards, and
vice versa.

**2.3** 🟡 **Hardcoded color values throughout.** Examples: `#424242` for
done-status border in `CardBase.tsx`, `#72CCFF` and `#FFBB28` in `Dashboard.tsx`
pie charts, `red` for nprogress in globals.css, gradient strings in
`cardTheme.colors.status`. These should reference theme tokens.

**2.4** 🟠 **The view page reading experience uses inline styles instead of
responsive layout.** `ViewDocument.tsx` has `paddingRight: "80px"` hardcoded as
an inline style — this creates excessive right padding on mobile and doesn't
adapt. The body wrapper also has `paddingLeft: "5px"` (inconsistent with the
80px right padding), and the cursor is set to `pointer` for editable docs on the
entire page, which is misleading.

**2.5** 🟡 **SplashScreen styling is in globals.css, not MUI.** The
`.splash-screen` and `.splash-screen-content` classes use raw CSS with fixed
dimensions and MUI class name selectors (`.MuiTypography-overline`) — brittle
and outside the theme system.

### 3. LAYOUT & RESPONSIVENESS

**3.1** 🟠 **The sidebar width system has conflicting values.** CSS custom
properties in `globals.css` define `--sidebar-width: 72px` and
`--sidebar-width-expanded: 240px`, but these are **never consumed** anywhere.
The actual system uses TS constants
(`COLLAPSED=72, DEFAULT=130, MIN=130, MAX=450`) via `SidebarWidthContext`. The
CSS variables are dead code that will confuse any developer reading globals.css.
Meanwhile, `SIDEBAR_CONTENT_MARGIN` is a **fixed 105px** regardless of actual
sidebar width — meaning at the default 130px width, there's a 25px overlap, and
at wider widths the content margin doesn't adjust.

**3.2** 🟠 **Content area constraints are awkward.** `AppLayout` applies
`SIDEBAR_CONTENT_MARGIN = 105px` as a fixed left margin and
`CONTENT_RIGHT_PADDING = 75px` as a fixed right padding. On a 1440px screen with
a 130px sidebar, this leaves ~1230px for content — fine. But on a 1024px screen,
only ~844px remains, and on tablet-width screens these fixed values eat too much
space. Combined with `Container maxWidth={false}`, content can stretch to full
width with no max-width constraint for reading comfort.

**3.3** 🟡 **The resizable sidebar is a power-user feature with usability
cost.** The 4px drag handle at the sidebar edge is small, uses
`cursor: col-resize` but has no visible affordance until hover. It's not
accessible via keyboard. The resize range (130–450px) is wide, and there's no
snap-to-default behavior. Most blog readers don't need a resizable sidebar.

**3.4** 🟡 **Scrollbar is globally hidden.** The CSS in `globals.css` sets
`scrollbar-width: none` and `::-webkit-scrollbar { width: 0 }` on all elements.
While this creates a clean look, it removes a fundamental scrolling affordance.
Users have no visual indicator of their scroll position or how much content
remains — especially problematic in long posts and the sidebar's active posts
list.

### 4. INTERACTION DESIGN & FLOWS

**4.1** 🟠 **"Create post" flow requires knowing to go to Posts page first.**
The CreatePostDrawer requires a `seriesId` prop and is only opened from specific
buttons on the Posts page or Series view. There's no global "New Post" action in
the sidebar. Compared to tools like Notion or WordPress where creating content
is a single-click from anywhere, this is high friction.

**4.2** 🟡 **Local vs. cloud distinction is surfaced in CreatePostDrawer but
invisible thereafter.** The drawer has a `saveToCloud` toggle and
`PostCloudOptions` component, but once a document is created, the editor shows
no persistent indicator of storage location. The `isDirty` indicator on PostCard
(an `EditNote` icon) only shows local-ahead-of-cloud state, not "this is a
local-only document." Users could create local-only documents and have no idea
their work isn't backed up.

**4.3** 🟡 **Destructive delete in sidebar uses `window.confirm`.**
`useSidebarActions.ts` calls `window.confirm` for delete confirmation. The rest
of the app uses MUI's `AlertDialog` pattern. This is inconsistent and the native
dialog can't be styled or include undo options.

**4.4** 🟡 **No unsaved-changes warning when closing the browser tab.** There's
no `beforeunload` handler in the editor. A user can close the tab mid-edit and
lose their cloud-save (local save happens via debounce, but cloud save is
manual). Combined with the subtle save-state FAB, this is a data-loss risk.

**4.5** 🟡 **Double-click to edit on view page is undiscoverable.**
`ViewDocument.tsx` sets `cursor: pointer` on the entire document and requires
`onDoubleClick` to navigate to edit mode. There's a `title` tooltip but no
visible edit button on the page body itself (only in the side drawer).

### 5. EDITOR UX

**5.1** 🟠 **Save state feedback is minimal.** The only save indicator is the
FAB color change (blue=dirty, gray=clean). There's no "Saving...", "Saved", or
timestamp. Users performing Ctrl+S get no confirmation beyond the FAB color
returning to neutral. Modern editors (Google Docs, Notion) show explicit save
status in the toolbar.

**5.3** 🟡 **The toolbar is feature-rich but dense.** The ToolbarPlugin renders
undo/redo, block format, font, AI tools, text toggles, insert menu, and align
menu all in one row. On medium screens some tools are hidden but the
prioritization isn't documented. The toolbar lacks grouping separators or visual
hierarchy.

**5.4** 🟡 **Document info drawer uses a thin 4px arrow tab as the only
toggle.** `DocumentInfoDrawerArrow.tsx` renders a subtle fixed-position arrow at
the right edge. It's easy to miss and has no label. The drawer contains critical
actions (share, download, edit metadata, revision history) that are hidden
behind this nearly invisible affordance.

### 6. FEEDBACK & SYSTEM STATUS

**6.1** 🟠 **nprogress bar is hardcoded red.** In `globals.css`,
`#nprogress .bar { background: red }` and its `box-shadow` are both red. This
creates visual dissonance with the MUI blue primary color and looks like an
error indicator rather than a loading indicator.

**6.2** 🟡 **Alert system is functional but minimal.** `Alert.tsx` renders a
simple MUI Dialog, which is adequate. However, there's an `Announcer` component
(likely for snackbar/toast messages) that I haven't fully traced — the
separation between alerts (modal) and announcements (non-modal) should be
verified for consistency.

**6.3** 🟡 **No loading feedback for cloud save.** When the Save FAB is clicked
in the editor, `handleSaveAndNavigate` is called. This creates a revision,
updates the document, and navigates — all without a loading spinner on the FAB
or a success/failure notification. If the network is slow, the user sees no
feedback.

### 7. EMPTY STATES & ONBOARDING

**7.1** 🟠 **New user experience is confusing.** A brand-new unauthenticated
user hitting `/` sees a notes canvas (empty), a Kanban board (empty), a README
viewer (empty), and "No posts yet." There's no welcome message, no
call-to-action, and no visible sign-in button in the main content area. The path
to creating content is completely unclear.

**7.2** 🟡 **Empty states are present but inconsistent.** PostsList has a
well-designed empty state with emoji icons and helpful text ("Start writing your
first blog post"). DocumentBrowser has a simpler empty state via `EmptyState`
component. The Home page just says "No posts yet" with no guidance. The
Dashboard shows storage pie charts with proper empty/loading states — better
than Home.

**7.3** 🟡 **No tutorial or onboarding flow.** Despite the CLAUDE.md mentioning
a "Tutorial page," I found no reference to a tutorial route or component being
surfaced to new users. The Playground page is also not referenced in the sidebar
or onboarding.

### 8. ACCESSIBILITY

**8.1** 🟠 **Drag-to-resize sidebar is keyboard-inaccessible.** The 4px resize
handle in `SideBar.tsx` uses `onMouseDown` only — no keyboard handler, no ARIA
role, no `tabIndex`. Screen reader users and keyboard-only users cannot resize
the sidebar.

**8.2** 🟡 **Several icon-only buttons lack ARIA labels.** The `MoreVert` button
in `ActionMenu.tsx` has `aria-label="Document Actions"` (good). But the
ChevronLeft/Right buttons in SidebarHeader, the font size controls, and the drag
handle on the AppDrawer lack descriptive labels.

**8.3** 🟡 **Focus indicators rely on MUI defaults.** There's no custom focus
ring styling in the theme. MUI's default `outline` focus is subtle in some
contexts (especially on cards and icon buttons). The app has not verified WCAG
2.4.7 compliance.

**8.4** 🟡 **Navigation landmark structure is partial.** The sidebar has
`role="navigation" aria-label="Main navigation"` (good), but the main content
area uses a generic `Box component="main"` in PostsList/SeriesView but not in
AppLayout itself — the `<main>` role should be on the AppLayout level.

### 9. PERFORMANCE PERCEPTION

**9.1** 🟡 **Editor loads via dynamic import with a SplashScreen fallback.**
`EditDocument/index.tsx` uses
`dynamic(() => import("./Editor"), { ssr: false })`, showing a SplashScreen with
"Loading Document." This is correct but the splash screen has no progress
indicator — just a static logo and text. A skeleton matching the editor layout
would feel faster.

**9.2** 🟡 **PostsList has decent skeleton placeholders.** The
`PostsLoadingState` renders month-section-shaped skeletons — good pattern. But
`SkeletonCard` (referenced as `LoadingCard`) should be verified to match the
actual PostCard dimensions.

**9.3** 🟡 **Images in post content are not lazy-loaded by default.** The
`htmr`-rendered HTML content in the view page doesn't apply `loading="lazy"` to
images unless the source HTML includes it. This could cause above-the-fold
content jank and slow initial paint for image-heavy posts.

---

## Known Issues Audit

### Issue 1: TopAppBar is NOT mounted in AppLayout

**Confirmed.** `TopAppBar.tsx` exists (112 lines) with a full AppBar
implementation, but `grep` for `TopAppBar` across all source files returns zero
imports outside the file itself. ~~**Severity: 🔴 Critical.**~~ **Severity: 🟡
Minor (dead code cleanup only)** — mobile navigation is out of scope; the file
should simply be deleted.

### Issue 2: Two sidebar width systems coexist

**Confirmed and expanded.** CSS custom properties `--sidebar-width: 72px` and
`--sidebar-width-expanded: 240px` in `globals.css` lines 3–4 are **dead code** —
never consumed by any component. The authoritative system is the TS constants in
`constants.ts` (`COLLAPSED=72, DEFAULT=130`) and `SidebarWidthContext`. The
values don't match (CSS says expanded=240px, TS says default=130px).
Additionally, `SIDEBAR_CONTENT_MARGIN=105` is fixed and doesn't track the actual
sidebar width, creating either overlaps or gaps. **Severity: 🟠 Major.**

### Issue 3: Scrollbar is globally hidden

**Confirmed.** `scrollbar-width: none` and `::-webkit-scrollbar { width: 0 }`
are set on `*` and `::-webkit-scrollbar` respectively. This affects all
scrollable areas — the main content, sidebar post list, drawers, and the editor.
The UX cost is moderate: loss of scroll-position indicator and scroll-depth
awareness, especially in long documents. **Severity: 🟡 Minor** (aesthetic
choice with real accessibility cost).

### Issue 4: nprogress bar hardcoded red

**Confirmed.** `background: red` and `box-shadow: 0 0 10px red, 0 0 5px red` in
`globals.css` lines 60–67. MUI primary is `#1976d2` (blue). **Severity: 🟡
Minor.** Trivial fix, but every page transition sends a "something is wrong"
signal.

### Issue 5: No dedicated auth/sign-in page

**Confirmed.** Auth is triggered from: (a) the sidebar user avatar linking to
`/api/auth/signin`, (b) `signIn("google")` in UserCard's login button on the
Dashboard, (c) a `redirect("/api/auth/signin")` in the series edit page. There's
no custom `/auth/signin` page. The SplashScreen shown for private posts has no
sign-in link/button. **Severity: 🟠 Major.** Public visitors arriving via shared
links have no discoverable auth path.

### Issue 6: Local/cloud duality invisible during editing

**Confirmed.** The CreatePostDrawer shows a `saveToCloud` toggle. After
creation, the editor shows no indicator of whether a document is local-only,
cloud-synced, or local-ahead-of-cloud. The `isDirty` FAB only indicates unsaved
changes, not storage location. The `SyncToCloudFab` appears on the **view** page
(not edit page) when local is ahead. **Severity: 🟠 Major** for local-only
documents where users may not realize their work has no cloud backup.

### Issue 7: SeriesCard variant consistency

**Confirmed as reasonable.** `SeriesCardUnified` correctly dispatches to
`DetailedVariant` and `CompactVariant`. Usage in `PostsGrid.tsx` shows
`variant="detailed"` for series catalog and `variant="compact"` for inline
timeline. The `minimal` and `featured` variants currently fall through to
DetailedVariant (documented as "future implementation") — this is fine for now
but the fallback for `minimal` passes `showMetadata={false}` which creates a
visually inconsistent card if accidentally used. **Severity: 🟡 Minor.**

---

## Prioritised Recommendations

### Quick Wins (S effort, high impact)

#### [QW-5] Add `beforeunload` warning in editor (🟡 Minor)

**Problem**: Closing the browser tab with unsaved cloud changes causes silent
data loss. **Solution**: Add a `useEffect` in `Editor.tsx` that attaches a
`beforeunload` listener when `isDirty` is true, using the standard
`event.preventDefault()` pattern. **Files affected**:
`src/components/EditDocument/Editor.tsx` **Effort**: S

#### [QW-6] Fix view page responsive padding (🟠 Major)

**Problem**: `ViewDocument.tsx` hardcodes `paddingRight: "80px"` and
`paddingLeft: "5px"` via inline styles, creating cramped mobile layout and
asymmetric desktop padding. **Solution**: Replace inline styles with MUI `sx`
prop using responsive values: `px: { xs: 2, sm: 3, md: 6 }`. Remove the
`cursor: pointer` on the entire container (add a visible Edit button instead).
**Files affected**: `src/components/ViewDocument.tsx` **Effort**: S

### Core UX Improvements (M/L effort)

#### [CUX-1] Add explicit save-state feedback in editor (🟠 Major)

**Problem**: The save FAB color change is too subtle. Users get no confirmation
text for save success/failure. No "Saving..." state during network operations.
**Solution**: (1) Add a save-status chip/text in the toolbar ("Saved",
"Saving...", "Unsaved changes") using a small `Chip` or `Typography` element
next to the undo/redo buttons. (2) Show a brief snackbar on successful cloud
save. (3) Add a loading spinner to the Save FAB while the async save is in
progress. Track save state via a `saving` boolean in the component. **Files
affected**: `src/components/EditDocument/Editor.tsx`,
`src/components/EditDocument/SaveDiscardActions.tsx`,
`src/editor/plugins/ToolbarPlugin/index.tsx` **Effort**: M

#### [CUX-2] Surface storage location during editing (🟠 Major)

**Problem**: After creating a local-only document, the editor gives no
indication that work isn't cloud-backed. The `SyncToCloudFab` only appears on
the view page. **Solution**: (1) Show a persistent "Local only" or "Cloud
synced" chip in the editor toolbar or document title area. (2) Move the
`SyncToCloudFab` to appear in the editor as well, not just the view page. (3) On
the CreatePostDrawer, add a warning callout when `saveToCloud` is off: "This
document will only be saved in your browser." **Files affected**:
`src/components/EditDocument/Editor.tsx`, `src/components/SyncToCloudFab.tsx`,
`src/components/CreatePostDrawer/index.tsx` **Effort**: M

#### [CUX-3] Rethink the home page for public visitors (🟠 Major)

**Problem**: The home page is an author-workspace dashboard (notes, kanban,
readme) rather than a public blog landing page. New visitors see empty widgets
with no content or calls to action. **Solution**: Split the home page into two
views: (1) **Public/unauthenticated**: Show featured posts, recent posts grid,
series catalog, and a sign-in CTA. (2) **Authenticated author**: Show the
current dashboard with notes, kanban, etc. Use session state to switch. Move the
author dashboard to `/dashboard` (which already exists but is underutilized,
showing only storage charts). **Files affected**:
`src/components/Home/index.tsx`, `src/app/(appLayout)/page.tsx`,
`src/components/Dashboard.tsx` **Effort**: L

#### [CUX-4] Add a global "New Post" action (🟠 Major)

**Problem**: Creating a post requires navigating to the Posts page or a Series
view to find the creation button. There's no always-available creation entry
point. **Solution**: Add a "New Post" button at the bottom of the sidebar nav
section (below Notes, above the divider). When clicked, either open a simplified
CreatePostDrawer or navigate to `/edit` (new blank document). Register the `+`
FAB via FloatingActionButton on the Home and Posts pages. **Files affected**:
`src/components/Layout/SideBar.tsx`, `src/components/Layout/FloatingActions.tsx`
**Effort**: M

#### [CUX-5] Improve document info drawer discoverability (🟡 Minor)

**Problem**: The DocumentInfoDrawerArrow is a 4px-wide arrow at the right
viewport edge — almost invisible. It contains critical actions (share,
revisions, edit metadata). **Solution**: Replace or supplement the arrow with a
visible `IconButton` (e.g., `Info` or `ArticleOutlined`) rendered in the
breadcrumbs area or toolbar on edit/view pages. Keep the edge-swipe gesture as a
secondary interaction. **Files affected**:
`src/components/Layout/DocumentInfoDrawerArrow.tsx`,
`src/components/Layout/Breadcrumbs.tsx` **Effort**: M

#### [CUX-6] Restore scrollbar visibility with custom styling (🟡 Minor)

**Problem**: Hidden scrollbars remove scroll-position awareness across all
scrollable areas. **Solution**: Remove the global `scrollbar-width: none` rule.
Instead, apply thin, auto-hiding scrollbar styling using `scrollbar-width: thin`
(Firefox) and custom `::-webkit-scrollbar` with a 6px width, transparent track,
and subtle thumb color. Apply per-element where overflow occurs, or globally if
the aesthetic is important. **Files affected**: `src/app/globals.css`
**Effort**: S

#### [CUX-7] Use MUI AlertDialog instead of `window.confirm` for sidebar delete (🟡 Minor)

**Problem**: Sidebar post deletion uses native `window.confirm`, inconsistent
with the app's MUI AlertDialog pattern. **Solution**: Dispatch the existing
Redux `actions.alert()` pattern (used by `Alert.tsx`) instead of
`window.confirm` in `useSidebarActions.ts`. **Files affected**:
`src/components/Layout/SideBar/hooks/useSidebarActions.ts` **Effort**: S

### Design System Cleanup

#### [DS-1] Create a meaningful MUI theme (🟠 Major)

**Problem**: The theme has no custom palette, typography, or component
overrides. The app looks like stock MUI. **Solution**: Define a brand palette
(primary, secondary, accent), custom typography scale (heading sizes, body text,
captions), and component defaults (Card radius, Button size, Chip style) in
`ThemeProvider.tsx`. Remove hardcoded color values from `Dashboard.tsx`,
`CardBase.tsx`, and `theme.ts`, replacing them with `theme.palette` references.
**Files affected**: `src/components/Layout/ThemeProvider.tsx`,
`src/components/DocumentCardNew/theme.ts`,
`src/components/DocumentCardNew/CardBase.tsx`, `src/components/Dashboard.tsx`
**Effort**: L

#### [DS-2] Unify card theme tokens with MUI theme (🟡 Minor)

**Problem**: `cardTheme` in `theme.ts` is a standalone object with 100+ lines of
typography, spacing, and color tokens that don't reference the MUI theme.
**Solution**: Convert `cardTheme` to a function that receives the MUI `Theme`
object and derives values from it: `cardTheme.typography.titleSize` →
`theme.typography.h6.fontSize`, `cardTheme.colors.border` →
`theme.palette.divider`, etc. This ensures theme changes propagate
automatically. **Files affected**: `src/components/DocumentCardNew/theme.ts`,
consumers of `cardTheme` **Effort**: M

#### [DS-3] Fix content area `SIDEBAR_CONTENT_MARGIN` to track sidebar width (🟠 Major)

**Problem**: The content area left margin is a **fixed 105px** constant that
doesn't respond to the sidebar's actual width (72px collapsed, 130–450px
expanded). This creates overlapping or gap issues. **Solution**: Make the
content area `marginLeft` dynamic, derived from `getEffectiveWidth(open)` in
`AppLayoutContent`. Replace the fixed `SIDEBAR_CONTENT_MARGIN` import with the
actual computed width. **Files affected**:
`src/components/Layout/AppLayout.tsx`,
`src/components/Layout/SideBar/constants.ts` **Effort**: M

#### [DS-4] Delete TopAppBar.tsx (🟡 Minor)

**Problem**: `TopAppBar.tsx` is 112 lines of dead code. It references old
branding ("Math Editor") and old navigation patterns, and confuses developers.
**Solution**: Delete the file entirely. Mobile navigation is out of scope so
there is no repurposing use case. **Files affected**:
`src/components/Layout/TopAppBar.tsx` **Effort**: S

#### [DS-5] Add ARIA labels to all icon-only buttons (🟡 Minor)

**Problem**: Several icon-only buttons (sidebar toggle, font size controls, drag
handles, drawer close) lack `aria-label` attributes. **Solution**: Audit all
`<IconButton>` usages that don't have an `aria-label`. Add descriptive labels:
"Collapse sidebar", "Expand sidebar", "Increase font size", "Decrease font
size", "Reset font size", "Close drawer", etc. **Files affected**:
`src/components/Layout/SideBar/SidebarHeader.tsx`,
`src/components/AppDrawer.tsx`,
`src/components/Layout/DocumentInfoDrawerArrow.tsx` **Effort**: S
