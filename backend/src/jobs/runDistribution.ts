import { distributeSnapshot } from "../services/distributionService.js";

const snapshotId = process.argv[2];

if (!snapshotId) {
  throw new Error("Usage: npm run distribute -- SNAPSHOT_ID");
}

console.log("[runDistribution] started");
console.log("[runDistribution] input", { snapshotId });

try {
  const result = await distributeSnapshot(snapshotId);

  console.log("[runDistribution] result", result);
  console.log("[runDistribution] finished");
} catch (error) {
  console.error("[runDistribution] failed", error);
  process.exit(1);
}