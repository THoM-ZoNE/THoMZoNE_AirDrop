import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { sendRewardTokenBatch } from "../lib/solana.js";

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
}

export async function distributeSnapshot(snapshotId: string) {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { holders: true }
  });

  if (!snapshot) {
    throw new Error("Snapshot not found");
  }

  if (snapshot.rewardMint !== config.rewardTokenMint) {
    throw new Error(
      `Snapshot reward mint (${snapshot.rewardMint}) does not match REWARD_TOKEN_MINT.`
    );
  }

  const groups = chunk(snapshot.holders, config.maxRecipientsPerTx);

  const results: Array<{
    type: "holders";
    signature?: string;
    error?: string;
    count: number;
  }> = [];

  for (const group of groups) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const transaction = await sendRewardTokenBatch(
        group
          .filter((holder) => holder.finalPayoutRaw > 0n)
          .map((holder) => ({
            owner: holder.owner,
            amountRaw: holder.finalPayoutRaw
          }))
      );

      await prisma.distribution.createMany({
        data: group
          .filter((holder) => holder.finalPayoutRaw > 0n)
          .map((holder) => ({
            snapshotId: snapshot.id,
            owner: holder.owner,
            recipientType: "holder",
            payoutRawSent: holder.finalPayoutRaw,
            txSignature: transaction.signature,
            status: "sent"
          }))
      });

      results.push({
        type: "holders",
        signature: transaction.signature,
        count: group.filter((holder) => holder.finalPayoutRaw > 0n).length
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown holder-distribution error";

      await prisma.distribution.createMany({
        data: group
          .filter((holder) => holder.finalPayoutRaw > 0n)
          .map((holder) => ({
            snapshotId: snapshot.id,
            owner: holder.owner,
            recipientType: "holder",
            payoutRawSent: holder.finalPayoutRaw,
            status: "failed",
            errorMessage: message
          }))
      });

      results.push({
        type: "holders",
        error: message,
        count: group.filter((holder) => holder.finalPayoutRaw > 0n).length
      });
    }
  }

  return results;
}