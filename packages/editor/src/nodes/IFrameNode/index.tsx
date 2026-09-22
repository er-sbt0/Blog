/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical";

import { JSX } from "react";
import { ImageNode, ImagePayload, SerializedImageNode } from "../ImageNode";
import type { ImageResizeUnit } from "../imageLayout";
import { $generateHtmlFromNodes } from "@lexical/html";
import ImageComponent from "../ImageNode/ImageComponent";

const YOUTUBE_SRC =
  /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;

/**
 * The schemes an embed may use. `javascript:` in a same-document iframe `src`
 * still executes in Chrome and Firefox, and `data:` frames inherit nothing but
 * are an opaque-origin script host — neither is an embeddable *document*, which
 * is the only thing this node is for.
 */
const EMBED_SCHEMES = new Set(["http:", "https:"]);

/**
 * The sandbox every embed is rendered under.
 *
 * `allow-scripts allow-same-origin` together is the pair usually called out as
 * weak, and the reason is that a *same-origin* framed document can then reach
 * out and remove its own sandbox. That is not this case: an embed is by
 * construction a foreign document — the YouTube branch below rewrites to
 * `youtube-nocookie.com`, and everything else is an absolute `http(s)` URL — so
 * `allow-same-origin` grants the frame its own origin, not this app's. It is
 * also not optional: a player denied its own origin cannot read its own
 * storage and renders an error instead of a video. `allow-popups` is the
 * "Watch on YouTube" link; `allow-presentation` is casting. Nothing here grants
 * top-level navigation, form submission, or downloads.
 */
const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-presentation";

/**
 * The URL an embed actually loads, or `null` when there isn't one.
 *
 * A non-conforming src renders **no iframe at all** rather than an iframe with
 * a neutered src: an empty frame is indistinguishable from a broken embed to a
 * reader, and leaving the element in place invites the next change to start
 * trusting its `src` attribute again.
 */
export function resolveEmbedSrc(src: string): string | null {
  const matchYoutube = YOUTUBE_SRC.exec(src);
  const videoId = matchYoutube?.[2].length === 11 ? matchYoutube[2] : null;
  if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
  try {
    const url = new URL(src);
    return EMBED_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function convertIFrameElement(
  domNode: HTMLElement,
): null | DOMConversionOutput {
  const src = domNode.getAttribute("data-lexical-iFrame");
  if (src) {
    const width = +(domNode.getAttribute("width") || "560");
    const height = +(domNode.getAttribute("height") || "315");
    const style = domNode.style.cssText;
    const altText = domNode.title;
    const id = domNode.id;
    const node = $createIFrameNode({
      src,
      width,
      height,
      style,
      id,
      altText,
    });
    return { node };
  }
  return null;
}

export type IFramePayload = ImagePayload;
export type SerializedIFrameNode = Spread<
  {
    type: "iframe";
    version: 1;
  },
  SerializedImageNode
>;

export class IFrameNode extends ImageNode {
  /**
   * Pixels, and this is the one of the three where percent is not merely the
   * wrong vocabulary but unrenderable.
   *
   * An `<iframe>` has **no intrinsic aspect ratio**. Its height is the `height`
   * attribute `exportDOM` writes, in pixels, so a figure narrowed to 50% would
   * letterbox a video inside a box of the original height rather than scale it.
   * Sizing an embed properly means an aspect-ratio box around the iframe, which
   * is a different change from this one — and it is the same finding
   * `ImageTools`' `canSetWidth` already acts on by withholding the percent
   * slider from an iframe entirely.
   */
  static override resizeUnit: ImageResizeUnit = "px";

  static getType(): string {
    return "iframe";
  }

  static clone(node: IFrameNode): IFrameNode {
    return new IFrameNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__style,
      node.__id,
      node.__showCaption,
      node.__caption,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedIFrameNode): IFrameNode {
    const { width, height, src, style, id, showCaption, caption, altText } =
      serializedNode;
    const node = $createIFrameNode({
      src,
      width,
      height,
      style,
      id,
      showCaption,
      altText,
    });
    try {
      if (caption) {
        const nestedEditor = node.__caption;
        const editorState = nestedEditor.parseEditorState(
          caption.editorState,
        );
        if (!editorState.isEmpty()) {
          nestedEditor.setEditorState(editorState);
        }
      }
    } catch (e) {
      console.error(e);
    }
    return node.updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedIFrameNode {
    return {
      ...super.exportJSON(),
      type: "iframe",
      version: 1,
    };
  }

  constructor(
    src: string,
    altText: string,
    width: number,
    height: number,
    style: string,
    id: string,
    showCaption?: boolean,
    caption?: LexicalEditor,
    key?: NodeKey,
  ) {
    super(
      src,
      altText,
      width,
      height,
      style,
      id,
      showCaption,
      caption,
      key,
    );
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const element = super.createDOM(editor._config, editor);
    if (!element) return { element };
    const src = resolveEmbedSrc(this.__src);
    if (!src) return { element };
    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-lexical-iFrame", this.__src);
    if (this.__width) iframe.setAttribute("width", this.__width.toString());
    if (this.__height) {
      iframe.setAttribute("height", this.__height.toString());
    }
    iframe.setAttribute("src", src);
    iframe.setAttribute("sandbox", EMBED_SANDBOX);
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
    );
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("title", this.__altText);
    element.appendChild(iframe);
    if (!this.__showCaption) return { element };
    const caption = document.createElement("figcaption");
    this.__caption.getEditorState().read(() => {
      caption.innerHTML = $generateHtmlFromNodes(this.__caption);
    });
    element.appendChild(caption);
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-iFrame")) {
          return null;
        }
        return {
          conversion: convertIFrameElement,
          priority: 1,
        };
      },
    };
  }

  getTextContent(
    _includeInert?: boolean | undefined,
    _includeDirectionless?: false | undefined,
  ): string {
    return this.__src;
  }

  decorate(): JSX.Element {
    const self = this.getLatest();
    // `about:blank` rather than the rejected src: the editor shows an empty
    // frame where the embed would be, which is what the published page shows
    // too, and nothing hands an unvalidated URL to a live iframe.
    const src = resolveEmbedSrc(self.__src) ?? "about:blank";

    return (
      <ImageComponent
        src={src}
        sandbox={EMBED_SANDBOX}
        altText={self.__altText}
        width={self.__width}
        height={self.__height}
        nodeKey={self.__key}
        showCaption={self.__showCaption}
        caption={self.__caption}
        element="iframe"
      />
    );
  }
}

export function $createIFrameNode(payload: IFramePayload): IFrameNode {
  const {
    src,
    altText = "iframe",
    width,
    height,
    style,
    id,
    showCaption,
    caption,
    key,
  } = payload;
  return new IFrameNode(
    src,
    altText,
    width,
    height,
    style,
    id,
    showCaption,
    caption,
    key,
  );
}

export function $isIFrameNode(
  node: IFrameNode | LexicalNode | null | undefined,
): node is IFrameNode {
  return node instanceof IFrameNode;
}
