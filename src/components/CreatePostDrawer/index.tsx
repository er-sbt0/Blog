"use client";
import * as React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import { actions, useDispatch, useSelector } from "@/store";
import { debounce } from "@mui/material/utils";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import type { CheckHandleResponse, DocumentCreateInput, User } from "@/types";
import { getEditorData } from "@/utils/getEditorData";
import PostCloudOptions from "../PostCloudOptions";

interface CreatePostDrawerProps {
  open: boolean;
  onClose: () => void;
  seriesId: string;
  seriesTitle?: string;
  onSuccess?: () => void;
}

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

  // Fetch next series order when drawer opens
  React.useEffect(() => {
    if (!open || !seriesId) return;
    const fetchOrder = async () => {
      try {
        const response = await fetch(`/api/series/${seriesId}`);
        if (response.ok) {
          const { data: series } = await response.json();
          const maxOrder = series?.posts?.reduce(
            (max: number, post: { seriesOrder?: number }) =>
              Math.max(max, post.seriesOrder || 0),
            0,
          ) ?? 0;
          setNextSeriesOrder(maxOrder + 1);
        }
      } catch {
        setNextSeriesOrder(1);
      }
    };
    fetchOrder();
  }, [open, seriesId]);

  // Reset form when drawer closes
  React.useEffect(() => {
    if (!open) {
      setInput({ published: true, private: false, collab: false });
      setValidationErrors({});
      setError(null);
      setSaveToCloud(true);
    }
  }, [open]);

  // Disable cloud saving when offline or logged out
  React.useEffect(() => {
    if (!isOnline || !user) setSaveToCloud(false);
  }, [isOnline, user]);

  const updateInput = (partial: Partial<DocumentCreateInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const updateCoauthors = (users: (User | string)[]) => {
    updateInput({
      coauthors: users.map((u) => (typeof u === "string" ? u : u.email)),
    });
  };

  const checkHandle = useCallback(
    debounce(async (handle: string) => {
      setValidating(true);
      try {
        const res = await fetch(`/api/handle?handle=${handle}`);
        const { data: available, error } =
          (await res.json()) as CheckHandleResponse;
        setValidationErrors(
          error || !available
            ? { handle: error?.title || "Handle is not available" }
            : {},
        );
      } catch {
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

  const hasErrors = useMemo(() => Object.keys(validationErrors).length > 0, [
    validationErrors,
  ]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    if (!seriesId?.trim()) {
      setError("Invalid series. Please try again.");
      setIsSubmitting(false);
      return;
    }
    try {
      const name = input.name || "Untitled Document";
      const createdAt = new Date().toISOString();
      const postId = uuidv4();
      const payload: DocumentCreateInput = {
        ...input,
        id: postId,
        head: uuidv4(),
        name,
        data: input.data ??
          (getEditorData(name) as DocumentCreateInput["data"]),
        type: "DOCUMENT",
        parentId: null,
        seriesId,
        seriesOrder: nextSeriesOrder,
        createdAt,
        updatedAt: createdAt,
      };

      const response = await dispatch(actions.createLocalDocument(payload));
      if (response.type === actions.createLocalDocument.fulfilled.type) {
        if (saveToCloud && isOnline && user) {
          const cloudResponse = await dispatch(
            actions.createCloudDocument(payload),
          );
          if (
            cloudResponse.type === actions.createCloudDocument.fulfilled.type
          ) {
            onSuccess?.();
            onClose();
            router.refresh();
            router.push(`/view/${postId}`);
            return;
          }
        }
        onSuccess?.();
        onClose();
        router.refresh();
      } else {
        setError("Failed to create post. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
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
        sx={{ height: "100%", display: "flex", flexDirection: "column" }}
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
            <Typography variant="h6" component="h2">Create New Post</Typography>
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
        <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
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
          <PostCloudOptions
            input={input}
            saveToCloud={saveToCloud}
            isOnline={isOnline}
            user={user}
            isSubmitting={isSubmitting}
            onSaveToCloudChange={setSaveToCloud}
            onUpdateInput={updateInput}
            onUpdateCoauthors={updateCoauthors}
          />
        </Box>

        {/* Footer */}
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
          <Button onClick={onClose} disabled={isSubmitting} variant="outlined">
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
