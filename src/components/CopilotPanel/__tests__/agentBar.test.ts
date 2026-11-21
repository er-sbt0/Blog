import {
  agentBarAvailability,
  promptProblem,
  sessionChipLabel,
  turnToStop,
  turnWaitingOnYou,
} from "../agentBar";

const a = { name: "editor a" };
const b = { name: "editor b" };
const turn = (
  editor: object,
  nodeKey: string,
  phase: "idle" | "running" | "waiting",
) => ({ editor, nodeKey, phase });

describe("agentBarAvailability", () => {
  it("waits for the host before anything else", () => {
    expect(agentBarAvailability("pending", "ready").state).toBe("loading");
    expect(agentBarAvailability("missing", "ready").state).toBe("disabled");
  });

  it("names why the post cannot take a prompt", () => {
    expect(agentBarAvailability("present", "loading")).toEqual({
      state: "loading",
      reason: "Opening the post…",
    });
    expect(agentBarAvailability("present", "none")).toEqual({ state: "pick" });
    expect(agentBarAvailability("present", "readonly")).toEqual({
      state: "disabled",
      reason: "This post is in read mode",
    });
    expect(agentBarAvailability("present", "ready")).toEqual({ state: "ready" });
  });
});

describe("turnToStop", () => {
  it("stops only a turn in the focused post", () => {
    const turns = [turn(b, "1", "running")];
    expect(turnToStop(turns, a, null)).toBeNull();
    expect(turnToStop(turns, null, null)).toBeNull();
    expect(turnToStop(turns, b, null)).toBe(turns[0]);
  });

  it("prefers the current session's node, and ignores idle ones", () => {
    const turns = [turn(a, "1", "running"), turn(a, "2", "waiting"), turn(a, "3", "idle")];
    expect(turnToStop(turns, a, "2")).toBe(turns[1]);
    expect(turnToStop(turns, a, "3")).toBe(turns[0]);
    expect(turnToStop([turns[2]], a, "3")).toBeNull();
  });
});

describe("turnWaitingOnYou", () => {
  it("finds a card in another post", () => {
    const turns = [turn(a, "1", "running"), turn(b, "9", "waiting")];
    expect(turnWaitingOnYou(turns, a)).toEqual({ turn: turns[1], here: false });
    expect(turnWaitingOnYou(turns, null)).toEqual({ turn: turns[1], here: false });
  });

  it("prefers this post's card", () => {
    const turns = [turn(b, "9", "waiting"), turn(a, "1", "waiting")];
    expect(turnWaitingOnYou(turns, a)).toEqual({ turn: turns[1], here: true });
  });

  it("is null when nothing waits", () => {
    expect(turnWaitingOnYou([turn(a, "1", "running")], a)).toBeNull();
  });
});

describe("sessionChipLabel", () => {
  it("says nothing for a post with no session", () => {
    expect(sessionChipLabel(null, false)).toBeNull();
  });

  it("counts turns", () => {
    expect(sessionChipLabel({ turns: 0 }, false)).toBe("session · not started");
    expect(sessionChipLabel({ turns: 1 }, false)).toBe("session · 1 turn");
    expect(sessionChipLabel({ turns: 4 }, false)).toBe("session · 4 turns");
  });

  it("shows an armed new session over the current one", () => {
    expect(sessionChipLabel({ turns: 4 }, true)).toBe("new session");
  });
});

describe("promptProblem", () => {
  it("measures the trimmed prompt", () => {
    expect(promptProblem("  abc  ", 3)).toBeNull();
    expect(promptProblem("abcd", 3)).toBe("4 characters — the limit is 3");
  });
});
