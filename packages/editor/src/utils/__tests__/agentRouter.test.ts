import type { LexicalEditor } from "lexical";
import type { AgentToolTarget } from "@/editor/context/AgentHostContext";
import { createAgentRouter, NOT_OPEN } from "../agentRouter";

/**
 * Routing a doc-tool call (docs/plans/agent-block.md §7, phase-0 note 3): to
 * the editor holding the call's own block, never to whichever one is focused,
 * and to nothing at all when that post is not open.
 */

const target = (name: string): AgentToolTarget => ({
  editor: { name } as unknown as LexicalEditor,
  blockKey: `${name}-key`,
});

describe("the agent router", () => {
  it("sends each session's calls to the editor that attached it", () => {
    const seen: string[] = [];
    const router = createAgentRouter((t, name) => {
      seen.push(`${(t.editor as unknown as { name: string }).name}:${name}`);
      return { ok: true, text: "" };
    });
    router.attach("s1", target("left"));
    router.attach("s2", target("right"));
    router.handle({ sessionId: "s2", name: "outline", input: {} });
    router.handle({ sessionId: "s1", name: "apply_ops", input: {} });
    expect(seen).toEqual(["right:outline", "left:apply_ops"]);
  });

  it("answers an error, and runs nothing, for a session no open post holds", () => {
    let ran = false;
    const router = createAgentRouter(() => {
      ran = true;
      return { ok: true, text: "" };
    });
    const detach = router.attach("s1", target("left"));
    detach();
    expect(router.handle({ sessionId: "s1", name: "outline", input: {} })).toEqual({
      ok: false,
      error: NOT_OPEN,
    });
    expect(router.handle({ sessionId: "nobody", name: "outline", input: {} }).ok).toBe(false);
    expect(ran).toBe(false);
  });

  it("does not let a stale detach remove a newer attachment", () => {
    const router = createAgentRouter(() => ({ ok: true, text: "ran" }));
    const first = router.attach("s1", target("old"));
    router.attach("s1", target("new"));
    first();
    expect(router.handle({ sessionId: "s1", name: "outline", input: {} }).ok).toBe(true);
  });

  it("turns an executor that throws into a tool error", () => {
    const router = createAgentRouter(() => {
      throw new Error("kaboom");
    });
    router.attach("s1", target("left"));
    expect(router.handle({ sessionId: "s1", name: "outline", input: {} })).toEqual({
      ok: false,
      error: "kaboom",
    });
  });
});
