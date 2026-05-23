import { createSelector } from "@reduxjs/toolkit";
import { documentsSelectors, type RootState } from "@/store";
import { isReadmeDocument } from "@/constants";
import type { UserDocument } from "@/types";

/* ------------------------------------------------------------------ */
/*  SideBar                                                            */
/* ------------------------------------------------------------------ */

const selectAllDocuments = (state: RootState) =>
  documentsSelectors.selectAll(state);

const selectUser = (state: RootState) => state.user;

/**
 * Memoized selector: documents owned by the current user, excluding README
 * docs.  Re-computes only when the full document list or user reference
 * changes — prevents the sidebar from re-rendering on every unrelated
 * document mutation that doesn't affect the filtered result set.
 */
export const selectUserFilteredDocuments = createSelector(
  [selectAllDocuments, selectUser],
  (documents, user): UserDocument[] => {
    if (!user || !documents) return [];
    return documents.filter((doc) => {
      const cloudDocument = doc.cloud;
      const localDocument = doc.local;
      if (cloudDocument) {
        return (
          cloudDocument.author.id === user.id &&
          !isReadmeDocument(cloudDocument.name) &&
          !cloudDocument.parentId
        );
      }
      if (localDocument) {
        return !isReadmeDocument(localDocument.name) && !localDocument.parentId;
      }
      return false;
    });
  },
);
