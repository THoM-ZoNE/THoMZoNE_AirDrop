/*
  Warnings:

  - Changed the type of `tokenARaw` on the `SnapshotHolder` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `tokenBRaw` on the `SnapshotHolder` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SnapshotHolder" DROP COLUMN "tokenARaw",
ADD COLUMN     "tokenARaw" BIGINT NOT NULL,
DROP COLUMN "tokenBRaw",
ADD COLUMN     "tokenBRaw" BIGINT NOT NULL;
