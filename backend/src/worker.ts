import "dotenv/config";
import cron from "node-cron";
import { config } from "./lib/config.js";
import { processPendingRewardEvent } from "./services/rewardService.js";
import { claimAndRegisterRewardIfAny } from "./services/claimOrchestrator.js";
import { acquireLock, releaseLock } from "./services/lockService.js";

async function runLockedJob(key: string, fn: () => Promise<void>) {
  const acquired = await acquireLock(key);

  if (!acquired) {
    console.log(`[${key}] already running, skipping.`);
    return;
  }

  try {
    await fn();
  } catch (err) {
    console.error(`[${key}] failed`, err);
  } finally {
    await releaseLock(key);
  }
}

console.log("claimEnabled:", config.claimEnabled);
console.log("claimCron:", config.claimCron);
console.log("cronEnabled:", config.cronEnabled);
console.log("cronSnapshot:", config.cronSnapshot);
console.log("cronDistribute:", config.cronDistribute);
console.log("HOLDER_TOKEN_A_MINT:", process.env.HOLDER_TOKEN_A_MINT);
console.log("HOLDER_TOKEN_B_MINT:", process.env.HOLDER_TOKEN_B_MINT);
console.log("DISTRIBUTION_WALLET_PUBLIC_KEY:", process.env.DISTRIBUTION_WALLET_PUBLIC_KEY);

if (config.claimEnabled) {
  cron.schedule(config.claimCron, async () => {
    console.log("[claim-job] tick", new Date().toISOString());

    await runLockedJob("claim-job", async () => {
      console.log("[claim-job] Starting...");
      const result = await claimAndRegisterRewardIfAny();
      console.log("[claim-job] Result:", result);
      console.log("[claim-job] Finished.");
    });
  });

  console.log("[claim-job] Cron registered.");
} else {
  console.log("[claim-job] Disabled.");
}

if (config.cronEnabled) {
  cron.schedule(config.cronSnapshot, async () => {
    console.log("[reward-pipeline-job] tick", new Date().toISOString());

    await runLockedJob("reward-pipeline-job", async () => {
      console.log("[reward-pipeline-job] Starting...");
      const result = await processPendingRewardEvent();
      console.log("[reward-pipeline-job] Result:", result);
      console.log("[reward-pipeline-job] Finished.");
    });
  });

  console.log("[reward-pipeline-job] Cron registered.");
  console.log("Cron worker started.");
} else {
  console.log("Cron disabled.");
}