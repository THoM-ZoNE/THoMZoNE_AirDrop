import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getAllTokenHoldersByMint } from "../lib/solana.js";

const BPS = 10_000n;

type MergedDistribution = {
  owner: string;
  holderTokenRaw: bigint;
  finalPayoutRaw: bigint;
};

function divBps(amount: bigint, bps: number) {
  return (amount * BigInt(bps)) / BPS;
}

function buildDistribution(
  holders: { owner: string; rawAmount: bigint; mint: string }[],
  grossRewardPayoutRaw: bigint
) {
  const excluded = new Set(config.excludedWallets);

  const eligible = holders.filter(
    (row) =>
      !excluded.has(row.owner) && row.rawAmount >= config.minHolderAmountRaw
  );

  if (eligible.length === 0) {
    throw new Error("No eligible holders found.");
  }

  const reservedSafetyPayoutRaw = divBps(
    grossRewardPayoutRaw,
    config.safetyBufferBps
  );

  const holderPoolPayoutRaw =
    grossRewardPayoutRaw - reservedSafetyPayoutRaw;

  if (holderPoolPayoutRaw <= 0n) {
    throw new Error("Reward is too small after the safety reserve.");
  }

  const totalHolderTokenRaw = eligible.reduce(
    (sum, row) => sum + row.rawAmount,
    0n
  );

  if (totalHolderTokenRaw <= 0n) {
    throw new Error("Total holder token amount is zero.");
  }

  const merged: MergedDistribution[] = eligible
    .map((row) => {
      const finalPayoutRaw =
        (holderPoolPayoutRaw * row.rawAmount) / totalHolderTokenRaw;

      return {
        owner: row.owner,
        holderTokenRaw: row.rawAmount,
        finalPayoutRaw
      };
    })
    .filter((row) => row.finalPayoutRaw > 0n);

  const totalHolderPayoutRaw = merged.reduce(
    (sum, item) => sum + item.finalPayoutRaw,
    0n
  );

  const totalRequired =
    reservedSafetyPayoutRaw + totalHolderPayoutRaw;

  if (totalRequired > grossRewardPayoutRaw) {
    throw new Error(
      `Reward cannot cover holder payouts and reserves. ` +
        `Missing ${(totalRequired - grossRewardPayoutRaw).toString()} raw units.`
    );
  }

  return {
    reservedSafetyPayoutRaw,
    buybackPayoutRaw: 0n,
    holderPoolPayoutRaw,
    holders: merged
  };
}

export async function createSnapshot(
  grossRewardPayoutRaw: bigint,
  sourceRewardTx?: string
) {
  const holders = await getAllTokenHoldersByMint(config.holderTokenMint);

  const result = buildDistribution(holders, grossRewardPayoutRaw);

  return prisma.snapshot.create({
    data: {
      sourceRewardTx,
      grossRewardPayoutRaw,

      rewardMint: config.rewardTokenMint,
      rewardSymbol: config.rewardSymbol,

      reservedSafetyPayoutRaw: result.reservedSafetyPayoutRaw,
      buybackPayoutRaw: 0n,
      holderPoolPayoutRaw: result.holderPoolPayoutRaw,

      holderTokenMint: config.holderTokenMint,

      holders: {
        create: result.holders.map((holder) => ({
          owner: holder.owner,
          holderTokenRaw: holder.holderTokenRaw,
          finalPayoutRaw: holder.finalPayoutRaw
        }))
      }
    },
    include: {
      holders: true
    }
  });
}