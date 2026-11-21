"use client";
/**
 * "Where should the agent work?" — what a send from the desktop bar asks when
 * no post is open (docs/plans/archive/agent-bar.md §2.7, §4.3). A new post, or one
 * picked from the library; the bar does the rest (`agentPick.ts`).
 *
 * The search is the command palette's (titles, from the store) narrowed to
 * posts, because the palette is where the author already finds a post by name.
 */
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import { FilePlus, FileText, Search } from "lucide-react";
import { useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ICON_SIZE } from "@/theme/icons";
import { matchPosts } from "./agentPick";

const rowSx = { borderRadius: 1.5, py: 0.5 } as const;
const iconSx = { minWidth: 32, color: "text.secondary" } as const;

export type AgentPostChoice = { kind: "new" } | { kind: "existing"; id: string };

interface AgentPostPickerProps {
  open: boolean;
  /** The new post's create is in flight. */
  creating: boolean;
  error: string | null;
  onPick: (choice: AgentPostChoice) => void;
  onCancel: () => void;
}

const AgentPostPicker: React.FC<AgentPostPickerProps> = (
  { open, creating, error, onPick, onCancel },
) => {
  const posts = useSelector(selectAllPosts);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => matchPosts(posts, query), [posts, query]);

  return (
    <Dialog
      open={open}
      onClose={creating ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby="agent-post-picker-title"
      // React events cross the portal: without this, Escape would also reach
      // the bar's own handler and minimize it behind the dialog.
      onKeyDown={(e) => e.stopPropagation()}
      TransitionProps={{
        // `autoFocus` alone loses to the focus trap under StrictMode's effect
        // replay, which restores the bar's field and then focuses the
        // container; the search is where typing should go.
        onEntered: () => searchRef.current?.focus(),
        // Reset the search each time it is asked, not just the first.
        onExited: () => setQuery(""),
      }}
    >
      <DialogTitle id="agent-post-picker-title" sx={{ typography: "h6", pb: 1 }}>
        Where should the agent work?
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {error && <Alert severity="error" sx={{ typography: "dense" }}>{error}</Alert>}
        <ListItemButton
          onClick={() => onPick({ kind: "new" })}
          disabled={creating}
          sx={{ ...rowSx, border: 1, borderColor: "divider" }}
        >
          <ListItemIcon sx={iconSx}>
            {creating
              ? <CircularProgress size={ICON_SIZE.dense} aria-label="Creating the post" />
              : <FilePlus size={ICON_SIZE.dense} />}
          </ListItemIcon>
          <ListItemText
            primary={creating ? "Creating the post…" : "New post"}
            secondary="An untitled draft"
            primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
            secondaryTypographyProps={{ variant: "micro" }}
          />
        </ListItemButton>
        <TextField
          autoFocus
          inputRef={searchRef}
          size="small"
          fullWidth
          value={query}
          disabled={creating}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (query.trim() && results[0]) {
              onPick({ kind: "existing", id: results[0].id });
            }
          }}
          placeholder="Or search your posts"
          inputProps={{ "aria-label": "Search your posts" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={ICON_SIZE.inline} aria-hidden />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ minHeight: 120, maxHeight: 280, overflowY: "auto" }}>
          {results.length === 0
            ? (
              <Typography
                variant="dense"
                component="p"
                color="text.secondary"
                sx={{ textAlign: "center", py: 4 }}
              >
                {query.trim()
                  ? `No posts match “${query.trim()}”.`
                  : "Your library has no posts yet — start a new one."}
              </Typography>
            )
            : (
              <List dense disablePadding aria-label="Posts">
                {results.map((post) => (
                  <ListItemButton
                    key={post.id}
                    disabled={creating}
                    onClick={() => onPick({ kind: "existing", id: post.id })}
                    sx={rowSx}
                  >
                    <ListItemIcon sx={iconSx}>
                      <FileText size={ICON_SIZE.dense} />
                    </ListItemIcon>
                    <ListItemText
                      primary={post.title || "Untitled"}
                      secondary={
                        <>
                          Updated <DateDisplay date={post.updatedAt} variant="medium" />
                        </>
                      }
                      primaryTypographyProps={{ variant: "body2", noWrap: true }}
                      secondaryTypographyProps={{ variant: "micro", noWrap: true }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={creating}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgentPostPicker;
