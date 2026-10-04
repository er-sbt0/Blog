/**
 * Reading Claude Code transcripts off a remote host over the user's own ssh.
 *
 * docs/plans/remote-claude.md §4.1–§4.3. Phase 1 of that plan: list and read,
 * no database. Everything here except `runRemote` is import-free, for the same
 * reason as `terminal.js` — it is the half a spec can pin.
 *
 * Two rules carry the safety argument, and both are structural:
 *
 * - The remote commands are the two constants below. Nothing is interpolated
 *   into them — not the host, not a path. Ranges reach the read script on
 *   stdin, and the script itself refuses any path outside the projects tree.
 * - The host is one argv element after `--`, validated here as well as wherever
 *   it was stored (§4.2), so it can never be read as an ssh option.
 */

/**
 * An ssh destination: an alias from `~/.ssh/config`, or `user@host`. The same
 * pattern as `SSH_HOST_RE` in `src/lib/claudeSessions/sync.ts`, where the host
 * is stored; a spec pins that the two agree.
 *
 * The leading character excludes `-`, which is what keeps `-oProxyCommand=…`
 * from being a destination. `@` is allowed once, for `user@host` — the plan's
 * regex had no `@`, and the first real host this was pointed at was
 * `dev@192.168.1.33`.
 */
const HOST_RE = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isValidHost(host) {
  return typeof host === "string" && HOST_RE.test(host);
}

/**
 * Wraps a fixed script for the remote side.
 *
 * ssh hands its command to the remote user's login shell, which need not be
 * POSIX (fish, nu). So the script runs under an explicit `sh -c '…'`, which is
 * only sound because the scripts contain no single quote — asserted, not
 * assumed.
 */
function shWrap(script) {
  if (script.includes("'")) throw new Error("remote script must not contain a single quote");
  return `sh -c '${script}'`;
}

/**
 * §4.3 step 1. NUL-terminated records of `size\tmtime\tpath`, path relative to
 * the projects directory. `-printf` is GNU; the `stat` fallback is too, and a
 * BSD remote is the plan's §9 question 1. The first line says which ran.
 */
export const LIST_SCRIPT = [
  'root="$HOME/.claude/projects"',
  '[ -d "$root" ] || { printf "none\\n"; exit 0; }',
  'cd "$root" || exit 3',
  'if find . -maxdepth 0 -printf "" 2>/dev/null; then',
  '  printf "find\\n"',
  '  find . -type f -name "*.jsonl" -printf "%s\\t%T@\\t%P\\0"',
  "else",
  '  printf "stat\\n"',
  '  find . -type f -name "*.jsonl" -exec stat --printf "%s\\t%.9Y\\t%n\\0" -- {} +',
  "fi",
].join("\n");

/**
 * §4.3 step 2. Reads `from\tto\tpath` lines on stdin and, for each, writes
 *
 *   \x1e <length> \t <sha256 of first min(from, 4096) bytes> \t <path> \n <exactly length bytes>
 *
 * The hash covers bytes the server already holds, so a match means "what you
 * stored is still what is here" — even for a file shorter than 4 KiB that has
 * merely grown. `from === to` is a valid range: it reads nothing and is how a
 * same-length rewrite is noticed.
 * A path is refused (length `-1`, no bytes) unless it is relative, ends in
 * `.jsonl` and has no `..` component — so a manifest altered on its way back
 * cannot turn this into `cat ~/.ssh/id_ed25519`. A file now shorter than `to`
 * was rewritten since the listing; it gets length `-2` and is read again whole
 * on the next sync, rather than desynchronising the framing.
 */
export const READ_SCRIPT = [
  'root="$HOME/.claude/projects"',
  "rs=$(printf \"\\036\")",
  'while IFS="$(printf "\\t")" read -r from to rel; do',
  '  case "$rel" in',
  '    /*|*..*|*[!A-Za-z0-9._/-]*) printf "%s-1\\t-\\t%s\\n" "$rs" "$rel"; continue ;;',
  '    *.jsonl) ;;',
  '    *) printf "%s-1\\t-\\t%s\\n" "$rs" "$rel"; continue ;;',
  "  esac",
  '  f="$root/$rel"',
  '  size=$(stat -c %s -- "$f" 2>/dev/null) || { printf "%s-1\\t-\\t%s\\n" "$rs" "$rel"; continue; }',
  '  if [ "$size" -lt "$to" ]; then printf "%s-2\\t-\\t%s\\n" "$rs" "$rel"; continue; fi',
  '  len=$((to - from))',
  '  n=$from; [ "$n" -gt 4096 ] && n=4096',
  '  head=$(head -c "$n" -- "$f" | sha256sum | cut -c1-64)',
  '  printf "%s%s\\t%s\\t%s\\n" "$rs" "$len" "$head" "$rel"',
  '  tail -c +$((from + 1)) -- "$f" | head -c "$len"',
  "done",
].join("\n");

/** §4.1: the options every invocation carries, and the ones it never does. */
export const SSH_OPTIONS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

export function sshArgv(host, script) {
  if (!isValidHost(host)) throw new Error(`not a valid ssh host: ${JSON.stringify(host)}`);
  return [...SSH_OPTIONS, "--", host, shWrap(script)];
}

/** Parses LIST_SCRIPT's output into `{ method, files: [{ path, size, mtime }] }`, mtime in ms. */
export function parseManifest(buf) {
  const nl = buf.indexOf(10);
  const method = buf.subarray(0, nl).toString("utf8");
  if (method === "none") return { method, files: [] };
  const files = [];
  for (const rec of buf.subarray(nl + 1).toString("utf8").split("\0")) {
    if (!rec) continue;
    const [size, mtime, path, extra] = rec.split("\t");
    if (extra !== undefined || !path) continue;
    // Whole milliseconds, so the server can compare it exactly (§7.1).
    files.push({
      path: path.replace(/^\.\//, ""),
      size: Number(size),
      mtime: Math.round(Number(mtime) * 1000),
    });
  }
  return { method, files };
}

/**
 * Splits READ_SCRIPT's stream into frames. Trusts the length, never a marker:
 * the record separator can appear inside a transcript, and the length is what
 * makes that harmless.
 */
export function parseFrames(buf) {
  const frames = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] !== 0x1e) throw new Error(`frame desync at byte ${i}`);
    const nl = buf.indexOf(10, i);
    if (nl < 0) throw new Error(`truncated frame header at byte ${i}`);
    const [len, headHash, path] = buf.subarray(i + 1, nl).toString("utf8").split("\t");
    const length = Number(len);
    i = nl + 1;
    if (length < 0) {
      frames.push({ path, status: length === -2 ? "rewritten" : "refused" });
      continue;
    }
    if (i + length > buf.length) throw new Error(`truncated frame body for ${path}`);
    frames.push({ path, status: "ok", headHash, data: buf.subarray(i, i + length) });
    i += length;
  }
  return frames;
}

/**
 * The bytes a sync may consume from a chunk: up to and including the last
 * newline. A half-written final line is read again next time (§4.3).
 */
export function consumableLength(data) {
  return data.lastIndexOf(10) + 1;
}

/** One ingest request's worth of transcript bytes — under the route's 8 MiB cap. */
export const INGEST_BUDGET = 6 * 1024 * 1024;

/** The largest single range; a bigger file is read as several. */
export const PIECE_BYTES = 4 * 1024 * 1024;

/** Bytes per ssh read, which `runRemote` buffers whole. */
export const READ_BUDGET = 64 * 1024 * 1024;

/**
 * Splits wanted ranges into pieces of at most `piece` bytes, in order. Only a
 * range's first piece carries the rewrite check; the rest are the same read.
 * A zero-length range stays one piece — it is the probe.
 */
export function splitRanges(wanted, piece = PIECE_BYTES) {
  const out = [];
  for (const w of wanted) {
    let from = w.from;
    do {
      const to = Math.min(w.to, from + piece);
      out.push({ path: w.path, from, to, first: from === w.from });
      from = to;
    } while (from < w.to);
  }
  return out;
}

/** Groups consecutive items so each group's `cost` stays within `budget` where it can. */
function batches(items, budget, cost) {
  const out = [];
  let cur = [];
  let size = 0;
  for (const it of items) {
    if (cur.length && size + cost(it) > budget) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += cost(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Reads `wanted` from the host and posts it to the ingest route. Answers with
 * the ranges the server found rewritten.
 *
 * A piece can end mid-line, and the server stores only through the last
 * newline, so the tail of each piece is carried into the next one for the same
 * path, whose `from` moves back to match — otherwise every second piece would
 * arrive ahead of what was stored and be refused as stale.
 */
async function readAndIngest({ host, hostId, post, run, listed, wanted, onProgress, piece }) {
  const refetch = [];
  const carry = new Map();
  const total = wanted.reduce((n, w) => n + (w.to - w.from), 0);
  let done = 0;

  for (const read of batches(splitRanges(wanted, piece), READ_BUDGET, (p) => p.to - p.from)) {
    const input = read.map((p) => `${p.from}\t${p.to}\t${p.path}\n`).join("");
    const frames = parseFrames(await run(host, READ_SCRIPT, input));
    if (frames.length !== read.length) throw new Error("read returned the wrong number of frames");

    const ranges = [];
    frames.forEach((f, i) => {
      const p = read[i];
      done += p.to - p.from;
      if (f.status !== "ok" || f.path !== p.path) return;
      const prev = carry.get(p.path);
      const data = prev ? Buffer.concat([prev.data, f.data]) : f.data;
      const from = prev ? prev.from : p.from;
      const keep = consumableLength(data);
      carry.set(p.path, { from: from + keep, data: data.subarray(keep) });
      const meta = listed.get(p.path);
      ranges.push({
        path: p.path,
        from,
        size: meta.size,
        mtime: meta.mtime,
        headHash: p.first ? f.headHash : null,
        data,
      });
    });

    for (const batch of batches(ranges, INGEST_BUDGET, (r) => r.data.length)) {
      const res = await post(`/hosts/${hostId}/ingest`, {
        ranges: batch.map((r) => ({ ...r, data: r.data.toString("base64") })),
      });
      refetch.push(...res.refetch);
    }
    onProgress({ done, total });
  }
  return refetch;
}

/**
 * One sync of one host (§4.3): list, diff on the server, read what changed,
 * store it, derive. `post(path, body)` reaches the server's
 * `/api/remote-sessions` routes as the signed-in author and resolves to the
 * response's `data`. Whatever fails, the host's `lastError` says why.
 *
 * Files the server finds rewritten are read once more, whole, in the same sync;
 * a file still changing under a second read waits for the next one.
 */
export async function syncHost({
  host,
  hostId,
  post,
  run = runRemote,
  onProgress = () => {},
  piece = PIECE_BYTES,
}) {
  if (!isValidHost(host)) throw new Error(`not a valid ssh host: ${JSON.stringify(host)}`);
  try {
    const { files } = parseManifest(await run(host, LIST_SCRIPT));
    const listed = new Map(files.map((f) => [f.path, f]));
    let { wanted } = await post(`/hosts/${hostId}/manifest`, { files });
    for (let round = 0; round < 2 && wanted.length; round++) {
      wanted = await readAndIngest({ host, hostId, post, run, listed, wanted, onProgress, piece });
    }
    return await post(`/hosts/${hostId}/finish`, { error: null });
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 2000);
    await post(`/hosts/${hostId}/finish`, { error: message }).catch(() => {});
    throw error;
  }
}

/**
 * Runs one fixed script on `host`, feeding `stdin`, and resolves to stdout.
 * Rejects with ssh's own stderr — verbatim, because it is the only thing that
 * tells the user whether the problem is a key, a host key or a network.
 */
export async function runRemote(host, script, stdin = "") {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", sshArgv(host, script), { stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(out));
      const msg = Buffer.concat(err).toString("utf8").trim().slice(0, 2000);
      reject(new Error(msg || `ssh exited with ${code}`));
    });
    child.stdin.end(stdin);
  });
}
