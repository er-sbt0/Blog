"use client";
import { useMemo, useRef } from "react";
import SplashScreen from "../shared/SplashScreen";
import { EditorDocument } from "@/types";
import { useSelector as useReduxSelector } from "react-redux";
import { useSelector } from "@/store";
import type { RootState } from "@/store";
import { documentsSelectors } from "@/store";
import { usePathname } from "next/navigation";
import type { LexicalEditor, SerializedEditorState } from "lexical";
import dynamic from "next/dynamic";
import DiffView from "../Diff";
import ConnectedEditor from "../ConnectedEditor";
import SaveDiscardActions from "./SaveDiscardActions";
import { useCloudSave } from "./hooks/useCloudSave";
import { useDocumentLoader } from "./hooks/useDocumentLoader";
import { useAutoSave } from "./hooks/useAutoSave";
import { useDocumentNavigation } from "./hooks/useDocumentNavigation";

const EditDocumentInfo = dynamic(
  () => import("@/components/EditDocument/EditDocumentInfo"),
  { ssr: false },
);

function ensureValidDocumentData(doc: EditorDocument): EditorDocument {
  const defaultParagraph = {
    children: [],
    direction: null,
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  };
  const defaultRoot: SerializedEditorState = {
    root: {
      children: [defaultParagraph],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };

  if (!doc.data || typeof doc.data !== "object") {
    return { ...doc, data: defaultRoot };
  }

  if (
    !doc.data.root || !doc.data.root.children ||
    !Array.isArray(doc.data.root.children)
  ) {
    return { ...doc, data: defaultRoot };
  }

  if (doc.data.root.children.length === 0) {
    return {
      ...doc,
      data: {
        ...doc.data,
        root: {
          ...doc.data.root,
          children: [defaultParagraph],
        },
      } as SerializedEditorState,
    };
  }

  return doc;
}

const DocumentEditor: React.FC<React.PropsWithChildren> = (
  { children: _children },
) => {
  const pathname = usePathname();
  const id = pathname.split("/")[2]?.toLowerCase();
  const editorRef = useRef<LexicalEditor>(null);
  const showDiff = useSelector((state) => state.ui.diff.open);
  const isDirty = useSelector((state) => state.ui.isDirty);

  // Single source of truth: document lives in Redux. Custom equality prevents
  // re-renders from data changes on every edit (only re-render on identity change).
  const document = useReduxSelector(
    (state: RootState) =>
      documentsSelectors
        .selectAll(state)
        .find((d) => d.local?.handle === id || d.local?.id === id)
        ?.local,
    (a, b) => a?.id === b?.id,
  );

  const { lastSavedCloud } = useCloudSave(document, editorRef);
  const { isLoading, error } = useDocumentLoader(id, lastSavedCloud);

  // Apply data normalization once when the document finishes loading.
  // isLoading is included so the memo recomputes when loading completes —
  // Redux may hold EMPTY_EDITOR_STATE for the document until getLocalDocument
  // populates it with the real data (just before isLoading becomes false).
  const documentForEditor = useMemo(
    () => (!isLoading && document ? ensureValidDocumentData(document) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document?.id, isLoading],
  );
  const { handleChange } = useAutoSave(document);
  const { handleSaveAndNavigate, handleDiscard } = useDocumentNavigation(
    document,
  );

  if (error) {
    return <SplashScreen title={error.title} subtitle={error.subtitle} />;
  }
  if (isLoading || !documentForEditor) {
    return <SplashScreen title="Loading Document" />;
  }

  return (
    <>
      <title>{documentForEditor.name}</title>
      {showDiff && <DiffView />}
      <ConnectedEditor
        document={documentForEditor}
        editorRef={editorRef}
        onChange={handleChange}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscard}
      />
      <EditDocumentInfo
        documentId={documentForEditor.id}
        editorRef={editorRef}
      />
      <SaveDiscardActions
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscard}
        isDirty={isDirty}
      />
    </>
  );
};

export default DocumentEditor;
