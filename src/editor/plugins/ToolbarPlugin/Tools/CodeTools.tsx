"use client";
import {
  $getPreviousSelection,
  $getSelection,
  $setSelection,
  ElementFormatType,
  LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { MenuItem, Select, SelectChangeEvent, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { $isCodeNode, CodeNode as CustomCodeNode } from "@/editor/nodes/CodeNode";
import { $patchStyle } from "@/editor/nodes/utils";
import {
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
} from "@lexical/code";

function getCodeLanguageOptions(): [string, string][] {
  const options: [string, string][] = [];

  for (
    const [lang, friendlyName] of Object.entries(
      CODE_LANGUAGE_FRIENDLY_NAME_MAP,
    )
  ) {
    options.push([lang, friendlyName]);
  }

  options.splice(3, 0, ["csharp", "C#"]);
  options.push(["bash", "Bash"]);

  return options;
}

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

export default function CodeTools(
  { editor, node }: { editor: LexicalEditor; node: CustomCodeNode },
) {
  const [codeLanguage, setCodeLanguage] = useState<string>("");
  const [currentWidth, setCurrentWidth] = useState<string>("100%");

  const onCodeLanguageSelect = useCallback(
    (e: SelectChangeEvent) => {
      editor.update(() => {
        node.setLanguage((e.target as HTMLSelectElement).value);
      });
    },
    [editor, node],
  );

  const handleWidthChange = useCallback(
    (width: string) => {
      editor.update(() => {
        if ($isCodeNode(node)) {
          node.setWidth(width);
          setCurrentWidth(width);
        }
      });
    },
    [editor, node],
  );

  useEffect(() => {
    const language = editor.getEditorState().read(() =>
      node.getLanguage() as keyof typeof CODE_LANGUAGE_MAP
    );
    setCodeLanguage(
      language ? CODE_LANGUAGE_MAP[language] || language : "",
    );

    const width = editor.getEditorState().read(() => node.getWidth());
    setCurrentWidth(width || "100%");
  }, [node]);

  const handleClose = useCallback(() => {
    setTimeout(() => {
      editor.update(() => {
        const selection = $getSelection() || $getPreviousSelection();
        if (!selection) return;
        $setSelection(selection.clone());
      }, {
        discrete: true,
        onUpdate() {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        },
      });
    }, 0);
  }, [editor]);

  return (
    <>
      <Select
        size="small"
        onChange={onCodeLanguageSelect}
        value={codeLanguage}
        onClose={handleClose}
        sx={{
          fieldset: { borderColor: "divider" },
          "& .MuiSelect-select": {
            display: "flex !important",
            alignItems: "center",
            pl: 1,
            pr: "28px !important",
            py: 1,
            minHeight: "0 !important",
            height: "20px !important",
          },
          "& .MuiSelect-icon": { m: 0, fontSize: 20 },
          "& .MuiListItemIcon-root": { mr: { sm: 0.5 }, minWidth: 20 },
          "& .MuiListItemText-root": {
            display: { xs: "none", sm: "flex" },
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
          },
        }}
        MenuProps={{
          slotProps: {
            root: {
              sx: {
                "& .MuiBackdrop-root": { userSelect: "none" },
                "& .MuiMenuItem-root": { minHeight: 36 },
              },
            },
          },
        }}
      >
        {CODE_LANGUAGE_OPTIONS.map(([option, text]) => (
          <MenuItem key={option} value={option}>{text}</MenuItem>
        ))}
      </Select>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={currentWidth}
        sx={{ bgcolor: "background.default" }}
      >
        <ToggleButton
          value="25%"
          onClick={() => handleWidthChange("25%")}
        >
          25%
        </ToggleButton>
        <ToggleButton
          value="50%"
          onClick={() => handleWidthChange("50%")}
        >
          50%
        </ToggleButton>
        <ToggleButton
          value="75%"
          onClick={() => handleWidthChange("75%")}
        >
          75%
        </ToggleButton>
        <ToggleButton
          value="100%"
          onClick={() => handleWidthChange("100%")}
        >
          100%
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
}
