"use client";
import { useCallback, useState } from "react";
import { actions, useDispatch } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { v4 as uuidv4 } from "uuid";
import type { SerializedEditorState } from "lexical";

export function useCreateReadme() {
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createReadme = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      const headId = uuidv4();

      const defaultData = {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: "Welcome to my blog",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "heading",
              version: 1,
              tag: "h1",
            },
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: "This is the README for this workspace. Click to edit.",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      };

      const result = await dispatch(
        actions.createCloudDocument({
          id,
          name: "README",
          description: "Welcome to my blog",
          type: "DOCUMENT" as const,
          head: headId,
          data: defaultData as unknown as SerializedEditorState,
          createdAt: now,
          updatedAt: now,
          published: true,
          collab: false,
          private: false,
        }),
      );

      if (actions.createCloudDocument.rejected.match(result)) {
        const payload = result.payload as
          | { title?: string; subtitle?: string }
          | undefined;
        const errorMessage = payload?.subtitle || payload?.title ||
          "Failed to create README";
        setError(errorMessage);
      }
    } catch (err) {
      setError("Network error - please try again");
      errorAnnounce("Failed to create README:", err);
    } finally {
      setCreating(false);
    }
  }, [dispatch, errorAnnounce]);

  return { creating, error, createReadme };
}
