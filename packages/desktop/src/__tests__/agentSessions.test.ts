import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSessionStore, isSessionId, MAX_REMEMBERED } from "../agentSessions.js";

/**
 * Main's record of which folder each agent session runs in
 * (docs/plans/agent-block.md §4.3). It is what lets a reopened post resume
 * without the renderer naming a path — so the claims are about refusing what
 * did not come from main: a non-id, a relative path, a corrupt file.
 */

const ID = "0b6c1f0e-4d4e-4f7a-9d55-3a1c2b9e8f10";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sessions-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the agent session store", () => {
  it("remembers a folder by session id and reads it back", () => {
    const store = createSessionStore(path.join(dir, "s.json"));
    expect(store.lookup(ID)).toBeNull();
    store.remember(ID, "/home/me/project");
    expect(store.lookup(ID)).toBe("/home/me/project");
    expect(createSessionStore(path.join(dir, "s.json")).lookup(ID)).toBe("/home/me/project");
  });

  it("refuses ids main did not mint and paths that are not absolute", () => {
    const store = createSessionStore(path.join(dir, "s.json"));
    store.remember("../../etc", "/tmp");
    store.remember(ID, "relative/dir");
    expect(store.lookup("../../etc")).toBeNull();
    expect(store.lookup(ID)).toBeNull();
    expect(isSessionId(ID)).toBe(true);
    expect(isSessionId(ID.toUpperCase())).toBe(false);
  });

  it("reads a corrupt file as empty rather than throwing", () => {
    const file = path.join(dir, "s.json");
    fs.writeFileSync(file, "{ not json");
    const store = createSessionStore(file);
    expect(store.lookup(ID)).toBeNull();
    store.remember(ID, "/x");
    expect(store.lookup(ID)).toBe("/x");
  });

  it("keeps the newest sessions past the cap", () => {
    let clock = 0;
    const store = createSessionStore(path.join(dir, "s.json"), { now: () => ++clock });
    const ids = Array.from({ length: MAX_REMEMBERED + 1 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    for (const id of ids) store.remember(id, "/x");
    expect(store.lookup(ids[0])).toBeNull();
    expect(store.lookup(ids[ids.length - 1])).toBe("/x");
  });
});
