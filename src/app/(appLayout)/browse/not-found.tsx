"use client";
import React from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import { ArrowBack, Folder } from "@mui/icons-material";
import Link from "next/link";

/**
 * Shown by Next.js when notFound() is called inside any browse/* segment,
 * or when a browse route segment fails to match.
 * Replaces the former DocumentBrowser/components/ErrorState.tsx.
 */
export default function BrowseNotFound() {
  return (
    <Container
      maxWidth={false}
      sx={{
        py: 4,
        px: { xs: 2, sm: 3, md: 4, lg: 5 },
        maxWidth: { xs: "100%", sm: "100%", md: "2000px", lg: "2200px" },
        mx: "auto",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          p: 4,
          gap: 2,
        }}
      >
        <Folder
          sx={{
            width: 64,
            height: 64,
            color: "text.secondary",
            opacity: 0.6,
          }}
        />
        <Typography variant="h6">Post not found</Typography>
        <Typography variant="body2" color="text.secondary" align="center">
          The blog post you&apos;re looking for doesn&apos;t exist or has been
          removed.
        </Typography>
        <Button
          component={Link}
          href="/browse"
          startIcon={<ArrowBack />}
          variant="contained"
          sx={{ borderRadius: 1.5, mt: 2 }}
        >
          Back to Posts
        </Button>
      </Box>
    </Container>
  );
}
