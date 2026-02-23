/*
  Warnings:

  - You are about to drop the `DocumentCoauthers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DocumentCoauthers" DROP CONSTRAINT "DocumentCoauthers_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentCoauthers" DROP CONSTRAINT "DocumentCoauthers_userEmail_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "DocumentCoauthers";

-- CreateTable
CREATE TABLE "DocumentCoauthors" (
    "documentId" UUID NOT NULL,
    "userEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentCoauthors_pkey" PRIMARY KEY ("documentId","userEmail")
);

-- AddForeignKey
ALTER TABLE "DocumentCoauthors" ADD CONSTRAINT "DocumentCoauthors_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCoauthors" ADD CONSTRAINT "DocumentCoauthors_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "User"("email") ON DELETE CASCADE ON UPDATE CASCADE;
