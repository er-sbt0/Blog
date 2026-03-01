"use client";
import { Close, Save } from "@mui/icons-material";
import { Fab } from "@mui/material";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";

interface SaveDiscardActionsProps {
  onSave?: () => void;
  onDiscard?: () => void;
  isDirty?: boolean;
}

const SaveDiscardActions: React.FC<SaveDiscardActionsProps> = ({
  onSave,
  onDiscard,
  isDirty,
}) => {
  if (!onSave && !onDiscard) return null;

  return (
    <>
      {onDiscard && (
        <FloatingActionButton id="discard-changes" priority={20}>
          <Fab
            size="medium"
            aria-label="discard changes"
            onClick={onDiscard}
            sx={{
              displayPrint: "none",
              bgcolor: "background.paper",
              color: "text.primary",
              boxShadow: 2,
              "&:hover": {
                bgcolor: "action.hover",
                boxShadow: 4,
              },
            }}
          >
            <Close />
          </Fab>
        </FloatingActionButton>
      )}
      {onSave && (
        <FloatingActionButton id="save-changes" priority={10}>
          <Fab
            size="medium"
            aria-label="save changes"
            onClick={onSave}
            sx={{
              displayPrint: "none",
              bgcolor: isDirty ? "primary.main" : "background.paper",
              color: isDirty ? "primary.contrastText" : "text.primary",
              boxShadow: isDirty ? 4 : 2,
              transition: "background-color 0.2s, color 0.2s, box-shadow 0.2s",
              "&:hover": {
                bgcolor: isDirty ? "primary.dark" : "action.hover",
                boxShadow: 4,
              },
            }}
          >
            <Save />
          </Fab>
        </FloatingActionButton>
      )}
    </>
  );
};

export default SaveDiscardActions;
