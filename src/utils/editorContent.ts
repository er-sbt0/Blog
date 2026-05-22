import type { SerializedEditorState } from "lexical";

export interface OutlineHeading {
  text: string;
  level: 2 | 3;
  key: string;
}

type SerializedNode = {
  type: string;
  tag?: string;
  text?: string;
  children?: SerializedNode[];
};

function traverse(
  nodes: SerializedNode[],
  cb: (node: SerializedNode) => void,
) {
  for (const node of nodes) {
    cb(node);
    if (node.children) traverse(node.children, cb);
  }
}

function nodeText(node: SerializedNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.children) return node.children.map(nodeText).join("");
  return "";
}

export function extractHeadings(
  data: SerializedEditorState | undefined,
): OutlineHeading[] {
  const root = data?.root as SerializedNode | undefined;
  if (!root?.children) return [];
  const headings: OutlineHeading[] = [];
  traverse(root.children, (node) => {
    if (node.type === "heading" && node.tag) {
      const level = parseInt(node.tag.slice(1), 10);
      if (level === 2 || level === 3) {
        const text = nodeText(node).trim();
        if (text) headings.push({ text, level: level as 2 | 3, key: text });
      }
    }
  });
  return headings;
}

export function countWords(data: SerializedEditorState | undefined): number {
  const root = data?.root as SerializedNode | undefined;
  if (!root?.children) return 0;
  const parts: string[] = [];
  traverse(root.children, (node) => {
    if (node.type === "text" && node.text) parts.push(node.text);
  });
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}
