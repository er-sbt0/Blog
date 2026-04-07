# New Post Creation - Side Drawer Implementation

## Problem Statement

### Current Approach

The application currently uses a dedicated route for creating new documents:

```
http://localhost:3000/new?seriesId=e5c7df04-5639-4b1a-afb2-e1e9f6bd5fbd
```

### Issues with Current Approach

1. **Page Navigation Required**: Users are taken away from their current context
   (series list)
2. **Lost Context**: Navigating to a new page disrupts the user's flow
3. **Poor UX**: Extra navigation steps create friction in the content creation
   process
4. **State Management**: Query parameters in URL are less elegant and harder to
   manage
5. **Back/Forward Complexity**: Browser navigation becomes confusing

## Solution: Side Drawer Pattern

### Overview

Implement a side drawer/panel that slides in from the right when creating a new
post, allowing users to stay on the current page while maintaining full context.

### Key Benefits

1. **Context Preservation**
   - Users can still see the series list
   - Clear visual indication of which series they're creating a post for
   - No loss of scroll position or page state

2. **Modern UX Pattern**
   - Used by leading apps (Notion, Linear, Gmail, Slack)
   - Familiar interaction pattern for users
   - Non-blocking and easily dismissible

3. **Better Mobile Experience**
   - Drawer becomes full-screen on mobile devices automatically
   - Native swipe-to-dismiss gestures
   - Better than modals for forms

4. **No Route Changes**
   - URL stays the same
   - No browser history pollution
   - Simpler state management

5. **Flexible Implementation**
   - Can show different content based on context
   - Easy to add loading states
   - Can integrate with existing form components

### Technical Implementation

#### Component Structure

```
SeriesGridSection
  ├── SeriesCard (existing)
  │   └── Action Button (new)
  └── CreatePostDrawer (new)
      └── PostCreationForm (new/existing)
```

#### Technology Stack

- **MUI Drawer Component**: Built-in Material-UI component with responsive
  behavior
- **anchor="right"**: Slides in from right side
- **State Management**: Local React state or Zustand for drawer open/close
- **Form**: Reuse existing post creation form or create new

#### User Flow

1. User clicks "New Post" action on a series card
2. Drawer slides in from right (300-400ms animation)
3. Form is pre-populated with series context
4. User fills in post details
5. On submit: Create post → Show success feedback → Close drawer
6. On cancel/close: Drawer slides out, user returns to unchanged list

#### Implementation Steps

1. **Create Drawer Component** (`CreatePostDrawer.tsx`)
   - Accept `open`, `onClose`, `seriesId` props
   - Use MUI Drawer with anchor="right"
   - Include loading and error states

2. **Add State Management**
   - Add drawer open/close state to SeriesGridSection or parent
   - Track which series is selected for creation

3. **Update SeriesCard Actions**
   - Add "New Post" action button
   - onClick handler to open drawer with series context

4. **Create/Adapt Form Component**
   - Reuse existing post creation form logic
   - Adapt for drawer layout (vertical, scrollable)
   - Pre-populate series field

5. **Handle Form Submission**
   - POST to API endpoint
   - Show loading state in drawer
   - On success: Close drawer, refresh series list
   - On error: Show error message in drawer

#### Drawer Specifications

**Desktop:**

- Width: 600-800px (large enough for comfortable form)
- Overlay: Semi-transparent backdrop (clicking closes drawer)
- Animation: Slide-in from right, 300ms ease-in-out

**Mobile:**

- Width: 100vw (full screen)
- Height: 100vh minus top bar
- Swipe-to-dismiss from right edge
- Bottom padding for safe area (iOS)

**Form Layout:**

- Header with title and close button
- Scrollable content area
- Sticky footer with action buttons (Cancel, Create)

### Alternative Considered

**Modal/Dialog**: Rejected because it obscures the entire page, losing context.
Side drawer is superior for maintaining context while providing adequate space
for the form.

### Success Metrics

- Reduced time-to-create for new posts
- Fewer navigation events per post creation
- Improved user satisfaction scores
- Lower bounce rate during creation flow

### Future Enhancements

- Keyboard shortcut to open drawer (Cmd/Ctrl+N)
- Draft auto-save while drawer is open
- Recent series quick-select
- Template selection within drawer
