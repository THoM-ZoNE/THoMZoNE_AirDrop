import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getAllTokenHoldersByMint } from "../lib/solana.js";

const BPS = 10_000n;

type ScoredHolder = {
  owner: string;
  inTokenA: boolean;
  inTokenB: boolean;
  tokenARaw: bigint;
  tokenBRaw: bigint;
  weightedScore: bigint;
  bonusApplied: boolean;
  finalPayoutRaw: bigint;
};

function divBps(amount: bigint, bps: number) {
  return (amount * BigInt(bps)) / BPS;
}

function buildDistribution(
  holdersA: { owner: string; rawAmount: bigint; mint: string }[],
  holdersB: { owner: string; rawAmount: bigint; mint: string }[],
  grossRewardPayoutRaw: bigint
) {
  const excluded = new Set(config.excludedWallets);

  const holderMap = new Map<
    string,
    { tokenARaw: bigint; tokenBRaw: bigint; inTokenA: boolean; inTokenB: boolean }
  >();

  for (const row of holdersA) {
    if (excluded.has(row.owner) || row.rawAmount < config.minHolderAmountRaw) continue;
    const cur = holderMap.get(row.owner) ?? { tokenARaw: 0n, tokenBRaw: 0n, inTokenA: false, inTokenB: false };
    cur.tokenARaw += row.rawAmount;
    cur.inTokenA = true;
    holderMap.set(row.owner, cur);
  }

  for (const row of holdersB) {
    if (excluded.has(row.owner) || row.rawAmount < config.minHolderAmountRaw) continue;
    const cur = holderMap.get(row.owner) ?? { tokenARaw: 0n, tokenBRaw: 0n, inTokenA: false, inTokenB: false };
    cur.tokenBRaw += row.rawAmount;
    cur.inTokenB = true;
    holderMap.set(row.owner, cur);
  }

  if (holderMap.size === 0) {
    throw new Error("No eligible holders found.");
  }

  const reservedSafetyPayoutRaw = divBps(grossRewardPayoutRaw, config.safetyBufferBps);
  const holderPoolPayoutRaw = grossRewardPayoutRaw - reservedSafetyPayoutRaw;

  if (holderPoolPayoutRaw <= 0n) {
    throw new Error("Reward is too small after the safety reserve.");
  }

  const scored: ScoredHolder[] = [];
  for (const [owner, data] of holderMap.entries()) {
  const bonusApplied = data.inTokenA && data.inTokenB;

  const weightedScore = bonusApplied
    ? data.tokenARaw * 2n
    : data.inTokenA
      ? data.tokenARaw
      : data.tokenBRaw;

  scored.push({
    owner,
    inTokenA: data.inTokenA,
    inTokenB: data.inTokenB,
    tokenARaw: data.tokenARaw,
    tokenBRaw: data.tokenBRaw,
    weightedScore,
    bonusApplied,
    finalPayoutRaw: 0n,
  });
}

  const totalWeightedScore = scored.reduce((sum, h) => sum + h.weightedScore, 0n);

  if (totalWeightedScore <= 0n) {
    throw new Error("Total weighted score is zero.");
  }

  const merged: ScoredHolder[] = scored
    .map((h) => ({
      ...h,
      finalPayoutRaw: (holderPoolPayoutRaw * h.weightedScore) / totalWeightedScore,
    }))
    .filter((h) => h.finalPayoutRaw > 0n);

  const totalHolderPayoutRaw = merged.reduce((sum, h) => sum + h.finalPayoutRaw, 0n);
  const totalRequired = reservedSafetyPayoutRaw + totalHolderPayoutRaw;

  if (totalRequired > grossRewardPayoutRaw) {
    throw new Error(
      `Reward cannot cover holder payouts and reserves. ` +
        `Missing ${(totalRequired - grossRewardPayoutRaw).toString()} raw units.`
    );
  }

  return { reservedSafetyPayoutRaw, holderPoolPayoutRaw, holders: merged };
}

export async function createSnapshot(
  grossRewardPayoutRaw: bigint,
  sourceRewardTx?: string
) {
  const [holdersA, holdersB] = await Promise.all([
    getAllTokenHoldersByMint(config.holderTokenAMint),
    getAllTokenHoldersByMint(config.holderTokenBMint),
  ]);

  const result = buildDistribution(holdersA, holdersB, grossRewardPayoutRaw);

  return prisma.snapshot.create({
    data: {
      sourceRewardTx,
      grossRewardPayoutRaw,
      rewardMint: config.rewardTokenMint,
      rewardSymbol: config.rewardSymbol,
      reservedSafetyPayoutRaw: result.reservedSafetyPayoutRaw,
      buybackPayoutRaw: 0n,
      holderPoolPayoutRaw: result.holderPoolPayoutRaw,
      holderTokenAMint: config.holderTokenAMint,
      holderTokenBMint: config.holderTokenBMint,
      holders: {
        create: result.holders.map((h) => ({
          owner: h.owner,
          inTokenA: h.inTokenA,
          inTokenB: h.inTokenB,
          tokenARaw: h.tokenARaw,
          tokenBRaw: h.tokenBRaw,
          bonusApplied: h.bonusApplied,
          finalPayoutRaw: h.finalPayoutRaw,
        })),
      },
    },
    include: { holders: true },
  });
}