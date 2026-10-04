#!/usr/bin/env node
/**
 * docs/plans/remote-claude.md §7 phase 1: reach a host, list, read, measure.
 * Prints counts and shapes only — never transcript content, which is where
 * credentials end up.
 *
 *   node packages/desktop/scripts/spike-remote-sessions.mjs <ssh-host>
 */
import { createHash } from "node:crypto";
import {
  LIST_SCRIPT,
  READ_SCRIPT,
  consumableLength,
  parseFrames,
  parseManifest,
  runRemote,
} from "../src/remoteSessions.js";

const host = process.argv[2];
if (!host) {
  console.error("usage: spike-remote-sessions.mjs <ssh-host>");
  process.exit(2);
}

const ms = (t) => `${(performance.now() - t).toFixed(0)} ms`;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) process.exitCode = 1;
};

let t = performance.now();
const { method, files } = parseManifest(await runRemote(host, LIST_SCRIPT));
const total = files.reduce((s, f) => s + f.size, 0);
const projects = new Set(files.map((f) => f.path.split("/")[0]));
const subagents = files.filter((f) => f.path.includes("/subagents/"));
console.log(`list (${method}): ${files.length} files, ${projects.size} projects, ` +
  `${subagents.length} subagent runs, ${total} bytes — ${ms(t)}`);

// Full read: one ssh round trip for everything.
t = performance.now();
const ranges = files.map((f) => `0\t${f.size}\t${f.path}\n`).join("");
const raw = await runRemote(host, READ_SCRIPT, ranges);
const frames = parseFrames(raw);
console.log(`read: ${frames.length} frames, ${raw.length} bytes on the wire — ${ms(t)}`);
check(frames.every((f) => f.status === "ok"), "every listed file read ok");
check(frames.every((f, i) => f.data?.length === files[i].size), "each frame is exactly the listed size");

// Shape of what was read: event types, without content.
const types = new Map();
let events = 0, bad = 0, tail = 0;
for (const f of frames) {
  const n = consumableLength(f.data);
  tail += f.data.length - n;
  for (const line of f.data.subarray(0, n).toString("utf8").split("\n")) {
    if (!line) continue;
    events++;
    try {
      const e = JSON.parse(line);
      types.set(e.type, (types.get(e.type) ?? 0) + 1);
    } catch {
      bad++;
    }
  }
}
console.log(`events: ${events}, unparseable: ${bad}, unconsumed tail bytes: ${tail}`);
console.log(`types: ${[...types].map(([k, v]) => `${k}=${v}`).join(" ")}`);

if (files.length) {
  // Incremental: the second half of the first file must equal the same slice of the full read.
  const f = files[0];
  const mid = Math.floor(f.size / 2);
  const [part] = parseFrames(await runRemote(host, READ_SCRIPT, `${mid}\t${f.size}\t${f.path}\n`));
  check(part.status === "ok" && part.data.equals(frames[0].data.subarray(mid)), "a range read equals that slice of the full read");
  const prefix = frames[0].data.subarray(0, Math.min(mid, 4096));
  check(part.headHash === createHash("sha256").update(prefix).digest("hex"),
    "head hash covers the first min(from, 4096) bytes");

  // Refusals: a tampered path, and a range past end of file.
  const refused = parseFrames(await runRemote(host, READ_SCRIPT,
    "0\t10\t../../.ssh/id_ed25519\n0\t10\t/etc/passwd\n0\t10\t.bashrc\n" +
    `0\t${f.size + 1000}\t${f.path}\n0\t5\t${f.path}\n`));
  check(refused.slice(0, 3).every((r) => r.status === "refused"), "paths outside the tree are refused");
  check(refused[3].status === "rewritten", "a range past EOF reports rewritten");
  check(refused[4].status === "ok" && refused[4].data.length === 5, "framing survives the refusals");
}

// §4.2: a destination that looks like an option never reaches ssh.
try {
  await runRemote("-oProxyCommand=touch /tmp/pwned", LIST_SCRIPT);
  check(false, "option-shaped host rejected");
} catch (e) {
  check(e.message.startsWith("not a valid ssh host"), "option-shaped host rejected before spawn");
}
