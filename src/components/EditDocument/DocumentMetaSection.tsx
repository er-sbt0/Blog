import { DocumentStatus, User } from "@/types";
import { Avatar, Box, Chip, Typography } from "@mui/material";
import { CheckCircle, PlayArrow } from "@mui/icons-material";
import { DateDisplay } from "@/components/shared/DateDisplay";
import RouterLink from "next/link";

// Minimal type shapes needed for display
interface CloudDoc {
  author: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  };
  coauthors: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  }[];
}

interface LocalDoc {
  name: string;
  description?: string | null;
  status?: DocumentStatus | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface Collaborator {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
}

interface DocumentMetaSectionProps {
  localDocument: LocalDoc | undefined;
  cloudDocument: CloudDoc | undefined;
  user: User | null | undefined;
  collaborators: Collaborator[];
}

export default function DocumentMetaSection({
  localDocument,
  cloudDocument,
  user,
  collaborators,
}: DocumentMetaSectionProps) {
  return (
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
      {localDocument && (
        <>
          <Typography component="h2" variant="h6">
            {localDocument.name}
          </Typography>
          {localDocument.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1,
                fontStyle: "italic",
                lineHeight: 1.5,
                padding: "6px 8px",
                backgroundColor: "action.hover",
                borderRadius: 0.5,
                fontSize: "0.875rem",
              }}
            >
              {localDocument.description}
            </Typography>
          )}
          {localDocument.status && (
            <Chip
              size="small"
              icon={localDocument.status === DocumentStatus.ACTIVE
                ? <PlayArrow />
                : <CheckCircle />}
              label={localDocument.status === DocumentStatus.ACTIVE
                ? "Active"
                : "Done"}
              sx={{
                backgroundColor: localDocument.status === DocumentStatus.ACTIVE
                  ? (theme) =>
                    `rgba(${theme.vars.palette.info.mainChannel} / 0.12)`
                  : (theme) =>
                    `rgba(${theme.vars.palette.success.mainChannel} / 0.12)`,
                color: localDocument.status === DocumentStatus.ACTIVE
                  ? "info.main"
                  : "success.dark",
                borderColor: localDocument.status === DocumentStatus.ACTIVE
                  ? "info.main"
                  : "success.main",
                fontWeight: "bold",
              }}
              variant="outlined"
            />
          )}
          <Typography variant="subtitle2" color="text.secondary">
            Created:{" "}
            <DateDisplay date={localDocument.createdAt} variant="full" />
          </Typography>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Updated:{" "}
            <DateDisplay date={localDocument.updatedAt} variant="full" />
          </Typography>
          {!cloudDocument && (
            <Typography variant="subtitle2">
              Author{" "}
              <Chip
                avatar={<Avatar />}
                label={user?.name ?? "Local User"}
                variant="outlined"
              />
            </Typography>
          )}
        </>
      )}

      {cloudDocument && (
        <>
          <Typography variant="subtitle2">
            Author{" "}
            <Chip
              clickable
              component={RouterLink}
              prefetch={false}
              href={`/user/${
                cloudDocument.author.handle || cloudDocument.author.id
              }`}
              avatar={
                <Avatar
                  alt={cloudDocument.author.name}
                  src={cloudDocument.author.image || undefined}
                />
              }
              label={cloudDocument.author.name}
              variant="outlined"
            />
          </Typography>
          {cloudDocument.coauthors.length > 0 && (
            <>
              <Typography component="h3" variant="subtitle2">
                Coauthors
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {cloudDocument.coauthors.map((coauthor) => (
                  <Chip
                    clickable
                    component={RouterLink}
                    prefetch={false}
                    href={`/user/${coauthor.handle || coauthor.id}`}
                    key={coauthor.id}
                    avatar={
                      <Avatar
                        alt={coauthor.name}
                        src={coauthor.image || undefined}
                      />
                    }
                    label={coauthor.name}
                    variant="outlined"
                  />
                ))}
              </Box>
            </>
          )}
          {collaborators.length > 0 && (
            <>
              <Typography component="h3" variant="subtitle2">
                Collaborators
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {collaborators.map((collab) => (
                  <Chip
                    clickable
                    component={RouterLink}
                    prefetch={false}
                    href={`/user/${collab.handle || collab.id}`}
                    key={collab.id}
                    avatar={
                      <Avatar
                        alt={collab.name}
                        src={collab.image || undefined}
                      />
                    }
                    label={collab.name}
                    variant="outlined"
                  />
                ))}
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
