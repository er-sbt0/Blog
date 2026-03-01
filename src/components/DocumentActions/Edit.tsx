"use client";
import { actions, useDispatch } from "@/store";
import { DocumentStatus, UserDocument } from "@/types";
import { CloudOff, Settings } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import UploadDocument from "./Upload";
import UsersAutocomplete from "../User/UsersAutocomplete";
import BackgroundImageUploader from "../BackgroundImageUploader";
import { useEditDocumentForm } from "./hooks/useEditDocumentForm";
import DocumentVisibilityFields from "./DocumentVisibilityFields";

const EditDocument: React.FC<{
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const isOnline = useOnlineStatus();
  // All documents are posts now
  const isDirectory = false;

  const {
    cloudDocument,
    document,
    isAuthor,
    isCloud,
    input,
    validating,
    validationErrors,
    hasErrors,
    editDialogOpen,
    updateInput,
    updateCoauthors,
    updateBackgroundImage,
    updateHandle,
    openEditDialog,
    closeEditDialog,
    handleSubmit,
  } = useEditDocumentForm(userDocument);

  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  useFixedBodyScroll(editDialogOpen);

  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem onClick={() => openEditDialog(closeMenu)}>
            <ListItemIcon>
              <Settings />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )
        : (
          <IconButton aria-label="Edit Document" onClick={() => openEditDialog(closeMenu)} size="small">
            <Settings />
          </IconButton>
        )}
      <Dialog
        open={editDialogOpen}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="xs"
        fullScreen={fullScreen}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          autoComplete="off"
          spellCheck="false"
          sx={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}
        >
          <DialogTitle>Edit Post</DialogTitle>
          <DialogContent
            sx={{ "& .MuiFormHelperText-root": { overflow: "hidden", textOverflow: "ellipsis" } }}
          >
            <TextField
              margin="normal"
              size="small"
              fullWidth
              autoFocus
              label="Post Title"
              value={input.name || ""}
              onChange={(e) => updateInput({ name: e.target.value })}
              sx={{ "& .MuiInputBase-root": { height: 40 } }}
            />
            <TextField
              margin="normal"
              size="small"
              fullWidth
              multiline
              rows={3}
              label="Description"
              placeholder="A brief description of your post (optional)"
              value={input.description || ""}
              onChange={(e) => updateInput({ description: e.target.value })}
              helperText="This description will appear in post previews and help with SEO"
              sx={{
                "& .MuiInputBase-root": { minHeight: 80, alignItems: "flex-start", padding: "8px 12px" },
                "& .MuiInputBase-input": { resize: "vertical" },
              }}
            />
            <TextField
              margin="normal"
              size="small"
              fullWidth
              label="Post Handle"
              disabled={!isOnline}
              value={input.handle || ""}
              onChange={updateHandle}
              error={!validating && !!validationErrors.handle}
              helperText={
                validating
                  ? "Validating..."
                  : validationErrors.handle
                  ? validationErrors.handle
                  : input.handle
                  ? `https://matheditor.me/view/${input.handle}`
                  : "This will be used in the URL of your document"
              }
            />

            {/* Publication Date */}
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2, mb: 1 }}>
              Publication Date
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                size="small"
                label="Date"
                type="date"
                disabled={!isAuthor}
                value={input.createdAt ? new Date(input.createdAt).toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  if (e.target.value && input.createdAt) {
                    const current = new Date(input.createdAt);
                    const next = new Date(e.target.value);
                    next.setHours(current.getHours(), current.getMinutes());
                    updateInput({ createdAt: next.toISOString() });
                  }
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Time"
                type="time"
                disabled={!isAuthor}
                value={input.createdAt ? new Date(input.createdAt).toTimeString().slice(0, 5) : ""}
                onChange={(e) => {
                  if (e.target.value && input.createdAt) {
                    const current = new Date(input.createdAt);
                    const [h, m] = e.target.value.split(":");
                    current.setHours(parseInt(h), parseInt(m));
                    updateInput({ createdAt: current.toISOString() });
                  }
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Box>
            <FormHelperText sx={{ mt: 0.5 }}>
              The date and time when this post was published
            </FormHelperText>

            {/* Status */}
            <FormControl fullWidth margin="normal" size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={input.status || DocumentStatus.ACTIVE}
                onChange={(e) => updateInput({ status: e.target.value as DocumentStatus })}
                label="Status"
                disabled={!isAuthor}
              >
                <MenuItem value={DocumentStatus.ACTIVE}>Active</MenuItem>
                <MenuItem value={DocumentStatus.DONE}>Done</MenuItem>
              </Select>
              <FormHelperText>
                {input.status === DocumentStatus.DONE
                  ? "This post is marked as done and will appear with a special visual indicator"
                  : "This post is active and will appear normally"}
              </FormHelperText>
            </FormControl>

            {/* Directory-only: background image */}
            {isDirectory && isAuthor && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Directory Options
                </Typography>
                <BackgroundImageUploader
                  userDocument={userDocument}
                  onChange={updateBackgroundImage}
                  currentImage={document?.background_image || null}
                />
              </>
            )}

            {/* Sort order */}
            {isAuthor && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Sort Options
                </Typography>
                <TextField
                  margin="normal"
                  size="small"
                  fullWidth
                  label="Sort Order"
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  value={input.sort_order === null ? "" : input.sort_order}
                  onChange={(e) =>
                    updateInput({ sort_order: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  helperText="Items with sort order > 0 will appear first. Leave empty for default sorting."
                />
              </>
            )}

            {!cloudDocument && (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", my: 1, gap: 1 }}>
                <FormHelperText>
                  Save the document to cloud to unlock the following options
                </FormHelperText>
                <UploadDocument userDocument={userDocument} variant="button" />
              </Box>
            )}

            {isAuthor && (
              <UsersAutocomplete
                label="Coauthors"
                placeholder="Email"
                value={input.coauthors ?? []}
                onChange={updateCoauthors}
                sx={{ my: 2 }}
                disabled={!isOnline || !isCloud}
              />
            )}

            {isAuthor && (
              <DocumentVisibilityFields
                isPrivate={input.private}
                isPublished={input.published}
                isCollab={input.collab}
                disabled={!isOnline || !isCloud}
                onChange={updateInput}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDialog}>Cancel</Button>
            <Button type="submit" disabled={validating || hasErrors}>
              Save
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
};

export default EditDocument;
