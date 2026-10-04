import {
  HEAD_BYTES,
  SSH_HOST_RE,
  consumableLength,
  diffManifest,
  isValidRemotePath,
  parentPathOf,
  planIngest,
  type StoredFile,
} from "../sync";

/** docs/plans/remote-claude.md §4.2, §4.3. */

const stored = (o: Partial<StoredFile> & { path: string }): StoredFile => ({
  size: 100,
  mtime: 1,
  consumed: 100,
  gone: false,
  ...o,
});

describe("diffManifest", () => {
  it("wants all of an unknown file, the new tail of a grown one, and nothing of an unchanged one", () => {
    const plan = diffManifest(
      [stored({ path: "p/a.jsonl" }), stored({ path: "p/b.jsonl", consumed: 90 })],
      [
        { path: "p/a.jsonl", size: 100, mtime: 1 },
        { path: "p/b.jsonl", size: 150, mtime: 2 },
        { path: "p/c.jsonl", size: 10, mtime: 2 },
      ],
    );
    expect(plan.wanted).toEqual([
      { path: "p/b.jsonl", from: 90, to: 150 },
      { path: "p/c.jsonl", from: 0, to: 10 },
    ]);
    expect(plan.reset).toEqual([]);
  });

  it("resets a file that shrank", () => {
    const plan = diffManifest([stored({ path: "p/a.jsonl" })], [{ path: "p/a.jsonl", size: 40, mtime: 2 }]);
    expect(plan.reset).toEqual(["p/a.jsonl"]);
    expect(plan.wanted).toEqual([{ path: "p/a.jsonl", from: 0, to: 40 }]);
  });

  it("probes a same-size file with a new mtime, since only the head hash can tell", () => {
    const plan = diffManifest([stored({ path: "p/a.jsonl" })], [{ path: "p/a.jsonl", size: 100, mtime: 9 }]);
    expect(plan.wanted).toEqual([{ path: "p/a.jsonl", from: 100, to: 100 }]);
  });

  it("marks a vanished file gone once, and un-marks it when it returns", () => {
    const plan = diffManifest(
      [stored({ path: "p/a.jsonl" }), stored({ path: "p/b.jsonl", gone: true }), stored({ path: "p/c.jsonl", gone: true })],
      [{ path: "p/c.jsonl", size: 100, mtime: 1 }],
    );
    expect(plan.gone).toEqual(["p/a.jsonl"]);
    expect(plan.returned).toEqual(["p/c.jsonl"]);
  });

  it("drops listed paths the read script would refuse", () => {
    const plan = diffManifest([], [
      { path: "../x.jsonl", size: 1, mtime: 1 },
      { path: "/etc/a.jsonl", size: 1, mtime: 1 },
      { path: "p/a.txt", size: 1, mtime: 1 },
      { path: "p/a b.jsonl", size: 1, mtime: 1 },
      { path: "-home-dev-llvm/52170a2f.jsonl", size: 1, mtime: 1 },
    ]);
    expect(plan.wanted.map((w) => w.path)).toEqual(["-home-dev-llvm/52170a2f.jsonl"]);
  });
});

describe("planIngest", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it("stores only through the last newline", () => {
    expect(planIngest(null, { from: 0, data: bytes('{"a":1}\n{"b":') }, false)).toEqual({ action: "append", keep: 8 });
    expect(planIngest(null, { from: 0, data: bytes('{"b":') }, false)).toEqual({ action: "append", keep: 0 });
  });

  it("refuses a range that does not start where storage ends", () => {
    expect(planIngest({ consumed: 10 }, { from: 20, data: bytes("x\n") }, true)).toEqual({ action: "stale" });
    expect(planIngest(null, { from: 5, data: bytes("x\n") }, true)).toEqual({ action: "stale" });
  });

  it("resets when the stored prefix no longer matches the remote", () => {
    expect(planIngest({ consumed: 10 }, { from: 10, data: bytes("x\n") }, false)).toEqual({ action: "reset" });
    expect(planIngest({ consumed: 10 }, { from: 10, data: bytes("x\n") }, true)).toEqual({ action: "append", keep: 2 });
  });

  it("needs no head check for a read from zero", () => {
    expect(planIngest({ consumed: 0 }, { from: 0, data: bytes("x\n") }, false).action).toBe("append");
  });

  it("hashes no more than the head it stores", () => {
    expect(HEAD_BYTES).toBe(4096);
    expect(consumableLength(new Uint8Array())).toBe(0);
  });
});

describe("paths and hosts", () => {
  it("finds a subagent run's parent session", () => {
    expect(parentPathOf("-home-x/abc/subagents/agent-a1.jsonl")).toBe("-home-x/abc.jsonl");
    expect(parentPathOf("-home-x/abc.jsonl")).toBeNull();
  });

  it("accepts a leading dash inside a path but never a traversal", () => {
    expect(isValidRemotePath("-home-dev-llvm/a.jsonl")).toBe(true);
    expect(isValidRemotePath("p/../../.ssh/id.jsonl")).toBe(false);
    expect(isValidRemotePath("p/..jsonl")).toBe(false);
  });

  it("accepts aliases and user@host, and nothing that reads as an option", () => {
    for (const ok of ["coder.main", "dev@192.168.1.33", "my_box", "a"]) expect(SSH_HOST_RE.test(ok)).toBe(true);
    for (const bad of ["-oProxyCommand=x", "dev@-oProxyCommand=x", "a b", "a;b", "a@b@c", "", "@host", "h\n"]) {
      expect(SSH_HOST_RE.test(bad)).toBe(false);
    }
  });
});
