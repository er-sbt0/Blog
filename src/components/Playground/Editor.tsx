"use client";
import { useEffect, useState } from "react";
import { PropsWithChildren } from "react";
import { EditorDocument } from "@/types";
import Editor from "../Editor";

const PlaygroundEditor: React.FC<PropsWithChildren> = (
  { children: _children },
) => {
  const [document, setDocument] = useState<EditorDocument | null>(null);

  useEffect(() => {
    fetch("/data/playground.json")
      .then((res) => res.json())
      .then((data: EditorDocument) => setDocument(data));
  }, []);

  if (!document) return null;

  return <Editor document={document} />;
};

export default PlaygroundEditor;
