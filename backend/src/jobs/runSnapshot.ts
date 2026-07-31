import { createSnapshot } from "../services/snapshotService.js";

const rewardRaw = BigInt(process.argv[2] || "1000000");
const rewardTx = process.argv[3];

console.log("[runSnapshot] started");
console.log("[runSnapshot] input", {
  rewardRaw: rewardRaw.toString(),
  rewardTx: rewardTx ?? null
});

try {
  const snapshot = await createSnapshot(rewardRaw, rewardTx);

  console.log("[runSnapshot] snapshot created", {
    snapshotId: snapshot.id,
    holders: snapshot.holders.length,
    buybackPayoutRaw: snapshot.buybackPayoutRaw.toString(),
    holderPoolPayoutRaw: snapshot.holderPoolPayoutRaw.toString(),
    reservedSafetyPayoutRaw: snapshot.reservedSafetyPayoutRaw.toString(),
    rewardMint: snapshot.rewardMint,
    rewardSymbol: snapshot.rewardSymbol,
    holderTokenAMint: snapshot.holderTokenAMint,
    holderTokenBMint: snapshot.holderTokenBMint,
    holderPreview: snapshot.holders.slice(0, 5).map((holder) => ({
      owner: holder.owner,
      inTokenA: holder.inTokenA,
      inTokenB: holder.inTokenB,
      bonusApplied: holder.bonusApplied,
      tokenARaw: holder.tokenARaw.toString(),
      tokenBRaw: holder.tokenBRaw.toString(),
      finalPayoutRaw: holder.finalPayoutRaw.toString()
    }))
  });

  console.log("[runSnapshot] finished");
} catch (error) {
  console.error("[runSnapshot] failed", error);
  process.exit(1);
}