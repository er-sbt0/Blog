import {
  agentEnv,
  buildSystemPrompt,
  describeToolCall,
  DOC_TOOLS,
  project,
  sanitizeContext,
} from "../agentProtocol.js";

/**
 * The renderer's contract with an agent session (docs/plans/agent-block.md
 * §4.3): a narrow projection of the SDK's stream, never the stream itself. The
 * SDK adds message types often, and anything passed through unprojected would
 * make the block's contract whatever this SDK version happens to emit.
 */
describe("project", () => {
  it("keeps what an init says about auth and tools", () => {
    expect(
      project({
        type: "system",
        subtype: "init",
        model: "m",
        apiKeySource: "none",
        claude_code_version: "2.1.309",
        tools: ["mcp__doc__insert_blocks"],
        session_id: "s",
      }),
    ).toEqual({
      type: "init",
      model: "m",
      apiKeySource: "none",
      claudeCodeVersion: "2.1.309",
      tools: ["mcp__doc__insert_blocks"],
    });
  });

  it("reduces an assistant message to text and tool names", () => {
    expect(
      project({
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          content: [
            { type: "text", text: "Adding it." },
            { type: "tool_use", name: "mcp__doc__insert_blocks", input: { secret: 1 } },
          ],
        },
      }),
    ).toEqual({
      type: "assistant",
      text: "Adding it.",
      toolUses: ["mcp__doc__insert_blocks"],
      // A name and a one-line description, never the input itself.
      toolCalls: [{ name: "mcp__doc__insert_blocks", detail: "" }],
    });
  });

  it("drops subagent frames, other system messages and unknown types", () => {
    expect(project({ type: "assistant", parent_tool_use_id: "t", message: { content: [] } })).toBeNull();
    expect(project({ type: "system", subtype: "status" })).toBeNull();
    expect(project({ type: "stream_event" })).toBeNull();
    expect(project(undefined)).toBeNull();
  });

  it("projects a result", () => {
    expect(
      project({ type: "result", subtype: "success", is_error: false, num_turns: 2, total_cost_usd: 0.01 }),
    ).toEqual({ type: "result", subtype: "success", isError: false, turns: 2, costUsd: 0.01 });
  });

  it("projects tool results, keeping only whether they failed and a preview", () => {
    expect(
      project({
        type: "user",
        parent_tool_use_id: null,
        message: {
          content: [
            { type: "tool_result", tool_use_id: "a", content: [{ type: "text", text: "ok" }] },
            { type: "tool_result", tool_use_id: "b", is_error: true, content: "stale: re-read" },
          ],
        },
      }),
    ).toEqual({ type: "tool-result", isError: true, preview: "stale: re-read" });
    // The echoed prompt is a user message too, and is not news.
    expect(project({ type: "user", parent_tool_use_id: null, message: { content: "hi" } })).toBeNull();
  });

  it("defines the text doc tools (phase 1) plus math and image (phase 3)", () => {
    expect(DOC_TOOLS).toEqual([
      "outline",
      "read_blocks",
      "apply_ops",
      "insert_math",
      "insert_image",
    ]);
  });
});

describe("describeToolCall", () => {
  it("names what an op batch does without carrying its blocks", () => {
    expect(
      describeToolCall("mcp__doc__apply_ops", {
        stateHash: "h",
        ops: [
          { op: "insert_blocks", blocks: [{ type: "paragraph", text: "secret" }] },
          { op: "insert_blocks", blocks: [] },
          { op: "set_text", id: "b1", text: "secret" },
        ],
      }),
    ).toBe("insert_blocks ×2, set_text");
    expect(describeToolCall("mcp__doc__read_blocks", { blocks: ["b1", "blk_x"] })).toBe("b1, blk_x");
    expect(describeToolCall("mcp__doc__outline", {})).toBe("");
  });

  it("names an equation by its LaTeX and a picture by its source", () => {
    expect(describeToolCall("mcp__doc__insert_math", { latex: "x^2" })).toBe("x^2");
    expect(describeToolCall("mcp__doc__insert_math", { latex: "y", inline: true })).toBe("inline y");
    expect(describeToolCall("mcp__doc__insert_image", { path: "out/plot.png", alt: "" }))
      .toBe("out/plot.png");
    expect(describeToolCall("mcp__doc__insert_image", { url: "https://x/y.png" }))
      .toBe("https://x/y.png");
  });
});

/**
 * §4.5's prompt, built in main from text the renderer sends. The renderer is
 * the less trusted side (it displays stored SVG under `--no-sandbox`), so the
 * context is coerced and capped here rather than believed.
 */
describe("the system prompt", () => {
  it("names the post, the block and the rules, then the outline", () => {
    const prompt = buildSystemPrompt({
      title: "On   tides",
      blockId: "blk_abc12",
      outline: "stateHash: h_1\n\nb1 paragraph Hello",
      selection: { kind: "text", text: "moon", ids: ["b1"] },
    });
    expect(prompt).toContain('"On tides"');
    expect(prompt).toContain("blk_abc12");
    expect(prompt).toContain("prefer them over replying");
    expect(prompt).toContain('"text":"moon"');
    expect(prompt.indexOf("stateHash: h_1")).toBeGreaterThan(prompt.indexOf("blk_abc12"));
  });

  it("drops what is not text of the expected shape, and caps what is", () => {
    const context = sanitizeContext({
      title: { toString: () => "x" },
      blockId: "blk_x; rm -rf /",
      outline: "y".repeat(100_000),
      selection: "not an object",
    });
    expect(context.title).toBe("");
    expect(context.blockId).toBe("");
    expect(context.outline.length).toBeLessThanOrEqual(24_000);
    expect(context.selection).toBe("");
    expect(buildSystemPrompt(undefined)).toContain('"Untitled"');
  });
});

describe("agentEnv", () => {
  it("keeps the terminal's open environment but drops ANTHROPIC_API_KEY", () => {
    const env = agentEnv(
      { ANTHROPIC_API_KEY: "sk-from-a-dotenv", SSH_AUTH_SOCK: "/s", ELECTRON_RUN_AS_NODE: "1", PATH: "/usr/bin" },
      "/home/me",
    );
    // The SDK child must use the author's Claude Code login, not a key that
    // happened to be in the launching shell (docs/plans/agent-block.md phase 2).
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBe("/s");
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.PATH).toContain("/home/me/.local/bin");
  });
});

describe("describeToolCall for built-in tools", () => {
  it("names the command or the file, never the payload", () => {
    expect(describeToolCall("Bash", { command: "npm test", description: "x" })).toBe("npm test");
    expect(describeToolCall("Write", { file_path: "/p/a.md", content: "secret" })).toBe("/p/a.md");
  });
});
