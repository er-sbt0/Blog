# Copilot Chat — Implementation Plan

Side-panel AI chat integrated with the Lexical editor. The AI can read the
document, answer questions, and make structural edits (insert tables, remove
nodes, rewrite paragraphs, etc.) by calling editor tools that execute directly
against the Lexical editor instance.

---

## Architecture Overview

```
┌──────────────────────────────┬────────────────────────┐
│  Lexical Editor (flex: 1)    │  CopilotPanel (320px)  │
│                              ├────────────────────────┤
│  [selected text highlighted] │  messages list         │
│                              │                        │
│                              │  ┌──────────────────┐  │
│                              │  │ Assistant message │  │
│                              │  │ [Apply] [Dismiss] │  │
│                              │  └──────────────────┘  │
│                              ├────────────────────────┤
│                              │  Quick actions chips   │
│                              │  [Ask anything...]  >  │
└──────────────────────────────┴────────────────────────┘
```

### How tool use works

The AI does not execute tools directly against the database or file system.
Tools are editor mutations defined on the client. The flow:

1. Client sends `{ messages, documentContext, documentTitle }` to `/api/copilot`
2. Server calls Claude (via AI SDK) with tool definitions in the request
3. Claude either responds with text, or calls one or more tools
4. Server-side tool calls are **collected**, not executed — the server responds
   to Claude with `{ success: true }` so Claude can continue its reply
5. Server streams back the assistant's final text response, and appends a
   `<tool-calls>` JSON block at the end of the stream
6. Client renders the streamed text, parses the tool calls, and shows an
   **Apply** button on the message
7. Clicking Apply runs the tool executors against `editorRef.current`

This keeps the Lexical mutations on the client where they belong, while letting
Claude plan and sequence multiple actions in a single turn.

---

## File Map

```
src/
├── app/api/copilot/
│   └── route.ts                        Stage 2 — new API route
│
├── editor/
│   ├── utils/
│   │   ├── serializeForCopilot.ts      Stage 1 — doc serializer
│   │   └── copilotToolExecutors.ts     Stage 4 — Lexical mutations
│   └── plugins/
│       └── CopilotPlugin/              Stage 4 — editor-side bridge
│           └── index.tsx
│
├── components/
│   └── CopilotPanel/                   Stages 5–6 — UI
│       ├── CopilotPanel.tsx            panel shell + layout
│       ├── CopilotChat.tsx             message list + input
│       ├── CopilotMessage.tsx          single message + Apply
│       └── QuickActions.tsx            chip shortcuts
│
└── store/
    └── app.ts                          Stage 3 — Redux copilot slice
```

Existing files modified:

| File | Change |
|---|---|
| `src/components/EditDocument/TabbedDocumentEditor.tsx` | Add split layout, track active editorRef |
| `src/components/EditDocument/EditorTabPanel.tsx` | Expose editorRef via callback prop |
| `src/editor/plugins/ToolbarPlugin/index.tsx` | Add copilot toggle button |
| `src/store/app.ts` | Add `ui.copilot` state |
| `src/lib/ai/prompts.ts` | Add copilot system prompt |

---

## Stage 1 — Document Serializer

**Goal:** Produce an annotated XML representation of the Lexical document that
Claude can read and reference. Every node that the AI may need to act on carries
a `key` attribute so it can be targeted by a tool call.

**New file:** `src/editor/utils/serializeForCopilot.ts`

```ts
import { $getRoot, LexicalEditor } from "lexical";
// ... node type imports

export function serializeForCopilot(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    return serializeNode(root);
  });
}
```

### Node serialization rules

Each node emits an XML element. The `key` attribute is always included.
Text content is inlined. Custom nodes get a self-closing tag with their
relevant attributes.

| Lexical node | XML output |
|---|---|
| HeadingNode (h1–h6) | `<heading level="2" key="k1">text</heading>` |
| ParagraphNode | `<paragraph key="k2">text</paragraph>` |
| QuoteNode | `<quote key="k3">text</quote>` |
| ListNode (bullet) | `<list type="bullet" key="k4"><item>…</item></list>` |
| ListNode (numbered) | `<list type="numbered" key="k5">…</list>` |
| HorizontalRuleNode | `<hr key="k6" />` |
| ImageNode | `<image key="k7" src="…" alt="…" />` |
| TableNode | `<table key="k8" rows="3" cols="4">markdown table</table>` |
| CodeNode | `<code key="k9" language="ts">…</code>` |
| MathNode | `<math key="k10" latex="\int x dx" />` |
| GraphNode | `<graph key="k11" title="…" />` |
| SketchNode | `<sketch key="k12" />` |
| AttachmentNode | `<attachment key="k13" name="…" />` |
| IFrameNode | `<iframe key="k14" src="…" />` |
| KanbanNode | `<kanban key="k15" />` |
| DetailsNode | `<details key="k16" summary="…">content</details>` |

Inline formatting (bold, italic, underline) is omitted — the AI does not need
it to make structural edits. Plain text content is sufficient.

The serialized output is kept under ~3000 tokens. If the document exceeds this,
truncate body paragraphs to their first sentence and note `[truncated]`.

---

## Stage 2 — API Route

**Goal:** An endpoint that accepts the chat thread plus document context, runs
the Claude tool-use agentic loop server-side, and streams back the final text
along with collected tool calls.

**New file:** `src/app/api/copilot/route.ts`

```ts
export const runtime = "edge";
export const POST = withApiHandler(async (req: Request) => { ... });
```

### Request body

```ts
{
  messages: { role: "user" | "assistant"; content: string }[];
  documentTitle: string;
  documentContext: string;   // output of serializeForCopilot()
  selectedText?: string;     // if user has a selection active
  provider: AIProviderType;
  model: string;
}
```

### Tool definitions passed to Claude

Defined as Vercel AI SDK `tools` objects. Each has a `description` and
`parameters` (Zod schema).

```ts
const editorTools = {
  remove_node: {
    description: "Remove a node (image, table, paragraph, heading, etc.)",
    parameters: z.object({ nodeKey: z.string() }),
  },
  insert_table: {
    description: "Insert a table at cursor or after a node",
    parameters: z.object({
      rows: z.number(),
      cols: z.number(),
      headers: z.array(z.string()).optional(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_heading: {
    description: "Insert a heading",
    parameters: z.object({
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
      text: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_list: {
    description: "Insert a bullet or numbered list",
    parameters: z.object({
      type: z.enum(["bullet", "numbered"]),
      items: z.array(z.string()),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_code_block: {
    description: "Insert a code block",
    parameters: z.object({
      language: z.string(),
      code: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_math: {
    description: "Insert a math equation",
    parameters: z.object({
      latex: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_horizontal_rule: {
    description: "Insert a horizontal divider",
    parameters: z.object({ afterNodeKey: z.string().optional() }),
  },
  replace_text: {
    description: "Replace the text content of a paragraph or heading node",
    parameters: z.object({ nodeKey: z.string(), newText: z.string() }),
  },
  replace_selection: {
    description: "Replace the currently selected text with new content",
    parameters: z.object({ newText: z.string() }),
  },
};
```

### Agentic loop

Use AI SDK `streamText` with `maxSteps: 5` (prevents infinite loops). The SDK
handles the agentic loop automatically — when Claude calls a tool, the SDK calls
our `execute` function, waits for the result, and passes it back to Claude for
the next step.

Since the actual execution happens on the client, the server-side `execute`
functions are stubs that return a confirmation string. The real goal is to
collect the tool calls so they can be sent to the client.

```ts
const collectedActions: EditorAction[] = [];

const result = streamText({
  model: modelInstance,
  messages: buildMessages(body),
  tools: Object.fromEntries(
    Object.entries(editorTools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (params) => {
          collectedActions.push({ type: name, params });
          return { success: true };
        },
      },
    ])
  ),
  maxSteps: 5,
});
```

### Response format

Stream the text response normally. After the text stream ends, append a
sentinel line with the serialized tool calls:

```
\n\n__COPILOT_ACTIONS__:{"actions":[{"type":"insert_table","params":{...}}]}
```

The client strips this line from the displayed message and parses it separately.
This avoids a second round-trip or a custom streaming protocol.

### System prompt

Add to `src/lib/ai/prompts.ts`:

```ts
export const COPILOT_SYSTEM_PROMPT = (title: string, context: string, selection?: string) =>
  `You are a writing assistant embedded in a blog editor. ` +
  `The user is editing a document titled "${title}". ` +
  `\n\nDocument structure:\n${context}` +
  (selection ? `\n\nThe user currently has selected: "${selection}"` : "") +
  `\n\nWhen the user asks you to make an edit, use the available tools to do so. ` +
  `After calling tools, confirm briefly what you did. ` +
  `When answering questions, respond concisely without calling tools.`;
```

---

## Stage 3 — Redux State

**Goal:** Track panel open/closed state and per-document message threads in the
existing Redux slice.

### Types to add in `src/types.ts`

```ts
export type CopilotAction = {
  type: string;
  params: Record<string, unknown>;
};

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: CopilotAction[];   // present on assistant messages after Apply is available
  applied?: boolean;           // true once Apply has been clicked
  timestamp: number;
};

export type CopilotThread = {
  messages: CopilotMessage[];
};
```

### Additions to `AppState.ui` in `src/store/app.ts`

```ts
ui: {
  // ... existing fields
  copilot: {
    open: boolean;
    threads: Record<string, CopilotThread>;  // keyed by documentId
  };
}
```

Initial state:

```ts
copilot: {
  open: false,
  threads: {},
}
```

### Reducers to add

```ts
setCopilotOpen(state, action: PayloadAction<boolean>)
addCopilotMessage(state, action: PayloadAction<{ documentId: string; message: CopilotMessage }>)
updateCopilotMessage(state, action: PayloadAction<{ documentId: string; messageId: string; patch: Partial<CopilotMessage> }>)
clearCopilotThread(state, action: PayloadAction<string>)   // by documentId
```

No persistence — threads live in-memory only. They reset on page refresh.
Per-document threads survive tab switches within the same session.

---

## Stage 4 — Tool Executors

**Goal:** Client-side functions that translate each `CopilotAction` into a
Lexical `editor.update()` call.

**New file:** `src/editor/utils/copilotToolExecutors.ts`

All executors take `(editor: LexicalEditor, params: unknown)` and return
`void`. They are synchronous wrappers around `editor.update()`.

### Executor implementations

```ts
import {
  $getNodeByKey, $getRoot, $getSelection, $isRangeSelection,
  $createParagraphNode, $createTextNode, $insertNodes, LexicalEditor,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $createListNode, $createListItemNode } from "@lexical/list";
import { $createCodeNode } from "@lexical/code";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $createHorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { $createMathNode } from "@/editor/nodes/MathNode";
```

**`remove_node`**
```ts
editor.update(() => {
  const node = $getNodeByKey(params.nodeKey);
  node?.remove();
});
```

**`replace_text`**
```ts
editor.update(() => {
  const node = $getNodeByKey(params.nodeKey);
  if (!node) return;
  const para = $createParagraphNode();
  para.append($createTextNode(params.newText));
  node.replace(para);
});
```

**`replace_selection`**
```ts
editor.update(() => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  selection.insertText(params.newText);
});
```

**`insert_table`**
```ts
editor.update(() => {
  const table = $createTableNodeWithDimensions(
    params.rows, params.cols, params.headers?.length > 0
  );
  insertAfterNodeOrAtEnd(table, params.afterNodeKey);
});
```

**`insert_heading`**
```ts
editor.update(() => {
  const heading = $createHeadingNode(`h${params.level}`);
  heading.append($createTextNode(params.text));
  insertAfterNodeOrAtEnd(heading, params.afterNodeKey);
});
```

**`insert_list`**
```ts
editor.update(() => {
  const list = $createListNode(params.type === "bullet" ? "bullet" : "number");
  for (const item of params.items) {
    const li = $createListItemNode();
    li.append($createTextNode(item));
    list.append(li);
  }
  insertAfterNodeOrAtEnd(list, params.afterNodeKey);
});
```

**`insert_code_block`**
```ts
editor.update(() => {
  const code = $createCodeNode(params.language);
  code.append($createTextNode(params.code));
  insertAfterNodeOrAtEnd(code, params.afterNodeKey);
});
```

**`insert_math`**
```ts
editor.update(() => {
  const math = $createMathNode(params.latex, false);
  const para = $createParagraphNode();
  para.append(math);
  insertAfterNodeOrAtEnd(para, params.afterNodeKey);
});
```

**`insert_horizontal_rule`**
```ts
editor.update(() => {
  const hr = $createHorizontalRuleNode();
  insertAfterNodeOrAtEnd(hr, params.afterNodeKey);
});
```

**Helper:**
```ts
function insertAfterNodeOrAtEnd(node: LexicalNode, afterNodeKey?: string) {
  if (afterNodeKey) {
    const anchor = $getNodeByKey(afterNodeKey);
    anchor?.insertAfter(node);
  } else {
    $getRoot().append(node);
  }
}
```

**Dispatcher:** A single `applyActions` function iterates the action list and
calls the right executor:

```ts
export function applyActions(editor: LexicalEditor, actions: CopilotAction[]): void {
  for (const action of actions) {
    EXECUTORS[action.type]?.(editor, action.params);
  }
}
```

---

## Stage 5 — Panel Shell and Layout

**Goal:** Add the Copilot panel to the editor layout and wire the toggle button.

### Layout change in `TabbedDocumentEditor`

The current layout is a flex column. When `ui.copilot.open` is true, wrap the
tab panels in a flex row so the copilot panel sits to the right.

```tsx
// TabbedDocumentEditor.tsx
const copilotOpen = useSelector((state) => state.ui.copilot.open);
const [activeEditorRef, setActiveEditorRef] =
  useState<React.RefObject<LexicalEditor | null>>(() => ({ current: null }));

// Pass the active editorRef up from EditorTabPanel
const handleEditorReady = useCallback(
  (ref: React.RefObject<LexicalEditor | null>) => {
    setActiveEditorRef(ref);
  },
  []
);

return (
  <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
    <EditorTabBar ... />

    <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Tab panels */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        {tabs.tabIds.map((tabId) => (
          <EditorTabPanel
            key={tabId}
            ...
            isActive={tabId === tabs.activeTabId}
            onEditorReady={tabId === tabs.activeTabId ? handleEditorReady : undefined}
          />
        ))}
      </Box>

      {/* Copilot panel */}
      {copilotOpen && (
        <CopilotPanel
          documentId={tabs.activeTabId ?? ""}
          editorRef={activeEditorRef}
        />
      )}
    </Box>

    {/* dialogs unchanged */}
  </Box>
);
```

### Change in `EditorTabPanel`

Add `onEditorReady` prop. Call it when the editor ref is populated:

```tsx
interface EditorTabPanelProps {
  ...
  onEditorReady?: (ref: React.RefObject<LexicalEditor | null>) => void;
}

// Inside the component, after editorRef is defined:
useEffect(() => {
  if (isActive) onEditorReady?.(editorRef);
}, [isActive, onEditorReady]);
```

### Toggle button in `ToolbarPlugin`

Add a `SmartToyOutlined` (or `AutoAwesome`) icon button at the far right of
the toolbar. Dispatches `actions.setCopilotOpen(!copilotOpen)`.

```tsx
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";

// In toolbar JSX, right-aligned:
<Tooltip title="Copilot">
  <IconButton
    size="small"
    color={copilotOpen ? "primary" : "default"}
    onClick={() => dispatch(actions.setCopilotOpen(!copilotOpen))}
  >
    <SmartToyOutlinedIcon fontSize="small" />
  </IconButton>
</Tooltip>
```

### `CopilotPanel` component

`src/components/CopilotPanel/CopilotPanel.tsx`

A fixed-width Box (not a MUI Drawer — a Drawer would overlay content; we want
the editor to shrink). Use `borderLeft: 1, borderColor: "divider"`.

```tsx
<Box
  sx={{
    width: 320,
    flexShrink: 0,
    borderLeft: 1,
    borderColor: "divider",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    bgcolor: "background.paper",
  }}
>
  {/* Header */}
  <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider",
             display: "flex", alignItems: "center", gap: 1 }}>
    <SmartToyOutlinedIcon fontSize="small" color="primary" />
    <Typography variant="subtitle2" sx={{ flex: 1 }}>Copilot</Typography>
    <IconButton size="small" onClick={() => dispatch(actions.setCopilotOpen(false))}>
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>

  {/* Chat */}
  <CopilotChat documentId={documentId} editorRef={editorRef} />
</Box>
```

---

## Stage 6 — Chat UI

### `CopilotChat` component

`src/components/CopilotPanel/CopilotChat.tsx`

Owns the input state and streaming logic. Reads messages from Redux.

**Props:**
```ts
{
  documentId: string;
  editorRef: React.RefObject<LexicalEditor | null>;
}
```

**Layout:**
```
flex column, full height
├── QuickActions (fixed top, shown only when thread is empty)
├── message list (flex: 1, overflow-y: auto)
└── input row (fixed bottom)
```

**Sending a message:**

```ts
const handleSend = async (text: string) => {
  // 1. Capture selection from editor before async gap
  const selectedText = editorRef.current?.getEditorState().read(() => {
    const sel = $getSelection();
    return $isRangeSelection(sel) ? sel.getTextContent() : undefined;
  });

  // 2. Serialize the current document
  const documentContext = editorRef.current
    ? serializeForCopilot(editorRef.current)
    : "";

  // 3. Add user message to Redux
  const userMessage: CopilotMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: text,
    timestamp: Date.now(),
  };
  dispatch(actions.addCopilotMessage({ documentId, message: userMessage }));

  // 4. Add a streaming placeholder for the assistant
  const assistantId = crypto.randomUUID();
  dispatch(actions.addCopilotMessage({
    documentId,
    message: { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
  }));

  // 5. Call /api/copilot and stream into the placeholder
  const response = await fetch("/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [...priorMessages, userMessage],
      documentTitle,
      documentContext,
      selectedText,
      provider,
      model: modelId,
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });

    // Strip the actions sentinel before displaying
    const displayText = full.split("\n\n__COPILOT_ACTIONS__:")[0];
    dispatch(actions.updateCopilotMessage({
      documentId,
      messageId: assistantId,
      patch: { content: displayText },
    }));
  }

  // 6. Parse actions from sentinel
  const sentinelMatch = full.match(/__COPILOT_ACTIONS__:(.+)$/m);
  if (sentinelMatch) {
    const { actions: editorActions } = JSON.parse(sentinelMatch[1]);
    dispatch(actions.updateCopilotMessage({
      documentId,
      messageId: assistantId,
      patch: { actions: editorActions },
    }));
  }
};
```

**Input row:**
```tsx
<Box sx={{ p: 1, borderTop: 1, borderColor: "divider", display: "flex", gap: 1 }}>
  <TextField
    fullWidth
    size="small"
    placeholder="Ask anything…"
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }}}
    multiline
    maxRows={4}
    disabled={isStreaming}
  />
  <IconButton
    color="primary"
    onClick={() => handleSend(input)}
    disabled={!input.trim() || isStreaming}
  >
    <SendIcon fontSize="small" />
  </IconButton>
</Box>
```

### `CopilotMessage` component

`src/components/CopilotPanel/CopilotMessage.tsx`

Renders markdown (use the existing markdown renderer in the codebase if
available, otherwise a simple approach: wrap in `<Typography component="div">`
and split on newlines).

Apply button shown only when `message.actions?.length > 0 && !message.applied`:

```tsx
{message.actions?.length > 0 && !message.applied && (
  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
    <Button
      size="small"
      variant="contained"
      startIcon={<CheckIcon />}
      onClick={() => {
        applyActions(editorRef.current!, message.actions!);
        dispatch(actions.updateCopilotMessage({
          documentId,
          messageId: message.id,
          patch: { applied: true },
        }));
      }}
    >
      Apply
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={() =>
        dispatch(actions.updateCopilotMessage({
          documentId,
          messageId: message.id,
          patch: { actions: undefined },
        }))
      }
    >
      Dismiss
    </Button>
  </Box>
)}
```

After applying, replace the Apply/Dismiss row with a quiet confirmation chip:
```tsx
{message.applied && (
  <Chip size="small" icon={<CheckIcon />} label="Applied" color="success" variant="outlined" sx={{ mt: 1 }} />
)}
```

### `QuickActions` component

`src/components/CopilotPanel/QuickActions.tsx`

Row of Chip buttons shown when the thread is empty, to bootstrap common flows:

```tsx
const QUICK_ACTIONS = [
  { label: "Improve writing", prompt: "Improve the writing quality of this document." },
  { label: "Fix grammar",     prompt: "Fix any grammar and spelling mistakes." },
  { label: "Make shorter",    prompt: "Shorten this document while keeping all key information." },
  { label: "Add examples",    prompt: "Add concrete examples to illustrate the main points." },
  { label: "Summarize",       prompt: "Summarize this document in 3 bullet points." },
];

// Render as wrapping row of outlined Chips
```

---

## Stage 7 — Wire-Up Checklist

After all stages are implemented, verify the following end-to-end flows:

- [ ] Copilot toggle button appears in toolbar; clicking it opens/closes the panel
- [ ] Panel slides in and the editor shrinks (not overlapped)
- [ ] Sending a message shows the user bubble immediately
- [ ] Assistant response streams in token-by-token
- [ ] After a structural request (e.g. "add a table"), the Apply button appears
- [ ] Clicking Apply inserts the table in the Lexical editor
- [ ] Clicking Dismiss removes the Apply button but keeps the text
- [ ] Applied message shows the green "Applied" chip
- [ ] Switching tabs clears the active editorRef and loads the tab's thread
- [ ] Quick action chips pre-fill the input
- [ ] Selection is captured: select text → send message → AI references it
- [ ] Panel state survives tab switches within the same session

---

## Design Conventions

Follow DESIGN.md conventions throughout.

- Colors: use MUI palette tokens only (`primary.main`, `text.secondary`, etc.)
- Typography: `body2` for message text, `caption` for timestamps
- Spacing: `p: 1` (8px) / `p: 2` (16px) grid; no raw pixel values
- Panel width: 320px fixed (not responsive — collapse to closed state on narrow viewports rather than shrinking)
- User messages: right-aligned, `bgcolor: "primary.main"`, `color: "primary.contrastText"`, `borderRadius: 2`
- Assistant messages: left-aligned, `bgcolor: "action.hover"`, `borderRadius: 2`
- Loading state: `LinearProgress` at the top of the panel while streaming
- Empty state: centered `Typography color="text.secondary"` prompt to start chatting, with the quick actions below
- Accessibility: focus the input when the panel opens; trap focus within the panel when it is open

---

## Deferred / Out of Scope

These are reasonable next iterations, not required for the first version:

- **Multiple named threads per document** — single thread is fine initially
- **Thread persistence** — saving threads to IndexedDB or the database
- **Image insertion** — `insert_image` requires knowing a valid URL; leave for later
- **Graph/Sketch insertion** — these require separate creation UIs
- **Model selector in the panel** — reuse the global AI provider setting
- **Undo integration** — Lexical history already tracks mutations; Ctrl+Z works
  naturally after Apply
