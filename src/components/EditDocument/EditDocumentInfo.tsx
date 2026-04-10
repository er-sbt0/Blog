import { extractCollaborators } from "@/utils/collaborators";
import RevisionCard from "./EditRevisionCard";
import Grid from "@mui/material/Grid2";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { Close, Compare, History, Preview } from "@mui/icons-material";
import type { LexicalEditor } from "lexical";
import { DocumentRevision } from "@/types";
import { RefObject } from "react";
import ShareDocument from "../DocumentActions/Share";
import DownloadDocument from "../DocumentActions/Download";
import ForkDocument from "../DocumentActions/Fork";
import EditDocument from "../DocumentActions/Edit";
import AppDrawer from "../AppDrawer";
import AttachmentDrawer from "../AttachmentDrawer";
import DocumentMetaSection from "./DocumentMetaSection";
import { useDocumentRevisions } from "./hooks/useDocumentRevisions";

export default function EditDocumentInfo(
  { editorRef, documentId }: {
    editorRef: RefObject<LexicalEditor | null>;
    documentId: string;
  },
) {
  const {
    userDocument,
    localDocument,
    cloudDocument,
    user,
    documentRevisions,
    isDiffViewOpen,
    isAuthor,
    handleViewWithCloudSave,
    handleCompareWithCloudSave,
  } = useDocumentRevisions(documentId, editorRef);

  const isCollab = !!cloudDocument?.collab;
  const collaborators = isCollab
    ? extractCollaborators(
      cloudDocument!.revisions,
      cloudDocument!.author.id,
      cloudDocument!.coauthors.map((u) => u.id),
    )
    : [];

  return (
    <>
      <AppDrawer title="Document Info">
        <DocumentMetaSection
          localDocument={localDocument}
          cloudDocument={cloudDocument}
          user={user}
          collaborators={collaborators}
        />

        {userDocument && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mt: 2,
              alignSelf: "flex-end",
            }}
          >
            <IconButton
              aria-label="View"
              onClick={handleViewWithCloudSave}
              sx={isDiffViewOpen
                ? {
                  color: "primary.contrastText",
                  backgroundColor: "primary.main",
                  "&:hover": { backgroundColor: "primary.dark" },
                }
                : undefined}
            >
              <Preview />
            </IconButton>
            <ShareDocument userDocument={userDocument} />
            <ForkDocument userDocument={userDocument} />
            <DownloadDocument userDocument={userDocument} />
            {isAuthor && <EditDocument userDocument={userDocument} />}
          </Box>
        )}

        <Grid container spacing={1}>
          <Grid
            size={{ xs: 12 }}
            sx={{ display: "flex", alignItems: "center" }}
          >
            <History sx={{ mr: 1 }} />
            <Typography variant="h6">Revisions</Typography>
            <Button
              sx={{ ml: "auto" }}
              onClick={handleCompareWithCloudSave}
              endIcon={isDiffViewOpen ? <Close /> : <Compare />}
            >
              {isDiffViewOpen ? "Exit" : "Compare"}
            </Button>
          </Grid>
          {documentRevisions.map((revision) => (
            <Grid size={{ xs: 12 }} key={revision.id}>
              <RevisionCard
                revision={revision as DocumentRevision}
                editorRef={editorRef}
              />
            </Grid>
          ))}
        </Grid>
      </AppDrawer>
      <AttachmentDrawer />
    </>
  );
}
