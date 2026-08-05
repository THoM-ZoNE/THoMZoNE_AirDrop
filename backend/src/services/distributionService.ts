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

/** Extracts a human-readable message from ANY thrown value, including Solana errors */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Solana SendTransactionError: real info is in .logs or .message
    const msg = error.message?.trim();
    // Check for logs array (SendTransactionError)
    const logs = (error as any).logs;
    if (logs && Array.isArray(logs) && logs.length > 0) {
      const logSummary = logs.slice(0, 5).join(" | ");
      return msg ? `${msg} | LOGS: ${logSummary}` : `LOGS: ${logSummary}`;
    }
    // Check for cause
    const cause = (error as any).cause;
    if (cause) {
      return msg
        ? `${msg} | CAUSE: ${String(cause)}`
        : `CAUSE: ${String(cause)}`;
    }
    return msg || `Error [${error.constructor?.name ?? "Unknown"}] (no message)`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Sleep with optional jitter */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Send one batch with retry on 429 / rate-limit errors */
async function sendBatchWithRetry(
  items: { owner: string; amountRaw: bigint }[],
  maxRetries = 3,
  baseDelayMs = 3000
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[distributionService] Retry ${attempt}/${maxRetries} after ${backoff}ms...`
      );
      await sleep(backoff);
    }
    try {
      return await sendRewardTokenBatch(items);
    } catch (err) {
      lastError = err;
      const msg = extractErrorMessage(err).toLowerCase();
      const is429 =
        msg.includes("429") ||
        msg.includes("too many requests") ||
        msg.includes("rate limit");
      if (!is429) throw err; // non-retryable error → bubble up immediately
      console.warn(`[distributionService] 429 rate-limit on attempt ${attempt}: ${msg}`);
    }
  }
  throw lastError;
}

export async function distributeSnapshot(snapshotId: string) {
  const snapshot = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
    include: { holders: true },
  });

  if (!snapshot) throw new Error("Snapshot not found");

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
    await sleep(1500); // inter-batch delay to respect RPC rate limits

    const eligibleItems = group
      .filter((holder) => holder.finalPayoutRaw > 0n)
      .map((holder) => ({
        owner: holder.owner,
        amountRaw: holder.finalPayoutRaw,
      }));

    if (eligibleItems.length === 0) continue;

    try {
      const transaction = await sendBatchWithRetry(eligibleItems);

      await prisma.distribution.createMany({
        data: group
          .filter((holder) => holder.finalPayoutRaw > 0n)
          .map((holder) => ({
            snapshotId: snapshot.id,
            owner: holder.owner,
            recipientType: "holder",
            payoutRawSent: holder.finalPayoutRaw,
            txSignature: transaction.signature,
            status: "sent",
          })),
      });

      results.push({
        type: "holders",
        signature: transaction.signature,
        count: eligibleItems.length,
      });

      console.log(
        `[distributionService] Batch sent: ${eligibleItems.length} holders, tx=${transaction.signature}`
      );
    } catch (error) {
      const message = extractErrorMessage(error);

      console.error(
        `[distributionService] Batch FAILED (${eligibleItems.length} holders): ${message}`
      );

      await prisma.distribution.createMany({
        data: group
          .filter((holder) => holder.finalPayoutRaw > 0n)
          .map((holder) => ({
            snapshotId: snapshot.id,
            owner: holder.owner,
            recipientType: "holder",
            payoutRawSent: holder.finalPayoutRaw,
            status: "failed",
            errorMessage: message,
          })),
      });

      results.push({
        type: "holders",
        error: message,
        count: eligibleItems.length,
      });
    }
  }

  return results;
}

/**
 * Retry all failed Distribution rows for a given snapshotId.
 * Skips owners that already have a "sent" row to avoid double-pays.
 */
export async function retryFailedDistributions(snapshotId: string) {
  // Find all owners that already succeeded
  const sentOwners = await prisma.distribution.findMany({
    where: { snapshotId, status: "sent" },
    select: { owner: true },
  });
  const sentSet = new Set(sentOwners.map((r) => r.owner));

  // Collect unique failed owners (exclude already sent)
  const failedRows = await prisma.distribution.findMany({
    where: { snapshotId, status: "failed" },
    orderBy: { createdAt: "asc" },
  });

  const uniqueFailed = failedRows.filter(
    (row) => !sentSet.has(row.owner)
  );

  if (uniqueFailed.length === 0) {
    return { retried: 0, message: "No unresolved failed distributions" };
  }

  // Deduplicate by owner (keep latest payoutRawSent)
  const ownerMap = new Map<string, bigint>();
  for (const row of uniqueFailed) {
    ownerMap.set(row.owner, row.payoutRawSent);
  }

  const retryItems = Array.from(ownerMap.entries()).map(
    ([owner, amountRaw]) => ({ owner, amountRaw })
  );

  const groups = chunk(retryItems, config.maxRecipientsPerTx);
  let totalSent = 0;
  let totalFailed = 0;

  for (const group of groups) {
    await sleep(2000);
    try {
      const transaction = await sendBatchWithRetry(group);

      // Mark original failed rows as superseded + create new sent rows
      await prisma.$transaction([
        prisma.distribution.updateMany({
          where: {
            snapshotId,
            status: "failed",
            owner: { in: group.map((g) => g.owner) },
          },
          data: { status: "retried", errorMessage: "superseded by retry" },
        }),
        prisma.distribution.createMany({
          data: group.map((item) => ({
            snapshotId,
            owner: item.owner,
            recipientType: "holder",
            payoutRawSent: item.amountRaw,
            txSignature: transaction.signature,
            status: "sent",
          })),
        }),
      ]);

      totalSent += group.length;
      console.log(
        `[retryFailed] Sent ${group.length} holders, tx=${transaction.signature}`
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      console.error(`[retryFailed] Batch failed: ${message}`);

      // Update errorMessage on existing failed rows with latest error
      await prisma.distribution.updateMany({
        where: {
          snapshotId,
          status: "failed",
          owner: { in: group.map((g) => g.owner) },
        },
        data: { errorMessage: `RETRY_FAILED: ${message}` },
      });

      totalFailed += group.length;
    }
  }

  return {
    retried: totalSent,
    failed: totalFailed,
    message: `${totalSent} sent, ${totalFailed} still failed`,
  };
}