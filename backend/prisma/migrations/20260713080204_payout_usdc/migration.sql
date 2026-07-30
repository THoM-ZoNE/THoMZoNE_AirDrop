-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRewardTx" TEXT,
    "grossRewardPayoutRaw" BIGINT NOT NULL,
    "payoutMint" TEXT NOT NULL,
    "payoutSymbol" TEXT NOT NULL,
    "reservedSafetyPayoutRaw" BIGINT NOT NULL,
    "buybackPayoutRaw" BIGINT NOT NULL,
    "tokenAPoolPayoutRaw" BIGINT NOT NULL,
    "tokenBPoolPayoutRaw" BIGINT NOT NULL,
    "tokenAMint" TEXT NOT NULL,
    "tokenBMint" TEXT NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotHolder" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "inTokenA" BOOLEAN NOT NULL,
    "inTokenB" BOOLEAN NOT NULL,
    "tokenARaw" TEXT NOT NULL,
    "tokenBRaw" TEXT NOT NULL,
    "basePayoutRaw" BIGINT NOT NULL,
    "bonusPayoutRaw" BIGINT NOT NULL,
    "finalPayoutRaw" BIGINT NOT NULL,
    "bonusApplied" BOOLEAN NOT NULL,

    CONSTRAINT "SnapshotHolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "payoutRawSent" BIGINT NOT NULL,
    "txSignature" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "sourceTx" TEXT,
    "grossPayoutRaw" BIGINT NOT NULL,
    "payoutMint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "snapshotId" TEXT,
    "distributedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "key" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SnapshotHolder_snapshotId_idx" ON "SnapshotHolder"("snapshotId");

-- CreateIndex
CREATE INDEX "SnapshotHolder_owner_idx" ON "SnapshotHolder"("owner");

-- CreateIndex
CREATE INDEX "Distribution_snapshotId_idx" ON "Distribution"("snapshotId");

-- CreateIndex
CREATE INDEX "Distribution_owner_idx" ON "Distribution"("owner");

-- CreateIndex
CREATE INDEX "Distribution_status_idx" ON "Distribution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEvent_sourceTx_key" ON "RewardEvent"("sourceTx");

-- AddForeignKey
ALTER TABLE "SnapshotHolder" ADD CONSTRAINT "SnapshotHolder_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
