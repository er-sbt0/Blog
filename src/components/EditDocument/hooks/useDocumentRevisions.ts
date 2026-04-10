import { useCallback } from "react";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { DocumentRevision, EditorDocumentRevision } from "@/types";
import { actions, useDispatch, useSelector } from "@/store";
import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";

export function useDocumentRevisions(
  documentId: string,
  editorRef: RefObject<LexicalEditor | null>,
) {
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();
  const user = useSelector((state) => state.user);
  const userDocument = useSelector((state) =>
    state.documents.find((d) => d.id === documentId)
  );
  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;

  const localRevisions = localDocument?.revisions ?? [];
  const cloudRevisions = cloudDocument?.revisions ?? [];

  const isHeadLocalRevision = localRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const isHeadCloudRevision = cloudRevisions.some((r) =>
    r.id === localDocument?.head
  );
  const unsavedChanges = !isHeadLocalRevision && !isHeadCloudRevision;

  const revisions: (DocumentRevision | EditorDocumentRevision)[] = [
    ...cloudRevisions,
  ];
  localRevisions.forEach((r) => {
    if (!cloudRevisions.some((cr) => cr.id === r.id)) revisions.push(r);
  });
  const documentRevisions = [...revisions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (unsavedChanges && localDocument) {
    const unsavedRevision: DocumentRevision = {
      id: localDocument.head,
      documentId: localDocument.id,
      createdAt: localDocument.updatedAt,
      author: user ||
        { id: "", name: "Local User", email: "", handle: null, image: null },
    } as DocumentRevision;
    documentRevisions.unshift(unsavedRevision);
  }

  const isDiffViewOpen = useSelector((state) => state.ui.diff.open);
  const isAuthor = cloudDocument ? cloudDocument.author.id === user?.id : true;

  const getLocalEditorData = useCallback(
    () => editorRef.current?.getEditorState().toJSON(),
    [editorRef],
  );

  const createLocalRevision = useCallback(async () => {
    if (!localDocument) return;
    const data = getLocalEditorData();
    if (!data) return;
    const payload = {
      id: localDocument.head,
      documentId: localDocument.id,
      createdAt: localDocument.updatedAt,
      data,
    };
    const response = await dispatch(actions.createLocalRevision(payload));
    if (response.type === actions.createLocalRevision.rejected.type) {
      return undefined;
    }
    return response.payload as ReturnType<
      typeof actions.createLocalRevision.fulfilled
    >["payload"];
  }, [localDocument, getLocalEditorData, dispatch]);

  const viewLocalDocument = useCallback(async () => {
    if (isDiffViewOpen) return dispatch(actions.setDiff({ open: false }));
    if (unsavedChanges) await createLocalRevision();
    dispatch(actions.setDiff({
      open: true,
      old: localDocument?.head,
      new: localDocument?.head,
    }));
  }, [
    isDiffViewOpen,
    unsavedChanges,
    createLocalRevision,
    localDocument,
    dispatch,
  ]);

  const toggleDiffView = useCallback(async () => {
    if (unsavedChanges) await createLocalRevision();
    const newId = documentRevisions[0]?.id;
    const oldId = documentRevisions[1]?.id ?? newId;
    dispatch(
      actions.setDiff({ open: !isDiffViewOpen, old: oldId, new: newId }),
    );
  }, [
    unsavedChanges,
    createLocalRevision,
    documentRevisions,
    isDiffViewOpen,
    dispatch,
  ]);

  const handleViewWithCloudSave = useCallback(async () => {
    if (isDiffViewOpen) return dispatch(actions.setDiff({ open: false }));
    if (unsavedChanges) {
      const data = getLocalEditorData();
      if (data) {
        await createLocalRevision();
        if (isAuthor && localDocument) {
          try {
            const revision = {
              id: localDocument.head,
              documentId: localDocument.id,
              createdAt: localDocument.updatedAt,
              data,
            };
            const revisionResponse = await dispatch(
              actions.createCloudRevision(revision),
            );
            if (
              revisionResponse.type ===
                actions.createCloudRevision.fulfilled.type
            ) {
              await dispatch(actions.updateCloudDocument({
                id: localDocument.id,
                partial: {
                  head: localDocument.head,
                  updatedAt: localDocument.updatedAt,
                  parentId: localDocument.parentId,
                },
              }));
            }
          } catch (error) {
            errorAnnounce("Failed to save to cloud before viewing", error);
          }
        }
      }
    }
    viewLocalDocument();
  }, [
    isDiffViewOpen,
    unsavedChanges,
    getLocalEditorData,
    createLocalRevision,
    isAuthor,
    localDocument,
    dispatch,
    viewLocalDocument,
  ]);

  const handleCompareWithCloudSave = useCallback(async () => {
    if (isDiffViewOpen && unsavedChanges && localDocument) {
      const editorData = getLocalEditorData();
      if (editorData) {
        const revision = {
          id: localDocument.head,
          documentId: localDocument.id,
          createdAt: localDocument.updatedAt,
          data: editorData,
        };
        try {
          const revisionResponse = await dispatch(
            actions.createCloudRevision(revision),
          );
          if (
            revisionResponse.type === actions.createCloudRevision.fulfilled.type
          ) {
            await dispatch(actions.updateCloudDocument({
              id: localDocument.id,
              partial: {
                head: localDocument.head,
                updatedAt: localDocument.updatedAt,
                parentId: localDocument.parentId,
              },
            }));
          }
        } catch (error) {
          errorAnnounce("Failed to save to cloud", error);
        }
      }
    }
    toggleDiffView();
  }, [
    isDiffViewOpen,
    unsavedChanges,
    localDocument,
    getLocalEditorData,
    dispatch,
    toggleDiffView,
  ]);

  return {
    userDocument,
    localDocument,
    cloudDocument,
    user,
    documentRevisions,
    unsavedChanges,
    isDiffViewOpen,
    isAuthor,
    handleViewWithCloudSave,
    handleCompareWithCloudSave,
  };
}
