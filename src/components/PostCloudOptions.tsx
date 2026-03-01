"use client";
import { Checkbox, FormControlLabel, FormHelperText } from "@mui/material";
import { DocumentCreateInput, User } from "@/types";
import UsersAutocomplete from "./User/UsersAutocomplete";
import DocumentVisibilityFields from "./DocumentActions/DocumentVisibilityFields";

interface PostCloudOptionsProps {
  input: Partial<DocumentCreateInput>;
  saveToCloud: boolean;
  isOnline: boolean;
  user: unknown | null;
  isSubmitting?: boolean;
  onSaveToCloudChange: (checked: boolean) => void;
  onUpdateInput: (partial: Partial<DocumentCreateInput>) => void;
  onUpdateCoauthors: (users: (User | string)[]) => void;
}

/**
 * Renders the "Save to Cloud" toggle plus the cloud-only fields
 * (coauthors, private, published, collab).
 * Shared by CreatePostDrawer and NewDocument.
 */
const PostCloudOptions: React.FC<PostCloudOptionsProps> = ({
  input,
  saveToCloud,
  isOnline,
  user,
  isSubmitting = false,
  onSaveToCloudChange,
  onUpdateInput,
  onUpdateCoauthors,
}) => (
  <>
    <FormControlLabel
      control={
        <Checkbox
          checked={saveToCloud}
          disabled={!isOnline || !user || isSubmitting}
          onChange={(e) => onSaveToCloudChange(e.target.checked)}
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
          onChange={onUpdateCoauthors}
          sx={{ mb: 2 }}
          disabled={isSubmitting}
        />
        <DocumentVisibilityFields
          isPrivate={input.private}
          isPublished={input.published ?? true}
          isCollab={input.collab}
          disabled={isSubmitting}
          onChange={(partial) => {
            const update: Partial<DocumentCreateInput> = {};
            if (partial.private !== undefined) update.private = partial.private;
            if (partial.published !== undefined) {
              update.published = partial.published;
            }
            if (partial.collab !== undefined) update.collab = partial.collab;
            onUpdateInput(update);
          }}
        />
      </>
    )}
  </>
);

export default PostCloudOptions;
