import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { createSnapshot } from "./snapshotService.js";
import { distributeSnapshot } from "./distributionService.js";

export async function registerClaimedRewardEvent(input: {
  sourceTx: string;
  grossPayoutRaw: bigint;
  notes?: string;
}) {
  return prisma.rewardEvent.create({
    data: {
      source: "pumpfun_claim",
      sourceTx: input.sourceTx,
      grossPayoutRaw: input.grossPayoutRaw,
      rewardMint: config.rewardTokenMint,
      status: "pending",
      notes: input.notes ?? "Automatic creator fee claim"
    }
  });
}

export async function registerRewardEvent(input: {
  source: string;
  grossPayoutRaw: bigint;
  sourceTx?: string;
  notes?: string;
}) {
  if (input.grossPayoutRaw < config.minRewardPayoutRaw) {
    throw new Error(
      `Reward is below MIN_REWARD_PAYOUT_RAW for ${config.rewardSymbol}.`
    );
  }

  return prisma.rewardEvent.create({
    data: {
      source: input.source,
      sourceTx: input.sourceTx ?? null,
      grossPayoutRaw: input.grossPayoutRaw,
      rewardMint: config.rewardTokenMint,
      status: "pending",
      notes: input.notes ?? null
    }
  });
}

export async function processPendingRewardEvent() {
  const reward = await prisma.rewardEvent.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" }
  });

  if (!reward) {
    return {
      ok: true,
      message: "No pending reward event."
    };
  }

  if (reward.rewardMint !== config.rewardTokenMint) {
    throw new Error(
      `Reward mint (${reward.rewardMint}) does not match REWARD_TOKEN_MINT.`
    );
  }

  const snapshot = await createSnapshot(
    reward.grossPayoutRaw,
    reward.sourceTx ?? undefined
  );

  await prisma.rewardEvent.update({
    where: { id: reward.id },
    data: {
      status: config.autoDistribute
        ? "distributing"
        : "awaiting_distribution",
      snapshotId: snapshot.id
    }
  });

  if (config.autoDistribute) {
    await distributeSnapshot(snapshot.id);

    await prisma.rewardEvent.update({
      where: { id: reward.id },
      data: {
        status: "distributed",
        distributedAt: new Date()
      }
    });
  }

  return {
    ok: true,
    rewardEventId: reward.id,
    snapshotId: snapshot.id
  };
}