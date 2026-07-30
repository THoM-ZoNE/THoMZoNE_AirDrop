/*
  Warnings:

  - You are about to drop the column `payoutMint` on the `RewardEvent` table. All the data in the column will be lost.
  - You are about to drop the column `payoutMint` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `payoutSymbol` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `tokenAMint` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `tokenAPoolPayoutRaw` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `tokenBMint` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `tokenBPoolPayoutRaw` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `basePayoutRaw` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `bonusApplied` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `bonusPayoutRaw` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `inTokenA` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `inTokenB` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `tokenARaw` on the `SnapshotHolder` table. All the data in the column will be lost.
  - You are about to drop the column `tokenBRaw` on the `SnapshotHolder` table. All the data in the column will be lost.
  - Added the required column `rewardMint` to the `RewardEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `holderPoolPayoutRaw` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `holderTokenMint` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rewardMint` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rewardSymbol` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `holderTokenRaw` to the `SnapshotHolder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RewardEvent" DROP COLUMN "payoutMint",
ADD COLUMN     "rewardMint" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Snapshot" DROP COLUMN "payoutMint",
DROP COLUMN "payoutSymbol",
DROP COLUMN "tokenAMint",
DROP COLUMN "tokenAPoolPayoutRaw",
DROP COLUMN "tokenBMint",
DROP COLUMN "tokenBPoolPayoutRaw",
ADD COLUMN     "holderPoolPayoutRaw" BIGINT NOT NULL,
ADD COLUMN     "holderTokenMint" TEXT NOT NULL,
ADD COLUMN     "rewardMint" TEXT NOT NULL,
ADD COLUMN     "rewardSymbol" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SnapshotHolder" DROP COLUMN "basePayoutRaw",
DROP COLUMN "bonusApplied",
DROP COLUMN "bonusPayoutRaw",
DROP COLUMN "inTokenA",
DROP COLUMN "inTokenB",
DROP COLUMN "tokenARaw",
DROP COLUMN "tokenBRaw",
ADD COLUMN     "holderTokenRaw" BIGINT NOT NULL;
