-- Remote Claude Code sessions (docs/plans/remote-claude.md §4.4, §4.9).
--
-- Desktop only by use, shared by migration: the VPS gets these tables too and
-- they stay empty there, since every route that writes them refuses off the
-- desktop build. That makes the `CREATE EXTENSION` below a production statement
-- as well — `pg_trgm` is trusted since Postgres 13, so a role with CREATE on the
-- database may install it (§6.4).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "RemoteHost" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemoteHost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteFile" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mtime" BIGINT NOT NULL,
    "consumed" BIGINT NOT NULL,
    "head" BYTEA NOT NULL,
    "goneAt" TIMESTAMPTZ,
    "isSubagent" BOOLEAN NOT NULL,
    "parentFileId" UUID,
    "parserVersion" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "cwd" TEXT,
    "cwdGuessed" BOOLEAN NOT NULL DEFAULT false,
    "gitBranch" TEXT,
    "firstPrompt" TEXT,
    "startedAt" TIMESTAMPTZ,
    "endedAt" TIMESTAMPTZ,
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "userMsgs" INTEGER NOT NULL DEFAULT 0,
    "assistantMsgs" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "tools" JSONB NOT NULL DEFAULT '{}',
    "promptTimes" TIMESTAMPTZ[],

    CONSTRAINT "RemoteFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteChunk" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "offset" BIGINT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "RemoteChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteEntry" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "idx" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "uuid" TEXT,
    "parentUuid" TEXT,
    "at" TIMESTAMPTZ,
    "tool" TEXT,
    "body" JSONB NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "RemoteEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemoteHost_userId_alias_key" ON "RemoteHost"("userId", "alias");

-- CreateIndex
CREATE INDEX "RemoteFile_parentFileId_idx" ON "RemoteFile"("parentFileId");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteFile_hostId_path_key" ON "RemoteFile"("hostId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteChunk_fileId_seq_key" ON "RemoteChunk"("fileId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteEntry_fileId_idx_key" ON "RemoteEntry"("fileId", "idx");

-- AddForeignKey
ALTER TABLE "RemoteHost" ADD CONSTRAINT "RemoteHost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteFile" ADD CONSTRAINT "RemoteFile_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "RemoteHost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteFile" ADD CONSTRAINT "RemoteFile_parentFileId_fkey" FOREIGN KEY ("parentFileId") REFERENCES "RemoteFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteChunk" ADD CONSTRAINT "RemoteChunk_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RemoteFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteEntry" ADD CONSTRAINT "RemoteEntry_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "RemoteFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Substring search over transcripts (§4.9). Prisma's schema cannot express a
-- `gin_trgm_ops` index, so it lives only here. `text` is lower-cased at ingest,
-- so the query is `text LIKE '%' || lower($1) || '%'` and this index serves it.
CREATE INDEX "RemoteEntry_text_trgm_idx" ON "RemoteEntry" USING GIN ("text" gin_trgm_ops);
