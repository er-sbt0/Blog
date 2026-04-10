"use client";
import { Fab } from "@mui/material";
import { Save } from "@mui/icons-material";
import { FloatingActionButton } from "./FloatingActionsContainer";

interface SaveDocumentButtonProps {
  onSave: () => Promise<boolean>;
}

const SaveDocumentButton: React.FC<SaveDocumentButtonProps> = ({ onSave }) => {
  const handleSave = async () => {
    await onSave();
    // The navigation logic should be handled in the parent component
  };

  return (
    <FloatingActionButton id="document-save" priority={25}>
      <Fab
        size="medium"
        onClick={handleSave}
        sx={{
          displayPrint: "none",
          bgcolor: "white",
          color: "black",
          "&:hover": {
            bgcolor: "#f5f5f5",
          },
        }}
        aria-label="Save document"
      >
        <Save />
      </Fab>
    </FloatingActionButton>
  );
};

export default SaveDocumentButton;
