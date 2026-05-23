import type { UserDocument } from "@/types";

function compareObjectsByKey(key: string, ascending = true) {
  return function innerSort(objectA: Record<string, unknown>, objectB: Record<string, unknown>) {
    const valueA = key.split(".").reduce((o: Record<string, unknown> | undefined, i) => o?.[i] as Record<string, unknown> | undefined, objectA as Record<string, unknown>);
    const valueB = key.split(".").reduce((o: Record<string, unknown> | undefined, i) => o?.[i] as Record<string, unknown> | undefined, objectB as Record<string, unknown>);
    const a = valueA as string | number | null | undefined;
    const b = valueB as string | number | null | undefined;
    const sortValue = a == null ? -1 : b == null ? 1 : a > b ? 1 : a < b ? -1 : 0;
    return ascending ? sortValue : -1 * sortValue;
  };
}

export const sortDocuments = (
  documents: UserDocument[],
  sortkey: string,
  sortDirection: string,
) => {
  // Convert to document data representation for sorting
  const data = documents.map((d) => {
    const docData = (d.local ?? d.cloud)!;

    // Check if the document has a sort_order value that is not null or undefined
    const sortOrder = d.local?.sort_order ?? d.cloud?.sort_order ?? null;
    const hasSortOrder = sortOrder !== null && sortOrder !== undefined &&
      sortOrder > 0;

    return {
      ...docData,
      id: d.id,
      _hasSortOrder: hasSortOrder,
      _sortOrder: sortOrder,
    };
  });

  // First, separate documents with and without sort_order
  const withSortOrder = data.filter((doc) => doc._hasSortOrder);
  const withoutSortOrder = data.filter((doc) => !doc._hasSortOrder);

  // Sort documents with sort_order by their sort_order value (always ascending)
  const sortedWithSortOrder = [...withSortOrder].sort((a, b) => {
    return (a._sortOrder ?? 0) - (b._sortOrder ?? 0);
  });

  // Sort the remaining documents by the specified key and direction
  const sortedWithoutSortOrder = [...withoutSortOrder].sort(
    compareObjectsByKey(sortkey, sortDirection === "asc"),
  );

  // Combine the two sorted arrays: first those with sort_order, then the rest
  const sortedData = [...sortedWithSortOrder, ...sortedWithoutSortOrder];

  // Map back to the original UserDocument objects
  const sortedDocuments = sortedData.map((docData) =>
    documents.find((d) => d.id === docData.id)!
  );

  return sortedDocuments;
};
