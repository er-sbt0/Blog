"use client";
import { Box, CircularProgress, Typography } from "@mui/material";
import { Add, ArticleOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { UserDocument } from "@/types";
import htmr from "htmr";
import { DateDisplay } from "@/components/DateDisplay";

interface ReadmePreviewCardProps {
  documents: UserDocument[];
  onViewFull: () => void;
}

interface ReadmeData {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export default function ReadmePreviewCard({
  documents,
  onViewFull,
}: ReadmePreviewCardProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [readme, setReadme] = useState<ReadmeData | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(true); // Start with loading true

  // Find README from documents prop OR fetch it separately
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
        const data = readmeDoc.cloud || readmeDoc.local;
        if (data && !cancelled) {
          setReadme({
            id: readmeDoc.id,
            name: data.name,
            description: data.description || undefined,
            updatedAt: String(data.updatedAt),
          });
          return;
        }
      }

      // README not in documents - try to fetch it from API
      // This happens when server-side render doesn't have session
      try {
        const response = await fetch("/api/documents");
        if (!response.ok) {
          if (!cancelled) setReadme(null);
          return;
        }
        const { data } = await response.json();
        if (cancelled) return;

        const readmeFromApi = data?.find((doc: any) =>
          doc.name?.toLowerCase() === "readme"
        );

        if (readmeFromApi) {
          setReadme({
            id: readmeFromApi.id,
            name: readmeFromApi.name,
            description: readmeFromApi.description || undefined,
            updatedAt: String(readmeFromApi.updatedAt),
          });
        } else {
          setReadme(null);
        }
      } catch (err) {
        console.error("Failed to fetch documents for README:", err);
        if (!cancelled) setReadme(null);
      }
    };

    findOrFetchReadme();

    return () => {
      cancelled = true;
    };
  }, [documents]);

  // Fetch HTML content when readme is found
  useEffect(() => {
    if (readme === null) {
      // Explicitly null means we checked and there's no README
      setHtml(null);
      setLoadingHtml(false);
      return;
    }

    if (!readme) {
      // undefined means we're still loading
      return;
    }

    let cancelled = false;

    const fetchHtml = async () => {
      setLoadingHtml(true);
      try {
        // Fetch the document to get revision data
        const docResponse = await fetch(`/api/documents/${readme.id}`);
        if (!docResponse.ok) {
          throw new Error("Failed to fetch document");
        }
        const docData = await docResponse.json();

        if (!docData.data?.data?.root) {
          throw new Error("Invalid document data");
        }

        // Use the embed API to generate HTML from the editor state
        const embedResponse = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(docData.data.data),
        });

        if (!embedResponse.ok) {
          throw new Error("Failed to generate HTML");
        }

        if (cancelled) return;

        const generatedHtml = await embedResponse.text();
        setHtml(generatedHtml);
      } catch (err) {
        console.error("Failed to fetch README HTML:", err);
        if (!cancelled) setHtml(null);
      } finally {
        if (!cancelled) setLoadingHtml(false);
      }
    };

    fetchHtml();

    return () => {
      cancelled = true;
    };
  }, [readme]);

  const createReadme = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      const headId = uuidv4();

      // Default Lexical editor state with a heading
      const defaultData = {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: "Welcome to my blog",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "heading",
              version: 1,
              tag: "h1",
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: "This is the README for this workspace. Click to edit.",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      };

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: "README",
          description: "Welcome to my blog",
          head: headId,
          data: defaultData,
          createdAt: now,
          updatedAt: now,
          published: true,
          collab: false,
          private: false,
        }),
      });

      if (response.ok) {
        // Reload to trigger useDocuments refresh
        window.location.reload();
      } else {
        const errorData = await response.json();
        const errorMessage = errorData?.error?.subtitle ||
          errorData?.error?.title ||
          "Failed to create README";
        setError(errorMessage);
        console.error("Failed to create README:", errorMessage);
      }
    } catch (err) {
      setError("Network error - please try again");
      console.error("Failed to create README:", err);
    } finally {
      setCreating(false);
    }
  }, []);

  const handleClick = () => {
    if (readme) {
      onViewFull();
    } else if (!creating) {
      createReadme();
    }
  };

  return (
    <Box
      sx={{
        height: 380,
        position: "relative",
        cursor: creating ? "wait" : "pointer",
        borderRadius: 3,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: creating ? 0.7 : 1,
      }}
      onClick={handleClick}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ArticleOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            README
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          height: 320,
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
          bgcolor: "action.hover",
          p: 2.5,
        }}
      >
        {readme
          ? (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {loadingHtml
                ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                    }}
                  >
                    <CircularProgress size={24} />
                  </Box>
                )
                : html
                ? (
                  <Box
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      position: "relative",
                      bgcolor: "transparent",
                      "& .document-container": {
                        fontSize: "0.75rem",
                        lineHeight: 1.5,
                        bgcolor: "transparent",
                        "& h1": { fontSize: "1rem", mt: 0, mb: 1 },
                        "& h2": { fontSize: "0.9rem", mt: 0, mb: 0.5 },
                        "& h3": { fontSize: "0.85rem", mt: 0, mb: 0.5 },
                        "& p": { mb: 0.5, mt: 0 },
                        "& ul, & ol": { pl: 2, my: 0.5 },
                        "& li": { mb: 0.25 },
                      },
                      "& > div": {
                        bgcolor: "transparent",
                      },
                    }}
                  >
                    <div className="document-container">{htmr(html)}</div>
                  </Box>
                )
                : (
                  <>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 600,
                        fontSize: "1.1rem",
                        mb: 1.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {readme.name}
                    </Typography>
                    {readme.description && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          lineHeight: 1.6,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 5,
                          WebkitBoxOrient: "vertical",
                          flex: 1,
                        }}
                      >
                        {readme.description}
                      </Typography>
                    )}
                  </>
                )}
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  mt: "auto",
                  opacity: 0.7,
                  pt: 1,
                }}
              >
                Updated <DateDisplay date={readme.updatedAt} variant="short" />
              </Typography>
            </Box>
          )
          : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
              }}
            >
              {creating
                ? (
                  <>
                    <CircularProgress size={24} sx={{ mb: 2 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary" }}
                    >
                      Creating README...
                    </Typography>
                  </>
                )
                : (
                  <>
                    <Add
                      sx={{
                        fontSize: 40,
                        color: "text.secondary",
                        opacity: 0.4,
                        mb: 1,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", opacity: 0.7 }}
                    >
                      No README found
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", mt: 0.5, opacity: 0.5 }}
                    >
                      Click to create one
                    </Typography>
                    {error && (
                      <Typography
                        variant="caption"
                        sx={{ color: "error.main", mt: 1 }}
                      >
                        {error}
                      </Typography>
                    )}
                  </>
                )}
            </Box>
          )}
      </Box>
    </Box>
  );
}
