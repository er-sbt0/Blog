import { DOC_TOOLS, project } from "../agent.js";

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
    ).toEqual({ type: "assistant", text: "Adding it.", toolUses: ["mcp__doc__insert_blocks"] });
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

  it("defines insert_blocks and nothing else in phase 0", () => {
    expect(DOC_TOOLS).toEqual(["insert_blocks"]);
  });
});
