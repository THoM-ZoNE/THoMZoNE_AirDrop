import "dotenv/config";
import { PublicKey } from "@solana/web3.js";
import { connection } from "../lib/solana.js";
import { config } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { swapSolToRewardToken } from "../services/swapService.js";

async function main() {
  if (!config.distributionWalletPublicKey) {
    throw new Error("Missing DISTRIBUTION_WALLET_PUBLIC_KEY in .env");
  }

  const distributionPubkey = new PublicKey(config.distributionWalletPublicKey);

  const balanceLamports = BigInt(
    await connection.getBalance(distributionPubkey, "confirmed")
  );

  console.log("Distribution wallet:", distributionPubkey.toBase58());
  console.log("Current SOL balance (raw):", balanceLamports.toString());

  if (balanceLamports <= 0n) {
    throw new Error("Distribution wallet has no SOL balance to swap.");
  }

  const swapAmountRaw =
    (balanceLamports * BigInt(config.distributionSwapBps)) / 10_000n;

  if (swapAmountRaw <= 0n) {
    throw new Error("Calculated swap amount is zero, nothing to do.");
  }

  console.log(
    `Swapping ${swapAmountRaw.toString()} raw lamports (${config.distributionSwapBps} bps of balance) to ${config.rewardSymbol}...`
  );

  const result = await swapSolToRewardToken(swapAmountRaw);

  console.log("\n=== SWAP RESULT ===");
  console.log(JSON.stringify(result, null, 2));

  const rewardEvent = await prisma.rewardEvent.create({
    data: {
      source: "manual",
      sourceTx: result.signature ?? null,
      grossPayoutRaw: BigInt(result.actualOutAmountRaw),
      status: "pending",
      notes: `Manual swap test for ${config.rewardSymbol}`,
      rewardMint: config.rewardTokenMint
    }
  });

  console.log("\n=== REWARD EVENT CREATED ===");
  console.log("RewardEvent ID:", rewardEvent.id);
  console.log("grossPayoutRaw:", rewardEvent.grossPayoutRaw.toString());
  console.log("status:", rewardEvent.status);

  console.log("\nUse this RewardEvent for snapshot/distribution.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nDone.");
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Manual swap test failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });