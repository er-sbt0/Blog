import type {
  SerializedParagraphNode,
  SerializedRootNode,
  SerializedTextNode,
} from "lexical";
import type { SerializedHeadingNode } from "@lexical/rich-text";

/**
 * Build an initial Lexical editor state for a new document.
 * The root contains:
 *  - an h1 heading with the given title
 *  - an empty paragraph
 */
export function getEditorData(title: string) {
  const headingText: SerializedTextNode = {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: title,
    type: "text",
    version: 1,
  };

  const heading: SerializedHeadingNode = {
    children: [headingText],
    direction: "ltr",
    format: "",
    indent: 0,
    tag: "h1",
    type: "heading",
    version: 1,
  };

  const paragraphText: SerializedTextNode = { ...headingText, text: "" };

  const paragraph: SerializedParagraphNode = {
    children: [paragraphText],
    direction: "ltr",
    format: "",
    textFormat: 0,
    textStyle: "",
    indent: 0,
    type: "paragraph",
    version: 1,
  };

  const root: SerializedRootNode = {
    children: [heading, paragraph],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  };

  return { root };
}
