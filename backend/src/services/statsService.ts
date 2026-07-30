import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";

const REWARD_DECIMALS = 6;

function rawToTokenAmount(raw: bigint | number | null | undefined): number {
  const value = typeof raw === "bigint" ? raw : BigInt(raw ?? 0);
  return Number(value) / 10 ** REWARD_DECIMALS;
}

function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export async function getPublicStats() {
  const totalDistributedAgg = await prisma.distribution.aggregate({
    _sum: { payoutRawSent: true },
    where: { status: "sent" }
  });

  const totalRounds = await prisma.rewardEvent.count({
    where: { status: "distributed" }
  });

  const latestSnapshot = await prisma.snapshot.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      holders: {
        select: { owner: true }
      }
    }
  });

  const totalDistributedRaw = totalDistributedAgg._sum.payoutRawSent ?? 0n;
  const totalDistributed = rawToTokenAmount(totalDistributedRaw);
  const totalHolders = latestSnapshot?.holders.length ?? 0;
  const avgRewardPerHolder =
    totalHolders > 0 ? totalDistributed / totalHolders : 0;

  return {
    totalHolders,
    totalRounds,
    rewardSymbol: config.rewardSymbol,
    totalRewardDistributed: totalDistributed,
    avgRewardPerHolder
  };
}

export async function getRecentVaultTransactions(limit = 20) {
  const rows = await prisma.distribution.findMany({
    where: {
      status: "sent",
      txSignature: { not: null }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return rows.map((row) => ({
    time: row.createdAt.toISOString().replace("T", " ").slice(0, 16),
    wallet: shortWallet(row.owner),
    amount: rawToTokenAmount(row.payoutRawSent),
    symbol: config.rewardSymbol,
    tx: row.txSignature
  }));
}