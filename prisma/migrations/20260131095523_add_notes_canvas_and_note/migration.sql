-- CreateTable
CREATE TABLE "NotesCanvas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Notes',
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotesCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "canvasId" UUID NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FFD700',
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotesCanvas_authorId_idx" ON "NotesCanvas"("authorId");

-- CreateIndex
CREATE INDEX "Note_canvasId_idx" ON "Note"("canvasId");

-- CreateIndex
CREATE INDEX "Note_canvasId_zIndex_idx" ON "Note"("canvasId", "zIndex");

-- AddForeignKey
ALTER TABLE "NotesCanvas" ADD CONSTRAINT "NotesCanvas_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "NotesCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
