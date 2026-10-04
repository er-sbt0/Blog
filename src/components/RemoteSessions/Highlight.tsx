"use client";
/**
 * Match highlighting for transcript text and search snippets
 * (docs/plans/remote-claude.md §4.9).
 *
 * §2.4 still governs: the text is split by `searchModel.ts` into plain
 * segments, and each one is a React text child — inside a `<mark>` or not.
 * Nothing here builds a string of markup, so a snippet holding
 * `<img onerror>` is shown as those characters.
 *
 * `HighlightContext` carries the find-in-session query down to the text leaves
 * of a transcript entry, so the entry components need no new prop threading
 * and render exactly as before when there is no query.
 */
import React, { createContext, Fragment, useContext } from "react";
import { Box } from "@mui/material";
import { highlightSegments, sliceMatch, type TextSegment } from "./searchModel";

export const HighlightContext = createContext<string>("");

const markSx = {
  bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.32)",
  color: "inherit",
  borderRadius: "2px",
  px: "1px",
  mx: "-1px",
} as const;

const Segments: React.FC<{ segments: TextSegment[] }> = ({ segments }) => (
  <>
    {segments.map((seg, i) =>
      seg.match
        ? <Box key={i} component="mark" sx={markSx}>{seg.text}</Box>
        : <Fragment key={i}>{seg.text}</Fragment>
    )}
  </>
);

/** `text`, with every occurrence of the context's query marked. */
export const Hl: React.FC<{ text: string }> = ({ text }) => {
  const query = useContext(HighlightContext);
  if (!query) return <>{text}</>;
  return <Segments segments={highlightSegments(text, query)} />;
};

/** A search snippet with the server's match offsets marked. */
export const Snippet: React.FC<{ text: string; start: number; length: number }> = (
  { text, start, length },
) => <Segments segments={sliceMatch(text, start, length)} />;
