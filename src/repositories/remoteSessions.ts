import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import {
  PARSER_VERSION,
  parseTranscript,
  type EntryBody,
  type EntryKind,
} from "@/lib/claudeSessions/parse";
import {
  agentIdOf,
  type RemoteEntriesPage,
  type RemoteHostSummary,
  type RemoteSessionDetail,
  type RemoteSessionSummary,
  type RemoteSessionsTree,
} from "@/lib/claudeSessions/types";
import {
  HEAD_BYTES,
  diffManifest,
  isValidRemotePath,
  parentPathOf,
  planIngest,
  projectDirOf,
  type ListedFile,
  type WantedRange,
} from "@/lib/claudeSessions/sync";
import type { Prisma } from "@prisma/client";

// Rows for docs/plans/remote-claude.md. Owner-scoped only: there is no public
// variant of anything here and there must never be one, because a transcript
// is where credentials end up (§4.5). Authorization is `requireRemoteHost` in
// `src/lib/access.ts`; nothing below checks an owner.

const hostSelect = {
  id: true,
  userId: true,
  alias: true,
  label: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
} satisfies Prisma.RemoteHostSelect;

export type RemoteHostRow = Prisma.RemoteHostGetPayload<{ select: typeof hostSelect }>;

export function findRemoteHostById(id: string): Promise<RemoteHostRow | null> {
  return prisma.remoteHost.findUnique({ where: { id }, select: hostSelect });
}

export function findRemoteHostsByUser(userId: string): Promise<RemoteHostRow[]> {
  return prisma.remoteHost.findMany({
    where: { userId },
    select: hostSelect,
    orderBy: { createdAt: "asc" },
  });
}

export function createRemoteHost(
  userId: string,
  alias: string,
  label: string,
): Promise<RemoteHostRow> {
  return prisma.remoteHost.create({ data: { userId, alias, label }, select: hostSelect });
}

/**
 * Forgets a host and everything mirrored from it (§4.8). Irreversible for
 * anything already gone from the remote; the caller confirms first.
 */
export async function deleteRemoteHost(id: string): Promise<void> {
  await prisma.remoteHost.delete({ where: { id } });
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Prisma's `Bytes` is a `Uint8Array` over a plain `ArrayBuffer`; a `Buffer` may not be. */
const bytes = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

/**
 * Step 1 of a sync (§4.3): diff the remote listing against what is stored,
 * apply the bookkeeping the diff implies, and answer with the ranges to read.
 */
export async function applyManifest(
  hostId: string,
  listed: ListedFile[],
): Promise<WantedRange[]> {
  const stored = await prisma.remoteFile.findMany({
    where: { hostId },
    select: { path: true, size: true, mtime: true, consumed: true, goneAt: true },
  });
  const plan = diffManifest(
    stored.map((f) => ({
      path: f.path,
      size: Number(f.size),
      mtime: Number(f.mtime),
      consumed: Number(f.consumed),
      gone: f.goneAt !== null,
    })),
    listed,
  );

  await prisma.$transaction(async (tx) => {
    if (plan.reset.length) {
      const reset = { hostId, path: { in: plan.reset } };
      const ids = (await tx.remoteFile.findMany({ where: reset, select: { id: true } })).map(
        (f) => f.id,
      );
      await tx.remoteChunk.deleteMany({ where: { fileId: { in: ids } } });
      await tx.remoteEntry.deleteMany({ where: { fileId: { in: ids } } });
      await tx.remoteFile.updateMany({
        where: reset,
        data: { size: 0, consumed: 0, head: new Uint8Array(), parserVersion: 0 },
      });
    }
    if (plan.gone.length) {
      await tx.remoteFile.updateMany({
        where: { hostId, path: { in: plan.gone } },
        data: { goneAt: new Date() },
      });
    }
    if (plan.returned.length) {
      await tx.remoteFile.updateMany({
        where: { hostId, path: { in: plan.returned } },
        data: { goneAt: null },
      });
    }
  });

  return plan.wanted;
}

export interface IngestRange {
  path: string;
  from: number;
  /** Size and mtime as listed, recorded once the range is stored. */
  size: number;
  mtime: number;
  /**
   * The remote's SHA-256 of its first `min(from, HEAD_BYTES)` bytes, or null
   * for the continuation of a range already checked in this sync.
   */
  headHash: string | null;
  data: Buffer;
}

/**
 * Step 2 (§4.3): store fetched ranges. Each file is stored in its own
 * transaction, so a later failure keeps what earlier ranges stored; a file is
 * marked for re-derive (`parserVersion: 0`) and derived once, at `finishSync`,
 * rather than once per range.
 *
 * Answers with the files found rewritten, which the caller reads again whole.
 */
export async function ingestRanges(
  hostId: string,
  ranges: IngestRange[],
): Promise<{ refetch: WantedRange[]; stale: number }> {
  const refetch: WantedRange[] = [];
  let stale = 0;

  for (const r of ranges) {
    if (!isValidRemotePath(r.path)) continue;
    await prisma.$transaction(async (tx) => {
      const file = await tx.remoteFile.findUnique({
        where: { hostId_path: { hostId, path: r.path } },
        select: { id: true, consumed: true, head: true },
      });
      const consumed = file ? Number(file.consumed) : 0;
      const prefix = Math.min(r.from, HEAD_BYTES);
      const headMatches =
        r.headHash === null ||
        (file !== null &&
          file.head.length >= prefix &&
          sha256(file.head.subarray(0, prefix)) === r.headHash);
      const plan = planIngest(file ? { consumed } : null, r, headMatches);

      if (plan.action === "stale") {
        stale++;
        return;
      }
      if (plan.action === "reset") {
        await tx.remoteChunk.deleteMany({ where: { fileId: file!.id } });
        await tx.remoteEntry.deleteMany({ where: { fileId: file!.id } });
        await tx.remoteFile.update({
          where: { id: file!.id },
          data: { size: 0, consumed: 0, head: new Uint8Array(), parserVersion: 0 },
        });
        refetch.push({ path: r.path, from: 0, to: r.size });
        return;
      }

      const kept = r.data.subarray(0, plan.keep);
      const head = bytes(
        file && file.head.length >= HEAD_BYTES
          ? file.head
          : Buffer.concat([file?.head ?? new Uint8Array(), kept]).subarray(0, HEAD_BYTES),
      );
      const parentPath = parentPathOf(r.path);
      const parent = parentPath
        ? await tx.remoteFile.findUnique({
            where: { hostId_path: { hostId, path: parentPath } },
            select: { id: true },
          })
        : null;

      const row = await tx.remoteFile.upsert({
        where: { hostId_path: { hostId, path: r.path } },
        create: {
          hostId,
          path: r.path,
          size: r.size,
          mtime: r.mtime,
          consumed: plan.keep,
          head,
          isSubagent: parentPath !== null,
          parentFileId: parent?.id ?? null,
          parserVersion: 0,
        },
        update: {
          size: r.size,
          mtime: r.mtime,
          consumed: consumed + plan.keep,
          head,
          parserVersion: 0,
          ...(parent ? { parentFileId: parent.id } : {}),
        },
        select: { id: true },
      });

      if (plan.keep > 0) {
        const last = await tx.remoteChunk.findFirst({
          where: { fileId: row.id },
          orderBy: { seq: "desc" },
          select: { seq: true },
        });
        await tx.remoteChunk.create({
          data: {
            fileId: row.id,
            seq: (last?.seq ?? -1) + 1,
            offset: r.from,
            data: bytes(gzipSync(kept)),
          },
        });
      }
    });
  }

  return { refetch, stale };
}

/**
 * Postgres `text` and `jsonb` cannot hold NUL, and a tool result can. Stripped
 * per string value, never by rewriting serialized JSON, where `\\u0000` would
 * be ambiguous with an escaped backslash.
 */
function withoutNul(body: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(body, (_k, v) => (typeof v === "string" ? v.replace(/\0/g, "") : v)),
  );
}

/** Rows are written in batches; a long session is thousands of entries. */
const ENTRY_BATCH = 500;

/**
 * Rebuilds one file's entries and derived columns from its stored chunks
 * (§4.4). Entries are a derived index, so they are replaced wholesale.
 */
export async function rederiveFile(fileId: string): Promise<void> {
  const file = await prisma.remoteFile.findUniqueOrThrow({
    where: { id: fileId },
    select: { path: true, chunks: { orderBy: { seq: "asc" }, select: { data: true } } },
  });
  const jsonl = Buffer.concat(file.chunks.map((c) => gunzipSync(c.data))).toString("utf8");
  const { entries, meta } = parseTranscript(jsonl, projectDirOf(file.path));

  await prisma.$transaction(
    async (tx) => {
      await tx.remoteEntry.deleteMany({ where: { fileId } });
      for (let i = 0; i < entries.length; i += ENTRY_BATCH) {
        await tx.remoteEntry.createMany({
          data: entries.slice(i, i + ENTRY_BATCH).map((e) => ({
            fileId,
            idx: e.idx,
            kind: e.kind,
            uuid: e.uuid,
            parentUuid: e.parentUuid,
            at: e.at ? new Date(e.at) : null,
            tool: e.tool,
            body: withoutNul(e.body),
            text: e.text.replace(/\0/g, ""),
          })),
        });
      }
      await tx.remoteFile.update({
        where: { id: fileId },
        data: {
          parserVersion: PARSER_VERSION,
          title: meta.title,
          cwd: meta.cwd,
          cwdGuessed: meta.cwdGuessed,
          gitBranch: meta.gitBranch,
          firstPrompt: meta.firstPrompt,
          startedAt: meta.startedAt ? new Date(meta.startedAt) : null,
          endedAt: meta.endedAt ? new Date(meta.endedAt) : null,
          activeMs: meta.activeMs,
          userMsgs: meta.userMsgs,
          assistantMsgs: meta.assistantMsgs,
          toolCalls: meta.toolCalls,
          tools: meta.tools,
          promptTimes: meta.promptTimes.map((t) => new Date(t)),
        },
      });
    },
    { timeout: 60_000 },
  );
}

/**
 * Step 3: derive everything this sync touched — and anything a parser upgrade
 * left behind — then record the outcome on the host.
 */
export async function finishSync(
  hostId: string,
  error: string | null,
): Promise<{ derived: number }> {
  const stale = await prisma.remoteFile.findMany({
    where: { hostId, parserVersion: { lt: PARSER_VERSION } },
    select: { id: true },
  });
  for (const f of stale) await rederiveFile(f.id);

  // A subagent run can be stored before its session in the same sync; link it
  // now that both exist.
  const orphans = await prisma.remoteFile.findMany({
    where: { hostId, isSubagent: true, parentFileId: null },
    select: { id: true, path: true },
  });
  for (const o of orphans) {
    const parent = await prisma.remoteFile.findUnique({
      where: { hostId_path: { hostId, path: parentPathOf(o.path)! } },
      select: { id: true },
    });
    if (parent) {
      await prisma.remoteFile.update({ where: { id: o.id }, data: { parentFileId: parent.id } });
    }
  }
  await prisma.remoteHost.update({
    where: { id: hostId },
    data: error === null ? { lastSyncAt: new Date(), lastError: null } : { lastError: error },
  });
  return { derived: stale.length };
}

// ─── Reads (phase 3) ─────────────────────────────────────────────────────────

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const hostSummary = (h: RemoteHostRow): RemoteHostSummary => ({
  id: h.id,
  alias: h.alias,
  label: h.label,
  lastSyncAt: iso(h.lastSyncAt),
  lastError: h.lastError,
  createdAt: h.createdAt.toISOString(),
});

const sessionSelect = {
  id: true,
  hostId: true,
  path: true,
  title: true,
  cwd: true,
  cwdGuessed: true,
  gitBranch: true,
  startedAt: true,
  endedAt: true,
  goneAt: true,
  isSubagent: true,
  parentFileId: true,
  activeMs: true,
  userMsgs: true,
  assistantMsgs: true,
  toolCalls: true,
  size: true,
} satisfies Prisma.RemoteFileSelect;

type SessionRow = Prisma.RemoteFileGetPayload<{ select: typeof sessionSelect }>;

const sessionSummary = (f: SessionRow): RemoteSessionSummary => ({
  id: f.id,
  hostId: f.hostId,
  path: f.path,
  projectDir: projectDirOf(f.path),
  title: f.title,
  cwd: f.cwd,
  cwdGuessed: f.cwdGuessed,
  gitBranch: f.gitBranch,
  startedAt: iso(f.startedAt),
  endedAt: iso(f.endedAt),
  goneAt: iso(f.goneAt),
  isSubagent: f.isSubagent,
  parentId: f.parentFileId,
  activeMs: f.activeMs,
  userMsgs: f.userMsgs,
  assistantMsgs: f.assistantMsgs,
  toolCalls: f.toolCalls,
  size: Number(f.size),
});

/** Every host and session the user has, newest session first. No entries. */
export async function findRemoteSessionsTree(userId: string): Promise<RemoteSessionsTree> {
  const [hosts, files] = await Promise.all([
    findRemoteHostsByUser(userId),
    prisma.remoteFile.findMany({
      where: { host: { userId } },
      select: sessionSelect,
      orderBy: [{ endedAt: { sort: "desc", nulls: "last" } }, { path: "asc" }],
    }),
  ]);
  return { hosts: hosts.map(hostSummary), sessions: files.map(sessionSummary) };
}

/** The owner of a session, for `requireRemoteSession`. */
export function findRemoteSessionOwner(id: string) {
  return prisma.remoteFile.findUnique({
    where: { id },
    select: { id: true, hostId: true, host: { select: { userId: true } } },
  });
}

export async function findRemoteSessionDetail(id: string): Promise<RemoteSessionDetail | null> {
  const f = await prisma.remoteFile.findUnique({
    where: { id },
    select: {
      ...sessionSelect,
      firstPrompt: true,
      tools: true,
      host: { select: hostSelect },
      parent: { select: { id: true, title: true } },
      subagents: { select: { id: true, path: true, title: true }, orderBy: { startedAt: "asc" } },
      _count: { select: { entries: true } },
    },
  });
  if (!f) return null;
  return {
    ...sessionSummary(f),
    host: hostSummary(f.host),
    firstPrompt: f.firstPrompt,
    tools: (f.tools ?? {}) as Record<string, number>,
    entryCount: f._count.entries,
    subagents: f.subagents.map((s) => ({ id: s.id, agentId: agentIdOf(s.path), title: s.title })),
    parent: f.parent,
  };
}

/** One page of a transcript, by position (§4.7). `text` is search-only and not sent. */
export async function findRemoteEntries(
  fileId: string,
  from: number,
  limit: number,
): Promise<RemoteEntriesPage> {
  const [rows, total] = await Promise.all([
    prisma.remoteEntry.findMany({
      where: { fileId, idx: { gte: from } },
      orderBy: { idx: "asc" },
      take: limit,
      select: { idx: true, kind: true, uuid: true, parentUuid: true, at: true, tool: true, body: true },
    }),
    prisma.remoteEntry.count({ where: { fileId } }),
  ]);
  return {
    total,
    entries: rows.map((r) => ({
      idx: r.idx,
      kind: r.kind as EntryKind,
      uuid: r.uuid,
      parentUuid: r.parentUuid,
      at: iso(r.at),
      tool: r.tool,
      body: r.body as unknown as EntryBody,
    })),
  };
}

/**
 * Forget sessions (§4.8): the files, their chunks and entries, and — for a
 * session — its subagent runs. A file still on the remote comes back on the
 * next sync; one that is gone does not, which is why the UI confirms.
 */
export async function forgetRemoteSession(id: string): Promise<number> {
  const { count } = await prisma.remoteFile.deleteMany({
    where: { OR: [{ id }, { parentFileId: id }] },
  });
  return count;
}

export async function forgetRemoteProject(hostId: string, projectDir: string): Promise<number> {
  const { count } = await prisma.remoteFile.deleteMany({
    where: { hostId, path: { startsWith: `${projectDir}/` } },
  });
  return count;
}
