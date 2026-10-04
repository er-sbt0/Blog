import { createHash } from "node:crypto";
import {
  HEAD_BYTES,
  SSH_HOST_RE,
  diffManifest,
  isValidRemotePath,
  planIngest,
} from "@/lib/claudeSessions/sync";
import {
  LIST_SCRIPT,
  READ_SCRIPT,
  isValidHost,
  parseFrames,
  parseManifest,
  splitRanges,
  sshArgv,
  syncHost,
} from "../remoteSessions.js";

/**
 * docs/plans/remote-claude.md §4.2–§4.3: the main process's half of a sync.
 *
 * The end-to-end half runs `syncHost` against a remote that emulates the two
 * fixed scripts over an in-memory file tree, and a server built from the same
 * `sync.ts` decisions the repository uses. The claim it pins is the one that
 * fails silently: after any sequence of syncs, what is stored is byte-for-byte
 * the remote file through its last newline — across pieces that split a line,
 * appends that end mid-line, and rewrites that keep the length.
 *
 * The real scripts against a real sshd are `scripts/spike-remote-sessions.mjs`.
 */

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** A remote host: path → bytes and mtime. Emulates LIST_SCRIPT and READ_SCRIPT. */
function fakeRemote(files: Map<string, { data: Buffer; mtime: number }>) {
  const calls: string[] = [];
  const run = async (_host: string, script: string, stdin = "") => {
    if (script === LIST_SCRIPT) {
      calls.push("list");
      const recs = [...files].map(([p, f]) => `${f.data.length}\t${f.mtime}\t${p}\0`);
      return Buffer.from("find\n" + recs.join(""));
    }
    if (script !== READ_SCRIPT) throw new Error("unknown script");
    calls.push(`read:${stdin.trim().split("\n").length}`);
    const out: Buffer[] = [];
    for (const line of stdin.split("\n").filter(Boolean)) {
      const [from, to, path] = line.split("\t");
      const f = files.get(path);
      if (!f) {
        out.push(Buffer.from(`\x1e-1\t-\t${path}\n`));
        continue;
      }
      if (f.data.length < Number(to)) {
        out.push(Buffer.from(`\x1e-2\t-\t${path}\n`));
        continue;
      }
      const head = sha(f.data.subarray(0, Math.min(Number(from), HEAD_BYTES)));
      const body = f.data.subarray(Number(from), Number(to));
      out.push(Buffer.from(`\x1e${body.length}\t${head}\t${path}\n`), body);
    }
    return Buffer.concat(out);
  };
  return { run, calls };
}

interface Stored { size: number; mtime: number; consumed: number; data: Buffer; gone: boolean }

/** The server's half, from the same decisions `repositories/remoteSessions.ts` makes. */
function fakeServer() {
  const files = new Map<string, Stored>();
  const log: { path: string; body: unknown }[] = [];
  const post = async (path: string, body: Record<string, unknown>) => {
    log.push({ path, body });
    if (path.endsWith("/manifest")) {
      const listed = body.files as { path: string; size: number; mtime: number }[];
      const plan = diffManifest(
        [...files].map(([p, f]) => ({ path: p, size: f.size, mtime: f.mtime, consumed: f.consumed, gone: f.gone })),
        listed,
      );
      for (const p of plan.reset) files.set(p, { ...files.get(p)!, size: 0, consumed: 0, data: Buffer.alloc(0) });
      for (const p of plan.gone) files.get(p)!.gone = true;
      for (const p of plan.returned) files.get(p)!.gone = false;
      return { wanted: plan.wanted };
    }
    if (path.endsWith("/ingest")) {
      const refetch: unknown[] = [];
      for (const r of body.ranges as { path: string; from: number; size: number; mtime: number; headHash: string | null; data: string }[]) {
        expect(isValidRemotePath(r.path)).toBe(true);
        const data = Buffer.from(r.data, "base64");
        const f = files.get(r.path) ?? null;
        const prefix = Math.min(r.from, HEAD_BYTES);
        const headMatches = r.headHash === null || (!!f && sha(f.data.subarray(0, prefix)) === r.headHash);
        const plan = planIngest(f, { from: r.from, data }, headMatches);
        if (plan.action === "stale") continue;
        if (plan.action === "reset") {
          files.set(r.path, { ...f!, size: 0, consumed: 0, data: Buffer.alloc(0) });
          refetch.push({ path: r.path, from: 0, to: r.size });
          continue;
        }
        const prev = f?.data ?? Buffer.alloc(0);
        files.set(r.path, {
          size: r.size,
          mtime: r.mtime,
          consumed: (f?.consumed ?? 0) + plan.keep,
          data: Buffer.concat([prev, data.subarray(0, plan.keep)]),
          gone: f?.gone ?? false,
        });
      }
      return { refetch, stale: 0 };
    }
    if (path.endsWith("/finish")) return { derived: 0, error: body.error };
    throw new Error(`unexpected ${path}`);
  };
  return { files, post, log };
}

/** The stored bytes a correct sync must hold: the remote through its last newline. */
const throughLastNewline = (b: Buffer) => b.subarray(0, b.lastIndexOf(10) + 1);

const lines = (prefix: string, n: number, width = 23) =>
  Array.from({ length: n }, (_, i) => `{"${prefix}":${i},"pad":"${"x".repeat(width + (i % 7))}"}\n`).join("");

describe("syncHost, end to end over fakes", () => {
  const host = "dev@192.168.1.33";
  const hostId = "h1";

  it("stores every file exactly, across pieces that split lines", async () => {
    const remote = new Map([
      ["-home-a/s1.jsonl", { data: Buffer.from(lines("a", 50)), mtime: 1 }],
      ["-home-a/s1/subagents/agent-x.jsonl", { data: Buffer.from(lines("b", 3) + '{"half":'), mtime: 1 }],
    ]);
    const { run } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run, piece: 64 });
    for (const [p, f] of remote) expect(server.files.get(p)!.data.equals(throughLastNewline(f.data))).toBe(true);
    expect(server.log.at(-1)).toEqual({ path: "/hosts/h1/finish", body: { error: null } });
  });

  it("reads only the tail after an append, completing a half-written line", async () => {
    const path = "-home-a/s1.jsonl";
    const remote = new Map([[path, { data: Buffer.from(lines("a", 10) + '{"half":'), mtime: 1 }]]);
    const { run } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run, piece: 50 });
    const firstConsumed = server.files.get(path)!.consumed;

    remote.set(path, { data: Buffer.concat([remote.get(path)!.data, Buffer.from('1}\n' + lines("c", 5))]), mtime: 2 });
    server.log.length = 0;
    await syncHost({ host, hostId, post: server.post, run, piece: 50 });

    const manifest = server.log.find((l) => l.path.endsWith("/manifest"))!;
    expect(manifest).toBeDefined();
    expect(server.files.get(path)!.data.equals(throughLastNewline(remote.get(path)!.data))).toBe(true);
    const ingested = server.log.filter((l) => l.path.endsWith("/ingest"));
    const first = (ingested[0].body as { ranges: { from: number }[] }).ranges[0];
    expect(first.from).toBe(firstConsumed);
  });

  it("notices a same-length rewrite through the head probe and reads it again whole", async () => {
    const path = "-home-a/s1.jsonl";
    const original = Buffer.from(lines("a", 4));
    const remote = new Map([[path, { data: original, mtime: 1 }]]);
    const { run } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run });

    const rewritten = Buffer.from(original.toString().replace('"a":0', '"z":0'));
    expect(rewritten.length).toBe(original.length);
    remote.set(path, { data: rewritten, mtime: 2 });
    await syncHost({ host, hostId, post: server.post, run });
    expect(server.files.get(path)!.data.equals(rewritten)).toBe(true);
  });

  it("resets a file that shrank", async () => {
    const path = "-home-a/s1.jsonl";
    const remote = new Map([[path, { data: Buffer.from(lines("a", 20)), mtime: 1 }]]);
    const { run } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run });
    remote.set(path, { data: Buffer.from(lines("q", 3)), mtime: 2 });
    await syncHost({ host, hostId, post: server.post, run });
    expect(server.files.get(path)!.data.equals(remote.get(path)!.data)).toBe(true);
  });

  it("marks a vanished file gone and keeps its bytes", async () => {
    const remote = new Map([["-home-a/s1.jsonl", { data: Buffer.from(lines("a", 2)), mtime: 1 }]]);
    const { run } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run });
    remote.clear();
    await syncHost({ host, hostId, post: server.post, run });
    expect(server.files.get("-home-a/s1.jsonl")).toMatchObject({ gone: true });
    expect(server.files.get("-home-a/s1.jsonl")!.data.length).toBeGreaterThan(0);
  });

  it("does nothing but list when nothing changed", async () => {
    const remote = new Map([["-home-a/s1.jsonl", { data: Buffer.from(lines("a", 2)), mtime: 1 }]]);
    const { run, calls } = fakeRemote(remote);
    const server = fakeServer();
    await syncHost({ host, hostId, post: server.post, run });
    calls.length = 0;
    await syncHost({ host, hostId, post: server.post, run });
    expect(calls).toEqual(["list"]);
  });

  it("records ssh's own error on the host and rethrows it", async () => {
    const server = fakeServer();
    const run = async () => {
      throw new Error("dev@192.168.1.33: Permission denied (publickey).");
    };
    await expect(syncHost({ host, hostId, post: server.post, run })).rejects.toThrow("Permission denied");
    expect(server.log.at(-1)).toEqual({
      path: "/hosts/h1/finish",
      body: { error: "dev@192.168.1.33: Permission denied (publickey)." },
    });
  });
});

describe("the ssh invocation", () => {
  it("agrees with the server about which hosts are valid", () => {
    for (const h of ["coder.main", "dev@192.168.1.33", "-oProxyCommand=x", "dev@-x", "a b", "a@b@c", ""]) {
      expect(isValidHost(h)).toBe(SSH_HOST_RE.test(h));
    }
  });

  it("puts the host after `--`, as one element, with batch mode and no host-key bypass", () => {
    const argv = sshArgv("coder.main", LIST_SCRIPT);
    expect(argv.slice(0, 6)).toEqual(["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "--", "coder.main"]);
    expect(argv).toHaveLength(7);
    expect(argv.join(" ")).not.toMatch(/StrictHostKeyChecking|UserKnownHostsFile/);
    expect(() => sshArgv("-oProxyCommand=sh", LIST_SCRIPT)).toThrow("not a valid ssh host");
  });

  it("runs fixed scripts that a single-quoted sh -c can carry", () => {
    for (const s of [LIST_SCRIPT, READ_SCRIPT]) expect(s).not.toContain("'");
    expect(sshArgv("h", READ_SCRIPT)[6]).toBe(`sh -c '${READ_SCRIPT}'`);
  });
});

describe("framing", () => {
  it("trusts lengths, not markers, so a record separator inside data is harmless", () => {
    const body = Buffer.from("a\x1eb\n");
    const buf = Buffer.concat([
      Buffer.from(`\x1e${body.length}\t${"0".repeat(64)}\tp/a.jsonl\n`),
      body,
      Buffer.from(`\x1e-1\t-\t../x\n\x1e-2\t-\tp/b.jsonl\n\x1e0\t${"1".repeat(64)}\tp/c.jsonl\n`),
    ]);
    const frames = parseFrames(buf);
    expect(frames.map((f) => f.status)).toEqual(["ok", "refused", "rewritten", "ok"]);
    expect(frames[0].data.equals(body)).toBe(true);
    expect(frames[3].data.length).toBe(0);
  });

  it("refuses a desynchronised or truncated stream rather than guessing", () => {
    expect(() => parseFrames(Buffer.from("x"))).toThrow("desync");
    expect(() => parseFrames(Buffer.from(`\x1e10\th\tp/a.jsonl\nabc`))).toThrow("truncated");
  });

  it("parses both listing methods, stripping stat's ./ prefix and keeping mtime in whole ms", () => {
    expect(parseManifest(Buffer.from("find\n12\t1790088276.2334518\tp/a.jsonl\0")).files).toEqual([
      { path: "p/a.jsonl", size: 12, mtime: 1790088276233 },
    ]);
    expect(parseManifest(Buffer.from("stat\n12\t1.5\t./p/a.jsonl\0")).files).toEqual([{ path: "p/a.jsonl", size: 12, mtime: 1500 }]);
    expect(parseManifest(Buffer.from("none\n")).files).toEqual([]);
  });

  it("splits a range into pieces and keeps a probe whole", () => {
    expect(splitRanges([{ path: "p", from: 10, to: 25 }], 10)).toEqual([
      { path: "p", from: 10, to: 20, first: true },
      { path: "p", from: 20, to: 25, first: false },
    ]);
    expect(splitRanges([{ path: "p", from: 7, to: 7 }], 10)).toEqual([{ path: "p", from: 7, to: 7, first: true }]);
  });
});
