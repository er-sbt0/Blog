"use client";
import { Box, Container, Paper, Typography, Button } from "@mui/material";
import { Series, User, UserDocument } from "@/types";
import { DragProvider } from "../DragContext";
import TrashBin from "../TrashBin";
import { NoteAdd, ViewKanban } from "@mui/icons-material";
import { useRouter } from "next/navigation";

const Home: React.FC<{
  staticDocuments: UserDocument[];
  series?: Series[];
  user?: User;
}> = ({
  staticDocuments,
  series = [],
  user,
}) => {
  const router = useRouter();

  return (
    <DragProvider>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Simple Header Section */}
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, color: "primary.main" }}
          >
            Welcome
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ mb: 4, maxWidth: 600, mx: "auto" }}
          >
            A simple blog platform for creating and sharing content
          </Typography>
        </Box>

        {/* Simple Content Section */}
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: "center",
            bgcolor: "grey.50",
            borderRadius: 2,
            mb: 4,
          }}
        >
          <Typography variant="h5" color="text.secondary" gutterBottom>
            Simple Blog Platform
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Start creating and sharing your thoughts with the world.
          </Typography>
        </Paper>

        {/* Quick Access Tools */}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            mb: 4,
          }}
        >
          <Button
            variant="contained"
            size="large"
            startIcon={<NoteAdd />}
            onClick={() => router.push("/notes")}
            sx={{
              px: 4,
              py: 2,
              borderRadius: 2,
              textTransform: "none",
              fontSize: "16px",
            }}
          >
            2D Notes Canvas
          </Button>
          
          <Button
            variant="outlined"
            size="large"
            startIcon={<ViewKanban />}
            onClick={() => router.push("/new")}
            sx={{
              px: 4,
              py: 2,
              borderRadius: 2,
              textTransform: "none",
              fontSize: "16px",
            }}
          >
            Create Document
          </Button>
        </Box>

        {/* Trash Bin for drag and drop */}
        <TrashBin />
      </Container>
    </DragProvider>
  );
};

export default Home;
