"use client";
/**
 * Assistant text from a remote transcript, rendered from `markdown.ts`'s tokens
 * (docs/plans/remote-claude.md §4.7).
 *
 * The rule this file exists to keep (§2.4): **every transcript string reaches
 * the DOM as a React text child.** No `dangerouslySetInnerHTML`, no HTML-capable
 * Markdown library. A link becomes an anchor only when `safeExternalHref`
 * allows its target (http/https); anything else renders as its text.
 */
import React, { Fragment, useMemo } from "react";
import { Box, Link, Typography } from "@mui/material";
import { safeExternalHref } from "@/lib/safeHref";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { type Block, type Inline, tokenizeMarkdown } from "./markdown";
import { Hl } from "./Highlight";

const codeSx = {
  fontFamily: MONO_FONT,
  fontSize: "0.9em",
  px: 0.5,
  borderRadius: 1,
  bgcolor: "action.hover",
} as const;

export const InlineTokens: React.FC<{ tokens: Inline[] }> = ({ tokens }) => (
  <>
    {tokens.map((tok, i) => {
      switch (tok.t) {
        case "text":
          return <Hl key={i} text={tok.v} />;
        case "code":
          return <Box key={i} component="code" sx={codeSx}><Hl text={tok.v} /></Box>;
        case "bold":
          return <strong key={i}><InlineTokens tokens={tok.c} /></strong>;
        case "italic":
          return <em key={i}><InlineTokens tokens={tok.c} /></em>;
        case "link": {
          const href = safeExternalHref(tok.target);
          return href
            ? (
              <Link key={i} href={href} target="_blank" rel="noopener noreferrer">
                <Hl text={tok.text} />
              </Link>
            )
            : <Hl key={i} text={tok.text} />;
        }
      }
    })}
  </>
);

const BlockView: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.t) {
    case "paragraph":
      return (
        <Typography variant="body2" component="p" sx={{ my: 0.75, wordBreak: "break-word" }}>
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <InlineTokens tokens={line} />
            </Fragment>
          ))}
        </Typography>
      );
    case "heading":
      return (
        <Typography
          variant={block.level <= 2 ? "subtitle1" : "subtitle2"}
          component="p"
          sx={{ fontWeight: 700, mt: 1.5, mb: 0.5 }}
        >
          <InlineTokens tokens={block.c} />
        </Typography>
      );
    case "code":
      return (
        <Box
          component="pre"
          sx={{
            m: 0,
            my: 1,
            p: 1.5,
            borderRadius: 2,
            bgcolor: "action.hover",
            fontFamily: MONO_FONT,
            typography: "dense",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          <Hl text={block.text} />
        </Box>
      );
    case "list":
      return (
        <Box component={block.ordered ? "ol" : "ul"} sx={{ my: 0.75, pl: 3 }}>
          {block.items.map((item, i) => (
            <Typography key={i} component="li" variant="body2">
              <InlineTokens tokens={item} />
            </Typography>
          ))}
        </Box>
      );
    case "quote":
      return (
        <Box sx={{ borderLeft: 2, borderColor: "divider", pl: 1.5, my: 0.75, color: "text.secondary" }}>
          <Typography variant="body2" component="p">
            <InlineTokens tokens={block.c} />
          </Typography>
        </Box>
      );
  }
};

export const TranscriptMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const blocks = useMemo(() => tokenizeMarkdown(text), [text]);
  return <>{blocks.map((block, i) => <BlockView key={i} block={block} />)}</>;
};
