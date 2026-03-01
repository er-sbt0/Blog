"use client";
import { Checkbox, FormControlLabel, FormHelperText } from "@mui/material";

interface DocumentVisibilityFieldsProps {
  isPrivate: boolean | undefined;
  isPublished: boolean | undefined;
  isCollab: boolean | undefined;
  disabled?: boolean;
  onChange: (partial: { private?: boolean; published?: boolean; collab?: boolean }) => void;
}

/**
 * Reusable private / published / collab checkbox group.
 * Used in Edit.tsx, NewDocument.tsx, and CreatePostDrawer.
 */
const DocumentVisibilityFields: React.FC<DocumentVisibilityFieldsProps> = ({
  isPrivate,
  isPublished,
  isCollab,
  disabled = false,
  onChange,
}) => (
  <>
    <FormControlLabel
      label="Private"
      control={
        <Checkbox
          checked={!!isPrivate}
          disabled={disabled}
          onChange={() =>
            onChange({
              private: !isPrivate,
              published: isPublished && isPrivate,
              collab: isCollab && isPrivate,
            })}
        />
      }
    />
    <FormHelperText>
      Private documents are only accessible to authors and coauthors.
    </FormHelperText>
    <FormControlLabel
      label="Published"
      control={
        <Checkbox
          checked={!!isPublished}
          disabled={disabled || !!isPrivate}
          onChange={() => onChange({ published: !isPublished })}
        />
      }
    />
    <FormHelperText>
      Published documents are showcased on the homepage, can be forked by anyone, and can be found
      by search engines.
    </FormHelperText>
    <FormControlLabel
      label="Collab"
      control={
        <Checkbox
          checked={!!isCollab}
          disabled={disabled || !!isPrivate}
          onChange={() => onChange({ collab: !isCollab })}
        />
      }
    />
    <FormHelperText>Collab documents are open for anyone to edit.</FormHelperText>
  </>
);

export default DocumentVisibilityFields;
