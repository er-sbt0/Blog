"use client";
import { useMemo } from "react";
import { CloudDocumentRevision, Document, User } from "@/types";
import { extractCollaborators } from "@/utils/collaborators";
import Grid from "@mui/material/Grid2";
import { Avatar, Box, Chip, IconButton, Typography } from "@mui/material";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { Edit, History } from "@mui/icons-material";
import RouterLink from "next/link";
import ShareDocument from "../DocumentActions/Share";
import DownloadDocument from "../DocumentActions/Download";
import ForkDocument from "../DocumentActions/Fork";
import AppDrawer from "../drawers/AppDrawer";
import AttachmentDrawer from "../drawers/AttachmentDrawer";
import ViewRevisionCard from "./ViewRevisionCard";
import { documentsSelectors, useSelector } from "@/store";

export default function ViewDocumentInfo(
  { cloudDocument, user }: { cloudDocument: Document; user?: User },
) {
  const handle = cloudDocument.handle || cloudDocument.id;
  const isAuthor = cloudDocument.author.id === user?.id;
  // Simplified blog structure: no coauthors, only authors can edit
  const userDocument = { id: cloudDocument.id, cloud: cloudDocument };
  const isPublished = cloudDocument.published;
  const isCollab = cloudDocument.collab;
  const isEditable = isAuthor || isCollab; // Remove coauthor check
  const showFork = isPublished || isEditable;
  const collaborators = isCollab
    ? extractCollaborators(
      cloudDocument.revisions,
      cloudDocument.author.id,
    )
    : [];

  // Merge local revisions from Redux with cloud revisions so view mode shows
  // the same revision history as edit mode.
  const localRevisions = useSelector((state) => {
    const doc = documentsSelectors.selectById(state, cloudDocument.id);
    return doc?.local?.revisions ?? [];
  });
  const revisions = useMemo(() => {
    const merged: CloudDocumentRevision[] = [...cloudDocument.revisions];
    const localAuthorFallback: User = {
      id: cloudDocument.author.id,
      name: cloudDocument.author.name,
      email: cloudDocument.author.email,
      handle: cloudDocument.author.handle,
      image: cloudDocument.author.image,
    };
    localRevisions.forEach((r) => {
      if (!merged.some((cr) => cr.id === r.id)) {
        merged.push({
          id: r.id,
          documentId: r.documentId,
          createdAt: r.createdAt,
          author: localAuthorFallback,
        });
      }
    });
    return [...merged].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [cloudDocument.revisions, cloudDocument.author, localRevisions]);

  return (
    <>
      <AppDrawer title="Document Info">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
            justifyContent: "start",
            gap: 1,
            my: 3,
          }}
        >
          <Typography component="h2" variant="h6">
            {cloudDocument.name}
          </Typography>
          {cloudDocument.description && (
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{
                mb: 2,
                fontStyle: "italic",
                lineHeight: 1.6,
                padding: "8px 12px",
                backgroundColor: "action.hover",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              {cloudDocument.description}
            </Typography>
          )}
          <Typography variant="subtitle2" color="text.secondary">
            Created:{" "}
            <DateDisplay date={cloudDocument.createdAt} variant="full" />
          </Typography>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
          >
            Updated:{" "}
            <DateDisplay date={cloudDocument.updatedAt} variant="full" />
          </Typography>
          <Typography variant="subtitle2">
            Author{" "}
            <Chip
              clickable
              component={RouterLink}
              prefetch={false}
              href={`/user/${
                cloudDocument.author.handle ||
                cloudDocument.author.id
              }`}
              avatar={
                <Avatar
                  alt={cloudDocument.author.name}
                  src={cloudDocument.author.image ||
                    undefined}
                />
              }
              label={cloudDocument.author.name}
              variant="outlined"
            />
          </Typography>
          {/* Removed coauthors section for simplified blog structure */}
          {collaborators.length > 0 && (
            <>
              <Typography component="h3" variant="subtitle2">
                Collaborators
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                {collaborators.map((user) => (
                  <Chip
                    clickable
                    component={RouterLink}
                    prefetch={false}
                    href={`/user/${user.handle || user.id}`}
                    key={user.id}
                    avatar={
                      <Avatar
                        alt={user.name}
                        src={user.image || undefined}
                      />
                    }
                    label={user.name}
                    variant="outlined"
                  />
                ))}
              </Box>
            </>
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mt: 2,
              alignSelf: "flex-end",
            }}
          >
            <ShareDocument userDocument={userDocument} />
            {showFork && <ForkDocument userDocument={userDocument} />}
            {isEditable && <DownloadDocument userDocument={userDocument} />}
            {isEditable && (
              <IconButton
                component={RouterLink}
                prefetch={false}
                href={`/edit/${handle}`}
                aria-label="Edit"
              >
                <Edit />
              </IconButton>
            )}
          </Box>
        </Box>
        <Grid container spacing={1}>
          <Grid
            sx={{ display: "flex", alignItems: "center" }}
            size={{ xs: 12 }}
          >
            <History sx={{ mr: 1 }} />
            <Typography variant="h6">Revisions</Typography>
          </Grid>
          {revisions.map((revision) => (
            <Grid size={{ xs: 12 }} key={revision.id}>
              <ViewRevisionCard
                cloudDocument={cloudDocument}
                revision={revision}
              />
            </Grid>
          ))}
        </Grid>
      </AppDrawer>
      <AttachmentDrawer />
    </>
  );
}
