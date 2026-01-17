"use client";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { Add, Description } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ViewDocument from "@/components/ViewDocument";
import htmr from "htmr";
import { CloudDocument, UserDocument } from "@/types";

interface ReadmeViewerProps {
  documents: UserDocument[];
}

interface ReadmeViewerState {
  cloudDocument: CloudDocument;
  html: string;
}

export default function ReadmeViewer({ documents }: ReadmeViewerProps) {
  const [readme, setReadme] = useState<ReadmeViewerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readmeDocId, setReadmeDocId] = useState<string | null>(null);
  const router = useRouter();

  // Find README from documents OR fetch from API
  useEffect(() => {
    let cancelled = false;

    const findOrFetchReadme = async () => {
      // First, check if README is in documents
      const readmeDoc = documents.find((doc) => {
        const data = doc.cloud || doc.local;
        const name = data?.name || "";
        return name.toLowerCase() === "readme";
      });

      if (readmeDoc) {
        if (!cancelled) setReadmeDocId(readmeDoc.id);
        return;
      }

      // README not in documents - try to fetch it from API
      try {
        const response = await fetch("/api/documents");
        if (!response.ok) {
          if (!cancelled) {
            setReadmeDocId(null);
            setLoading(false);
          }
          return;
        }
        const { data } = await response.json();
        if (cancelled) return;

        const readmeFromApi = data?.find((doc: any) =>
          doc.name?.toLowerCase() === "readme"
        );

        if (readmeFromApi) {
          setReadmeDocId(readmeFromApi.id);
        } else {
          setReadmeDocId(null);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch documents for README:", err);
        if (!cancelled) {
          setReadmeDocId(null);
          setLoading(false);
        }
      }
    };

    findOrFetchReadme();

    return () => {
      cancelled = true;
    };
  }, [documents]);

  // Fetch README HTML when we have the ID
  useEffect(() => {
    if (readmeDocId === null) {
      setReadme(null);
      setLoading(false);
      return;
    }

    if (!readmeDocId) {
      return;
    }

    let cancelled = false;

    const fetchReadmeHtml = async () => {
      setLoading(true);

      try {
        // Step 1: Fetch the document to get revision data
        const docResponse = await fetch(`/api/documents/${readmeDocId}`);
        if (!docResponse.ok) {
          throw new Error("Failed to fetch document");
        }
        const docData = await docResponse.json();

        if (cancelled) return;

        if (!docData.data?.data?.root || !docData.data?.cloudDocument) {
          throw new Error("Invalid document data");
        }

        // Step 2: Use the embed API to generate HTML from the editor state
        const embedResponse = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(docData.data.data),
        });

        if (!embedResponse.ok) {
          throw new Error("Failed to generate HTML");
        }

        if (cancelled) return;

        const html = await embedResponse.text();

        setReadme({
          cloudDocument: docData.data.cloudDocument,
          html,
        });
      } catch (err) {
        console.error("Failed to fetch README:", err);
        if (!cancelled) setError("Failed to load README");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchReadmeHtml();

    return () => {
      cancelled = true;
    };
  }, [readmeDocId]);

  const handleCreateReadme = () => {
    router.push("/new?name=README");
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          gap: 2,
        }}
      >
        <Typography color="error">{error}</Typography>
        <Button variant="outlined" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </Box>
    );
  }

  if (!readme) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 400,
          gap: 2,
          textAlign: "center",
          px: 3,
        }}
      >
        <Description sx={{ fontSize: 64, color: "text.disabled" }} />
        <Typography variant="h6" color="text.secondary">
          No README found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Create a README document to introduce your blog or workspace
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleCreateReadme}
        >
          Create README
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", py: 4, px: 3 }}>
      <ViewDocument cloudDocument={readme.cloudDocument}>
        {htmr(readme.html)}
      </ViewDocument>
    </Box>
  );
}
