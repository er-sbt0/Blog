import {
  CodeNode as LexicalCodeNode,
  SerializedCodeNode,
} from "@lexical/code";
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical";

/**
 * Extended SerializedCodeNode with width property.
 */
export interface SerializedCodeNodeWithWidth extends SerializedCodeNode {
  width?: string; // e.g., "80%", "600px", "100%"
}

/**
 * Custom CodeNode that fixes line numbering for empty lines.
 *
 * The issue: Empty lines in code blocks render as consecutive <br> tags,
 * and CSS ::before pseudo-elements don't work on <br> elements (void elements).
 *
 * The fix: Inject <span>&nbsp;</span> elements for empty lines so they have
 * a proper element that can display line numbers via ::before.
 *
 * Also supports dynamic width adjustment via the __width property.
 */
export class CodeNode extends LexicalCodeNode {
  __width?: string;
  static getType(): string {
    return "code";
  }

  static clone(node: CodeNode): CodeNode {
    const clonedNode = new CodeNode(node.__language, node.__key);
    clonedNode.__width = node.__width;
    return clonedNode;
  }

  constructor(language?: string | null | undefined, key?: NodeKey) {
    super(language, key);
  }

  /**
   * Get the width of the code block.
   */
  getWidth(): string | undefined {
    const self = this.getLatest();
    return self.__width;
  }

  /**
   * Set the width of the code block.
   * @param width - Width value (e.g., "80%", "600px", "100%")
   */
  setWidth(width: string | undefined): void {
    const self = this.getWritable();
    self.__width = width;
  }

  /**
   * Override createDOM to apply width styling in the editor.
   */
  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    if (this.__width) {
      element.style.width = this.__width;
    }
    return element;
  }

  /**
   * Override updateDOM to update width styling when it changes.
   */
  updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const isUpdated = super.updateDOM(prevNode, dom, config);

    // Update width if it changed
    if (prevNode.__width !== this.__width) {
      if (this.__width) {
        dom.style.width = this.__width;
      } else {
        dom.style.width = "";
      }
    }

    return isUpdated;
  }

  /**
   * Process code block DOM to inject spans for empty lines.
   * Transforms: <br><br> → <br><span>&nbsp;</span><br>
   */
  private processCodeBlockDOM(element: HTMLElement): void {
    const children = Array.from(element.childNodes);

    for (let i = 0; i < children.length - 1; i++) {
      const current = children[i];
      const next = children[i + 1];

      // Look for consecutive <br> tags (empty line pattern)
      if (
        current.nodeName === "BR" &&
        next.nodeName === "BR"
      ) {
        // Insert a span with non-breaking space between them
        const span = document.createElement("span");
        span.innerHTML = "&nbsp;";
        element.insertBefore(span, next);

        // Skip the next element since we just processed it
        i++;
      }
    }
  }

  /**
   * Override exportDOM for clipboard/export operations.
   * Use the 'after' callback to process DOM after children are rendered.
   * Also applies the width style if set.
   */
  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor);

    return {
      ...output,
      after: (element) => {
        if (element instanceof HTMLElement) {
          this.processCodeBlockDOM(element);

          // Apply width if set
          if (this.__width) {
            element.style.width = this.__width;
          }

          return element;
        }
        // Call parent's after callback if it exists
        if (output.after) {
          return output.after(element);
        }
        return element as HTMLElement | Text | null | undefined;
      },
    };
  }

  /**
   * Import from serialized JSON.
   */
  static importJSON(serializedNode: SerializedCodeNodeWithWidth): CodeNode {
    const node = $createCodeNode(serializedNode.language);
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);

    // Restore width if present
    if (serializedNode.width) {
      node.setWidth(serializedNode.width);
    }

    return node;
  }

  /**
   * Export to serialized JSON.
   */
  exportJSON(): SerializedCodeNodeWithWidth {
    return {
      ...super.exportJSON(),
      width: this.__width,
    };
  }

  /**
   * Import from DOM (for paste operations).
   */
  static importDOM(): DOMConversionMap | null {
    return LexicalCodeNode.importDOM();
  }
}

/**
 * Helper function to create a CodeNode instance.
 */
export function $createCodeNode(
  language?: string | null | undefined
): CodeNode {
  return new CodeNode(language);
}

/**
 * Type guard to check if a node is a CodeNode.
 */
export function $isCodeNode(
  node: LexicalNode | null | undefined
): node is CodeNode {
  return node instanceof CodeNode;
}
