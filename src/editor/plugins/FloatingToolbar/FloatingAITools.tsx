"use client";
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  SerializedParagraphNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useCallback, useEffect, useRef } from "react";
import { CircularProgress, Divider, IconButton, Tooltip } from "@mui/material";
import {
  AutoAwesome,
  Autorenew,
  UnfoldLess,
  UnfoldMore,
} from "@mui/icons-material";
import { useCompletion } from "@ai-sdk/react";
import { ANNOUNCE_COMMAND, UPDATE_DOCUMENT_COMMAND } from "@/editor/commands";
import { Announcement } from "@/types";
import { throttle } from "@/editor/utils/throttle";
import {
  $convertFromMarkdownString,
  createTransformers,
} from "../MarkdownPlugin";
import { createHeadlessEditor } from "@lexical/headless";
import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import useLocalStorage from "@/hooks/useLocalStorage";

const serializedParagraph: SerializedParagraphNode = {
  children: [],
  direction: null,
  format: "",
  indent: 0,
  type: "paragraph",
  version: 1,
  textFormat: 0,
  textStyle: "",
};

export default function FloatingAITools(
  { editor }: { editor: LexicalEditor },
) {
  const [llmConfig] = useLocalStorage("llm", {
    provider: "google",
    model: "gemini-2.5-flash",
  });

  const announce = useCallback((announcement: Announcement) => {
    editor.dispatchCommand(ANNOUNCE_COMMAND, announcement);
  }, [editor]);

  const handleError = useCallback(() => {
    announce({
      message: {
        title: "Something went wrong",
        subtitle: "Please try again later",
      },
    });
  }, [announce]);

  const { completion, complete, isLoading, stop } = useCompletion({
    api: "/api/completion",
    streamProtocol: "text",
    onError: handleError,
  });

  const offsetRef = useRef(0);

  const convertMarkdownToJSON = useCallback((markdown: string) => {
    const transformers = createTransformers(editor);
    const nodes = Array.from(editor._nodes.values()).map((registry) =>
      registry.klass
    );
    const config = { nodes };
    const headlessEditor = createHeadlessEditor(config);
    headlessEditor.update(() => {
      $convertFromMarkdownString(markdown, transformers);
    }, { discrete: true });
    return headlessEditor.getEditorState().toJSON();
  }, [editor]);

  const updateDocument = useCallback(
    throttle(() => {
      editor.dispatchCommand(UPDATE_DOCUMENT_COMMAND, undefined);
    }, 1000),
    [editor],
  );

  useEffect(() => {
    if (completion.length === 0) return;
    if (!isLoading) {
      offsetRef.current = 0;
      return;
    }
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const offset = offsetRef.current;
      if (offset) $addUpdateTag("history-merge");
      if (offset) {
        selection.anchor.getNode().getTopLevelElement()
          ?.getPreviousSibling()?.remove();
      }

      const isAtNewline = selection.anchor.offset === 0 &&
        selection.focus.offset === 0;
      if (!offset && !isAtNewline) selection.insertParagraph();

      const serializedEditorState = convertMarkdownToJSON(completion);
      const serializedChildren = serializedEditorState.root.children;
      const serializedNodes = serializedChildren.slice(
        offsetRef.current - 1,
      );
      serializedNodes.push(serializedParagraph);
      if (serializedNodes.length === 0) return;
      offsetRef.current = serializedChildren.length;

      const nodes = $generateNodesFromSerializedNodes(serializedNodes);
      selection.insertNodes(nodes);
      const lastChild = nodes[nodes.length - 1];
      lastChild.selectStart();
    }, { onUpdate: updateDocument });
  }, [completion, isLoading]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, isLoading, stop]);

  const runAction = useCallback((option: "improve" | "shorter" | "longer") => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, { body: { option, provider, model } });
    });
  }, [editor, llmConfig, complete]);

  const handleRewrite = () => runAction("improve");
  const handleShorter = () => runAction("shorter");
  const handleLonger = () => runAction("longer");

  if (isLoading) {
    return (
      <>
        <Divider orientation="vertical" flexItem />
        <IconButton size="small" onClick={stop} sx={{ mx: 0.25 }}>
          <CircularProgress size={16} color="inherit" />
        </IconButton>
      </>
    );
  }

  return (
    <>
      <Divider orientation="vertical" flexItem />
      <Tooltip title="Rewrite with AI">
        <IconButton size="small" onClick={handleRewrite} sx={{ mx: 0.25 }}>
          <Autorenew fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Make shorter">
        <IconButton size="small" onClick={handleShorter} sx={{ mx: 0.25 }}>
          <UnfoldLess fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Make longer">
        <IconButton size="small" onClick={handleLonger} sx={{ mx: 0.25 }}>
          <UnfoldMore fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}
