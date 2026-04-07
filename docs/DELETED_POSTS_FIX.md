# Fix: Deleted Posts Appearing in Series Card Preview

## Problem

Deleted posts were appearing in series card preview on the `/posts` page, even
after:

- Successful database deletion
- Page refresh
- Clearing browser cache was the only way to make them disappear

## Root Cause Analysis

The issue involved multiple data synchronization problems:

### 1. **Redux State Update**

When deleting a post, the Redux reducers (`deleteCloudDocument`,
`deleteLocalDocument`) were only removing the post from `state.documents`, but
NOT from `state.series[X].posts` arrays.

### 2. **Data Source Mismatch**

The UI was building the posts list by:

- Using `state.documents` as the source
- Grouping documents by `seriesId` to reconstruct series
- This ignored the `series.posts` arrays which contained stale data

### 3. **Load Order Issue**

The app's initialization sequence was:

```typescript
load() {
  loadCloudDocuments();  // Re-adds deleted posts to state.documents
  loadSeries();          // Returns correct data from server
}
```

But the UI used `state.documents` instead of `series.posts`, so the fresh series
data was ignored.

### 4. **Component Memoization**

`SeriesCard` used `React.memo()` which prevented re-rendering when series data
changed, because the series object identity didn't change even though
`series.posts` did.

## Solution

### 1. **Update Redux Reducers** (src/store/app.ts)

Modified `deleteCloudDocument.fulfilled` and `deleteLocalDocument.fulfilled` to
remove posts from series arrays:

```typescript
.addCase(deleteCloudDocument.fulfilled, (state, action) => {
  const id = action.meta.arg;

  // Remove from documents array
  state.documents = state.documents.filter(doc => doc.id !== id);

  // NEW: Remove from all series.posts arrays
  state.series.forEach(series => {
    series.posts = series.posts.filter(post => post.id !== id);
  });
})
```

### 2. **Make series.posts the Single Source of Truth** (src/components/PostsList/utils/seriesGrouping.ts)

Changed `groupPostsBySeries()` to use `series.posts` directly instead of
re-grouping `state.documents` by seriesId:

```typescript
export const groupPostsBySeries = (
  posts: UserDocument[],
  seriesMap: Map<string, Series>,
): SeriesGroupItem[] => {
  const seriesPostIds = new Set<string>();
  const result: SeriesGroupItem[] = [];

  // Use series.posts as authoritative source
  seriesMap.forEach((series) => {
    if (series.posts && series.posts.length > 0) {
      series.posts.forEach(post => seriesPostIds.add(post.id));

      const seriesPosts: UserDocument[] = series.posts.map(post => ({
        id: post.id,
        cloud: post as any,
      }));

      result.push({ type: "series", series, posts: seriesPosts, ... });
    }
  });

  // Only use posts array for standalone posts (not in any series)
  posts.forEach((post) => {
    if (!seriesPostIds.has(post.id)) {
      result.push({ type: "standalone", posts: [post], ... });
    }
  });

  return result;
};
```

### 3. **Fix Load Order** (src/store/app.ts)

Ensure `loadSeries()` runs AFTER `loadCloudDocuments()` so series data is the
freshest:

```typescript
export const load = createAsyncThunk("app/load", async (_, thunkAPI) => {
  await Promise.allSettled([
    thunkAPI.dispatch(loadSession()),
    thunkAPI.dispatch(loadLocalDocuments()),
    thunkAPI.dispatch(loadPosts()),
  ]);

  // Load cloud documents, then series to ensure series.posts is authoritative
  await thunkAPI.dispatch(loadCloudDocuments());
  await thunkAPI.dispatch(loadSeries());
});
```

### 4. **Reload Series on Page Mount** (src/components/PostsList/index.tsx)

Added `useEffect` to reload series data when `/posts` page mounts:

```typescript
useEffect(() => {
  dispatch(actions.loadSeries());
}, [dispatch]);
```

### 5. **Force SeriesCard Re-render** (src/components/PostsList/components/PostsGrid.tsx)

Updated the Grid key to include post count and IDs, forcing React to re-create
the component when posts change:

```typescript
<Grid
  key={`series-${group.series.id}-${group.posts.length}-${group.posts.map(p => p.id).join(',')}`}
  ...
>
```

### 6. **Update usePostsFiltering** (src/components/PostsList/hooks/usePostsFiltering.ts)

Modified to build the posts list from `series.posts` + standalone documents:

```typescript
export const usePostsFiltering = () => {
  const documents = useSelector((state) => state.documents);
  const series = useSelector((state) => state.series);

  const filteredPosts = useMemo(() => {
    const seriesPostIds = new Set<string>();
    const seriesPosts: UserDocument[] = [];

    // Collect posts from series
    series.forEach((s) => {
      s.posts?.forEach((post) => {
        seriesPostIds.add(post.id);
        seriesPosts.push({ id: post.id, cloud: post as any });
      });
    });

    // Get standalone posts (not in any series)
    const standalonePosts = documents.filter((doc) => {
      const docData = doc.cloud || doc.local;
      return docData?.type === "DOCUMENT" && !seriesPostIds.has(doc.id);
    });

    return [...seriesPosts, ...standalonePosts];
  }, [documents, series]);

  return { allPosts: filteredPosts, totalCount: filteredPosts.length };
};
```

## Key Principles

1. **Single Source of Truth**: `series.posts` is now the authoritative source
   for posts that belong to series
2. **Consistency**: All UI components use series data from Redux, not
   reconstructed groupings
3. **Proper Ordering**: Series loads after documents to ensure fresh data
4. **Reactive Updates**: Components re-render when series data changes

## Testing

To verify the fix:

1. Delete a post from a series
2. The post should disappear immediately from the series card preview
3. Refresh the browser (`F5`)
4. The deleted post should remain gone (no cache clearing needed)

## Files Modified

- `src/store/app.ts` - Redux reducers and load order
- `src/components/PostsList/utils/seriesGrouping.ts` - Grouping logic
- `src/components/PostsList/hooks/usePostsFiltering.ts` - Data source
- `src/components/PostsList/index.tsx` - Series reload on mount
- `src/components/PostsList/components/PostsGrid.tsx` - Component key
- `src/components/DocumentActions/DeleteBoth.tsx` - Post-delete refresh
