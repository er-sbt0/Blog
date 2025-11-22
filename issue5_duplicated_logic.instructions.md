# Issue 5: Duplicated Author Extraction Logic

**Severity:** Low | **Priority:** P3  
**Impact:** Maintainability, code duplication

## Root Cause Analysis
- Same logic needed in 3+ places
- No shared utility for common operations
- Copy-paste development pattern

## Mitigation Plan

### Phase 1: Create Shared Utility (1 hour)

1. **Create utility file**
   - Location: `src/utils/collaborators.ts`
   ```typescript
   import { User, CloudDocumentRevision } from '@/types';
   
   /**
    * Extract unique collaborators from document revisions
    * Excludes the primary author and removes duplicates
    */
   export function extractCollaborators(
     revisions: CloudDocumentRevision[],
     authorId: string,
     excludeUserIds: string[] = []
   ): User[] {
     const collaborators: User[] = [];
     const seenIds = new Set<string>([authorId, ...excludeUserIds]);
     
     for (const revision of revisions) {
       const author = revision.author;
       if (author && !seenIds.has(author.id)) {
         collaborators.push(author);
         seenIds.add(author.id);
       }
     }
     
     return collaborators;
   }
   ```

### Phase 2: Replace Duplicated Code (1-2 hours)

1. **Update files**:
   - `src/components/ViewDocumentInfo.tsx`
   - `src/components/User/UsersAutocomplete.tsx`
   - `src/components/EditDocument/EditDocumentInfo.tsx`

2. **Pattern**:
   ```typescript
   // Before
   const collaborators = cloudDocument.revisions.reduce((acc, rev) => {
     if ((rev as any).author?.id !== cloudDocument.author.id &&
         !acc.find((u) => u.id === (rev as any).author?.id)
     ) acc.push((rev as any).author);
     return acc;
   }, [] as User[])
   
   // After
   import { extractCollaborators } from '@/utils/collaborators';
   
   const collaborators = extractCollaborators(
     cloudDocument.revisions,
     cloudDocument.author.id
   );
   ```

3. **Handle coauthors list** (in UsersAutocomplete):
   ```typescript
   const collaborators = extractCollaborators(
     cloudDocument.revisions,
     author.id,
     coauthors.map(u => u.id) // exclude existing coauthors
   );
   ```

### Phase 3: Add Unit Tests (1 hour)

1. **Test cases**:
   - Empty revisions array
   - Single collaborator
   - Multiple collaborators with duplicates
   - Author in revisions (should be excluded)
   - Excluded users list

## Success Metrics
- Zero code duplication for collaborator extraction
- Unit test coverage for utility function
- Easier to maintain and modify logic

## Estimated Time
**Total:** 2-3 hours

## Dependencies
- Should be done after Issue 1 (type definitions) for proper typing

## Risk Level
Very Low - Simple refactoring with no logic changes
