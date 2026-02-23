"use client";
import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import { actions, useDispatch, useSelector } from "@/store";
import UsersAutocomplete from "../User/UsersAutocomplete";
import { debounce } from "@mui/material/utils";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import type {
  SerializedParagraphNode,
  SerializedRootNode,
  SerializedTextNode,
} from "lexical";
import type { SerializedHeadingNode } from "@lexical/rich-text";
import type {
  CheckHandleResponse,
  DocumentCreateInput,
  DocumentType,
  User,
} from "@/types";

interface CreatePostDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
  /** Series ID to create post in */
  seriesId: string;
  /** Series title for display */
  seriesTitle?: string;
  /** Callback after successful creation */
  onSuccess?: () => void;
}

const getEditorData = (title: string) => {
  const headingText: SerializedTextNode = {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: title,
    type: "text",
    version: 1,
  };

  const heading: SerializedHeadingNode = {
    children: [headingText],
    direction: "ltr",
    format: "",
    indent: 0,
    tag: "h1",
    type: "heading",
    version: 1,
  };

  const paragraphText: SerializedTextNode = {
    ...headingText,
    text: "",
  };

  const paragraph: SerializedParagraphNode = {
    children: [paragraphText],
    direction: "ltr",
    format: "",
    textFormat: 0,
    textStyle: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  };

  const root: SerializedRootNode = {
    children: [heading, paragraph],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  };

  return { root };
};

/**
 * Drawer component for creating a new post in a series
 * Slides in from the right side with a form to create a post
 */
const CreatePostDrawer: React.FC<CreatePostDrawerProps> = ({
  open,
  onClose,
  seriesId,
  seriesTitle,
  onSuccess,
}) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const user = useSelector((state) => state.user);

  const [input, setInput] = useState<Partial<DocumentCreateInput>>({
    published: true,
    private: false,
    collab: false,
  });
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [validating, setValidating] = useState(false);
  const [nextSeriesOrder, setNextSeriesOrder] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch series and calculate next order
  React.useEffect(() => {
    const fetchSeriesOrder = async () => {
      if (!open || !seriesId) return;

      try {
        const response = await fetch(`/api/series/${seriesId}`);
        if (response.ok) {
          const { data: series } = await response.json();
          if (series && series.posts) {
            const maxOrder = series.posts.reduce(
              (max: number, post: any) => Math.max(max, post.seriesOrder || 0),
              0,
            );
            setNextSeriesOrder(maxOrder + 1);
          } else {
            setNextSeriesOrder(1);
          }
        }
      } catch (error) {
        console.error("Failed to fetch series:", error);
        setNextSeriesOrder(1);
      }
    };

    fetchSeriesOrder();
  }, [open, seriesId]);

  // Reset form when drawer opens/closes
  React.useEffect(() => {
    if (!open) {
      setInput({
        published: true,
        private: false,
        collab: false,
      });
      setValidationErrors({});
      setError(null);
      // Reset saveToCloud to true when drawer closes
      setSaveToCloud(true);
    }
  }, [open]);

  // If user goes offline or logs out, disable cloud saving
  React.useEffect(() => {
    if (!isOnline || !user) {
      setSaveToCloud(false);
    }
  }, [isOnline, user]);

  const updateInput = (partial: Partial<DocumentCreateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const updateCoauthors = (users: (User | string)[]) => {
    const coauthors = users.map((u) => (typeof u === "string" ? u : u.email));
    updateInput({ coauthors });
  };

  const checkHandle = useCallback(
    debounce(async (handle: string) => {
      if (!handle) return;
      setValidating(true);
      try {
        const response = await fetch(`/api/handle?handle=${handle}`);
        const { data: available, error } =
          (await response.json()) as CheckHandleResponse;
        if (error || !available) {
          setValidationErrors({
            handle: error?.title || "Handle is not available",
          });
        } else {
          setValidationErrors({});
        }
      } catch (err) {
        setValidationErrors({ handle: "Failed to check handle availability" });
      } finally {
        setValidating(false);
      }
    }, 500),
    [],
  );

  const updateHandle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const handle = event.target.value.trim().toLowerCase().replace(
      /[^A-Za-z0-9]/g,
      "-",
    );
    updateInput({ handle });
    if (!handle) return setValidationErrors({});
    if (handle.length < 3) {
      return setValidationErrors({
        handle: "Handle must be at least 3 characters long",
      });
    }
    checkHandle(handle);
  };

  const hasErrors = useMemo(
    () => Object.keys(validationErrors).length > 0,
    [validationErrors],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Validate seriesId
    if (!seriesId || seriesId.trim() === "") {
      setError("Invalid series. Please try again.");
      setIsSubmitting(false);
      return;
    }

    try {
      const name = input.name || "Untitled Document";
      const editorData = getEditorData(name);
      const data = input.data || editorData;
      const createdAt = new Date().toISOString();
      const postId = uuidv4();
      const payload: DocumentCreateInput = {
        ...input,
        id: postId,
        head: uuidv4(),
        name,
        data: data as any,
        type: "DOCUMENT" as DocumentType,
        parentId: null,
        seriesId,
        seriesOrder: nextSeriesOrder,
        createdAt,
        updatedAt: createdAt,
      };

      const response = await dispatch(actions.createLocalDocument(payload));
      if (response.type === actions.createLocalDocument.fulfilled.type) {
        // Save to cloud if user is online and authenticated
        if (saveToCloud && isOnline && user) {
          const cloudResponse = await dispatch(
            actions.createCloudDocument(payload),
          );
          if (
            cloudResponse.type === actions.createCloudDocument.fulfilled.type
          ) {
            // Post created successfully on cloud
            onSuccess?.();
            onClose();
            // Refresh to update cache (including sidebar) before navigating
            router.refresh();
            // Navigate to the newly created post
            router.push(`/view/${postId}`);
            return;
          }
        }

        // Post created locally - close drawer and refresh series page
        onSuccess?.();
        onClose();
        router.refresh();
      } else {
        setError("Failed to create post. Please try again.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Error creating post:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 600, md: 700 },
          maxWidth: "100vw",
        },
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h6" component="h2">
              Create New Post
            </Typography>
            {seriesTitle && (
              <Typography variant="body2" color="text.secondary">
                in {seriesTitle}
              </Typography>
            )}
          </Box>
          <IconButton
            onClick={onClose}
            edge="end"
            aria-label="close"
            disabled={isSubmitting}
          >
            <Close />
          </IconButton>
        </Box>

        {/* Form Content */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 3,
          }}
        >
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          <TextField
            autoFocus
            label="Title"
            placeholder="Enter post title"
            fullWidth
            value={input.name || ""}
            onChange={(e) => updateInput({ name: e.target.value })}
            required
            sx={{ mb: 2 }}
            disabled={isSubmitting}
          />

          <TextField
            label="Handle"
            placeholder="url-slug-for-post"
            fullWidth
            value={input.handle || ""}
            onChange={updateHandle}
            error={!!validationErrors.handle}
            helperText={validationErrors.handle ||
              "Optional: Custom URL for this post"}
            sx={{ mb: 2 }}
            disabled={isSubmitting}
            InputProps={{
              endAdornment: validating && <CircularProgress size={20} />,
            }}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={saveToCloud}
                disabled={!isOnline || !user || isSubmitting}
                onChange={(e) => setSaveToCloud(e.target.checked)}
              />
            }
            label="Save to Cloud"
          />
          <FormHelperText sx={{ ml: 0, mb: 2 }}>
            {!isOnline
              ? "You are offline. Post will be saved locally only."
              : !user
              ? "Sign in to save to cloud."
              : "Post will be synchronized with the cloud."}
          </FormHelperText>

          {saveToCloud && isOnline && user && (
            <>
              <UsersAutocomplete
                label="Coauthors"
                placeholder="Email"
                value={input.coauthors ?? []}
                onChange={updateCoauthors}
                sx={{ mb: 2 }}
                disabled={isSubmitting}
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={input.private}
                    disabled={isSubmitting}
                    onChange={() =>
                      updateInput({
                        private: !input.private,
                        published: input.private
                          ? (input.published ?? true)
                          : false,
                        collab: input.collab && input.private,
                      })}
                  />
                }
                label="Private"
              />
              <FormHelperText sx={{ ml: 0, mb: 2 }}>
                Private documents are only accessible to authors and coauthors.
              </FormHelperText>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={input.published ?? true}
                    disabled={input.private || isSubmitting}
                    onChange={() =>
                      updateInput({
                        published: !(input.published ?? true),
                      })}
                  />
                }
                label="Published"
              />
              <FormHelperText sx={{ ml: 0, mb: 2 }}>
                Published posts appear in your blog and are publicly accessible.
              </FormHelperText>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={input.collab}
                    disabled={input.private || isSubmitting}
                    onChange={() =>
                      updateInput({
                        collab: !input.collab,
                      })}
                  />
                }
                label="Collab"
              />
              <FormHelperText sx={{ ml: 0, mb: 2 }}>
                Collab documents are open for anyone to edit.
              </FormHelperText>
            </>
          )}
        </Box>

        {/* Footer with actions */}
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            gap: 2,
            justifyContent: "flex-end",
          }}
        >
          <Button
            onClick={onClose}
            disabled={isSubmitting}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={isSubmitting ? <CircularProgress size={20} /> : <Add />}
            disabled={hasErrors || validating || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Post"}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default CreatePostDrawer;
