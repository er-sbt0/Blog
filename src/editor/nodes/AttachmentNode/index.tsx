import {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

import { DecoratorNode } from "lexical";
import { JSX } from "react";
import AttachmentComponent from "./AttachmentComponent";

export interface AttachmentPayload {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  key?: NodeKey;
  expanded?: boolean;
  editing?: boolean;
}

function convertAttachmentElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement;
  if (!element.dataset.attachment) {
    return null;
  }
  const url = element.dataset.url || (element as HTMLAnchorElement).href || "";
  const filename = element.dataset.filename ||
    (element as HTMLAnchorElement).download || "file";
  const mimetype = element.dataset.mimetype || "application/octet-stream";
  const size = parseInt(element.dataset.size || "0", 10);
  const expanded = element.dataset.expanded === "true";
  const editing = element.dataset.editing === "true";
  const node = $createAttachmentNode({
    url,
    filename,
    mimetype,
    size,
    expanded,
    editing,
  });
  return { node };
}

export type SerializedAttachmentNode = Spread<
  {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
    expanded: boolean;
    editing: boolean;
  },
  SerializedLexicalNode
>;

export class AttachmentNode extends DecoratorNode<JSX.Element> {
  __url: string;
  __filename: string;
  __mimetype: string;
  __size: number;
  __expanded: boolean;
  __editing: boolean;

  static getType(): string {
    return "attachment";
  }

  static clone(node: AttachmentNode): AttachmentNode {
    return new AttachmentNode(
      node.__url,
      node.__filename,
      node.__mimetype,
      node.__size,
      node.__expanded,
      node.__editing,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedAttachmentNode): AttachmentNode {
    const { url, filename, mimetype, size, expanded, editing } = serializedNode;
    return $createAttachmentNode({
      url,
      filename,
      mimetype,
      size,
      expanded: expanded ?? false,
      editing: editing ?? false,
    });
  }

  exportDOM(): DOMExportOutput {
    // Export as a button-like anchor without href to avoid Next.js router interception
    const element = document.createElement("a");
    element.setAttribute("data-attachment", "true");
    element.setAttribute("data-url", this.__url);
    element.setAttribute("data-filename", this.__filename);
    element.setAttribute("data-mimetype", this.__mimetype);
    element.setAttribute("data-size", this.__size.toString());
    element.setAttribute("data-expanded", this.__expanded.toString());
    element.setAttribute("data-editing", this.__editing.toString());
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    // Use javascript: void(0) to prevent navigation
    element.setAttribute("href", "javascript:void(0)");
    element.textContent = `📎 ${this.__filename}`;
    element.style.cssText =
      "display: inline-block; padding: 8px 12px; background: #f5f5f5; border-radius: 4px; cursor: pointer; margin: 4px 0; user-select: none; text-decoration: none; color: inherit;";
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: Node) => {
        const span = node as HTMLSpanElement;
        if (!span.dataset.attachment) {
          return null;
        }
        return {
          conversion: convertAttachmentElement,
          priority: 1,
        };
      },
      a: (node: Node) => {
        const anchor = node as HTMLAnchorElement;
        if (!anchor.dataset.attachment) {
          return null;
        }
        return {
          conversion: convertAttachmentElement,
          priority: 1,
        };
      },
    };
  }

  constructor(
    url: string,
    filename: string,
    mimetype: string,
    size: number,
    expanded: boolean = false,
    editing: boolean = false,
    key?: NodeKey,
  ) {
    super(key);
    this.__url = url;
    this.__filename = filename;
    this.__mimetype = mimetype;
    this.__size = size;
    this.__expanded = expanded;
    this.__editing = editing;
  }

  exportJSON(): SerializedAttachmentNode {
    return {
      url: this.getUrl(),
      filename: this.getFilename(),
      mimetype: this.getMimetype(),
      size: this.getSize(),
      expanded: this.getExpanded(),
      editing: this.getEditing(),
      type: "attachment",
      version: 1,
    };
  }

  getUrl(): string {
    return this.__url;
  }

  getFilename(): string {
    return this.__filename;
  }

  getMimetype(): string {
    return this.__mimetype;
  }

  getSize(): number {
    return this.__size;
  }

  getExpanded(): boolean {
    return this.getLatest().__expanded;
  }

  setExpanded(expanded: boolean): void {
    const writable = this.getWritable();
    writable.__expanded = expanded;
  }

  toggleExpanded(): void {
    this.setExpanded(!this.getExpanded());
  }

  getEditing(): boolean {
    return this.getLatest().__editing;
  }

  setEditing(editing: boolean): void {
    const writable = this.getWritable();
    writable.__editing = editing;
  }

  update(payload: Partial<AttachmentPayload>): void {
    const writable = this.getWritable();
    if (payload.url !== undefined) writable.__url = payload.url;
    if (payload.filename !== undefined) writable.__filename = payload.filename;
    if (payload.mimetype !== undefined) writable.__mimetype = payload.mimetype;
    if (payload.size !== undefined) writable.__size = payload.size;
    if (payload.expanded !== undefined) writable.__expanded = payload.expanded;
    if (payload.editing !== undefined) writable.__editing = payload.editing;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const theme = config.theme;
    const className = theme.attachment;
    if (className !== undefined) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <AttachmentComponent
        url={this.__url}
        filename={this.__filename}
        mimetype={this.__mimetype}
        size={this.__size}
        nodeKey={this.getKey()}
        expanded={this.__expanded}
        editing={this.__editing}
      />
    );
  }
}

export function $createAttachmentNode({
  url,
  filename,
  mimetype,
  size,
  key,
  expanded = false,
  editing = false,
}: AttachmentPayload): AttachmentNode {
  return new AttachmentNode(
    url,
    filename,
    mimetype,
    size,
    expanded,
    editing,
    key,
  );
}

export function $isAttachmentNode(
  node: LexicalNode | null | undefined,
): node is AttachmentNode {
  return node instanceof AttachmentNode;
}
