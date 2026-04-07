# Notes Backend Storage Migration

## Problem Statement

### Current Implementation

Notes are currently stored in **IndexedDB** (browser-local storage) with the
following characteristics:

- Database name: `matheditor`
- Store name: `notesCanvas`
- Storage location: Browser-specific, origin-specific (protocol + hostname +
  port)

### Issues Encountered

1. **Port-Based Data Loss**
   - Development server (`npm run dev`): `http://localhost:3000`
   - Production server (`npm run build + start`): `http://localhost:3001` (or
     different port)
   - Each port represents a different origin → separate IndexedDB instances
   - Notes created in one environment are invisible in the other
   - **Result**: Data appears "lost" when switching environments

2. **Data Persistence Risks**
   - Browser cache clearing deletes all IndexedDB data
   - Browser storage limits can cause eviction
   - No backup or recovery mechanism
   - Not synchronized across devices or browsers
   - Not tied to user account

3. **User Experience Impact**
   - Users already experienced data loss once
   - Lack of confidence in the notes feature
   - No way to access notes from multiple devices
   - No migration path between environments

### Affected Code

- `src/indexeddb/index.ts` - IndexedDB configuration
- `src/hooks/useNotesStore.ts` - Notes storage hook using IndexedDB
- `src/components/NotesCanvas/` - Notes UI components
- `src/types/notes.ts` - Note and NotesCanvas types

## Proposed Solution: Full Backend Storage (PostgreSQL)

### Overview

Migrate notes from IndexedDB to PostgreSQL database storage, treating notes as
first-class user data similar to documents and series.

### Architecture

#### 1. Database Schema

Add two new Prisma models:

**NotesCanvas Model**

```prisma
model NotesCanvas {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @default("My Notes")
  authorId  String   @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt @db.Timestamptz

  // Relations
  author User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
  notes  Note[]

  @@index([authorId])
}
```

**Note Model**

```prisma
model Note {
  id           String   @id @default(uuid()) @db.Uuid
  canvasId     String   @db.Uuid
  positionX    Float    // x position on canvas
  positionY    Float    // y position on canvas
  width        Float    // note width
  height       Float    // note height
  title        String?  // optional note title
  content      String   // note content (Lexical state as JSON string)
  color        String   @default("#FFD700") // note color
  zIndex       Int      @default(0) // stacking order
  createdAt    DateTime @default(now()) @db.Timestamptz
  updatedAt    DateTime @updatedAt @db.Timestamptz

  // Relations
  canvas NotesCanvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)

  @@index([canvasId])
  @@index([canvasId, zIndex]) // for efficient z-index queries
}
```

**User Model Update**

```prisma
model User {
  // ... existing fields
  notesCanvases NotesCanvas[] // User's note canvases
}
```

#### 2. Repository Layer

Create `src/repositories/notes.ts`:

```typescript
// Canvas operations
- createCanvas(authorId: string, name?: string): Promise<NotesCanvas>
- findCanvasByAuthorId(authorId: string): Promise<NotesCanvas[]>
- findCanvasById(id: string): Promise<NotesCanvas | null>
- updateCanvas(id: string, data: Partial<NotesCanvas>): Promise<NotesCanvas>
- deleteCanvas(id: string): Promise<void>

// Note operations
- createNote(canvasId: string, noteData: NoteInput): Promise<Note>
- findNotesByCanvasId(canvasId: string): Promise<Note[]>
- findNoteById(id: string): Promise<Note | null>
- updateNote(id: string, updates: Partial<Note>): Promise<Note>
- deleteNote(id: string): Promise<void>
- updateNotesZIndex(canvasId: string, noteId: string, newZIndex: int): Promise<void>
```

#### 3. API Routes

**Canvas Routes**

- `GET /api/notes/canvas` - Get user's default canvas (create if not exists)
- `POST /api/notes/canvas` - Create new canvas
- `PATCH /api/notes/canvas/[id]` - Update canvas
- `DELETE /api/notes/canvas/[id]` - Delete canvas

**Note Routes**

- `GET /api/notes` - Get all notes for user's canvas
- `POST /api/notes` - Create new note
- `PATCH /api/notes/[id]` - Update note (position, content, etc.)
- `DELETE /api/notes/[id]` - Delete note
- `POST /api/notes/[id]/bring-to-front` - Update z-index

#### 4. Frontend Update

Update `src/hooks/useNotesStore.ts`:

- Replace IndexedDB calls with API fetch calls
- Add optimistic updates for better UX
- Add debouncing for frequent updates (drag, resize)
- Keep local state for immediate UI updates
- Handle loading/error states
- Add retry logic for failed requests

#### 5. Migration Strategy

**Phase 1: Add Migration UI Banner**

- Detect if user has IndexedDB notes
- Show banner: "Import your local notes to the cloud?"
- Provide one-click migration button

**Phase 2: Migration Utility** Create `src/utils/migrateNotes.ts`:

```typescript
async function migrateNotesFromIndexedDB() {
  1. Read all notes from IndexedDB
  2. Check if user is authenticated
  3. Call API to create canvas (if needed)
  4. Batch create notes via API
  5. Verify migration success
  6. Mark IndexedDB notes as migrated (keep backup)
  7. Show success message
}
```

**Phase 3: Cleanup**

- After 7-30 days, remove IndexedDB notes
- Remove migration banner for migrated users
- Keep IndexedDB fallback for offline support (optional)

### Benefits

1. **Data Persistence**
   - ✅ Notes survive browser cache clearing
   - ✅ Backed up with database backups
   - ✅ No port/origin issues
   - ✅ Proper data ownership (tied to user account)

2. **Multi-Device Sync**
   - ✅ Access notes from any device
   - ✅ Automatic synchronization
   - ✅ Consistent experience across platforms

3. **Reliability**
   - ✅ No 5-10MB localStorage limits
   - ✅ Proper error handling and recovery
   - ✅ Database transaction safety
   - ✅ Consistent with other app data

4. **User Experience**
   - ✅ Confidence in data safety
   - ✅ Professional-grade storage
   - ✅ Migration path from old data
   - ✅ Better alignment with app architecture

### Implementation Considerations

1. **Performance Optimization**
   - Debounce position/size updates during drag/resize
   - Batch updates where possible
   - Use optimistic UI updates
   - Consider WebSocket for real-time sync (future)

2. **Authentication Requirement**
   - Notes will only work for logged-in users
   - Show appropriate message for unauthenticated users
   - Consider read-only demo mode for logged-out users

3. **Backward Compatibility**
   - Provide clear migration path
   - Don't break existing users
   - Keep migration option available for extended period

4. **Error Handling**
   - Handle network failures gracefully
   - Queue updates for retry on failure
   - Show clear error messages to users
   - Prevent data loss on conflicts

### Implementation Checklist

- [ ] Update Prisma schema with NotesCanvas and Note models
- [ ] Generate and run database migration
- [ ] Create notes repository with CRUD operations
- [ ] Create API routes for canvas operations
- [ ] Create API routes for note operations
- [ ] Update useNotesStore to use API instead of IndexedDB
- [ ] Add optimistic updates and debouncing
- [ ] Create migration utility for IndexedDB → Backend
- [ ] Add migration banner to UI
- [ ] Test migration flow
- [ ] Update types if needed
- [ ] Add error handling and loading states
- [ ] Test with multiple users/devices
- [ ] Update documentation

### Rollout Strategy

1. **Week 1**: Backend implementation (schema, repository, API)
2. **Week 2**: Frontend integration and testing
3. **Week 3**: Migration utility and UI
4. **Week 4**: User testing and feedback
5. **Week 5+**: Gradual rollout with monitoring

### Risk Mitigation

- **Data Loss During Migration**: Keep IndexedDB backup for 30 days
- **Performance Issues**: Implement debouncing and optimistic updates
- **Network Failures**: Queue updates and retry with exponential backoff
- **User Resistance**: Make migration optional but strongly recommended
- **Bugs in New System**: A/B test with small user group first

## Conclusion

Moving notes to backend storage aligns with the application's architecture,
provides a better user experience, and eliminates the data loss issues
encountered with IndexedDB. The migration path ensures existing users don't lose
data while transitioning to the new system.
